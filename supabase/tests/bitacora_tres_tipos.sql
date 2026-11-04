-- Campo Digital v2 — Pruebas de la bitácora con tres tipos (tarea, decisión e idea) y Eliminar
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261104000600_bitacora_tres_tipos).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS BITACORA TRES TIPOS: N OK, ...", que deshace todo.
--      El resultado esperado es "67 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Las pruebas B04 a B07 miran los datos reales (antes de cargar los de prueba): verifican que la
-- migración eliminó las observaciones, las compras/ventas/gastos y las tareas canceladas, pasó las
-- hechas a realizadas y les dio estado a las decisiones.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días; "d(-5)" = dentro de 5 días.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia; X es ajeno.

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
-- 1. Base (postgres): funciones, RLS y conversión de los datos que ya existían
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 cambiar_estado_decision y eliminar_entrada_bitacora: security definer, search_path fijo, authenticated sí y anon no',
  $q$ select count(*) filter (where p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('cambiar_estado_decision', 'eliminar_entrada_bitacora') $q$, '2/2');
select pruebas.espera_valor('B02 anular_entrada_bitacora y restaurar_entrada_bitacora ya no existen',
  $q$ select count(*)::text from pg_proc
      where pronamespace = 'public'::regnamespace and proname in ('anular_entrada_bitacora', 'restaurar_entrada_bitacora') $q$, '0');
select pruebas.espera_valor('B03 La política de lectura deja afuera a las eliminadas',
  $q$ select (qual like '%es_miembro%' and qual like '%anulada_en IS NULL%')::text from pg_policies
      where schemaname = 'public' and tablename = 'bitacora_entradas' and policyname = 'bitacora_entradas_select' $q$, 'true');
-- Datos reales, antes de cargar nada de prueba
select pruebas.espera_valor('B04 No queda ninguna observación ni compra/venta/gasto sin eliminar',
  $q$ select count(*)::text from public.bitacora_entradas
      where tipo in ('observacion', 'compra_venta_gasto') and anulada_en is null $q$, '0');
select pruebas.espera_valor('B05 No queda ninguna tarea cancelada sin eliminar, ni ninguna "hecha"',
  $q$ select count(*)::text from public.bitacora_entradas
      where (estado_tarea = 'cancelada' and anulada_en is null) or estado_tarea = 'hecha' $q$, '0');
select pruebas.espera_valor('B06 Toda decisión tiene estado y nada más lo tiene',
  $q$ select count(*)::text from public.bitacora_entradas where (tipo = 'decision') <> (estado_decision is not null) $q$, '0');
select pruebas.espera_valor('B07 Toda tarea realizada tiene cuándo se realizó y cuándo se cerró',
  $q$ select count(*)::text from public.bitacora_entradas
      where estado_tarea = 'realizada' and (completada_en is null or cerrada_en is null) $q$, '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Preparación: establecimiento, roles, un lote y una sanidad con próxima dosis
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.guardar('vacunos',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('novillos', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);

select pruebas.como('u_operador');
select pruebas.guardar('LV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV Novillos', pruebas.d(30), pruebas.comp('novillos', 20)) $q$);
select pruebas.guardar('san', $q$ select public.registrar_sanidad(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_lotes => array[pruebas.id('LV')], p_fecha => pruebas.d(3), p_productos => jsonb_build_array(
        jsonb_build_object('producto', 'Aftosa', 'categoria', 'Vacunación', 'fecha_proxima_dosis', pruebas.d(-20)))) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Tipos: tarea, decisión e idea
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('T01 Crear una observación: rechazado',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'Se cortó el alambrado') $q$, '22023');
select pruebas.espera_error('T02 Crear una compra/venta/gasto: rechazado',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'compra_venta_gasto', 'Gasoil') $q$, '22023');
select pruebas.guardar('d1', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'decision', 'Vender los toros en marzo',
      array[pruebas.id('LV')]) $q$);
select pruebas.espera_valor('T03 La decisión arranca pendiente y abierta',
  $q$ select estado_decision || '|' || coalesce(cerrada_en::text, 'abierta') from public.bitacora_entradas where id = pruebas.id('d1') $q$,
  'pendiente|abierta');
select pruebas.guardar('i1', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'idea', 'Probar otra aguada', array[pruebas.id('LV')]) $q$);
select pruebas.espera_valor('T04 La idea arranca abierta y sin estado de decisión',
  $q$ select estado_idea || '|' || coalesce(estado_decision, 'null') from public.bitacora_entradas where id = pruebas.id('i1') $q$, 'abierta|null');
select pruebas.guardar('t1', $q$ select public.crear_entrada_bitacora(p_establecimiento_id => pruebas.id('est_a'), p_fecha => null,
      p_tipo => 'tarea', p_texto => 'Revisar las aguadas', p_lotes => array[pruebas.id('LV')], p_vencimiento => pruebas.d(-5)) $q$);
