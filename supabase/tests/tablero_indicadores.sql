-- Campo Digital v2 — Pruebas del tablero de Indicadores (etapa 1a)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261109000200_tablero_sin_funciones_internas).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS TABLERO 1A: N OK, ...", que deshace todo.
--      El resultado esperado es "44 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Los datos son los de la sección 10 de contexto/DISENO-INDICADORES-TABLERO.md (stock y reproductivos), con fechas
-- fijas; los resultados esperados están calculados a mano ahí.
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

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 tablero_paginas y tablero_tarjetas: RLS, authenticated solo lee, anon nada',
  $q$ select bool_and(c.relrowsecurity
          and has_table_privilege('authenticated', c.oid, 'select')
          and not has_table_privilege('authenticated', c.oid, 'insert')
          and not has_table_privilege('authenticated', c.oid, 'update')
          and not has_table_privilege('authenticated', c.oid, 'delete')
          and not has_table_privilege('anon', c.oid, 'select'))::text || '|' || count(*)
      from pg_class c where c.oid in ('public.tablero_paginas'::regclass, 'public.tablero_tarjetas'::regclass) $q$, 'true|2');
select pruebas.espera_valor('B02 Funciones: search_path fijo, nada para anon; guardar_tablero security definer; las de datos con los permisos de quien consulta; sin funciones internas _tablero_',
  $q$ select count(*) filter (where coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('anon', p.oid, 'execute')
              and has_function_privilege('authenticated', p.oid, 'execute')
              and p.prosecdef = (p.proname = 'guardar_tablero'))::text || '/' || count(*)
          || '|' || (select count(*) from pg_proc x where x.pronamespace = 'public'::regnamespace and x.proname like '\_tablero\_%')
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('guardar_tablero', 'tablero_stock', 'tablero_reproductivos') $q$, '3/3|0');

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
select pruebas.guardar('op_union', $q$ select public.unir_lotes(array[pruebas.id('LN1'), pruebas.id('LN2')], pruebas.f('2026-02-01'), null,
      jsonb_build_object('nombre', 'L-Nov3')) $q$);
select pruebas.guardar('LN3', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_union') and v.rol = 'destino' $q$);
select pruebas.preparar('muerte', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LN3'), p_fecha => pruebas.f('2026-04-15'),
      p_lineas => pruebas.comp('novillos', 2), p_causa => 'Enfermedad') $q$);

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

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Stock (ejercicio 2025/26)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('T01 Stock al cierre (30/6/2026): 238',
  $q$ select pruebas.tst('stock', null, 'total') $q$, '238');
select pruebas.espera_valor('T02 Stock al cierre por categoría (de mayor a menor; terneros 0 no aparece)',
  $q$ select pruebas.tst('stock', 'categoria', 'total') $q$, 'Novillos:138|Vacas de cría:100');
select pruebas.espera_valor('T03 Stock de novillos al cierre de cada mes (semi-aditivo, nunca la suma)',
  $q$ select pruebas.tst('stock', null, 'mes', jsonb_build_object('categoria_ids', jsonb_build_array(pruebas.id('novillos')))) $q$,
  '2025-07:150|2025-08:150|2025-09:150|2025-10:140|2025-11:140|2025-12:140|2026-01:140|2026-02:140|2026-03:140|2026-04:138|2026-05:138|2026-06:138');
select pruebas.espera_valor('T04 Por ejercicio: una fila, la del 2025/26',
  $q$ select pruebas.tst('stock', null, 'ejercicio') $q$, '2025/26:238');
select pruebas.espera_valor('T05 Por lote: los cerrados por la unión (en 0) no aparecen',
  $q$ select pruebas.tst('stock', 'lote', 'total') $q$, 'L-Nov3:138|L-Cría:100');
select pruebas.espera_valor('T06 Altas y bajas por motivo: unión +140/−140, compra +20, mortandad −2, venta −30',
  $q$ select pruebas.tst('movimientos', 'motivo', 'total') $q$,
  'Unión (entran):140|Compra (entran):20|Mortandad (salen):-2|Venta (salen):-30|Unión (salen):-140');
