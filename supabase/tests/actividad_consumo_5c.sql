-- Campo Digital v2 — Pruebas de la etapa 5c del tablero de Indicadores: actividad Consumo (faena propia)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261111000300_actividad_consumo).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS CONSUMO 5C: N OK, ...", que deshace todo.
--      El resultado esperado es "16 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Qué prueba: registrar, editar y eliminar un consumo (permisos, saldo, peso opcional), cómo se ve en v_actividades
-- y en los movimientos del tablero de stock, que no cuenta como mortandad y que corta el tramo de pesadas.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia,
-- X = operador de otro campo.
--
-- Datos (fechas fijas): L-Nov, 100 novillos desde el 1/7/2026. Pesadas: 1/7 (30.000 kg, 300,0), 1/9 (32.000 kg,
-- 320,0) y 1/10 (98 novillos, 33.320 kg, 340,0). Consumo el 15/9 de 2 novillos (900 kg) y el 5/10 de 1 (sin peso).
--   * kg producidos en 2026/27: 1/7 → 1/9 vale +20 × 100 = 2.000 kg; 1/9 → 1/10 se descarta (consumo).
--   * Movimientos del período: alta inicial +100, consumo −3. Mortandad: 0.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Preparación (como administrador de la base)
-- ════════════════════════════════════════════════════════════════════════════

select set_config('test.rep', '', false);
select set_config('test.u_admin',    'a0000000-0000-4000-8000-00000000000a', false);
select set_config('test.u_operador', 'b0000000-0000-4000-8000-00000000000b', false);
select set_config('test.u_consulta', 'c0000000-0000-4000-8000-00000000000c', false);
select set_config('test.u_ajeno',    'd0000000-0000-4000-8000-00000000000d', false);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', current_setting('test.' || u.clave)::uuid,
       'authenticated', 'authenticated', u.email, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
from (values
  ('u_admin',    'admin@campodigital.test'),
  ('u_operador', 'operador@campodigital.test'),
  ('u_consulta', 'consulta@campodigital.test'),
  ('u_ajeno',    'ajeno@campodigital.test')
) as u(clave, email);

insert into public.perfiles (id, email, nombre, es_admin)
values
  (current_setting('test.u_admin')::uuid,    'admin@campodigital.test',    'Ana',    true),
  (current_setting('test.u_operador')::uuid, 'operador@campodigital.test', 'Oscar',  false),
  (current_setting('test.u_consulta')::uuid, 'consulta@campodigital.test', 'Quena',  false),
  (current_setting('test.u_ajeno')::uuid,    'ajeno@campodigital.test',    'Xavier', false)
on conflict (id) do update set es_admin = excluded.es_admin, nombre = excluded.nombre;

-- Esquema auxiliar de pruebas (desaparece con el rollback final)
create schema pruebas;
grant usage on schema pruebas to authenticated, anon;

-- Registro de resultados. Cuatro tipos de línea:
--   OK, FALLA, OMITIDA (depende de una preparación que falló) y PREP (preparación fallida: la causa raíz).
create function pruebas.linea(p_tipo text, p text) returns void language plpgsql as $$
begin
  perform set_config('test.rep', current_setting('test.rep') || E'\n' || rpad(p_tipo, 8) || p, false);
end $$;

create function pruebas.ok(p text)      returns void language sql as $$ select pruebas.linea('OK', p) $$;
create function pruebas.falla(p text)   returns void language sql as $$ select pruebas.linea('FALLA', p) $$;
create function pruebas.omitida(p text) returns void language sql as $$ select pruebas.linea('OMITIDA', p) $$;

-- Id guardado durante la prueba. Si la preparación que lo crea falló (o nunca corrió),
-- corta con el código propio ZZ001, que las pruebas registran como OMITIDA y no como FALLA.
create function pruebas.id(p_clave text) returns uuid language plpgsql stable as $$
declare
  v text := current_setting('test.' || p_clave, true);
begin
  if v is null or v = '' or v = 'FALLIDA' then
    raise exception '%', p_clave using errcode = 'ZZ001';
  end if;
  return v::uuid;
end $$;

-- Fecha relativa a hoy
create function pruebas.d(p_dias int) returns date language sql stable as $$
  select public.fecha_hoy() - p_dias
$$;

create function pruebas.como(p_clave text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.' || p_clave), 'role', 'authenticated')::text, true);
end $$;

-- Composición jsonb de una categoría: [{"categoria_id": ..., "cabezas": n}]
create function pruebas.comp(p_cat text, p_cabezas int) returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas))
$$;

