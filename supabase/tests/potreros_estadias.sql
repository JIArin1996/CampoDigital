-- Campo Digital v2 — Pruebas de potreros: estadías de los lotes (historial de potrero) y forma para el mapa
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261024000100_potreros_estadias_y_forma).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo (o node correr-pruebas.mjs potreros).
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS POTREROS (ESTADÍAS Y FORMA): N OK, ...", que deshace todo.
--      El resultado esperado es "66 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días. En las estadías, "60-10" = entró
-- hace 60 días y salió hace 10; "abierta" = sigue adentro.
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

-- Línea {categoria_id, cabezas}, lote por nombre y forma cuadrada (GeoJSON) entre dos longitudes y dos latitudes
create function pruebas.lin(p_cat text, p_cabezas int) returns jsonb language sql stable as $$
  select jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas)
$$;
create function pruebas.lote(p_nombre text) returns uuid language sql stable as $$
  select id from public.lotes where nombre = p_nombre and establecimiento_id = pruebas.id('est_a')
$$;
create function pruebas.cuadro(x1 numeric, x2 numeric, y1 numeric, y2 numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'Polygon', 'coordinates',
    jsonb_build_array(jsonb_build_array(jsonb_build_array(x1, y1), jsonb_build_array(x2, y1), jsonb_build_array(x2, y2),
                                        jsonb_build_array(x1, y2), jsonb_build_array(x1, y1))))
$$;
-- Estadías de un lote: "potrero ingreso-salida cerrada_por origen", en días antes de hoy, de la más vieja a la más nueva
create function pruebas.estadias(p_lote text) returns text language sql stable as $$
  select string_agg(p.nombre || ' ' || (public.fecha_hoy() - e.fecha_ingreso) || '-'
                    || coalesce((public.fecha_hoy() - e.fecha_salida)::text, 'abierta') || ' ' || coalesce(e.cerrada_por, '-')
                    || ' ' || e.origen || case when e.anulada_en is not null then ' ANULADA' else '' end,
                    ', ' order by e.fecha_ingreso, e.created_at)
  from public.lote_estadias e join public.potreros p on p.id = e.potrero_id
  where e.lote_id = pruebas.id(p_lote)
$$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 postgis y btree_gist instaladas en el esquema extensions',
  $q$ select string_agg(e.extname || ':' || n.nspname, ' ' order by e.extname)
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname in ('btree_gist', 'postgis') $q$,
  'btree_gist:extensions postgis:extensions');
select pruebas.espera_valor('B02 lote_estadias: RLS, solo lectura para authenticated, nada para anon, sin superposición y una abierta por lote',
  $q$ select (c.relrowsecurity
          and has_table_privilege('authenticated', 'public.lote_estadias', 'select')
          and not has_table_privilege('authenticated', 'public.lote_estadias', 'insert')
          and not has_table_privilege('authenticated', 'public.lote_estadias', 'update')
          and not has_table_privilege('anon', 'public.lote_estadias', 'select')
          and exists (select 1 from pg_constraint k where k.conname = 'lote_estadias_sin_superposicion' and k.contype = 'x')
          and exists (select 1 from pg_indexes i where i.indexname = 'lote_estadias_una_abierta'))::text
      from pg_class c where c.oid = 'public.lote_estadias'::regclass $q$, 'true');
select pruebas.espera_valor('B03 Funciones nuevas: search_path fijo, nada para anon; de la API para authenticated, internas y de trigger no; security definer donde corresponde',
  $q$ select count(*) filter (where coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('anon', p.oid, 'execute')
              and has_function_privilege('authenticated', p.oid, 'execute')
                  = (p.proname in ('cambiar_potrero_lote', 'deshacer_cambio_potrero', 'guardar_forma_potrero', 'potreros_superpuestos'))
              and p.prosecdef = (p.proname in ('cambiar_potrero_lote', 'deshacer_cambio_potrero', 'guardar_forma_potrero',
                                               'sincronizar_potrero_lote', 'estadia_alta_lote', 'estadia_cambio_estado_lote')))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('cambiar_potrero_lote', 'deshacer_cambio_potrero', 'guardar_forma_potrero', 'potreros_superpuestos',
                          'validar_estadia', '_sincronizar_potrero_lote', 'sincronizar_potrero_lote', 'estadia_alta_lote',
                          'estadia_cambio_estado_lote', 'proteger_potrero_ocupado') $q$, '10/10');
