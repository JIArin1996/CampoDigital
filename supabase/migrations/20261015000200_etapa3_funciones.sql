-- Campo Digital v2 — Etapa 3: funciones y vistas
--
-- Toda escritura de varias tablas, o que valida stock, pasa por estas funciones.
-- Diseño: contexto/DISENO-BASE-ETAPA-3.md (secciones 3, 5 y 6)
--
-- Reglas comunes de las funciones security definer:
--   * set search_path = '' y nombres calificados;
--   * validan es_editor adentro antes de escribir (error 42501 si no);
--   * revoke execute from public, anon; grant execute solo a authenticated;
--   * las internas (con _ adelante) no se pueden llamar por la API.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Funciones internas
-- ════════════════════════════════════════════════════════════════════════════

-- Bloquea la fila del lote (select ... for update) y verifica que el usuario sea editor.
-- Va siempre ANTES de leer el saldo: con dos editores cargando a la vez, el segundo
-- espera a que termine el primero y valida con el saldo ya actualizado.
-- No distingue "no existe" de "sin permiso", para no revelar lotes ajenos.

begin;

create function public._bloquear_lote_editable(p_lote_id uuid) returns public.lotes
language plpgsql
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  select * into v_lote
  from public.lotes
  where id = p_lote_id
  for update;

  if not found or not public.es_editor(v_lote.establecimiento_id) then
    raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
  end if;

  return v_lote;
end;
$$;

-- Verifica que el saldo de una categoría en un lote no quede negativo en ninguna fecha.
-- Suma los eventos por día y acumula en orden de fecha: el saldo al final de cada día
-- tiene que ser >= 0. Se compara por día porque los eventos de una misma operación
-- comparten fecha y hora de carga.
create function public._validar_saldo(p_lote_id uuid, p_categoria_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_fecha date;
  v_saldo bigint;
begin
  select d.fecha, d.saldo into v_fecha, v_saldo
  from (
    select e.fecha, sum(sum(e.cabezas)) over (order by e.fecha) as saldo
    from public.lote_eventos e
    where e.lote_id = p_lote_id
      and e.categoria_id = p_categoria_id
    group by e.fecha
  ) d
  where d.saldo < 0
  order by d.fecha
  limit 1;

  if found then
    raise exception 'El stock de la categoría quedaría negativo (% cabezas al %)',
      v_saldo, to_char(v_fecha, 'DD/MM/YYYY')
      using errcode = '23514';
  end if;
end;
$$;

-- Catálogos iniciales de un establecimiento: el set de Santa Remigia.
-- Los nombres compuestos del documento (terneros/as, etc.) van como dos categorías.
create function public._cargar_catalogos_base(p_establecimiento_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_vacunos uuid;
  v_ovinos  uuid;
begin
  insert into public.especies (establecimiento_id, nombre)
  values (p_establecimiento_id, 'Vacunos')
  returning id into v_vacunos;

  insert into public.especies (establecimiento_id, nombre)
  values (p_establecimiento_id, 'Ovinos')
  returning id into v_ovinos;

  insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden)
  select p_establecimiento_id, v_vacunos, c.nombre, c.orden::int
  from unnest(array[
    'Terneros', 'Terneras', 'Vaquillonas', 'Novillos',
    'Vacas de cría', 'Vacas de invernada o descarte', 'Toros'
  ]) with ordinality as c(nombre, orden);

  insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden)
  select p_establecimiento_id, v_ovinos, c.nombre, c.orden::int
  from unnest(array[
    'Corderos', 'Corderas', 'Borregos', 'Borregas',
    'Ovejas de cría', 'Ovejas de descarte', 'Carneros'
  ]) with ordinality as c(nombre, orden);

  insert into public.rubros (establecimiento_id, nombre)
  select p_establecimiento_id, r.nombre
  from unnest(array['Vacunos', 'Ovinos', 'Forestación tercerizada', 'General']) as r(nombre);
end;
$$;

revoke execute on function public._bloquear_lote_editable(uuid) from public, anon, authenticated;
revoke execute on function public._validar_saldo(uuid, uuid)     from public, anon, authenticated;
revoke execute on function public._cargar_catalogos_base(uuid)   from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Alta de establecimiento
-- ════════════════════════════════════════════════════════════════════════════
-- Crea el establecimiento y la membresía de editor del usuario actual en una sola
-- transacción. establecimientos y membresias no tienen política de insert: esta es
-- la única forma de crearlos.

