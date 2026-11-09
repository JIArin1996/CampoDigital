-- Campo Digital v2 — Pruebas del área efectiva de los potreros (zonas no aprovechables)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261110000100_area_efectiva).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ÁREA EFECTIVA: N OK, ...", que deshace todo.
--      El resultado esperado es "34 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Las áreas esperadas son las geodésicas de los mismos rectángulos (contexto/DISENO-AREA-EFECTIVA.md, sección 7),
-- comparadas con 0,01 ha de tolerancia por los redondeos.
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

-- Área geodésica (ha) de un rectángulo en grados, y comparación con tolerancia de 0,01 ha (redondeos)
create function pruebas.ha(x1 numeric, x2 numeric, y1 numeric, y2 numeric) returns numeric language sql immutable as $$
  select (extensions.st_area(extensions.st_setsrid(extensions.st_geomfromgeojson(pruebas.cuadro(x1, x2, y1, y2)::text), 4326)::extensions.geography) / 10000)::numeric
$$;
create function pruebas.cerca(a numeric, b numeric) returns boolean language sql immutable as $$
  select abs(a - b) <= 0.011
$$;
create function pruebas.sup(p_clave text) returns numeric language sql stable as $$
  select superficie from public.potreros where id = pruebas.id(p_clave)
$$;
create function pruebas.efe(p_clave text) returns numeric language sql stable as $$
  select superficie_efectiva from public.potreros where id = pruebas.id(p_clave)
$$;
create function pruebas.zona(p_zona text, p_potrero text, p_tipo text, p_forma jsonb, p_nota text default null) returns numeric language sql as $$
  select public.guardar_zona_potrero(pruebas.id(p_zona), pruebas.id(p_potrero), pruebas.id(p_tipo), p_forma, p_nota)
$$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 zona_tipos y potrero_zonas con RLS; potrero_zonas solo lectura; zona_tipos escribe por columnas (lo limita la política); anon nada',
  $q$ select ((select bool_and(relrowsecurity) from pg_class where oid in ('public.zona_tipos'::regclass, 'public.potrero_zonas'::regclass))
          and has_table_privilege('authenticated', 'public.potrero_zonas', 'select')
          and not has_table_privilege('authenticated', 'public.potrero_zonas', 'insert')
          and not has_table_privilege('authenticated', 'public.potrero_zonas', 'update')
          and not has_table_privilege('authenticated', 'public.potrero_zonas', 'delete')
          and has_column_privilege('authenticated', 'public.zona_tipos', 'nombre', 'update')
          and not has_table_privilege('authenticated', 'public.zona_tipos', 'delete')
          and not has_column_privilege('authenticated', 'public.potreros', 'superficie_efectiva', 'update')
          and not has_table_privilege('anon', 'public.potrero_zonas', 'select')
          and not has_table_privilege('anon', 'public.zona_tipos', 'select'))::text $q$, 'true');
select pruebas.espera_valor('B02 Funciones: search_path fijo, nada para anon; guardar y borrar zona security definer y para authenticated; las internas sin execute',
  $q$ select count(*) filter (where coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('anon', p.oid, 'execute')
              and has_function_privilege('authenticated', p.oid, 'execute') = (p.proname not like '\_%')
              and p.prosecdef = (p.proname in ('guardar_zona_potrero', 'borrar_zona_potrero')))::text || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('guardar_zona_potrero', 'borrar_zona_potrero', 'superficie_efectiva_total', '_cargar_zona_tipos', '_geometria_de_geojson') $q$, '5/5');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Preparación
-- ════════════════════════════════════════════════════════════════════════════
-- Potrero P: 0,01° × 0,01° cerca de Durazno (≈ 103 ha).

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('t_monte',  $q$ select id from public.zona_tipos where establecimiento_id = pruebas.id('est_a') and nombre = 'Monte' $q$);
select pruebas.guardar('t_banado', $q$ select id from public.zona_tipos where establecimiento_id = pruebas.id('est_a') and nombre = 'Bañado' $q$);
select pruebas.guardar('t_otra',   $q$ select id from public.zona_tipos where establecimiento_id = pruebas.id('est_a') and nombre = 'Otra' $q$);
select pruebas.guardar('t_x',      $q$ select id from public.zona_tipos where establecimiento_id = pruebas.id('est_x') and nombre = 'Monte' $q$);
select pruebas.guardar('z1', $q$ select gen_random_uuid() $q$);
select pruebas.guardar('z2', $q$ select gen_random_uuid() $q$);
select pruebas.guardar('z3', $q$ select gen_random_uuid() $q$);
select pruebas.guardar('z4', $q$ select gen_random_uuid() $q$);
select pruebas.guardar('z5', $q$ select gen_random_uuid() $q$);

select pruebas.espera_valor('C01 Un establecimiento nuevo trae los 5 tipos de zona, en orden',
  $q$ select string_agg(nombre, ',' order by orden) from public.zona_tipos where establecimiento_id = pruebas.id('est_a') $q$,
  'Monte,Bañado,Cañada o agua,Casco o instalaciones,Otra');

