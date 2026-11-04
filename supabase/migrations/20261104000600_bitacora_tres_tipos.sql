-- Campo Digital v2 — Bitácora con tres tipos: tarea, decisión e idea
--
-- Pedido del 2026-11-04 (respuestas en contexto/DISENO-BITACORA-TRES-TIPOS.md).
--
--   1. Tipos: tarea, decisión e idea. Las observaciones y las compras/ventas/gastos que había se
--      eliminan (quedan ocultas, como las actividades eliminadas).
--   2. Estados: tarea pendiente o realizada (antes "hecha"); decisión pendiente o realizada (nuevo:
--      estado_decision; las que había arrancan pendientes); idea abierta, decidida o descartada (igual).
--      Las tareas canceladas que había se eliminan. Cerrada = tarea realizada, decisión realizada o
--      idea decidida o descartada (cerrada_en y cerrada_por, como hasta ahora).
--   3. Eliminar reemplaza a Anular y Restaurar: solo el administrador; la entrada queda oculta
--      (anulada_en pasa a significar "eliminada", como en actividades). El motivo es opcional y quién
--      también (las que elimina esta migración no tienen quién). Las anuladas que había pasan a eliminadas.
--   4. RLS: las eliminadas no se leen desde la app (ni el administrador).
--   5. Funciones: _validar_entrada_bitacora, crear_entrada_bitacora, editar_entrada_bitacora,
--      cambiar_estado_tarea y cambiar_estado_idea (mismas firmas), cambiar_estado_decision y
--      eliminar_entrada_bitacora (nuevas); se borran anular_entrada_bitacora y restaurar_entrada_bitacora.
--   6. v_calendario: la próxima dosis dada figura como 'realizada', igual que las tareas.
--
-- Auditoría: 146 funciones (+2 cambiar_estado_decision y eliminar_entrada_bitacora, -2 anular y restaurar).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Checks viejos
-- ════════════════════════════════════════════════════════════════════════════
-- El de la anulación y el de estado_tarea se crearon sin nombre: se buscan por su definición.

do $$
declare
  v_def     text;
  v_nombres text[];
begin
  foreach v_def in array array['%anulada_por IS NULL%motivo_anulacion IS NULL%', '%estado_tarea = ANY%'] loop
    select array_agg(conname) into v_nombres from pg_constraint
    where conrelid = 'public.bitacora_entradas'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like v_def and pg_get_constraintdef(oid) not like '%tipo%';
    if coalesce(array_length(v_nombres, 1), 0) <> 1 then
      raise exception 'Se esperaba un solo check "%" en bitacora_entradas y hay %', v_def, coalesce(array_length(v_nombres, 1), 0);
    end if;
    execute format('alter table public.bitacora_entradas drop constraint %I', v_nombres[1]);
  end loop;
end $$;

alter table public.bitacora_entradas
  drop constraint bitacora_entradas_tipo_check,
  drop constraint bitacora_tarea_hecha,
  drop constraint bitacora_entradas_cerrada_check,
  add column estado_decision text;

comment on column public.bitacora_entradas.anulada_en is 'Eliminada: la entrada no se muestra (desde 20261104000600)';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Datos que ya existen
-- ════════════════════════════════════════════════════════════════════════════
-- Sin tocar updated_at ni cerrada_en: el cambio de nombre de "hecha" a "realizada" no es un cierre nuevo.

alter table public.bitacora_entradas disable trigger set_updated_at;
alter table public.bitacora_entradas disable trigger marcar_cierre;

update public.bitacora_entradas
set anulada_en = now(), motivo_anulacion = 'La bitácora ya no tiene este tipo'
where tipo in ('observacion', 'compra_venta_gasto') and anulada_en is null;

update public.bitacora_entradas
set anulada_en = now(), motivo_anulacion = 'Las tareas ya no se cancelan'
where tipo = 'tarea' and estado_tarea = 'cancelada' and anulada_en is null;

