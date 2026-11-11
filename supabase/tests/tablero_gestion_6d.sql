-- Campo Digital v2 — Pruebas de la etapa 6d del tablero de Indicadores: fuente Gestión (tablero_gestion)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261112000600_tablero_gestion_6d).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS GESTION 6D: N OK, ...", que deshace todo.
--      El resultado esperado es "15 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Datos: el stock de la sección 10 de contexto/DISENO-INDICADORES-TABLERO.md (L-Nov3 con 138 novillos al 30/6/2026) y
-- la parte de Gestión:
--   * tarea 1, cargada el 1/5/2026, de L-Nov3, vence el 1/6/2026 (vencida al 30/6);
--   * tarea 2, cargada el 1/5/2026, sin lote, vence el 10/7/2026 (próxima al 30/6);
--   * sanidad en L-Nov3 el 20/6/2026: un producto con carencia de 30 días (hasta el 20/7) y próxima dosis el 5/7/2026.

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


-- Lectura de tablero_gestion: "etiqueta:valor:numerador" separados por "|" (sin las partes vacías). Por defecto, al
-- 30/6/2026.
create function pruebas.tges(p_medida text, p_abrir text default null, p_hasta date default '2026-06-30',
                             p_filtros jsonb default '{}') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text), '|' order by r.n)
  from public.tablero_gestion(pruebas.id('est_a'), p_medida, p_abrir, 'total', '2025-07-01', p_hasta, p_filtros)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
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

select pruebas.guardar('tarea1', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), pruebas.f('2026-05-01'), 'tarea', 'Revisar alambrado',
      p_lotes => array[pruebas.id('LN3')], p_vencimiento => pruebas.f('2026-06-01')) $q$);
select pruebas.guardar('tarea2', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), pruebas.f('2026-05-01'), 'tarea', 'Limpiar tajamar',
      p_vencimiento => pruebas.f('2026-07-10')) $q$);
select pruebas.guardar('sanidad', $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LN3')], pruebas.f('2026-06-20'),
      jsonb_build_array(jsonb_build_object('producto', 'Ivermectina', 'categoria', 'Antiparasitario', 'carencia_dias', 30,
                                           'fecha_proxima_dosis', '2026-07-05'))) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Gestión al 30/6/2026
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_valor('G01 Tareas vencidas: 1 (la del 1/6)',
  $q$ select pruebas.tges('tareas_vencidas') $q$, '1');
select pruebas.espera_valor('G02 Tareas que vencen en los próximos 15 días: 1 (la del 10/7)',
  $q$ select pruebas.tges('tareas_proximas') $q$, '1');
select pruebas.espera_valor('G03 Lotes con carencia: L-Nov3 (hasta el 20/7), con sus 138 cabezas',
  $q$ select pruebas.tges('lotes_carencia') $q$, '1:138');
select pruebas.espera_valor('G04 Cabezas con carencia: 138',
  $q$ select pruebas.tges('cab_carencia') $q$, '138');
select pruebas.espera_valor('G05 Próximas dosis en los próximos 15 días: 1 (5/7)',
  $q$ select pruebas.tges('proximas_dosis') $q$, '1');
select pruebas.espera_valor('G06 Tareas vencidas y próximas por lote: la vencida es de L-Nov3; la próxima no tiene lote',
  $q$ select pruebas.tges('tareas_vencidas', 'lote') || '|' || pruebas.tges('tareas_proximas', 'lote') $q$, 'L-Nov3:1|Sin lote:1');
select pruebas.espera_valor('G07 Filtrado por L-Nov3, la tarea sin lote queda afuera',
  $q$ select pruebas.tges('tareas_proximas', null, '2026-06-30', jsonb_build_object('lote_ids', jsonb_build_array(pruebas.id('LN3')))) $q$, '0');
select pruebas.espera_valor('G08 Al 25/7/2026: 2 tareas vencidas, la carencia terminó (0 lotes) y la dosis ya pasó (0)',
  $q$ select pruebas.tges('tareas_vencidas', null, '2026-07-25') || '|' || pruebas.tges('lotes_carencia', null, '2026-07-25') || '|' || pruebas.tges('proximas_dosis', null, '2026-07-25') $q$, '2|0:0|0');
select pruebas.espera_valor('G09 Filtrado por Ovinos: ninguna carencia',
  $q$ select pruebas.tges('lotes_carencia', null, '2026-06-30', jsonb_build_object('especie_ids', jsonb_build_array(pruebas.id('ovinos')))) $q$, '0:0');

-- La tarea 1 se marca realizada hoy: al 30/6/2026 seguía pendiente (cuenta); hoy ya no
select pruebas.espera_valor('G10 Antes de marcarla: hoy hay 2 tareas vencidas',
  $q$ select pruebas.tges('tareas_vencidas', null, public.fecha_hoy()) $q$, '2');
select pruebas.como('u_operador');
select pruebas.preparar('t1_hecha', $q$ select public.cambiar_estado_tarea(pruebas.id('tarea1'), 'realizada') $q$);
select pruebas.como('u_consulta');
select pruebas.espera_valor('G11 Realizada hoy: al 30/6 sigue vencida; hoy queda solo la otra',
  $q$ select pruebas.tges('tareas_vencidas') || '|' || pruebas.tges('tareas_vencidas', null, public.fecha_hoy()) $q$, '1|1');

select pruebas.como('u_admin');
select pruebas.espera_ok('G12 El administrador guarda una tarjeta de la fuente Gestión',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), jsonb_build_array(jsonb_build_object('nombre', 'Gestión', 'tarjetas',
        jsonb_build_array(jsonb_build_object('titulo', 'Tareas vencidas', 'definicion',
          jsonb_build_object('fuente', 'gestion', 'medidas', jsonb_build_array('tareas_vencidas')), 'x', 0, 'y', 0, 'w', 6, 'h', 2))))) $q$);
select pruebas.como('u_consulta');
select pruebas.espera_error('E01 Gestión por mes (es a la fecha de cierre)',
  $q$ select * from public.tablero_gestion(pruebas.id('est_a'), 'tareas_vencidas', null, 'mes', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_error('E02 Ni abierta por especie',
  $q$ select * from public.tablero_gestion(pruebas.id('est_a'), 'tareas_vencidas', 'especie', 'total', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.como('u_ajeno');
select pruebas.espera_error('E03 Un usuario de otro campo no saca datos',
  $q$ select * from public.tablero_gestion(pruebas.id('est_a'), 'tareas_vencidas', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');

reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS GESTION 6D: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
