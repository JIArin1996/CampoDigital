-- Campo Digital v2 — Pruebas de editar mortandad, parición, sanidad, servicio, diagnóstico, esquila,
-- personalizada y destete (paso 2b)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261104000300_editar_resto_de_actividades).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS EDITAR EL RESTO DE LAS ACTIVIDADES: N OK, ...", que deshace todo.
--      El resultado esperado es "68 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Al día con 20261104000600_bitacora_tres_tipos: la próxima dosis dada figura como realizada en el calendario.
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Las pruebas B05 y B06 miran los datos reales (antes de cargar los de prueba): verifican que las
-- marcas de dosis dada que ya existían quedaron bien convertidas al id del producto.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días; "d(-10)" = dentro de 10 días.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia.

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

-- Lote con sus líneas (orígenes y destinos del destete): {"lote_id", "lineas"}
create function pruebas.lote_con(p_lote text, p_lineas jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('lote_id', pruebas.id(p_lote), 'lineas', p_lineas)
$$;

-- Destino nuevo de registrar_destete: {"nombre", "lineas"}
create function pruebas.destino_nuevo(p_nombre text, p_lineas jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('nombre', p_nombre, 'lineas', p_lineas)
$$;

-- Producto de sanidad; p_id: la clave del producto (para editarlo) o null (nuevo)
create function pruebas.prod(p_id text, p_producto text, p_categoria text, p_proxima date default null) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', case when p_id is not null then pruebas.id(p_id) end,
    'producto', p_producto, 'categoria', p_categoria, 'fecha_proxima_dosis', p_proxima))
$$;

-- Id del producto de una sanidad por nombre
create function pruebas.producto(p_sanidad text, p_nombre text) returns uuid language sql stable as $$
  select id from public.act_sanidad_productos where actividad_id = pruebas.id(p_sanidad) and producto = p_nombre
$$;

-- Marcas de dosis dada vigentes de una sanidad, por producto ("Aftosa,Ivermectina")
create function pruebas.dadas(p_sanidad text) returns text language sql stable as $$
  select coalesce(string_agg(p.producto, ',' order by p.producto), '')
  from public.sanidad_dosis_dadas d join public.act_sanidad_productos p on p.id = d.producto_id
  where d.actividad_id = pruebas.id(p_sanidad) and d.deshecha_en is null
$$;

-- Productos de una sanidad en orden ("Ivermectina,Aftosa")
create function pruebas.productos(p_sanidad text) returns text language sql stable as $$
  select coalesce(string_agg(producto, ',' order by orden), '') from public.act_sanidad_productos where actividad_id = pruebas.id(p_sanidad)
$$;

-- Eventos de stock de una actividad: cuántos y la suma ("n|suma")
create function pruebas.eventos(p_clave text) returns text language sql stable as $$
  select count(*) || '|' || coalesce(sum(cabezas), 0) from public.lote_eventos where actividad_id = pruebas.id(p_clave)
$$;

-- Registros de cierre y reapertura de un lote ("cierres|reaperturas")
create function pruebas.cambios(p_lote text) returns text language sql stable as $$
  select count(*) filter (where tipo = 'cierre') || '|' || count(*) filter (where tipo = 'reapertura')
  from public.lote_cambios_estado where lote_id = pruebas.id(p_lote)
$$;

-- Id de un lote por nombre (los destinos que crea el destete)
create function pruebas.lote(p_nombre text) returns uuid language sql stable as $$
  select id from public.lotes where nombre = p_nombre and establecimiento_id = pruebas.id('est_a')
$$;

-- Con la marca de una actividad, trata de actualizar un producto de sanidad de otra
create function pruebas.actualizar_producto_con_marca(p_marca text, p_producto uuid) returns void language plpgsql as $$
begin
  perform public._marcar_actividad(pruebas.id(p_marca));
  update public.act_sanidad_productos set dosis = 'x' where id = p_producto;
end $$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres): funciones nuevas y conversión de las marcas de dosis dada
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 Las 8 editar_<tipo> nuevas: security definer, search_path fijo, authenticated sí y anon no',
  $q$ select count(*) filter (where p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('editar_mortandad', 'editar_paricion', 'editar_sanidad', 'editar_servicio', 'editar_diagnostico',
                          'editar_esquila', 'editar_personalizada', 'editar_destete') $q$, '8/8');
select pruebas.espera_valor('B02 Las 14 internas y de trigger nuevas: search_path fijo, sin security definer y nadie las ejecuta por la API',
  $q$ select count(*) filter (where not p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_validar_lote_cria', '_cargar_mortandad', '_cargar_paricion', '_cargar_productos_sanidad', '_cargar_servicio',
                          '_cargar_diagnostico', '_cargar_esquila', '_cargar_personalizada', '_origenes_destete', '_cargar_destete',
                          '_actividad_para_editar', '_actualizar_actividad', '_lote_para_editar', 'proteger_vinculo_de_actividad') $q$, '14/14');
