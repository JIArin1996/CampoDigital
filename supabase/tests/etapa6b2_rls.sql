-- Campo Digital v2 — Pruebas de la etapa 6b-2: destete
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261022000200_destete).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ETAPA 6B-2 (DESTETE): N OK, ...", que deshace todo.
--      El resultado esperado es "34 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia,
-- X = operador de otro campo.
--
-- Las claves de pruebas.id no distinguen mayúsculas (son parámetros de configuración): 'dp' y 'DP' serían la misma.

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



-- Línea {categoria_id, cabezas} y origen/destino del destete
create function pruebas.lin(p_cat text, p_cabezas int) returns jsonb language sql stable as $$
  select jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas)
$$;
create function pruebas.origen(p_lote text, p_lineas jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('lote_id', pruebas.id(p_lote), 'lineas', p_lineas)
$$;
create function pruebas.destino(p_nombre text, p_lineas jsonb, p_anios jsonb default '[]') returns jsonb language sql stable as $$
  select jsonb_build_object('nombre', p_nombre, 'anios_nacimiento', p_anios, 'lineas', p_lineas)
$$;
create function pruebas.prod(p_producto text, p_categoria text, p_carencia int default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('producto', p_producto, 'categoria', p_categoria, 'carencia_dias', p_carencia))
$$;
-- Lote por nombre (los destinos los crea la función)
create function pruebas.lote(p_nombre text) returns uuid language sql stable as $$
  select id from public.lotes where nombre = p_nombre and establecimiento_id = pruebas.id('est_a')
$$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres): checks y funciones
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 lote_eventos y operaciones_lote aceptan el tipo destete; el destete exige actividad',
  $q$ select (bool_and(pg_get_constraintdef(oid) like '%destete%'))::text || '|' || count(*)
      from pg_constraint
      where contype = 'c' and conname in ('lote_eventos_tipo_check', 'operaciones_lote_tipo_check', 'lote_eventos_actividad_check') $q$,
  'true|3');
select pruebas.espera_valor('B02 registrar_destete, anular_actividad y linaje_lote: una versión cada una, search_path fijo, authenticated sí y anon no; las dos primeras security definer',
  $q$ select count(*) filter (where coalesce('search_path=""' = any (p.proconfig), false)
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
              and (p.prosecdef or p.proname = 'linaje_lote'))::text || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('registrar_destete', 'anular_actividad', 'linaje_lote') $q$, '3/3');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador: establecimientos, roles y catálogo
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('vacunos',    $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('sin_sexar',  $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros/as' $q$);
select pruebas.guardar('terneros',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros' $q$);
select pruebas.guardar('terneras',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneras' $q$);
select pruebas.guardar('vacas_cria', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Vacas de cría' $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: lotes de cría, pariciones y una sanidad con carencia
-- ════════════════════════════════════════════════════════════════════════════
-- LM1: 30 vacas con 20 crías al pie sin sexar. LM2: 10 vacas con 4 terneros y 5 terneras al pie.
-- LC: lote de cría propio con 3 terneros (parición de LM2 a un lote nuevo).

select pruebas.como('u_operador');

select pruebas.guardar('LM1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LM1 Vacas', pruebas.d(300), pruebas.comp('vacas_cria', 30)) $q$);
select pruebas.guardar('LM2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LM2 Vacas', pruebas.d(300), pruebas.comp('vacas_cria', 10)) $q$);
select pruebas.preparar('pa1', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM1'),
      p_fecha => pruebas.d(150), p_lineas => pruebas.comp('sin_sexar', 20), p_lote_cria_id => pruebas.id('LM1')) $q$);
select pruebas.preparar('pa2', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM2'),
      p_fecha => pruebas.d(140), p_lineas => jsonb_build_array(pruebas.lin('terneros', 4), pruebas.lin('terneras', 5)), p_lote_cria_id => pruebas.id('LM2')) $q$);
select pruebas.guardar('pa3', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM2'),
      p_fecha => pruebas.d(130), p_lineas => pruebas.comp('terneros', 3), p_lote_cria_nuevo => jsonb_build_object('nombre', 'LC Cría propia')) $q$);
select pruebas.guardar('LC', $q$ select lote_cria_id from public.act_paricion where actividad_id = pruebas.id('pa3') $q$);
select pruebas.preparar('san', $q$ select public.registrar_sanidad(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_lotes => array[pruebas.id('LM1')], p_fecha => pruebas.d(20), p_productos => jsonb_build_array(pruebas.prod('Ivermectina', 'Antiparasitario', 60))) $q$);

