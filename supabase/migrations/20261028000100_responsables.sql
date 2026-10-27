-- Campo Digital v2 — Responsables: personas que no son usuarios, administradores y varios por registro
--
-- Diseño aprobado: contexto/DISENO-RESPONSABLES.md (R1 a R8).
--   1. personas: nombre hasta 80 caracteres, rol hasta 60, y sin dos activas con el mismo nombre en un
--      establecimiento (sin importar mayúsculas ni espacios de más). Las carga solo el administrador, como hasta
--      ahora (políticas y permisos de columna sin cambio).
--   2. bitacora_responsables y actividad_responsables: los responsables de cada nota o tarea y de cada actividad.
--      Se escriben solo desde las funciones. Las de actividades no cambian nunca (las actividades no se editan).
--   3. Los responsables que había (persona_id) pasan a las tablas nuevas, y la columna persona_id de
--      bitacora_entradas y de actividades se borra: un solo lugar para el dato.
--   4. Las funciones de carga cambian p_persona_id uuid por p_responsables uuid[] (mismo lugar, null o vacío =
--      sin responsables): crear_entrada_bitacora, editar_entrada_bitacora y las 11 registrar_* de actividades.
--      _validar_responsables: hasta 10, del establecimiento y activos (al editar, los que ya tenía se pueden dejar);
--      los repetidos se ignoran. Reemplaza a _exigir_persona y a la validación de _validar_entrada_bitacora.
--   5. cambiar_estado_tarea: la tarea repetida copia todos los responsables. proteger_actividad: sin la columna.
--   6. v_actividades y v_calendario: responsables uuid[] (ordenados por id) en lugar de persona_id.
--   7. Administradores: _fichas_de_admins les crea (o reactiva) la ficha en cada establecimiento. Se llama ahora
--      para los actuales, al crear un establecimiento y al dar el rol (definir_admin). Al sacar el rol, la ficha
--      queda inactiva donde no tiene membresía.
--
-- Auditoría: 103 funciones (+4 nuevas: _validar_responsables, _guardar_responsables_entrada,
-- _guardar_responsables_actividad y _fichas_de_admins; −1: _exigir_persona; las demás cambian de firma pero
-- siguen siendo una cada una) y 25 filas de permisos (sin cambio: las tablas nuevas son de solo lectura).
--
-- Antes de aplicarla, esta consulta tiene que devolver 0 filas (nombres repetidos entre personas activas, o
-- demasiado largos); si devuelve alguna, se corrige el nombre a mano y después se aplica:
--
--   select establecimiento_id, lower(btrim(nombre)) as nombre, count(*) from public.personas where activo
--   group by 1, 2 having count(*) > 1
--   union all
--   select establecimiento_id, nombre, 1 from public.personas where char_length(nombre) > 80 or char_length(rol) > 60;

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Personas: largo del nombre y del rol, sin nombres repetidos entre las activas
-- ════════════════════════════════════════════════════════════════════════════

alter table public.personas
  add constraint personas_nombre_largo check (char_length(nombre) <= 80),
  add constraint personas_rol_largo    check (rol is null or char_length(rol) <= 60);

create unique index personas_nombre_activo_unico on public.personas (establecimiento_id, lower(btrim(nombre))) where activo;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Responsables de cada nota o tarea y de cada actividad
-- ════════════════════════════════════════════════════════════════════════════
-- Como bitacora_lotes y actividad_lotes: la persona tiene que ser del mismo establecimiento que el registro.

create table public.bitacora_responsables (
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  entrada_id         uuid not null,
  persona_id         uuid not null,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  primary key (entrada_id, persona_id),
  foreign key (entrada_id, establecimiento_id)
    references public.bitacora_entradas (id, establecimiento_id) on delete restrict,
  foreign key (persona_id, establecimiento_id)
    references public.personas (id, establecimiento_id) on delete restrict
);
create index bitacora_responsables_persona_idx on public.bitacora_responsables (persona_id);

create table public.actividad_responsables (
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  actividad_id       uuid not null,
  persona_id         uuid not null,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  primary key (actividad_id, persona_id),
  foreign key (actividad_id, establecimiento_id)
    references public.actividades (id, establecimiento_id) on delete restrict,
  foreign key (persona_id, establecimiento_id)
    references public.personas (id, establecimiento_id) on delete restrict
);
create index actividad_responsables_persona_idx on public.actividad_responsables (persona_id);

-- Las actividades no se editan: sus responsables tampoco
create trigger inmutable before update or delete on public.actividad_responsables for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.actividad_responsables for each statement execute function public.bloquear_modificacion();

alter table public.bitacora_responsables  enable row level security;
alter table public.actividad_responsables enable row level security;

create policy bitacora_responsables_select on public.bitacora_responsables
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy actividad_responsables_select on public.actividad_responsables
  for select to authenticated using (public.es_miembro(establecimiento_id));

grant select on public.bitacora_responsables, public.actividad_responsables to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Los responsables que había pasan a las tablas nuevas
-- ════════════════════════════════════════════════════════════════════════════

insert into public.bitacora_responsables (establecimiento_id, entrada_id, persona_id, created_by, created_at)
select e.establecimiento_id, e.id, e.persona_id, e.created_by, e.created_at
from public.bitacora_entradas e
where e.persona_id is not null;

insert into public.actividad_responsables (establecimiento_id, actividad_id, persona_id, created_by, created_at)
select a.establecimiento_id, a.id, a.persona_id, a.created_by, a.created_at
from public.actividades a
where a.persona_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Lo viejo afuera: vistas y funciones que usan persona_id, y la columna
-- ════════════════════════════════════════════════════════════════════════════
-- Las funciones cambian de firma: se borran y se crean de nuevo más abajo (una versión cada una).

drop view public.v_actividades;
drop view public.v_calendario;

drop function public.crear_entrada_bitacora;
drop function public.editar_entrada_bitacora;
drop function public._validar_entrada_bitacora;
drop function public.registrar_compra;
drop function public.registrar_destete;
drop function public.registrar_diagnostico;
drop function public.registrar_esquila;
drop function public.registrar_mortandad;
drop function public.registrar_paricion;
drop function public.registrar_personalizada;
drop function public.registrar_pesada;
drop function public.registrar_sanidad;
drop function public.registrar_servicio;
drop function public.registrar_venta;
drop function public._exigir_persona;