select pruebas.espera_valor('T07 Movimientos sin abrir: neto −12',
  $q$ select pruebas.tst('movimientos', null, 'total') $q$, '-12');
select pruebas.espera_valor('T08 Mortandad %: 2 / (250 + 0 + 20) = 0,74 %, con numerador y denominador',
  $q$ select concat_ws(':', r.periodo, trim_scale(r.valor)::text, trim_scale(r.numerador)::text, trim_scale(r.denominador)::text)
      from public.tablero_stock(pruebas.id('est_a'), 'mortandad_pct', null, 'ejercicio', '2025-07-01', '2026-06-30') r $q$,
  '2025/26:0.74:2:270');
select pruebas.espera_error('T09 Medida desconocida',
  $q$ select * from public.tablero_stock(pruebas.id('est_a'), 'kilos', null, 'total', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_error('T10 Abrir el stock por motivo (solo movimientos)',
  $q$ select * from public.tablero_stock(pruebas.id('est_a'), 'stock', 'motivo', 'total', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_error('T11 Desde después de hasta',
  $q$ select * from public.tablero_stock(pruebas.id('est_a'), 'stock', null, 'total', '2026-06-30', '2025-07-01') $q$, '22023');
select pruebas.espera_error('T12 Mortandad % por mes (no se puede)',
  $q$ select * from public.tablero_stock(pruebas.id('est_a'), 'mortandad_pct', null, 'mes', '2025-07-01', '2026-06-30') $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Reproductivos (temporada 2025/26)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('R01 % preñez: 90 / 100',
  $q$ select pruebas.trep('pct_prenez', null, 'temporada') $q$, '2025/26:90:90:100');
select pruebas.espera_valor('R02 % parición (vivos): 80 / 100',
  $q$ select pruebas.trep('pct_paricion', null, 'temporada') $q$, '2025/26:80:80:100');
select pruebas.espera_valor('R03 % parición total (vivos y muertos): 83 / 100',
  $q$ select pruebas.trep('pct_paricion_total', null, 'temporada') $q$, '2025/26:83:83:100');
select pruebas.espera_valor('R04 Nacidos muertos: 3',
  $q$ select pruebas.trep('nacidos_muertos', null, 'temporada') $q$, '2025/26:3');
select pruebas.espera_valor('R05 % destete: 75 / 100 (con el arreglo; sin él daba 38)',
  $q$ select pruebas.trep('pct_destete', null, 'temporada') $q$, '2025/26:75:75:100');
select pruebas.espera_valor('R06 El destete de L-Cría-B (lote dividido después de parir) va a la temporada 2025',
  $q$ select string_agg(coalesce(a.temporada::text, 'sin servicio') || ':' || a.destetadas, '|')
      from public.v_indicadores_aportes a where a.tipo = 'destete' and a.lote_id = pruebas.id('LCB') $q$, '2025:37');
select pruebas.espera_valor('R07 La pantalla de hoy (v_indicadores_reproductivos) también da 75 destetadas y 75,0 %',
  $q$ select destetadas || '|' || pct_destete from public.v_indicadores_reproductivos
      where establecimiento_id = pruebas.id('est_a') and temporada = 2025 $q$, '75|75.0');
select pruebas.espera_valor('R08 Abierto por especie',
  $q$ select pruebas.trep('pct_prenez', 'especie', 'temporada') $q$, '2025/26:Vacunos:90:90:100');
select pruebas.espera_valor('R09 Total (sin temporada)',
  $q$ select pruebas.trep('pct_paricion', null, 'total') $q$, '80:80:100');
select pruebas.espera_valor('R10 El filtro de categoría no aplica: se ignora (la app lo marca)',
  $q$ select pruebas.trep('pct_prenez', null, 'temporada', jsonb_build_object('categoria_ids', jsonb_build_array(pruebas.id('novillos')))) $q$,
  '2025/26:90:90:100');
select pruebas.espera_error('R11 Abrir reproductivos por categoría (no se puede)',
  $q$ select * from public.tablero_reproductivos(pruebas.id('est_a'), 'pct_prenez', 'categoria', 'temporada', '2025-07-01', '2026-06-30') $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Guardar el tablero
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_admin');
select pruebas.espera_ok('G01 El administrador guarda 2 páginas con 3 tarjetas cada una',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), pruebas.tablero(2, 3)) $q$);
select pruebas.espera_valor('G02 Quedan 2 páginas y 6 tarjetas, en orden',
  $q$ select pruebas.cuenta_tablero() || '|' || (select string_agg(nombre, ',' order by orden) from public.tablero_paginas
                                                  where establecimiento_id = pruebas.id('est_a')) $q$, '2|6|Página 1,Página 2');
select pruebas.espera_error('G03 Una tarjeta que se pasa de las 12 columnas',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), jsonb_build_array(jsonb_build_object('nombre', 'P', 'tarjetas',
        jsonb_build_array(jsonb_build_object('titulo', 'T', 'definicion', jsonb_build_object('fuente', 'stock'), 'x', 8, 'y', 0, 'w', 6, 'h', 2))))) $q$, '22023');
select pruebas.espera_error('G04 Una página sin nombre',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), jsonb_build_array(jsonb_build_object('nombre', '  ', 'tarjetas', '[]'::jsonb))) $q$, '22023');
select pruebas.espera_error('G05 Una fuente de datos desconocida',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), jsonb_build_array(jsonb_build_object('nombre', 'P', 'tarjetas',
        jsonb_build_array(jsonb_build_object('titulo', 'T', 'definicion', jsonb_build_object('fuente', 'clima'), 'x', 0, 'y', 0, 'w', 6, 'h', 2))))) $q$, '22023');
