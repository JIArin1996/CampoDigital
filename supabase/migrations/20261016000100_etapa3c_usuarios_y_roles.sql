-- Campo Digital v2 — Etapa 3c: usuarios y roles
--
-- Pasa de 2 roles (editor, lector) a 3:
--   * Administrador: del sistema entero (perfiles.es_admin). Ve y edita todo en todos los
--     establecimientos sin estar asignado; crea establecimientos; gestiona usuarios y configuración.
--   * Operador (por establecimiento): carga y edita el día a día (potreros, lotes y stock).
--   * Consulta (por establecimiento): ve todo, incluida la economía; no edita nada.
--
-- Además: tabla perfiles (datos del usuario), desactivar en vez de borrar, vínculo automático
-- con personas y bucket de fotos de perfil.
-- Diseño: contexto/DISENO-USUARIOS.md
--
-- Se corre después de las migraciones de la Etapa 3a. Las operaciones de Supabase Auth
-- (crear usuario, contraseña, email, bloqueo) las hace el servidor de la app con la clave
-- service_role; esta migración solo cubre la base.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. perfiles
-- ════════════════════════════════════════════════════════════════════════════

create table public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,            -- copia del email de Auth, la mantiene el sistema
  nombre     text not null check (btrim(nombre) <> ''),
  apellido   text,
  celular    text,                     -- dato de contacto
  foto_path  text,                     -- ruta en el bucket 'avatares'
  es_admin   boolean not null default false,
  activo     boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.perfiles
  for each row execute function public.set_updated_at();

-- Usuarios que ya existen en Auth (por ejemplo, el creado desde el panel)
insert into public.perfiles (id, email, nombre)
select u.id, coalesce(u.email, ''), coalesce(nullif(split_part(u.email, '@', 1), ''), 'Usuario')
from auth.users u
on conflict (id) do nothing;

-- No se puede quedar sin ningún administrador activo
create function public.proteger_ultimo_admin() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.es_admin and old.activo
     and (tg_op = 'DELETE' or not (new.es_admin and new.activo)) then
    -- serializa cambios simultáneos sobre administradores
    perform 1 from public.perfiles p where p.es_admin and p.activo for update;
    if not exists (
      select 1 from public.perfiles p
      where p.es_admin and p.activo and p.id <> old.id
    ) then
      raise exception 'Tiene que quedar al menos un administrador activo' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.proteger_ultimo_admin() from public, anon, authenticated;

create trigger proteger_ultimo_admin before update or delete on public.perfiles
  for each row execute function public.proteger_ultimo_admin();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. membresias: operador y consulta
-- ════════════════════════════════════════════════════════════════════════════

alter table public.membresias drop constraint membresias_rol_check;

update public.membresias
set rol = case rol when 'editor' then 'operador' when 'lector' then 'consulta' else rol end;

alter table public.membresias
  add constraint membresias_rol_check check (rol in ('operador', 'consulta'));

-- Toda membresía es de un usuario con perfil
alter table public.membresias
  add constraint membresias_perfil_fkey foreign key (user_id) references public.perfiles (id) on delete cascade;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Helpers de permisos
-- ════════════════════════════════════════════════════════════════════════════
-- Todos exigen perfil activo: desactivar un usuario le corta el acceso en el momento,
-- aunque su token de sesión siga vigente unos minutos.

create function public.es_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.es_admin and p.activo
  );
$$;