-- Un archivo visible en LM1 (cargado como postgres: la subida a Storage ya la prueba lote_archivos_rls.sql)
reset role;
select set_config('test.arch', gen_random_uuid()::text, false);
select pruebas.preparar('arch', $q$
  insert into public.archivos (id, establecimiento_id, ruta, nombre, tipo_mime, tamano_bytes, tipo)
  values (pruebas.id('arch'), pruebas.id('est_a'), pruebas.id('est_a') || '/' || pruebas.id('arch'), 'Trazabilidad LM1.pdf', 'application/pdf', 100, 'trazabilidad') $q$);
select pruebas.preparar('arch', $q$
  insert into public.lote_archivos (lote_id, archivo_id, establecimiento_id) values (pruebas.id('LM1'), pruebas.id('arch'), pruebas.id('est_a')) $q$);
set local role authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Destete de tres orígenes a dos destinos, con sexo asignado a las sin sexar
-- ════════════════════════════════════════════════════════════════════════════
-- Sale: LM1 20 sin sexar; LM2 4 terneros y 5 terneras; LC 3 terneros (32).
-- Las 20 sin sexar se separan en 11 machos y 9 hembras. Entra: DM 18 terneros (4 + 3 + 11) y DH 14 terneras (5 + 9).

select set_config('test.d1', gen_random_uuid()::text, false);
select pruebas.espera_valor('D00 Destete: devuelve el id de la actividad',
  $q$ select (public.registrar_destete(pruebas.id('d1'), pruebas.id('est_a'), pruebas.d(10),
      jsonb_build_array(
        pruebas.origen('LM1', jsonb_build_array(pruebas.lin('sin_sexar', 20))),
        pruebas.origen('LM2', jsonb_build_array(pruebas.lin('terneros', 4), pruebas.lin('terneras', 5))),
        pruebas.origen('LC',  jsonb_build_array(pruebas.lin('terneros', 3)))),
      jsonb_build_array(
        pruebas.destino('DM Terneros destetados', jsonb_build_array(pruebas.lin('terneros', 18)), '[2025]'),
        pruebas.destino('DH Terneras destetadas', jsonb_build_array(pruebas.lin('terneras', 14))))) = pruebas.id('d1'))::text $q$, 'true');
select pruebas.guardar('DM', $q$ select pruebas.lote('DM Terneros destetados') $q$);
select pruebas.guardar('DH', $q$ select pruebas.lote('DH Terneras destetadas') $q$);

select pruebas.espera_valor('D01 Orígenes: LM1 y LM2 sin crías y con sus vacas, abiertos; LC vacío y cerrado (estados por nombre: LC, LM1, LM2)',
  $q$ select pruebas.stock('LM1', 'sin_sexar') || '|' || pruebas.stock('LM1', 'vacas_cria') || '|'
          || pruebas.stock('LM2', 'terneros') || '|' || pruebas.stock('LM2', 'terneras') || '|' || pruebas.stock('LM2', 'vacas_cria') || '|'
          || (select string_agg(estado, ',' order by nombre) from public.lotes where id in (pruebas.id('LM1'), pruebas.id('LM2'), pruebas.id('LC'))) $q$,
  '0|30|0|0|10|cerrado,activo,activo');
select pruebas.espera_valor('D02 Destinos: DM 18 terneros, DH 14 terneras, ninguna sin sexar; abiertos el día del destete',
  $q$ select pruebas.stock('DM', 'terneros') || '|' || pruebas.stock('DH', 'terneras') || '|'
          || (pruebas.stock('DM', 'sin_sexar') + pruebas.stock('DH', 'sin_sexar')) || '|'
          || (select bool_and(estado = 'activo' and fecha_apertura = pruebas.d(10))::text from public.lotes where id in (pruebas.id('DM'), pruebas.id('DH'))) $q$,
  '18|14|0|true');
select pruebas.espera_valor('D03 LC se cerró con el motivo "Destetado"',
  $q$ select tipo || '|' || motivo from public.lote_cambios_estado where lote_id = pruebas.id('LC') $q$, 'cierre|Destetado');