create function public.crear_establecimiento(
  p_nombre                text,
  p_departamento          text,
  p_localidad             text    default null,
  p_paraje                text    default null,
  p_superficie_total      numeric default null,
  p_sistema_productivo    text    default null,
  p_propietario           text    default null,
  p_rut                   text    default null,
  p_dicose                text    default null,
  p_fecha_alta            date    default null,
  p_observaciones         text    default null,
  p_cargar_catalogos_base boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_est  uuid;
begin
  if v_user is null then
    raise exception 'Hay que iniciar sesión' using errcode = '42501';
  end if;

  insert into public.establecimientos (
    nombre, departamento, localidad, paraje, superficie_total, sistema_productivo,
    propietario, rut, dicose, fecha_alta, observaciones
  ) values (
    p_nombre, p_departamento, p_localidad, p_paraje, p_superficie_total, p_sistema_productivo,
    p_propietario, p_rut, p_dicose, coalesce(p_fecha_alta, public.fecha_hoy()), p_observaciones
  )
  returning id into v_est;

  insert into public.membresias (establecimiento_id, user_id, rol)
  values (v_est, v_user, 'editor');

  if p_cargar_catalogos_base then
    perform public._cargar_catalogos_base(v_est);
  end if;

  return v_est;
end;
$$;

revoke execute on function public.crear_establecimiento(text, text, text, text, numeric, text, text, text, text, date, text, boolean) from public, anon;
grant  execute on function public.crear_establecimiento(text, text, text, text, numeric, text, text, text, text, date, text, boolean) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Lotes y libro de stock
-- ════════════════════════════════════════════════════════════════════════════

-- Crea un lote con su composición inicial: un evento alta_inicial por categoría.
-- p_composicion: [{"categoria_id": "<uuid>", "cabezas": 120}, ...]
create function public.crear_lote(
  p_establecimiento_id uuid,
  p_especie_id         uuid,
  p_nombre             text,
  p_fecha_apertura     date,
  p_composicion        jsonb,
  p_potrero_id         uuid default null,
  p_campana            text default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  uuid;
  v_item  jsonb;
  v_cat   uuid;
  v_cab   int;
begin
  if not public.es_editor(p_establecimiento_id) then
    raise exception 'Sin permiso de edición en este establecimiento' using errcode = '42501';
  end if;

  if p_fecha_apertura is null or p_fecha_apertura > public.fecha_hoy() then
    raise exception 'La fecha de apertura no puede estar vacía ni ser futura' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.especies s
    where s.id = p_especie_id and s.establecimiento_id = p_establecimiento_id and s.activo
  ) then
    raise exception 'Especie inexistente o inactiva en este establecimiento' using errcode = '22023';
  end if;

  if p_composicion is null or jsonb_typeof(p_composicion) <> 'array' or jsonb_array_length(p_composicion) = 0 then
    raise exception 'La composición inicial tiene que tener al menos una categoría' using errcode = '22023';
  end if;

  if (select count(distinct x ->> 'categoria_id') from jsonb_array_elements(p_composicion) x)
     <> jsonb_array_length(p_composicion) then
    raise exception 'Hay categorías repetidas en la composición inicial' using errcode = '22023';
  end if;

  insert into public.lotes (establecimiento_id, especie_id, nombre, campana, fecha_apertura, potrero_id, notas)
  values (p_establecimiento_id, p_especie_id, p_nombre, p_campana, p_fecha_apertura, p_potrero_id, p_notas)
  returning id into v_lote;

  for v_item in select * from jsonb_array_elements(p_composicion) loop
    v_cat := nullif(v_item ->> 'categoria_id', '')::uuid;
    v_cab := (v_item ->> 'cabezas')::int;

    if v_cab is null or v_cab <= 0 then
      raise exception 'Las cabezas del alta inicial tienen que ser mayores a cero' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.categorias_animales c
      where c.id = v_cat and c.especie_id = p_especie_id and c.activo
    ) then
      raise exception 'Categoría inexistente, inactiva o de otra especie' using errcode = '22023';
    end if;

    insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo)
    values (p_establecimiento_id, v_lote, p_especie_id, v_cat, v_cab, p_fecha_apertura, 'alta_inicial');
  end loop;

  return v_lote;
end;
$$;

-- Corrección del stock de una categoría: evento de ajuste con signo y motivo obligatorio.
create function public.registrar_ajuste(
  p_lote_id      uuid,
  p_categoria_id uuid,
  p_cabezas      int,
  p_fecha        date,
  p_nota         text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote   public.lotes;
  v_evento uuid;
begin
  -- 1. Bloquear el lote y verificar permiso (antes de leer el saldo)
  v_lote := public._bloquear_lote_editable(p_lote_id);

  -- 2. Validaciones
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;

  if p_cabezas is null or p_cabezas = 0 then
    raise exception 'El ajuste tiene que tener cabezas distintas de cero' using errcode = '22023';
  end if;

  if p_nota is null or btrim(p_nota) = '' then
    raise exception 'El ajuste necesita un motivo' using errcode = '22023';
  end if;

  if p_fecha is null or p_fecha > public.fecha_hoy() or p_fecha < v_lote.fecha_apertura then
    raise exception 'La fecha tiene que estar entre la apertura del lote y hoy' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.categorias_animales c
    where c.id = p_categoria_id and c.especie_id = v_lote.especie_id
  ) then
    raise exception 'Categoría inexistente o de otra especie' using errcode = '22023';
  end if;

  -- 3. Evento
  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, nota)
  values (v_lote.establecimiento_id, v_lote.id, v_lote.especie_id, p_categoria_id, p_cabezas, p_fecha, 'ajuste', p_nota)
  returning id into v_evento;

  -- 4. Saldo nunca negativo
  perform public._validar_saldo(v_lote.id, p_categoria_id);

  return v_evento;