select pruebas.espera_valor('B03 Las 8 registrar_<tipo>: una versión cada una (misma firma)',
  $q$ select count(*)::text from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('registrar_mortandad', 'registrar_paricion', 'registrar_sanidad', 'registrar_servicio', 'registrar_diagnostico',
                          'registrar_esquila', 'registrar_personalizada', 'registrar_destete') $q$, '8');
select pruebas.espera_valor('B04 Productos de sanidad: clave id; dosis dadas: clave producto_id y sin columna orden',
  $q$ select (select string_agg(a.attname, ',') from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
              where c.conrelid = 'public.act_sanidad_productos'::regclass and c.contype = 'p')
          || '|' || (select string_agg(a.attname, ',') from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
              where c.conrelid = 'public.sanidad_dosis_dadas'::regclass and c.contype = 'p')
          || '|' || (select count(*) from information_schema.columns
                     where table_schema = 'public' and table_name = 'sanidad_dosis_dadas' and column_name = 'orden') $q$, 'id|producto_id|0');
-- Datos reales, antes de cargar nada de prueba: las marcas que ya existían quedaron bien convertidas
select pruebas.espera_valor('B05 Toda marca de dosis dada que ya existía apunta a un producto de su misma sanidad, con próxima dosis',
  $q$ select count(*)::text from public.sanidad_dosis_dadas d
      left join public.act_sanidad_productos p on p.id = d.producto_id
      where p.id is null or p.actividad_id <> d.actividad_id or p.fecha_proxima_dosis is null $q$, '0');
select pruebas.espera_valor('B06 Ningún producto de una sanidad repite orden',
  $q$ select count(*)::text from (select actividad_id, orden from public.act_sanidad_productos group by 1, 2 having count(*) > 1) x $q$, '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Preparación
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.guardar('vacunos',     $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('ovinos',      $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovinos' $q$);
select pruebas.guardar('novillos',    $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('vacas_cria',  $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Vacas de cría' $q$);
select pruebas.guardar('sin_sexar',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros/as' $q$);
select pruebas.guardar('terneros',    $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros' $q$);
select pruebas.guardar('terneras',    $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneras' $q$);
select pruebas.guardar('ovejas_cria', $q$ select id from public.categorias_animales where especie_id = pruebas.id('ovinos') and nombre = 'Ovejas de cría' $q$);

select pruebas.como('u_operador');
select pruebas.guardar('LV',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV Novillos', pruebas.d(60), pruebas.comp('novillos', 20)) $q$);
select pruebas.guardar('LM',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LM Vacas', pruebas.d(300), pruebas.comp('vacas_cria', 30)) $q$);
select pruebas.guardar('LM2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LM2 Vacas', pruebas.d(300), pruebas.comp('vacas_cria', 10)) $q$);
select pruebas.guardar('LO',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('ovinos'), 'LO Ovejas', pruebas.d(60), pruebas.comp('ovejas_cria', 20)) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Mortandad
-- ════════════════════════════════════════════════════════════════════════════
-- LV: 20 novillos (d-60); m1: mueren 2 (d-10); v1: se venden 17 (d-5): queda 1.

select pruebas.guardar('m1', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 2))) $q$);
select pruebas.guardar('v1', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 17)), p_modalidad => 'remate') $q$);

select pruebas.espera_ok('M01 Mortandad de 2 a 3 novillos (queda en cero después de la venta): se acepta',
  $q$ select public.editar_mortandad(p_actividad_id => pruebas.id('m1'), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 3))) $q$);
select pruebas.espera_valor('M02 LV con 0 novillos; la mortandad, un solo evento de -3',
  $q$ select pruebas.stock('LV', 'novillos') || '|' || pruebas.eventos('m1') $q$, '0|1|-3');
select pruebas.espera_error('M03 De 3 a 4: el stock quedaría negativo después de la venta',
  $q$ select public.editar_mortandad(p_actividad_id => pruebas.id('m1'), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 4))) $q$, '23514');
select pruebas.espera_ok('M04 Cambiar la causa y las observaciones',
  $q$ select public.editar_mortandad(p_actividad_id => pruebas.id('m1'), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 3)), p_causa => 'Enfermedad', p_observaciones => 'Neumonía') $q$);
select pruebas.espera_valor('M05 La vista trae la causa y las observaciones nuevas',
  $q$ select causa || '|' || observaciones from public.v_actividades where id = pruebas.id('m1') $q$, 'Enfermedad|Neumonía');
select pruebas.espera_error('M06 Causa que no existe',
  $q$ select public.editar_mortandad(p_actividad_id => pruebas.id('m1'), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 3)), p_causa => 'Inventada') $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Parición
