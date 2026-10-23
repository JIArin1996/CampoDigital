-- Campo Digital v2 — Tareas en la Bitácora, próximas dosis y calendario (Etapa 8)
--
-- Diseño: contexto/DISENO-BASE-ETAPA-8.md, aprobado el 2026-10-23 (C1 a C6).
--
--   1. bitacora_entradas: tipo 'tarea', con vencimiento (obligatorio), estado (pendiente, hecha o
--      cancelada), quién y cuándo la marcó hecha, "repetir cada N días" (opcional), la nota de la que
--      salió (entrada_origen_id) y, en las repetidas, la tarea anterior (tarea_anterior_id).
--   2. _validar_entrada_bitacora acepta 'tarea'; _validar_datos_tarea (nueva, interna) valida lo propio.
--   3. crear_entrada_bitacora y editar_entrada_bitacora: cambian de firma (suman vencimiento, repetición
--      y, al crear, la nota de origen). Se borran y se vuelven a crear con los mismos permisos.
--   4. cambiar_estado_tarea: pendiente, hecha o cancelada; cualquier operador (queda quién y cuándo).
--      Al marcar hecha una tarea que se repite, crea la siguiente: vence el más tardío entre hoy y su
--      vencimiento, más N días (atrasada: hoy + N, no nace vencida; adelantada: conserva el ritmo).
--      Cancelar termina la repetición. Reabrir una que ya generó la siguiente exige anular esa antes.
--   5. sanidad_dosis_dadas + marcar_dosis_dada: marca (y desmarca) una próxima dosis como dada.
--   6. v_calendario: tareas (no anuladas) y próximas dosis de sanidades no anuladas, con su estado.
--
-- Auditoría: 78 funciones (+3: _validar_datos_tarea, cambiar_estado_tarea, marcar_dosis_dada).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. bitacora_entradas: tareas
-- ════════════════════════════════════════════════════════════════════════════
-- El check del tipo se creó sin nombre: se busca por su definición.

do $$
declare
  v_nombres text[];
begin
  select array_agg(conname) into v_nombres from pg_constraint
  where conrelid = 'public.bitacora_entradas'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%compra_venta_gasto%';
  if coalesce(array_length(v_nombres, 1), 0) <> 1 then
    raise exception 'Se esperaba un solo check de tipo en bitacora_entradas y hay %', coalesce(array_length(v_nombres, 1), 0);
  end if;
  execute format('alter table public.bitacora_entradas drop constraint %I', v_nombres[1]);
end $$;

alter table public.bitacora_entradas
  add constraint bitacora_entradas_tipo_check
    check (tipo in ('decision', 'idea', 'observacion', 'compra_venta_gasto', 'tarea')),
  add column vencimiento       date,
  add column estado_tarea      text check (estado_tarea in ('pendiente', 'hecha', 'cancelada')),
  add column completada_en     timestamptz,
  add column completada_por    uuid,   -- auditoría, sin FK
  add column repetir_cada_dias int check (repetir_cada_dias between 1 and 366),
  add column entrada_origen_id uuid,
  add column tarea_anterior_id uuid,
  -- toda tarea tiene vencimiento y estado, y nada que no sea tarea los tiene
  add constraint bitacora_tarea_vencimiento check ((tipo = 'tarea') = (vencimiento is not null)),
  add constraint bitacora_tarea_estado      check ((tipo = 'tarea') = (estado_tarea is not null)),
  add constraint bitacora_tarea_repetir     check (repetir_cada_dias is null or tipo = 'tarea'),
  add constraint bitacora_tarea_origen      check ((entrada_origen_id is null and tarea_anterior_id is null) or tipo = 'tarea'),
  -- hecha = con quién y cuándo; sin hecha, sin esos datos
  add constraint bitacora_tarea_hecha       check ((estado_tarea = 'hecha') = (completada_en is not null)
                                                   and (completada_en is null) = (completada_por is null)),
  add constraint bitacora_entradas_origen_fkey   foreign key (entrada_origen_id, establecimiento_id)
    references public.bitacora_entradas (id, establecimiento_id) on delete restrict,
  add constraint bitacora_entradas_anterior_fkey foreign key (tarea_anterior_id, establecimiento_id)
    references public.bitacora_entradas (id, establecimiento_id) on delete restrict;