select pruebas.espera_valor('T05 La tarea arranca pendiente',
  $q$ select estado_tarea from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'pendiente');
select pruebas.espera_error('T06 Editar la decisión a observación: rechazado',
  $q$ select public.editar_entrada_bitacora(pruebas.id('d1'), public.fecha_hoy(), 'observacion', 'x') $q$, '22023');

reset role;
select pruebas.espera_error('T07 Ni la base guarda una observación sin eliminar',
  $q$ insert into public.bitacora_entradas (establecimiento_id, tipo, texto) values (pruebas.id('est_a'), 'observacion', 'x') $q$, '23514');
select pruebas.espera_error('T08 Ni una tarea cancelada sin eliminar',
  $q$ insert into public.bitacora_entradas (establecimiento_id, tipo, texto, vencimiento, estado_tarea)
      values (pruebas.id('est_a'), 'tarea', 'x', public.fecha_hoy(), 'cancelada') $q$, '23514');
select pruebas.espera_error('T09 Ni una tarea "hecha"',
  $q$ insert into public.bitacora_entradas (establecimiento_id, tipo, texto, vencimiento, estado_tarea)
      values (pruebas.id('est_a'), 'tarea', 'x', public.fecha_hoy(), 'hecha') $q$, '23514');
select pruebas.espera_error('T10 Ni una decisión sin estado',
  $q$ insert into public.bitacora_entradas (establecimiento_id, tipo, texto) values (pruebas.id('est_a'), 'decision', 'x') $q$, '23514');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Estados
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_operador');
-- Decisión: pendiente o realizada
select pruebas.espera_ok('E01 El operador marca realizada la decisión',
  $q$ select public.cambiar_estado_decision(pruebas.id('d1'), 'realizada') $q$);
select pruebas.espera_valor('E02 Realizada: cerrada, por el operador',
  $q$ select estado_decision || '|' || (cerrada_en is not null and cerrada_por = pruebas.id('u_operador'))::text
      from public.bitacora_entradas where id = pruebas.id('d1') $q$, 'realizada|true');
select pruebas.espera_error('E03 Marcarla realizada otra vez: rechazado',
  $q$ select public.cambiar_estado_decision(pruebas.id('d1'), 'realizada') $q$, '22023');
select pruebas.espera_error('E04 Estado de decisión inválido (decidida): rechazado',
  $q$ select public.cambiar_estado_decision(pruebas.id('d1'), 'decidida') $q$, '22023');
select pruebas.espera_ok('E05 Editar el texto de la decisión realizada',
  $q$ select public.editar_entrada_bitacora(pruebas.id('d1'), public.fecha_hoy(), 'decision', 'Vender los toros en abril', array[pruebas.id('LV')]) $q$);
select pruebas.espera_valor('E06 Editar conserva el estado y quién la cerró',
  $q$ select estado_decision || '|' || (cerrada_por = pruebas.id('u_operador'))::text || '|' || texto
      from public.bitacora_entradas where id = pruebas.id('d1') $q$, 'realizada|true|Vender los toros en abril');
select pruebas.espera_ok('E07 Vuelve a pendiente',
  $q$ select public.cambiar_estado_decision(pruebas.id('d1'), 'pendiente') $q$);
select pruebas.espera_valor('E08 Pendiente otra vez: abierta',
  $q$ select estado_decision || '|' || coalesce(cerrada_en::text, 'abierta') from public.bitacora_entradas where id = pruebas.id('d1') $q$,
  'pendiente|abierta');
select pruebas.espera_error('E09 cambiar_estado_decision en una idea: rechazado',
  $q$ select public.cambiar_estado_decision(pruebas.id('i1'), 'realizada') $q$, '22023');
select pruebas.espera_error('E10 cambiar_estado_tarea en una decisión: rechazado',
  $q$ select public.cambiar_estado_tarea(pruebas.id('d1'), 'realizada') $q$, '22023');
select pruebas.espera_error('E11 cambiar_estado_idea en una decisión: rechazado',
  $q$ select public.cambiar_estado_idea(pruebas.id('d1'), 'decidida') $q$, '22023');

-- Tarea: pendiente o realizada
select pruebas.espera_error('E12 Tarea "hecha": rechazado (ahora es realizada)',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'hecha') $q$, '22023');
select pruebas.espera_error('E13 Tarea cancelada: rechazado',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'cancelada') $q$, '22023');
select pruebas.espera_valor('E14 Marcarla realizada (no se repite: no hay siguiente)',
  $q$ select coalesce(public.cambiar_estado_tarea(pruebas.id('t1'), 'realizada')::text, 'sin siguiente') $q$, 'sin siguiente');
