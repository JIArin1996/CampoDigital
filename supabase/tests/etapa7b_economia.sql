-- Campo Digital v2 — Pruebas de la etapa 7b: economía
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261022000500_economia).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ETAPA 7B (ECONOMÍA): N OK, ...", que deshace todo.
--      El resultado esperado es "43 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia,
-- X = operador de otro campo.
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



create function pruebas.lin(p_cat text, p_cabezas int) returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas))
$$;
-- Precio: {monto, moneda, tipo_cambio?, estado, fecha_pago?}
create function pruebas.precio(p_monto numeric, p_moneda text, p_tc numeric, p_estado text, p_fecha_pago date default null) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('monto', p_monto, 'moneda', p_moneda, 'tipo_cambio', p_tc, 'estado', p_estado, 'fecha_pago', p_fecha_pago))
$$;
-- Movimiento vigente de una actividad
create function pruebas.mov(p_act text) returns uuid language sql stable as $$
  select id from public.movimientos_economicos where actividad_id = pruebas.id(p_act) and anulado_en is null
$$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 Lectura de movimientos: solo quien puede cargar (puede_operar)',
  $q$ select (count(*) = 1 and bool_and(qual like '%puede_operar%'))::text from pg_policies
      where schemaname = 'public' and tablename = 'movimientos_economicos' and cmd = 'SELECT' $q$, 'true');
select pruebas.espera_valor('B02 Funciones: las 4 públicas security definer para authenticated y no para anon; las 2 internas para nadie; search_path fijo',
  $q$ select count(*) filter (where coalesce('search_path=""' = any (p.proconfig), false) and not has_function_privilege('anon', p.oid, 'execute')
              and case when p.proname like '\_%' then not p.prosecdef and not has_function_privilege('authenticated', p.oid, 'execute')
                       else p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') end)::text || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('registrar_movimiento', 'cargar_precio_actividad', 'marcar_pagado', 'anular_movimiento', '_precio_valido', '_rubro_de_especie') $q$,
  '6/6');
select pruebas.espera_valor('B03 Las 3 vistas de plata con security_invoker, lectura para authenticated y nada para anon',
  $q$ select count(*) filter (where coalesce('security_invoker=true' = any (c.reloptions), false)
              and has_table_privilege('authenticated', c.oid, 'select') and not has_table_privilege('anon', c.oid, 'select'))::text
      from pg_class c where c.oid in ('public.v_resultado_rubro'::regclass, 'public.v_movimientos_pendientes'::regclass,
                                      'public.v_compraventas_sin_precio'::regclass) $q$, '3');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('vacunos',   $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('novillos',  $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('r_vacunos', $q$ select id from public.rubros where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('r_general', $q$ select id from public.rubros where establecimiento_id = pruebas.id('est_a') and nombre = 'General' $q$);
select pruebas.guardar('r_x',       $q$ select id from public.rubros where establecimiento_id = pruebas.id('est_x') and nombre = 'General' $q$);

select pruebas.espera_valor('C01 Un establecimiento nuevo nace con el rubro por defecto de cada especie',
  $q$ select (rubro_id = pruebas.id('r_vacunos'))::text from public.especies where id = pruebas.id('vacunos') $q$, 'true');
-- Se renombra la especie: el rubro por defecto sigue siendo Vacunos (ya no depende del nombre)
select pruebas.preparar('renombrar', $q$ update public.especies set nombre = 'Bovinos' where id = pruebas.id('vacunos') $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: compras y ventas con precio (USD y UYU)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');
select pruebas.guardar('LV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV Novillos', pruebas.d(60), pruebas.comp('novillos', 50)) $q$);

select pruebas.guardar('v1', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(20),
      p_lineas => pruebas.lin('novillos', 5), p_modalidad => 'frigorifico', p_contraparte => 'Frigorífico (prueba)',
      p_precio => pruebas.precio(15000, 'USD', null, 'pendiente')) $q$);
select pruebas.espera_valor('E01 Venta de 15.000 USD: ingreso vigente de 15.000, pendiente, rubro Vacunos (aunque la especie se llame Bovinos), de la actividad',
  $q$ select m.sentido || '|' || m.monto_usd || '|' || m.estado || '|' || r.nombre || '|' || m.origen
      from public.movimientos_economicos m join public.rubros r on r.id = m.rubro_id where m.id = pruebas.mov('v1') $q$,
  'ingreso|15000.00|pendiente|Vacunos|actividad');
select pruebas.guardar('c1', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(19), p_lineas => pruebas.lin('novillos', 3), p_modalidad => 'productor', p_lote_id => pruebas.id('LV'),
      p_precio => pruebas.precio(20000, 'USD', null, 'pagado')) $q$);
select pruebas.espera_valor('E02 Compra de 20.000 USD: egreso vigente de 20.000, pagado',
  $q$ select sentido || '|' || monto_usd || '|' || estado from public.movimientos_economicos where id = pruebas.mov('c1') $q$,
  'egreso|20000.00|pagado');
select pruebas.guardar('v2', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(18),
      p_lineas => pruebas.lin('novillos', 4), p_modalidad => 'remate', p_precio => pruebas.precio(600000, 'UYU', 40, 'pendiente')) $q$);
select pruebas.espera_valor('E03 Venta en pesos: 600.000 UYU a 40 = ingreso de 15.000 USD',
  $q$ select sentido || '|' || monto_original || '|' || moneda_original || '|' || monto_usd from public.movimientos_economicos where id = pruebas.mov('v2') $q$,
  'ingreso|600000.00|UYU|15000.00');
select pruebas.guardar('c2', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(17), p_lineas => pruebas.lin('novillos', 2), p_modalidad => 'productor', p_lote_id => pruebas.id('LV'),
      p_precio => pruebas.precio(800000, 'UYU', 40, 'pagado')) $q$);