select pruebas.como('u_operador');
select pruebas.guardar('P', $q$ insert into public.potreros (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Potrero P') returning id $q$);
select pruebas.preparar('forma_P', $q$ select public.guardar_forma_potrero(pruebas.id('P'), pruebas.cuadro(-56.50, -56.49, -33.00, -32.99)) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Zonas y superficie efectiva (como operador)
-- ════════════════════════════════════════════════════════════════════════════
-- Z1 Monte: el cuarto de abajo a la izquierda. Z2 Bañado: pisa la mitad de Z1 (la unión es un rectángulo R1 de
-- 3/8 del ancho). Z3 Otra: arriba a la derecha, se sale del potrero (adentro queda R2).

select pruebas.espera_valor('Z00 Sin zonas, la efectiva es la superficie',
  $q$ select (pruebas.efe('P') = pruebas.sup('P'))::text $q$, 'true');
select pruebas.espera_valor('Z01a Monte en un cuarto del potrero: devuelve sus ha',
  $q$ select pruebas.cerca(pruebas.zona('z1', 'P', 't_monte', pruebas.cuadro(-56.50, -56.495, -33.00, -32.995)), pruebas.ha(-56.50, -56.495, -33.00, -32.995))::text $q$, 'true');
select pruebas.espera_valor('Z01b La efectiva es la superficie menos la zona',
  $q$ select pruebas.cerca(pruebas.efe('P'), pruebas.sup('P') - pruebas.ha(-56.50, -56.495, -33.00, -32.995))::text $q$, 'true');
select pruebas.espera_valor('Z02a Bañado que pisa la mitad del monte: se guarda',
  $q$ select (pruebas.zona('z2', 'P', 't_banado', pruebas.cuadro(-56.4975, -56.4925, -33.00, -32.995)) > 0)::text $q$, 'true');
select pruebas.espera_valor('Z02b Se resta la unión de las dos (no la suma)',
  $q$ select pruebas.cerca(pruebas.efe('P'), pruebas.sup('P') - pruebas.ha(-56.50, -56.4925, -33.00, -32.995))::text $q$, 'true');
select pruebas.espera_valor('Z03a Una zona que se sale del potrero: devuelve solo las ha de adentro',
  $q$ select pruebas.cerca(pruebas.zona('z3', 'P', 't_otra', pruebas.cuadro(-56.4925, -56.48, -32.995, -32.99), 'Galpón y corral'),
                           pruebas.ha(-56.4925, -56.49, -32.995, -32.99))::text $q$, 'true');
select pruebas.espera_valor('Z03b Y a la efectiva se le resta solo lo de adentro',
  $q$ select pruebas.cerca(pruebas.efe('P'), pruebas.sup('P') - pruebas.ha(-56.50, -56.4925, -33.00, -32.995) - pruebas.ha(-56.4925, -56.49, -32.995, -32.99))::text $q$, 'true');
select pruebas.espera_error('Z04 Una zona afuera del potrero',
  $q$ select pruebas.zona('z4', 'P', 't_monte', pruebas.cuadro(-56.48, -56.47, -33.00, -32.99)) $q$, '22023');
select pruebas.espera_valor('Z05 El mapa trae las 3 zonas recortadas al potrero (la de Otra, con sus ha de adentro y la nota)',
  $q$ select jsonb_array_length(m.zonas) || '|' ||
             (select pruebas.cerca((z ->> 'ha')::numeric, pruebas.ha(-56.4925, -56.49, -32.995, -32.99)) || ':' || (z ->> 'nota')
              from jsonb_array_elements(m.zonas) z where z ->> 'tipo' = 'Otra') || '|' ||
             (m.superficie_efectiva = pruebas.efe('P'))
      from public.v_potreros_mapa m where m.id = pruebas.id('P') $q$, '3|true:Galpón y corral|true');
select pruebas.espera_valor('Z06 La efectiva del establecimiento es la del potrero (el único)',
  $q$ select (public.superficie_efectiva_total(e) = pruebas.efe('P'))::text from public.establecimientos e where e.id = pruebas.id('est_a') $q$, 'true');
select pruebas.preparar('redibujar', $q$ select public.guardar_forma_potrero(pruebas.id('P'), pruebas.cuadro(-56.50, -56.49, -33.00, -32.995)) $q$);
select pruebas.espera_valor('Z07 Redibujar el potrero (la mitad de abajo): la efectiva se recalcula sola (Z3 queda afuera)',
  $q$ select pruebas.cerca(pruebas.efe('P'), pruebas.sup('P') - pruebas.ha(-56.50, -56.4925, -33.00, -32.995))::text $q$, 'true');
select pruebas.espera_ok('Z08a Borrar el bañado',
  $q$ select public.borrar_zona_potrero(pruebas.id('z2')) $q$);
select pruebas.espera_valor('Z08b Sin el bañado, la efectiva sube: superficie menos el monte',
  $q$ select pruebas.cerca(pruebas.efe('P'), pruebas.sup('P') - pruebas.ha(-56.50, -56.495, -33.00, -32.995))::text $q$, 'true');
select pruebas.espera_valor('Z09a Editar una zona: el monte pasa a Bañado y a la mitad de alto',
  $q$ select (pruebas.zona('z1', 'P', 't_banado', pruebas.cuadro(-56.50, -56.495, -33.00, -32.9975)) > 0)::text $q$, 'true');
select pruebas.espera_valor('Z09b Queda con el tipo nuevo y la efectiva se acomoda',
  $q$ select ((select tipo_id = pruebas.id('t_banado') from public.potrero_zonas where id = pruebas.id('z1'))
          and pruebas.cerca(pruebas.efe('P'), pruebas.sup('P') - pruebas.ha(-56.50, -56.495, -33.00, -32.9975)))::text $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Tipos de zona
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('T01 El operador no agrega tipos',
  $q$ insert into public.zona_tipos (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Pajonal') $q$, '42501');
select pruebas.como('u_admin');
select pruebas.espera_filas('T02 El administrador agrega un tipo',
  $q$ insert into public.zona_tipos (establecimiento_id, nombre, color) values (pruebas.id('est_a'), 'Pajonal', '#8a7a2e') $q$, 1);
select pruebas.espera_error('T03 Un tipo no se borra (se da de baja)',
  $q$ delete from public.zona_tipos where id = pruebas.id('t_otra') $q$, '42501');
select pruebas.espera_filas('T04 El administrador da de baja Monte',
  $q$ update public.zona_tipos set activo = false where id = pruebas.id('t_monte') $q$, 1);
select pruebas.como('u_operador');
select pruebas.espera_error('T05 Una zona nueva con un tipo dado de baja',
  $q$ select pruebas.zona('z4', 'P', 't_monte', pruebas.cuadro(-56.495, -56.49, -33.00, -32.9975)) $q$, '22023');
select pruebas.espera_error('T06 Una zona con un tipo de otro establecimiento',
  $q$ select pruebas.zona('z4', 'P', 't_x', pruebas.cuadro(-56.495, -56.49, -33.00, -32.9975)) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Permisos y potrero sin dibujar
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('O01 Nadie escribe directo en potrero_zonas',
  $q$ insert into public.potrero_zonas (establecimiento_id, potrero_id, tipo_id, forma)
      values (pruebas.id('est_a'), pruebas.id('P'), pruebas.id('t_otra'), extensions.st_multi(extensions.st_makeenvelope(-56.5, -33, -56.49, -32.99, 4326))) $q$, '42501');
select pruebas.como('u_consulta');
select pruebas.espera_error('Q01 Consulta no dibuja zonas',
  $q$ select pruebas.zona('z5', 'P', 't_otra', pruebas.cuadro(-56.495, -56.49, -33.00, -32.9975)) $q$, '42501');
select pruebas.espera_error('Q02 Ni las borra',
  $q$ select public.borrar_zona_potrero(pruebas.id('z1')) $q$, '42501');
select pruebas.espera_valor('Q03 Consulta ve las zonas',
  $q$ select count(*)::text from public.potrero_zonas where potrero_id = pruebas.id('P') $q$, '2');
select pruebas.como('u_ajeno');
select pruebas.espera_error('X01 Un usuario de otro campo no dibuja zonas',
  $q$ select pruebas.zona('z5', 'P', 't_otra', pruebas.cuadro(-56.495, -56.49, -33.00, -32.9975)) $q$, '42501');
select pruebas.espera_valor('X02 Ni las ve',
  $q$ select count(*)::text from public.potrero_zonas where potrero_id = pruebas.id('P') $q$, '0');

select pruebas.como('u_operador');
select pruebas.preparar('sin_forma', $q$ select public.guardar_forma_potrero(pruebas.id('P'), null) $q$);
select pruebas.espera_valor('Z10 Sin dibujo, el potrero no tiene superficie ni efectiva (las zonas siguen guardadas)',
  $q$ select coalesce(pruebas.sup('P')::text, 'null') || '|' || coalesce(pruebas.efe('P')::text, 'null') || '|'
          || (select count(*) from public.potrero_zonas where potrero_id = pruebas.id('P')) $q$, 'null|null|2');
select pruebas.espera_error('Z11 Con el potrero sin dibujar no se agregan zonas',
  $q$ select pruebas.zona('z5', 'P', 't_otra', pruebas.cuadro(-56.495, -56.49, -33.00, -32.9975)) $q$, '22023');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no ve las zonas',
  $q$ select count(*) from public.potrero_zonas $q$, '42501');
select pruebas.espera_error('N02 anon no dibuja zonas',
  $q$ select public.borrar_zona_potrero(gen_random_uuid()) $q$, '42501');

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
  raise exception E'PRUEBAS ÁREA EFECTIVA: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
