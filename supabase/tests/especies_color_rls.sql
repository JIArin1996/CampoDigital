-- Campo Digital v2 — Pruebas de especies con color y baja de categorías
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261020000100_especies_color_baja_categorias).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ESPECIES Y CATEGORÍAS: N OK, ...", que deshace todo.
--      El resultado esperado es "16 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test), creados y borrados dentro de la transacción:
--   A = administrador y O = operador de Santa Remigia (Q y X se crean pero no se usan).

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
-- 1. Administrador: establecimiento, roles y catálogo
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.guardar('vacunos',     $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('terneros',    $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros' $q$);
select pruebas.guardar('vaquillonas', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Vaquillonas' $q$);
select pruebas.guardar('toros',       $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Toros' $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Operador: lotes (terneros con stock; toros que tuvieron y ya no)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');
select pruebas.guardar('L1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L1 Terneros', pruebas.d(10), pruebas.comp('terneros', 5)) $q$);
select pruebas.guardar('L2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L2 Toros', pruebas.d(10), pruebas.comp('toros', 2)) $q$);
select pruebas.preparar('L2', $q$ select public.registrar_ajuste(pruebas.id('L2'), pruebas.id('toros'), -2, pruebas.d(1), 'Se fueron') $q$);

select pruebas.espera_filas('O01 El operador no puede cambiar el color de una especie (0 filas por RLS)',
  $q$ update public.especies set color = '#000000' where id = pruebas.id('vacunos') $q$, 0);
select pruebas.espera_filas('O02 El operador no puede dar de baja una categoría (0 filas por RLS)',
  $q$ update public.categorias_animales set activo = false where id = pruebas.id('vaquillonas') $q$, 0);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Administrador: color de la especie
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_admin');

select pruebas.espera_filas('C01 El administrador le pone color a una especie',
  $q$ update public.especies set color = '#1a7f3c' where id = pruebas.id('vacunos') $q$, 1);
select pruebas.espera_error('C02 Color que no es #rrggbb (texto)',
  $q$ update public.especies set color = 'verde' where id = pruebas.id('vacunos') $q$, '23514');
select pruebas.espera_error('C03 Color con 5 dígitos',
  $q$ update public.especies set color = '#12345' where id = pruebas.id('vacunos') $q$, '23514');
select pruebas.espera_valor('C04 Especie nueva con su color',
  $q$ with nueva as (
        insert into public.especies (establecimiento_id, nombre, grupo, color)
        values (pruebas.id('est_a'), 'Caprinos (prueba)', 'otro', '#7C3AED') returning color)
      select color from nueva $q$, '#7C3AED');
select pruebas.espera_filas('C05 Volver al color por defecto (vacío)',
  $q$ update public.especies set color = null where id = pruebas.id('vacunos') $q$, 1);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Administrador: baja de categorías
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('K01 Dar de baja una categoría con animales en stock (5 terneros)',
  $q$ update public.categorias_animales set activo = false where id = pruebas.id('terneros') $q$, '23514');
select pruebas.espera_filas('K02 Dar de baja una categoría que nunca se usó',
  $q$ update public.categorias_animales set activo = false where id = pruebas.id('vaquillonas') $q$, 1);
select pruebas.espera_filas('K03 Dar de baja una categoría que tuvo animales y hoy está en cero',
  $q$ update public.categorias_animales set activo = false where id = pruebas.id('toros') $q$, 1);
select pruebas.espera_valor('K04 Las dos quedaron dadas de baja; la de stock sigue activa',
  $q$ select string_agg(nombre || ':' || activo, ',' order by nombre) from public.categorias_animales
      where id in (pruebas.id('terneros'), pruebas.id('vaquillonas'), pruebas.id('toros')) $q$,
  'Terneros:true,Toros:false,Vaquillonas:false');
select pruebas.espera_filas('K05 Reactivar una categoría dada de baja',
  $q$ update public.categorias_animales set activo = true where id = pruebas.id('toros') $q$, 1);
select pruebas.espera_filas('K06 Renombrar una categoría con stock (no toca activo)',
  $q$ update public.categorias_animales set nombre = 'Terneros machos' where id = pruebas.id('terneros') $q$, 1);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

reset role;

select pruebas.espera_error('P01 La baja con stock se rechaza aun como postgres',
  $q$ update public.categorias_animales set activo = false where id = pruebas.id('terneros') $q$, '23514');
select pruebas.espera_valor('P02 Función del trigger: security definer, search_path fijo, sin execute para authenticated ni anon',
  $q$ select (p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('authenticated', p.oid, 'execute')
              and not has_function_privilege('anon', p.oid, 'execute'))::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'validar_baja_categoria' $q$, 'true');
select pruebas.espera_valor('P03 Permisos de la columna color: authenticated inserta y actualiza; anon nada',
  $q$ select (has_column_privilege('authenticated', 'public.especies', 'color', 'INSERT')
              and has_column_privilege('authenticated', 'public.especies', 'color', 'UPDATE')
              and not has_column_privilege('anon', 'public.especies', 'color', 'UPDATE'))::text $q$, 'true');

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
  raise exception E'PRUEBAS ESPECIES Y CATEGORÍAS: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
