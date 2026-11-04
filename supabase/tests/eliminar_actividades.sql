-- Campo Digital v2 — Pruebas de eliminar actividades, versiones anteriores y bitácora cerrada (paso 1)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261104000600_bitacora_tres_tipos).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ELIMINAR ACTIVIDADES: N OK, ...", que deshace todo.
--      El resultado esperado es "76 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Las pruebas B06 a B09 miran los datos reales (antes de cargar los de prueba): verifican que la
-- migración convirtió bien las anuladas que ya existían y las entradas de bitácora ya cerradas.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
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

-- Línea de una actividad: {"categoria_id", "cabezas", "peso_vivo_total_kg"?} (sin peso, la clave no va)
create function pruebas.lin(p_cat text, p_cabezas int, p_peso numeric default null) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas, 'peso_vivo_total_kg', p_peso))
$$;

-- Precio de una compra o venta
create function pruebas.precio(p_monto numeric, p_estado text) returns jsonb language sql immutable as $$
  select jsonb_build_object('monto', p_monto, 'moneda', 'USD', 'estado', p_estado)
$$;

-- Eventos de stock que le quedan a una actividad
create function pruebas.eventos(p_clave text) returns int language sql stable as $$
  select count(*)::int from public.lote_eventos where actividad_id = pruebas.id(p_clave)
$$;

-- Pone la marca de una actividad y trata de borrar los eventos de otra (o de la misma)
create function pruebas.borrar_eventos_con_marca(p_marca text, p_actividad text) returns void language plpgsql as $$
begin
  perform public._marcar_actividad(pruebas.id(p_marca));
  delete from public.lote_eventos where actividad_id = pruebas.id(p_actividad);
end $$;

-- Con la marca de una actividad, trata de borrar el alta inicial de un lote (evento sin actividad)
create function pruebas.borrar_alta_con_marca(p_marca text, p_lote text) returns void language plpgsql as $$
begin
  perform public._marcar_actividad(pruebas.id(p_marca));
  delete from public.lote_eventos where lote_id = pruebas.id(p_lote) and tipo = 'alta_inicial';
end $$;

-- Con la marca de la misma actividad, trata de modificar (no borrar) uno de sus eventos
create function pruebas.modificar_evento_con_marca(p_actividad text) returns void language plpgsql as $$
begin
  perform public._marcar_actividad(pruebas.id(p_actividad));
  update public.lote_eventos set nota = 'cambiada' where actividad_id = pruebas.id(p_actividad);
end $$;

-- Con la marca de la actividad, trata de actualizarla (p_set: "columna = valor"). Al final saca la
-- marca, para que no quede puesta en el resto de las pruebas si la actualización pasa.
create function pruebas.actualizar_con_marca(p_actividad text, p_set text) returns void language plpgsql as $$
begin
  perform public._marcar_actividad(pruebas.id(p_actividad));
  execute format('update public.actividades set %s where id = %L', p_set, pruebas.id(p_actividad));
  perform set_config('campo.actividad_marcada', '', true);
end $$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres): funciones, tabla de versiones y conversión de las anuladas
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 eliminar_actividad: security definer, search_path fijo, authenticated sí y anon no',
  $q$ select (p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'eliminar_actividad' $q$, 'true');
select pruebas.espera_valor('B02 Las 6 internas y de trigger nuevas: search_path fijo, sin security definer y nadie las ejecuta por la API',
  $q$ select count(*) filter (where not p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_marcar_actividad', '_actividad_marcada', '_version_actividad', '_eliminar_actividad',
                          'proteger_dato_de_actividad', 'marcar_cierre_entrada') $q$, '6/6');
select pruebas.espera_valor('B03 La marca es local a la transacción (set_config con is_local = true)',
  $q$ select (prosrc like '%set_config(''campo.actividad_marcada'', p_actividad_id::text, true)%')::text
      from pg_proc where pronamespace = 'public'::regnamespace and proname = '_marcar_actividad' $q$, 'true');
select pruebas.espera_valor('B04 actividad_versiones: con RLS; authenticated solo lee; anon nada',
  $q$ select (c.relrowsecurity
              and has_table_privilege('authenticated', c.oid, 'select')
              and not has_table_privilege('authenticated', c.oid, 'insert')
              and not has_table_privilege('authenticated', c.oid, 'update')
              and not has_table_privilege('authenticated', c.oid, 'delete')
              and not has_table_privilege('anon', c.oid, 'select'))::text
      from pg_class c where c.oid = 'public.actividad_versiones'::regclass $q$, 'true');