alter table public.bitacora_entradas drop column persona_id;
alter table public.actividades       drop column persona_id;

-- Valida una lista de responsables: hasta 10 distintos, sin vacíos, todos del establecimiento y activos. Los que
-- el registro ya tenía (p_actuales, al editar) se pueden dejar aunque estén inactivos. Null o vacía: sin responsables.
create function public._validar_responsables(
  p_responsables uuid[], p_establecimiento_id uuid, p_actuales uuid[] default '{}'
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_responsables is null then
    return;
  end if;
  if array_position(p_responsables, null) is not null then
    raise exception 'Hay un responsable vacío' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_responsables) x) > 10 then
    raise exception 'Hasta 10 responsables' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_responsables) x
    where not exists (select 1 from public.personas p where p.id = x and p.establecimiento_id = p_establecimiento_id)
  ) then
    raise exception 'El responsable no es de este establecimiento' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_responsables) x join public.personas p on p.id = x
    where not p.activo and not (x = any (coalesce(p_actuales, '{}'::uuid[])))
  ) then
    raise exception 'Hay un responsable inactivo: reactivalo en Configuraciones > Personas o sacalo' using errcode = '22023';
  end if;
end;
$$;

-- Reemplaza los responsables de una nota o tarea (ya validados), como _guardar_lotes_bitacora con los lotes
create function public._guardar_responsables_entrada(p_entrada_id uuid, p_establecimiento_id uuid, p_responsables uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.bitacora_responsables where entrada_id = p_entrada_id;

  insert into public.bitacora_responsables (establecimiento_id, entrada_id, persona_id)
  select distinct p_establecimiento_id, p_entrada_id, x from unnest(coalesce(p_responsables, '{}'::uuid[])) x;
end;
$$;

-- Los responsables de una actividad recién cargada (ya validados). Se cargan una sola vez: no se editan.
create function public._guardar_responsables_actividad(p_actividad_id uuid, p_responsables uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.actividad_responsables (establecimiento_id, actividad_id, persona_id)
  select distinct a.establecimiento_id, a.id, x
  from public.actividades a, unnest(coalesce(p_responsables, '{}'::uuid[])) x
  where a.id = p_actividad_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Bitácora: notas y tareas con varios responsables
-- ════════════════════════════════════════════════════════════════════════════
create function public._validar_entrada_bitacora(
  p_establecimiento_id uuid, p_fecha date, p_tipo text, p_texto text
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
end;
$$;

create function public.crear_entrada_bitacora(
  p_establecimiento_id uuid,
  p_fecha              date,
  p_tipo               text,
  p_texto              text,
  p_lotes              uuid[] default null,
  p_responsables       uuid[] default null,
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
      raise exception 'La nota de origen no existe, está anulada o es otra tarea' using errcode = '22023';
    end if;
  end if;

  insert into public.bitacora_entradas (
    establecimiento_id, fecha, tipo, texto, estado_idea,
    vencimiento, estado_tarea, repetir_cada_dias, entrada_origen_id
  ) values (
    p_establecimiento_id, v_fecha, p_tipo, btrim(p_texto),
    case when p_tipo = 'idea' then 'abierta' end,
    p_vencimiento, case when p_tipo = 'tarea' then 'pendiente' end, p_repetir_cada_dias, p_entrada_origen_id
  )
  returning id into v_id;

  perform public._guardar_lotes_bitacora(v_id, p_establecimiento_id, p_lotes);
  perform public._guardar_responsables_entrada(v_id, p_establecimiento_id, p_responsables);
  return v_id;
end;
$$;

create function public.editar_entrada_bitacora(
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
    raise exception 'La entrada está anulada: restaurala antes de editarla' using errcode = '22023';
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

-- Al repetir una tarea, la siguiente copia los responsables
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

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Actividades: las 11 funciones de carga, con p_responsables en lugar de p_persona_id
-- ════════════════════════════════════════════════════════════════════════════
-- Cada una igual a su última versión; solo cambian el parámetro, la validación, el insert y los responsables.

create function public.registrar_compra(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_lineas             jsonb,                  -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
  p_modalidad          text,                   -- productor, remate, frigorifico, otra
  p_lote_id            uuid  default null,     -- destino existente...
  p_lote_nuevo         jsonb default null,     -- ...o nuevo: {"nombre", "especie_id", "potrero_id", "anios_nacimiento"?}
  p_contraparte        text  default null,
  p_kg_gancho          numeric default null,
  p_precio             jsonb default null,     -- ver _registrar_movimiento; sin precio no hay movimiento
  p_responsables       uuid[] default null,
  p_notas              text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote    public.lotes;
  v_especie uuid;
  v_nuevo   uuid;
  v_total   int;
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'compra') then
    return p_id;
  end if;

  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  if (p_lote_id is null) = (p_lote_nuevo is null) then
    raise exception 'Indicá el lote destino: uno existente o uno nuevo' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_kg_gancho is not null and round(p_kg_gancho, 2) <= 0 then
    raise exception 'Los kg al gancho tienen que ser mayores a cero (hasta dos decimales)' using errcode = '22023';
  end if;
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

  if p_lote_id is not null then
    v_lote := public._bloquear_lote_editable(p_lote_id);
    if v_lote.establecimiento_id <> p_establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote está cerrado' using errcode = '22023';
    end if;
    perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  else
    v_especie := nullif(p_lote_nuevo ->> 'especie_id', '')::uuid;
    if btrim(coalesce(p_lote_nuevo ->> 'nombre', '')) = '' then
      raise exception 'El lote nuevo necesita un nombre' using errcode = '22023';
    end if;
    if not exists (select 1 from public.especies s where s.id = v_especie and s.establecimiento_id = p_establecimiento_id and s.activo) then
      raise exception 'Especie inexistente o inactiva en este establecimiento' using errcode = '22023';
    end if;
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id, anios_nacimiento)
    values (
      p_establecimiento_id, v_especie, btrim(p_lote_nuevo ->> 'nombre'),
      p_fecha,
      nullif(p_lote_nuevo ->> 'potrero_id', '')::uuid,
      coalesce(public._anios_de_jsonb(p_lote_nuevo -> 'anios_nacimiento'), '{}')   -- los que indique; sin inferir
    )
    returning id into v_nuevo;
    select * into v_lote from public.lotes where id = v_nuevo;
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, lote_creado_id, notas)
  values (p_id, p_establecimiento_id, 'compra', p_fecha, v_lote.id, v_nuevo, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.act_compraventa (actividad_id, establecimiento_id, modalidad, contraparte, kg_gancho)
  values (p_id, p_establecimiento_id, p_modalidad, nullif(btrim(coalesce(p_contraparte, '')), ''), round(p_kg_gancho, 2));

  perform public._insertar_lineas(p_id, p_establecimiento_id, v_lote.especie_id, p_lineas, 'opcional');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select p_establecimiento_id, v_lote.id, v_lote.especie_id, l.categoria_id, l.cabezas, p_fecha, 'compra', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  if p_precio is not null then
    select sum(l.cabezas) into v_total from public.actividad_lineas l where l.actividad_id = p_id;
    perform public._registrar_movimiento(
      p_establecimiento_id, p_id, v_lote.id, v_lote.especie_id, p_fecha, 'egreso',
      'Compra de ' || v_total || ' cabezas (' || v_lote.nombre || ')', p_contraparte, p_precio);
  end if;

  return p_id;
end;
$$;

create function public.registrar_destete(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_origenes           jsonb,
  p_destinos           jsonb,
  p_responsables       uuid[] default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_especie  uuid;
  v_lote     public.lotes;
  v_item     jsonb;
  v_linea    jsonb;
  v_id       uuid;
  v_origenes uuid[] := '{}';
  v_destinos uuid[] := '{}';
  v_cats     uuid[];
  v_cat      uuid;
  v_cab      int;
  v_cria     boolean;
  v_sexo     text;
  v_nombre   text;
  v_destino  uuid;
  v_op       uuid;
  v_sale     int;
  v_entra    int;
  r          record;
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'destete') then
    return p_id;
  end if;

  if p_establecimiento_id is null or not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de edición en este establecimiento' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_origenes is null or jsonb_typeof(p_origenes) <> 'array' or jsonb_array_length(p_origenes) = 0 then
    raise exception 'Indicá al menos un lote de origen' using errcode = '22023';
  end if;
  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Indicá al menos un lote de destino' using errcode = '22023';
  end if;
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

  -- 1. Orígenes: sin repetir; se bloquean ordenados por id (evita bloqueos cruzados)
  for v_item in select e from jsonb_array_elements(p_origenes) e loop
    v_id := nullif(case when jsonb_typeof(v_item) = 'object' then v_item ->> 'lote_id' end, '')::uuid;
    if v_id is null then
      raise exception 'Falta el lote de un origen' using errcode = '22023';
    end if;
    if v_id = any(v_origenes) then
      raise exception 'Hay lotes de origen repetidos' using errcode = '22023';
    end if;
    v_origenes := v_origenes || v_id;
  end loop;

  foreach v_id in array (select array_agg(x order by x) from unnest(v_origenes) x) loop
    v_lote := public._bloquear_lote_editable(v_id);
    if v_lote.establecimiento_id <> p_establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote % está cerrado', v_lote.nombre using errcode = '22023';
    end if;
    if v_especie is null then
      v_especie := v_lote.especie_id;
    elsif v_especie <> v_lote.especie_id then
      raise exception 'Los lotes de origen tienen que ser de la misma especie' using errcode = '22023';
    end if;
    perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  end loop;

  -- 2. La actividad (sin lote principal: los lotes van en actividad_lotes)
  insert into public.actividades (id, establecimiento_id, tipo, fecha, notas)
  values (p_id, p_establecimiento_id, 'destete', p_fecha, nullif(btrim(coalesce(p_notas, '')), ''));
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'origen' from unnest(v_origenes) x;

  -- 3. Lo que sale de cada origen: solo categorías de cría al pie
  for v_item in select e from jsonb_array_elements(p_origenes) e loop
    v_id := (v_item ->> 'lote_id')::uuid;
    if jsonb_typeof(v_item -> 'lineas') is distinct from 'array' or jsonb_array_length(v_item -> 'lineas') = 0 then
      raise exception 'Cada lote de origen necesita al menos una categoría con cabezas' using errcode = '22023';
    end if;
    v_cats := '{}';
    for v_linea in select e from jsonb_array_elements(v_item -> 'lineas') e loop
      v_cat := nullif(v_linea ->> 'categoria_id', '')::uuid;
      perform public._exigir_categoria(v_cat, v_especie);
      select c.cria_al_pie into v_cria from public.categorias_animales c where c.id = v_cat;
      if not v_cria then
        raise exception 'Solo se destetan categorías de cría al pie' using errcode = '22023';
      end if;
      if v_cat = any(v_cats) then
        raise exception 'Hay categorías repetidas en un lote de origen' using errcode = '22023';
      end if;
      v_cats := v_cats || v_cat;
      v_cab := public._cabezas(v_linea -> 'cabezas');
      insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
      values (p_establecimiento_id, v_id, v_especie, v_cat, -v_cab, p_fecha, 'destete', p_id);
    end loop;
  end loop;

  -- 4. Destinos: lotes nuevos, solo con crías sexadas
  for v_item in select e from jsonb_array_elements(p_destinos) e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada lote de destino tiene que ser un objeto con nombre y categorías' using errcode = '22023';
    end if;
    v_nombre := btrim(coalesce(v_item ->> 'nombre', ''));
    if v_nombre = '' then
      raise exception 'Cada lote de destino necesita un nombre' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'lineas') is distinct from 'array' or jsonb_array_length(v_item -> 'lineas') = 0 then
      raise exception 'El lote % necesita al menos una categoría con cabezas', v_nombre using errcode = '22023';
    end if;

    -- Los años los valida el trigger validar_anios_nacimiento
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id, anios_nacimiento)
    values (p_establecimiento_id, v_especie, v_nombre, p_fecha, nullif(v_item ->> 'potrero_id', '')::uuid,
            coalesce(public._anios_de_jsonb(v_item -> 'anios_nacimiento'), '{}'))
    returning id into v_destino;
    v_destinos := v_destinos || v_destino;

    insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
    values (p_id, v_destino, p_establecimiento_id, 'destino');

    v_cats := '{}';
    for v_linea in select e from jsonb_array_elements(v_item -> 'lineas') e loop
      v_cat := nullif(v_linea ->> 'categoria_id', '')::uuid;
      perform public._exigir_categoria(v_cat, v_especie);
      select c.cria_al_pie, c.sexo into v_cria, v_sexo from public.categorias_animales c where c.id = v_cat;
      if not v_cria then
        raise exception 'Solo se destetan categorías de cría al pie' using errcode = '22023';
      end if;
      if v_sexo is null then
        raise exception 'Las crías sin sexar se separan en machos y hembras: ningún lote de destino puede recibirlas'
          using errcode = '22023';
      end if;
      if v_cat = any(v_cats) then
        raise exception 'Hay categorías repetidas en el lote %', v_nombre using errcode = '22023';
      end if;
      v_cats := v_cats || v_cat;
      v_cab := public._cabezas(v_linea -> 'cabezas');
      insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
      values (p_establecimiento_id, v_destino, v_especie, v_cat, v_cab, p_fecha, 'destete', p_id);
    end loop;
  end loop;

  -- 5. Balance: en cabezas totales, lo que sale es lo que entra...
  select coalesce(-sum(e.cabezas) filter (where e.cabezas < 0), 0), coalesce(sum(e.cabezas) filter (where e.cabezas > 0), 0)
  into v_sale, v_entra
  from public.lote_eventos e where e.actividad_id = p_id;
  if v_sale <> v_entra then
    raise exception 'Salen % cabezas de los orígenes y entran % a los destinos: tienen que ser las mismas', v_sale, v_entra
      using errcode = '22023';
  end if;

  -- ...y en cada categoría con sexo, lo que entra no es menos que lo que sale (la diferencia sale de
  -- las sin sexar: el sexo solo se asigna a ellas)
  for r in
    select c.nombre, -sum(e.cabezas) filter (where e.cabezas < 0) as sale, sum(e.cabezas) filter (where e.cabezas > 0) as entra
    from public.lote_eventos e
    join public.categorias_animales c on c.id = e.categoria_id
    where e.actividad_id = p_id and c.sexo is not null
    group by c.nombre
    having sum(e.cabezas) < 0
  loop
    raise exception 'Salen % % y entran %: una cría ya sexada no cambia de sexo', r.sale, r.nombre, coalesce(r.entra, 0)
      using errcode = '22023';
  end loop;

  -- 6. Total por categoría (lo que entra a los destinos, ya con el sexo asignado)
  insert into public.actividad_lineas (actividad_id, establecimiento_id, categoria_id, cabezas)
  select p_id, p_establecimiento_id, e.categoria_id, sum(e.cabezas)
  from public.lote_eventos e
  where e.actividad_id = p_id and e.cabezas > 0
  group by e.categoria_id;

  -- 7. Linaje y carencia: una operación por cada par origen → destino que aportó. X aportó a Y si
  -- X saca una categoría que Y recibe, o crías sin sexar (que Y recibe ya sexadas). Sin eventos.
  for r in
    select distinct o.lote_id as origen, d.lote_id as destino
    from public.lote_eventos o
    join public.categorias_animales co on co.id = o.categoria_id
    join public.lote_eventos d on d.actividad_id = p_id and d.cabezas > 0
                              and (d.categoria_id = o.categoria_id or co.sexo is null)
    where o.actividad_id = p_id and o.cabezas < 0
    order by 1, 2
  loop
    insert into public.operaciones_lote (establecimiento_id, tipo, fecha, actividad_id)
    values (p_establecimiento_id, 'destete', p_fecha, p_id)
    returning id into v_op;
    insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
    values (p_establecimiento_id, v_op, r.origen, 'origen'),
           (p_establecimiento_id, v_op, r.destino, 'destino');
  end loop;

  -- 8. Archivos visibles de todos los orígenes a cada destino, por referencia y sin duplicar
  insert into public.lote_archivos (lote_id, archivo_id, establecimiento_id, heredado_de_lote_id)
  select distinct on (d.x, la.archivo_id) d.x, la.archivo_id, p_establecimiento_id, la.lote_id
  from unnest(v_destinos) d(x)
  join public.lote_archivos la on la.lote_id = any(v_origenes) and not la.oculto
  order by d.x, la.archivo_id, la.lote_id
  on conflict (lote_id, archivo_id) do nothing;

  -- 9. Saldo día por día en cada origen y categoría
  for r in select distinct e.lote_id, e.categoria_id from public.lote_eventos e where e.actividad_id = p_id and e.cabezas < 0 loop
    perform public._validar_saldo(r.lote_id, r.categoria_id);
  end loop;

  -- 10. El origen que queda vacío se cierra; para eso, el destete no puede ser anterior a su último movimiento
  foreach v_id in array v_origenes loop
    if not exists (
      select 1 from public.lote_eventos e where e.lote_id = v_id group by e.categoria_id having sum(e.cabezas) <> 0
    ) then
      if exists (select 1 from public.lote_eventos e where e.lote_id = v_id and e.fecha > p_fecha) then
        select l.nombre into v_nombre from public.lotes l where l.id = v_id;
        raise exception 'El lote % queda vacío: el destete no puede ser anterior a su último movimiento', v_nombre
          using errcode = '22023';
      end if;
      perform public._cerrar_si_vacio(v_id, p_fecha, 'Destetado');
    end if;
  end loop;

  return p_id;
end;
$$;

create function public.registrar_diagnostico(
  p_id                   uuid,
  p_lote_id              uuid,
  p_fecha                date,
  p_vacas_diagnosticadas int,
  p_vacas_prenadas       int,
  p_responsables         uuid[] default null,
  p_notas                text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'diagnostico_gestacion') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);

  if p_vacas_diagnosticadas is null or p_vacas_diagnosticadas <= 0 then
    raise exception 'Las vacas diagnosticadas tienen que ser más de cero' using errcode = '22023';
  end if;
  if p_vacas_prenadas is null or p_vacas_prenadas < 0 then
    raise exception 'Las vacas preñadas tienen que ser cero o más' using errcode = '22023';
  end if;
  if p_vacas_prenadas > p_vacas_diagnosticadas then
    raise exception 'Las preñadas no pueden ser más que las diagnosticadas' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'diagnostico_gestacion', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.act_diagnostico (actividad_id, establecimiento_id, vacas_diagnosticadas, vacas_prenadas)
  values (p_id, v_lote.establecimiento_id, p_vacas_diagnosticadas, p_vacas_prenadas);

  return p_id;
end;
$$;

create function public.registrar_esquila(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_kg_lana_total      numeric,
  p_responsables       uuid[] default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'esquila') then
    return p_id;
  end if;
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._bloquear_lotes_actividad(p_establecimiento_id, p_lotes, p_fecha);
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

  -- Ovino = especie del grupo 'ovino' (no depende del nombre)
  if exists (
    select 1 from unnest(p_lotes) x
    join public.lotes l on l.id = x
    join public.especies s on s.id = l.especie_id
    where s.grupo <> 'ovino'
  ) then
    raise exception 'La esquila es solo para lotes ovinos' using errcode = '22023';
  end if;
  -- Se valida ya redondeado a 1 decimal (lo que se guarda): 0,04 kg daría 0,0
  if p_kg_lana_total is null or round(p_kg_lana_total, 2) <= 0 then
    raise exception 'Los kg de lana tienen que ser más de cero (hasta dos decimales)' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, p_establecimiento_id, 'esquila', p_fecha, null, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  insert into public.act_esquila (actividad_id, establecimiento_id, kg_lana_total)
  values (p_id, p_establecimiento_id, round(p_kg_lana_total, 2));

  return p_id;
end;
$$;

create function public.registrar_mortandad(
  p_id            uuid,
  p_lote_id       uuid,
  p_fecha         date,
  p_lineas        jsonb,   -- [{"categoria_id", "cabezas"}]
  p_causa         text default 'Desconocida',
  p_observaciones text default null,
  p_responsables  uuid[] default null,
  p_notas         text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  public.lotes;
  v_causa text := coalesce(nullif(btrim(p_causa), ''), 'Desconocida');
  v_cat   uuid;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'mortandad') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);

  if not exists (select 1 from public.parametros p where p.clave = 'causas_mortandad' and p.valor = v_causa and p.activo) then
    raise exception 'Causa de mortandad inválida' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'mortandad', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.act_mortandad (actividad_id, establecimiento_id, causa, observaciones)
  values (p_id, v_lote.establecimiento_id, v_causa, nullif(btrim(coalesce(p_observaciones, '')), ''));

  perform public._insertar_lineas(p_id, v_lote.establecimiento_id, v_lote.especie_id, p_lineas, 'no');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select v_lote.establecimiento_id, v_lote.id, v_lote.especie_id, l.categoria_id, -l.cabezas, p_fecha, 'mortandad', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  for v_cat in select l.categoria_id from public.actividad_lineas l where l.actividad_id = p_id loop
    perform public._validar_saldo(v_lote.id, v_cat);
  end loop;

  return p_id;