select pruebas.espera_valor('D04 Años del destino: los indicados (DM {2025}, DH sin años)',
  $q$ select string_agg(nombre || ':' || anios_nacimiento::text, ' ' order by nombre) from public.lotes where id in (pruebas.id('DM'), pruebas.id('DH')) $q$,
  'DH Terneras destetadas:{} DM Terneros destetados:{2025}');
select pruebas.espera_valor('D05 Totales de la actividad: lo que entró por categoría, ya sexado',
  $q$ select string_agg(c.nombre || ':' || l.cabezas, ' ' order by c.nombre) from public.actividad_lineas l
      join public.categorias_animales c on c.id = l.categoria_id where l.actividad_id = pruebas.id('d1') $q$, 'Terneras:14 Terneros:18');
select pruebas.espera_valor('D06 actividad_lotes: 3 orígenes y 2 destinos; sin lote principal',
  $q$ select (select count(*) filter (where rol = 'origen') || '|' || count(*) filter (where rol = 'destino') || '|' || count(*) filter (where rol = 'principal')
              from public.actividad_lotes where actividad_id = pruebas.id('d1'))
          || '|' || coalesce((select lote_id::text from public.actividades where id = pruebas.id('d1')), 'sin lote') $q$, '3|2|0|sin lote');
select pruebas.espera_valor('D07 Pares que aportaron: LM1 a los dos (sin sexar), LM2 a los dos, LC solo a DM (5 operaciones sin eventos)',
  $q$ select string_agg(lo.nombre || '>' || ld.nombre, ' ' order by lo.nombre, ld.nombre)
          || '|' || (select count(*) from public.lote_eventos e join public.operaciones_lote o on o.id = e.operacion_lote_id where o.actividad_id = pruebas.id('d1'))
      from public.operaciones_lote o
      join public.operacion_lote_vinculos vo on vo.operacion_id = o.id and vo.rol = 'origen'
      join public.operacion_lote_vinculos vd on vd.operacion_id = o.id and vd.rol = 'destino'
      join public.lotes lo on lo.id = vo.lote_id
      join public.lotes ld on ld.id = vd.lote_id
      where o.actividad_id = pruebas.id('d1') and o.tipo = 'destete' $q$,
  'LC Cría propia>DM Terneros destetados LM1 Vacas>DH Terneras destetadas LM1 Vacas>DM Terneros destetados LM2 Vacas>DH Terneras destetadas LM2 Vacas>DM Terneros destetados|0');
select pruebas.espera_valor('D08 Carencia de LM1 heredada por los dos destinos (más restrictiva: hasta d-20 + 60)',
  $q$ select string_agg(l.nombre || ':' || (max_fin = pruebas.d(20) + 60)::text, ' ' order by l.nombre)
      from (select lote_id, max(fin_carencia) as max_fin from public.v_carencias where heredada group by lote_id) c
      join public.lotes l on l.id = c.lote_id
      where c.lote_id in (pruebas.id('DM'), pruebas.id('DH')) $q$,
  'DH Terneras destetadas:true DM Terneros destetados:true');
select pruebas.espera_valor('D09 Linaje de DM: viene de LM1, LM2 y LC',
  $q$ select string_agg(nombre, ', ' order by nombre) from public.linaje_lote(pruebas.id('DM')) where relacion = 'ancestro' $q$,
  'LC Cría propia, LM1 Vacas, LM2 Vacas');
select pruebas.espera_valor('D10 Archivos: cada destino recibe el archivo visible de LM1, heredado de LM1',
  $q$ select count(*) filter (where heredado_de_lote_id = pruebas.id('LM1'))::text from public.lote_archivos
      where archivo_id = pruebas.id('arch') and lote_id in (pruebas.id('DM'), pruebas.id('DH')) $q$, '2');
select pruebas.espera_valor('D11 Idempotente: el mismo envío otra vez devuelve el mismo id y no crea lotes',
  $q$ select (public.registrar_destete(pruebas.id('d1'), pruebas.id('est_a'), pruebas.d(10),
      jsonb_build_array(pruebas.origen('LM1', jsonb_build_array(pruebas.lin('sin_sexar', 20)))),
      jsonb_build_array(pruebas.destino('DM Terneros destetados', jsonb_build_array(pruebas.lin('terneros', 20))))) = pruebas.id('d1'))::text
      || '|' || (select count(*) from public.lotes where nombre = 'DM Terneros destetados') $q$, 'true|1');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Destete parcial y rechazos
-- ════════════════════════════════════════════════════════════════════════════
-- LM3: 8 vacas con 2 terneras al pie.