-- ════════════════════════════════════════════════════════════════════════════
-- pa1: 12 crías al pie en LM (d-40). pa2: 6 crías de LM2 a un lote nuevo LC (d-30).

select pruebas.guardar('pa1', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'),
      p_fecha => pruebas.d(40), p_lineas => jsonb_build_array(pruebas.lin('sin_sexar', 12)), p_lote_cria_id => pruebas.id('LM')) $q$);
select pruebas.guardar('pa2', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM2'),
      p_fecha => pruebas.d(30), p_lineas => jsonb_build_array(pruebas.lin('sin_sexar', 6)),
      p_lote_cria_nuevo => jsonb_build_object('nombre', 'LC Cría nueva')) $q$);
select pruebas.guardar('LC', $q$ select lote_creado_id from public.actividades where id = pruebas.id('pa2') $q$);

select pruebas.espera_ok('P01 Parición al pie de 12 a 10 crías',
  $q$ select public.editar_paricion(p_actividad_id => pruebas.id('pa1'), p_lote_madres_id => pruebas.id('LM'), p_fecha => pruebas.d(40),
      p_lineas => jsonb_build_array(pruebas.lin('sin_sexar', 10)), p_lote_cria_id => pruebas.id('LM')) $q$);
select pruebas.espera_valor('P02 LM con 10 crías; el lote queda como principal y como cría',
  $q$ select pruebas.stock('LM', 'sin_sexar') || '|'
          || (select string_agg(rol, ',' order by rol) from public.actividad_lotes where actividad_id = pruebas.id('pa1') and lote_id = pruebas.id('LM')) $q$,
  '10|cria,principal');
select pruebas.espera_ok('P03 Las crías pasan a otro lote de cría (LM2), con 2 nacidos muertos',
  $q$ select public.editar_paricion(p_actividad_id => pruebas.id('pa1'), p_lote_madres_id => pruebas.id('LM'), p_fecha => pruebas.d(40),
      p_lineas => jsonb_build_array(pruebas.lin('sin_sexar', 10)), p_nacidos_muertos => 2, p_lote_cria_id => pruebas.id('LM2')) $q$);
select pruebas.espera_valor('P04 LM sin crías, LM2 con las 10 (las de pa2 están en LC); nacidos muertos 2',
  $q$ select pruebas.stock('LM', 'sin_sexar') || '|' || pruebas.stock('LM2', 'sin_sexar') || '|'
          || (select nacidos_muertos from public.v_actividades where id = pruebas.id('pa1')) $q$, '0|10|2');
select pruebas.espera_error('P05 La parición que creó LC no pasa a otro lote de cría',
  $q$ select public.editar_paricion(p_actividad_id => pruebas.id('pa2'), p_lote_madres_id => pruebas.id('LM2'), p_fecha => pruebas.d(30),
      p_lineas => jsonb_build_array(pruebas.lin('sin_sexar', 6)), p_lote_cria_id => pruebas.id('LM')) $q$, '22023');
select pruebas.espera_ok('P06 Sin indicar lote de cría, queda en LC: de 6 a 7',
  $q$ select public.editar_paricion(p_actividad_id => pruebas.id('pa2'), p_lote_madres_id => pruebas.id('LM2'), p_fecha => pruebas.d(30),
      p_lineas => jsonb_build_array(pruebas.lin('sin_sexar', 7))) $q$);
select pruebas.espera_valor('P07 LC con 7 crías y sigue siendo el lote que creó la parición',
  $q$ select pruebas.stock('LC', 'sin_sexar') || '|' || (lote_creado_id = pruebas.id('LC'))::text from public.actividades where id = pruebas.id('pa2') $q$, '7|true');
select pruebas.espera_error('P08 Una parición no suma vacas (solo categorías de cría al pie)',
  $q$ select public.editar_paricion(p_actividad_id => pruebas.id('pa2'), p_lote_madres_id => pruebas.id('LM2'), p_fecha => pruebas.d(30),
      p_lineas => jsonb_build_array(pruebas.lin('vacas_cria', 1))) $q$, '22023');