select pruebas.espera_valor('B05 Los 13 triggers de los datos de actividades (12 de inmutabilidad y el de borrado de dosis dadas) usan la excepción con marca',
  $q$ select count(*)::text from pg_trigger t
      where not t.tgisinternal and t.tgfoid = 'public.proteger_dato_de_actividad'::regproc
        and t.tgrelid in ('public.lote_eventos'::regclass, 'public.actividad_lineas'::regclass, 'public.act_compraventa'::regclass,
                          'public.act_mortandad'::regclass, 'public.act_paricion'::regclass, 'public.actividad_lotes'::regclass,
                          'public.act_sanidad_productos'::regclass, 'public.act_servicio'::regclass, 'public.act_diagnostico'::regclass,
                          'public.act_esquila'::regclass, 'public.act_personalizada'::regclass, 'public.actividad_responsables'::regclass,
                          'public.sanidad_dosis_dadas'::regclass) $q$, '13');
-- Datos reales, antes de cargar nada de prueba: la migración convirtió las anuladas
select pruebas.espera_valor('B06 Ninguna actividad anulada (eliminada) conserva eventos de stock',
  $q$ select count(*)::text from public.lote_eventos e join public.actividades a on a.id = e.actividad_id
      where a.anulada_en is not null $q$, '0');
select pruebas.espera_valor('B07 Toda actividad anulada (eliminada) tiene su versión de eliminación',
  $q$ select count(*)::text from public.actividades a
      where a.anulada_en is not null
        and not exists (select 1 from public.actividad_versiones v where v.actividad_id = a.id and v.accion = 'eliminacion') $q$, '0');
select pruebas.espera_valor('B08 v_actividades no trae ninguna eliminada',
  $q$ select count(*)::text from public.v_actividades where anulada_en is not null $q$, '0');
select pruebas.espera_valor('B09 Las entradas de bitácora cerradas tienen cuándo, y las abiertas no',
  $q$ select count(*)::text from public.bitacora_entradas
      where coalesce((tipo = 'tarea' and estado_tarea in ('realizada', 'cancelada')) or (tipo = 'decision' and estado_decision = 'realizada')
                     or (tipo = 'idea' and estado_idea in ('decidida', 'descartada')), false)
            <> (cerrada_en is not null) $q$, '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Preparación: establecimiento, roles, lotes y actividades
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.guardar('vacunos',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('novillos', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('terneros', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros' $q$);

select pruebas.como('u_operador');
-- LV: 20 novillos desde d-30. c1: compra de 10 terneros a LV (d-20, USD 1000). v1: venta de 4 terneros (d-10).
select pruebas.guardar('LV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV Novillos', pruebas.d(30), pruebas.comp('novillos', 20)) $q$);
select pruebas.guardar('c1', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(20), p_lineas => jsonb_build_array(pruebas.lin('terneros', 10)), p_modalidad => 'productor',
      p_lote_id => pruebas.id('LV'), p_precio => pruebas.precio(1000, 'pagado')) $q$);
select pruebas.guardar('v1', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 4)), p_modalidad => 'remate', p_precio => pruebas.precio(500, 'pendiente')) $q$);
-- LS: 5 novillos (d-15), vendidos todos en v2 (d-5): el lote se cierra solo
select pruebas.guardar('LS', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LS Para vender', pruebas.d(15), pruebas.comp('novillos', 5)) $q$);
select pruebas.guardar('v2', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LS'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5)), p_modalidad => 'frigorifico') $q$);
-- c3: compra de 6 terneros a un lote nuevo (d-8)
select pruebas.guardar('c3', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(8), p_lineas => jsonb_build_array(pruebas.lin('terneros', 6)), p_modalidad => 'remate',
      p_lote_nuevo => jsonb_build_object('nombre', 'LN Compra nueva', 'especie_id', pruebas.id('vacunos'))) $q$);
select pruebas.guardar('LN', $q$ select lote_creado_id from public.actividades where id = pruebas.id('c3') $q$);
-- san: sanidad en LV con una próxima dosis (d+20). m1: mortandad de 1 novillo en LV (d-2).
select pruebas.guardar('san', $q$ select public.registrar_sanidad(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_lotes => array[pruebas.id('LV')], p_fecha => pruebas.d(3), p_productos => jsonb_build_array(
        jsonb_build_object('producto', 'Aftosa', 'categoria', 'Vacunación', 'fecha_proxima_dosis', pruebas.d(-20)))) $q$);
select pruebas.guardar('m1', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(2),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_causa => null, p_observaciones => null) $q$);

