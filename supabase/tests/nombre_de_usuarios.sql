-- Campo Digital v2 — Pruebas: el nombre de un usuario en Personas es el de su perfil
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261028000200_nombre_de_usuarios).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS NOMBRE DE USUARIOS: N OK, ...", que deshace todo.
--      El resultado esperado es "13 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--
-- Usuarios de prueba (.test): A = administrador (Ana), O = operador (Oscar) y Q = consulta (Quena).

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

-- Nombre de la ficha de un usuario en un establecimiento
create function pruebas.ficha(p_usuario text, p_est text) returns text language sql stable as $$
  select nombre from public.personas where user_id = pruebas.id(p_usuario) and establecimiento_id = pruebas.id(p_est)
$$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres): los dos triggers
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 Triggers nuevos: search_path fijo, nadie los ejecuta por la API; solo la sincronización es security definer',
  $q$ select string_agg(p.proname || '(' || p.prosecdef::text || ')', ' ' order by p.proname)
          || '|' || bool_and(coalesce('search_path=""' = any (p.proconfig), false)
                             and not has_function_privilege('authenticated', p.oid, 'execute')
                             and not has_function_privilege('anon', p.oid, 'execute'))::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('proteger_nombre_persona', 'sincronizar_nombre_persona') $q$,
  'proteger_nombre_persona(false) sincronizar_nombre_persona(true)|true');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador: fichas de usuarios
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_a', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_x', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('ficha_oper', $q$ select id from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_operador') $q$);
select pruebas.guardar('per_juan', $q$ insert into public.personas (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Juan') returning id $q$);

select pruebas.espera_valor('U01 Las fichas llevan el nombre del perfil (administrador y operador)',
  $q$ select pruebas.ficha('u_admin', 'est_a') || '|' || pruebas.ficha('u_operador', 'est_a') $q$, 'Ana|Oscar');
select pruebas.espera_error('U02 El administrador no renombra la ficha de un usuario',
  $q$ update public.personas set nombre = 'Oscar el capataz' where id = pruebas.id('ficha_oper') $q$, '42501');
select pruebas.espera_ok('U03 Pero sí le cambia el rol',
  $q$ update public.personas set rol = 'Capataz' where id = pruebas.id('ficha_oper') $q$);
select pruebas.espera_valor('U04 El rol quedó y el nombre no cambió',
  $q$ select nombre || '|' || rol from public.personas where id = pruebas.id('ficha_oper') $q$, 'Oscar|Capataz');
select pruebas.espera_ok('U05 Guardar la ficha con el mismo nombre no es un cambio',
  $q$ update public.personas set nombre = 'Oscar', activo = true where id = pruebas.id('ficha_oper') $q$);
select pruebas.espera_valor('U06 Al crear a mano la ficha de un usuario, el nombre se completa con el del perfil',
  $q$ insert into public.personas (establecimiento_id, nombre, user_id)
      values (pruebas.id('est_x'), 'Cualquier nombre', pruebas.id('u_consulta')) returning nombre $q$, 'Quena');
select pruebas.espera_error('U07 Una persona sin usuario no se vincula después a un usuario',
  $q$ update public.personas set user_id = pruebas.id('u_consulta') where id = pruebas.id('per_juan') $q$, '42501');
select pruebas.espera_ok('U08 Una persona sin usuario se renombra',
  $q$ update public.personas set nombre = 'Juan Pérez' where id = pruebas.id('per_juan') $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. El nombre sigue al perfil
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');
select pruebas.espera_ok('U09 El operador cambia su apellido en Mi perfil',
  $q$ update public.perfiles set apellido = 'Gómez' where id = pruebas.id('u_operador') $q$);
select pruebas.espera_valor('U10 Sus fichas de los dos establecimientos pasan a "Oscar Gómez"',
  $q$ select pruebas.ficha('u_operador', 'est_a') || '|' || pruebas.ficha('u_operador', 'est_x') $q$, 'Oscar Gómez|Oscar Gómez');
select pruebas.como('u_admin');
select pruebas.espera_ok('U11 El administrador le cambia el nombre en Usuarios',
  $q$ update public.perfiles set nombre = 'Oscarcito' where id = pruebas.id('u_operador') $q$);
select pruebas.espera_valor('U12 Las fichas lo siguen; la de Juan no cambia',
  $q$ select pruebas.ficha('u_operador', 'est_a') || '|' || pruebas.ficha('u_operador', 'est_x')
          || '|' || (select nombre from public.personas where id = pruebas.id('per_juan')) $q$, 'Oscarcito Gómez|Oscarcito Gómez|Juan Pérez');

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
  raise exception E'PRUEBAS NOMBRE DE USUARIOS: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