select pruebas.espera_valor('E04 Compra en pesos: 800.000 UYU a 40 = egreso de 20.000 USD',
  $q$ select sentido || '|' || monto_usd from public.movimientos_economicos where id = pruebas.mov('c2') $q$, 'egreso|20000.00');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. El precio que faltó
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('v3', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(15),
      p_lineas => pruebas.lin('novillos', 2), p_modalidad => 'productor', p_contraparte => 'Vecino (prueba)') $q$);
select pruebas.espera_valor('S01 Una venta sin precio aparece en "compras y ventas sin precio"',
  $q$ select count(*)::text from public.v_compraventas_sin_precio where actividad_id = pruebas.id('v3') $q$, '1');
select set_config('test.pp1', gen_random_uuid()::text, false);
-- La carga va en su propia sentencia: una consulta no ve las filas que crea una función llamada en la misma sentencia
select pruebas.preparar('pp1', $q$ select public.cargar_precio_actividad(pruebas.id('pp1'), pruebas.id('v3'), pruebas.precio(1000, 'USD', null, 'pendiente')) $q$);
select pruebas.espera_valor('P01 Cargar el precio después: ingreso manual con la fecha, el concepto y la contraparte de la venta',
  $q$ select m.sentido || '|' || m.monto_usd || '|' || m.origen || '|' || m.contraparte || '|' || m.concepto || '|' || (m.fecha = pruebas.d(15))::text
      from public.movimientos_economicos m where m.id = pruebas.id('pp1') $q$,
  'ingreso|1000.00|manual|Vecino (prueba)|Venta de 2 cabezas (LV Novillos)|true');
select pruebas.espera_valor('P02 Idempotente: el mismo envío otra vez no duplica',
  $q$ select (public.cargar_precio_actividad(pruebas.id('pp1'), pruebas.id('v3'), pruebas.precio(1000, 'USD', null, 'pendiente')) = pruebas.id('pp1'))::text
          || '|' || (select count(*) from public.movimientos_economicos where actividad_id = pruebas.id('v3')) $q$, 'true|1');
select pruebas.espera_error('P03 Precio cargado dos veces (otro envío): rechazado',
  $q$ select public.cargar_precio_actividad(gen_random_uuid(), pruebas.id('v3'), pruebas.precio(1500, 'USD', null, 'pendiente')) $q$, '22023');
select pruebas.espera_error('P04 Precio a una venta que ya lo tiene',
  $q$ select public.cargar_precio_actividad(gen_random_uuid(), pruebas.id('v1'), pruebas.precio(1, 'USD', null, 'pagado')) $q$, '22023');
select pruebas.guardar('pe', $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('novillos'), 'cabezas', 10, 'peso_vivo_total_kg', 4000))) $q$);
select pruebas.espera_error('P05 Una pesada no lleva precio',
  $q$ select public.cargar_precio_actividad(gen_random_uuid(), pruebas.id('pe'), pruebas.precio(1, 'USD', null, 'pagado')) $q$, '22023');