select pruebas.espera_valor('G06 Un error no deja el tablero a medias: siguen las 2 páginas y 6 tarjetas',
  $q$ select pruebas.cuenta_tablero() $q$, '2|6');
select pruebas.espera_error('G07 Ni el administrador escribe directo en las tablas',
  $q$ insert into public.tablero_paginas (establecimiento_id, nombre, orden) values (pruebas.id('est_a'), 'Directa', 9) $q$, '42501');

select pruebas.como('u_operador');
select pruebas.espera_error('G08 El operador no guarda el tablero',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), pruebas.tablero(1, 1)) $q$, '42501');
select pruebas.espera_valor('G09 El operador lo ve',
  $q$ select pruebas.cuenta_tablero() $q$, '2|6');
select pruebas.como('u_consulta');
select pruebas.espera_error('G10 Consulta no lo guarda',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), pruebas.tablero(1, 1)) $q$, '42501');
select pruebas.espera_valor('G11 Consulta lo ve y usa las funciones de datos',
  $q$ select pruebas.cuenta_tablero() || '|' || pruebas.tst('stock', null, 'total') $q$, '2|6|238');

select pruebas.como('u_ajeno');
select pruebas.espera_valor('G12 Un usuario de otro campo no ve el tablero',
  $q$ select (select count(*) from public.tablero_paginas where establecimiento_id = pruebas.id('est_a'))::text $q$, '0');
select pruebas.espera_error('G13 Ni le saca datos con las funciones',
  $q$ select * from public.tablero_stock(pruebas.id('est_a'), 'stock', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');

select pruebas.como('u_admin');
select pruebas.espera_ok('G14 Guardar de nuevo reemplaza todo (1 página, 1 tarjeta)',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), pruebas.tablero(1, 1)) $q$);
select pruebas.espera_valor('G15 Quedan 1 y 1',
  $q$ select pruebas.cuenta_tablero() $q$, '1|1');
select pruebas.espera_ok('G16 Una lista vacía borra el tablero (la app vuelve a la plantilla)',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), '[]'::jsonb) $q$);
select pruebas.espera_valor('G17 Quedan 0 y 0',
  $q$ select pruebas.cuenta_tablero() $q$, '0|0');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no usa las funciones de datos',
  $q$ select * from public.tablero_stock(pruebas.id('est_a'), 'stock', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');
select pruebas.espera_error('N02 anon no lee el tablero',
  $q$ select count(*) from public.tablero_paginas $q$, '42501');

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
  raise exception E'PRUEBAS TABLERO 1A: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