select pruebas.espera_valor('P01 Preparación: LV con 19 novillos (20 menos la mortandad) y 6 terneros; LS cerrado; LN con 6 terneros',
  $q$ select pruebas.stock('LV', 'novillos') || '|' || pruebas.stock('LV', 'terneros') || '|'
          || (select estado from public.lotes where id = pruebas.id('LS')) || '|' || pruebas.stock('LN', 'terneros') $q$,
  '19|6|cerrado|6');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Eliminar: permisos y reglas
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('E01 El operador no elimina actividades',
  $q$ select public.eliminar_actividad(pruebas.id('v1')) $q$, '42501');
select pruebas.espera_valor('E02 El alias anular_actividad ya no existe (se borró en 20261104000400)',
  $q$ select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'anular_actividad' $q$, '0');
select pruebas.como('u_consulta');
select pruebas.espera_error('E03 Consulta no elimina actividades',
  $q$ select public.eliminar_actividad(pruebas.id('v1')) $q$, '42501');

select pruebas.como('u_admin');
select pruebas.espera_error('E04 No se elimina la compra si sus terneros ya se vendieron (el stock quedaría negativo)',
  $q$ select public.eliminar_actividad(pruebas.id('c1')) $q$, '23514');
select pruebas.espera_valor('E05 El intento fallido no cambió nada: la compra sigue con su evento y sin versión',
  $q$ select pruebas.eventos('c1') || '|' || (select count(*) from public.actividad_versiones where actividad_id = pruebas.id('c1')) $q$, '1|0');

select pruebas.espera_ok('E06 El administrador elimina la venta',
  $q$ select public.eliminar_actividad(pruebas.id('v1')) $q$);
select pruebas.espera_valor('E07 La venta no tiene eventos de stock (se borraron, sin inversos) y LV vuelve a 10 terneros',
  $q$ select pruebas.eventos('v1') || '|' || pruebas.stock('LV', 'terneros') $q$, '0|10');
select pruebas.espera_valor('E08 Se guardó la versión: eliminación, con su evento, su línea, su detalle y su movimiento',
  $q$ select accion || '|' || jsonb_array_length(version -> 'eventos') || '|' || jsonb_array_length(version -> 'lineas')
          || '|' || ((version -> 'detalle') ? 'compraventa')::text || '|' || jsonb_array_length(version -> 'movimientos')
          || '|' || (hecha_por = pruebas.id('u_admin'))::text
      from public.actividad_versiones where actividad_id = pruebas.id('v1') $q$, 'eliminacion|1|1|true|1|true');
select pruebas.espera_valor('E09 v_actividades ya no la trae; en actividades queda oculta (eliminada, sin motivo)',
  $q$ select (select count(*) from public.v_actividades where id = pruebas.id('v1')) || '|'
          || (anulada_en is not null)::text || '|' || (anulada_por = pruebas.id('u_admin'))::text || '|' || coalesce(motivo_anulacion, 'sin motivo')
      from public.actividades where id = pruebas.id('v1') $q$, '0|true|true|sin motivo');
select pruebas.espera_valor('E10 Su movimiento económico quedó anulado: "Actividad eliminada"',
  $q$ select (anulado_en is not null)::text || '|' || motivo_anulacion from public.movimientos_economicos where actividad_id = pruebas.id('v1') $q$,
  'true|Actividad eliminada');
select pruebas.espera_error('E11 No se elimina dos veces',
  $q$ select public.eliminar_actividad(pruebas.id('v1')) $q$, '22023');

select pruebas.espera_ok('E12 Ahora sí se elimina la compra',
  $q$ select public.eliminar_actividad(pruebas.id('c1')) $q$);
select pruebas.espera_valor('E13 LV sin terneros; los 20 novillos (menos la mortandad) no se tocaron',
  $q$ select pruebas.stock('LV', 'terneros') || '|' || pruebas.stock('LV', 'novillos') $q$, '0|19');

select pruebas.espera_ok('E14 Eliminar la venta que había cerrado LS',
  $q$ select public.eliminar_actividad(pruebas.id('v2')) $q$);
select pruebas.espera_valor('E15 LS se reabre con sus 5 novillos y queda la reapertura "Eliminación de venta"',
  $q$ select l.estado || '|' || pruebas.stock('LS', 'novillos') || '|'
          || (select count(*) from public.lote_cambios_estado c where c.lote_id = l.id and c.tipo = 'reapertura' and c.motivo = 'Eliminación de venta')
      from public.lotes l where l.id = pruebas.id('LS') $q$, 'activo|5|1');

