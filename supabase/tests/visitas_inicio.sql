-- Campo Digital v2 — Pruebas: última visita al Inicio (visitas_inicio y registrar_visita_inicio)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261118000100_visitas_inicio).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS VISITAS INICIO: N OK, ...", que deshace todo.
--      El resultado esperado es "12 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--
-- Usuarios de prueba (.test): A = administrador (Ana), O = operador (Oscar), Q = consulta (Quena) y X = ajeno (Xavier).

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

create function pruebas.como(p_clave text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.' || p_clave), 'role', 'authenticated')::text, true);
end $$;

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

-- Preparación que guarda un id en test.<clave>. Si falla, la clave queda FALLIDA.
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

-- Preparación sin resultado. Misma lógica: si falla, deja FALLIDA la clave indicada.
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
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres): la función nueva
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('V01 registrar_visita_inicio: security definer, search_path fijo, solo authenticated',
  $q$ select p.prosecdef::text || '|' || coalesce('search_path=""' = any (p.proconfig), false)::text
          || '|' || has_function_privilege('authenticated', p.oid, 'execute')::text
          || '|' || has_function_privilege('anon', p.oid, 'execute')::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'registrar_visita_inicio' $q$,
  'true|true|true|false');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Visitas
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('est_a', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('est_a', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);

select pruebas.como('u_operador');
select pruebas.espera_valor('V02 La primera visita devuelve null (no hay anterior)',
  $q$ select public.registrar_visita_inicio(pruebas.id('est_a'))::text $q$, null);
select pruebas.espera_valor('V03 La segunda devuelve la anterior',
  $q$ select (public.registrar_visita_inicio(pruebas.id('est_a')) is not null)::text $q$, 'true');
select pruebas.espera_valor('V04 Queda una sola fila del operador en el establecimiento',
  $q$ select count(*)::text from public.visitas_inicio where establecimiento_id = pruebas.id('est_a') $q$, '1');

select pruebas.como('u_consulta');
select pruebas.espera_valor('V05 Consulta también registra su visita',
  $q$ select public.registrar_visita_inicio(pruebas.id('est_a'))::text $q$, null);
select pruebas.espera_valor('V06 Cada uno ve solo la suya',
  $q$ select count(*)::text || '|' || bool_and(user_id = pruebas.id('u_consulta'))::text
      from public.visitas_inicio where establecimiento_id = pruebas.id('est_a') $q$, '1|true');

select pruebas.como('u_admin');
select pruebas.espera_valor('V07 El administrador, sin membresía, registra la suya',
  $q$ select public.registrar_visita_inicio(pruebas.id('est_a'))::text $q$, null);

select pruebas.como('u_ajeno');
select pruebas.espera_error('V08 Quien no es miembro no registra visitas',
  $q$ select public.registrar_visita_inicio(pruebas.id('est_a')) $q$, '42501');
select pruebas.espera_error('V09 Sin establecimiento, error',
  $q$ select public.registrar_visita_inicio(null) $q$, '42501');

select pruebas.como('u_operador');
select pruebas.espera_error('V10 No se escribe directo en la tabla (insert)',
  $q$ insert into public.visitas_inicio (user_id, establecimiento_id) values (pruebas.id('u_operador'), pruebas.id('est_a')) $q$, '42501');
select pruebas.espera_error('V11 Ni se cambia la fecha a mano (update)',
  $q$ update public.visitas_inicio set vista_en = now() - interval '1 year' $q$, '42501');

reset role;
set local role anon;
select pruebas.espera_error('V12 anon no ejecuta la función',
  $q$ select public.registrar_visita_inicio(pruebas.id('est_a')) $q$, '42501');
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
  raise exception E'PRUEBAS VISITAS INICIO: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