end;
$$;

create function public.registrar_paricion(
  p_id               uuid,
  p_lote_madres_id   uuid,
  p_fecha            date,
  p_lineas           jsonb,                  -- crías vivas: [{"categoria_id", "cabezas"}], solo categorías de cría al pie
  p_nacidos_muertos  int   default 0,
  p_lote_cria_id     uuid  default null,     -- lote de cría existente (puede ser el de las madres: crías al pie)...
  p_lote_cria_nuevo  jsonb default null,     -- ...o nuevo: {"nombre", "potrero_id"}
  p_responsables     uuid[] default null,
  p_notas            text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_madres public.lotes;
  v_cria   public.lotes;
  v_nuevo  uuid;
  v_id     uuid;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_madres_id), 'paricion') then
    return p_id;
  end if;

  if p_lote_madres_id is null then
    raise exception 'Indicá el lote de las madres' using errcode = '22023';
  end if;
  if (p_lote_cria_id is null) = (p_lote_cria_nuevo is null) then
    raise exception 'Indicá el lote de cría: uno existente o uno nuevo' using errcode = '22023';
  end if;
  if coalesce(p_nacidos_muertos, 0) < 0 then   -- NULL cuenta como 0
    raise exception 'Los nacidos muertos tienen que ser cero o más' using errcode = '22023';
  end if;

  -- Bloqueo de los lotes ordenados por id (evita bloqueos cruzados). Con las crías al pie, el
  -- lote de cría es el mismo de las madres: se bloquea una sola vez.
  foreach v_id in array (select array_agg(distinct x order by x) from unnest(array[p_lote_madres_id, p_lote_cria_id]) x where x is not null) loop
    if v_id = p_lote_madres_id then
      v_madres := public._bloquear_lote_editable(v_id);
    else
      v_cria := public._bloquear_lote_editable(v_id);
    end if;
  end loop;
  if p_lote_cria_id = p_lote_madres_id then
    v_cria := v_madres;
  end if;

  if v_madres.estado <> 'activo' then
    raise exception 'El lote de madres está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_madres.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_madres.establecimiento_id);

  if p_lote_cria_id is not null then
    -- Lote de cría existente: activo, del mismo establecimiento y de la misma especie
    if v_cria.establecimiento_id <> v_madres.establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_cria.estado <> 'activo' then
      raise exception 'El lote de cría está cerrado' using errcode = '22023';
    end if;
    if v_cria.especie_id <> v_madres.especie_id then
      raise exception 'El lote de cría tiene que ser de la misma especie que el de las madres' using errcode = '22023';
    end if;
    if p_fecha < v_cria.fecha_apertura then
      raise exception 'La fecha no puede ser anterior a la apertura del lote de cría' using errcode = '22023';
    end if;
  else
    if btrim(coalesce(p_lote_cria_nuevo ->> 'nombre', '')) = '' then
      raise exception 'El lote de cría nuevo necesita un nombre' using errcode = '22023';
    end if;
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id)
    values (
      v_madres.establecimiento_id, v_madres.especie_id, btrim(p_lote_cria_nuevo ->> 'nombre'),
      p_fecha,
      nullif(p_lote_cria_nuevo ->> 'potrero_id', '')::uuid
    )
    returning id into v_nuevo;
    select * into v_cria from public.lotes where id = v_nuevo;
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, lote_creado_id, notas)
  values (p_id, v_madres.establecimiento_id, 'paricion', p_fecha, v_madres.id, v_nuevo, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.act_paricion (actividad_id, establecimiento_id, lote_cria_id, nacidos_muertos)
  values (p_id, v_madres.establecimiento_id, v_cria.id, coalesce(p_nacidos_muertos, 0));

  -- Las categorías de las crías tienen que ser de la especie (la del lote de madres y de cría)
  perform public._insertar_lineas(p_id, v_madres.establecimiento_id, v_madres.especie_id, p_lineas, 'no');

  -- ...y de cría al pie: la parición no suma vacas, toros ni otras categorías
  if exists (
    select 1 from public.actividad_lineas l
    join public.categorias_animales c on c.id = l.categoria_id
    where l.actividad_id = p_id and not c.cria_al_pie
  ) then
    raise exception 'En la parición solo van categorías de cría al pie (por ejemplo, Terneros/as)' using errcode = '22023';
  end if;

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select v_madres.establecimiento_id, v_cria.id, v_cria.especie_id, l.categoria_id, l.cabezas, p_fecha, 'paricion', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  return p_id;
end;
$$;

create function public.registrar_personalizada(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_nombre             text,
  p_campos             jsonb default null,   -- [{"campo", "valor"}]
  p_responsables       uuid[] default null,
  p_notas              text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campos jsonb := coalesce(p_campos, '[]'::jsonb);
  v_item   jsonb;
  v_campo  text;
  v_valor  text;
  v_norm   jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'personalizada') then
    return p_id;
  end if;
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._bloquear_lotes_actividad(p_establecimiento_id, p_lotes, p_fecha);
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'La actividad necesita un nombre' using errcode = '22023';
  end if;
  if jsonb_typeof(v_campos) <> 'array' then
    raise exception 'Los campos tienen que ser una lista' using errcode = '22023';
  end if;
  if jsonb_array_length(v_campos) > 20 then
    raise exception 'Hasta 20 campos por actividad' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(v_campos) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Campo mal formado' using errcode = '22023';
    end if;
    v_campo := btrim(coalesce(v_item ->> 'campo', ''));
    v_valor := btrim(coalesce(v_item ->> 'valor', ''));
    if v_campo = '' or v_valor = '' then
      raise exception 'Cada campo necesita nombre y valor' using errcode = '22023';
    end if;
    if lower(v_campo) = any(v_vistos) then
      raise exception 'El campo "%" está repetido', v_campo using errcode = '22023';
    end if;
    v_vistos := array_append(v_vistos, lower(v_campo));
    v_norm := v_norm || jsonb_build_array(jsonb_build_object('campo', v_campo, 'valor', v_valor));
  end loop;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, p_establecimiento_id, 'personalizada', p_fecha, null, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  insert into public.act_personalizada (actividad_id, establecimiento_id, nombre, campos)
  values (p_id, p_establecimiento_id, btrim(p_nombre), v_norm);

  return p_id;
end;
$$;

create function public.registrar_pesada(
  p_id         uuid,
  p_lote_id    uuid,
  p_fecha      date,
  p_lineas     jsonb,   -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"}]
  p_responsables uuid[] default null,
  p_notas      text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
  v_cat  uuid;
  v_cab  int;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'pesada') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'pesada', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  perform public._insertar_lineas(p_id, v_lote.establecimiento_id, v_lote.especie_id, p_lineas, 'obligatorio');

  -- No se pesan más cabezas de las que había en la categoría ese día
  for v_cat, v_cab in select l.categoria_id, l.cabezas from public.actividad_lineas l where l.actividad_id = p_id loop
    if v_cab > public._stock_categoria_al(v_lote.id, v_cat, p_fecha) then
      raise exception 'Se pesan más cabezas de las que había en la categoría ese día (%)',
        public._stock_categoria_al(v_lote.id, v_cat, p_fecha) using errcode = '23514';
    end if;
  end loop;

  return p_id;
end;
$$;

create function public.registrar_sanidad(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_productos          jsonb,   -- [{"producto", "categoria", "dosis"?, "via"?, "carencia_dias"?, "fecha_proxima_dosis"?}]
  p_responsables       uuid[] default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item      jsonb;
  v_orden     bigint;
  v_producto  text;
  v_categoria text;
  v_via       text;
  v_carencia  int;
  v_proxima   date;
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'sanidad') then
    return p_id;
  end if;
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._bloquear_lotes_actividad(p_establecimiento_id, p_lotes, p_fecha);
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

  if p_productos is null or jsonb_typeof(p_productos) <> 'array' or jsonb_array_length(p_productos) = 0 then
    raise exception 'Indicá al menos un producto' using errcode = '22023';
  end if;
  if jsonb_array_length(p_productos) > 20 then
    raise exception 'Hasta 20 productos por carga' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, p_establecimiento_id, 'sanidad', p_fecha, null, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  for v_item, v_orden in select e.valor, e.n from jsonb_array_elements(p_productos) with ordinality as e(valor, n) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Producto mal formado' using errcode = '22023';
    end if;

    v_producto := btrim(coalesce(v_item ->> 'producto', ''));
    if v_producto = '' then
      raise exception 'Cada producto necesita un nombre' using errcode = '22023';
    end if;

    v_categoria := btrim(coalesce(v_item ->> 'categoria', ''));
    if not exists (select 1 from public.parametros p where p.clave = 'categorias_sanidad' and p.valor = v_categoria and p.activo) then
      raise exception 'Categoría de sanidad inválida' using errcode = '22023';
    end if;

    v_via := nullif(btrim(coalesce(v_item ->> 'via', '')), '');
    if v_via is not null
       and not exists (select 1 from public.parametros p where p.clave = 'vias_aplicacion' and p.valor = v_via and p.activo) then
      raise exception 'Vía de aplicación inválida' using errcode = '22023';
    end if;

    v_carencia := public._entero_jsonb(v_item -> 'carencia_dias', 'La carencia');
    if v_carencia < 0 then
      raise exception 'La carencia no puede ser negativa' using errcode = '22023';
    end if;

    begin
      v_proxima := nullif(btrim(coalesce(v_item ->> 'fecha_proxima_dosis', '')), '')::date;
    exception when others then
      raise exception 'Fecha de próxima dosis inválida' using errcode = '22023';
    end;
    if v_proxima is not null and v_proxima <= p_fecha then
      raise exception 'La próxima dosis tiene que ser posterior a la fecha de la sanidad' using errcode = '22023';
    end if;

    insert into public.act_sanidad_productos (actividad_id, establecimiento_id, orden, producto, categoria, dosis, via,
                                              carencia_dias, fecha_proxima_dosis)
    values (p_id, p_establecimiento_id, v_orden, v_producto, v_categoria,
            nullif(btrim(coalesce(v_item ->> 'dosis', '')), ''), v_via, v_carencia, v_proxima);
  end loop;

  return p_id;
end;
$$;

create function public.registrar_servicio(
  p_id              uuid,
  p_lote_id         uuid,
  p_fecha           date,
  p_vacas_entoradas int,
  p_toros           int  default null,
  p_responsables    uuid[] default null,
  p_notas           text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'servicio') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);

  if p_vacas_entoradas is null or p_vacas_entoradas <= 0 then
    raise exception 'Las vacas entoradas tienen que ser más de cero' using errcode = '22023';
  end if;
  if p_toros is not null and p_toros <= 0 then
    raise exception 'Los toros tienen que ser más de cero (o dejarlo vacío)' using errcode = '22023';
  end if;

  -- El trigger agrega la fila principal en actividad_lotes
  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'servicio', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.act_servicio (actividad_id, establecimiento_id, vacas_entoradas, toros)
  values (p_id, v_lote.establecimiento_id, p_vacas_entoradas, p_toros);

  return p_id;