select pruebas.espera_ok('E16 Eliminar la compra que creó el lote LN',
  $q$ select public.eliminar_actividad(pruebas.id('c3')) $q$);
select pruebas.espera_valor('E17 LN queda en cero y cerrado ("Eliminación de compra")',
  $q$ select l.estado || '|' || pruebas.stock('LN', 'terneros') || '|'
          || (select motivo from public.lote_cambios_estado c where c.lote_id = l.id and c.tipo = 'cierre')
      from public.lotes l where l.id = pruebas.id('LN') $q$, 'cerrado|0|Eliminación de compra');

select pruebas.espera_valor('E18 Antes de eliminar la sanidad, su próxima dosis está en el calendario',
  $q$ select count(*)::text from public.v_calendario where origen = 'dosis' and actividad_id = pruebas.id('san') $q$, '1');
select pruebas.espera_ok('E19 Eliminar la sanidad',
  $q$ select public.eliminar_actividad(pruebas.id('san')) $q$);
select pruebas.espera_valor('E20 Su próxima dosis desaparece sola del calendario',
  $q$ select count(*)::text from public.v_calendario where origen = 'dosis' and actividad_id = pruebas.id('san') $q$, '0');

select pruebas.espera_ok('E21 Eliminar la mortandad',
  $q$ select public.eliminar_actividad(pruebas.id('m1')) $q$);
select pruebas.espera_valor('E22 La mortandad queda eliminada sin motivo, sin eventos y LV vuelve a 20 novillos',
  $q$ select coalesce(a.motivo_anulacion, 'sin motivo') || '|' || pruebas.eventos('m1') || '|' || pruebas.stock('LV', 'novillos')
      from public.actividades a where a.id = pruebas.id('m1') $q$, 'sin motivo|0|20');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Versiones: solo las lee el administrador
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('V01 El administrador ve las 6 versiones de prueba',
  $q$ select count(*)::text from public.actividad_versiones where establecimiento_id = pruebas.id('est_a') $q$, '6');
select pruebas.como('u_operador');
select pruebas.espera_valor('V02 El operador no ve ninguna',
  $q$ select count(*)::text from public.actividad_versiones $q$, '0');
select pruebas.como('u_consulta');
select pruebas.espera_valor('V03 Consulta no ve ninguna',
  $q$ select count(*)::text from public.actividad_versiones $q$, '0');
