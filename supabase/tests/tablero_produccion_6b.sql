-- Campo Digital v2 — Pruebas de la etapa 6b del tablero de Indicadores: fuente Producción (tablero_produccion)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261112000200_tablero_produccion_6b).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS PRODUCCION 6B: N OK, ...", que deshace todo.
--      El resultado esperado es "26 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Datos: el set de la sección 10 de contexto/DISENO-INDICADORES-TABLERO.md (stock y pesadas), con los kg de la venta
-- (30 novillos, 10.500 kg) y de la compra (20 novillos, 6.000 kg), las pesadas del 1/8/2026 (L-Nov3, 138 a 430 kg) y
-- del 15/8/2026 (L-Cría, 100 a 450 kg) y los pesos de referencia (Vacas de cría 450, Novillos 380, Terneros/as 180;
-- Ovejas de cría sin peso). Casos aparte, en el ejercicio 2026/27 (no cambian el 2025/26):
--   L-Ovejas: 200 ovejas de cría desde el 1/7/2026, esquila el 1/10/2026 con 900 kg de lana.
--   L-A1: 10 novillos desde el 1/7/2026, pesados el 1/8 (300 kg); el 1/9 se dividen 4 a L-A2, que el 10/9 tiene un
--         ajuste de −1 y se pesa el 20/9 (3 a 320 kg).
--   L-Sin: 10 novillos desde el 1/7/2026; venta de 4 sin kg el 1/8/2026.

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


-- Lectura de las funciones del tablero, en el orden en que vienen: "periodo:etiqueta:valor" separados por "|"
-- (sin las partes vacías; el valor sin ceros de más). Período: el ejercicio 2025/26.
create function pruebas.tst(p_medida text, p_abrir text, p_tiempo text, p_filtros jsonb default '{}') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text), '|' order by r.n)
  from public.tablero_stock(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, '2025-07-01', '2026-06-30', p_filtros)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
-- Igual, para reproductivos, con numerador y denominador: "periodo:etiqueta:valor:numerador:denominador"
create function pruebas.trep(p_medida text, p_abrir text, p_tiempo text, p_filtros jsonb default '{}') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_reproductivos(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, '2025-07-01', '2026-06-30', p_filtros)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
-- Un tablero de prueba: p_paginas páginas con p_tarjetas tarjetas cada una
create function pruebas.tablero(p_paginas int, p_tarjetas int) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('nombre', 'Página ' || p, 'tarjetas',
           (select coalesce(jsonb_agg(jsonb_build_object('titulo', 'Tarjeta ' || t, 'definicion', jsonb_build_object('fuente', 'stock', 'medida', 'stock'),
                                                         'x', 0, 'y', (t - 1) * 2, 'w', 6, 'h', 2) order by t), '[]'::jsonb)
            from generate_series(1, p_tarjetas) t)) order by p), '[]'::jsonb)
  from generate_series(1, p_paginas) p
$$;
create function pruebas.cuenta_tablero() returns text language sql stable as $$
  select (select count(*) from public.tablero_paginas where establecimiento_id = pruebas.id('est_a')) || '|'
      || (select count(*) from public.tablero_tarjetas where establecimiento_id = pruebas.id('est_a'))
$$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- Lectura con numerador y denominador: "periodo:etiqueta:valor:numerador:denominador"
create function pruebas.tstn(p_medida text, p_abrir text, p_tiempo text, p_desde date default '2025-07-01', p_hasta date default '2026-06-30',
                             p_filtros jsonb default '{}') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_stock(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, p_desde, p_hasta, p_filtros)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
grant execute on all functions in schema pruebas to authenticated, anon;


-- Lectura de tablero_produccion: "periodo:etiqueta:valor:numerador:denominador" separados por "|" (sin las partes
-- vacías; los números sin ceros de más). Por defecto, el ejercicio 2025/26.
create function pruebas.tpr(p_medida text, p_abrir text, p_tiempo text, p_desde date default '2025-07-01', p_hasta date default '2026-06-30',
                            p_filtros jsonb default '{}', p_opciones jsonb default '{}') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_produccion(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, p_desde, p_hasta, p_filtros, p_opciones)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
