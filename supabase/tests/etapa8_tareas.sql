-- Campo Digital v2 — Pruebas de la etapa 8: tareas, próximas dosis y calendario
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261023000100_tareas).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ETAPA 8 (TAREAS): N OK, ...", que deshace todo.
--      El resultado esperado es "44 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
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



-- Tarea: crea una nota de tipo tarea y devuelve su id
create function pruebas.tarea(p_texto text, p_vence date, p_repetir int default null, p_origen uuid default null,
                              p_lotes uuid[] default null, p_persona uuid default null) returns uuid language sql as $$
  select public.crear_entrada_bitacora(pruebas.id('est_a'), public.fecha_hoy(), 'tarea', p_texto, p_lotes, p_persona,
                                       p_vence, p_repetir, p_origen)
$$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 crear y editar: una versión cada una, con vencimiento y repetición; authenticated sí, anon no',
  $q$ select string_agg(p.proname || '(' || (pg_get_function_identity_arguments(p.oid) like '%p_vencimiento date, p_repetir_cada_dias integer%')::text
          || ',' || (has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text || ')',
          ' ' order by p.proname)
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('crear_entrada_bitacora', 'editar_entrada_bitacora') $q$,
  'crear_entrada_bitacora(true,true) editar_entrada_bitacora(true,true)');