select pruebas.como('u_admin');
select pruebas.espera_error('V04 Nadie escribe directo en las versiones',
  $q$ insert into public.actividad_versiones (establecimiento_id, actividad_id, accion, version)
      values (pruebas.id('est_a'), pruebas.id('v1'), 'edicion', '{}'::jsonb) $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. La excepción de los triggers (como la base, sin RLS)
-- ════════════════════════════════════════════════════════════════════════════

-- m2: una mortandad vigente (con un responsable) para probar contra ella; m3: otra actividad cuya marca se usa
select pruebas.como('u_operador');
select pruebas.guardar('per_oper', $q$ select id from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_operador') $q$);
select pruebas.guardar('m2', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(1),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_causa => null, p_observaciones => null,
      p_responsables => array[pruebas.id('per_oper')]) $q$);
select pruebas.guardar('m3', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LS'), p_fecha => pruebas.d(1),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_causa => null, p_observaciones => null) $q$);

reset role;
-- Antes de probar los borrados: hay filas, para que un rechazo no sea por no tener nada que borrar
select pruebas.espera_valor('T00 Antes de probar: m2 tiene 1 evento, 1 línea y 1 responsable, y LV su alta inicial',
  $q$ select pruebas.eventos('m2')
          || '|' || (select count(*) from public.actividad_lineas where actividad_id = pruebas.id('m2'))
          || '|' || (select count(*) from public.actividad_responsables where actividad_id = pruebas.id('m2'))
          || '|' || (select count(*) from public.lote_eventos where lote_id = pruebas.id('LV') and tipo = 'alta_inicial') $q$, '1|1|1|1');
select pruebas.espera_error('T01 Borrar eventos de stock sin marca: rechazado',
  $q$ delete from public.lote_eventos where actividad_id = pruebas.id('m2') $q$, '42501');
select pruebas.espera_error('T02 Borrar eventos de stock con la marca de otra actividad: rechazado',
  $q$ select pruebas.borrar_eventos_con_marca('m3', 'm2') $q$, '42501');
select pruebas.espera_error('T03 Modificar un evento con la marca de su actividad: rechazado (solo se borra)',
  $q$ select pruebas.modificar_evento_con_marca('m2') $q$, '42501');
select pruebas.espera_error('T04 Borrar un evento sin actividad (alta inicial) con cualquier marca: rechazado',
  $q$ select pruebas.borrar_alta_con_marca('m2', 'LV') $q$, '42501');
select pruebas.espera_valor('T04b ...y el alta inicial de LV sigue ahí',
  $q$ select count(*)::text from public.lote_eventos where lote_id = pruebas.id('LV') and tipo = 'alta_inicial' $q$, '1');
select pruebas.espera_error('T05 Borrar las líneas de una actividad sin marca: rechazado',
  $q$ delete from public.actividad_lineas where actividad_id = pruebas.id('m2') $q$, '42501');
select pruebas.espera_error('T06 Borrar los responsables de una actividad sin marca: rechazado',
  $q$ delete from public.actividad_responsables where actividad_id = pruebas.id('m2') $q$, '42501');
select pruebas.espera_error('T07 Editar una actividad sin marca: rechazado',
  $q$ update public.actividades set notas = 'x' where id = pruebas.id('m2') $q$, '42501');
select pruebas.espera_error('T08 Con la marca, cambiarle el tipo (de mortandad a pesada): rechazado',
  $q$ select pruebas.actualizar_con_marca('m2', $s$tipo = 'pesada'$s$) $q$, '42501');
select pruebas.espera_error('T08b Sin la marca, cambiarle el tipo: rechazado',
  $q$ update public.actividades set tipo = 'pesada' where id = pruebas.id('m2') $q$, '42501');
select pruebas.espera_error('T08c Con la marca, cambiar quién la cargó (created_by): rechazado',
  $q$ select pruebas.actualizar_con_marca('m2', format('created_by = %L', pruebas.id('u_admin'))) $q$, '42501');
select pruebas.espera_error('T08d Con la marca, cambiar cuándo se cargó (created_at): rechazado',
  $q$ select pruebas.actualizar_con_marca('m2', $s$created_at = now() - interval '1 day'$s$) $q$, '42501');
select pruebas.espera_error('T08e Con la marca, ponerle un lote creado (lote_creado_id): rechazado',
  $q$ select pruebas.actualizar_con_marca('m2', format('lote_creado_id = %L', pruebas.id('LV'))) $q$, '42501');
select pruebas.espera_error('T08f Con la marca, cambiarle el id: rechazado',
  $q$ select pruebas.actualizar_con_marca('m2', $s$id = gen_random_uuid()$s$) $q$, '42501');
select pruebas.espera_error('T08g Con la marca, eliminarla y a la vez cambiarle las notas: rechazado',
  $q$ select pruebas.actualizar_con_marca('m2', format('anulada_en = now(), anulada_por = %L, notas = %L', pruebas.id('u_admin'), 'x')) $q$, '42501');
select pruebas.espera_ok('T08h Con la marca, cambiar un campo de la edición (notas y editada): permitido',
  $q$ select pruebas.actualizar_con_marca('m2', format('notas = %L, editada_en = now(), editada_por = %L', 'Corregida', pruebas.id('u_admin'))) $q$);
select pruebas.espera_valor('T08i ...y el tipo sigue siendo mortandad',
  $q$ select tipo || '|' || notas from public.actividades where id = pruebas.id('m2') $q$, 'mortandad|Corregida');
select pruebas.espera_error('T09 Borrar una actividad: rechazado siempre',
  $q$ delete from public.actividades where id = pruebas.id('m2') $q$, '42501');
select pruebas.espera_error('T10 Modificar una eliminada: rechazado',
  $q$ update public.actividades set notas = 'x' where id = pruebas.id('v1') $q$, '42501');
select pruebas.espera_error('T11 Modificar una versión guardada: rechazado',
  $q$ update public.actividad_versiones set accion = 'edicion' where actividad_id = pruebas.id('v1') $q$, '42501');
select pruebas.espera_error('T12 Borrar una versión guardada: rechazado',
  $q$ delete from public.actividad_versiones where actividad_id = pruebas.id('v1') $q$, '42501');
select pruebas.espera_valor('T13 Después de todo, la mortandad m2 conserva su evento, su línea y su responsable',
  $q$ select pruebas.eventos('m2')
          || '|' || (select count(*) from public.actividad_lineas where actividad_id = pruebas.id('m2'))
          || '|' || (select count(*) from public.actividad_responsables where actividad_id = pruebas.id('m2')) $q$, '1|1|1');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Bitácora: cerrada_en y cerrada_por
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_operador');
select pruebas.guardar('t1', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'tarea', 'Revisar las aguadas',
      array[pruebas.id('LV')], null, pruebas.d(-3)) $q$);
select pruebas.espera_valor('K01 Tarea pendiente: sin cerrada_en',
  $q$ select coalesce(cerrada_en::text, 'abierta') from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'abierta');
select pruebas.espera_ok('K02 El operador la marca realizada',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'realizada') $q$);
select pruebas.espera_valor('K03 Realizada: cerrada_en y cerrada_por (el operador)',
  $q$ select (cerrada_en is not null)::text || '|' || (cerrada_por = pruebas.id('u_operador'))::text
      from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'true|true');
