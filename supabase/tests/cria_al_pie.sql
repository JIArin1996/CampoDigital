-- Campo Digital v2 — Pruebas: cría al pie y parición al pie
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261022000100_cria_al_pie_y_paricion).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS CRÍA AL PIE: N OK, ...", que deshace todo.
--      El resultado esperado es "22 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia,
-- X = operador de otro campo.
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



-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres): columnas, permisos y datos existentes
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 categorias_animales tiene cria_al_pie (no nula, por defecto false) y sexo',
  $q$ select string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, '-'), ' ' order by column_name)
      from information_schema.columns
      where table_schema = 'public' and table_name = 'categorias_animales' and column_name in ('cria_al_pie', 'sexo') $q$,
  'cria_al_pie:NO:false sexo:YES:-');
select pruebas.espera_valor('B02 Permisos de columna: authenticated inserta y edita cria_al_pie y sexo; anon nada',
  $q$ select (has_column_privilege('authenticated', 'public.categorias_animales', 'cria_al_pie', 'INSERT')
              and has_column_privilege('authenticated', 'public.categorias_animales', 'sexo', 'INSERT')
              and has_column_privilege('authenticated', 'public.categorias_animales', 'cria_al_pie', 'UPDATE')
              and has_column_privilege('authenticated', 'public.categorias_animales', 'sexo', 'UPDATE')
              and not has_column_privilege('anon', 'public.categorias_animales', 'cria_al_pie', 'UPDATE'))::text $q$, 'true');