-- Stock actual de una categoría en un lote (0 si no tiene)
create function pruebas.stock(p_lote text, p_cat text) returns int language sql stable as $$
  select coalesce((select cabezas from public.v_stock_lote
                   where lote_id = pruebas.id(p_lote) and categoria_id = pruebas.id(p_cat)), 0)
$$;

create function pruebas.espera_error(p_nombre text, p_sql text, p_sqlstate text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = 'ZZ001' then
      perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
    elsif sqlstate = p_sqlstate then
      perform pruebas.ok(p_nombre || '  [' || sqlstate || ']');
    else
      perform pruebas.falla(p_nombre || ': esperaba ' || p_sqlstate || ', dio ' || sqlstate || ' ' || sqlerrm);
    end if;
    return;
  end;
  perform pruebas.falla(p_nombre || ': NO dio error (esperaba ' || p_sqlstate || ')');
end $$;

create function pruebas.espera_ok(p_nombre text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  perform pruebas.ok(p_nombre);
exception when others then
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
  end if;
end $$;

create function pruebas.espera_filas(p_nombre text, p_sql text, p_filas int) returns void
language plpgsql as $$
declare
  v_n int;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  if v_n = p_filas then
    perform pruebas.ok(p_nombre || '  [' || v_n || ' filas]');
  else
    perform pruebas.falla(p_nombre || ': esperaba ' || p_filas || ' filas, afectó ' || v_n);
  end if;
exception when others then
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
  end if;
end $$;

create function pruebas.espera_valor(p_nombre text, p_sql text, p_esperado text) returns void
language plpgsql as $$
declare
  v text;
begin
  execute p_sql into v;
  if v is not distinct from p_esperado then
    perform pruebas.ok(p_nombre || '  [' || coalesce(v, 'null') || ']');
  else
    perform pruebas.falla(p_nombre || ': esperaba ' || coalesce(p_esperado, 'null') || ', dio ' || coalesce(v, 'null'));
  end if;
exception when others then
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
  end if;
end $$;

-- Preparación que guarda un id en test.<clave>. Si falla, la clave queda FALLIDA:
--   * si falló por su propia cuenta, es una causa raíz (PREP);
--   * si falló porque dependía de otra preparación fallida, se registra como OMITIDA.
create function pruebas.guardar(p_clave text, p_sql text) returns void
language plpgsql as $$
declare
  v text;
begin
  execute p_sql into v;
  if v is null then
    raise exception 'la sentencia no devolvió ningún id' using errcode = 'P0002';
  end if;
  perform set_config('test.' || p_clave, v, false);
exception when others then
  perform set_config('test.' || p_clave, 'FALLIDA', false);
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida('preparación ' || p_clave || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.linea('PREP', p_clave || ': ' || sqlstate || ' ' || sqlerrm);
  end if;
end $$;

-- Preparación sin resultado (por ejemplo, un ajuste o una asignación de rol). Misma lógica:
-- si falla, deja FALLIDA la clave indicada, para que lo que dependa de ella quede omitido.
create function pruebas.preparar(p_clave text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
exception when others then
  perform set_config('test.' || p_clave, 'FALLIDA', false);
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida('preparación ' || p_clave || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.linea('PREP', p_clave || ': ' || sqlstate || ' ' || sqlerrm);
  end if;
end $$;



-- Fecha fija (las temporadas no dependen del día en que se corre la prueba)
create function pruebas.f(p text) returns date language sql immutable as $$ select p::date $$;
create function pruebas.lin(p_cat text, p_cabezas int) returns jsonb language sql stable as $$
  select jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas)
$$;
-- Fila de indicadores de los vacunos de Santa Remigia para una temporada (null = sin servicio registrado)
create function pruebas.ind(p_temporada int) returns public.v_indicadores_reproductivos language sql stable as $$
  select * from public.v_indicadores_reproductivos
  where establecimiento_id = pruebas.id('est_a') and especie_id = pruebas.id('vacunos') and temporada is not distinct from p_temporada
$$;
-- Elimina una actividad como administrador (desde 20261104000100 solo él elimina) y vuelve al
-- usuario que estaba. Si falla, el error deshace también el cambio de usuario.
create function pruebas.eliminar(p_actividad uuid) returns void language plpgsql as $$
declare
  v_antes text := current_setting('request.jwt.claims', true);
begin
  perform pruebas.como('u_admin');
  perform public.eliminar_actividad(p_actividad);
  perform set_config('request.jwt.claims', v_antes, true);
end $$;


-- Línea de pesada: {categoria_id, cabezas, peso_vivo_total_kg}
create function pruebas.pl(p_cat text, p_cabezas int, p_kg numeric) returns jsonb language sql stable as $$
  select jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas, 'peso_vivo_total_kg', p_kg)
$$;
create function pruebas.pesar(p_lote text, p_fecha text, p_cabezas int, p_kg numeric) returns uuid language sql as $$
  select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id(p_lote), p_fecha => p_fecha::date,
                                 p_lineas => jsonb_build_array(pruebas.pl('novillos', p_cabezas, p_kg)))
$$;
-- Lectura de tablero_pesadas en el ejercicio 2025/26: "periodo:etiqueta:valor:numerador:denominador" separados por "|"
-- (sin las partes vacías; los números sin ceros de más). p_sin_ceros: saca las filas en 0.
create function pruebas.tpes(p_medida text, p_abrir text, p_tiempo text, p_filtros jsonb default '{}', p_opciones jsonb default '{}',
                             p_sin_ceros boolean default false) returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_pesadas(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, '2025-07-01', '2026-06-30', p_filtros, p_opciones)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
  where not (p_sin_ceros and coalesce(r.valor, 0) = 0)
$$;

-- Pesada con varias líneas: p_lineas = jsonb_build_array(pruebas.pl(...), ...)
create function pruebas.pesarl(p_lote text, p_fecha text, p_lineas jsonb) returns uuid language sql as $$
  select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id(p_lote), p_fecha => p_fecha::date, p_lineas => p_lineas)
$$;
-- Lo mismo que tpes, en el ejercicio 2026/27
create function pruebas.tpes27(p_medida text, p_abrir text) returns text language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_pesadas(pruebas.id('est_a'), p_medida, p_abrir, 'total', '2026-07-01', '2027-06-30')
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- Consumo de un lote: [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
create function pruebas.cl(p_cabezas int, p_kg jsonb default null) returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('categoria_id', pruebas.id('novillos'), 'cabezas', p_cabezas,
                                                                'peso_vivo_total_kg', p_kg)))