-- Ver: administrador, o asignado al establecimiento con cualquier rol
create or replace function public.es_miembro(p_est uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_admin() or exists (
    select 1
    from public.membresias m
    join public.perfiles p on p.id = m.user_id
    where m.establecimiento_id = p_est
      and m.user_id = (select auth.uid())
      and p.activo
  );
$$;

-- Cargar y editar el día a día: administrador u operador del establecimiento
create function public.puede_operar(p_est uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_admin() or exists (
    select 1
    from public.membresias m
    join public.perfiles p on p.id = m.user_id
    where m.establecimiento_id = p_est
      and m.user_id = (select auth.uid())
      and m.rol = 'operador'
      and p.activo
  );
$$;

-- Rol del usuario actual en un establecimiento: 'administrador', 'operador', 'consulta' o null
create or replace function public.mi_rol(p_est uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.es_admin() then 'administrador'
    else (
      select m.rol
      from public.membresias m
      join public.perfiles p on p.id = m.user_id
      where m.establecimiento_id = p_est
        and m.user_id = (select auth.uid())
        and p.activo
    )
  end;
$$;

revoke execute on function public.es_admin()          from public, anon;
revoke execute on function public.puede_operar(uuid)  from public, anon;
grant  execute on function public.es_admin()          to authenticated;
grant  execute on function public.puede_operar(uuid)  to authenticated;
-- es_miembro y mi_rol mantienen sus permisos (create or replace no los cambia)

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Políticas: escritura según el rol nuevo
-- ════════════════════════════════════════════════════════════════════════════
-- Las de select siguen igual (usan es_miembro, que ahora incluye al administrador).
-- Configuración (datos del establecimiento y catálogos): solo administrador.
-- Día a día (potreros y lotes): administrador u operador.

drop policy establecimientos_update    on public.establecimientos;
drop policy personas_insert            on public.personas;
drop policy personas_update            on public.personas;
drop policy especies_insert            on public.especies;
drop policy especies_update            on public.especies;
drop policy categorias_animales_insert on public.categorias_animales;
drop policy categorias_animales_update on public.categorias_animales;
drop policy rubros_insert              on public.rubros;
drop policy rubros_update              on public.rubros;
drop policy potreros_insert            on public.potreros;
drop policy potreros_update            on public.potreros;
drop policy lotes_update               on public.lotes;

create policy establecimientos_update on public.establecimientos
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy personas_insert on public.personas
  for insert to authenticated with check (public.es_admin());
create policy personas_update on public.personas
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy especies_insert on public.especies
  for insert to authenticated with check (public.es_admin());
create policy especies_update on public.especies
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy categorias_animales_insert on public.categorias_animales
  for insert to authenticated with check (public.es_admin());
create policy categorias_animales_update on public.categorias_animales
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy rubros_insert on public.rubros
  for insert to authenticated with check (public.es_admin());
create policy rubros_update on public.rubros
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy potreros_insert on public.potreros
  for insert to authenticated with check (public.puede_operar(establecimiento_id));
create policy potreros_update on public.potreros
  for update to authenticated
  using (public.puede_operar(establecimiento_id)) with check (public.puede_operar(establecimiento_id));

create policy lotes_update on public.lotes
  for update to authenticated
  using (public.puede_operar(establecimiento_id)) with check (public.puede_operar(establecimiento_id));

-- perfiles: cada uno ve y edita el suyo; el administrador ve y edita todos.
-- es_admin, activo y email no se editan directo (ver GRANTs): van por funciones o por el servidor.
alter table public.perfiles enable row level security;

create policy perfiles_select on public.perfiles
  for select to authenticated using (id = (select auth.uid()) or public.es_admin());
create policy perfiles_update on public.perfiles
  for update to authenticated
  using (id = (select auth.uid()) or public.es_admin())
  with check (id = (select auth.uid()) or public.es_admin());

revoke all on public.perfiles from anon, authenticated;
grant select on public.perfiles to authenticated;
grant update (nombre, apellido, celular, foto_path) on public.perfiles to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Funciones de escritura: permisos nuevos
-- ════════════════════════════════════════════════════════════════════════════

-- Bloqueo del lote: ahora exige poder operar (administrador u operador)
create or replace function public._bloquear_lote_editable(p_lote_id uuid) returns public.lotes
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

  if not found or not public.puede_operar(v_lote.establecimiento_id) then
    raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
  end if;

  return v_lote;
end;
$$;

-- Alta de establecimiento: solo el administrador. Ya no crea membresía (el administrador ve todo).
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

  return v_est;
end;
$$;

-- crear_lote: misma lógica que en la Etapa 3a, con el permiso nuevo
create or replace function public.crear_lote(
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
  if not public.puede_operar(p_establecimiento_id) then
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

-- registrar_ajuste, cerrar_lote y reabrir_lote no cambian: validan el permiso con
-- _bloquear_lote_editable, que ahora usa puede_operar.

-- es_editor ya no la usa nada
drop function public.es_editor(uuid);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Gestión de usuarios (solo administrador)
-- ════════════════════════════════════════════════════════════════════════════

-- Asigna (o cambia) el rol de un usuario en un establecimiento y lo vincula con su
-- ficha en personas: la crea si no existe, o la reactiva.
create function public.asignar_rol(p_user_id uuid, p_establecimiento_id uuid, p_rol text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede asignar roles' using errcode = '42501';
  end if;

  if p_rol is null or p_rol not in ('operador', 'consulta') then
    raise exception 'Rol inválido: tiene que ser operador o consulta' using errcode = '22023';
  end if;

  select * into v_perfil from public.perfiles where id = p_user_id;
  if not found then
    raise exception 'Usuario inexistente' using errcode = '22023';
  end if;

  if not exists (select 1 from public.establecimientos where id = p_establecimiento_id) then
    raise exception 'Establecimiento inexistente' using errcode = '22023';
  end if;

  insert into public.membresias (establecimiento_id, user_id, rol)
  values (p_establecimiento_id, p_user_id, p_rol)
  on conflict (user_id, establecimiento_id) do update set rol = excluded.rol;

  -- Vínculo con personas (responsables en tareas, bitácora y actividades)
  update public.personas
  set activo = true
  where establecimiento_id = p_establecimiento_id and user_id = p_user_id;

  if not found then
    insert into public.personas (establecimiento_id, nombre, user_id)
    values (
      p_establecimiento_id,
      btrim(v_perfil.nombre || ' ' || coalesce(v_perfil.apellido, '')),
      p_user_id
    );
  end if;
end;
$$;

-- Quita el acceso de un usuario a un establecimiento. Su ficha en personas queda
-- (inactiva), para que siga apareciendo en lo que cargó o tuvo a cargo.
create function public.quitar_acceso(p_user_id uuid, p_establecimiento_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede quitar accesos' using errcode = '42501';
  end if;

  delete from public.membresias
  where user_id = p_user_id and establecimiento_id = p_establecimiento_id;

  update public.personas
  set activo = false
  where establecimiento_id = p_establecimiento_id and user_id = p_user_id;
end;
$$;

-- Da o saca el rol de administrador del sistema
create function public.definir_admin(p_user_id uuid, p_es_admin boolean) returns void
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
end;
$$;

-- Activa o desactiva un usuario en la base (el servidor además lo bloquea en Auth).
-- Desactivado no ve ni toca nada, pero su nombre sigue en lo que cargó.
create function public.definir_activo(p_user_id uuid, p_activo boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede activar o desactivar usuarios' using errcode = '42501';
  end if;

  update public.perfiles set activo = p_activo where id = p_user_id;
  if not found then
    raise exception 'Usuario inexistente' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.asignar_rol(uuid, uuid, text)    from public, anon;
revoke execute on function public.quitar_acceso(uuid, uuid)        from public, anon;
revoke execute on function public.definir_admin(uuid, boolean)     from public, anon;
revoke execute on function public.definir_activo(uuid, boolean)    from public, anon;
grant  execute on function public.asignar_rol(uuid, uuid, text)    to authenticated;
grant  execute on function public.quitar_acceso(uuid, uuid)        to authenticated;
grant  execute on function public.definir_admin(uuid, boolean)     to authenticated;
grant  execute on function public.definir_activo(uuid, boolean)    to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Fotos de perfil (Supabase Storage)
-- ════════════════════════════════════════════════════════════════════════════
-- Bucket privado. Cada usuario escribe solo en su carpeta (<user_id>/...); cualquier
-- usuario con sesión puede ver las fotos (con URL firmada).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy avatares_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatares');

create policy avatares_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatares_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatares_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
