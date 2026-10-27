-- Campo Digital v2 — Pruebas de la Etapa 6b-1: actividades que no mueven stock
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (los kilos se guardan con dos decimales desde 20261020000600).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ETAPA 6B-1: N OK, M FALLA ...", que deshace todo.
--      El resultado esperado es "129 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA y no
--      como FALLA: corregir primero las PREP, que son la causa raíz.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test), creados y borrados dentro de la transacción:
--   A = administrador, O = operador y Q = consulta de Santa Remigia, X = operador de otro campo.
-- B00 corre primero, como postgres, sobre los datos reales (carga inicial de actividad_lotes); B00b repite
-- la verificación al final, sobre lo que creó la prueba. Triggers y funciones con la sesión del operador (T01-T05, SV01).

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


-- Línea de una actividad de la 6a: {"categoria_id", "cabezas", "peso_vivo_total_kg"?}
create function pruebas.lin(p_cat text, p_cabezas int, p_peso numeric default null) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas, 'peso_vivo_total_kg', p_peso))
$$;

-- Producto de sanidad (las claves en NULL no van)
create function pruebas.prod(p_producto text, p_categoria text, p_carencia int default null, p_via text default null,
                             p_proxima date default null, p_dosis text default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('producto', p_producto, 'categoria', p_categoria, 'carencia_dias', p_carencia,
                                              'via', p_via, 'fecha_proxima_dosis', p_proxima, 'dosis', p_dosis))
$$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Carga inicial de actividad_lotes (datos reales, como postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B00 Carga inicial: toda actividad con lote tiene su fila principal y toda parición su fila de cría',
  $q$ select ((select count(*) from public.actividades a where a.lote_id is not null
               and not exists (select 1 from public.actividad_lotes al where al.actividad_id = a.id and al.lote_id = a.lote_id and al.rol = 'principal'))
            + (select count(*) from public.act_paricion p
               where not exists (select 1 from public.actividad_lotes al where al.actividad_id = p.actividad_id and al.lote_id = p.lote_cria_id and al.rol = 'cria')))::text $q$,
  '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Administrador: establecimientos, roles y catálogos
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);