select pruebas.guardar('LM3', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LM3 Vacas', pruebas.d(300), pruebas.comp('vacas_cria', 8)) $q$);
select pruebas.preparar('pa4', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM3'),
      p_fecha => pruebas.d(100), p_lineas => pruebas.comp('terneras', 2), p_lote_cria_id => pruebas.id('LM3')) $q$);

select pruebas.espera_error('R01 Un destino no puede recibir crías sin sexar',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(5),
      jsonb_build_array(pruebas.origen('LM3', jsonb_build_array(pruebas.lin('terneras', 2)))),
      jsonb_build_array(pruebas.destino('X', jsonb_build_array(pruebas.lin('sin_sexar', 2))))) $q$, '22023');
select pruebas.espera_error('R02 Una ternera ya sexada no entra como ternero',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(5),
      jsonb_build_array(pruebas.origen('LM3', jsonb_build_array(pruebas.lin('terneras', 2)))),
      jsonb_build_array(pruebas.destino('X', jsonb_build_array(pruebas.lin('terneros', 2))))) $q$, '22023');
select pruebas.espera_error('R03 Totales que no cierran (salen 2, entra 1)',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(5),
      jsonb_build_array(pruebas.origen('LM3', jsonb_build_array(pruebas.lin('terneras', 2)))),
      jsonb_build_array(pruebas.destino('X', jsonb_build_array(pruebas.lin('terneras', 1))))) $q$, '22023');
select pruebas.espera_error('R04 Las vacas no se destetan',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(5),
      jsonb_build_array(pruebas.origen('LM3', jsonb_build_array(pruebas.lin('vacas_cria', 1)))),
      jsonb_build_array(pruebas.destino('X', jsonb_build_array(pruebas.lin('terneras', 1))))) $q$, '22023');
select pruebas.espera_error('R05 Origen cerrado (LC)',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(5),
      jsonb_build_array(pruebas.origen('LC', jsonb_build_array(pruebas.lin('terneros', 1)))),
      jsonb_build_array(pruebas.destino('X', jsonb_build_array(pruebas.lin('terneros', 1))))) $q$, '22023');
select pruebas.espera_error('R06 Más crías de las que hay (5 terneras, hay 2): saldo negativo',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(5),
      jsonb_build_array(pruebas.origen('LM3', jsonb_build_array(pruebas.lin('terneras', 5)))),
      jsonb_build_array(pruebas.destino('X', jsonb_build_array(pruebas.lin('terneras', 5))))) $q$, '23514');
select pruebas.espera_valor('R07 Los rechazos no dejaron lotes ni actividades',
  $q$ select (select count(*) from public.lotes where nombre = 'X' and establecimiento_id = pruebas.id('est_a'))
          || '|' || (select count(*) from public.actividades where tipo = 'destete' and establecimiento_id = pruebas.id('est_a')) $q$, '0|1');

-- LE: 3 terneros desde d-50 y una baja a d-5; destetar 2 a d-10 lo dejaría vacío con un movimiento posterior
select pruebas.guardar('LE', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LE Terneros', pruebas.d(50), pruebas.comp('terneros', 3)) $q$);
select pruebas.preparar('aj_LE', $q$ select public.registrar_ajuste(pruebas.id('LE'), pruebas.id('terneros'), -1, pruebas.d(5), 'Murió') $q$);
select pruebas.espera_error('R08 Origen que queda vacío con un movimiento posterior a la fecha del destete',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(10),
      jsonb_build_array(pruebas.origen('LE', jsonb_build_array(pruebas.lin('terneros', 2)))),
      jsonb_build_array(pruebas.destino('X', jsonb_build_array(pruebas.lin('terneros', 2))))) $q$, '22023');

select pruebas.guardar('dest_parcial', $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(5),
      jsonb_build_array(pruebas.origen('LM3', jsonb_build_array(pruebas.lin('terneras', 1)))),
      jsonb_build_array(pruebas.destino('DP Parcial', jsonb_build_array(pruebas.lin('terneras', 1))))) $q$);
select pruebas.guardar('DP', $q$ select pruebas.lote('DP Parcial') $q$);
select pruebas.espera_valor('P01 Destete parcial: LM3 sigue abierto con 1 ternera y sus 8 vacas; DP con 1',
  $q$ select pruebas.stock('LM3', 'terneras') || '|' || pruebas.stock('LM3', 'vacas_cria') || '|' || pruebas.stock('DP', 'terneras') || '|'
          || (select estado from public.lotes where id = pruebas.id('LM3')) $q$, '1|8|1|activo');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Anulación