select pruebas.espera_valor('B04 Ni lotes.potrero_id ni potreros.forma se escriben directo (las notas del lote sí)',
  $q$ select (not has_column_privilege('authenticated', 'public.lotes', 'potrero_id', 'update')
          and has_column_privilege('authenticated', 'public.lotes', 'notas', 'update')
          and not has_column_privilege('authenticated', 'public.potreros', 'forma', 'update')
          and not has_column_privilege('authenticated', 'public.potreros', 'forma', 'insert'))::text $q$, 'true');
select pruebas.espera_valor('B05 v_potreros_mapa con security_invoker; authenticated la lee, anon no',
  $q$ select (exists (select 1 from pg_class c where c.oid = 'public.v_potreros_mapa'::regclass and 'security_invoker=true' = any (c.reloptions))
          and has_table_privilege('authenticated', 'public.v_potreros_mapa', 'select')
          and not has_table_privilege('anon', 'public.v_potreros_mapa', 'select'))::text $q$, 'true');
select pruebas.espera_valor('B06 Datos existentes: todo lote activo tiene en potrero_id el potrero de su estadía abierta (0 diferencias)',
  $q$ select count(*)::text from public.lotes l
      where l.estado = 'activo'
        and l.potrero_id is distinct from (select e.potrero_id from public.lote_estadias e
                                           where e.lote_id = l.id and e.fecha_salida is null and e.anulada_en is null) $q$, '0');

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
select pruebas.guardar('vacunos',    $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('novillos',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('terneros',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros' $q$);
select pruebas.guardar('vacas_cria', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Vacas de cría' $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: potreros y alta de un lote con potrero
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');
select pruebas.guardar('P1', $q$ insert into public.potreros (establecimiento_id, nombre, superficie) values (pruebas.id('est_a'), 'Potrero 1', 50) returning id $q$);
select pruebas.guardar('P2', $q$ insert into public.potreros (establecimiento_id, nombre, superficie) values (pruebas.id('est_a'), 'Potrero 2', 40) returning id $q$);
select pruebas.guardar('P3', $q$ insert into public.potreros (establecimiento_id, nombre, superficie) values (pruebas.id('est_a'), 'Potrero 3', 30) returning id $q$);
select pruebas.guardar('P4', $q$ insert into public.potreros (establecimiento_id, nombre, superficie) values (pruebas.id('est_a'), 'Potrero 4', 20) returning id $q$);
select pruebas.guardar('P5', $q$ insert into public.potreros (establecimiento_id, nombre, superficie) values (pruebas.id('est_a'), 'Potrero 5', 10) returning id $q$);
select pruebas.guardar('PX', $q$ insert into public.potreros (establecimiento_id, nombre, superficie, estado)
      values (pruebas.id('est_a'), 'Potrero viejo', 5, 'inactivo') returning id $q$);

select pruebas.guardar('L1', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'L1', p_fecha_apertura => pruebas.d(60), p_composicion => pruebas.comp('novillos', 20), p_potrero_id => pruebas.id('P1')) $q$);
select pruebas.espera_valor('A01 Alta con potrero: una estadía abierta desde la apertura (origen alta) y lotes.potrero_id igual',
  $q$ select pruebas.estadias('L1') || '|' || (select (potrero_id = pruebas.id('P1'))::text from public.lotes where id = pruebas.id('L1')) $q$,
  'Potrero 1 60-abierta - alta|true');
select pruebas.espera_error('A02 No se crea un lote en un potrero inactivo',
  $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'Lx', p_fecha_apertura => pruebas.d(5), p_composicion => pruebas.comp('novillos', 1), p_potrero_id => pruebas.id('PX')) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Cambios de potrero y superposiciones
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_ok('C01 Sale de Potrero 1 y entra a Potrero 2 el mismo día',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P2'), pruebas.d(10), pruebas.d(10), 'Rotación') $q$);
select pruebas.espera_valor('C02 Potrero 1 cerrado por el cambio y Potrero 2 abierto desde ese día; lotes.potrero_id = Potrero 2',
  $q$ select pruebas.estadias('L1') || '|' || (select (potrero_id = pruebas.id('P2'))::text from public.lotes where id = pruebas.id('L1')) $q$,
  'Potrero 1 60-10 cambio alta, Potrero 2 10-abierta - manual|true');
select pruebas.espera_error('C03 Salida retroactiva anterior al ingreso al potrero actual (se superpondría)',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P3'), pruebas.d(20), pruebas.d(20)) $q$, '22023');
select pruebas.espera_error('C04 Ingreso anterior a la salida',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P3'), pruebas.d(5), pruebas.d(6)) $q$, '22023');
select pruebas.espera_error('C05 Al mismo potrero en el que está',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P2'), pruebas.d(5), pruebas.d(5)) $q$, '22023');
select pruebas.espera_error('C06 Fechas futuras',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P3'), pruebas.d(-1), pruebas.d(-1)) $q$, '22023');

-- Restricciones de la tabla, con escrituras directas (postgres): L9 es un lote sin potrero
select pruebas.guardar('L9', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'L9', p_fecha_apertura => pruebas.d(30), p_composicion => pruebas.comp('novillos', 1)) $q$);
reset role;
select pruebas.espera_error('C07 Estadía retroactiva que se superpone con otra del mismo lote: la rechaza la restricción',
  $q$ insert into public.lote_estadias (establecimiento_id, lote_id, potrero_id, fecha_ingreso, fecha_salida, origen, cerrada_por, salida_registrada_en)
      values (pruebas.id('est_a'), pruebas.id('L1'), pruebas.id('P3'), pruebas.d(40), pruebas.d(30), 'manual', 'cambio', now()) $q$, '23P01');
select pruebas.espera_error('C08 Estadía cargada a mano de cero días (ingreso y salida el mismo día): no',
  $q$ insert into public.lote_estadias (establecimiento_id, lote_id, potrero_id, fecha_ingreso, fecha_salida, origen, cerrada_por, salida_registrada_en)
      values (pruebas.id('est_a'), pruebas.id('L9'), pruebas.id('P3'), pruebas.d(5), pruebas.d(5), 'manual', 'cambio', now()) $q$, '23514');
select pruebas.espera_ok('C09 Estadía de cero días cerrada por el cierre del lote (rango vacío): sí',
  $q$ insert into public.lote_estadias (establecimiento_id, lote_id, potrero_id, fecha_ingreso, fecha_salida, origen, cerrada_por, salida_registrada_en)
      values (pruebas.id('est_a'), pruebas.id('L9'), pruebas.id('P3'), pruebas.d(5), pruebas.d(5), 'alta', 'cierre', now()) $q$);
select pruebas.espera_ok('C10 ...y el rango vacío no choca con otra estadía que empieza ese mismo día',
  $q$ insert into public.lote_estadias (establecimiento_id, lote_id, potrero_id, fecha_ingreso, origen)
      values (pruebas.id('est_a'), pruebas.id('L9'), pruebas.id('P4'), pruebas.d(5), 'manual') $q$);
set local role authenticated;
select pruebas.como('u_operador');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Sin potrero y deshacer
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('S01 Sale a "sin potrero" (corral): no abre estadía nueva',
  $q$ select coalesce(public.cambiar_potrero_lote(pruebas.id('L1'), null, pruebas.d(3), null, 'Al corral')::text, 'sin estadía nueva') $q$,
  'sin estadía nueva');
select pruebas.espera_valor('S02 Queda sin potrero y sin estadía abierta',
  $q$ select coalesce(potrero_id::text, 'sin potrero') || '|' || pruebas.estadias('L1') from public.lotes where id = pruebas.id('L1') $q$,
  'sin potrero|Potrero 1 60-10 cambio alta, Potrero 2 10-3 cambio manual');
select pruebas.espera_error('S03 Vuelve a entrar con fecha anterior a la última salida',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P3'), null, pruebas.d(4)) $q$, '22023');
select pruebas.espera_ok('S04 Vuelve a entrar dos días después (días sin potrero en el medio)',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P3'), null, pruebas.d(1)) $q$);

select pruebas.espera_ok('U01 Deshacer el último cambio (la entrada a Potrero 3)',
  $q$ select public.deshacer_cambio_potrero(pruebas.id('L1'), 'Me equivoqué') $q$);
select pruebas.espera_valor('U02 Potrero 3 queda anulada y el lote, sin potrero',
  $q$ select coalesce(potrero_id::text, 'sin potrero') || '|' || pruebas.estadias('L1') from public.lotes where id = pruebas.id('L1') $q$,
  'sin potrero|Potrero 1 60-10 cambio alta, Potrero 2 10-3 cambio manual, Potrero 3 1-abierta - manual ANULADA');
select pruebas.espera_ok('U03 Deshacer otra vez (la salida a sin potrero)',
  $q$ select public.deshacer_cambio_potrero(pruebas.id('L1')) $q$);
select pruebas.espera_valor('U04 Potrero 2 vuelve a estar abierta, la misma estadía',
  $q$ select (potrero_id = pruebas.id('P2'))::text || '|' || pruebas.estadias('L1') from public.lotes where id = pruebas.id('L1') $q$,
  'true|Potrero 1 60-10 cambio alta, Potrero 2 10-abierta - manual, Potrero 3 1-abierta - manual ANULADA');
select pruebas.espera_ok('U05 Deshacer otra vez (el paso de Potrero 1 a Potrero 2)',
  $q$ select public.deshacer_cambio_potrero(pruebas.id('L1')) $q$);
select pruebas.espera_valor('U06 Potrero 2 anulada y Potrero 1 reabierta',
  $q$ select (potrero_id = pruebas.id('P1'))::text || '|' || pruebas.estadias('L1') from public.lotes where id = pruebas.id('L1') $q$,
  'true|Potrero 1 60-abierta - alta, Potrero 2 10-abierta - manual ANULADA, Potrero 3 1-abierta - manual ANULADA');
select pruebas.espera_error('U07 El alta no se deshace',
  $q$ select public.deshacer_cambio_potrero(pruebas.id('L1')) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Dividir y unir escriben estadías
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.preparar('div', $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(2),
      jsonb_build_array(jsonb_build_object('nombre', 'L1b Dividido', 'potrero_id', pruebas.id('P3'), 'composicion', pruebas.comp('novillos', 5)))) $q$);
select pruebas.guardar('L1b', $q$ select pruebas.lote('L1b Dividido') $q$);
select pruebas.espera_valor('V01 Dividir: el lote nuevo entra a su potrero el día de la división; el origen sigue en el suyo',
  $q$ select pruebas.estadias('L1b') || '|' || (select (potrero_id = pruebas.id('P1'))::text from public.lotes where id = pruebas.id('L1')) $q$,
  'Potrero 3 2-abierta - alta|true');
select pruebas.guardar('L3', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'L3', p_fecha_apertura => pruebas.d(30), p_composicion => pruebas.comp('novillos', 4), p_potrero_id => pruebas.id('P3')) $q$);
select pruebas.espera_ok('V02 Unir L1b y L3 en un lote nuevo en Potrero 2',
  $q$ select public.unir_lotes(array[pruebas.id('L1b'), pruebas.id('L3')], pruebas.d(1), null,
      jsonb_build_object('nombre', 'LU Unidos', 'potrero_id', pruebas.id('P2'))) $q$);
select pruebas.guardar('LU', $q$ select pruebas.lote('LU Unidos') $q$);
select pruebas.espera_valor('V03 Los orígenes cierran su estadía el día de la unión (y conservan el potrero); el nuevo entra a Potrero 2',
  $q$ select pruebas.estadias('L1b') || ' / ' || pruebas.estadias('L3') || ' / ' || pruebas.estadias('LU') || '|'
          || (select (potrero_id = pruebas.id('P3'))::text from public.lotes where id = pruebas.id('L1b')) $q$,
  'Potrero 3 2-1 cierre alta / Potrero 3 30-1 cierre alta / Potrero 2 1-abierta - alta|true');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Cerrar y reabrir a mano
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('L2', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'L2', p_fecha_apertura => pruebas.d(40), p_composicion => pruebas.comp('novillos', 5), p_potrero_id => pruebas.id('P5')) $q$);
select pruebas.preparar('aj_L2', $q$ select public.registrar_ajuste(pruebas.id('L2'), pruebas.id('novillos'), -5, pruebas.d(20), 'Conteo') $q$);
select pruebas.espera_ok('R00 Cerrar L2',
  $q$ select public.cerrar_lote(pruebas.id('L2'), pruebas.d(15), 'Vacío') $q$);
select pruebas.espera_valor('R01 El cierre cierra la estadía con su fecha; el lote cerrado conserva el potrero',
  $q$ select pruebas.estadias('L2') || '|' || (select (potrero_id = pruebas.id('P5'))::text from public.lotes where id = pruebas.id('L2')) $q$,
  'Potrero 5 40-15 cierre alta|true');
select pruebas.espera_ok('R02 Reabrir a mano',
  $q$ select public.reabrir_lote(pruebas.id('L2'), pruebas.d(5), 'Vuelve') $q$);
select pruebas.espera_valor('R03 Estadía NUEVA desde la reapertura en el mismo potrero; la vieja sigue cerrada',
  $q$ select pruebas.estadias('L2') || '|' || (select (potrero_id = pruebas.id('P5'))::text from public.lotes where id = pruebas.id('L2')) $q$,
  'Potrero 5 40-15 cierre alta, Potrero 5 5-abierta - reapertura|true');
select pruebas.espera_error('R04 Cerrar con fecha anterior al ingreso al potrero actual',
  $q$ select public.cerrar_lote(pruebas.id('L2'), pruebas.d(10)) $q$, '22023');
select pruebas.preparar('cierre2', $q$ select public.cerrar_lote(pruebas.id('L2'), pruebas.d(2)) $q$);
select pruebas.preparar('baja_P5', $q$ update public.potreros set estado = 'inactivo' where id = pruebas.id('P5') $q$);
select pruebas.preparar('reabre2', $q$ select public.reabrir_lote(pruebas.id('L2'), pruebas.d(1)) $q$);
select pruebas.espera_valor('R05 Reabrir con el potrero inactivo: queda sin potrero y sin estadía abierta',
  $q$ select coalesce(potrero_id::text, 'sin potrero') || '|'
          || (select count(*) from public.lote_estadias e where e.lote_id = pruebas.id('L2') and e.fecha_salida is null and e.anulada_en is null)
      from public.lotes where id = pruebas.id('L2') $q$, 'sin potrero|0');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Destete y su anulación
-- ════════════════════════════════════════════════════════════════════════════
-- LC: 3 terneros de una parición a un lote nuevo en Potrero 3. Se destetan a LD (Potrero 2) y se anula.

select pruebas.guardar('LM', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LM Vacas', p_fecha_apertura => pruebas.d(200), p_composicion => pruebas.comp('vacas_cria', 10), p_potrero_id => pruebas.id('P2')) $q$);
select pruebas.guardar('pa', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'),
      p_fecha => pruebas.d(100), p_lineas => pruebas.comp('terneros', 3),
      p_lote_cria_nuevo => jsonb_build_object('nombre', 'LC Cría', 'potrero_id', pruebas.id('P3'))) $q$);
select pruebas.guardar('LC', $q$ select lote_cria_id from public.act_paricion where actividad_id = pruebas.id('pa') $q$);
select pruebas.guardar('LC_est', $q$ select id from public.lote_estadias where lote_id = pruebas.id('LC') $q$);
select pruebas.espera_valor('D00 Parición a un lote nuevo: entra a su potrero el día de la parición',
  $q$ select pruebas.estadias('LC') $q$, 'Potrero 3 100-abierta - alta');

select set_config('test.dest', gen_random_uuid()::text, false);
select pruebas.preparar('dest_reg', $q$ select public.registrar_destete(pruebas.id('dest'), pruebas.id('est_a'), pruebas.d(10),
      jsonb_build_array(jsonb_build_object('lote_id', pruebas.id('LC'), 'lineas', jsonb_build_array(pruebas.lin('terneros', 3)))),
      jsonb_build_array(jsonb_build_object('nombre', 'LD Destetados', 'potrero_id', pruebas.id('P2'),
                                           'lineas', jsonb_build_array(pruebas.lin('terneros', 3))))) $q$);
select pruebas.guardar('LD', $q$ select pruebas.lote('LD Destetados') $q$);
select pruebas.espera_valor('D01 Destete: LC se cierra y cierra su estadía; LD entra a Potrero 2 el día del destete',
  $q$ select (select estado from public.lotes where id = pruebas.id('LC')) || '|' || pruebas.estadias('LC') || ' / ' || pruebas.estadias('LD') $q$,
  'cerrado|Potrero 3 100-10 cierre alta / Potrero 2 10-abierta - alta');
select pruebas.espera_ok('D02 Anular el destete',
  $q$ select public.anular_actividad(pruebas.id('dest'), 'Prueba') $q$);
select pruebas.espera_valor('D03 Anulación: LC se reabre en la MISMA estadía (abierta otra vez); LD se cierra con la suya',
  $q$ select (select estado from public.lotes where id = pruebas.id('LC')) || '|'
          || (select (fecha_salida is null and cerrada_por is null)::text from public.lote_estadias where id = pruebas.id('LC_est')) || '|'
          || pruebas.estadias('LC') || ' / ' || (select estado from public.lotes where id = pruebas.id('LD')) || ' ' || pruebas.estadias('LD') $q$,
  'activo|true|Potrero 3 100-abierta - alta / cerrado Potrero 2 10-10 cierre alta');

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Desactivar y reactivar potreros
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('K01 No se desactiva un potrero con lotes adentro (Potrero 1 tiene a L1)',
  $q$ update public.potreros set estado = 'inactivo' where id = pruebas.id('P1') $q$, '22023');
select pruebas.preparar('L1_afuera', $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), null, public.fecha_hoy(), null) $q$);
select pruebas.espera_filas('K02 Con el lote afuera, se desactiva',
  $q$ update public.potreros set estado = 'inactivo' where id = pruebas.id('P1') $q$, 1);
select pruebas.espera_filas('K03 Y se reactiva',
  $q$ update public.potreros set estado = 'activo' where id = pruebas.id('P1') $q$, 1);
select pruebas.espera_error('K04 No se mueve un lote a un potrero inactivo',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('PX'), null, public.fecha_hoy()) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Forma del potrero
-- ════════════════════════════════════════════════════════════════════════════
-- Potrero 1: 0,01° × 0,01° cerca de Durazno (≈ 103 ha). Potrero 2: corrido media celda (se pisan ≈ 52 ha).
-- Potrero 3: debajo de los dos, comparte el alambrado (no se superpone).

select pruebas.espera_valor('F01 Guardar la forma devuelve el área geodésica (≈ 103 ha) sin tocar la superficie cargada',
  $q$ select (public.guardar_forma_potrero(pruebas.id('P1'), pruebas.cuadro(-56.50, -56.49, -33.00, -32.99)) between 100 and 107)::text $q$, 'true');
select pruebas.espera_valor('F02 La superficie sigue siendo 50',
  $q$ select superficie::text from public.potreros where id = pruebas.id('P1') $q$, '50.00');
select pruebas.preparar('forma_sup', $q$ select public.guardar_forma_potrero(pruebas.id('P1'), pruebas.cuadro(-56.50, -56.49, -33.00, -32.99), true) $q$);
select pruebas.espera_valor('F03 Con "usar el área", la superficie pasa a ser el área; el mapa la devuelve como MultiPolygon con su etiqueta',
  $q$ select (superficie = area_ha and area_ha between 100 and 107)::text || '|' || (forma ->> 'type') || '|' || (etiqueta ->> 'type')
      from public.v_potreros_mapa where id = pruebas.id('P1') $q$, 'true|MultiPolygon|Point');
select pruebas.espera_error('F04 Un GeoJSON roto',
  $q$ select public.guardar_forma_potrero(pruebas.id('P2'), '{"type": "Polygon", "coordinates": "x"}'::jsonb) $q$, '22023');
select pruebas.espera_error('F05 Una línea no es un potrero',
  $q$ select public.guardar_forma_potrero(pruebas.id('P2'), '{"type": "LineString", "coordinates": [[-56.5, -33.0], [-56.4, -33.0]]}'::jsonb) $q$, '22023');
select pruebas.preparar('forma_P2', $q$ select public.guardar_forma_potrero(pruebas.id('P2'), pruebas.cuadro(-56.495, -56.485, -33.00, -32.99)) $q$);
select pruebas.espera_valor('F06 Potreros que se superponen: un par, ≈ 52 ha',
  $q$ select count(*) || '|' || (min(hectareas) between 45 and 56)::text from public.potreros_superpuestos(pruebas.id('est_a')) $q$, '1|true');
select pruebas.preparar('forma_P3', $q$ select public.guardar_forma_potrero(pruebas.id('P3'), pruebas.cuadro(-56.50, -56.49, -33.01, -33.00)) $q$);
select pruebas.espera_valor('F07 Compartir un alambrado no es superponerse: sigue habiendo un solo par',
  $q$ select count(*)::text from public.potreros_superpuestos(pruebas.id('est_a')) $q$, '1');
select pruebas.espera_valor('F08 Borrar la forma (null): el potrero queda sin dibujar',
  $q$ select coalesce(public.guardar_forma_potrero(pruebas.id('P3'), null)::text, 'sin dibujar') $q$, 'sin dibujar');

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Permisos
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('O01 Operador: UPDATE directo a lotes.potrero_id, rechazado',
  $q$ update public.lotes set potrero_id = pruebas.id('P4') where id = pruebas.id('L1') $q$, '42501');
select pruebas.espera_error('O02 Operador: insert directo en lote_estadias, rechazado',
  $q$ insert into public.lote_estadias (establecimiento_id, lote_id, potrero_id, fecha_ingreso, origen)
      values (pruebas.id('est_a'), pruebas.id('L1'), pruebas.id('P4'), public.fecha_hoy(), 'manual') $q$, '42501');

select pruebas.como('u_consulta');
select pruebas.espera_valor('Q01 Consulta ve las estadías',
  $q$ select (count(*) > 0)::text from public.lote_estadias where establecimiento_id = pruebas.id('est_a') $q$, 'true');
select pruebas.espera_error('Q02 Consulta no cambia lotes de potrero',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P4'), null, public.fecha_hoy()) $q$, '42501');
select pruebas.espera_error('Q03 Consulta no deshace',
  $q$ select public.deshacer_cambio_potrero(pruebas.id('L1')) $q$, '42501');
select pruebas.espera_error('Q04 Consulta no dibuja potreros',
  $q$ select public.guardar_forma_potrero(pruebas.id('P4'), pruebas.cuadro(-56.40, -56.39, -33.00, -32.99)) $q$, '42501');
select pruebas.espera_error('Q05 Consulta: UPDATE directo a lotes.potrero_id, rechazado',
  $q$ update public.lotes set potrero_id = null where id = pruebas.id('L1') $q$, '42501');

select pruebas.como('u_ajeno');
select pruebas.espera_valor('X01 Otro establecimiento no ve las estadías de Santa Remigia',
  $q$ select count(*)::text from public.lote_estadias where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_error('X02 ...ni mueve sus lotes',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P4'), null, public.fecha_hoy()) $q$, '42501');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no lee las estadías',
  $q$ select count(*) from public.lote_estadias $q$, '42501');
select pruebas.espera_error('N02 anon no lee el mapa',
  $q$ select count(*) from public.v_potreros_mapa $q$, '42501');
select pruebas.espera_error('N03 anon no cambia lotes de potrero',
  $q$ select public.cambiar_potrero_lote(pruebas.id('L1'), pruebas.id('P4'), null, public.fecha_hoy()) $q$, '42501');

reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- 12. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS POTREROS (ESTADÍAS Y FORMA): % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
