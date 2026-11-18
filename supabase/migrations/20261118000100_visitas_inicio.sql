-- Campo Digital v2 — Inicio: la última visita de cada usuario a cada establecimiento
--
-- Pedido del 2026-11-18 (rediseño del Inicio): "X novedades desde tu última entrada" y un punto en lo nuevo.
--
--   1. visitas_inicio: una fila por usuario y establecimiento con la hora de su última visita al Inicio. Por
--      establecimiento y no en perfiles: quien entra a dos campos no pierde las novedades de uno al mirar el otro.
--      Cada uno lee solo la suya; se escribe solo con la función.
--   2. registrar_visita_inicio(establecimiento): guarda ahora como última visita y devuelve la anterior (null la
--      primera vez), en un solo paso. Solo para miembros del establecimiento (o el administrador).
--
-- Novedad = actividad o nota cargada por otro después de la visita anterior. Eso lo cuenta la app con created_at
-- y created_by, que ya están en v_actividades y bitacora_entradas: acá no hay vistas nuevas.
--
-- Auditoría: 170 funciones (+1: registrar_visita_inicio). Sin permisos de columna nuevos.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tabla
-- ════════════════════════════════════════════════════════════════════════════

create table public.visitas_inicio (
  user_id            uuid not null references public.perfiles (id) on delete cascade,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  vista_en           timestamptz not null default now(),
  primary key (user_id, establecimiento_id)
);

alter table public.visitas_inicio enable row level security;
create policy visitas_inicio_select on public.visitas_inicio
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.visitas_inicio from anon, authenticated;
grant select on public.visitas_inicio to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Registrar la visita
-- ════════════════════════════════════════════════════════════════════════════

create function public.registrar_visita_inicio(p_establecimiento_id uuid) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior timestamptz;
begin
  if auth.uid() is null or p_establecimiento_id is null or not public.es_miembro(p_establecimiento_id) then
    raise exception 'Sin acceso a este establecimiento' using errcode = '42501';
  end if;

  select vista_en into v_anterior from public.visitas_inicio
  where user_id = auth.uid() and establecimiento_id = p_establecimiento_id
  for update;

  -- Dos pestañas a la vez: la segunda choca con la fila de la primera y la actualiza
  insert into public.visitas_inicio (user_id, establecimiento_id, vista_en)
  values (auth.uid(), p_establecimiento_id, now())
  on conflict (user_id, establecimiento_id) do update set vista_en = excluded.vista_en;

  return v_anterior;
end;
$$;

revoke execute on function public.registrar_visita_inicio(uuid) from public, anon;
grant  execute on function public.registrar_visita_inicio(uuid) to authenticated;

commit;