select pruebas.guardar('vacunos',     $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('ovinos',      $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovinos' $q$);
select pruebas.guardar('terneros',    $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros' $q$);
select pruebas.guardar('novillos',    $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Novillos' $q$);
select pruebas.guardar('toros',       $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Toros' $q$);
select pruebas.guardar('vacas_cria',  $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacas de cría' $q$);
select pruebas.guardar('ovejas_cria', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovejas de cría' $q$);
select pruebas.guardar('persona_o',   $q$ select id from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_operador') $q$);
select pruebas.guardar('vacunos_x',   $q$ select id from public.especies where establecimiento_id = pruebas.id('est_x') and nombre = 'Vacunos' $q$);
select pruebas.guardar('terneros_x',  $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_x') and nombre = 'Terneros' $q$);
select pruebas.guardar('persona_x',   $q$ select id from public.personas where establecimiento_id = pruebas.id('est_x') and user_id = pruebas.id('u_ajeno') $q$);
select pruebas.guardar('LX', $q$ select public.crear_lote(pruebas.id('est_x'), pruebas.id('vacunos_x'), 'LX', pruebas.d(10), pruebas.comp('terneros_x', 5)) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Operador: lotes y triggers de actividad_lotes (funciones de la 6a, sin cambios)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

select pruebas.guardar('LV',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV Novillos', pruebas.d(20), pruebas.comp('novillos', 10)) $q$);
select pruebas.guardar('LT',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LT Terneros', pruebas.d(20), pruebas.comp('terneros', 8)) $q$);
select pruebas.guardar('LM',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LM Vacas', pruebas.d(20), pruebas.comp('vacas_cria', 20)) $q$);
select pruebas.guardar('LO',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('ovinos'), 'LO Ovejas', pruebas.d(20), pruebas.comp('ovejas_cria', 20)) $q$);
select pruebas.guardar('LO2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('ovinos'), 'LO2 Ovejas', pruebas.d(20), pruebas.comp('ovejas_cria', 10)) $q$);
-- LZ: lote cerrado (se venden todos sus toros)
select pruebas.guardar('LZ',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LZ Toros', pruebas.d(20), pruebas.comp('toros', 2)) $q$);
select pruebas.preparar('LZ', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LZ'), p_fecha => pruebas.d(1),
      p_lineas => jsonb_build_array(pruebas.lin('toros', 2)), p_modalidad => 'remate') $q$);

select pruebas.guardar('pe', $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(2),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5, 2000))) $q$);
select pruebas.espera_valor('T01 Trigger con un operador: la pesada (6a) tiene su fila principal, cargada a nombre del operador',
  $q$ select count(*) || '|' || bool_and(rol = 'principal' and lote_id = pruebas.id('LV') and created_by = pruebas.id('u_operador'))
      from public.actividad_lotes where actividad_id = pruebas.id('pe') $q$, '1|true');

select pruebas.guardar('pa', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => pruebas.d(3),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 5)), p_lote_cria_nuevo => jsonb_build_object('nombre', 'Terneros Nacidos (prueba)')) $q$);
select pruebas.espera_valor('T02 Trigger con un operador: la parición (6a) tiene la fila principal (madres) y la de cría',
  $q$ select string_agg(al.rol || ':' || (al.lote_id = case al.rol when 'principal' then pruebas.id('LM') else p.lote_cria_id end)::text, ',' order by al.rol)
      from public.actividad_lotes al join public.act_paricion p on p.actividad_id = al.actividad_id
      where al.actividad_id = pruebas.id('pa') $q$, 'cria:true,principal:true');
select pruebas.espera_error('T03 El operador no puede insertar directo en actividad_lotes',
  $q$ insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
      values (pruebas.id('pe'), pruebas.id('LT'), pruebas.id('est_a'), 'principal') $q$, '42501');
select pruebas.espera_error('T04 El operador no puede ejecutar la función del trigger',
  $q$ select public.actividad_lotes_desde_actividad() $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: sanidad
-- ════════════════════════════════════════════════════════════════════════════

-- s1: LV y LT, d-10: Aftosa (sin carencia, próxima dosis en 170 días) e Ivermectina (35 días de carencia)
select pruebas.guardar('s1', $q$ select public.registrar_sanidad(
      p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_lotes => array[pruebas.id('LV'), pruebas.id('LT')],
      p_fecha => pruebas.d(10),
      p_productos => jsonb_build_array(
        pruebas.prod('Aftosa', 'Vacunación', 0, 'Inyectable', pruebas.d(-170), '2 ml'),
        pruebas.prod('Ivermectina', 'Antiparasitario', 35, 'Pour-on', null, '1 ml cada 50 kg')),
      p_responsables => array[pruebas.id('persona_o')]) $q$);
select pruebas.espera_valor('S01 Sanidad de varios lotes: tipo sanidad y sin lote_id (los lotes van en actividad_lotes)',
  $q$ select tipo || '|' || coalesce(lote_id::text, 'sin lote') from public.actividades where id = pruebas.id('s1') $q$, 'sanidad|sin lote');
select pruebas.espera_valor('S02 Dos filas principal en actividad_lotes (LV y LT)',
  $q$ select count(*) || '|' || bool_and(rol = 'principal' and lote_id in (pruebas.id('LV'), pruebas.id('LT')))
      from public.actividad_lotes where actividad_id = pruebas.id('s1') $q$, '2|true');
select pruebas.espera_valor('S03 Productos en orden, con categoría, vía, carencia y dosis',
  $q$ select string_agg(orden || ':' || producto || ':' || categoria || ':' || coalesce(via, '-') || ':' || coalesce(carencia_dias::text, '-') || ':' || coalesce(dosis, '-'), ' ; ' order by orden)
      from public.act_sanidad_productos where actividad_id = pruebas.id('s1') $q$,
  '1:Aftosa:Vacunación:Inyectable:0:2 ml ; 2:Ivermectina:Antiparasitario:Pour-on:35:1 ml cada 50 kg');
select pruebas.espera_valor('S04 Próxima dosis guardada en el primer producto; el segundo sin próxima dosis',
  $q$ select string_agg(coalesce((fecha_proxima_dosis = pruebas.d(-170))::text, 'sin fecha'), ',' order by orden)
      from public.act_sanidad_productos where actividad_id = pruebas.id('s1') $q$, 'true,sin fecha');
select pruebas.espera_valor('S05 No mueve stock: 0 eventos',
  $q$ select count(*) from public.lote_eventos where actividad_id = pruebas.id('s1') $q$, '0');
select pruebas.espera_valor('S06 Vista: 2 lotes, 2 productos, el primero Aftosa',
  $q$ select cardinality(lotes) || '|' || productos || '|' || producto from public.v_actividades where id = pruebas.id('s1') $q$, '2|2|Aftosa');
select pruebas.espera_valor('S07 Repetir la sanidad con el mismo p_id devuelve la misma actividad',
  $q$ select (public.registrar_sanidad(p_id => pruebas.id('s1'), p_establecimiento_id => pruebas.id('est_a'),
        p_lotes => array[pruebas.id('LV'), pruebas.id('LT')], p_fecha => pruebas.d(10),
        p_productos => jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) = pruebas.id('s1'))::text $q$, 'true');
select pruebas.espera_valor('S08 Sin duplicados: siguen 2 productos y 2 lotes',
  $q$ select (select count(*) from public.act_sanidad_productos where actividad_id = pruebas.id('s1')) || '|'
          || (select count(*) from public.actividad_lotes where actividad_id = pruebas.id('s1')) $q$, '2|2');

select pruebas.espera_error('S09 Sin productos ([])',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), '[]'::jsonb) $q$, '22023');
select pruebas.espera_error('S10 Productos NULL',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), null) $q$, '22023');
select pruebas.espera_error('S11 Producto sin nombre',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('  ', 'Vacunación'))) $q$, '22023');
select pruebas.espera_error('S12 Categoría que no está en parametros',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Complejo B', 'Vitaminas'))) $q$, '22023');
select pruebas.espera_error('S13 Producto sin categoría',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('producto', 'Aftosa'))) $q$, '22023');
select pruebas.espera_error('S14 Vía que no está en parametros',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación', null, 'Nasal'))) $q$, '22023');
select pruebas.espera_error('S15 Próxima dosis igual a la fecha de la sanidad',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], pruebas.d(1),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación', null, null, pruebas.d(1)))) $q$, '22023');
select pruebas.espera_error('S16 Próxima dosis inválida (texto)',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('producto', 'Aftosa', 'categoria', 'Vacunación', 'fecha_proxima_dosis', 'el mes que viene'))) $q$, '22023');
select pruebas.espera_error('S17 Carencia negativa',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Ivermectina', 'Antiparasitario', -1))) $q$, '22023');
select pruebas.espera_error('S18 Carencia con decimales',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('producto', 'Ivermectina', 'categoria', 'Antiparasitario', 'carencia_dias', 2.5))) $q$, '22023');
select pruebas.espera_error('S19 Más de 20 productos',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      (select jsonb_agg(pruebas.prod('P' || i, 'Otro')) from generate_series(1, 21) i)) $q$, '22023');
select pruebas.espera_error('S20 Producto que no es un objeto',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      '["Aftosa"]'::jsonb) $q$, '22023');
select pruebas.espera_error('S21 Sin lotes',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[]::uuid[], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '22023');
select pruebas.espera_error('S22 Lotes NULL',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), null, public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '22023');
select pruebas.espera_error('S23 Lotes repetidos',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV'), pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '22023');
select pruebas.espera_error('S24 Un lote vacío (NULL) en la lista',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV'), null], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '22023');
select pruebas.espera_error('S25 Un lote cerrado en la lista',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV'), pruebas.id('LZ')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '22023');
select pruebas.espera_error('S26 Un lote de otro establecimiento en la lista',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV'), pruebas.id('LX')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '42501');
select pruebas.espera_error('S27 Fecha futura',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], pruebas.d(-1),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '22023');
select pruebas.espera_error('S28 Fecha anterior a la apertura de uno de los lotes',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV'), pruebas.id('LT')], pruebas.d(21),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '22023');
select pruebas.espera_error('S29 Responsable de otro establecimiento',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación')),
      array[pruebas.id('persona_x')]) $q$, '22023');

-- s2: vencida (LV, d-15, 3 días de carencia); s3: se anula (LT, d-5, 28 días)
select pruebas.guardar('s2', $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], pruebas.d(15),
      jsonb_build_array(pruebas.prod('Clostridiales', 'Vacunación', 3))) $q$);
select pruebas.guardar('s3', $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LT')], pruebas.d(5),
      jsonb_build_array(pruebas.prod('Oxitetraciclina', 'Tratamiento', 28))) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Operador: servicio y diagnóstico
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('sv1', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LM'), pruebas.d(15), 20, 1) $q$);
select pruebas.espera_valor('SV01 Servicio: lote_id = LM y fila principal creada por el trigger con el operador',
  $q$ select (a.lote_id = pruebas.id('LM'))::text || '|' || count(al.*) || '|' || bool_and(al.rol = 'principal' and al.created_by = pruebas.id('u_operador'))
      from public.actividades a join public.actividad_lotes al on al.actividad_id = a.id
      where a.id = pruebas.id('sv1') group by a.lote_id $q$, 'true|1|true');
select pruebas.espera_valor('SV02 Detalle y vista: 20 entoradas, 1 toro; sin eventos de stock',
  $q$ select sv.vacas_entoradas || '|' || sv.toros || '|' || v.vacas_entoradas || '|' || v.toros || '|'
          || (select count(*) from public.lote_eventos where actividad_id = pruebas.id('sv1'))
      from public.act_servicio sv join public.v_actividades v on v.id = sv.actividad_id
      where sv.actividad_id = pruebas.id('sv1') $q$, '20|1|20|1|0');
select pruebas.guardar('sv2', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LM'), pruebas.d(14), 50) $q$);
select pruebas.espera_valor('SV03 Entoradas mayores que el stock (50, hay 20): se guarda (la app solo avisa); toros vacío',
  $q$ select vacas_entoradas || '|' || coalesce(toros::text, 'sin toros') from public.act_servicio where actividad_id = pruebas.id('sv2') $q$, '50|sin toros');
select pruebas.espera_error('SV04 Entoradas cero',
  $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 0) $q$, '22023');
select pruebas.espera_error('SV05 Entoradas NULL',
  $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), null) $q$, '22023');