select pruebas.espera_error('P09 La fecha no se adelanta antes de la apertura del lote que creó',
  $q$ select public.editar_paricion(p_actividad_id => pruebas.id('pa2'), p_lote_madres_id => pruebas.id('LM2'), p_fecha => pruebas.d(35),
      p_lineas => jsonb_build_array(pruebas.lin('sin_sexar', 7))) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Sanidad por id
-- ════════════════════════════════════════════════════════════════════════════
-- san: en LM (d-20). Aftosa (próxima d+10), Ivermectina (próxima d+20) y Clostridial (sin próxima).
-- Se marcan dadas las dos próximas dosis.

select pruebas.guardar('san', $q$ select public.registrar_sanidad(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_lotes => array[pruebas.id('LM')], p_fecha => pruebas.d(20), p_productos => jsonb_build_array(
        pruebas.prod(null, 'Aftosa', 'Vacunación', pruebas.d(-10)),
        pruebas.prod(null, 'Ivermectina', 'Antiparasitario', pruebas.d(-20)),
        pruebas.prod(null, 'Clostridial', 'Vacunación'))) $q$);
select pruebas.guardar('pA', $q$ select pruebas.producto('san', 'Aftosa') $q$);
select pruebas.guardar('pI', $q$ select pruebas.producto('san', 'Ivermectina') $q$);
select pruebas.guardar('pC', $q$ select pruebas.producto('san', 'Clostridial') $q$);
select pruebas.preparar('dada_A', $q$ select public.marcar_dosis_dada(pruebas.id('san'), 1) $q$);
select pruebas.preparar('dada_I', $q$ select public.marcar_dosis_dada(pruebas.id('san'), 2) $q$);
select pruebas.espera_valor('D00 Preparación: 3 productos en orden, con ids; las dos próximas dosis marcadas como dadas',
  $q$ select pruebas.productos('san') || '|' || pruebas.dadas('san') $q$, 'Aftosa,Ivermectina,Clostridial|Aftosa,Ivermectina');

select pruebas.espera_ok('D01 Reordenar: Ivermectina, Aftosa, Clostridial (cada uno con su id y su misma fecha)',
  $q$ select public.editar_sanidad(p_actividad_id => pruebas.id('san'), p_lotes => array[pruebas.id('LM')], p_fecha => pruebas.d(20),
      p_productos => jsonb_build_array(
        pruebas.prod('pI', 'Ivermectina', 'Antiparasitario', pruebas.d(-20)),
        pruebas.prod('pA', 'Aftosa', 'Vacunación', pruebas.d(-10)),
        pruebas.prod('pC', 'Clostridial', 'Vacunación'))) $q$);
select pruebas.espera_valor('D02 El orden cambia y las marcas siguen con su producto (no con la posición)',
  $q$ select pruebas.productos('san') || '|' || pruebas.dadas('san')
          || '|' || (select string_agg(estado, ',' order by orden) from public.v_calendario where actividad_id = pruebas.id('san')) $q$,
  'Ivermectina,Aftosa,Clostridial|Aftosa,Ivermectina|realizada,realizada');
select pruebas.espera_valor('D03 Los productos conservan su id',
  $q$ select (pruebas.producto('san', 'Ivermectina') = pruebas.id('pI') and pruebas.producto('san', 'Aftosa') = pruebas.id('pA'))::text $q$, 'true');

select pruebas.espera_ok('D04 Cambia la fecha de Ivermectina, se saca Clostridial y se agrega Brucelosis (sin id)',
  $q$ select public.editar_sanidad(p_actividad_id => pruebas.id('san'), p_lotes => array[pruebas.id('LM')], p_fecha => pruebas.d(20),
      p_productos => jsonb_build_array(
        pruebas.prod('pI', 'Ivermectina', 'Antiparasitario', pruebas.d(-25)),
        pruebas.prod('pA', 'Aftosa', 'Vacunación', pruebas.d(-10)),
        pruebas.prod(null, 'Brucelosis', 'Vacunación'))) $q$);
select pruebas.espera_valor('D05 Ivermectina (fecha nueva) pierde la marca; Aftosa (misma fecha) la conserva; Clostridial ya no está',
  $q$ select pruebas.productos('san') || '|' || pruebas.dadas('san') $q$, 'Ivermectina,Aftosa,Brucelosis|Aftosa');
select pruebas.espera_valor('D06 El calendario muestra Ivermectina en la fecha nueva, pendiente',
  $q$ select (fecha = pruebas.d(-25))::text || '|' || estado from public.v_calendario where producto_id = pruebas.id('pI') $q$, 'true|pendiente');

select pruebas.espera_ok('D07 Se saca Aftosa, que tenía la dosis marcada como dada',
  $q$ select public.editar_sanidad(p_actividad_id => pruebas.id('san'), p_lotes => array[pruebas.id('LM')], p_fecha => pruebas.d(20),
      p_productos => jsonb_build_array(
        pruebas.prod('pI', 'Ivermectina', 'Antiparasitario', pruebas.d(-25)),
        jsonb_build_object('id', pruebas.producto('san', 'Brucelosis'), 'producto', 'Brucelosis', 'categoria', 'Vacunación'))) $q$);
select pruebas.espera_valor('D08 Aftosa y su marca se van; quedan Ivermectina y Brucelosis, sin marcas',
  $q$ select pruebas.productos('san') || '|' || pruebas.dadas('san')
          || '|' || (select count(*) from public.sanidad_dosis_dadas where producto_id = pruebas.id('pA')) $q$, 'Ivermectina,Brucelosis||0');
select pruebas.espera_ok('D09 marcar_dosis_dada sigue funcionando con el orden que ve la app (Ivermectina, primera)',
  $q$ select public.marcar_dosis_dada(pruebas.id('san'), 1) $q$);
select pruebas.espera_valor('D10 ...y la marca queda en el producto Ivermectina',
  $q$ select pruebas.dadas('san') || '|' || (select count(*) from public.sanidad_dosis_dadas where producto_id = pruebas.id('pI')) $q$, 'Ivermectina|1');

-- Otra sanidad, para probar ids ajenos
select pruebas.guardar('san2', $q$ select public.registrar_sanidad(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_lotes => array[pruebas.id('LM2')], p_fecha => pruebas.d(15), p_productos => jsonb_build_array(pruebas.prod(null, 'Aftosa', 'Vacunación'))) $q$);
select pruebas.espera_error('D11 Un producto de otra sanidad no se edita desde esta',
  $q$ select public.editar_sanidad(p_actividad_id => pruebas.id('san'), p_lotes => array[pruebas.id('LM')], p_fecha => pruebas.d(20),
      p_productos => jsonb_build_array(jsonb_build_object('id', pruebas.producto('san2', 'Aftosa'), 'producto', 'Aftosa', 'categoria', 'Vacunación'))) $q$, '22023');
select pruebas.espera_error('D12 El mismo producto dos veces',
  $q$ select public.editar_sanidad(p_actividad_id => pruebas.id('san'), p_lotes => array[pruebas.id('LM')], p_fecha => pruebas.d(20),
      p_productos => jsonb_build_array(pruebas.prod('pI', 'Ivermectina', 'Antiparasitario', pruebas.d(-25)),
                                       pruebas.prod('pI', 'Ivermectina', 'Antiparasitario', pruebas.d(-25)))) $q$, '22023');
select pruebas.espera_ok('D13 La sanidad pasa a dos lotes (LM y LM2)',
  $q$ select public.editar_sanidad(p_actividad_id => pruebas.id('san'), p_lotes => array[pruebas.id('LM'), pruebas.id('LM2')], p_fecha => pruebas.d(20),
      p_productos => jsonb_build_array(pruebas.prod('pI', 'Ivermectina', 'Antiparasitario', pruebas.d(-25)))) $q$);
select pruebas.espera_valor('D14 Dos lotes principales; un solo producto (Ivermectina, con su marca)',
  $q$ select (select count(*) from public.actividad_lotes where actividad_id = pruebas.id('san') and rol = 'principal')
          || '|' || pruebas.productos('san') || '|' || pruebas.dadas('san') $q$, '2|Ivermectina|Ivermectina');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Servicio, diagnóstico, esquila y personalizada
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('sv', $q$ select public.registrar_servicio(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LM'), p_fecha => pruebas.d(100),
      p_vacas_entoradas => 30, p_toros => 1) $q$);
select pruebas.espera_ok('X01 Servicio: 28 vacas entoradas y 2 toros',
  $q$ select public.editar_servicio(p_actividad_id => pruebas.id('sv'), p_lote_id => pruebas.id('LM'), p_fecha => pruebas.d(100),
      p_vacas_entoradas => 28, p_toros => 2) $q$);
select pruebas.espera_valor('X02 La vista trae 28 y 2',
  $q$ select vacas_entoradas || '|' || toros from public.v_actividades where id = pruebas.id('sv') $q$, '28|2');
select pruebas.espera_error('X03 Servicio sin vacas',
  $q$ select public.editar_servicio(p_actividad_id => pruebas.id('sv'), p_lote_id => pruebas.id('LM'), p_fecha => pruebas.d(100),
      p_vacas_entoradas => 0) $q$, '22023');

select pruebas.guardar('dg', $q$ select public.registrar_diagnostico(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LM'), p_fecha => pruebas.d(60),
      p_vacas_diagnosticadas => 28, p_vacas_prenadas => 20) $q$);
select pruebas.espera_error('X04 Diagnóstico con más preñadas que diagnosticadas',
  $q$ select public.editar_diagnostico(p_actividad_id => pruebas.id('dg'), p_lote_id => pruebas.id('LM'), p_fecha => pruebas.d(60),
      p_vacas_diagnosticadas => 28, p_vacas_prenadas => 30) $q$, '22023');
select pruebas.espera_ok('X05 Diagnóstico: 25 preñadas de 28',
  $q$ select public.editar_diagnostico(p_actividad_id => pruebas.id('dg'), p_lote_id => pruebas.id('LM'), p_fecha => pruebas.d(60),
      p_vacas_diagnosticadas => 28, p_vacas_prenadas => 25) $q$);
select pruebas.espera_valor('X06 3 vacías',
  $q$ select vacas_vacias::text from public.v_actividades where id = pruebas.id('dg') $q$, '3');

select pruebas.guardar('es', $q$ select public.registrar_esquila(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_lotes => array[pruebas.id('LO')], p_fecha => pruebas.d(10), p_kg_lana_total => 100) $q$);
select pruebas.espera_ok('X07 Esquila: 120 kg de lana',
  $q$ select public.editar_esquila(p_actividad_id => pruebas.id('es'), p_lotes => array[pruebas.id('LO')], p_fecha => pruebas.d(10),
      p_kg_lana_total => 120) $q$);
select pruebas.espera_valor('X08 La vista trae 120 kg',
  $q$ select kg_lana_total::text from public.v_actividades where id = pruebas.id('es') $q$, '120.00');
select pruebas.espera_error('X09 La esquila no pasa a un lote vacuno',
  $q$ select public.editar_esquila(p_actividad_id => pruebas.id('es'), p_lotes => array[pruebas.id('LM')], p_fecha => pruebas.d(10),
      p_kg_lana_total => 120) $q$, '22023');

select pruebas.guardar('pz', $q$ select public.registrar_personalizada(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_lotes => array[pruebas.id('LO')], p_fecha => pruebas.d(5), p_nombre => 'Recuento',
      p_campos => jsonb_build_array(jsonb_build_object('campo', 'Contadas', 'valor', '20'))) $q$);
select pruebas.espera_ok('X10 Personalizada: otro nombre y dos campos',
  $q$ select public.editar_personalizada(p_actividad_id => pruebas.id('pz'), p_lotes => array[pruebas.id('LO')], p_fecha => pruebas.d(5),
      p_nombre => 'Recuento de ovejas', p_campos => jsonb_build_array(
        jsonb_build_object('campo', 'Contadas', 'valor', '19'), jsonb_build_object('campo', 'Faltantes', 'valor', '1'))) $q$);
select pruebas.espera_valor('X11 La vista trae el nombre y los dos campos',
  $q$ select personalizada || '|' || jsonb_array_length(campos) from public.v_actividades where id = pruebas.id('pz') $q$, 'Recuento de ovejas|2');
select pruebas.espera_error('X12 Un campo repetido',
  $q$ select public.editar_personalizada(p_actividad_id => pruebas.id('pz'), p_lotes => array[pruebas.id('LO')], p_fecha => pruebas.d(5),
      p_nombre => 'Recuento', p_campos => jsonb_build_array(
        jsonb_build_object('campo', 'Contadas', 'valor', '19'), jsonb_build_object('campo', 'contadas', 'valor', '1'))) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Destete
-- ════════════════════════════════════════════════════════════════════════════
-- LD1: 10 vacas con 8 crías sin sexar al pie (d-100). LD2: 6 vacas con 2 terneros y 2 terneras al
-- pie. LE: 3 terneros solos (d-50). de1 (d-10): de LD1 salen 8 sin sexar → DT 4 terneros y DH 4 terneras.

select pruebas.guardar('LD1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LD1 Vacas', pruebas.d(300), pruebas.comp('vacas_cria', 10)) $q$);
select pruebas.guardar('LD2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LD2 Vacas', pruebas.d(300), pruebas.comp('vacas_cria', 6)) $q$);
select pruebas.guardar('LE',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LE Terneros', pruebas.d(50), pruebas.comp('terneros', 3)) $q$);
select pruebas.guardar('pa3', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LD1'),
      p_fecha => pruebas.d(100), p_lineas => jsonb_build_array(pruebas.lin('sin_sexar', 8)), p_lote_cria_id => pruebas.id('LD1')) $q$);