-- El primer valor y un aviso: "valor aviso"
create function pruebas.tpra(p_medida text, p_aviso text, p_desde date, p_hasta date, p_filtros jsonb default '{}') returns text
language sql stable as $$
  select trim_scale(r.valor)::text || ' ' || coalesce(r.avisos ->> p_aviso, '-')
  from public.tablero_produccion(pruebas.id('est_a'), p_medida, null, 'total', p_desde, p_hasta, p_filtros) r
  limit 1
$$;
-- Línea con peso: {categoria_id, cabezas, peso_vivo_total_kg}
create function pruebas.pl(p_cat text, p_cabezas int, p_kg numeric) returns jsonb language sql stable as $$
  select jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas, 'peso_vivo_total_kg', p_kg)
$$;
create function pruebas.pesar(p_lote text, p_fecha text, p_cat text, p_cabezas int, p_kg numeric) returns uuid language sql as $$
  select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id(p_lote), p_fecha => p_fecha::date,
                                 p_lineas => jsonb_build_array(pruebas.pl(p_cat, p_cabezas, p_kg)))
$$;
create function pruebas.lote_f(p_lote text) returns jsonb language sql stable as $$
  select jsonb_build_object('lote_ids', jsonb_build_array(pruebas.id(p_lote)))
$$;
create function pruebas.especie_f(p_esp text) returns jsonb language sql stable as $$
  select jsonb_build_object('especie_ids', jsonb_build_array(pruebas.id(p_esp)))