select pruebas.espera_valor('B03 registrar_paricion: una versión, security definer, search_path fijo, authenticated sí y anon no',
  $q$ select (count(*) = 1 and bool_and(p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')))::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'registrar_paricion' $q$, 'true');
select pruebas.espera_valor('B04 Datos existentes: cada especie bovina u ovina tiene su categoría sin sexar marcada',
  $q$ select count(*)::text from public.especies e
      where e.grupo in ('bovino', 'ovino')
        and not exists (select 1 from public.categorias_animales c
                        where c.especie_id = e.id and c.cria_al_pie and c.sexo is null
                          and c.nombre = case e.grupo when 'bovino' then 'Terneros/as' else 'Corderos/as' end) $q$, '0');
select pruebas.espera_valor('B05 Datos existentes: ningún Terneros, Terneras, Corderos ni Corderas sin la marca y el sexo',
  $q$ select count(*)::text from public.categorias_animales c join public.especies e on e.id = c.especie_id
      where ((e.grupo = 'bovino' and c.nombre in ('Terneros', 'Terneras')) or (e.grupo = 'ovino' and c.nombre in ('Corderos', 'Corderas')))
        and not (c.cria_al_pie and c.sexo = case when c.nombre in ('Terneros', 'Corderos') then 'macho' else 'hembra' end) $q$, '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador: catálogo base de un establecimiento nuevo
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.guardar('vacunos',      $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('sin_sexar',    $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros/as' $q$);
select pruebas.guardar('terneros',     $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros' $q$);
select pruebas.guardar('terneras',     $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneras' $q$);
select pruebas.guardar('vacas_cria',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Vacas de cría' $q$);
select pruebas.guardar('vaquillonas',  $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Vaquillonas' $q$);

select pruebas.espera_valor('C01 Catálogo base vacuno: Terneros/as primero; cría al pie solo las tres crías, con su sexo',
  $q$ select string_agg(c.nombre || ':' || c.cria_al_pie || ':' || coalesce(c.sexo, '-'), ', ' order by c.orden)
      from public.categorias_animales c join public.especies e on e.id = c.especie_id
      where e.establecimiento_id = pruebas.id('est_a') and e.nombre = 'Vacunos' $q$,
  'Terneros/as:true:-, Terneros:true:macho, Terneras:true:hembra, Vaquillonas:false:-, Novillos:false:-, Vacas de cría:false:-, Vacas de invernada o descarte:false:-, Toros:false:-');
select pruebas.espera_valor('C02 Catálogo base ovino: Corderos/as, Corderos y Corderas son cría al pie',
  $q$ select string_agg(c.nombre || ':' || coalesce(c.sexo, '-'), ', ' order by c.orden)
      from public.categorias_animales c join public.especies e on e.id = c.especie_id
      where e.establecimiento_id = pruebas.id('est_a') and e.nombre = 'Ovinos' and c.cria_al_pie $q$,
  'Corderos/as:-, Corderos:macho, Corderas:hembra');
select pruebas.espera_error('C03 El sexo solo va en categorías de cría al pie',
  $q$ update public.categorias_animales set sexo = 'hembra' where id = pruebas.id('vaquillonas') $q$, '23514');
select pruebas.espera_filas('C04 El administrador marca una categoría como cría al pie',
  $q$ update public.categorias_animales set cria_al_pie = true where id = pruebas.id('vaquillonas') $q$, 1);
select pruebas.espera_filas('C05 ...y la desmarca',
  $q$ update public.categorias_animales set cria_al_pie = false where id = pruebas.id('vaquillonas') $q$, 1);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: parición al pie
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

select pruebas.espera_filas('O01 El operador no edita la marca de cría al pie (solo el administrador)',
  $q$ update public.categorias_animales set cria_al_pie = true where id = pruebas.id('vaquillonas') $q$, 0);

select pruebas.guardar('LM', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LM Vacas', pruebas.d(60), pruebas.comp('vacas_cria', 30)) $q$);

select pruebas.guardar('pa1', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'),
      p_fecha => pruebas.d(20), p_lineas => pruebas.comp('sin_sexar', 12), p_lote_cria_id => pruebas.id('LM')) $q$);
select pruebas.espera_valor('P01 Parición al pie: las crías entran al lote de las madres, sin sexar; las vacas siguen en 30',
  $q$ select pruebas.stock('LM', 'sin_sexar') || '|' || pruebas.stock('LM', 'vacas_cria') $q$, '12|30');
select pruebas.espera_valor('P02 El mismo lote queda como principal y como cría de la parición',
  $q$ select string_agg(rol, ',' order by rol) from public.actividad_lotes where actividad_id = pruebas.id('pa1') and lote_id = pruebas.id('LM') $q$,
  'cria,principal');
select pruebas.guardar('pa2', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'),
      p_fecha => pruebas.d(10), p_lineas => pruebas.comp('sin_sexar', 8), p_nacidos_muertos => 1, p_lote_cria_id => pruebas.id('LM')) $q$);
select pruebas.espera_valor('P03 Una segunda parición en el mismo lote suma: 20 terneros/as',
  $q$ select pruebas.stock('LM', 'sin_sexar')::text $q$, '20');
select pruebas.espera_error('P04 Parición con una categoría que no es de cría al pie (vacas)',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'),
      p_fecha => pruebas.d(5), p_lineas => pruebas.comp('vacas_cria', 1), p_lote_cria_id => pruebas.id('LM')) $q$, '22023');
select pruebas.espera_valor('P05 La parición rechazada no dejó actividad ni stock',
  $q$ select (select count(*) from public.actividades where tipo = 'paricion' and lote_id = pruebas.id('LM')) || '|' || pruebas.stock('LM', 'vacas_cria') $q$, '2|30');
select pruebas.guardar('pa3', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'),
      p_fecha => pruebas.d(5), p_lineas => jsonb_build_array(
        jsonb_build_object('categoria_id', pruebas.id('terneros'), 'cabezas', 2),
        jsonb_build_object('categoria_id', pruebas.id('terneras'), 'cabezas', 3)),
      p_lote_cria_nuevo => jsonb_build_object('nombre', 'Terneros nacidos aparte')) $q$);
select pruebas.guardar('LN', $q$ select lote_cria_id from public.act_paricion where actividad_id = pruebas.id('pa3') $q$);
select pruebas.espera_valor('P06 Parición sexada a un lote de cría nuevo: sigue funcionando',
  $q$ select pruebas.stock('LN', 'terneros') || '|' || pruebas.stock('LN', 'terneras') $q$, '2|3');

select pruebas.espera_ok('P07 Anular una parición al pie',
  $q$ select public.anular_actividad(pruebas.id('pa2'), 'Cargada dos veces') $q$);
select pruebas.espera_valor('P08 La anulación resta sus crías del lote de las madres, que sigue abierto',
  $q$ select pruebas.stock('LM', 'sin_sexar') || '|' || pruebas.stock('LM', 'vacas_cria') || '|' || estado
      from public.lotes where id = pruebas.id('LM') $q$, '12|30|activo');

select pruebas.espera_ok('P09 Asignar el sexo antes del destete, con recategorizar_lote (Terneros/as → 5 Terneros y 7 Terneras)',
  $q$ select public.recategorizar_lote(pruebas.id('LM'), pruebas.d(1), jsonb_build_array(
      jsonb_build_object('desde_categoria_id', pruebas.id('sin_sexar'), 'hacia_categoria_id', pruebas.id('terneros'), 'cabezas', 5),
      jsonb_build_object('desde_categoria_id', pruebas.id('sin_sexar'), 'hacia_categoria_id', pruebas.id('terneras'), 'cabezas', 7))) $q$);
select pruebas.espera_valor('P10 Quedan 0 sin sexar, 5 terneros y 7 terneras en el lote de las madres',
  $q$ select pruebas.stock('LM', 'sin_sexar') || '|' || pruebas.stock('LM', 'terneros') || '|' || pruebas.stock('LM', 'terneras') $q$, '0|5|7');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. anon
-- ════════════════════════════════════════════════════════════════════════════

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no registra pariciones',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'),
      p_fecha => pruebas.d(1), p_lineas => pruebas.comp('sin_sexar', 1), p_lote_cria_id => pruebas.id('LM')) $q$, '42501');

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
  raise exception E'PRUEBAS CRÍA AL PIE: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