select pruebas.espera_ok('K04 Editar el texto de la tarea realizada',
  $q$ select public.editar_entrada_bitacora(pruebas.id('t1'), public.fecha_hoy(), 'tarea', 'Revisar las aguadas del fondo',
      array[pruebas.id('LV')], null, pruebas.d(-3)) $q$);
select pruebas.espera_valor('K05 Editar no cambia cuándo ni quién la cerró',
  $q$ select (cerrada_en = completada_en and cerrada_por = pruebas.id('u_operador'))::text
      from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'true');
select pruebas.espera_ok('K06 Vuelve a pendiente',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'pendiente') $q$);
select pruebas.espera_valor('K07 Pendiente otra vez: sin cerrada_en ni cerrada_por',
  $q$ select coalesce(cerrada_en::text, 'abierta') || '|' || coalesce(cerrada_por::text, 'nadie')
      from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'abierta|nadie');
select pruebas.como('u_admin');
select pruebas.espera_ok('K08 El administrador la marca realizada',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'realizada') $q$);
select pruebas.espera_valor('K09 Realizada: cerrada por el administrador',
  $q$ select (cerrada_en is not null and cerrada_por = pruebas.id('u_admin'))::text
      from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'true');

select pruebas.como('u_operador');
select pruebas.guardar('i1', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'idea', 'Probar otra aguada', array[pruebas.id('LV')]) $q$);
select pruebas.espera_valor('K10 Idea abierta: sin cerrada_en',
  $q$ select coalesce(cerrada_en::text, 'abierta') from public.bitacora_entradas where id = pruebas.id('i1') $q$, 'abierta');
select pruebas.espera_ok('K11 La idea se descarta',
  $q$ select public.cambiar_estado_idea(pruebas.id('i1'), 'descartada') $q$);
select pruebas.espera_valor('K12 Descartada: cerrada_en y cerrada_por',
  $q$ select (cerrada_en is not null and cerrada_por = pruebas.id('u_operador'))::text
      from public.bitacora_entradas where id = pruebas.id('i1') $q$, 'true');
select pruebas.espera_ok('K13 Vuelve a abierta',
  $q$ select public.cambiar_estado_idea(pruebas.id('i1'), 'abierta') $q$);
select pruebas.espera_valor('K14 Abierta otra vez: sin cerrada_en',
  $q$ select coalesce(cerrada_en::text, 'abierta') from public.bitacora_entradas where id = pruebas.id('i1') $q$, 'abierta');
select pruebas.guardar('n1', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'decision', 'Arreglar el alambrado', array[pruebas.id('LV')]) $q$);
select pruebas.espera_valor('K15 Una decisión pendiente no está cerrada',
  $q$ select coalesce(cerrada_en::text, 'abierta') from public.bitacora_entradas where id = pruebas.id('n1') $q$, 'abierta');

reset role;
select pruebas.espera_ok('K16 Ni la base le pone cerrada_en a una decisión pendiente...',
  $q$ update public.bitacora_entradas set cerrada_en = now(), cerrada_por = pruebas.id('u_admin') where id = pruebas.id('n1') $q$);
select pruebas.espera_valor('K17 ...el trigger la deja vacía',
  $q$ select coalesce(cerrada_en::text, 'abierta') || '|' || coalesce(cerrada_por::text, 'nadie')
      from public.bitacora_entradas where id = pruebas.id('n1') $q$, 'abierta|nadie');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS ELIMINAR ACTIVIDADES: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