select pruebas.guardar('pa4', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LD2'),
      p_fecha => pruebas.d(100), p_lineas => jsonb_build_array(pruebas.lin('terneros', 2), pruebas.lin('terneras', 2)), p_lote_cria_id => pruebas.id('LD2')) $q$);
select pruebas.guardar('de1', $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.d(10),
      jsonb_build_array(pruebas.lote_con('LD1', jsonb_build_array(pruebas.lin('sin_sexar', 8)))),
      jsonb_build_array(pruebas.destino_nuevo('DT Terneros', jsonb_build_array(pruebas.lin('terneros', 4))),
                        pruebas.destino_nuevo('DH Terneras', jsonb_build_array(pruebas.lin('terneras', 4))))) $q$);
select pruebas.guardar('DT', $q$ select pruebas.lote('DT Terneros') $q$);
select pruebas.guardar('DH', $q$ select pruebas.lote('DH Terneras') $q$);
select pruebas.espera_valor('E00 Preparación: registrar_destete sigue igual (DT 4, DH 4, LD1 sin crías, 2 operaciones)',
  $q$ select pruebas.stock('DT', 'terneros') || '|' || pruebas.stock('DH', 'terneras') || '|' || pruebas.stock('LD1', 'sin_sexar')
          || '|' || (select count(*) from public.operaciones_lote where actividad_id = pruebas.id('de1')) $q$, '4|4|0|2');