end;
$$;

create function public.registrar_venta(
  p_id          uuid,
  p_lote_id     uuid,
  p_fecha       date,
  p_lineas      jsonb,                  -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
  p_modalidad   text,
  p_contraparte text    default null,
  p_kg_gancho   numeric default null,
  p_precio      jsonb   default null,
  p_responsables uuid[]  default null,
  p_notas       text    default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  public.lotes;
  v_cat   uuid;
  v_total int;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'venta') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);
  if p_kg_gancho is not null and round(p_kg_gancho, 2) <= 0 then
    raise exception 'Los kg al gancho tienen que ser mayores a cero (hasta dos decimales)' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'venta', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.act_compraventa (actividad_id, establecimiento_id, modalidad, contraparte, kg_gancho)
  values (p_id, v_lote.establecimiento_id, p_modalidad, nullif(btrim(coalesce(p_contraparte, '')), ''), round(p_kg_gancho, 2));

  perform public._insertar_lineas(p_id, v_lote.establecimiento_id, v_lote.especie_id, p_lineas, 'opcional');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select v_lote.establecimiento_id, v_lote.id, v_lote.especie_id, l.categoria_id, -l.cabezas, p_fecha, 'venta', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  for v_cat in select l.categoria_id from public.actividad_lineas l where l.actividad_id = p_id loop
    perform public._validar_saldo(v_lote.id, v_cat);
  end loop;

  if p_precio is not null then
    select sum(l.cabezas) into v_total from public.actividad_lineas l where l.actividad_id = p_id;
    perform public._registrar_movimiento(
      v_lote.establecimiento_id, p_id, v_lote.id, v_lote.especie_id, p_fecha, 'ingreso',
      'Venta de ' || v_total || ' cabezas (' || v_lote.nombre || ')', p_contraparte, p_precio);
  end if;

  perform public._cerrar_si_vacio(v_lote.id, p_fecha, 'Vendido');

  return p_id;