create index bitacora_entradas_vencimiento_idx on public.bitacora_entradas (establecimiento_id, vencimiento)
  where tipo = 'tarea' and anulada_en is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Validaciones
-- ════════════════════════════════════════════════════════════════════════════

-- Misma firma: ahora acepta 'tarea'
create or replace function public._validar_entrada_bitacora(
  p_establecimiento_id uuid, p_fecha date, p_tipo text, p_texto text, p_persona_id uuid
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_tipo is null or p_tipo not in ('decision', 'idea', 'observacion', 'compra_venta_gasto', 'tarea') then
    raise exception 'Tipo inválido: decisión, idea, observación, compra/venta/gasto o tarea' using errcode = '22023';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'La entrada necesita un texto' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_persona_id is not null and not exists (
    select 1 from public.personas p where p.id = p_persona_id and p.establecimiento_id = p_establecimiento_id
  ) then
    raise exception 'El responsable no es de este establecimiento' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public._validar_entrada_bitacora(uuid, date, text, text, uuid) from public, anon, authenticated;

-- Vencimiento y repetición: solo en tareas; el vencimiento es obligatorio en ellas
create function public._validar_datos_tarea(p_tipo text, p_vencimiento date, p_repetir_cada_dias int) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_tipo = 'tarea' and p_vencimiento is null then
    raise exception 'La tarea necesita un vencimiento (para "algún día" está la idea)' using errcode = '22023';
  end if;
  if p_tipo <> 'tarea' and (p_vencimiento is not null or p_repetir_cada_dias is not null) then
    raise exception 'Solo las tareas llevan vencimiento y repetición' using errcode = '22023';
  end if;
  if p_repetir_cada_dias is not null and (p_repetir_cada_dias < 1 or p_repetir_cada_dias > 366) then
    raise exception 'La repetición va de 1 a 366 días' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public._validar_datos_tarea(text, date, int) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Crear y editar (cambian de firma)
-- ════════════════════════════════════════════════════════════════════════════

drop function public.crear_entrada_bitacora(uuid, date, text, text, uuid[], uuid);
drop function public.editar_entrada_bitacora(uuid, date, text, text, uuid[], uuid);

create function public.crear_entrada_bitacora(
  p_establecimiento_id uuid,
  p_fecha              date,
  p_tipo               text,
  p_texto              text,
  p_lotes              uuid[] default null,
  p_persona_id         uuid   default null,
  p_vencimiento        date   default null,   -- tareas: obligatorio
  p_repetir_cada_dias  int    default null,   -- tareas: opcional
  p_entrada_origen_id  uuid   default null    -- tareas: la nota (no tarea) de la que salió
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
  perform public._validar_entrada_bitacora(p_establecimiento_id, v_fecha, p_tipo, p_texto, p_persona_id);
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
      raise exception 'La nota de origen no existe, está anulada o es otra tarea' using errcode = '22023';
    end if;
  end if;

  insert into public.bitacora_entradas (
    establecimiento_id, fecha, tipo, texto, estado_idea, persona_id,
    vencimiento, estado_tarea, repetir_cada_dias, entrada_origen_id
  ) values (
    p_establecimiento_id, v_fecha, p_tipo, btrim(p_texto),
    case when p_tipo = 'idea' then 'abierta' end,
    p_persona_id,
    p_vencimiento, case when p_tipo = 'tarea' then 'pendiente' end, p_repetir_cada_dias, p_entrada_origen_id
  )
  returning id into v_id;

  perform public._guardar_lotes_bitacora(v_id, p_establecimiento_id, p_lotes);
  return v_id;
end;
$$;

-- Edita el contenido y reemplaza los lotes. Cuenta como edición (editada_en/editada_por).
-- Sigue siendo tarea: conserva su estado; pasa a ser tarea: arranca pendiente; deja de serlo: pierde
-- vencimiento, estado, repetición y vínculos.
create function public.editar_entrada_bitacora(
  p_entrada_id        uuid,
  p_fecha             date,
  p_tipo              text,
  p_texto             text,
  p_lotes             uuid[] default null,
  p_persona_id        uuid   default null,
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
    raise exception 'La entrada está anulada: restaurala antes de editarla' using errcode = '22023';
  end if;
  perform public._validar_entrada_bitacora(v.establecimiento_id, p_fecha, p_tipo, p_texto, p_persona_id);
  perform public._validar_datos_tarea(p_tipo, p_vencimiento, p_repetir_cada_dias);

  update public.bitacora_entradas
  set fecha             = p_fecha,
      tipo              = p_tipo,
      texto             = btrim(p_texto),
      persona_id        = p_persona_id,
      estado_idea       = case when p_tipo = 'idea' then coalesce(v.estado_idea, 'abierta') end,
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
end;
$$;

revoke execute on function public.crear_entrada_bitacora(uuid, date, text, text, uuid[], uuid, date, int, uuid) from public, anon;
revoke execute on function public.editar_entrada_bitacora(uuid, date, text, text, uuid[], uuid, date, int)      from public, anon;
grant  execute on function public.crear_entrada_bitacora(uuid, date, text, text, uuid[], uuid, date, int, uuid) to authenticated;
grant  execute on function public.editar_entrada_bitacora(uuid, date, text, text, uuid[], uuid, date, int)      to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Estado de una tarea (y la siguiente de una repetida)
-- ════════════════════════════════════════════════════════════════════════════
-- Devuelve el id de la tarea siguiente si se creó una; si no, null. No cuenta como edición.

create function public.cambiar_estado_tarea(p_entrada_id uuid, p_estado text) returns uuid
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
    raise exception 'La tarea está anulada: restaurala antes de cambiarla' using errcode = '22023';
  end if;
  if v.tipo <> 'tarea' then
    raise exception 'Solo las tareas tienen este estado' using errcode = '22023';
  end if;
  if p_estado is null or p_estado not in ('pendiente', 'hecha', 'cancelada') then
    raise exception 'Estado inválido: pendiente, hecha o cancelada' using errcode = '22023';
  end if;
  if p_estado = v.estado_tarea then
    raise exception 'La tarea ya está %', p_estado using errcode = '22023';
  end if;

  -- Reabrir una que ya generó la siguiente dejaría dos pendientes: primero se anula la siguiente
  if p_estado = 'pendiente' then
    select s.vencimiento into v_vence from public.bitacora_entradas s
    where s.tarea_anterior_id = v.id and s.anulada_en is null
    limit 1;
    if found then
      raise exception 'Esta tarea ya generó la siguiente (vence el %): anulá esa antes de reabrir', to_char(v_vence, 'DD/MM/YYYY')
        using errcode = '22023';
    end if;
  end if;

  update public.bitacora_entradas
  set estado_tarea   = p_estado,
      completada_en  = case when p_estado = 'hecha' then now() end,
      completada_por = case when p_estado = 'hecha' then auth.uid() end
  where id = v.id;

  -- Repetida y hecha: la siguiente vence el más tardío entre hoy y su vencimiento, más N días
  if p_estado = 'hecha' and v.repetir_cada_dias is not null
     and not exists (select 1 from public.bitacora_entradas s where s.tarea_anterior_id = v.id and s.anulada_en is null) then
    insert into public.bitacora_entradas (
      establecimiento_id, fecha, tipo, texto, persona_id,
      vencimiento, estado_tarea, repetir_cada_dias, entrada_origen_id, tarea_anterior_id
    ) values (
      v.establecimiento_id, public.fecha_hoy(), 'tarea', v.texto, v.persona_id,
      greatest(public.fecha_hoy(), v.vencimiento) + v.repetir_cada_dias, 'pendiente', v.repetir_cada_dias,
      v.entrada_origen_id, v.id
    )
    returning id into v_siguiente;

    insert into public.bitacora_lotes (establecimiento_id, entrada_id, lote_id)
    select bl.establecimiento_id, v_siguiente, bl.lote_id from public.bitacora_lotes bl where bl.entrada_id = v.id;
  end if;

  return v_siguiente;
end;
$$;

revoke execute on function public.cambiar_estado_tarea(uuid, text) from public, anon;
grant  execute on function public.cambiar_estado_tarea(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Próximas dosis dadas
-- ════════════════════════════════════════════════════════════════════════════
-- Una fila por producto de sanidad marcado como dado. Desmarcar no borra: deja la marca deshecha.

create table public.sanidad_dosis_dadas (
  actividad_id       uuid not null,
  orden              int  not null,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  dada_en            timestamptz not null default now(),
  dada_por           uuid default auth.uid(),   -- auditoría, sin FK
  deshecha_en        timestamptz,
  deshecha_por       uuid,
  primary key (actividad_id, orden),
  foreign key (actividad_id, orden) references public.act_sanidad_productos (actividad_id, orden) on delete restrict,
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict,
  check ((deshecha_en is null) = (deshecha_por is null))
);

create trigger sin_borrado before delete on public.sanidad_dosis_dadas
  for each row execute function public.bloquear_borrado();
create trigger sin_truncate before truncate on public.sanidad_dosis_dadas
  for each statement execute function public.bloquear_borrado();

alter table public.sanidad_dosis_dadas enable row level security;
create policy sanidad_dosis_dadas_select on public.sanidad_dosis_dadas
  for select to authenticated using (public.es_miembro(establecimiento_id));
revoke all on public.sanidad_dosis_dadas from anon, authenticated;
grant select on public.sanidad_dosis_dadas to authenticated;

-- Marca (p_dada = true) o desmarca (false) la próxima dosis de un producto de una sanidad no anulada
create function public.marcar_dosis_dada(p_actividad_id uuid, p_orden int, p_dada boolean default true) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.actividades;
  v_fecha date;
begin
  select * into v_act from public.actividades where id = p_actividad_id for update;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Sanidad inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_act.tipo <> 'sanidad' then
    raise exception 'Solo las sanidades tienen próximas dosis' using errcode = '22023';
  end if;
  if v_act.anulada_en is not null then
    raise exception 'La sanidad está anulada' using errcode = '22023';
  end if;
  select p.fecha_proxima_dosis into v_fecha from public.act_sanidad_productos p
  where p.actividad_id = p_actividad_id and p.orden = p_orden;
  if v_fecha is null then
    raise exception 'Ese producto no tiene próxima dosis' using errcode = '22023';
  end if;

  if coalesce(p_dada, true) then
    insert into public.sanidad_dosis_dadas (actividad_id, orden, establecimiento_id)
    values (p_actividad_id, p_orden, v_act.establecimiento_id)
    on conflict (actividad_id, orden) do update
      set dada_en = now(), dada_por = auth.uid(), deshecha_en = null, deshecha_por = null;
  else
    update public.sanidad_dosis_dadas
    set deshecha_en = now(), deshecha_por = auth.uid()
    where actividad_id = p_actividad_id and orden = p_orden and deshecha_en is null;
  end if;
end;
$$;

revoke execute on function public.marcar_dosis_dada(uuid, int, boolean) from public, anon;
grant  execute on function public.marcar_dosis_dada(uuid, int, boolean) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Calendario: tareas y próximas dosis
-- ════════════════════════════════════════════════════════════════════════════
-- Las tareas no anuladas (todas sus ocurrencias reales: la siguiente de una repetida existe recién
-- cuando se marca hecha la anterior, así que no se proyectan futuras) y las próximas dosis de las
-- sanidades no anuladas. Las dosis no tienen responsable.

create view public.v_calendario
with (security_invoker = true) as
select e.establecimiento_id, 'tarea'::text as origen, e.id as entrada_id, null::uuid as actividad_id, null::int as orden,
       e.vencimiento as fecha, e.texto, e.persona_id, e.estado_tarea as estado, e.repetir_cada_dias,
       coalesce((select array_agg(bl.lote_id order by bl.lote_id) from public.bitacora_lotes bl where bl.entrada_id = e.id), '{}'::uuid[]) as lotes,
       e.completada_en as hecha_en
from public.bitacora_entradas e
where e.tipo = 'tarea' and e.anulada_en is null
union all
select a.establecimiento_id, 'dosis', null, p.actividad_id, p.orden,
       p.fecha_proxima_dosis, 'Próxima dosis: ' || p.producto, null::uuid,
       case when dd.actividad_id is not null and dd.deshecha_en is null then 'hecha' else 'pendiente' end,
       null::int,
       coalesce((select array_agg(al.lote_id order by al.lote_id) from public.actividad_lotes al
                 where al.actividad_id = a.id and al.rol = 'principal'), '{}'::uuid[]),
       case when dd.deshecha_en is null then dd.dada_en end
from public.act_sanidad_productos p
join public.actividades a on a.id = p.actividad_id
left join public.sanidad_dosis_dadas dd on dd.actividad_id = p.actividad_id and dd.orden = p.orden
where p.fecha_proxima_dosis is not null and a.anulada_en is null;

revoke all    on public.v_calendario from anon, authenticated;
grant  select on public.v_calendario to authenticated;

commit;
