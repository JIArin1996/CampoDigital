-- Campo Digital v2 — Pruebas: kilos con dos decimales
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261020000600_kilos_dos_decimales).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS KILOS: N OK, ...", que deshace todo.
--      El resultado esperado es "14 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
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
-- 1. Base (postgres): columnas y vista
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 Las tres columnas de kilos son numeric(12,2)',
  $q$ select string_agg(table_name || '.' || column_name || ':' || numeric_precision || ',' || numeric_scale, ' ' order by table_name)
      from information_schema.columns
      where table_schema = 'public'
        and (table_name, column_name) in (('actividad_lineas', 'peso_vivo_total_kg'), ('act_compraventa', 'kg_gancho'), ('act_esquila', 'kg_lana_total')) $q$,
  'act_compraventa.kg_gancho:12,2 act_esquila.kg_lana_total:12,2 actividad_lineas.peso_vivo_total_kg:12,2');
select pruebas.espera_valor('B02 v_actividades vuelve con security_invoker, lectura para authenticated y nada para anon',
  $q$ select (coalesce('security_invoker=true' = any (c.reloptions), false)
              and has_table_privilege('authenticated', c.oid, 'select')
              and not has_table_privilege('anon', c.oid, 'select'))::text
      from pg_class c where c.oid = 'public.v_actividades'::regclass $q$, 'true');
select pruebas.espera_valor('B03 Las 4 funciones reescritas, con search_path fijo y nada para anon: las 3 registrar_* security definer para authenticated; _insertar_lineas (interna) para nadie',
  $q$ select count(*) filter (where coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('anon', p.oid, 'execute')
              and case when p.proname = '_insertar_lineas' then not has_function_privilege('authenticated', p.oid, 'execute')
                       else p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') end)::text || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_insertar_lineas', 'registrar_compra', 'registrar_venta', 'registrar_esquila') $q$, '4/4');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador: establecimiento, roles y catálogo
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.guardar('vacunos',     $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('ovinos',      $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovinos' $q$);
select pruebas.guardar('novillos',    $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Novillos' $q$);
select pruebas.guardar('ovejas_cria', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovejas de cría' $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: kilos con dos decimales
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

select pruebas.guardar('LV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV', pruebas.d(20), pruebas.comp('novillos', 20)) $q$);
select pruebas.guardar('LO', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('ovinos'), 'LO', pruebas.d(20), pruebas.comp('ovejas_cria', 10)) $q$);

-- Peso vivo (pesada; las demás actividades usan la misma validación de líneas)
select pruebas.guardar('pe1', $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('novillos'), 'cabezas', 4, 'peso_vivo_total_kg', 1350.25))) $q$);
select pruebas.espera_valor('K01 Peso vivo con dos decimales: se guarda tal cual (1350,25)',
  $q$ select peso_vivo_total_kg::text from public.actividad_lineas where actividad_id = pruebas.id('pe1') $q$, '1350.25');
select pruebas.guardar('pe2', $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('novillos'), 'cabezas', 4, 'peso_vivo_total_kg', 1350.257))) $q$);
select pruebas.espera_valor('K02 Peso vivo con tres decimales: se redondea a dos (1350,26)',
  $q$ select peso_vivo_total_kg::text from public.actividad_lineas where actividad_id = pruebas.id('pe2') $q$, '1350.26');
select pruebas.guardar('pe3', $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('novillos'), 'cabezas', 1, 'peso_vivo_total_kg', 0.01))) $q$);
select pruebas.espera_valor('K03 El mínimo: 0,01 kg se acepta',
  $q$ select peso_vivo_total_kg::text from public.actividad_lineas where actividad_id = pruebas.id('pe3') $q$, '0.01');
select pruebas.espera_error('K04 0,004 kg: redondeado da 0,00 y lo rechaza la función (22023, no el check)',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('novillos'), 'cabezas', 1, 'peso_vivo_total_kg', 0.004))) $q$, '22023');
select pruebas.espera_valor('K05 La vista: peso total con dos decimales y promedio con uno (1350,25 / 4 = 337,6)',
  $q$ select peso_vivo_total_kg || '|' || peso_promedio_kg from public.v_actividades where id = pruebas.id('pe1') $q$, '1350.25|337.6');

-- Kg al gancho (compra y venta)
select pruebas.guardar('c1', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(4), p_lineas => pruebas.comp('novillos', 2), p_modalidad => 'frigorifico', p_lote_id => pruebas.id('LV'),
      p_kg_gancho => 512.75) $q$);
select pruebas.espera_valor('K06 Compra: kg al gancho con dos decimales (512,75)',
  $q$ select kg_gancho::text from public.act_compraventa where actividad_id = pruebas.id('c1') $q$, '512.75');
select pruebas.espera_error('K07 Compra con 0,004 kg al gancho',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(4), p_lineas => pruebas.comp('novillos', 1), p_modalidad => 'frigorifico', p_lote_id => pruebas.id('LV'),
      p_kg_gancho => 0.004) $q$, '22023');
select pruebas.guardar('v1', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(2),
      p_lineas => jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('novillos'), 'cabezas', 2, 'peso_vivo_total_kg', 960.5)),
      p_modalidad => 'frigorifico', p_kg_gancho => 504.333) $q$);
select pruebas.espera_valor('K08 Venta: kg al gancho redondeado a dos (504,33); rendimiento con un decimal (52,5 %)',
  $q$ select cv.kg_gancho || '|' || v.rendimiento_pct from public.act_compraventa cv join public.v_actividades v on v.id = cv.actividad_id
      where cv.actividad_id = pruebas.id('v1') $q$, '504.33|52.5');
select pruebas.espera_error('K09 Venta con 0,004 kg al gancho',
  $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(2),
      p_lineas => pruebas.comp('novillos', 1), p_modalidad => 'frigorifico', p_kg_gancho => 0.004) $q$, '22023');

-- Kg de lana (esquila)
select pruebas.guardar('e1', $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LO')], pruebas.d(1), 45.67) $q$);
select pruebas.espera_valor('K10 Esquila: kg de lana con dos decimales (45,67)',
  $q$ select kg_lana_total::text from public.act_esquila where actividad_id = pruebas.id('e1') $q$, '45.67');
select pruebas.espera_error('K11 Esquila con 0,004 kg',
  $q$ select public.registrar_esquila(gen_random_uuid(), pruebas.id('est_a'), array[pruebas.id('LO')], pruebas.d(1), 0.004) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Reporte (error a propósito: deshace todo)
-- ════════════════════════════════════════════════════════════════════════════

reset role;

do $$
declare
  v_rep      text := current_setting('test.rep');
  v_ok       int  := (select count(*) from regexp_matches(v_rep, E'\nOK ', 'g'));
  v_falla    int  := (select count(*) from regexp_matches(v_rep, E'\nFALLA ', 'g'));
  v_omitida  int  := (select count(*) from regexp_matches(v_rep, E'\nOMITIDA ', 'g'));
  v_prep     int  := (select count(*) from regexp_matches(v_rep, E'\nPREP ', 'g'));
  v_raices   text := coalesce((select string_agg(m[1], E'\n') from regexp_matches(v_rep, E'\n(PREP [^\n]*)', 'g') m), '(ninguna)');
begin
  raise exception E'PRUEBAS KILOS: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