select pruebas.espera_ok('E01 Se suma LD2 como origen: DT 6 terneros y DH 6 terneras',
  $q$ select public.editar_destete(pruebas.id('de1'), pruebas.d(10),
      jsonb_build_array(pruebas.lote_con('LD1', jsonb_build_array(pruebas.lin('sin_sexar', 8))),
                        pruebas.lote_con('LD2', jsonb_build_array(pruebas.lin('terneros', 2), pruebas.lin('terneras', 2)))),
      jsonb_build_array(pruebas.lote_con('DT', jsonb_build_array(pruebas.lin('terneros', 6))),
                        pruebas.lote_con('DH', jsonb_build_array(pruebas.lin('terneras', 6))))) $q$);
select pruebas.espera_valor('E02 DT 6, DH 6, LD2 sin crías (sus vacas siguen: abierto); 4 operaciones de linaje',
  $q$ select pruebas.stock('DT', 'terneros') || '|' || pruebas.stock('DH', 'terneras') || '|'
          || pruebas.stock('LD2', 'terneros') + pruebas.stock('LD2', 'terneras') || '|' || (select estado from public.lotes where id = pruebas.id('LD2'))
          || '|' || (select count(*) from public.operaciones_lote where actividad_id = pruebas.id('de1')) $q$, '6|6|0|activo|4');