select pruebas.espera_error('SV06 Toros cero',
  $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 20, 0) $q$, '22023');
select pruebas.espera_error('SV07 Servicio en un lote cerrado',
  $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LZ'), public.fecha_hoy(), 20) $q$, '22023');
select pruebas.espera_error('SV08 Servicio con fecha futura',
  $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LM'), pruebas.d(-1), 20) $q$, '22023');
select pruebas.espera_error('SV09 Servicio con el p_id de una sanidad',
  $q$ select public.registrar_servicio(pruebas.id('s1'), pruebas.id('LM'), public.fecha_hoy(), 20) $q$, '42501');

select pruebas.guardar('dg1', $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LM'), pruebas.d(5), 20, 17) $q$);
select pruebas.espera_valor('D01 Diagnóstico: 20 diagnosticadas, 17 preñadas, 3 vacías (calculadas); lote_id = LM',
  $q$ select v.vacas_diagnosticadas || '|' || v.vacas_prenadas || '|' || v.vacas_vacias || '|' || (v.lote_id = pruebas.id('LM'))::text
      from public.v_actividades v where v.id = pruebas.id('dg1') $q$, '20|17|3|true');
select pruebas.guardar('dg2', $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LM'), pruebas.d(4), 3, 0) $q$);
select pruebas.espera_valor('D02 Diagnóstico con 0 preñadas (todas vacías): se guarda',
  $q$ select vacas_diagnosticadas || '|' || vacas_prenadas from public.act_diagnostico where actividad_id = pruebas.id('dg2') $q$, '3|0');
select pruebas.espera_error('D03 Preñadas más que diagnosticadas',
  $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 10, 11) $q$, '22023');
select pruebas.espera_error('D04 Diagnosticadas cero',
  $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 0, 0) $q$, '22023');
select pruebas.espera_error('D05 Preñadas negativas',
  $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 10, -1) $q$, '22023');
select pruebas.espera_error('D06 Preñadas NULL',
  $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 10, null) $q$, '22023');