update public.bitacora_entradas set estado_tarea = 'realizada' where estado_tarea = 'hecha';
update public.bitacora_entradas set estado_decision = 'pendiente' where tipo = 'decision';

alter table public.bitacora_entradas enable trigger set_updated_at;
alter table public.bitacora_entradas enable trigger marcar_cierre;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Checks nuevos
-- ════════════════════════════════════════════════════════════════════════════
-- Los tipos y el estado "cancelada" que ya no existen quedan solo en las eliminadas.

alter table public.bitacora_entradas
  add constraint bitacora_entradas_tipo_check
    check (tipo in ('decision', 'idea', 'tarea')
           or (anulada_en is not null and tipo in ('observacion', 'compra_venta_gasto'))),
  add constraint bitacora_entradas_estado_tarea_check
    check (estado_tarea in ('pendiente', 'realizada') or (anulada_en is not null and estado_tarea = 'cancelada')),
  add constraint bitacora_entradas_estado_decision_check
    check (estado_decision in ('pendiente', 'realizada')),
  -- toda decisión tiene estado y nada que no sea decisión lo tiene
  add constraint bitacora_decision_estado check ((tipo = 'decision') = (estado_decision is not null)),
  -- realizada = con quién y cuándo; sin realizada, sin esos datos
  add constraint bitacora_tarea_realizada check ((estado_tarea = 'realizada') = (completada_en is not null)
                                                 and (completada_en is null) = (completada_por is null)),
  add constraint bitacora_entradas_cerrada_check check (
    coalesce((tipo = 'tarea'    and estado_tarea    in ('realizada', 'cancelada'))
          or (tipo = 'decision' and estado_decision = 'realizada')
          or (tipo = 'idea'     and estado_idea     in ('decidida', 'descartada')), false)
    = (cerrada_en is not null)),
  -- quién y el motivo, solo en las eliminadas (los dos son opcionales)
  add constraint bitacora_entradas_eliminada_check
    check (anulada_en is not null or (anulada_por is null and motivo_anulacion is null));

-- Completa cuándo y quién al cerrar (o al pasar de un estado cerrado a otro); los borra al reabrir;
-- si el estado no cambia, conserva los que había
create or replace function public.marcar_cierre_entrada() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cerrada boolean := coalesce((new.tipo = 'tarea'    and new.estado_tarea    in ('realizada', 'cancelada'))
                             or (new.tipo = 'decision' and new.estado_decision = 'realizada')
                             or (new.tipo = 'idea'     and new.estado_idea     in ('decidida', 'descartada')), false);
begin
  if not v_cerrada then
    new.cerrada_en := null;
    new.cerrada_por := null;
  elsif tg_op = 'INSERT'
     or (old.tipo, old.estado_tarea, old.estado_decision, old.estado_idea)
        is distinct from (new.tipo, new.estado_tarea, new.estado_decision, new.estado_idea) then
    new.cerrada_en := now();
    new.cerrada_por := auth.uid();
  else
    new.cerrada_en := old.cerrada_en;
    new.cerrada_por := old.cerrada_por;
  end if;
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS: las eliminadas no se leen
-- ════════════════════════════════════════════════════════════════════════════