$$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Datos
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('vacunos',    $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('ovinos',     $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovinos' $q$);
select pruebas.guardar('sin_sexar',  $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros/as' $q$);
select pruebas.guardar('vacas_cria', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Vacas de cría' $q$);
select pruebas.guardar('novillos',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('ovejas',     $q$ select id from public.categorias_animales where especie_id = pruebas.id('ovinos') and nombre = 'Ovejas de cría' $q$);
-- Pesos de referencia (Ovejas de cría queda sin peso)
select pruebas.preparar('ref_vacas', $q$ update public.categorias_animales set peso_referencia_kg = 450 where id = pruebas.id('vacas_cria') $q$);
select pruebas.preparar('ref_nov',   $q$ update public.categorias_animales set peso_referencia_kg = 380 where id = pruebas.id('novillos') $q$);
select pruebas.preparar('ref_tern',  $q$ update public.categorias_animales set peso_referencia_kg = 180 where id = pruebas.id('sin_sexar') $q$);
select pruebas.preparar('ref_ovejas', $q$ update public.categorias_animales set peso_referencia_kg = null where id = pruebas.id('ovejas') $q$);

select pruebas.como('u_operador');
select pruebas.guardar('LC',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Cría', pruebas.f('2025-06-30'), pruebas.comp('vacas_cria', 100)) $q$);
select pruebas.guardar('LN1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Nov1', pruebas.f('2025-06-30'), pruebas.comp('novillos', 100)) $q$);
select pruebas.guardar('LN2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Nov2', pruebas.f('2025-06-30'), pruebas.comp('novillos', 50)) $q$);
select pruebas.preparar('venta', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LN1'), p_fecha => pruebas.f('2025-10-01'),
      p_lineas => jsonb_build_array(pruebas.pl('novillos', 30, 10500)), p_modalidad => 'remate') $q$);
select pruebas.preparar('compra', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.f('2025-10-15'), p_lineas => jsonb_build_array(pruebas.pl('novillos', 20, 6000)), p_modalidad => 'productor', p_lote_id => pruebas.id('LN2')) $q$);
select pruebas.preparar('pes_n1a', $q$ select pruebas.pesar('LN1', '2025-07-01', 'novillos', 100, 30000) $q$);
select pruebas.preparar('pes_n1b', $q$ select pruebas.pesar('LN1', '2025-08-31', 'novillos', 100, 33660) $q$);
select pruebas.preparar('pes_n1c', $q$ select pruebas.pesar('LN1', '2025-09-10', 'novillos', 100, 33800) $q$);
select pruebas.preparar('pes_n1d', $q$ select pruebas.pesar('LN1', '2025-11-01', 'novillos', 70, 25200) $q$);
select pruebas.preparar('pes_n1e', $q$ select pruebas.pesar('LN1', '2026-01-01', 'novillos', 70, 27762) $q$);
select pruebas.preparar('pes_n2a', $q$ select pruebas.pesar('LN2', '2025-09-01', 'novillos', 50, 16000) $q$);
select pruebas.preparar('pes_n2b', $q$ select pruebas.pesar('LN2', '2026-01-01', 'novillos', 70, 24500) $q$);
select pruebas.guardar('op_union', $q$ select public.unir_lotes(array[pruebas.id('LN1'), pruebas.id('LN2')], pruebas.f('2026-02-01'), null,
      jsonb_build_object('nombre', 'L-Nov3')) $q$);
select pruebas.guardar('LN3', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_union') and v.rol = 'destino' $q$);
select pruebas.preparar('pes_n3a', $q$ select pruebas.pesar('LN3', '2026-03-01', 'novillos', 140, 53200) $q$);
select pruebas.preparar('muerte', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LN3'), p_fecha => pruebas.f('2026-04-15'),
      p_lineas => pruebas.comp('novillos', 2), p_causa => 'Enfermedad') $q$);
select pruebas.preparar('pes_n3b', $q$ select pruebas.pesar('LN3', '2026-05-01', 'novillos', 138, 56649) $q$);
select pruebas.preparar('pes_n3c', $q$ select pruebas.pesar('LN3', '2026-08-01', 'novillos', 138, 59340) $q$);
select pruebas.preparar('pes_c1',  $q$ select pruebas.pesar('LC',  '2026-08-15', 'vacas_cria', 100, 45000) $q$);

-- Casos aparte (2026/27)
select pruebas.guardar('LOV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('ovinos'), 'L-Ovejas', pruebas.f('2026-07-01'), pruebas.comp('ovejas', 200)) $q$);
select pruebas.preparar('esquila', $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LOV')], pruebas.f('2026-10-01'), 900) $q$);
select pruebas.guardar('LA1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-A1', pruebas.f('2026-07-01'), pruebas.comp('novillos', 10)) $q$);
select pruebas.preparar('pes_a1', $q$ select pruebas.pesar('LA1', '2026-08-01', 'novillos', 10, 3000) $q$);
select pruebas.guardar('op_div_a', $q$ select public.dividir_lote(pruebas.id('LA1'), pruebas.f('2026-09-01'),
      jsonb_build_array(jsonb_build_object('nombre', 'L-A2', 'composicion', jsonb_build_array(pruebas.lin('novillos', 4))))) $q$);
select pruebas.guardar('LA2', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_div_a') and v.rol = 'destino' $q$);
select pruebas.preparar('ajuste_a2', $q$ select public.registrar_ajuste(pruebas.id('LA2'), pruebas.id('novillos'), -1, pruebas.f('2026-09-10'), 'Error de conteo') $q$);
select pruebas.preparar('pes_a2', $q$ select pruebas.pesar('LA2', '2026-09-20', 'novillos', 3, 960) $q$);
select pruebas.guardar('LSN', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Sin', pruebas.f('2026-07-01'), pruebas.comp('novillos', 10)) $q$);
select pruebas.preparar('venta_sn', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LSN'), p_fecha => pruebas.f('2026-08-01'),
      p_lineas => pruebas.comp('novillos', 4), p_modalidad => 'remate') $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Kg en stock
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');

select pruebas.espera_valor('P01 Kg en stock al cierre (30/6/2026): L-Nov3 138 × 430 (pesada posterior del 1/8, 32 días, más cerca que la del 1/5) + L-Cría 100 × 450 (15/8) = 104.340',
  $q$ select pruebas.tpr('kg_stock', null, 'total') $q$, '104340');
select pruebas.espera_valor('P02 Al cierre, sin pesos de referencia: sin aviso',
  $q$ select pruebas.tpra('kg_stock', 'cab_con_peso_referencia', '2025-07-01', '2026-06-30') $q$, '104340 -');
select pruebas.espera_valor('P03 Por lote',
  $q$ select pruebas.tpr('kg_stock', 'lote', 'total') $q$, 'L-Nov3:59340|L-Cría:45000');
select pruebas.espera_valor('P04 Por categoría',
  $q$ select pruebas.tpr('kg_stock', 'categoria', 'total') $q$, 'Novillos:59340|Vacas de cría:45000');
select pruebas.espera_valor('P05 Al 31/1/2026: L-Nov1 70 × 396,6 + L-Nov2 70 × 350 (pesadas del 1/1) + L-Cría 100 × 450 (referencia), avisa 100 cabezas con referencia',
  $q$ select pruebas.tpra('kg_stock', 'cab_con_peso_referencia', '2025-07-01', '2026-01-31') $q$, '97262 100');
select pruebas.espera_valor('P06 Por mes (jul a set 2025): jul L-Nov1 300 (1/7, 30 días, antes que la del 31/8 a 31) + L-Nov2 50 × 320 (posterior, 1/9); ago la del mismo día; set L-Nov1 338 (10/9) y L-Nov2 320',
  $q$ select pruebas.tpr('kg_stock', null, 'mes', '2025-07-01', '2025-09-30') $q$, '2025-07:91000|2025-08:94660|2025-09:94800');
select pruebas.espera_valor('P07 Solo con la pesada posterior: L-Nov2 al 20/12/2025, 70 × 350 (1/1/2026, 12 días; la anterior es de hace 110)',
  $q$ select pruebas.tpr('kg_stock', null, 'total', '2025-07-01', '2025-12-20', pruebas.lote_f('LN2')) $q$, '24500');
select pruebas.espera_valor('P08 Pesada del lote de origen y posterior cortada: L-A2 al 5/9/2026, 4 × 300 (pesada de L-A1 del 1/8; la del 20/9 no sirve por el ajuste del 10/9)',
  $q$ select pruebas.tpr('kg_stock', null, 'total', '2026-07-01', '2026-09-05', pruebas.lote_f('LA2')) $q$, '1200');
select pruebas.espera_valor('P09 Después del ajuste la posterior sirve: L-A2 al 15/9/2026, 3 × 320',
  $q$ select pruebas.tpr('kg_stock', null, 'total', '2026-07-01', '2026-09-15', pruebas.lote_f('LA2')) $q$, '960');
select pruebas.espera_valor('P10 Sin pesada ni referencia no suma y avisa: L-Ovejas al 30/6/2027',
  $q$ select pruebas.tpra('kg_stock', 'cab_sin_peso', '2026-07-01', '2027-06-30', pruebas.lote_f('LOV')) $q$, '0 200');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Producción de carne, compras y ventas (ejercicio 2025/26)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('P11 Producción de carne: 10.500 − 6.000 + (104.340 − 94.000) = 14.840; al inicio, 150 cabezas con referencia (L-Nov2 y L-Cría)',
  $q$ select pruebas.tpra('produccion_carne', 'cab_con_peso_referencia', '2025-07-01', '2026-06-30') $q$, '14840 150');
select pruebas.espera_valor('P12 Por ejercicio y abierta por especie',
  $q$ select pruebas.tpr('produccion_carne', 'especie', 'ejercicio') $q$, '2025/26:Vacunos:14840');
select pruebas.espera_valor('P13 El filtro de categoría no aplica a la producción (los kg pasan de una categoría a otra)',
  $q$ select pruebas.tpr('produccion_carne', null, 'total', p_filtros => jsonb_build_object('categoria_ids', jsonb_build_array(pruebas.id('novillos')))) $q$, '14840');
select pruebas.espera_valor('P14 Kg vendidos y comprados',
  $q$ select pruebas.tpr('kg_vendidos', null, 'total') || ' ' || pruebas.tpr('kg_comprados', null, 'total') $q$, '10500 6000');
select pruebas.espera_valor('P15 Peso promedio de venta: 10.500 / 30',
  $q$ select pruebas.tpr('peso_venta', null, 'total') $q$, '350:10500:30');
select pruebas.espera_valor('P16 Kg vendidos por lote (las compras no aparecen)',
  $q$ select pruebas.tpr('kg_vendidos', 'lote', 'total') $q$, 'L-Nov1:10500');
select pruebas.espera_valor('P17 Venta sin kg: no suma y avisa las cabezas (L-Sin, 2026/27)',
  $q$ select pruebas.tpra('kg_vendidos', 'cab_vendidas_sin_kg', '2026-07-01', '2027-06-30', pruebas.lote_f('LSN')) $q$, '0 4');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Lana y carne equivalente (ejercicio 2026/27)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('P18 Lana: 900 kg',
  $q$ select pruebas.tpr('lana', null, 'ejercicio', '2026-07-01', '2027-06-30') $q$, '2026/27:900');
select pruebas.espera_valor('P19 Lana por animal: 900 / 200',
  $q$ select pruebas.tpr('lana_por_animal', null, 'ejercicio', '2026-07-01', '2027-06-30') $q$, '2026/27:4.5:900:200');
select pruebas.espera_valor('P20 Carne equivalente de los ovinos: la carne ovina da 0 (sin pesos, con aviso) + 900 × 2,48',
  $q$ select pruebas.tpra('carne_equivalente', 'cab_sin_peso', '2026-07-01', '2027-06-30', pruebas.especie_f('ovinos')) $q$, '2232 200');
select pruebas.espera_valor('P21 Con otro factor de la lana (3)',
  $q$ select pruebas.tpr('carne_equivalente', null, 'total', '2026-07-01', '2027-06-30', pruebas.especie_f('ovinos'), '{"factor_lana": 3}') $q$, '2700');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Errores y permisos
-- ════════════════════════════════════════════════════════════════════════════


select pruebas.como('u_admin');
select pruebas.espera_ok('G01 El administrador guarda una tarjeta de la fuente Producción',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), jsonb_build_array(jsonb_build_object('nombre', 'Producción', 'tarjetas',
        jsonb_build_array(jsonb_build_object('titulo', 'Producción de carne', 'definicion',
          jsonb_build_object('fuente', 'produccion', 'medidas', jsonb_build_array('produccion_carne')), 'x', 0, 'y', 0, 'w', 6, 'h', 2))))) $q$);
select pruebas.como('u_consulta');

select pruebas.espera_error('E01 La producción por mes no se puede',
  $q$ select * from public.tablero_produccion(pruebas.id('est_a'), 'produccion_carne', null, 'mes', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_error('E02 Ni abrirla por lote',
  $q$ select * from public.tablero_produccion(pruebas.id('est_a'), 'produccion_carne', 'lote', 'total', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_error('E03 Ni abrir la lana por categoría (la esquila no la dice)',
  $q$ select * from public.tablero_produccion(pruebas.id('est_a'), 'lana', 'categoria', 'total', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.como('u_ajeno');
select pruebas.espera_error('E04 Un usuario de otro campo no saca datos',
  $q$ select * from public.tablero_produccion(pruebas.id('est_a'), 'kg_stock', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');

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
  raise exception E'PRUEBAS PRODUCCION 6B: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