select pruebas.espera_valor('D07 Diagnosticadas mayores que el stock (25, hay 20): se guarda (la app solo avisa)',
  $q$ select (public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LM'), pruebas.d(4), 25, 20) is not null)::text $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Operador: esquila
-- ════════════════════════════════════════════════════════════════════════════
-- LO (20 ovejas) y LO2 (10): 30 cabezas a la fecha.

select pruebas.guardar('e1', $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'),
      array[pruebas.id('LO'), pruebas.id('LO2')], pruebas.d(3), 120.54) $q$);
select pruebas.espera_valor('E01 Esquila de dos lotes ovinos: 120,54 kg (dos decimales), sin lote_id, dos filas principal, sin eventos',
  $q$ select es.kg_lana_total || '|' || coalesce(a.lote_id::text, 'sin lote') || '|'
          || (select count(*) from public.actividad_lotes where actividad_id = a.id) || '|'
          || (select count(*) from public.lote_eventos where actividad_id = a.id)
      from public.actividades a join public.act_esquila es on es.actividad_id = a.id where a.id = pruebas.id('e1') $q$,
  '120.54|sin lote|2|0');
select pruebas.espera_valor('E02 Kg por cabeza, promedio aproximado: 120,54 / 30 = 4,02',
  $q$ select kg_lana_cabeza_aprox::text from public.v_actividades where id = pruebas.id('e1') $q$, '4.02');
select pruebas.espera_error('E03 Esquila con un lote vacuno entre los lotes',
  $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LO'), pruebas.id('LV')], public.fecha_hoy(), 50) $q$, '22023');
select pruebas.espera_error('E04 Esquila con 0 kg',
  $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LO')], public.fecha_hoy(), 0) $q$, '22023');
select pruebas.espera_error('E05 Esquila sin kg (NULL)',
  $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LO')], public.fecha_hoy(), null) $q$, '22023');
select pruebas.espera_error('E06 Esquila con 0,004 kg: redondeado a 2 decimales da 0,00 y lo rechaza la función (22023, no el check de la tabla)',
  $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LO')], public.fecha_hoy(), 0.004) $q$, '22023');

-- Grupo de especie: la esquila mira especies.grupo, no el nombre
select pruebas.espera_valor('G01 Catálogo base de un establecimiento nuevo: Vacunos bovino, Ovinos ovino',
  $q$ select string_agg(nombre || ':' || grupo, ',' order by nombre) from public.especies where establecimiento_id = pruebas.id('est_a') $q$,
  'Ovinos:ovino,Vacunos:bovino');
select pruebas.espera_filas('G02 El operador no puede cambiar el grupo de una especie (0 filas por RLS)',
  $q$ update public.especies set grupo = 'otro' where id = pruebas.id('ovinos') $q$, 0);

select pruebas.como('u_admin');
select pruebas.guardar('merino', $q$ insert into public.especies (establecimiento_id, nombre, grupo)
      values (pruebas.id('est_a'), 'Merino (prueba)', 'ovino') returning id $q$);
select pruebas.guardar('ovejas_merino', $q$ insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden)
      values (pruebas.id('est_a'), pruebas.id('merino'), 'Ovejas Merino', 1) returning id $q$);
select pruebas.preparar('ovinos', $q$ update public.especies set nombre = 'Lanares (prueba)' where id = pruebas.id('ovinos') $q$);
select pruebas.como('u_operador');

select pruebas.guardar('LMe', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('merino'), 'LMe Merino', pruebas.d(20), pruebas.comp('ovejas_merino', 4)) $q$);
select pruebas.espera_valor('G03 Esquila con una especie ovina de otro nombre (Merino) y con "Ovinos" renombrada a "Lanares": se acepta',
  $q$ select (public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LO'), pruebas.id('LMe')], pruebas.d(2), 80)
              is not null and (select nombre from public.especies where id = pruebas.id('ovinos')) = 'Lanares (prueba)')::text $q$, 'true');
select pruebas.espera_error('G04 Esquila con una especie del grupo bovino sigue rechazada',
  $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LMe'), pruebas.id('LT')], public.fecha_hoy(), 50) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Operador: personalizada
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('p1', $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'),
      array[pruebas.id('LV'), pruebas.id('LO')], pruebas.d(2), '  Revisión de caravanas ',
      jsonb_build_array(jsonb_build_object('campo', ' Faltantes ', 'valor', '3'), jsonb_build_object('campo', 'Observador', 'valor', 'Juan'))) $q$);
select pruebas.espera_valor('P01 Personalizada de dos lotes (vacuno y ovino): nombre y campos sin espacios de más',
  $q$ select pz.nombre || '|' || jsonb_array_length(pz.campos) || '|' || (pz.campos -> 0 ->> 'campo') || '=' || (pz.campos -> 0 ->> 'valor') || '|'
          || (select count(*) from public.actividad_lotes where actividad_id = pz.actividad_id)
      from public.act_personalizada pz where pz.actividad_id = pruebas.id('p1') $q$, 'Revisión de caravanas|2|Faltantes=3|2');
select pruebas.guardar('p2', $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LT')], pruebas.d(1),
      'Arreglo de bebedero', null) $q$);
select pruebas.espera_valor('P02 Personalizada sin campos (NULL): se guarda con la lista vacía; vista con el nombre',
  $q$ select v.personalizada || '|' || v.campos::text from public.v_actividades v where v.id = pruebas.id('p2') $q$, 'Arreglo de bebedero|[]');
select pruebas.espera_error('P03 Sin nombre',
  $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), '  ') $q$, '22023');
select pruebas.espera_error('P04 Campo sin nombre',
  $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), 'X',
      jsonb_build_array(jsonb_build_object('campo', ' ', 'valor', '1'))) $q$, '22023');
select pruebas.espera_error('P05 Campo sin valor',
  $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), 'X',
      jsonb_build_array(jsonb_build_object('campo', 'Observador'))) $q$, '22023');
select pruebas.espera_error('P06 Campo repetido (sin distinguir mayúsculas ni espacios)',
  $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), 'X',
      jsonb_build_array(jsonb_build_object('campo', 'Observador', 'valor', 'Juan'), jsonb_build_object('campo', ' observador', 'valor', 'Ana'))) $q$, '22023');
select pruebas.espera_error('P07 Más de 20 campos',
  $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), 'X',
      (select jsonb_agg(jsonb_build_object('campo', 'C' || i, 'valor', 'v')) from generate_series(1, 21) i)) $q$, '22023');
select pruebas.espera_error('P08 Campos que no son una lista',
  $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), 'X',
      jsonb_build_object('campo', 'Observador', 'valor', 'Juan')) $q$, '22023');