select pruebas.espera_ok('E03 Se suma LE (3 terneros solos): queda vacío y se cierra',
  $q$ select public.editar_destete(pruebas.id('de1'), pruebas.d(10),
      jsonb_build_array(pruebas.lote_con('LD1', jsonb_build_array(pruebas.lin('sin_sexar', 8))),
                        pruebas.lote_con('LD2', jsonb_build_array(pruebas.lin('terneros', 2), pruebas.lin('terneras', 2))),
                        pruebas.lote_con('LE', jsonb_build_array(pruebas.lin('terneros', 3)))),
      jsonb_build_array(pruebas.lote_con('DT', jsonb_build_array(pruebas.lin('terneros', 9))),
                        pruebas.lote_con('DH', jsonb_build_array(pruebas.lin('terneras', 6))))) $q$);
select pruebas.espera_valor('E04 LE cerrado ("Destetado"); DT 9',
  $q$ select l.estado || '|' || (select motivo from public.lote_cambios_estado c where c.lote_id = l.id and c.tipo = 'cierre') || '|' || pruebas.stock('DT', 'terneros')
      from public.lotes l where l.id = pruebas.id('LE') $q$, 'cerrado|Destetado|9');
select pruebas.espera_ok('E05 Se saca LE de los orígenes otra vez',
  $q$ select public.editar_destete(pruebas.id('de1'), pruebas.d(10),
      jsonb_build_array(pruebas.lote_con('LD1', jsonb_build_array(pruebas.lin('sin_sexar', 8))),
                        pruebas.lote_con('LD2', jsonb_build_array(pruebas.lin('terneros', 2), pruebas.lin('terneras', 2)))),
      jsonb_build_array(pruebas.lote_con('DT', jsonb_build_array(pruebas.lin('terneros', 6))),
                        pruebas.lote_con('DH', jsonb_build_array(pruebas.lin('terneras', 6))))) $q$);
select pruebas.espera_valor('E06 LE se reabre con sus 3 terneros ("Edición de destete")',
  $q$ select l.estado || '|' || pruebas.stock('LE', 'terneros') || '|' || pruebas.cambios('LE') || '|'
          || (select motivo from public.lote_cambios_estado c where c.lote_id = l.id and c.tipo = 'reapertura')
      from public.lotes l where l.id = pruebas.id('LE') $q$, 'activo|3|1|1|Edición de destete');

select pruebas.espera_error('E07 Los destinos no se cambian: sin DH',
  $q$ select public.editar_destete(pruebas.id('de1'), pruebas.d(10),
      jsonb_build_array(pruebas.lote_con('LD1', jsonb_build_array(pruebas.lin('sin_sexar', 8)))),
      jsonb_build_array(pruebas.lote_con('DT', jsonb_build_array(pruebas.lin('terneros', 8))))) $q$, '22023');
select pruebas.espera_error('E08 Los destinos no se cambian: otro lote como destino',
  $q$ select public.editar_destete(pruebas.id('de1'), pruebas.d(10),
      jsonb_build_array(pruebas.lote_con('LD1', jsonb_build_array(pruebas.lin('sin_sexar', 8)))),
      jsonb_build_array(pruebas.lote_con('DT', jsonb_build_array(pruebas.lin('terneros', 4))),
                        pruebas.lote_con('LE', jsonb_build_array(pruebas.lin('terneras', 4))))) $q$, '22023');
