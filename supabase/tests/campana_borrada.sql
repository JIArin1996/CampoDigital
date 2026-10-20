-- Campo Digital v2 — Pruebas: lotes.campana borrada
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261020000500_borrar_campana).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS CAMPAÑA BORRADA: N OK, ...", que deshace todo.
--      El resultado esperado es "12 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
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


grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres): la columna y las funciones
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 lotes ya no tiene la columna campana',
  $q$ select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name = 'lotes' and column_name = 'campana' $q$, '0');
select pruebas.espera_valor('B02 crear_lote: una sola versión, sin p_campana, para authenticated y no para anon',
  $q$ select (count(*) = 1 and bool_and(pg_get_function_identity_arguments(p.oid) not like '%campana%'
              and pg_get_function_identity_arguments(p.oid) like '%p_notas text, p_anios_nacimiento integer[]'
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')))::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'crear_lote' $q$, 'true');
select pruebas.espera_valor('B03 Las 5 funciones reescritas: una versión cada una, security definer, search_path fijo, authenticated sí y anon no',
  $q$ select count(*) filter (where p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('crear_lote', 'dividir_lote', 'unir_lotes', 'registrar_compra', 'registrar_paricion') $q$, '5/5');
select pruebas.espera_valor('B04 Ninguna función de public menciona la columna campana',
  $q$ select count(*)::text from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosrc ~ '(->>|\.|,\s*)\s*''?campana' $q$, '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador: establecimiento, roles y catálogo
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.guardar('vacunos',    $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('terneros',   $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros' $q$);
select pruebas.guardar('vacas_cria', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacas de cría' $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: todo lo que crea lotes sigue funcionando
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

select pruebas.guardar('L1', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'L1', p_fecha_apertura => pruebas.d(20), p_composicion => pruebas.comp('terneros', 6),
      p_notas => 'con nota', p_anios_nacimiento => array[2024]) $q$);
select pruebas.espera_valor('C01 crear_lote por nombre: guarda notas y años',
  $q$ select notas || '|' || anios_nacimiento::text from public.lotes where id = pruebas.id('L1') $q$, 'con nota|{2024}');

select pruebas.guardar('L2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L2', pruebas.d(20),
      pruebas.comp('terneros', 2), null, 'nota L2', array[2023, 2024]) $q$);
select pruebas.espera_valor('C02 crear_lote por posición: después del potrero vienen las notas y los años',
  $q$ select notas || '|' || anios_nacimiento::text from public.lotes where id = pruebas.id('L2') $q$, 'nota L2|{2023,2024}');

select pruebas.espera_error('C03 crear_lote con p_campana ya no existe',
  $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'X', p_fecha_apertura => pruebas.d(1), p_composicion => pruebas.comp('terneros', 1), p_campana => '2025') $q$, '42883');

select pruebas.guardar('op_div', $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(5), jsonb_build_array(
      jsonb_build_object('nombre', 'D1', 'campana', '2026', 'composicion', pruebas.comp('terneros', 2)))) $q$);
select pruebas.espera_valor('C04 dividir_lote con "campana" en el jsonb: se ignora y el lote nuevo hereda los años',
  $q$ select l.nombre || '|' || l.anios_nacimiento::text from public.lotes l
      join public.operacion_lote_vinculos v on v.lote_id = l.id and v.rol = 'destino' and v.operacion_id = pruebas.id('op_div') $q$, 'D1|{2024}');

select pruebas.guardar('op_union', $q$ select public.unir_lotes(array[pruebas.id('L1'), pruebas.id('L2')], pruebas.d(2), null,
      jsonb_build_object('nombre', 'LU', 'campana', '2026')) $q$);
select pruebas.espera_valor('C05 unir_lotes con "campana" en el jsonb: se ignora y el lote nuevo tiene la unión de los años',
  $q$ select l.nombre || '|' || l.anios_nacimiento::text from public.lotes l
      join public.operacion_lote_vinculos v on v.lote_id = l.id and v.rol = 'destino' and v.operacion_id = pruebas.id('op_union') $q$, 'LU|{2023,2024}');

select pruebas.guardar('c1', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(3), p_lineas => pruebas.comp('terneros', 2), p_modalidad => 'productor',
      p_lote_nuevo => jsonb_build_object('nombre', 'Comprados', 'especie_id', pruebas.id('vacunos'), 'campana', '2026',
                                         'anios_nacimiento', jsonb_build_array(2025))) $q$);
select pruebas.espera_valor('C06 registrar_compra a un lote nuevo con "campana": se ignora, guarda los años',
  $q$ select l.nombre || '|' || l.anios_nacimiento::text from public.actividades a join public.lotes l on l.id = a.lote_id
      where a.id = pruebas.id('c1') $q$, 'Comprados|{2025}');

select pruebas.guardar('LM', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LM Vacas', pruebas.d(30), pruebas.comp('vacas_cria', 10)) $q$);
select pruebas.guardar('pa1', $q$ select public.registrar_paricion(
      p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => pruebas.d(2),
      p_lineas => pruebas.comp('terneros', 4),
      p_lote_cria_nuevo => jsonb_build_object('nombre', 'Terneros Nacidos', 'campana', '2026')) $q$);
select pruebas.guardar('LN', $q$ select lote_cria_id from public.act_paricion where actividad_id = pruebas.id('pa1') $q$);
select pruebas.espera_valor('C07 registrar_paricion a un lote de cría nuevo con "campana": se ignora; 4 terneros, sin años',
  $q$ select pruebas.stock('LN', 'terneros') || '|' || anios_nacimiento::text
      from public.lotes where id = pruebas.id('LN') $q$, '4|{}');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. anon
-- ════════════════════════════════════════════════════════════════════════════

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no crea lotes',
  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'X', pruebas.d(1), pruebas.comp('terneros', 1)) $q$, '42501');

reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS CAMPAÑA BORRADA: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