select pruebas.espera_valor('T05 actividad_lotes de sanidad, esquila y personalizada: 6 filas principal, cargadas a nombre del operador',
  $q$ select count(*) || '|' || bool_and(rol = 'principal' and created_by = pruebas.id('u_operador'))
      from public.actividad_lotes where actividad_id in (pruebas.id('s1'), pruebas.id('e1'), pruebas.id('p1')) $q$, '6|true');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Listado y filtro por lote (actividad_lotes)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('F01 Filtro por lote: la sanidad s1 aparece en LV y en LT; la esquila en LO y LO2; la personalizada en LV y LO',
  $q$ select string_agg(x, ',' order by x) from (
        select 's1:' || count(*) as x from public.actividad_lotes where actividad_id = pruebas.id('s1') and lote_id in (pruebas.id('LV'), pruebas.id('LT'))
        union all
        select 'e1:' || count(*) from public.actividad_lotes where actividad_id = pruebas.id('e1') and lote_id in (pruebas.id('LO'), pruebas.id('LO2'))
        union all
        select 'p1:' || count(*) from public.actividad_lotes where actividad_id = pruebas.id('p1') and lote_id in (pruebas.id('LV'), pruebas.id('LO'))
      ) t $q$, 'e1:2,p1:2,s1:2');
select pruebas.espera_valor('F02 Filtro de LV como lo hará la app (actividad_lotes → v_actividades): pesada, sanidades s1 y s2, personalizada',
  $q$ select string_agg(v.tipo, ',' order by v.tipo, v.fecha)
      from public.v_actividades v
      where v.id in (select al.actividad_id from public.actividad_lotes al where al.lote_id = pruebas.id('LV')) $q$,
  'personalizada,pesada,sanidad,sanidad');
select pruebas.espera_valor('F03 Listado del establecimiento: aparecen los tres tipos de varios lotes',
  $q$ select count(*) from public.v_actividades where establecimiento_id = pruebas.id('est_a')
      and id in (pruebas.id('s1'), pruebas.id('e1'), pruebas.id('p1')) $q$, '3');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Operador: anular (solo se marcan; no mueven stock)
-- ════════════════════════════════════════════════════════════════════════════

-- Total de eventos de stock de Santa Remigia antes de anular (A07 lo compara después)
select pruebas.preparar('eventos_antes', $q$ select set_config('test.eventos_antes',
      (select count(*)::text from public.lote_eventos where establecimiento_id = pruebas.id('est_a')), false) $q$);

select pruebas.espera_ok('A01 Anular la sanidad s3',        $q$ select public.anular_actividad(pruebas.id('s3'), 'Producto equivocado') $q$);
select pruebas.espera_ok('A02 Anular la esquila',           $q$ select public.anular_actividad(pruebas.id('e1'), 'Kg mal pesados') $q$);
select pruebas.espera_ok('A03 Anular la personalizada',     $q$ select public.anular_actividad(pruebas.id('p1'), 'Era otro lote') $q$);
select pruebas.espera_ok('A04 Anular un servicio',          $q$ select public.anular_actividad(pruebas.id('sv2'), 'Cargado de más') $q$);
select pruebas.espera_ok('A05 Anular un diagnóstico',       $q$ select public.anular_actividad(pruebas.id('dg2'), 'Repetido') $q$);
select pruebas.espera_valor('A06 Las cinco quedan anuladas con motivo, sin eventos de stock y con sus lotes intactos',
  $q$ select count(*) filter (where a.anulada_en is not null and a.motivo_anulacion is not null) || '|'
          || (select count(*) from public.lote_eventos where actividad_id in (pruebas.id('s3'), pruebas.id('e1'), pruebas.id('p1'), pruebas.id('sv2'), pruebas.id('dg2'))) || '|'
          || (select count(*) from public.actividad_lotes where actividad_id in (pruebas.id('s3'), pruebas.id('e1'), pruebas.id('p1'), pruebas.id('sv2'), pruebas.id('dg2')))
      from public.actividades a where a.id in (pruebas.id('s3'), pruebas.id('e1'), pruebas.id('p1'), pruebas.id('sv2'), pruebas.id('dg2')) $q$,
  '5|0|7');
select pruebas.espera_valor('A07 Las anulaciones no agregaron eventos de stock (mismo total antes y después); LO sigue con 20 ovejas',
  $q$ select (count(*) = current_setting('test.eventos_antes')::bigint)::text || '|' || pruebas.stock('LO', 'ovejas_cria')
      from public.lote_eventos where establecimiento_id = pruebas.id('est_a') $q$, 'true|20');
select pruebas.espera_error('A08 Anular dos veces',
  $q$ select public.anular_actividad(pruebas.id('e1'), 'Otra vez') $q$, '22023');