select pruebas.espera_valor('B02 cambiar_estado_tarea y marcar_dosis_dada: security definer para authenticated; _validar_datos_tarea interna; search_path fijo',
  $q$ select count(*) filter (where coalesce('search_path=""' = any (p.proconfig), false) and not has_function_privilege('anon', p.oid, 'execute')
              and case when p.proname like '\_%' then not has_function_privilege('authenticated', p.oid, 'execute')
                       else p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') end)::text || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('cambiar_estado_tarea', 'marcar_dosis_dada', '_validar_datos_tarea') $q$, '3/3');
select pruebas.espera_valor('B03 v_calendario con security_invoker; dosis dadas con RLS, solo lectura para authenticated y nada para anon',
  $q$ select (exists (select 1 from pg_class c where c.oid = 'public.v_calendario'::regclass and 'security_invoker=true' = any (c.reloptions))
              and (select relrowsecurity from pg_class where oid = 'public.sanidad_dosis_dadas'::regclass)
              and has_table_privilege('authenticated', 'public.sanidad_dosis_dadas', 'select')
              and not has_table_privilege('authenticated', 'public.sanidad_dosis_dadas', 'insert')
              and not has_table_privilege('anon', 'public.v_calendario', 'select'))::text $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('vacunos',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('novillos', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('p_oper',   $q$ select id from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_operador') $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: tareas
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');
select pruebas.guardar('LV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV Novillos', pruebas.d(60), pruebas.comp('novillos', 20)) $q$);

select pruebas.guardar('t1', $q$ select pruebas.tarea('Vacunar contra aftosa', pruebas.d(-5), null, null, array[pruebas.id('LV')], pruebas.id('p_oper')) $q$);
select pruebas.espera_valor('T01 Tarea: pendiente, con vencimiento, responsable y lote',
  $q$ select e.estado_tarea || '|' || (e.vencimiento = pruebas.d(-5))::text || '|' || (e.persona_id = pruebas.id('p_oper'))::text || '|'
          || (select count(*) from public.bitacora_lotes l where l.entrada_id = e.id)
      from public.bitacora_entradas e where e.id = pruebas.id('t1') $q$, 'pendiente|true|true|1');
select pruebas.espera_error('T02 Una tarea sin vencimiento',
  $q$ select pruebas.tarea('Algún día', null) $q$, '22023');
select pruebas.espera_error('T03 Una nota que no es tarea no lleva vencimiento',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x', null, null, pruebas.d(-1)) $q$, '22023');
select pruebas.espera_error('T04 Repetición de 0 días',
  $q$ select pruebas.tarea('x', pruebas.d(-1), 0) $q$, '22023');
select pruebas.espera_ok('T05 Editar la tarea: otro texto y otro vencimiento',
  $q$ select public.editar_entrada_bitacora(pruebas.id('t1'), public.fecha_hoy(), 'tarea', 'Vacunar contra aftosa (2 dosis)',
      array[pruebas.id('LV')], pruebas.id('p_oper'), pruebas.d(-7)) $q$);
select pruebas.espera_valor('T06 Sigue pendiente, con el vencimiento nuevo, y cuenta como editada',
  $q$ select estado_tarea || '|' || (vencimiento = pruebas.d(-7))::text || '|' || (editada_en is not null)::text
      from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'pendiente|true|true');
select pruebas.espera_valor('T07 Marcar hecha: sin repetición, no crea otra',
  $q$ select coalesce(public.cambiar_estado_tarea(pruebas.id('t1'), 'hecha')::text, 'sin siguiente') $q$, 'sin siguiente');
select pruebas.espera_valor('T08 Hecha, con quién y cuándo',
  $q$ select estado_tarea || '|' || (completada_por = pruebas.id('u_operador'))::text || '|' || (completada_en is not null)::text
      from public.bitacora_entradas where id = pruebas.id('t1') $q$, 'hecha|true|true');
select pruebas.espera_error('T09 Ya hecha: no se vuelve a marcar',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'hecha') $q$, '22023');
select pruebas.espera_ok('T10 Reabrir',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'pendiente') $q$);
select pruebas.espera_valor('T11 Reabierta: pendiente y sin datos de hecha',
  $q$ select estado_tarea || '|' || (completada_en is null and completada_por is null)::text from public.bitacora_entradas where id = pruebas.id('t1') $q$,
  'pendiente|true');
select pruebas.espera_ok('T12 Cancelar',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'cancelada') $q$);
select pruebas.preparar('anular_t1', $q$ select public.anular_entrada_bitacora(pruebas.id('t1'), 'Cargada de más') $q$);
select pruebas.espera_error('T13 Una tarea anulada no cambia de estado',
  $q$ select public.cambiar_estado_tarea(pruebas.id('t1'), 'pendiente') $q$, '22023');
select pruebas.guardar('nota', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'Aguada baja') $q$);
select pruebas.espera_error('T14 Una nota que no es tarea no tiene este estado',
  $q$ select public.cambiar_estado_tarea(pruebas.id('nota'), 'hecha') $q$, '22023');
select pruebas.espera_valor('T15 Una nota que no es tarea no tiene vencimiento ni estado de tarea',
  $q$ select coalesce(vencimiento::text, 'sin vencimiento') || '|' || coalesce(estado_tarea, 'sin estado') from public.bitacora_entradas where id = pruebas.id('nota') $q$,
  'sin vencimiento|sin estado');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Repetición
-- ════════════════════════════════════════════════════════════════════════════
-- Atrasada (venció hace 30 días, cada 15): la siguiente vence hoy + 15, no nace vencida.
-- Adelantada (vence en 10 días, cada 7, hecha hoy): la siguiente vence en 17 (conserva el ritmo).

select pruebas.guardar('r1', $q$ select pruebas.tarea('Revisar aguadas', pruebas.d(30), 15, null, array[pruebas.id('LV')]) $q$);
select pruebas.guardar('r1_sig', $q$ select public.cambiar_estado_tarea(pruebas.id('r1'), 'hecha') $q$);
select pruebas.espera_valor('R01 Atrasada: la siguiente vence hoy + 15, pendiente, con el mismo texto, lote, repetición y la anterior',
  $q$ select (s.vencimiento = public.fecha_hoy() + 15)::text || '|' || s.estado_tarea || '|' || s.texto || '|' || s.repetir_cada_dias || '|'
          || (s.tarea_anterior_id = pruebas.id('r1'))::text || '|' || (select count(*) from public.bitacora_lotes l where l.entrada_id = s.id)
      from public.bitacora_entradas s where s.id = pruebas.id('r1_sig') $q$, 'true|pendiente|Revisar aguadas|15|true|1');
select pruebas.guardar('r2', $q$ select pruebas.tarea('Recorrer alambrados', pruebas.d(-10), 7) $q$);
select pruebas.guardar('r2_sig', $q$ select public.cambiar_estado_tarea(pruebas.id('r2'), 'hecha') $q$);
select pruebas.espera_valor('R02 Adelantada: la siguiente vence en 17 días (vencimiento + 7), no en 7',
  $q$ select (vencimiento = public.fecha_hoy() + 17)::text from public.bitacora_entradas where id = pruebas.id('r2_sig') $q$, 'true');
select pruebas.espera_error('R03 Reabrir una que ya generó la siguiente: hay que anular esa antes',
  $q$ select public.cambiar_estado_tarea(pruebas.id('r1'), 'pendiente') $q$, '22023');
select pruebas.preparar('anular_r1_sig', $q$ select public.anular_entrada_bitacora(pruebas.id('r1_sig'), 'Se reabre la anterior') $q$);
select pruebas.espera_ok('R04 Con la siguiente anulada, se reabre',
  $q$ select public.cambiar_estado_tarea(pruebas.id('r1'), 'pendiente') $q$);
select pruebas.guardar('r3', $q$ select pruebas.tarea('Revisar bebederos', pruebas.d(-3), 30) $q$);
select pruebas.espera_valor('R05 Cancelar una repetida termina la repetición: no crea la siguiente',
  $q$ select coalesce(public.cambiar_estado_tarea(pruebas.id('r3'), 'cancelada')::text, 'sin siguiente') $q$, 'sin siguiente');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Tarea desde una nota
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('idea', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'idea', 'Probar suplementación') $q$);
select pruebas.preparar('decidir', $q$ select public.cambiar_estado_idea(pruebas.id('idea'), 'decidida') $q$);
select pruebas.guardar('t_idea', $q$ select pruebas.tarea('Comprar ración', pruebas.d(-2), null, pruebas.id('idea')) $q$);
select pruebas.espera_valor('O01 La tarea queda vinculada a la idea de la que salió',
  $q$ select (entrada_origen_id = pruebas.id('idea'))::text from public.bitacora_entradas where id = pruebas.id('t_idea') $q$, 'true');
select pruebas.espera_error('O02 La nota de origen no puede ser otra tarea',
  $q$ select pruebas.tarea('x', pruebas.d(-1), null, pruebas.id('t_idea')) $q$, '22023');
select pruebas.espera_error('O03 Ni una inexistente (o de otro establecimiento)',
  $q$ select pruebas.tarea('x', pruebas.d(-1), null, gen_random_uuid()) $q$, '22023');
select pruebas.espera_ok('O04 Una tarea pasa a ser observación',
  $q$ select public.editar_entrada_bitacora(pruebas.id('t_idea'), public.fecha_hoy(), 'observacion', 'Comprar ración') $q$);
select pruebas.espera_valor('O05 ...y pierde vencimiento, estado y vínculo',
  $q$ select coalesce(vencimiento::text, '-') || '|' || coalesce(estado_tarea, '-') || '|' || coalesce(entrada_origen_id::text, '-')
      from public.bitacora_entradas where id = pruebas.id('t_idea') $q$, '-|-|-');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Próximas dosis y calendario
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('san', $q$ select public.registrar_sanidad(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_lotes => array[pruebas.id('LV')], p_fecha => pruebas.d(5), p_productos => jsonb_build_array(
        jsonb_build_object('producto', 'Aftosa', 'categoria', 'Vacunación', 'fecha_proxima_dosis', pruebas.d(-20)),
        jsonb_build_object('producto', 'Ivermectina', 'categoria', 'Antiparasitario'))) $q$);
select pruebas.espera_valor('D01 La próxima dosis aparece sola en el calendario, pendiente, con el lote',
  $q$ select texto || '|' || estado || '|' || (fecha = pruebas.d(-20))::text || '|' || (lotes = array[pruebas.id('LV')])::text
      from public.v_calendario where origen = 'dosis' and actividad_id = pruebas.id('san') $q$, 'Próxima dosis: Aftosa|pendiente|true|true');
select pruebas.espera_ok('D02 Marcar la dosis como dada',
  $q$ select public.marcar_dosis_dada(pruebas.id('san'), 1) $q$);
select pruebas.espera_valor('D03 En el calendario figura hecha',
  $q$ select estado from public.v_calendario where origen = 'dosis' and actividad_id = pruebas.id('san') $q$, 'hecha');
select pruebas.espera_ok('D04 Desmarcarla',
  $q$ select public.marcar_dosis_dada(pruebas.id('san'), 1, false) $q$);
select pruebas.espera_valor('D05 Vuelve a pendiente (la marca no se borra: queda deshecha)',
  $q$ select (select estado from public.v_calendario where origen = 'dosis' and actividad_id = pruebas.id('san')) || '|'
          || (select count(*) from public.sanidad_dosis_dadas where actividad_id = pruebas.id('san')) $q$, 'pendiente|1');
select pruebas.espera_error('D06 Un producto sin próxima dosis no se marca',
  $q$ select public.marcar_dosis_dada(pruebas.id('san'), 2) $q$, '22023');
select pruebas.espera_valor('D07 El calendario muestra las tareas no anuladas con su fecha y estado (r1 pendiente, r2 hecha y su siguiente)',
  $q$ select string_agg(estado, ',' order by fecha) from public.v_calendario
      where origen = 'tarea' and entrada_id in (pruebas.id('r1'), pruebas.id('r2'), pruebas.id('r2_sig'), pruebas.id('r1_sig')) $q$,
  'pendiente,hecha,pendiente');
select pruebas.preparar('anular_san', $q$ select public.anular_actividad(pruebas.id('san'), 'Cargada por error') $q$);
select pruebas.espera_valor('D08 Si se anula la sanidad, la próxima dosis desaparece del calendario',
  $q$ select count(*)::text from public.v_calendario where origen = 'dosis' and actividad_id = pruebas.id('san') $q$, '0');
select pruebas.espera_error('D09 La dosis de una sanidad anulada no se marca',
  $q$ select public.marcar_dosis_dada(pruebas.id('san'), 1) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Permisos
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_valor('Q01 Consulta ve el calendario',
  $q$ select (count(*) > 0)::text from public.v_calendario where establecimiento_id = pruebas.id('est_a') $q$, 'true');
select pruebas.espera_error('Q02 Consulta no crea tareas',
  $q$ select pruebas.tarea('x', pruebas.d(-1)) $q$, '42501');
select pruebas.espera_error('Q03 Consulta no marca tareas',
  $q$ select public.cambiar_estado_tarea(pruebas.id('r2_sig'), 'hecha') $q$, '42501');

select pruebas.como('u_ajeno');
select pruebas.espera_valor('X01 Otro establecimiento no ve el calendario de Santa Remigia',
  $q$ select count(*)::text from public.v_calendario where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_error('X02 ...ni marca sus tareas',
  $q$ select public.cambiar_estado_tarea(pruebas.id('r2_sig'), 'hecha') $q$, '42501');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no lee el calendario',
  $q$ select count(*) from public.v_calendario $q$, '42501');
select pruebas.espera_error('N02 anon no marca tareas',
  $q$ select public.cambiar_estado_tarea(pruebas.id('r2_sig'), 'hecha') $q$, '42501');

reset role;

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
  raise exception E'PRUEBAS ETAPA 8 (TAREAS): % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