select pruebas.espera_error('E09 El balance sigue valiendo: salen 12 y entran 13',
  $q$ select public.editar_destete(pruebas.id('de1'), pruebas.d(10),
      jsonb_build_array(pruebas.lote_con('LD1', jsonb_build_array(pruebas.lin('sin_sexar', 8))),
                        pruebas.lote_con('LD2', jsonb_build_array(pruebas.lin('terneros', 2), pruebas.lin('terneras', 2)))),
      jsonb_build_array(pruebas.lote_con('DT', jsonb_build_array(pruebas.lin('terneros', 7))),
                        pruebas.lote_con('DH', jsonb_build_array(pruebas.lin('terneras', 6))))) $q$, '22023');
select pruebas.espera_error('E10 La fecha no se adelanta antes de la apertura de los destinos',
  $q$ select public.editar_destete(pruebas.id('de1'), pruebas.d(12),
      jsonb_build_array(pruebas.lote_con('LD1', jsonb_build_array(pruebas.lin('sin_sexar', 8)))),
      jsonb_build_array(pruebas.lote_con('DT', jsonb_build_array(pruebas.lin('terneros', 4))),
                        pruebas.lote_con('DH', jsonb_build_array(pruebas.lin('terneras', 4))))) $q$, '22023');

-- Un movimiento propio de un destino: el destete ya no se edita
select pruebas.preparar('m_DH', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('DH'), p_fecha => pruebas.d(2),
      p_lineas => jsonb_build_array(pruebas.lin('terneras', 1))) $q$);
select pruebas.espera_error('E11 Con una mortandad en DH, el destete no se edita',
  $q$ select public.editar_destete(pruebas.id('de1'), pruebas.d(10),
      jsonb_build_array(pruebas.lote_con('LD1', jsonb_build_array(pruebas.lin('sin_sexar', 8))),
                        pruebas.lote_con('LD2', jsonb_build_array(pruebas.lin('terneros', 2), pruebas.lin('terneras', 2)))),
      jsonb_build_array(pruebas.lote_con('DT', jsonb_build_array(pruebas.lin('terneros', 6))),
                        pruebas.lote_con('DH', jsonb_build_array(pruebas.lin('terneras', 6))))) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Permisos, versiones y triggers
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_error('K01 Consulta no edita (servicio)',
  $q$ select public.editar_servicio(p_actividad_id => pruebas.id('sv'), p_lote_id => pruebas.id('LM'), p_fecha => pruebas.d(100),
      p_vacas_entoradas => 28) $q$, '42501');
select pruebas.como('u_operador');
select pruebas.espera_error('K02 editar_esquila sobre una personalizada: no es de ese tipo',
  $q$ select public.editar_esquila(p_actividad_id => pruebas.id('pz'), p_lotes => array[pruebas.id('LO')], p_fecha => pruebas.d(5),
      p_kg_lana_total => 10) $q$, '22023');
select pruebas.como('u_admin');
select pruebas.espera_valor('K03 Cada edición aceptada guardó su versión (sanidad: 4; destete: 3)',
  $q$ select (select count(*) from public.actividad_versiones where actividad_id = pruebas.id('san') and accion = 'edicion')
          || '|' || (select count(*) from public.actividad_versiones where actividad_id = pruebas.id('de1') and accion = 'edicion') $q$, '4|3');
select pruebas.espera_valor('K04 La versión de antes de la primera edición del destete guarda sus 2 operaciones de linaje, con 2 vínculos cada una',
  $q$ select count(*)::text from public.actividad_versiones v
      where v.actividad_id = pruebas.id('de1') and jsonb_array_length(v.version -> 'detalle' -> 'operaciones') = 2
        and (select bool_and(jsonb_array_length(o -> 'vinculos') = 2) from jsonb_array_elements(v.version -> 'detalle' -> 'operaciones') o) $q$, '1');

reset role;
select pruebas.espera_error('K05 Modificar un producto de sanidad sin marca: rechazado',
  $q$ update public.act_sanidad_productos set dosis = 'x' where id = pruebas.id('pI') $q$, '42501');
select pruebas.espera_error('K06 Modificar un producto de sanidad con la marca de otra actividad: rechazado',
  $q$ select pruebas.actualizar_producto_con_marca('sv', pruebas.id('pI')) $q$, '42501');
select pruebas.espera_error('K07 Borrar el linaje de un destete sin marca: rechazado',
  $q$ delete from public.operacion_lote_vinculos v using public.operaciones_lote o
      where o.id = v.operacion_id and o.actividad_id = pruebas.id('de1') $q$, '42501');
select pruebas.espera_error('K08 Borrar una operación de destete sin marca: rechazado',
  $q$ delete from public.operaciones_lote where actividad_id = pruebas.id('de1') $q$, '42501');

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
  raise exception E'PRUEBAS EDITAR EL RESTO DE LAS ACTIVIDADES: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