-- Parición cuyo lote de madres se cerró después (se vendieron todas las madres): se anula sin error.
-- anular_actividad bloquea también el lote de madres (fila principal en actividad_lotes), aunque esté cerrado.
select pruebas.guardar('LMad', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LMad Vacas', pruebas.d(20), pruebas.comp('vacas_cria', 3)) $q$);
select pruebas.guardar('pa_mc', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LMad'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 2)), p_lote_cria_nuevo => jsonb_build_object('nombre', 'Crías LMad (prueba)')) $q$);
select pruebas.guardar('LCMad', $q$ select lote_cria_id from public.act_paricion where actividad_id = pruebas.id('pa_mc') $q$);
select pruebas.preparar('LMad', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LMad'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('vacas_cria', 3)), p_modalidad => 'remate') $q$);
select pruebas.espera_ok('A09 Anular una parición cuyo lote de madres ya está cerrado (vendido después)',
  $q$ select public.anular_actividad(pruebas.id('pa_mc'), 'Las crías eran de otro lote') $q$);
select pruebas.espera_valor('A10 Parición anulada; las madres siguen vendidas (lote cerrado, 0 vacas); el lote de cría queda en cero y cerrado',
  $q$ select (a.anulada_en is not null)::text || '|'
          || (select estado from public.lotes where id = pruebas.id('LMad')) || '|' || pruebas.stock('LMad', 'vacas_cria') || '|'
          || (select estado from public.lotes where id = pruebas.id('LCMad')) || '|' || pruebas.stock('LCMad', 'terneros')
      from public.actividades a where a.id = pruebas.id('pa_mc') $q$, 'true|cerrado|0|cerrado|0');

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Carencias (v_carencias), con propagación a los lotes descendientes
-- ════════════════════════════════════════════════════════════════════════════
-- s1 (d-10): Ivermectina 35 días en LV y LT (Aftosa, 0 días, no cuenta). s2 (d-15): Clostridiales 3 días en LV.
-- s3 (d-5, LT) está anulada. LV se divide el d-8 (LV2) y LV2 el d-6 (LV4). LT se dividió el d-12 (LT3), antes de s1.

select pruebas.guardar('op_lv',  $q$ select public.dividir_lote(pruebas.id('LV'), pruebas.d(8),
      jsonb_build_array(jsonb_build_object('nombre', 'LV2 Novillos', 'composicion', pruebas.comp('novillos', 4)))) $q$);
select pruebas.guardar('LV2', $q$ select lote_id from public.operacion_lote_vinculos where operacion_id = pruebas.id('op_lv') and rol = 'destino' $q$);
select pruebas.guardar('op_lv2', $q$ select public.dividir_lote(pruebas.id('LV2'), pruebas.d(6),
      jsonb_build_array(jsonb_build_object('nombre', 'LV4 Novillos', 'composicion', pruebas.comp('novillos', 2)))) $q$);
select pruebas.guardar('LV4', $q$ select lote_id from public.operacion_lote_vinculos where operacion_id = pruebas.id('op_lv2') and rol = 'destino' $q$);
select pruebas.guardar('op_lt',  $q$ select public.dividir_lote(pruebas.id('LT'), pruebas.d(12),
      jsonb_build_array(jsonb_build_object('nombre', 'LT3 Terneros', 'composicion', pruebas.comp('terneros', 3)))) $q$);
select pruebas.guardar('LT3', $q$ select lote_id from public.operacion_lote_vinculos where operacion_id = pruebas.id('op_lt') and rol = 'destino' $q$);

select pruebas.espera_valor('K01 LV: Ivermectina (s1) y Clostridiales (s2), propias; Aftosa (0 días) no figura',
  $q$ select string_agg(producto || ':' || heredada, ',' order by producto) from public.v_carencias where lote_id = pruebas.id('LV') $q$,
  'Clostridiales:false,Ivermectina:false');
select pruebas.espera_valor('K02 LV2 (dividido de LV después de las dos sanidades) las hereda',
  $q$ select string_agg(producto || ':' || heredada, ',' order by producto) from public.v_carencias where lote_id = pruebas.id('LV2') $q$,
  'Clostridiales:true,Ivermectina:true');
select pruebas.espera_valor('K03 LV4 (nieto: dividido de LV2) también las hereda',
  $q$ select string_agg(producto || ':' || heredada, ',' order by producto) from public.v_carencias where lote_id = pruebas.id('LV4') $q$,
  'Clostridiales:true,Ivermectina:true');
select pruebas.espera_valor('K04 Fin de carencia de la Ivermectina en LV2 = d-10 + 35; vigente hoy',
  $q$ select (fin_carencia = pruebas.d(10) + 35)::text || '|' || (fin_carencia >= public.fecha_hoy())::text
      from public.v_carencias where lote_id = pruebas.id('LV2') and producto = 'Ivermectina' $q$, 'true|true');
select pruebas.espera_valor('K05 La de Clostridiales está vencida (d-15 + 3): figura, y quien consulta la filtra por fecha',
  $q$ select (fin_carencia < public.fecha_hoy())::text from public.v_carencias where lote_id = pruebas.id('LV') and producto = 'Clostridiales' $q$, 'true');
select pruebas.espera_valor('K06 LT: solo la Ivermectina de s1; la sanidad anulada (s3) no figura',
  $q$ select string_agg(producto, ',' order by producto) || '|'
          || (select count(*) from public.v_carencias where actividad_id = pruebas.id('s3'))
      from public.v_carencias where lote_id = pruebas.id('LT') $q$, 'Ivermectina|0');
select pruebas.espera_valor('K07 LT3 (dividido de LT antes de la sanidad) no hereda nada',
  $q$ select count(*) from public.v_carencias where lote_id = pruebas.id('LT3') $q$, '0');

-- Ciclo: LV2 se vuelve a unir a LV (LV → LV2 → LV). La vista tiene que terminar y no duplicar filas.
select pruebas.preparar('LV2', $q$ select public.unir_lotes(array[pruebas.id('LV2')], pruebas.d(4), pruebas.id('LV')) $q$);
select pruebas.espera_valor('K10 Con el ciclo LV → LV2 → LV: LV conserva sus dos carencias propias, sin duplicados; LV2 y LV4 siguen con dos',
  $q$ select (select string_agg(producto || ':' || heredada, ',' order by producto) from public.v_carencias where lote_id = pruebas.id('LV')) || '|'
          || (select count(*) from public.v_carencias where lote_id = pruebas.id('LV2')) || '|'
          || (select count(*) from public.v_carencias where lote_id = pruebas.id('LV4')) || '|'
          || (select estado from public.lotes where id = pruebas.id('LV2')) $q$,
  'Clostridiales:false,Ivermectina:false|2|2|cerrado');

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Consulta: lee todo, no escribe nada
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');

select pruebas.espera_valor('Q01 Consulta lee actividad_lotes, productos, servicio, diagnóstico, esquila, personalizada y carencias',
  $q$ select (select count(*) from public.actividad_lotes where actividad_id = pruebas.id('s1')) || '|'
          || (select count(*) from public.act_sanidad_productos where actividad_id = pruebas.id('s1')) || '|'
          || (select count(*) from public.act_servicio where actividad_id = pruebas.id('sv1')) || '|'
          || (select count(*) from public.act_diagnostico where actividad_id = pruebas.id('dg1')) || '|'
          || (select count(*) from public.act_esquila where actividad_id = pruebas.id('e1')) || '|'
          || (select count(*) from public.act_personalizada where actividad_id = pruebas.id('p1')) || '|'
          || (select count(*) from public.v_carencias where lote_id = pruebas.id('LV2')) $q$, '2|2|1|1|1|1|2');
select pruebas.espera_error('Q02 Consulta: registrar_sanidad',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '42501');
select pruebas.espera_error('Q03 Consulta: registrar_servicio',
  $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 20) $q$, '42501');
select pruebas.espera_error('Q04 Consulta: registrar_diagnostico',
  $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 20, 10) $q$, '42501');
select pruebas.espera_error('Q05 Consulta: registrar_esquila',
  $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LO')], public.fecha_hoy(), 50) $q$, '42501');
select pruebas.espera_error('Q06 Consulta: registrar_personalizada',
  $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), 'X') $q$, '42501');
