-- Campo Digital v2 — Pruebas de responsables: personas sin usuario, administradores y varios por registro
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261028000100_responsables).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS RESPONSABLES: N OK, ...", que deshace todo.
--      El resultado esperado es "47 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia,
-- X = operador de otro campo (en el medio pasa un rato a administrador).

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

-- Línea de una actividad: {"categoria_id", "cabezas"}
create function pruebas.lin(p_cat text, p_cabezas int) returns jsonb language sql stable as $$
  select jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas)
$$;

-- Cuántos responsables tiene una nota o tarea
create function pruebas.resp_entrada(p_clave text) returns int language sql stable as $$
  select count(*)::int from public.bitacora_responsables where entrada_id = pruebas.id(p_clave)
$$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres): columnas, funciones y tablas
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 bitacora_entradas y actividades ya no tienen persona_id',
  $q$ select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name in ('bitacora_entradas', 'actividades') and column_name = 'persona_id' $q$, '0');
select pruebas.espera_valor('B02 Las 13 funciones de carga: una versión cada una, con p_responsables uuid[], security definer, search_path fijo, authenticated sí y anon no',
  $q$ select count(*) filter (where pg_get_function_identity_arguments(p.oid) like '%p_responsables uuid[]%'
              and pg_get_function_identity_arguments(p.oid) not like '%p_persona_id%'
              and p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('crear_entrada_bitacora', 'editar_entrada_bitacora', 'registrar_compra', 'registrar_destete',
                          'registrar_diagnostico', 'registrar_esquila', 'registrar_mortandad', 'registrar_paricion',
                          'registrar_personalizada', 'registrar_pesada', 'registrar_sanidad', 'registrar_servicio',
                          'registrar_venta') $q$, '13/13');
select pruebas.espera_valor('B03 Las 4 internas nuevas: search_path fijo, sin security definer y nadie las ejecuta por la API',
  $q$ select count(*) filter (where not p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_validar_responsables', '_guardar_responsables_entrada', '_guardar_responsables_actividad', '_fichas_de_admins') $q$, '4/4');
select pruebas.espera_valor('B04 Ninguna función usa p_persona_id ni _exigir_persona (que ya no existe)',
  $q$ select count(*)::text from pg_proc p
      where p.pronamespace = 'public'::regnamespace and (p.prosrc ~ 'p_persona_id|_exigir_persona' or p.proname = '_exigir_persona') $q$, '0');
select pruebas.espera_valor('B05 Tablas nuevas: con RLS; authenticated solo lee; anon nada',
  $q$ select bool_and(c.relrowsecurity
                      and has_table_privilege('authenticated', c.oid, 'select')
                      and not has_table_privilege('authenticated', c.oid, 'insert')
                      and not has_table_privilege('authenticated', c.oid, 'update')
                      and not has_table_privilege('authenticated', c.oid, 'delete')
                      and not has_table_privilege('anon', c.oid, 'select'))::text
      from pg_class c where c.oid in ('public.bitacora_responsables'::regclass, 'public.actividad_responsables'::regclass) $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador: fichas de administradores y personas que no son usuarios
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('vacunos',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('novillos', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('per_oper',  $q$ select id from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_operador') $q$);
select pruebas.guardar('per_ajeno', $q$ select id from public.personas where establecimiento_id = pruebas.id('est_x') and user_id = pruebas.id('u_ajeno') $q$);

select pruebas.espera_valor('A01 Al crear un establecimiento, el administrador queda con ficha activa (con su nombre) en los dos',
  $q$ select count(*) filter (where activo and nombre = 'Ana')::text || '/' || count(*) from public.personas
      where user_id = pruebas.id('u_admin') and establecimiento_id in (pruebas.id('est_a'), pruebas.id('est_x')) $q$, '2/2');
select pruebas.guardar('per_admin', $q$ select id from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_admin') $q$);

select pruebas.guardar('per_juan', $q$ insert into public.personas (establecimiento_id, nombre, rol)
      values (pruebas.id('est_a'), 'Juan Pérez', 'Peón') returning id $q$);
select pruebas.guardar('per_vete', $q$ insert into public.personas (establecimiento_id, nombre, rol)
      values (pruebas.id('est_a'), 'Dra. Silva', 'Veterinaria') returning id $q$);
select pruebas.espera_valor('A02 El administrador carga personas que no son usuarios (sin user_id)',
  $q$ select count(*)::text from public.personas where id in (pruebas.id('per_juan'), pruebas.id('per_vete')) and user_id is null and activo $q$, '2');
select pruebas.espera_error('A03 Otra persona activa con el mismo nombre (mayúsculas y espacios de más no cuentan)',
  $q$ insert into public.personas (establecimiento_id, nombre) values (pruebas.id('est_a'), '  JUAN PÉREZ ') $q$, '23505');
select pruebas.espera_ok('A04 El mismo nombre en otro establecimiento sí',
  $q$ insert into public.personas (establecimiento_id, nombre) values (pruebas.id('est_x'), 'Juan Pérez') $q$);
select pruebas.espera_error('A05 Nombre de más de 80 caracteres',
  $q$ insert into public.personas (establecimiento_id, nombre) values (pruebas.id('est_a'), repeat('n', 81)) $q$, '23514');
select pruebas.espera_error('A06 Rol de más de 60 caracteres',
  $q$ insert into public.personas (establecimiento_id, nombre, rol) values (pruebas.id('est_a'), 'Pedro', repeat('r', 61)) $q$, '23514');

-- Dar y sacar el rol de administrador
select pruebas.espera_ok('A07 Xavier pasa a administrador',
  $q$ select public.definir_admin(pruebas.id('u_ajeno'), true) $q$);
select pruebas.espera_valor('A08 Administrador: ficha activa en los dos establecimientos (la del otro campo ya estaba)',
  $q$ select count(*)::text from public.personas where user_id = pruebas.id('u_ajeno') and activo
        and establecimiento_id in (pruebas.id('est_a'), pruebas.id('est_x')) $q$, '2');
select pruebas.espera_ok('A09 Xavier deja de ser administrador',
  $q$ select public.definir_admin(pruebas.id('u_ajeno'), false) $q$);
select pruebas.espera_valor('A10 Sin el rol: inactiva en Santa Remigia (sin membresía), activa en el otro campo (es operador)',
  $q$ select (select activo from public.personas where user_id = pruebas.id('u_ajeno') and establecimiento_id = pruebas.id('est_a'))::text
          || '|' || (select activo from public.personas where user_id = pruebas.id('u_ajeno') and establecimiento_id = pruebas.id('est_x'))::text $q$,
  'false|true');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: notas y tareas con varios responsables
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');
select pruebas.espera_error('E01 El operador no carga personas',
  $q$ insert into public.personas (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Contratista') $q$, '42501');

select pruebas.guardar('t1', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'tarea', 'Revisar las aguadas', null,
      array[pruebas.id('per_oper'), pruebas.id('per_admin'), pruebas.id('per_juan'), pruebas.id('per_juan')], pruebas.d(-3)) $q$);
select pruebas.espera_valor('E02 Tarea con el operador, el administrador y alguien sin usuario (el repetido no cuenta): 3 responsables',
  $q$ select pruebas.resp_entrada('t1')::text $q$, '3');
select pruebas.espera_valor('E03 v_calendario trae los 3, ordenados',
  $q$ select (responsables = (select array_agg(x order by x) from unnest(array[pruebas.id('per_oper'), pruebas.id('per_admin'), pruebas.id('per_juan')]) x))::text
      from public.v_calendario where entrada_id = pruebas.id('t1') $q$, 'true');
select pruebas.guardar('n1', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'Se cortó el alambrado') $q$);
select pruebas.espera_valor('E04 Nota sin responsables: ninguna fila',
  $q$ select pruebas.resp_entrada('n1')::text $q$, '0');
select pruebas.espera_error('E05 Responsable de otro establecimiento',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x', null, array[pruebas.id('per_ajeno')]) $q$, '22023');
select pruebas.espera_error('E06 Un responsable vacío en la lista',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x', null, array[pruebas.id('per_oper'), null]) $q$, '22023');
select pruebas.espera_error('E07 Más de 10 responsables',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x', null,
      array(select gen_random_uuid() from generate_series(1, 11))) $q$, '22023');

-- Responsables inactivos: no se asignan, pero los que ya estaban se pueden dejar
select pruebas.guardar('t2', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'tarea', 'Vacunar las vaquillonas', null,
      array[pruebas.id('per_vete')], pruebas.d(-10)) $q$);
select pruebas.como('u_admin');
select pruebas.espera_ok('E08 El administrador desactiva a la veterinaria',
  $q$ update public.personas set activo = false where id = pruebas.id('per_vete') $q$);
select pruebas.como('u_operador');
select pruebas.espera_error('E09 No se asigna una persona inactiva',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x', null, array[pruebas.id('per_vete')]) $q$, '22023');
select pruebas.espera_ok('E10 Al editar, la inactiva que ya tenía se puede dejar (y se suma otra)',
  $q$ select public.editar_entrada_bitacora(pruebas.id('t2'), public.fecha_hoy(), 'tarea', 'Vacunar las vaquillonas', null,
      array[pruebas.id('per_vete'), pruebas.id('per_oper')], pruebas.d(-10)) $q$);
select pruebas.espera_valor('E11 La tarea queda con las 2',
  $q$ select pruebas.resp_entrada('t2')::text $q$, '2');
select pruebas.espera_error('E12 Pero no se agrega una inactiva que no tenía',
  $q$ select public.editar_entrada_bitacora(pruebas.id('t1'), public.fecha_hoy(), 'tarea', 'Revisar las aguadas', null,
      array[pruebas.id('per_vete')], pruebas.d(-3)) $q$, '22023');
select pruebas.espera_ok('E13 Editar la tarea t1: queda solo Juan',
  $q$ select public.editar_entrada_bitacora(pruebas.id('t1'), public.fecha_hoy(), 'tarea', 'Revisar las aguadas', null,
      array[pruebas.id('per_juan')], pruebas.d(-3)) $q$);
select pruebas.espera_valor('E14 Después de editar: 1 responsable, Juan',
  $q$ select string_agg(p.nombre, ',') from public.bitacora_responsables r join public.personas p on p.id = r.persona_id
      where r.entrada_id = pruebas.id('t1') $q$, 'Juan Pérez');
select pruebas.espera_ok('E15 Editar sin responsables (null)',
  $q$ select public.editar_entrada_bitacora(pruebas.id('t2'), public.fecha_hoy(), 'tarea', 'Vacunar las vaquillonas', null, null, pruebas.d(-10)) $q$);
select pruebas.espera_valor('E16 La tarea t2 queda sin responsables',
  $q$ select pruebas.resp_entrada('t2')::text $q$, '0');

-- Tarea repetida: la siguiente copia los responsables
select pruebas.guardar('t3', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'tarea', 'Recorrer los potreros', null,
      array[pruebas.id('per_oper'), pruebas.id('per_juan')], pruebas.d(-1), 7) $q$);
select pruebas.guardar('t3_sig', $q$ select public.cambiar_estado_tarea(pruebas.id('t3'), 'hecha') $q$);
select pruebas.espera_valor('E17 La tarea siguiente tiene los mismos 2 responsables',
  $q$ select (array(select persona_id from public.bitacora_responsables where entrada_id = pruebas.id('t3_sig') order by persona_id)
             = array(select persona_id from public.bitacora_responsables where entrada_id = pruebas.id('t3') order by persona_id)
          and pruebas.resp_entrada('t3_sig') = 2)::text $q$, 'true');
select pruebas.espera_valor('E18 Las vencidas que le tocan al operador: las que lo incluyen y las sin responsables (filtro de la app)',
  $q$ select count(*)::text from public.v_calendario
      where establecimiento_id = pruebas.id('est_a') and origen = 'tarea' and estado = 'pendiente'
        and (responsables = '{}' or pruebas.id('per_oper') = any (responsables)) $q$, '2');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Operador: actividades con varios responsables
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('LV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV Novillos', pruebas.d(60), pruebas.comp('novillos', 20)) $q$);
select pruebas.guardar('pe_id', $q$ select gen_random_uuid() $q$);
select pruebas.guardar('pe1', $q$ select public.registrar_pesada(p_id => pruebas.id('pe_id'), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(2),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 20)),
      p_responsables => array[pruebas.id('per_oper'), pruebas.id('per_admin'), pruebas.id('per_juan')]) $q$);
select pruebas.espera_valor('C01 Pesada con 3 responsables: v_actividades los trae',
  $q$ select cardinality(responsables)::text from public.v_actividades where id = pruebas.id('pe1') $q$, '3');
select pruebas.espera_ok('C02 La misma pesada otra vez (mismo id, otro responsable): no hace nada',
  $q$ select public.registrar_pesada(p_id => pruebas.id('pe_id'), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(2),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 20)), p_responsables => array[pruebas.id('per_oper')]) $q$);
select pruebas.espera_valor('C03 Siguen los 3 responsables',
  $q$ select count(*)::text from public.actividad_responsables where actividad_id = pruebas.id('pe1') $q$, '3');
select pruebas.guardar('m1', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(1),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_causa => null, p_observaciones => null, p_responsables => null) $q$);
select pruebas.espera_valor('C04 Mortandad sin responsables: lista vacía',
  $q$ select responsables::text from public.v_actividades where id = pruebas.id('m1') $q$, '{}');
select pruebas.espera_error('C05 Actividad con una persona inactiva',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(1),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 19)), p_responsables => array[pruebas.id('per_vete')]) $q$, '22023');
select pruebas.espera_error('C06 Actividad con un responsable de otro establecimiento',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(1),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 19)), p_responsables => array[pruebas.id('per_ajeno')]) $q$, '22023');
select pruebas.espera_error('C07 El operador no escribe directo en los responsables de una actividad',
  $q$ insert into public.actividad_responsables (establecimiento_id, actividad_id, persona_id)
      values (pruebas.id('est_a'), pruebas.id('m1'), pruebas.id('per_oper')) $q$, '42501');