-- ════════════════════════════════════════════════════════════════════════════

-- DP con un ajuste del mismo día del destete, cargado después: bloquea
select pruebas.preparar('aj_DP', $q$ select public.registrar_ajuste(pruebas.id('DP'), pruebas.id('terneras'), 1, pruebas.d(5), 'Apareció otra') $q$);
select pruebas.espera_error('A01 No se anula si un destino tuvo un movimiento (aunque sea del mismo día, cargado después)',
  $q$ select public.anular_actividad(pruebas.id('dest_parcial'), 'Prueba') $q$, '22023');

-- d1: una pesada en DM bloquea
select pruebas.guardar('pe1', $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('DM'), p_fecha => pruebas.d(9),
      p_lineas => jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('terneros'), 'cabezas', 18, 'peso_vivo_total_kg', 3240))) $q$);
select pruebas.espera_error('A02 No se anula con una pesada en un destino',
  $q$ select public.anular_actividad(pruebas.id('d1'), 'Prueba') $q$, '22023');
select pruebas.preparar('anul_pe1', $q$ select public.anular_actividad(pruebas.id('pe1'), 'Se carga de nuevo') $q$);
select pruebas.preparar('san_DH', $q$ select public.registrar_sanidad(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_lotes => array[pruebas.id('DH')], p_fecha => pruebas.d(8), p_productos => jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$);
select pruebas.espera_ok('A03 Con la pesada anulada y una sanidad en DH (no bloquea), se anula',
  $q$ select public.anular_actividad(pruebas.id('d1'), 'Destete cargado por error') $q$);
select pruebas.espera_valor('A04 Los orígenes recuperan sus crías (las 20 vuelven sin sexar) y LC se reabre',
  $q$ select pruebas.stock('LM1', 'sin_sexar') || '|' || pruebas.stock('LM2', 'terneros') || '|' || pruebas.stock('LM2', 'terneras') || '|'
          || pruebas.stock('LC', 'terneros') || '|' || (select estado from public.lotes where id = pruebas.id('LC')) $q$, '20|4|5|3|activo');
select pruebas.espera_valor('A05 Los destinos quedan vacíos y cerrados',
  $q$ select (pruebas.stock('DM', 'terneros') + pruebas.stock('DH', 'terneras')) || '|'
          || (select string_agg(estado, ',') from public.lotes where id in (pruebas.id('DM'), pruebas.id('DH'))) $q$, '0|cerrado,cerrado');
select pruebas.espera_valor('A06 El linaje de LM1 ya no muestra los destinos del destete anulado',
  $q$ select count(*)::text from public.linaje_lote(pruebas.id('LM1')) where relacion = 'descendiente' $q$, '0');
select pruebas.espera_valor('A07 La carencia heredada por los destinos deja de contar',
  $q$ select count(*)::text from public.v_carencias where lote_id in (pruebas.id('DM'), pruebas.id('DH')) and heredada $q$, '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Permisos
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_error('Q01 Consulta no desteta',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(1),
      jsonb_build_array(pruebas.origen('LM1', jsonb_build_array(pruebas.lin('sin_sexar', 1)))),
      jsonb_build_array(pruebas.destino('X', jsonb_build_array(pruebas.lin('terneros', 1))))) $q$, '42501');

select pruebas.como('u_ajeno');
select pruebas.espera_error('X01 Un operador de otro establecimiento no desteta lotes de Santa Remigia',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_x'), pruebas.d(1),
      jsonb_build_array(pruebas.origen('LM1', jsonb_build_array(pruebas.lin('sin_sexar', 1)))),
      jsonb_build_array(pruebas.destino('X', jsonb_build_array(pruebas.lin('terneros', 1))))) $q$, '42501');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no desteta',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(1), '[]'::jsonb, '[]'::jsonb) $q$, '42501');

reset role;
select pruebas.espera_error('Z01 Un evento de destete sin actividad se rechaza aun como postgres',
  $q$ insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo)
      values (pruebas.id('est_a'), pruebas.id('LM1'), pruebas.id('vacunos'), pruebas.id('sin_sexar'), 1, pruebas.d(1), 'destete') $q$, '23514');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS ETAPA 6B-2 (DESTETE): % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