select pruebas.espera_error('Q07 Consulta: anular una sanidad',
  $q$ select public.anular_actividad(pruebas.id('s1'), 'x') $q$, '42501');
select pruebas.espera_error('Q08 Consulta reusa el p_id de una sanidad del operador',
  $q$ select public.registrar_sanidad(pruebas.id('s1'), pruebas.id('est_a'), array[pruebas.id('LV')], pruebas.d(10),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 11. X, de otro establecimiento: no ve ni toca nada de Santa Remigia
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_ajeno');

select pruebas.espera_valor('X01 X ve 0 filas de Santa Remigia en las tablas y vistas nuevas',
  $q$ select ((select count(*) from public.actividad_lotes where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.act_sanidad_productos where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.act_servicio where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.act_diagnostico where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.act_esquila where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.act_personalizada where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.v_carencias where establecimiento_id = pruebas.id('est_a')))::text $q$, '0');
select pruebas.espera_error('X02 X carga una sanidad en su campo con un lote ajeno',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_x'), array[pruebas.id('LX'), pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '42501');
select pruebas.espera_error('X03 X carga una sanidad a nombre de Santa Remigia',
  $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '42501');
select pruebas.espera_error('X04 X registra un servicio en un lote ajeno',
  $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 20) $q$, '42501');
select pruebas.espera_error('X05 X reusa el p_id de una sanidad de Santa Remigia en su campo',
  $q$ select public.registrar_sanidad(pruebas.id('s1'), pruebas.id('est_x'), array[pruebas.id('LX')], public.fecha_hoy(),
      jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) $q$, '42501');
select pruebas.espera_error('X06 X anula una sanidad ajena',
  $q$ select public.anular_actividad(pruebas.id('s1'), 'x') $q$, '42501');
select pruebas.espera_valor('X07 X sí carga una sanidad en su propio lote',
  $q$ select (public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_x'), array[pruebas.id('LX')], public.fecha_hoy(),
        jsonb_build_array(pruebas.prod('Aftosa', 'Vacunación'))) is not null)::text $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 12. Sin sesión (anon): ninguna función ni tabla nueva
-- ════════════════════════════════════════════════════════════════════════════

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pruebas.espera_error('N01 anon: registrar_sanidad',       $q$ select public.registrar_sanidad(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), '[]'::jsonb) $q$, '42501');
select pruebas.espera_error('N02 anon: registrar_servicio',      $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 20) $q$, '42501');
select pruebas.espera_error('N03 anon: registrar_diagnostico',   $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), 20, 10) $q$, '42501');
select pruebas.espera_error('N04 anon: registrar_esquila',       $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LO')], public.fecha_hoy(), 50) $q$, '42501');
select pruebas.espera_error('N05 anon: registrar_personalizada', $q$ select public.registrar_personalizada(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LV')], public.fecha_hoy(), 'X') $q$, '42501');
select pruebas.espera_error('N06 anon: leer actividad_lotes',    $q$ select count(*) from public.actividad_lotes $q$, '42501');
select pruebas.espera_error('N07 anon: leer productos de sanidad', $q$ select count(*) from public.act_sanidad_productos $q$, '42501');
select pruebas.espera_error('N08 anon: leer v_carencias',        $q$ select count(*) from public.v_carencias $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 13. Base (postgres): restricciones que valen para todos
-- ════════════════════════════════════════════════════════════════════════════

reset role;

select pruebas.espera_error('B01 Modificar actividad_lotes, aun como postgres',
  $q$ update public.actividad_lotes set rol = 'cria' where actividad_id = pruebas.id('s1') $q$, '42501');
select pruebas.espera_error('B02 Borrar un producto de sanidad',
  $q$ delete from public.act_sanidad_productos where actividad_id = pruebas.id('s1') $q$, '42501');
select pruebas.espera_error('B03 Modificar un servicio',
  $q$ update public.act_servicio set vacas_entoradas = 1 where actividad_id = pruebas.id('sv1') $q$, '42501');
select pruebas.espera_error('B04 Modificar un diagnóstico',
  $q$ update public.act_diagnostico set vacas_prenadas = 1 where actividad_id = pruebas.id('dg1') $q$, '42501');
select pruebas.espera_error('B05 Modificar una esquila',
  $q$ update public.act_esquila set kg_lana_total = 1 where actividad_id = pruebas.id('e1') $q$, '42501');
select pruebas.espera_error('B06 Modificar una personalizada',
  $q$ update public.act_personalizada set nombre = 'otra' where actividad_id = pruebas.id('p1') $q$, '42501');
select pruebas.espera_error('B07 Diagnóstico directo con preñadas > diagnosticadas (check)',
  $q$ insert into public.act_diagnostico (actividad_id, establecimiento_id, vacas_diagnosticadas, vacas_prenadas)
      values (pruebas.id('dg1'), pruebas.id('est_a'), 5, 6) $q$, '23514');
select pruebas.espera_error('B08 Personalizada directa con campos que no son una lista (check)',
  $q$ insert into public.act_personalizada (actividad_id, establecimiento_id, nombre, campos)
      values (pruebas.id('p1'), pruebas.id('est_a'), 'X', '{}'::jsonb) $q$, '23514');
select pruebas.espera_error('B09 Fila de actividad_lotes con un lote de otro establecimiento (FK compuesta)',
  $q$ insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
      values (pruebas.id('s1'), pruebas.id('LX'), pruebas.id('est_a'), 'principal') $q$, '23503');
select pruebas.espera_valor('B10 Parámetros nuevos, en orden',
  $q$ select (select string_agg(valor, ', ' order by orden) from public.parametros where clave = 'categorias_sanidad') || ' | '
          || (select string_agg(valor, ', ' order by orden) from public.parametros where clave = 'vias_aplicacion') $q$,
  'Vacunación, Antiparasitario, Tratamiento, Curación, Otro | Inyectable, Oral, Pour-on, Otra');
select pruebas.espera_valor('B11 Las divisiones no tienen actividad (operaciones_lote.actividad_id en null)',
  $q$ select count(*) filter (where actividad_id is not null) || '|' || count(*)
      from public.operaciones_lote where id in (pruebas.id('op_lv'), pruebas.id('op_lv2'), pruebas.id('op_lt')) $q$, '0|3');
select pruebas.espera_valor('B12 Funciones nuevas: search_path fijo, nada para anon; authenticated solo las registrar_*; definer en registrar_* y triggers',
  $q$ select (count(*) = 9 and bool_and(
        coalesce('search_path=""' = any (p.proconfig), false)
        and not has_function_privilege('anon', p.oid, 'execute')
        and has_function_privilege('authenticated', p.oid, 'execute') = (p.proname like 'registrar\_%')
        and p.prosecdef = (p.proname like 'registrar\_%' or p.proname like 'actividad\_lotes\_desde\_%')))::text
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('registrar_sanidad', 'registrar_servicio', 'registrar_diagnostico', 'registrar_esquila', 'registrar_personalizada',
                          '_bloquear_lotes_actividad', '_entero_jsonb', 'actividad_lotes_desde_actividad', 'actividad_lotes_desde_paricion') $q$, 'true');
select pruebas.espera_valor('B13 Tablas y vista nuevas: authenticated solo lee; anon nada',
  $q$ select bool_and(has_table_privilege('authenticated', t, 'select')
                      and not has_table_privilege('authenticated', t, 'insert')
                      and not has_table_privilege('authenticated', t, 'update')
                      and not has_table_privilege('authenticated', t, 'delete')
                      and not has_table_privilege('anon', t, 'select'))::text
      from unnest(array['public.actividad_lotes', 'public.act_sanidad_productos', 'public.act_servicio', 'public.act_diagnostico',
                        'public.act_esquila', 'public.act_personalizada', 'public.v_carencias', 'public.v_actividades']) t $q$, 'true');

-- Operaciones de actividades (las crea el destete de la 6b-2; acá se simulan como postgres):
-- una de una actividad anulada (s3) de LT a LT3, y otra de una actividad vigente (pe) de LT a LM, ambas del d-1.
select pruebas.guardar('op_anulada', $q$ insert into public.operaciones_lote (establecimiento_id, tipo, fecha, actividad_id)
      values (pruebas.id('est_a'), 'division', pruebas.d(1), pruebas.id('s3')) returning id $q$);
select pruebas.preparar('op_anulada', $q$ insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
      values (pruebas.id('est_a'), pruebas.id('op_anulada'), pruebas.id('LT'), 'origen'), (pruebas.id('est_a'), pruebas.id('op_anulada'), pruebas.id('LT3'), 'destino') $q$);
select pruebas.guardar('op_vigente', $q$ insert into public.operaciones_lote (establecimiento_id, tipo, fecha, actividad_id)
      values (pruebas.id('est_a'), 'division', pruebas.d(1), pruebas.id('pe')) returning id $q$);
select pruebas.preparar('op_vigente', $q$ insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
      values (pruebas.id('est_a'), pruebas.id('op_vigente'), pruebas.id('LT'), 'origen'), (pruebas.id('est_a'), pruebas.id('op_vigente'), pruebas.id('LM'), 'destino') $q$);
select pruebas.espera_valor('K08 Una operación de una actividad anulada no propaga la carencia (LT3 sigue sin carencias)',
  $q$ select pruebas.id('op_anulada') is not null and count(*) = 0 from public.v_carencias where lote_id = pruebas.id('LT3') $q$, 'true');
select pruebas.espera_valor('K09 Una operación de una actividad vigente sí la propaga (LM hereda la Ivermectina de s1)',
  $q$ select pruebas.id('op_vigente') is not null and string_agg(producto || ':' || heredada, ',') = 'Ivermectina:true'
      from public.v_carencias where lote_id = pruebas.id('LM') $q$, 'true');

select pruebas.espera_valor('B00b Sobre los datos de la prueba: toda actividad con lote tiene su fila principal, toda parición la de cría, y toda actividad sin lote al menos una fila',
  $q$ select ((select count(*) from public.actividades a
               where a.establecimiento_id in (pruebas.id('est_a'), pruebas.id('est_x'))
                 and ((a.lote_id is not null and not exists (select 1 from public.actividad_lotes al
                        where al.actividad_id = a.id and al.lote_id = a.lote_id and al.rol = 'principal'))
                   or (a.lote_id is null and not exists (select 1 from public.actividad_lotes al where al.actividad_id = a.id))))
            + (select count(*) from public.act_paricion p
               where p.establecimiento_id = pruebas.id('est_a')
                 and not exists (select 1 from public.actividad_lotes al where al.actividad_id = p.actividad_id and al.lote_id = p.lote_cria_id and al.rol = 'cria')))
          || '|' || (select count(*) from public.actividades where establecimiento_id in (pruebas.id('est_a'), pruebas.id('est_x'))) $q$,
  '0|18');

-- ════════════════════════════════════════════════════════════════════════════
-- 14. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS ETAPA 6B-1: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
