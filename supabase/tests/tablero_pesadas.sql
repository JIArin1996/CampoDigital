-- Campo Digital v2 — Pruebas del tablero de Indicadores, etapa 2: producción y pesos (tablero_pesadas)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261109000400_tablero_pesadas_composicion).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS TABLERO PESADAS: N OK, ...", que deshace todo.
--      El resultado esperado es "21 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Los datos son los de la sección 10 de contexto/DISENO-INDICADORES-TABLERO.md (lotes, eventos y pesadas), con
-- fechas fijas; los resultados esperados (tramos válidos y descartados) están calculados a mano ahí.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia,
-- X = operador de otro campo.

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

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 tablero_pesadas: search_path fijo, con los permisos de quien consulta, authenticated sí y anon no',
  $q$ select (coalesce('search_path=""' = any (p.proconfig), false) and not p.prosecdef
          and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
      from pg_proc p where p.oid = 'public.tablero_pesadas(uuid, text, text, text, date, date, jsonb, jsonb)'::regprocedure $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Datos (sección 10 del diseño: stock y reproductivos)
-- ════════════════════════════════════════════════════════════════════════════
--   30/6/2025  alta de L-Cría (100 vacas de cría), L-Nov1 (100 novillos) y L-Nov2 (50 novillos): 250 al inicio
--   1/10/2025  venta de 30 novillos de L-Nov1           15/10/2025  compra de 20 novillos a L-Nov2
--   1/2/2026   unión de L-Nov1 y L-Nov2 en L-Nov3 (140) 15/4/2026   mortandad de 2 novillos de L-Nov3 (138)
--   1/12/2025  servicio en L-Cría (100 entoradas)       1/3/2026    diagnóstico: 100, 90 preñadas
--   15/9/2026  parición en L-Cría: 80 vivos y 3 muertos, crías al pie
--   1/10/2026  división de L-Cría: L-Cría-B con 50 vacas y 40 terneros
--   1/11/2026  destete: 38 de L-Cría y 37 de L-Cría-B

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('vacunos',    $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('sin_sexar',  $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros/as' $q$);
select pruebas.guardar('terneros',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros' $q$);
select pruebas.guardar('terneras',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneras' $q$);
select pruebas.guardar('vacas_cria', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Vacas de cría' $q$);
select pruebas.guardar('novillos',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);

select pruebas.como('u_operador');
select pruebas.guardar('LC',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Cría', pruebas.f('2025-06-30'), pruebas.comp('vacas_cria', 100)) $q$);
select pruebas.guardar('LN1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Nov1', pruebas.f('2025-06-30'), pruebas.comp('novillos', 100)) $q$);
select pruebas.guardar('LN2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Nov2', pruebas.f('2025-06-30'), pruebas.comp('novillos', 50)) $q$);
select pruebas.preparar('venta', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LN1'), p_fecha => pruebas.f('2025-10-01'),
      p_lineas => pruebas.comp('novillos', 30), p_modalidad => 'remate') $q$);
select pruebas.preparar('compra', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.f('2025-10-15'), p_lineas => pruebas.comp('novillos', 20), p_modalidad => 'productor', p_lote_id => pruebas.id('LN2')) $q$);
-- Pesadas de L-Nov1 y L-Nov2 (antes de la unión, que los cierra)
select pruebas.preparar('pes_n1a', $q$ select pruebas.pesar('LN1', '2025-07-01', 100, 30000) $q$);
select pruebas.preparar('pes_n1b', $q$ select pruebas.pesar('LN1', '2025-08-31', 100, 33660) $q$);
select pruebas.preparar('pes_n1c', $q$ select pruebas.pesar('LN1', '2025-09-10', 100, 33800) $q$);
select pruebas.preparar('pes_n1d', $q$ select pruebas.pesar('LN1', '2025-11-01', 70, 25200) $q$);
select pruebas.preparar('pes_n1e', $q$ select pruebas.pesar('LN1', '2026-01-01', 70, 27762) $q$);
select pruebas.preparar('pes_n2a', $q$ select pruebas.pesar('LN2', '2025-09-01', 50, 16000) $q$);
select pruebas.preparar('pes_n2b', $q$ select pruebas.pesar('LN2', '2026-01-01', 70, 24500) $q$);
select pruebas.guardar('op_union', $q$ select public.unir_lotes(array[pruebas.id('LN1'), pruebas.id('LN2')], pruebas.f('2026-02-01'), null,
      jsonb_build_object('nombre', 'L-Nov3')) $q$);
select pruebas.guardar('LN3', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_union') and v.rol = 'destino' $q$);
select pruebas.preparar('pes_n3a', $q$ select pruebas.pesar('LN3', '2026-03-01', 140, 53200) $q$);
select pruebas.preparar('muerte', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LN3'), p_fecha => pruebas.f('2026-04-15'),
      p_lineas => pruebas.comp('novillos', 2), p_causa => 'Enfermedad') $q$);
select pruebas.preparar('pes_n3b', $q$ select pruebas.pesar('LN3', '2026-05-01', 138, 56649) $q$);

select pruebas.preparar('serv', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LC'), pruebas.f('2025-12-01'), 100, 4) $q$);
select pruebas.preparar('diag', $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LC'), pruebas.f('2026-03-01'), 100, 90) $q$);
select pruebas.preparar('pari', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LC'),
      p_fecha => pruebas.f('2026-09-15'), p_lineas => pruebas.comp('sin_sexar', 80), p_nacidos_muertos => 3, p_lote_cria_id => pruebas.id('LC')) $q$);
select pruebas.guardar('op_div', $q$ select public.dividir_lote(pruebas.id('LC'), pruebas.f('2026-10-01'),
      jsonb_build_array(jsonb_build_object('nombre', 'L-Cría-B', 'composicion',
        jsonb_build_array(pruebas.lin('vacas_cria', 50), pruebas.lin('sin_sexar', 40))))) $q$);
select pruebas.guardar('LCB', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_div') and v.rol = 'destino' $q$);
select pruebas.guardar('dest', $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.f('2026-11-01'),
      jsonb_build_array(
        jsonb_build_object('lote_id', pruebas.id('LC'),  'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 38))),
        jsonb_build_object('lote_id', pruebas.id('LCB'), 'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 37)))),
      jsonb_build_array(jsonb_build_object('nombre', 'Destete 2026', 'lineas',
        jsonb_build_array(pruebas.lin('terneros', 40), pruebas.lin('terneras', 35))))) $q$);

-- Ejercicio 2026/27 (sección 10 del diseño: destete, parición y ajuste)
--   L-Cría: pesadas de las 100 vacas el 15/8 (45.000 kg) y el 25/9/2026 (45.500); la parición del 15/9 suma
--           terneros, que no se pesan: el tramo vale (+500 kg).
--   L-Cría-B: pesadas el 5/10 (50 vacas 22.500 kg y 40 terneros 4.000) y el 5/11/2026 (50 vacas 22.750 y 3 terneros
--           330): el destete del 1/11 saca terneros pesados, el tramo se descarta. Su primer tramo (desde la última
--           de L-Cría, 25/9) dura 10 días: corto.
--   L-Nov3: pesada el 1/8/2026 (138 a 430 kg = 59.340): tramo desde el 1/5 (92 días, +19,5 × 138 = 2.691 kg).
--           Ajuste de −1 novillo el 15/8 y pesada el 15/9 (137 a 450 = 61.650): el tramo se descarta.
select pruebas.preparar('pes_c1', $q$ select pruebas.pesarl('LC', '2026-08-15', jsonb_build_array(pruebas.pl('vacas_cria', 100, 45000))) $q$);
select pruebas.preparar('pes_c2', $q$ select pruebas.pesarl('LC', '2026-09-25', jsonb_build_array(pruebas.pl('vacas_cria', 100, 45500))) $q$);
select pruebas.preparar('pes_b1', $q$ select pruebas.pesarl('LCB', '2026-10-05',
      jsonb_build_array(pruebas.pl('vacas_cria', 50, 22500), pruebas.pl('sin_sexar', 40, 4000))) $q$);
select pruebas.preparar('pes_b2', $q$ select pruebas.pesarl('LCB', '2026-11-05',
      jsonb_build_array(pruebas.pl('vacas_cria', 50, 22750), pruebas.pl('sin_sexar', 3, 330))) $q$);
select pruebas.preparar('pes_n3c', $q$ select pruebas.pesar('LN3', '2026-08-01', 138, 59340) $q$);
select pruebas.preparar('ajuste', $q$ select public.registrar_ajuste(pruebas.id('LN3'), pruebas.id('novillos'), -1, pruebas.f('2026-08-15'), 'Error de conteo') $q$);
select pruebas.preparar('pes_n3d', $q$ select pruebas.pesar('LN3', '2026-09-15', 137, 61650) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Pesadas (ejercicio 2025/26, mínimo 21 días)
-- ════════════════════════════════════════════════════════════════════════════
-- Tramos válidos: L-Nov1 1/7→31/8 (3.660 kg), L-Nov1 1/11→1/1 (2.562 kg), L-Nov3 1/3→1/5 (4.209 kg; la mortandad
-- del 15/4 no corta). Descartados: 31/8→10/9 (10 días), 10/9→1/11 (venta), L-Nov2 1/9→1/1 (compra),
-- L-Nov1 y L-Nov2 (1/1) → L-Nov3 1/3 (unión).

select pruebas.como('u_consulta');
select pruebas.espera_valor('P01 Kg producidos: 3.660 + 2.562 + 4.209 = 10.431',
  $q$ select pruebas.tpes('kg_producidos', null, 'total') $q$, '10431');
select pruebas.espera_valor('P02 Ganancia diaria: 10.431 / 18.788 cabeza-día = 0,555 kg/día',
  $q$ select pruebas.tpes('ganancia_diaria', null, 'total') $q$, '0.555:10431:18788');
select pruebas.espera_valor('P03 Kg producidos por mes (el del final del tramo; sin los meses en 0)',
  $q$ select pruebas.tpes('kg_producidos', null, 'mes', p_sin_ceros => true) $q$, '2025-08:3660|2026-01:2562|2026-05:4209');
select pruebas.espera_valor('P04 Tramos descartados: 4 (corto, venta, compra, unión)',
  $q$ select (r.avisos -> 'tramos_descartados' = '{"corto": 1, "venta": 1, "compra": 1, "union": 1}'::jsonb)::text
      from public.tablero_pesadas(pruebas.id('est_a'), 'kg_producidos', null, 'total', '2025-07-01', '2026-06-30') r $q$, 'true');
select pruebas.espera_valor('P05 Peso promedio al cierre: L-Nov3 (el único lote abierto con pesada), 56.649 / 138 = 410,5',
  $q$ select pruebas.tpes('peso_promedio', null, 'total') $q$, '410.5:56649:138');
select pruebas.espera_valor('P06 Kg producidos por lote (el de la pesada final)',
  $q$ select pruebas.tpes('kg_producidos', 'lote', 'total') $q$, 'L-Nov1:6222|L-Nov3:4209');
select pruebas.espera_valor('P07 Por categoría (todas las líneas son de novillos)',
  $q$ select pruebas.tpes('kg_producidos', 'categoria', 'total') $q$, 'Novillos:10431');
select pruebas.espera_valor('P08 Con mínimo de 7 días el tramo de 10 días vale: +140 kg (338 − 336,6) × 100',
  $q$ select pruebas.tpes('kg_producidos', null, 'total', p_opciones => '{"min_dias": 7}') $q$, '10571');
select pruebas.espera_valor('P09 Filtro por lote: solo L-Nov3',
  $q$ select pruebas.tpes('kg_producidos', null, 'total', jsonb_build_object('lote_ids', jsonb_build_array(pruebas.id('LN3')))) $q$, '4209');
select pruebas.espera_valor('P10 Filtro por otra categoría: sin tramos',
  $q$ select pruebas.tpes('kg_producidos', null, 'total', jsonb_build_object('categoria_ids', jsonb_build_array(pruebas.id('vacas_cria')))) $q$, '0');
select pruebas.espera_error('P11 Medida desconocida',
  $q$ select * from public.tablero_pesadas(pruebas.id('est_a'), 'kilos', null, 'total', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_error('P12 Abrir por motivo (no se puede)',
  $q$ select * from public.tablero_pesadas(pruebas.id('est_a'), 'kg_producidos', 'motivo', 'total', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_error('P13 min_dias que no es un número',
  $q$ select * from public.tablero_pesadas(pruebas.id('est_a'), 'kg_producidos', null, 'total', '2025-07-01', '2026-06-30', '{}', '{"min_dias": "x"}') $q$, '22023');
select pruebas.espera_error('P14 min_dias fuera de rango',
  $q$ select * from public.tablero_pesadas(pruebas.id('est_a'), 'kg_producidos', null, 'total', '2025-07-01', '2026-06-30', '{}', '{"min_dias": 0}') $q$, '22023');

-- Ejercicio 2026/27: válidos L-Nov3 1/5→1/8 (2.691 kg en 12.696 cabeza-días) y L-Cría 15/8→25/9 (500 kg en 4.100);
-- descartados: L-Cría-B desde L-Cría (corto), L-Cría-B 5/10→5/11 (destete), L-Nov3 1/8→15/9 (ajuste).
select pruebas.espera_valor('P15 2026/27: kg producidos 2.691 + 500 = 3.191 (la parición de terneros no corta el tramo de las vacas)',
  $q$ select pruebas.tpes27('kg_producidos', null) $q$, '3191');
select pruebas.espera_valor('P16 2026/27: ganancia diaria 3.191 / 16.796 = 0,19 kg/día',
  $q$ select pruebas.tpes27('ganancia_diaria', null) $q$, '0.19:3191:16796');
select pruebas.espera_valor('P17 2026/27: descartados por corto, destete y ajuste',
  $q$ select (r.avisos -> 'tramos_descartados' = '{"corto": 1, "destete": 1, "ajuste": 1}'::jsonb)::text
      from public.tablero_pesadas(pruebas.id('est_a'), 'kg_producidos', null, 'total', '2026-07-01', '2027-06-30') r $q$, 'true');
select pruebas.espera_valor('P18 2026/27 por categoría: en las vacas de L-Cría-B el destete (de terneros) no corta: 500 + 250',
  $q$ select pruebas.tpes27('kg_producidos', 'categoria') $q$, 'Novillos:2691|Vacas de cría:750');

select pruebas.como('u_ajeno');
select pruebas.espera_error('X01 Un usuario de otro campo no le saca datos',
  $q$ select * from public.tablero_pesadas(pruebas.id('est_a'), 'kg_producidos', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no usa tablero_pesadas',
  $q$ select * from public.tablero_pesadas(pruebas.id('est_a'), 'kg_producidos', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');

reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS TABLERO PESADAS: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