end;
$$;

-- Las actividades no se editan: igual que antes, sin la columna borrada
create or replace function public.proteger_actividad() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'Las actividades no se borran: se anulan' using errcode = '42501';
  end if;
  if old.anulada_en is not null then
    raise exception 'La actividad ya está anulada' using errcode = '42501';
  end if;
  if new.anulada_en is null
     or (new.id, new.establecimiento_id, new.tipo, new.fecha, new.lote_id, new.lote_creado_id,
         new.notas, new.created_by, new.created_at)
        is distinct from
        (old.id, old.establecimiento_id, old.tipo, old.fecha, old.lote_id, old.lote_creado_id,
         old.notas, old.created_by, old.created_at) then
    raise exception 'Las actividades no se editan: solo se anulan' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Vistas: responsables (lista) en lugar de persona_id
-- ════════════════════════════════════════════════════════════════════════════
create view public.v_actividades
with (security_invoker = true) as
select
  a.id,
  a.establecimiento_id,
  a.tipo,
  a.fecha,
  a.lote_id,
  a.lote_creado_id,
  coalesce((select array_agg(r.persona_id order by r.persona_id) from public.actividad_responsables r
            where r.actividad_id = a.id), '{}'::uuid[])                                       as responsables,
  a.notas,
  a.anulada_en,
  a.anulada_por,
  a.motivo_anulacion,
  a.created_by,
  a.created_at,
  l.cabezas,
  l.peso_vivo_total_kg,
  case when l.peso_vivo_total_kg is not null and l.cabezas_con_peso > 0
       then round(l.peso_vivo_total_kg / l.cabezas_con_peso, 1) end                     as peso_promedio_kg,
  cv.modalidad,
  cv.contraparte,
  cv.kg_gancho,
  case when cv.kg_gancho is not null and l.peso_vivo_total_kg > 0
       then round(cv.kg_gancho / l.peso_vivo_total_kg * 100, 1) end                    as rendimiento_pct,
  m.causa,
  m.observaciones,
  p.lote_cria_id,
  p.nacidos_muertos,
  (select sum(me.monto_usd) from public.movimientos_economicos me
    where me.actividad_id = a.id and me.anulado_en is null)                             as monto_usd,
  -- 6b-1
  (select array_agg(x.lote_id order by x.nombre, x.lote_id)
     from (select distinct al.lote_id, lo.nombre
             from public.actividad_lotes al
             join public.lotes lo on lo.id = al.lote_id
            where al.actividad_id = a.id) x)                                            as lotes,
  sp.productos,
  sp.producto,
  sv.vacas_entoradas,
  sv.toros,
  dg.vacas_diagnosticadas,
  dg.vacas_prenadas,
  dg.vacas_diagnosticadas - dg.vacas_prenadas                                           as vacas_vacias,
  es.kg_lana_total,
  -- Promedio aproximado: usa el stock total de los lotes a la fecha (todas las categorías)
  case when es.kg_lana_total is not null then
    round(es.kg_lana_total / nullif((
      select sum(e.cabezas)
      from public.actividad_lotes al
      join public.lote_eventos e on e.lote_id = al.lote_id and e.fecha <= a.fecha
      where al.actividad_id = a.id
    ), 0), 2)
  end                                                                                   as kg_lana_cabeza_aprox,
  pz.nombre                                                                             as personalizada,
  pz.campos