select pruebas.espera_valor('E15 Realizada: con quién y cuándo, y cerrada',
  $q$ select estado_tarea || '|' || (completada_por = pruebas.id('u_operador') and cerrada_en is not null)::text
      from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'realizada|true');
select pruebas.espera_ok('E16 Vuelve a pendiente',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'pendiente') $q$);
select pruebas.espera_valor('E17 Pendiente otra vez: sin quién ni cuándo',
  $q$ select coalesce(completada_en::text, 'nunca') || '|' || coalesce(cerrada_en::text, 'abierta')
      from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'nunca|abierta');
select pruebas.guardar('r1', $q$ select public.crear_entrada_bitacora(p_establecimiento_id => pruebas.id('est_a'), p_fecha => null,
      p_tipo => 'tarea', p_texto => 'Recorrer el alambrado', p_lotes => array[pruebas.id('LV')], p_vencimiento => pruebas.d(-2),
      p_repetir_cada_dias => 7) $q$);
select pruebas.guardar('r1_sig', $q$ select public.cambiar_estado_tarea(pruebas.id('r1'), 'realizada') $q$);
select pruebas.espera_valor('E18 La repetida realizada anota la siguiente: pendiente, vence 7 días después, con el lote',
  $q$ select estado_tarea || '|' || (vencimiento = pruebas.d(-9))::text
          || '|' || (select count(*) from public.bitacora_lotes where entrada_id = pruebas.id('r1_sig'))
      from public.bitacora_entradas where id = pruebas.id('r1_sig') $q$, 'pendiente|true|1');
select pruebas.espera_error('E19 Reabrir la que ya generó la siguiente: rechazado',
  $q$ select public.cambiar_estado_tarea(pruebas.id('r1'), 'pendiente') $q$, '22023');

-- Idea: abierta, decidida o descartada (sin cambios)
select pruebas.espera_ok('E20 La idea se decide',
  $q$ select public.cambiar_estado_idea(pruebas.id('i1'), 'decidida') $q$);
select pruebas.espera_valor('E21 Decidida: cerrada',
  $q$ select estado_idea || '|' || (cerrada_en is not null)::text from public.bitacora_entradas where id = pruebas.id('i1') $q$, 'decidida|true');
select pruebas.espera_ok('E22 Se descarta',
  $q$ select public.cambiar_estado_idea(pruebas.id('i1'), 'descartada') $q$);
select pruebas.espera_error('E23 Estado de idea inválido (realizada): rechazado',
  $q$ select public.cambiar_estado_idea(pruebas.id('i1'), 'realizada') $q$, '22023');

-- Cambiar de tipo al editar: arranca con el estado inicial del nuevo
select pruebas.espera_ok('E24 La idea descartada pasa a decisión',
  $q$ select public.editar_entrada_bitacora(pruebas.id('i1'), public.fecha_hoy(), 'decision', 'Probar otra aguada', array[pruebas.id('LV')]) $q$);
select pruebas.espera_valor('E25 Como decisión: pendiente, sin estado de idea y abierta',
  $q$ select estado_decision || '|' || coalesce(estado_idea, 'null') || '|' || coalesce(cerrada_en::text, 'abierta')
      from public.bitacora_entradas where id = pruebas.id('i1') $q$, 'pendiente|null|abierta');
select pruebas.espera_ok('E26 La decisión vuelve a ser idea',
  $q$ select public.editar_entrada_bitacora(pruebas.id('i1'), public.fecha_hoy(), 'idea', 'Probar otra aguada', array[pruebas.id('LV')]) $q$);
select pruebas.espera_valor('E27 Como idea: abierta y sin estado de decisión',
  $q$ select estado_idea || '|' || coalesce(estado_decision, 'null') from public.bitacora_entradas where id = pruebas.id('i1') $q$, 'abierta|null');

-- Una tarea sale de una decisión
select pruebas.guardar('t_d1', $q$ select public.crear_entrada_bitacora(p_establecimiento_id => pruebas.id('est_a'), p_fecha => null,
      p_tipo => 'tarea', p_texto => 'Llamar al consignatario', p_vencimiento => pruebas.d(-10), p_entrada_origen_id => pruebas.id('d1')) $q$);