select pruebas.espera_valor('S02 Con el precio cargado, deja de figurar sin precio',
  $q$ select count(*)::text from public.v_compraventas_sin_precio where actividad_id = pruebas.id('v3') $q$, '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Carga manual
-- ════════════════════════════════════════════════════════════════════════════

select set_config('test.m1', gen_random_uuid()::text, false);
select pruebas.preparar('m1', $q$ select public.registrar_movimiento(pruebas.id('m1'), pruebas.id('est_a'), pruebas.d(10), 'egreso', pruebas.id('r_general'),
      'Sueldos', pruebas.precio(2000, 'USD', null, 'pendiente')) $q$);
select pruebas.espera_valor('M01 Gasto manual: Sueldos, 2.000 USD, pendiente, rubro General',
  $q$ select m.sentido || '|' || m.monto_usd || '|' || m.estado || '|' || m.origen || '|' || r.nombre
      from public.movimientos_economicos m join public.rubros r on r.id = m.rubro_id where m.id = pruebas.id('m1') $q$,
  'egreso|2000.00|pendiente|manual|General');
select pruebas.espera_valor('M02 Idempotente',
  $q$ select (public.registrar_movimiento(pruebas.id('m1'), pruebas.id('est_a'), pruebas.d(10), 'egreso', pruebas.id('r_general'), 'Sueldos',
              pruebas.precio(2000, 'USD', null, 'pendiente')) = pruebas.id('m1'))::text
          || '|' || (select count(*) from public.movimientos_economicos where concepto = 'Sueldos' and establecimiento_id = pruebas.id('est_a')) $q$, 'true|1');
select pruebas.espera_error('M03 Pesos sin tipo de cambio',
  $q$ select public.registrar_movimiento(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(1), 'egreso', pruebas.id('r_general'), 'X',
      pruebas.precio(100, 'UYU', null, 'pagado')) $q$, '22023');
select pruebas.espera_error('M04 Monto cero',
  $q$ select public.registrar_movimiento(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(1), 'egreso', pruebas.id('r_general'), 'X',
      pruebas.precio(0, 'USD', null, 'pagado')) $q$, '22023');
select pruebas.espera_error('M05 Rubro de otro establecimiento',
  $q$ select public.registrar_movimiento(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(1), 'egreso', pruebas.id('r_x'), 'X',
      pruebas.precio(100, 'USD', null, 'pagado')) $q$, '22023');
select pruebas.espera_error('M06 Fecha futura',
  $q$ select public.registrar_movimiento(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(-1), 'egreso', pruebas.id('r_general'), 'X',
      pruebas.precio(100, 'USD', null, 'pagado')) $q$, '22023');
select pruebas.espera_error('M07 Pendiente con fecha de pago',
  $q$ select public.registrar_movimiento(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(1), 'egreso', pruebas.id('r_general'), 'X',
      pruebas.precio(100, 'USD', null, 'pendiente', pruebas.d(1))) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Marcar pagado y anular
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_ok('K01 Marcar pagado el gasto manual',
  $q$ select public.marcar_pagado(pruebas.id('m1'), pruebas.d(5)) $q$);
select pruebas.espera_valor('K02 Quedó pagado con su fecha',
  $q$ select estado || '|' || (fecha_pago = pruebas.d(5))::text from public.movimientos_economicos where id = pruebas.id('m1') $q$, 'pagado|true');
select pruebas.espera_error('K03 Ya pagado: no se vuelve a marcar',
  $q$ select public.marcar_pagado(pruebas.id('m1'), pruebas.d(4)) $q$, '22023');
select pruebas.espera_error('K04 Fecha de pago anterior al movimiento',
  $q$ select public.marcar_pagado(pruebas.mov('v1'), pruebas.d(25)) $q$, '22023');

select pruebas.guardar('m2', $q$ select public.registrar_movimiento(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(8), 'egreso', pruebas.id('r_general'),
      'Insumos', pruebas.precio(300, 'USD', null, 'pendiente')) $q$);
select pruebas.espera_ok('A01 Anular un movimiento manual',
  $q$ select public.anular_movimiento(pruebas.id('m2'), 'Cargado dos veces') $q$);
select pruebas.espera_error('A02 Ya anulado',
  $q$ select public.anular_movimiento(pruebas.id('m2'), 'Otra vez') $q$, '22023');
select pruebas.espera_error('A03 Un anulado no se marca pagado',
  $q$ select public.marcar_pagado(pruebas.id('m2'), pruebas.d(1)) $q$, '22023');
select pruebas.espera_error('A04 El movimiento de una venta no se anula solo (se anula la actividad)',
  $q$ select public.anular_movimiento(pruebas.mov('v1'), 'Prueba') $q$, '22023');
select pruebas.espera_ok('A05 Anular la compra c1',
  $q$ select public.anular_actividad(pruebas.id('c1'), 'Cargada por error') $q$);
select pruebas.espera_valor('A06 Su movimiento quedó anulado',
  $q$ select (anulado_en is not null)::text from public.movimientos_economicos where actividad_id = pruebas.id('c1') $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Resultado y pendientes
-- ════════════════════════════════════════════════════════════════════════════
-- Vacunos: ingresos 15.000 (v1) + 15.000 (v2) + 1.000 (v3) = 31.000; egresos 20.000 (c2; c1 anulada) → 11.000.
-- General: egresos 2.000 (m1; m2 anulado) → -2.000.

select pruebas.espera_valor('R01 Resultado por rubro (devengado, sin anulados)',
  $q$ select string_agg(rubro || ':' || i || '/' || e || '/' || r, ' ' order by rubro) from (
        select rubro, sum(ingresos_usd)::numeric(14,2) as i, sum(egresos_usd)::numeric(14,2) as e, sum(resultado_usd)::numeric(14,2) as r
        from public.v_resultado_rubro where establecimiento_id = pruebas.id('est_a') group by rubro) x $q$,
  'General:0.00/2000.00/-2000.00 Vacunos:31000.00/20000.00/11000.00');
select pruebas.espera_valor('R02 Pendientes: por cobrar v1, v2 y v3 (31.000); nada por pagar',
  $q$ select string_agg(sentido || ':' || n || ':' || t, ' ') from (
        select sentido, count(*) as n, sum(monto_usd)::numeric(14,2) as t from public.v_movimientos_pendientes
        where establecimiento_id = pruebas.id('est_a') group by sentido) x $q$, 'ingreso:3:31000.00');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Permisos: Consulta no ve plata
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_valor('Q01 Consulta: movimientos, resultado, pendientes y sin precio vacíos',
  $q$ select (select count(*) from public.movimientos_economicos where establecimiento_id = pruebas.id('est_a')) || '|'
          || (select count(*) from public.v_resultado_rubro where establecimiento_id = pruebas.id('est_a')) || '|'
          || (select count(*) from public.v_movimientos_pendientes where establecimiento_id = pruebas.id('est_a')) || '|'
          || (select count(*) from public.v_compraventas_sin_precio where establecimiento_id = pruebas.id('est_a')) $q$, '0|0|0|0');
select pruebas.espera_valor('Q02 Consulta ve la venta, su contraparte y sus cabezas, pero no el precio',
  $q$ select coalesce(monto_usd::text, 'sin precio') || '|' || contraparte || '|' || cabezas from public.v_actividades where id = pruebas.id('v1') $q$,
  'sin precio|Frigorífico (prueba)|5');
select pruebas.espera_error('Q03 Consulta no carga movimientos',
  $q$ select public.registrar_movimiento(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(1), 'egreso', pruebas.id('r_general'), 'X',
      pruebas.precio(100, 'USD', null, 'pagado')) $q$, '42501');
select pruebas.espera_error('Q04 Consulta no marca pagado',
  $q$ select public.marcar_pagado(pruebas.id('pp1'), pruebas.d(1)) $q$, '42501');

select pruebas.como('u_ajeno');
select pruebas.espera_error('X01 Un operador de otro establecimiento no carga movimientos en Santa Remigia',
  $q$ select public.registrar_movimiento(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(1), 'egreso', pruebas.id('r_general'), 'X',
      pruebas.precio(100, 'USD', null, 'pagado')) $q$, '42501');
select pruebas.espera_valor('X02 ...ni los ve',
  $q$ select count(*)::text from public.movimientos_economicos where establecimiento_id = pruebas.id('est_a') $q$, '0');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no carga movimientos',
  $q$ select public.registrar_movimiento(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(1), 'egreso', pruebas.id('r_general'), 'X',
      pruebas.precio(100, 'USD', null, 'pagado')) $q$, '42501');
select pruebas.espera_error('N02 anon no lee el resultado',
  $q$ select count(*) from public.v_resultado_rubro $q$, '42501');

reset role;
select pruebas.espera_error('Z01 El índice único impide un segundo movimiento vigente para la misma actividad (aun como postgres)',
  $q$ insert into public.movimientos_economicos (establecimiento_id, fecha, sentido, rubro_id, concepto, monto_original, moneda_original, estado, actividad_id)
      values (pruebas.id('est_a'), pruebas.d(15), 'ingreso', pruebas.id('r_vacunos'), 'Duplicado', 1, 'USD', 'pendiente', pruebas.id('v3')) $q$, '23505');

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS ETAPA 7B (ECONOMÍA): % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