from public.actividades a
left join lateral (
  select sum(x.cabezas)::int as cabezas,
         sum(x.peso_vivo_total_kg) as peso_vivo_total_kg,
         sum(x.cabezas) filter (where x.peso_vivo_total_kg is not null)::int as cabezas_con_peso
  from public.actividad_lineas x where x.actividad_id = a.id
) l on true
left join public.act_compraventa cv on cv.actividad_id = a.id
left join public.act_mortandad   m  on m.actividad_id  = a.id
left join public.act_paricion    p  on p.actividad_id  = a.id
left join lateral (
  select nullif(count(*), 0)::int as productos,
         (array_agg(x.producto order by x.orden))[1] as producto
  from public.act_sanidad_productos x where x.actividad_id = a.id
) sp on true
left join public.act_servicio      sv on sv.actividad_id = a.id
left join public.act_diagnostico   dg on dg.actividad_id = a.id
left join public.act_esquila       es on es.actividad_id = a.id
left join public.act_personalizada pz on pz.actividad_id = a.id;

revoke all    on public.v_actividades from anon, authenticated;
grant  select on public.v_actividades to authenticated;

create view public.v_calendario
with (security_invoker = true) as
select e.establecimiento_id, 'tarea'::text as origen, e.id as entrada_id, null::uuid as actividad_id, null::int as orden,
       e.vencimiento as fecha, e.texto,
       coalesce((select array_agg(r.persona_id order by r.persona_id) from public.bitacora_responsables r
                 where r.entrada_id = e.id), '{}'::uuid[]) as responsables,
       e.estado_tarea as estado, e.repetir_cada_dias,
       coalesce((select array_agg(bl.lote_id order by bl.lote_id) from public.bitacora_lotes bl where bl.entrada_id = e.id), '{}'::uuid[]) as lotes,
       e.completada_en as hecha_en