drop policy bitacora_entradas_select on public.bitacora_entradas;
create policy bitacora_entradas_select on public.bitacora_entradas
  for select to authenticated using (public.es_miembro(establecimiento_id) and anulada_en is null);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Funciones
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._validar_entrada_bitacora(
  p_establecimiento_id uuid, p_fecha date, p_tipo text, p_texto text
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_tipo is null or p_tipo not in ('decision', 'idea', 'tarea') then
    raise exception 'Tipo inválido: tarea, decisión o idea' using errcode = '22023';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'La entrada necesita un texto' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
end;
$$;

-- La decisión arranca pendiente, la idea abierta y la tarea pendiente
create or replace function public.crear_entrada_bitacora(
  p_establecimiento_id uuid,
  p_fecha              date,
  p_tipo               text,
  p_texto              text,
  p_lotes              uuid[] default null,
  p_responsables       uuid[] default null,
  p_vencimiento        date   default null,   -- tareas: obligatorio
  p_repetir_cada_dias  int    default null,   -- tareas: opcional
  p_entrada_origen_id  uuid   default null    -- tareas: la decisión o idea de la que salió
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_fecha date := coalesce(p_fecha, public.fecha_hoy());
begin
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._validar_entrada_bitacora(p_establecimiento_id, v_fecha, p_tipo, p_texto);
  perform public._validar_responsables(p_responsables, p_establecimiento_id);
  perform public._validar_datos_tarea(p_tipo, p_vencimiento, p_repetir_cada_dias);

  if p_entrada_origen_id is not null then
    if p_tipo <> 'tarea' then
      raise exception 'Solo una tarea sale de otra nota' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.bitacora_entradas o
      where o.id = p_entrada_origen_id and o.establecimiento_id = p_establecimiento_id
        and o.tipo <> 'tarea' and o.anulada_en is null
    ) then
      raise exception 'La nota de origen no existe, está eliminada o es otra tarea' using errcode = '22023';
    end if;
  end if;

  insert into public.bitacora_entradas (
    establecimiento_id, fecha, tipo, texto, estado_idea, estado_decision,
    vencimiento, estado_tarea, repetir_cada_dias, entrada_origen_id
  ) values (
    p_establecimiento_id, v_fecha, p_tipo, btrim(p_texto),
    case when p_tipo = 'idea' then 'abierta' end,
    case when p_tipo = 'decision' then 'pendiente' end,
    p_vencimiento, case when p_tipo = 'tarea' then 'pendiente' end, p_repetir_cada_dias, p_entrada_origen_id
  )
  returning id into v_id;

  perform public._guardar_lotes_bitacora(v_id, p_establecimiento_id, p_lotes);
  perform public._guardar_responsables_entrada(v_id, p_establecimiento_id, p_responsables);
  return v_id;
end;
$$;

-- Sigue siendo del mismo tipo: conserva su estado; cambia de tipo: arranca con el estado inicial del nuevo
create or replace function public.editar_entrada_bitacora(
  p_entrada_id        uuid,
  p_fecha             date,
  p_tipo              text,
  p_texto             text,
  p_lotes             uuid[] default null,
  p_responsables      uuid[] default null,
  p_vencimiento       date   default null,
  p_repetir_cada_dias int    default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bitacora_entradas;
  v_tarea boolean := p_tipo = 'tarea';
begin
  v := public._bloquear_entrada_bitacora(p_entrada_id);
  if v.anulada_en is not null then
    raise exception 'La entrada está eliminada' using errcode = '22023';
  end if;
  perform public._validar_entrada_bitacora(v.establecimiento_id, p_fecha, p_tipo, p_texto);
  -- los que ya tenía se pueden dejar aunque estén inactivos
  perform public._validar_responsables(p_responsables, v.establecimiento_id,
    array(select r.persona_id from public.bitacora_responsables r where r.entrada_id = v.id));
  perform public._validar_datos_tarea(p_tipo, p_vencimiento, p_repetir_cada_dias);

  update public.bitacora_entradas
  set fecha             = p_fecha,
      tipo              = p_tipo,
      texto             = btrim(p_texto),
      estado_idea       = case when p_tipo = 'idea' then coalesce(v.estado_idea, 'abierta') end,
      estado_decision   = case when p_tipo = 'decision' then coalesce(v.estado_decision, 'pendiente') end,
      vencimiento       = p_vencimiento,
      repetir_cada_dias = p_repetir_cada_dias,
      estado_tarea      = case when v_tarea then coalesce(v.estado_tarea, 'pendiente') end,
      completada_en     = case when v_tarea then v.completada_en end,
      completada_por    = case when v_tarea then v.completada_por end,
      entrada_origen_id = case when v_tarea then v.entrada_origen_id end,
      tarea_anterior_id = case when v_tarea then v.tarea_anterior_id end,
      editada_en        = now(),
      editada_por       = auth.uid()
  where id = v.id;

  perform public._guardar_lotes_bitacora(v.id, v.establecimiento_id, p_lotes);
  perform public._guardar_responsables_entrada(v.id, v.establecimiento_id, p_responsables);
end;
$$;

-- Pendiente o realizada. Al marcar realizada una que se repite, crea la siguiente (copia lotes y
-- responsables) y devuelve su id; si no, null. No cuenta como edición.
create or replace function public.cambiar_estado_tarea(p_entrada_id uuid, p_estado text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v           public.bitacora_entradas;
  v_siguiente uuid;
  v_vence     date;
begin
  v := public._bloquear_entrada_bitacora(p_entrada_id);
  if v.anulada_en is not null then
    raise exception 'La tarea está eliminada' using errcode = '22023';
  end if;
  if v.tipo <> 'tarea' then
    raise exception 'Solo las tareas tienen este estado' using errcode = '22023';
  end if;
  if p_estado is null or p_estado not in ('pendiente', 'realizada') then
    raise exception 'Estado inválido: pendiente o realizada' using errcode = '22023';
  end if;
  if p_estado = v.estado_tarea then
    raise exception 'La tarea ya está %', p_estado using errcode = '22023';
  end if;

  -- Reabrir una que ya generó la siguiente dejaría dos pendientes: primero se elimina la siguiente
  if p_estado = 'pendiente' then
    select s.vencimiento into v_vence from public.bitacora_entradas s
    where s.tarea_anterior_id = v.id and s.anulada_en is null
    limit 1;
    if found then
      raise exception 'Esta tarea ya generó la siguiente (vence el %): hay que eliminar esa antes de reabrir', to_char(v_vence, 'DD/MM/YYYY')
        using errcode = '22023';
    end if;
  end if;

  update public.bitacora_entradas
  set estado_tarea   = p_estado,
      completada_en  = case when p_estado = 'realizada' then now() end,
      completada_por = case when p_estado = 'realizada' then auth.uid() end
  where id = v.id;

  -- Repetida y realizada: la siguiente vence el más tardío entre hoy y su vencimiento, más N días
  if p_estado = 'realizada' and v.repetir_cada_dias is not null
     and not exists (select 1 from public.bitacora_entradas s where s.tarea_anterior_id = v.id and s.anulada_en is null) then
    insert into public.bitacora_entradas (
      establecimiento_id, fecha, tipo, texto,
      vencimiento, estado_tarea, repetir_cada_dias, entrada_origen_id, tarea_anterior_id
    ) values (
      v.establecimiento_id, public.fecha_hoy(), 'tarea', v.texto,
      greatest(public.fecha_hoy(), v.vencimiento) + v.repetir_cada_dias, 'pendiente', v.repetir_cada_dias,
      v.entrada_origen_id, v.id
    )
    returning id into v_siguiente;

    insert into public.bitacora_lotes (establecimiento_id, entrada_id, lote_id)
    select bl.establecimiento_id, v_siguiente, bl.lote_id from public.bitacora_lotes bl where bl.entrada_id = v.id;

    -- la siguiente tiene los mismos responsables
    insert into public.bitacora_responsables (establecimiento_id, entrada_id, persona_id)
    select r.establecimiento_id, v_siguiente, r.persona_id from public.bitacora_responsables r where r.entrada_id = v.id;
  end if;

  return v_siguiente;
end;
$$;

-- Abierta, decidida o descartada. No cuenta como edición.
create or replace function public.cambiar_estado_idea(p_entrada_id uuid, p_estado text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bitacora_entradas;
begin
  v := public._bloquear_entrada_bitacora(p_entrada_id);
  if v.anulada_en is not null then
    raise exception 'La entrada está eliminada' using errcode = '22023';
  end if;
  if v.tipo <> 'idea' then
    raise exception 'Solo las ideas tienen este estado' using errcode = '22023';
  end if;
  if p_estado is null or p_estado not in ('abierta', 'decidida', 'descartada') then
    raise exception 'Estado inválido: abierta, decidida o descartada' using errcode = '22023';
  end if;

  update public.bitacora_entradas set estado_idea = p_estado where id = v.id;
end;
$$;

-- Pendiente o realizada. No cuenta como edición.
create function public.cambiar_estado_decision(p_entrada_id uuid, p_estado text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bitacora_entradas;
begin
  v := public._bloquear_entrada_bitacora(p_entrada_id);
  if v.anulada_en is not null then
    raise exception 'La entrada está eliminada' using errcode = '22023';
  end if;
  if v.tipo <> 'decision' then
    raise exception 'Solo las decisiones tienen este estado' using errcode = '22023';
  end if;
  if p_estado is null or p_estado not in ('pendiente', 'realizada') then
    raise exception 'Estado inválido: pendiente o realizada' using errcode = '22023';
  end if;
  if p_estado = v.estado_decision then
    raise exception 'La decisión ya está %', p_estado using errcode = '22023';
  end if;

  update public.bitacora_entradas set estado_decision = p_estado where id = v.id;
end;
$$;

-- Solo el administrador. La entrada queda oculta (sus lotes y responsables no se tocan). Una tarea que
-- salió de ella sigue, sin el vínculo a la vista.
create function public.eliminar_entrada_bitacora(p_entrada_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bitacora_entradas;
begin
  v := public._bloquear_entrada_bitacora(p_entrada_id);
  if not public.es_admin() then
    raise exception 'Solo el administrador elimina entradas de la bitácora' using errcode = '42501';
  end if;
  if v.anulada_en is not null then
    raise exception 'La entrada ya está eliminada' using errcode = '22023';
  end if;

  update public.bitacora_entradas set anulada_en = now(), anulada_por = auth.uid() where id = v.id;
end;
$$;

drop function public.anular_entrada_bitacora(uuid, text);
drop function public.restaurar_entrada_bitacora(uuid);

revoke execute on function public.cambiar_estado_decision(uuid, text) from public, anon;
revoke execute on function public.eliminar_entrada_bitacora(uuid)     from public, anon;
grant  execute on function public.cambiar_estado_decision(uuid, text) to authenticated;
grant  execute on function public.eliminar_entrada_bitacora(uuid)     to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Calendario: la próxima dosis dada figura como realizada
-- ════════════════════════════════════════════════════════════════════════════

create or replace view public.v_calendario
with (security_invoker = true) as
select e.establecimiento_id, 'tarea'::text as origen, e.id as entrada_id, null::uuid as actividad_id, null::int as orden,
       e.vencimiento as fecha, e.texto,
       coalesce((select array_agg(r.persona_id order by r.persona_id) from public.bitacora_responsables r
                 where r.entrada_id = e.id), '{}'::uuid[]) as responsables,
       e.estado_tarea as estado, e.repetir_cada_dias,
       coalesce((select array_agg(bl.lote_id order by bl.lote_id) from public.bitacora_lotes bl where bl.entrada_id = e.id), '{}'::uuid[]) as lotes,
       e.completada_en as hecha_en,
       null::uuid as producto_id
from public.bitacora_entradas e
where e.tipo = 'tarea' and e.anulada_en is null
union all
select a.establecimiento_id, 'dosis', null, p.actividad_id, p.orden,
       p.fecha_proxima_dosis, 'Próxima dosis: ' || p.producto, '{}'::uuid[],
       case when dd.producto_id is not null and dd.deshecha_en is null then 'realizada' else 'pendiente' end,
       null::int,
       coalesce((select array_agg(al.lote_id order by al.lote_id) from public.actividad_lotes al
                 where al.actividad_id = a.id and al.rol = 'principal'), '{}'::uuid[]),
       case when dd.deshecha_en is null then dd.dada_en end,
       p.id
from public.act_sanidad_productos p
join public.actividades a on a.id = p.actividad_id
left join public.sanidad_dosis_dadas dd on dd.producto_id = p.id
where p.fecha_proxima_dosis is not null and a.anulada_en is null;

commit;