select pruebas.espera_valor('E28 La tarea queda vinculada a la decisión',
  $q$ select (entrada_origen_id = pruebas.id('d1'))::text from public.bitacora_entradas where id = pruebas.id('t_d1') $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Eliminar (solo el administrador)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('L01 El operador no elimina',
  $q$ select public.eliminar_entrada_bitacora(pruebas.id('r1_sig')) $q$, '42501');
select pruebas.como('u_consulta');
select pruebas.espera_error('L02 Consulta no elimina',
  $q$ select public.eliminar_entrada_bitacora(pruebas.id('r1_sig')) $q$, '42501');
select pruebas.espera_error('L03 Consulta no cambia el estado de una decisión',
  $q$ select public.cambiar_estado_decision(pruebas.id('d1'), 'realizada') $q$, '42501');
select pruebas.como('u_ajeno');
select pruebas.espera_error('L04 Un usuario de otro establecimiento no elimina',
  $q$ select public.eliminar_entrada_bitacora(pruebas.id('r1_sig')) $q$, '42501');

select pruebas.como('u_admin');
select pruebas.espera_ok('L05 El administrador elimina la siguiente de la repetida',
  $q$ select public.eliminar_entrada_bitacora(pruebas.id('r1_sig')) $q$);
select pruebas.espera_valor('L06 El administrador ya no la ve',
  $q$ select count(*)::text from public.bitacora_entradas where id = pruebas.id('r1_sig') $q$, '0');
select pruebas.espera_valor('L07 Ni en el calendario',
  $q$ select count(*)::text from public.v_calendario where entrada_id = pruebas.id('r1_sig') $q$, '0');
select pruebas.espera_error('L08 Eliminarla otra vez: rechazado',
  $q$ select public.eliminar_entrada_bitacora(pruebas.id('r1_sig')) $q$, '22023');
select pruebas.como('u_operador');
select pruebas.espera_valor('L09 El operador tampoco la ve',
  $q$ select count(*)::text from public.bitacora_entradas where id = pruebas.id('r1_sig') $q$, '0');
select pruebas.espera_error('L10 Editar una eliminada: rechazado',
  $q$ select public.editar_entrada_bitacora(pruebas.id('r1_sig'), public.fecha_hoy(), 'tarea', 'x', null, null, pruebas.d(-1)) $q$, '22023');
select pruebas.espera_error('L11 Cambiar el estado de una eliminada: rechazado',
  $q$ select public.cambiar_estado_tarea(pruebas.id('r1_sig'), 'realizada') $q$, '22023');
select pruebas.espera_ok('L12 Sin la siguiente, la repetida se reabre',
  $q$ select public.cambiar_estado_tarea(pruebas.id('r1'), 'pendiente') $q$);

select pruebas.como('u_admin');
select pruebas.espera_ok('L13 El administrador elimina la decisión de la que salió una tarea',
  $q$ select public.eliminar_entrada_bitacora(pruebas.id('d1')) $q$);
select pruebas.espera_valor('L14 La tarea sigue',
  $q$ select estado_tarea from public.bitacora_entradas where id = pruebas.id('t_d1') $q$, 'pendiente');
select pruebas.espera_error('L15 Una tarea nueva no sale de una decisión eliminada',
  $q$ select public.crear_entrada_bitacora(p_establecimiento_id => pruebas.id('est_a'), p_fecha => null, p_tipo => 'tarea',
      p_texto => 'x', p_vencimiento => pruebas.d(-1), p_entrada_origen_id => pruebas.id('d1')) $q$, '22023');

reset role;
select pruebas.espera_valor('L16 En la base queda el rastro: cuándo y quién (el administrador), sin motivo',
  $q$ select (anulada_en is not null and anulada_por = pruebas.id('u_admin'))::text || '|' || coalesce(motivo_anulacion, 'sin motivo')
      from public.bitacora_entradas where id = pruebas.id('d1') $q$, 'true|sin motivo');
select pruebas.espera_valor('L17 Sus lotes no se tocan',
  $q$ select count(*)::text from public.bitacora_lotes where entrada_id = pruebas.id('d1') $q$, '1');
select pruebas.espera_error('L18 Borrarla de verdad: rechazado siempre',
  $q$ delete from public.bitacora_entradas where id = pruebas.id('d1') $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Calendario y anon
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_operador');
select pruebas.preparar('dada', $q$ select public.marcar_dosis_dada(pruebas.id('san'), 1) $q$);
select pruebas.espera_valor('C01 La próxima dosis dada figura como realizada',
  $q$ select estado from public.v_calendario where origen = 'dosis' and actividad_id = pruebas.id('san') $q$, 'realizada');
select pruebas.preparar('t1_realizada', $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'realizada') $q$);
select pruebas.espera_valor('C02 La tarea realizada figura como realizada, con cuándo',
  $q$ select estado || '|' || (hecha_en is not null)::text from public.v_calendario where entrada_id = pruebas.id('t1') $q$, 'realizada|true');

reset role;
set local role anon;
select pruebas.espera_error('N01 anon: cambiar_estado_decision',
  $q$ select public.cambiar_estado_decision(pruebas.id('i1'), 'realizada') $q$, '42501');
select pruebas.espera_error('N02 anon: eliminar_entrada_bitacora',
  $q$ select public.eliminar_entrada_bitacora(pruebas.id('i1')) $q$, '42501');
reset role;

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
  raise exception E'PRUEBAS BITACORA TRES TIPOS: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