from public.bitacora_entradas e
where e.tipo = 'tarea' and e.anulada_en is null
union all
select a.establecimiento_id, 'dosis', null, p.actividad_id, p.orden,
       p.fecha_proxima_dosis, 'Próxima dosis: ' || p.producto, '{}'::uuid[],
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

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Administradores: ficha en cada establecimiento
-- ════════════════════════════════════════════════════════════════════════════
-- Crea (o reactiva) la ficha de los administradores activos: de uno (p_user_id) o de todos (null), en un
-- establecimiento (p_establecimiento_id) o en todos (null). Con el nombre de su perfil, como asignar_rol.
create function public._fichas_de_admins(p_establecimiento_id uuid, p_user_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.personas (establecimiento_id, nombre, user_id)
  select e.id, btrim(pf.nombre || ' ' || coalesce(pf.apellido, '')), pf.id
  from public.perfiles pf
  cross join public.establecimientos e
  where pf.es_admin and pf.activo
    and (p_user_id is null or pf.id = p_user_id)
    and (p_establecimiento_id is null or e.id = p_establecimiento_id)
  on conflict (establecimiento_id, user_id) do update set activo = true;
end;
$$;

create or replace function public.crear_establecimiento(
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
  v_est uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede crear establecimientos' using errcode = '42501';
  end if;

  insert into public.establecimientos (
    nombre, departamento, localidad, paraje, superficie_total, sistema_productivo,
    propietario, rut, dicose, fecha_alta, observaciones
  ) values (
    p_nombre, p_departamento, p_localidad, p_paraje, p_superficie_total, p_sistema_productivo,
    p_propietario, p_rut, p_dicose, coalesce(p_fecha_alta, public.fecha_hoy()), p_observaciones
  )
  returning id into v_est;

  if p_cargar_catalogos_base then
    perform public._cargar_catalogos_base(v_est);
  end if;

  -- Los administradores son responsables posibles en todos los establecimientos
  perform public._fichas_de_admins(v_est, null);

  return v_est;
end;
$$;

create or replace function public.definir_admin(p_user_id uuid, p_es_admin boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar administradores' using errcode = '42501';
  end if;

  update public.perfiles set es_admin = p_es_admin where id = p_user_id;
  if not found then
    raise exception 'Usuario inexistente' using errcode = '22023';
  end if;

  -- Con el rol: ficha en todos los establecimientos. Sin él: inactiva donde no tiene membresía
  -- (sigue apareciendo en lo que ya tiene asignado).
  if p_es_admin then
    perform public._fichas_de_admins(null, p_user_id);
  else
    update public.personas pe
    set activo = false
    where pe.user_id = p_user_id
      and not exists (select 1 from public.membresias m where m.user_id = p_user_id and m.establecimiento_id = pe.establecimiento_id);
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Permisos de las funciones nuevas o redefinidas
-- ════════════════════════════════════════════════════════════════════════════
-- Las que cambiaron de firma se crearon de nuevo: sin permisos hasta acá.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = any (array[
        'registrar_compra',
        'registrar_destete',
        'registrar_diagnostico',
        'registrar_esquila',
        'registrar_mortandad',
        'registrar_paricion',
        'registrar_personalizada',
        'registrar_pesada',
        'registrar_sanidad',
        'registrar_servicio',
        'registrar_venta',
        'crear_entrada_bitacora',
        'editar_entrada_bitacora'])
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant  execute on function %s to authenticated', f);
  end loop;
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = any (array[
        '_validar_entrada_bitacora',
        '_validar_responsables',
        '_guardar_responsables_entrada',
        '_guardar_responsables_actividad',
        '_fichas_de_admins'])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Fichas de los administradores actuales
-- ════════════════════════════════════════════════════════════════════════════
select public._fichas_de_admins(null, null);

commit;