select pruebas.espera_ok('C08 Anular la pesada sigue funcionando (proteger_actividad sin la columna)',
  $q$ select public.anular_actividad(pruebas.id('pe1'), 'Pesada repetida') $q$);

reset role;
select pruebas.espera_error('C09 Ni la base puede cambiar los responsables de una actividad',
  $q$ delete from public.actividad_responsables where actividad_id = pruebas.id('pe1') $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Consulta y otro campo: solo lectura, cada uno lo suyo
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_consulta');
select pruebas.espera_valor('Q01 Consulta ve los responsables de su establecimiento',
  $q$ select ((select count(*) from public.bitacora_responsables) > 0 and (select count(*) from public.actividad_responsables) > 0)::text $q$, 'true');
select pruebas.espera_error('Q02 Consulta no escribe responsables',
  $q$ insert into public.bitacora_responsables (establecimiento_id, entrada_id, persona_id)
      values (pruebas.id('est_a'), pruebas.id('n1'), pruebas.id('per_juan')) $q$, '42501');
select pruebas.espera_error('Q03 Consulta no carga notas con responsables',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x', null, array[pruebas.id('per_juan')]) $q$, '42501');
select pruebas.como('u_ajeno');
select pruebas.espera_valor('Q04 El operador de otro campo no ve los responsables de Santa Remigia',
  $q$ select ((select count(*) from public.bitacora_responsables where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.actividad_responsables where establecimiento_id = pruebas.id('est_a')))::text $q$, '0');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no lee responsables',
  $q$ select count(*) from public.bitacora_responsables $q$, '42501');

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
  raise exception E'PRUEBAS RESPONSABLES: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
