-- Campo Digital v2 — Pruebas de la superficie que sale del dibujo (potreros y total del establecimiento)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261106000100_superficie_del_dibujo).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS SUPERFICIE DEL DIBUJO: N OK, ...", que deshace todo.
--      El resultado esperado es "23 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia.
-- (La preparación y los ayudantes son los mismos de potreros_estadias.sql.)

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

grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 potreros.superficie admite null, con check (null o > 0); authenticated no la escribe (el nombre sí)',
  $q$ select ((select not attnotnull from pg_attribute where attrelid = 'public.potreros'::regclass and attname = 'superficie')
          and exists (select 1 from pg_constraint where conrelid = 'public.potreros'::regclass and conname = 'potreros_superficie_check')
          and not has_column_privilege('authenticated', 'public.potreros', 'superficie', 'insert')
          and not has_column_privilege('authenticated', 'public.potreros', 'superficie', 'update')
          and has_column_privilege('authenticated', 'public.potreros', 'nombre', 'update'))::text $q$, 'true');
select pruebas.espera_valor('B02 Trigger calcular_superficie_potrero (antes de insert y update); su función no la ejecuta nadie por la API',
  $q$ select (exists (select 1 from pg_trigger where tgrelid = 'public.potreros'::regclass and tgname = 'calcular_superficie_potrero')
          and not has_function_privilege('authenticated', 'public.calcular_superficie_potrero()', 'execute')
          and not has_function_privilege('anon', 'public.calcular_superficie_potrero()', 'execute')
          and (select 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.calcular_superficie_potrero()'::regprocedure))::text $q$, 'true');
select pruebas.espera_valor('B03 Una sola guardar_forma_potrero (2 parámetros) y una sola crear_establecimiento (11, sin superficie)',
  $q$ select string_agg(proname || ':' || pronargs, ' ' order by proname) from pg_proc
      where pronamespace = 'public'::regnamespace and proname in ('guardar_forma_potrero', 'crear_establecimiento') $q$,
  'crear_establecimiento:11 guardar_forma_potrero:2');
select pruebas.espera_valor('B04 establecimientos ya no tiene la columna superficie_total',
  $q$ select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name = 'establecimientos' and column_name = 'superficie_total' $q$, '0');
select pruebas.espera_valor('B05 superficie_total(establecimientos): authenticated sí, anon no, sin security definer y con search_path fijo',
  $q$ select (has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
          and not p.prosecdef and 'search_path=""' = any (p.proconfig))::text
      from pg_proc p where p.oid = 'public.superficie_total(public.establecimientos)'::regprocedure $q$, 'true');
select pruebas.espera_valor('B06 Datos existentes: toda superficie es la de su dibujo, o null sin dibujar (0 diferencias)',
  $q$ select count(*)::text from public.potreros
      where superficie is distinct from
            (case when forma is null then null else round((extensions.st_area(forma::extensions.geography) / 10000)::numeric, 2) end) $q$, '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento(p_nombre => 'Otro campo (prueba)', p_departamento => 'Salto',
      p_localidad => 'Constitución', p_sistema_productivo => 'Ganadero') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);

select pruebas.espera_error('C01 crear_establecimiento ya no acepta p_superficie_total',
  $q$ select public.crear_establecimiento(p_nombre => 'Con superficie', p_departamento => 'Durazno', p_superficie_total => 100) $q$, '42883');
select pruebas.espera_error('C02 Tampoco se escribe en el establecimiento (la columna no existe)',
  $q$ update public.establecimientos set superficie_total = 100 where id = pruebas.id('est_a') $q$, '42703');
select pruebas.espera_filas('C03 El resto de los datos del establecimiento se sigue editando',
  $q$ update public.establecimientos set localidad = 'Sarandí del Yí' where id = pruebas.id('est_a') $q$, 1);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: superficie del potrero
-- ════════════════════════════════════════════════════════════════════════════
-- Potrero 1: 0,01° × 0,01° cerca de Durazno (≈ 103 ha). Potrero 2: la mitad de alto (≈ 51 ha).

select pruebas.como('u_operador');
select pruebas.guardar('P1', $q$ insert into public.potreros (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Potrero 1') returning id $q$);
select pruebas.guardar('P2', $q$ insert into public.potreros (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Potrero 2') returning id $q$);
select pruebas.guardar('P3', $q$ insert into public.potreros (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Potrero 3') returning id $q$);

select pruebas.espera_valor('S01 Un potrero nuevo, sin dibujar, no tiene superficie',
  $q$ select coalesce(superficie::text, 'null') from public.potreros where id = pruebas.id('P1') $q$, 'null');
select pruebas.espera_error('S02 No se da de alta con superficie a mano',
  $q$ insert into public.potreros (establecimiento_id, nombre, superficie) values (pruebas.id('est_a'), 'A mano', 50) $q$, '42501');
select pruebas.espera_error('S03 Ni se cambia a mano',
  $q$ update public.potreros set superficie = 50 where id = pruebas.id('P1') $q$, '42501');
select pruebas.preparar('forma_P1', $q$ select public.guardar_forma_potrero(pruebas.id('P1'), pruebas.cuadro(-56.50, -56.49, -33.00, -32.99)) $q$);
select pruebas.espera_valor('S04 Al dibujarlo, la superficie es el área del dibujo (≈ 103 ha), la misma que devuelve el mapa',
  $q$ select (superficie = area_ha and area_ha between 100 and 107)::text from public.v_potreros_mapa where id = pruebas.id('P1') $q$, 'true');
select pruebas.espera_valor('S05 Cambiar otro dato (el nombre) no cambia la superficie',
  $q$ with u as (update public.potreros set nombre = 'Potrero Uno' where id = pruebas.id('P1') returning superficie)
      select (u.superficie = m.area_ha)::text from u, public.v_potreros_mapa m where m.id = pruebas.id('P1') $q$, 'true');
select pruebas.preparar('forma_P1_chica', $q$ select public.guardar_forma_potrero(pruebas.id('P1'), pruebas.cuadro(-56.50, -56.49, -33.00, -32.995)) $q$);
select pruebas.espera_valor('S06 Al redibujarlo más chico (la mitad), la superficie cambia con el dibujo (≈ 51 ha)',
  $q$ select (superficie = area_ha and area_ha between 49 and 54)::text from public.v_potreros_mapa where id = pruebas.id('P1') $q$, 'true');
select pruebas.preparar('forma_P2', $q$ select public.guardar_forma_potrero(pruebas.id('P2'), pruebas.cuadro(-56.49, -56.48, -33.00, -32.99)) $q$);
select pruebas.preparar('forma_P3', $q$ select public.guardar_forma_potrero(pruebas.id('P3'), pruebas.cuadro(-56.48, -56.47, -33.00, -32.99)) $q$);
select pruebas.preparar('sin_forma_P3', $q$ select public.guardar_forma_potrero(pruebas.id('P3'), null) $q$);
select pruebas.espera_valor('S07 Al borrar el dibujo, el potrero vuelve a no tener superficie',
  $q$ select coalesce(superficie::text, 'null') from public.potreros where id = pruebas.id('P3') $q$, 'null');
select pruebas.espera_error('S08 guardar_forma_potrero ya no acepta el tercer parámetro (usar el área)',
  $q$ select public.guardar_forma_potrero(pruebas.id('P2'), pruebas.cuadro(-56.49, -56.48, -33.00, -32.99), true) $q$, '42883');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Superficie total del establecimiento
-- ════════════════════════════════════════════════════════════════════════════
-- Ahora: Potrero Uno ≈ 51 ha, Potrero 2 ≈ 103 ha (dibujados, activos) y Potrero 3 sin dibujar.

select pruebas.espera_valor('T01 La total es la suma de los potreros activos dibujados (≈ 154 ha); el sin dibujar no suma',
  $q$ select (public.superficie_total(e) = (select sum(superficie) from public.potreros where establecimiento_id = e.id and superficie is not null)
          and public.superficie_total(e) between 149 and 161)::text
      from public.establecimientos e where e.id = pruebas.id('est_a') $q$, 'true');
select pruebas.preparar('baja_P2', $q$ update public.potreros set estado = 'inactivo' where id = pruebas.id('P2') $q$);
select pruebas.espera_valor('T02 Un potrero inactivo no suma: queda solo Potrero Uno',
  $q$ select (public.superficie_total(e) = (select superficie from public.potreros where id = pruebas.id('P1')))::text
      from public.establecimientos e where e.id = pruebas.id('est_a') $q$, 'true');
select pruebas.espera_valor('T03 Al reactivarlo vuelve a sumar (y desactivar no le borró la superficie)',
  $q$ with u as (update public.potreros set estado = 'activo' where id = pruebas.id('P2') returning 1)
      select (select count(*) from u)::text || '|' || (select (superficie is not null)::text from public.potreros where id = pruebas.id('P2')) $q$, '1|true');

select pruebas.como('u_consulta');
select pruebas.espera_valor('T04 Consulta lee la superficie total como columna calculada, igual que la API (select=*,superficie_total)',
  $q$ select (public.superficie_total(e) between 149 and 161)::text from public.establecimientos e where e.id = pruebas.id('est_a') $q$, 'true');

select pruebas.como('u_admin');
select pruebas.espera_valor('T05 Un establecimiento sin potreros no tiene superficie total (null)',
  $q$ select coalesce(public.superficie_total(e)::text, 'null') from public.establecimientos e where e.id = pruebas.id('est_x') $q$, 'null');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no calcula la superficie total',
  $q$ select public.superficie_total(e) from public.establecimientos e $q$, '42501');

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
  raise exception E'PRUEBAS SUPERFICIE DEL DIBUJO: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