end;
$$;

-- Cierra un lote. Solo si el stock de todas sus categorías es cero.
create function public.cerrar_lote(
  p_lote_id uuid,
  p_fecha   date,
  p_motivo  text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote         public.lotes;
  v_ultimo_evento date;
begin
  v_lote := public._bloquear_lote_editable(p_lote_id);

  if v_lote.estado <> 'activo' then
    raise exception 'El lote ya está cerrado' using errcode = '22023';
  end if;

  select max(e.fecha) into v_ultimo_evento
  from public.lote_eventos e
  where e.lote_id = v_lote.id;

  if p_fecha is null or p_fecha > public.fecha_hoy()
     or p_fecha < greatest(v_lote.fecha_apertura, coalesce(v_ultimo_evento, v_lote.fecha_apertura)) then
    raise exception 'La fecha de cierre tiene que estar entre el último movimiento del lote y hoy' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.lote_eventos e
    where e.lote_id = v_lote.id
    group by e.categoria_id
    having sum(e.cabezas) <> 0
  ) then
    raise exception 'El lote todavía tiene animales: solo se puede cerrar con stock en cero' using errcode = '23514';
  end if;

  update public.lotes
  set estado = 'cerrado', fecha_cierre = p_fecha
  where id = v_lote.id;

  insert into public.lote_cambios_estado (establecimiento_id, lote_id, tipo, fecha, motivo)
  values (v_lote.establecimiento_id, v_lote.id, 'cierre', p_fecha, p_motivo);
end;
$$;

-- Vuelve a abrir un lote cerrado. Deja registro.
create function public.reabrir_lote(
  p_lote_id uuid,
  p_fecha   date,
  p_motivo  text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  v_lote := public._bloquear_lote_editable(p_lote_id);

  if v_lote.estado <> 'cerrado' then
    raise exception 'El lote no está cerrado' using errcode = '22023';
  end if;

  if p_fecha is null or p_fecha > public.fecha_hoy() or p_fecha < v_lote.fecha_cierre then
    raise exception 'La fecha de reapertura tiene que estar entre el cierre del lote y hoy' using errcode = '22023';
  end if;

  update public.lotes
  set estado = 'activo', fecha_cierre = null
  where id = v_lote.id;

  insert into public.lote_cambios_estado (establecimiento_id, lote_id, tipo, fecha, motivo)
  values (v_lote.establecimiento_id, v_lote.id, 'reapertura', p_fecha, p_motivo);
end;
$$;

revoke execute on function public.crear_lote(uuid, uuid, text, date, jsonb, uuid, text, text) from public, anon;
revoke execute on function public.registrar_ajuste(uuid, uuid, int, date, text)               from public, anon;
revoke execute on function public.cerrar_lote(uuid, date, text)                               from public, anon;
revoke execute on function public.reabrir_lote(uuid, date, text)                              from public, anon;
grant  execute on function public.crear_lote(uuid, uuid, text, date, jsonb, uuid, text, text) to authenticated;
grant  execute on function public.registrar_ajuste(uuid, uuid, int, date, text)               to authenticated;
grant  execute on function public.cerrar_lote(uuid, date, text)                               to authenticated;
grant  execute on function public.reabrir_lote(uuid, date, text)                              to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Vistas de stock
-- ════════════════════════════════════════════════════════════════════════════
-- security_invoker = true es obligatorio: sin eso la vista corre como su dueño y se
-- saltea el RLS (cualquiera vería el stock de todos). Requiere Postgres 15+; en una
-- versión anterior esta sentencia falla, en vez de dejar una vista insegura.
-- No materializadas: una vista materializada no admite RLS.

create view public.v_stock_lote
with (security_invoker = true) as
select
  e.establecimiento_id,
  e.lote_id,
  e.especie_id,
  e.categoria_id,
  sum(e.cabezas)::int as cabezas
from public.lote_eventos e
group by e.establecimiento_id, e.lote_id, e.especie_id, e.categoria_id
having sum(e.cabezas) <> 0;

create view public.v_stock_establecimiento
with (security_invoker = true) as
select
  s.establecimiento_id,
  s.especie_id,
  s.categoria_id,
  sum(s.cabezas)::int as cabezas
from public.v_stock_lote s
join public.lotes l on l.id = s.lote_id
where l.estado = 'activo'
group by s.establecimiento_id, s.especie_id, s.categoria_id;

revoke all    on public.v_stock_lote, public.v_stock_establecimiento from anon, authenticated;
grant  select on public.v_stock_lote, public.v_stock_establecimiento to authenticated;

commit;