$$;
-- "tipo|cabezas|peso total|promedio" de una actividad en v_actividades
create function pruebas.va(p_actividad text) returns text language sql stable as $$
  select concat_ws('|', a.tipo, a.cabezas, coalesce(trim_scale(a.peso_vivo_total_kg)::text, 'sin peso'),
                   coalesce(trim_scale(a.peso_promedio_kg)::text, 'sin promedio'))
  from public.v_actividades a where a.id = pruebas.id(p_actividad)
$$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Datos
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('vacunos',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('novillos', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);

select pruebas.guardar('LN', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Nov', pruebas.f('2026-07-01'), pruebas.comp('novillos', 100)) $q$);
select pruebas.guardar('p1', $q$ select pruebas.pesar('LN', '2026-07-01', 100, 30000) $q$);
select pruebas.guardar('p2', $q$ select pruebas.pesar('LN', '2026-09-01', 100, 32000) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Registrar
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');
select pruebas.guardar('c1', $q$ select public.registrar_consumo(gen_random_uuid(), pruebas.id('LN'), pruebas.f('2026-09-15'), pruebas.cl(2, '900'::jsonb)) $q$);
select pruebas.guardar('p3', $q$ select pruebas.pesar('LN', '2026-10-01', 98, 33320) $q$);
select pruebas.guardar('c2', $q$ select public.registrar_consumo(gen_random_uuid(), pruebas.id('LN'), pruebas.f('2026-10-05'), pruebas.cl(1)) $q$);

select pruebas.espera_valor('K01 El operador registra el consumo: 2 novillos, 900 kg (450 por cabeza)',
  $q$ select pruebas.va('c1') $q$, 'consumo|2|900|450');
select pruebas.espera_valor('K02 Deja un evento de consumo (−2)',
  $q$ select string_agg(e.tipo || ' ' || e.cabezas, ',') from public.lote_eventos e where e.actividad_id = pruebas.id('c1') $q$, 'consumo -2');
select pruebas.espera_valor('K03 Sin peso también (es opcional): 1 novillo, sin peso ni promedio; el lote queda con 97',
  $q$ select pruebas.va('c2') || ' / ' || pruebas.stock('LN', 'novillos') $q$, 'consumo|1|sin peso|sin promedio / 97');
select pruebas.espera_valor('K04 Mismo id dos veces: no se duplica (idempotente)',
  $q$ select public.registrar_consumo(pruebas.id('c2'), pruebas.id('LN'), pruebas.f('2026-10-05'), pruebas.cl(1))::text
      || ' / ' || pruebas.stock('LN', 'novillos') = pruebas.id('c2')::text || ' / 97' $q$, 'true');
select pruebas.espera_error('K05 Más cabezas que las que hay: no',
  $q$ select public.registrar_consumo(gen_random_uuid(), pruebas.id('LN'), pruebas.f('2026-10-06'), pruebas.cl(98)) $q$, '23514');
select pruebas.espera_error('K06 Peso 0: no',
  $q$ select public.registrar_consumo(gen_random_uuid(), pruebas.id('LN'), pruebas.f('2026-10-06'), pruebas.cl(1, '0'::jsonb)) $q$, '22023');
select pruebas.como('u_consulta');
select pruebas.espera_error('K07 Consulta no registra',
  $q$ select public.registrar_consumo(gen_random_uuid(), pruebas.id('LN'), pruebas.f('2026-10-06'), pruebas.cl(1)) $q$, '42501');
select pruebas.como('u_ajeno');
select pruebas.espera_error('K08 Un operador de otro campo no registra',
  $q$ select public.registrar_consumo(gen_random_uuid(), pruebas.id('LN'), pruebas.f('2026-10-06'), pruebas.cl(1)) $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Tablero, editar y eliminar
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_valor('K09 Movimientos por motivo en 2026/27: alta inicial +100 y consumo −3',
  $q$ select string_agg(r.etiqueta || ':' || trim_scale(r.valor)::text, '|' order by r.n)
      from public.tablero_stock(pruebas.id('est_a'), 'movimientos', 'motivo', 'total', '2026-07-01', '2027-06-30',
                                jsonb_build_object('lote_ids', jsonb_build_array(pruebas.id('LN'))))
           with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
      where r.valor <> 0 $q$, 'Alta inicial (entran):100|Consumo (salen):-3');
select pruebas.espera_valor('K10 El consumo no es mortandad: 0 muertes en el período',
  $q$ select trim_scale(r.numerador)::text
      from public.tablero_stock(pruebas.id('est_a'), 'mortandad_pct', null, 'total', '2026-07-01', '2027-06-30',
                                jsonb_build_object('lote_ids', jsonb_build_array(pruebas.id('LN')))) r $q$, '0');
select pruebas.espera_valor('K11 Corta el tramo de pesadas: 1/7 → 1/9 vale 2.000 kg; 1/9 → 1/10 descartado por consumo',
  $q$ select trim_scale(r.valor)::text || ' ' || (r.avisos -> 'tramos_descartados')::text
      from public.tablero_pesadas(pruebas.id('est_a'), 'kg_producidos', null, 'total', '2026-07-01', '2027-06-30',
                                  jsonb_build_object('lote_ids', jsonb_build_array(pruebas.id('LN')))) r $q$, '2000 {"consumo": 1}');

select pruebas.como('u_operador');
select pruebas.espera_ok('K12 El operador edita el consumo: 1 novillo, 455 kg',
  $q$ select public.editar_consumo(pruebas.id('c1'), pruebas.id('LN'), pruebas.f('2026-09-15'), pruebas.cl(1, '455'::jsonb)) $q$);
select pruebas.espera_valor('K13 Después de editar: 1 novillo, 455 kg, y el lote con 98',
  $q$ select pruebas.va('c1') || ' / ' || pruebas.stock('LN', 'novillos') $q$, 'consumo|1|455|455 / 98');
select pruebas.espera_error('K14 editar_consumo sobre una pesada: no',
  $q$ select public.editar_consumo(pruebas.id('p2'), pruebas.id('LN'), pruebas.f('2026-09-01'), pruebas.cl(1)) $q$, '22023');
select pruebas.como('u_consulta');
select pruebas.espera_error('K15 Consulta no edita',
  $q$ select public.editar_consumo(pruebas.id('c1'), pruebas.id('LN'), pruebas.f('2026-09-15'), pruebas.cl(1)) $q$, '42501');
-- Eliminar y leer el stock en dos sentencias: dentro de una misma consulta el stock se lee como estaba al empezar
select pruebas.preparar('elim_c2', $q$ select pruebas.eliminar(pruebas.id('c2')) $q$);
select pruebas.espera_valor('K16 Eliminar el consumo sin peso devuelve el novillo: 99',
  $q$ select pruebas.stock('LN', 'novillos')::text $q$, '99');

reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Reporte (error a propósito: deshace todo)
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_rep      text := current_setting('test.rep');
  v_ok       int  := (select count(*) from regexp_matches(v_rep, E'\nOK ', 'g'));
  v_falla    int  := (select count(*) from regexp_matches(v_rep, E'\nFALLA ', 'g'));
  v_omitida  int  := (select count(*) from regexp_matches(v_rep, E'\nOMITIDA ', 'g'));
  v_prep     int  := (select count(*) from regexp_matches(v_rep, E'\nPREP ', 'g'));
  v_raices   text := coalesce((select string_agg(m[1], E'\n') from regexp_matches(v_rep, E'\n(PREP [^\n]*)', 'g') m), '(ninguna)');
begin
  raise exception E'PRUEBAS CONSUMO 5C: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
