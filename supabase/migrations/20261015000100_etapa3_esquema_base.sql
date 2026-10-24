-- Campo Digital v2 — Etapa 3: esquema base
--
-- Tablas, índices, helpers de permisos, RLS y GRANTs de la Etapa 3.
-- Diseño: contexto/DISENO-BASE-ETAPA-3.md
--
-- Requiere Postgres 15 o superior (vistas con security_invoker, en la migración siguiente).
-- Se corre después de 20261015000000_reset_public.sql.

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Permisos por defecto
-- ════════════════════════════════════════════════════════════════════════════

-- El reseteo dejó permisos por defecto para anon y authenticated sobre todo lo nuevo de public.
-- Se sacan: todo objeto nuevo nace sin permisos y cada migración otorga explícitamente lo que hace falta.
-- (Postgres además da execute a public sobre toda función nueva; eso no se saca por esquema,
-- así que cada función lleva su propio revoke.)

begin;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Funciones de trigger
-- ════════════════════════════════════════════════════════════════════════════

-- Mantiene updated_at en las tablas editables
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Rechaza update, delete y truncate en las tablas inmutables
create function public.bloquear_modificacion() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% es inmutable: los errores se corrigen con un evento de ajuste', tg_table_name
    using errcode = '42501';
end;
$$;

revoke execute on function public.set_updated_at()        from public, anon, authenticated;
revoke execute on function public.bloquear_modificacion() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 bis. Fecha de hoy en Uruguay
-- ════════════════════════════════════════════════════════════════════════════
-- El servidor corre en UTC: entre las 21:00 y la medianoche de Uruguay, current_date
-- ya es "mañana". Todas las validaciones de "fecha no futura" y los valores por
-- defecto de fecha usan esta función.

create function public.fecha_hoy() returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Montevideo')::date;
$$;

revoke execute on function public.fecha_hoy() from public, anon;
grant  execute on function public.fecha_hoy() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Tablas
-- ════════════════════════════════════════════════════════════════════════════
-- Criterios (ver diseño, sección 1):
--   * id uuid en todas las tablas.
--   * created_by sin clave foránea: es auditoría y tiene que sobrevivir a la baja del usuario.
--   * Claves foráneas compuestas (x_id, establecimiento_id) para que todo sea del mismo establecimiento.
--   * Ninguna cascada hacia datos del campo: restrict (por defecto, no action).

-- ── parametros (listas globales, solo lectura) ──────────────────────────────

create table public.parametros (
  id         uuid primary key default gen_random_uuid(),
  clave      text not null,
  valor      text not null,
  orden      int  not null default 0,
  activo     boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (clave, valor)
);

-- ── establecimientos ────────────────────────────────────────────────────────

create table public.establecimientos (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null check (btrim(nombre) <> ''),
  departamento       text not null,
  localidad          text,
  paraje             text,
  superficie_total   numeric(10,2) check (superficie_total > 0),
  sistema_productivo text,   -- texto libre, sin lógica
  propietario        text,
  rut                text,
  dicose             text,   -- texto libre, sin validación
  fecha_alta         date not null default public.fecha_hoy(),
  estado             text not null default 'activo' check (estado in ('activo', 'inactivo')),
  observaciones      text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── membresias ──────────────────────────────────────────────────────────────

create table public.membresias (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  user_id            uuid not null references auth.users (id) on delete cascade,
  rol                text not null check (rol in ('editor', 'lector')),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, establecimiento_id)
);

create index membresias_establecimiento_idx on public.membresias (establecimiento_id);

-- ── Helpers de permisos ─────────────────────────────────────────────────────
-- security definer: corren como el dueño de las tablas, así su consulta a membresias
-- no pasa por RLS. Sin esto, la política de membresias (que llama a es_miembro)
-- entraría en recursión infinita. search_path vacío y nombres calificados para que
-- nadie pueda engañarlas con objetos de otro esquema.

create function public.es_miembro(p_est uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membresias m
    where m.establecimiento_id = p_est
      and m.user_id = (select auth.uid())
  );
$$;

create function public.es_editor(p_est uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membresias m
    where m.establecimiento_id = p_est
      and m.user_id = (select auth.uid())
      and m.rol = 'editor'
  );
$$;

-- Rol del usuario actual en un establecimiento: 'editor', 'lector' o null
create function public.mi_rol(p_est uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.rol
  from public.membresias m
  where m.establecimiento_id = p_est
    and m.user_id = (select auth.uid());
$$;

revoke execute on function public.es_miembro(uuid) from public, anon;
revoke execute on function public.es_editor(uuid)  from public, anon;
revoke execute on function public.mi_rol(uuid)     from public, anon;
grant  execute on function public.es_miembro(uuid) to authenticated;
grant  execute on function public.es_editor(uuid)  to authenticated;
grant  execute on function public.mi_rol(uuid)     to authenticated;

-- ── personas ────────────────────────────────────────────────────────────────

create table public.personas (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> ''),
  rol                text,   -- texto libre: capataz, peón, veterinario, hermano...
  user_id            uuid references auth.users (id) on delete set null,
  activo             boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (establecimiento_id, user_id),
  unique (id, establecimiento_id)
);

-- ── especies ────────────────────────────────────────────────────────────────

create table public.especies (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> ''),
  activo             boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (establecimiento_id, nombre),
  unique (id, establecimiento_id)
);

-- ── categorias_animales ─────────────────────────────────────────────────────

create table public.categorias_animales (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  especie_id         uuid not null,
  nombre             text not null check (btrim(nombre) <> ''),
  orden              int  not null default 0,
  activo             boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (especie_id, establecimiento_id)
    references public.especies (id, establecimiento_id) on delete restrict,
  unique (especie_id, nombre),
  unique (id, establecimiento_id),
  unique (id, especie_id)
);

create index categorias_animales_orden_idx
  on public.categorias_animales (establecimiento_id, especie_id, orden);

-- ── rubros ──────────────────────────────────────────────────────────────────

create table public.rubros (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> ''),
  activo             boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (establecimiento_id, nombre)
);

-- ── potreros ────────────────────────────────────────────────────────────────

create table public.potreros (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> ''),
  superficie         numeric(10,2) not null check (superficie > 0),
  uso_actual         text,   -- valores de parametros, clave 'uso_potrero'
  tipo_pastura       text,   -- valores de parametros, clave 'tipos_pastura'
  aguada             boolean,
  sombra             boolean,
  estado             text not null default 'activo' check (estado in ('activo', 'inactivo')),
  observaciones      text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (establecimiento_id, nombre),
  unique (id, establecimiento_id)
);

-- ── lotes ───────────────────────────────────────────────────────────────────

create table public.lotes (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  especie_id         uuid not null,
  nombre             text not null check (btrim(nombre) <> ''),
  campana            text,
  estado             text not null default 'activo' check (estado in ('activo', 'cerrado')),
  fecha_apertura     date not null,
  fecha_cierre       date,
  potrero_id         uuid,   -- dato simple, sin historial
  notas              text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (especie_id, establecimiento_id)
    references public.especies (id, establecimiento_id) on delete restrict,
  foreign key (potrero_id, establecimiento_id)
    references public.potreros (id, establecimiento_id) on delete restrict,
  check ((estado = 'activo') = (fecha_cierre is null)),
  check (fecha_cierre is null or fecha_cierre >= fecha_apertura),
  unique (id, establecimiento_id),
  unique (id, especie_id)
);

create index lotes_establecimiento_estado_idx on public.lotes (establecimiento_id, estado);
create index lotes_potrero_idx on public.lotes (potrero_id) where potrero_id is not null;

-- ── operaciones_lote (inmutable) ────────────────────────────────────────────

create table public.operaciones_lote (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  tipo               text not null check (tipo in ('division', 'union', 'recategorizacion')),
  fecha              date not null,
  notas              text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  unique (id, establecimiento_id)
);

create index operaciones_lote_establecimiento_idx on public.operaciones_lote (establecimiento_id, fecha);

-- ── operacion_lote_vinculos (inmutable) ─────────────────────────────────────

create table public.operacion_lote_vinculos (
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  operacion_id       uuid not null,
  lote_id            uuid not null,
  rol                text not null check (rol in ('origen', 'destino')),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  primary key (operacion_id, lote_id, rol),
  foreign key (operacion_id, establecimiento_id)
    references public.operaciones_lote (id, establecimiento_id) on delete restrict,
  foreign key (lote_id, establecimiento_id)
    references public.lotes (id, establecimiento_id) on delete restrict
);

create index operacion_lote_vinculos_lote_idx on public.operacion_lote_vinculos (lote_id);

-- ── lote_eventos: libro de stock (inmutable) ────────────────────────────────

create table public.lote_eventos (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  lote_id            uuid not null,
  especie_id         uuid not null,   -- copia de la especie del lote, para validar la categoría
  categoria_id       uuid not null,
  cabezas            int  not null check (cabezas <> 0),   -- con signo: + suma, - resta
  fecha              date not null,
  tipo               text not null check (tipo in (
                       'alta_inicial', 'paricion', 'compra', 'venta', 'mortandad',
                       'recategorizacion', 'division', 'union', 'ajuste')),
  operacion_lote_id  uuid,
  nota               text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  -- el lote es del mismo establecimiento
  foreign key (lote_id, establecimiento_id)
    references public.lotes (id, establecimiento_id) on delete restrict,
  -- la especie es la del lote
  foreign key (lote_id, especie_id)
    references public.lotes (id, especie_id) on delete restrict,
  -- la categoría es de esa especie
  foreign key (categoria_id, especie_id)
    references public.categorias_animales (id, especie_id) on delete restrict,
  foreign key (operacion_lote_id, establecimiento_id)
    references public.operaciones_lote (id, establecimiento_id) on delete restrict,
  -- todo ajuste lleva su motivo
  check (tipo <> 'ajuste' or (nota is not null and btrim(nota) <> '')),
  -- las operaciones de lote siempre apuntan a su operación, y solo ellas
  check ((tipo in ('division', 'union', 'recategorizacion')) = (operacion_lote_id is not null))
  -- La columna actividad_id y su regla para paricion, compra, venta y mortandad se agregan en la Etapa 6a.
);

create index lote_eventos_saldo_idx           on public.lote_eventos (lote_id, categoria_id, fecha);
create index lote_eventos_establecimiento_idx on public.lote_eventos (establecimiento_id, fecha);
create index lote_eventos_operacion_idx       on public.lote_eventos (operacion_lote_id) where operacion_lote_id is not null;

-- ── lote_cambios_estado: cierres y reaperturas (inmutable) ──────────────────

create table public.lote_cambios_estado (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  lote_id            uuid not null,
  tipo               text not null check (tipo in ('cierre', 'reapertura')),
  fecha              date not null,
  motivo             text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (lote_id, establecimiento_id)
    references public.lotes (id, establecimiento_id) on delete restrict
);

create index lote_cambios_estado_lote_idx on public.lote_cambios_estado (lote_id, fecha);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Triggers
-- ════════════════════════════════════════════════════════════════════════════

create trigger set_updated_at before update on public.establecimientos    for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.membresias          for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.personas            for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.especies            for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.categorias_animales for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.rubros              for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.potreros            for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.lotes               for each row execute function public.set_updated_at();

-- Inmutables: ni update, ni delete, ni truncate (frena incluso a service_role y al SQL Editor)
create trigger inmutable before update or delete on public.lote_eventos            for each row       execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate      on public.lote_eventos            for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.operaciones_lote        for each row       execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate      on public.operaciones_lote        for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.operacion_lote_vinculos for each row       execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate      on public.operacion_lote_vinculos for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.lote_cambios_estado     for each row       execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate      on public.lote_cambios_estado     for each statement execute function public.bloquear_modificacion();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ════════════════════════════════════════════════════════════════════════════
-- Lo que no tiene política está prohibido. Ninguna tabla tiene política de delete.

alter table public.parametros              enable row level security;
alter table public.establecimientos        enable row level security;
alter table public.membresias              enable row level security;
alter table public.personas                enable row level security;
alter table public.especies                enable row level security;
alter table public.categorias_animales     enable row level security;
alter table public.rubros                  enable row level security;
alter table public.potreros                enable row level security;
alter table public.lotes                   enable row level security;
alter table public.operaciones_lote        enable row level security;
alter table public.operacion_lote_vinculos enable row level security;
alter table public.lote_eventos            enable row level security;
alter table public.lote_cambios_estado     enable row level security;

-- parametros: listas globales, las lee cualquier usuario con sesión
create policy parametros_select on public.parametros
  for select to authenticated using (true);

-- establecimientos: se crean solo con crear_establecimiento() (sin política de insert)
create policy establecimientos_select on public.establecimientos
  for select to authenticated using (public.es_miembro(id));
create policy establecimientos_update on public.establecimientos
  for update to authenticated
  using (public.es_editor(id)) with check (public.es_editor(id));

-- membresias: solo lectura; se escriben con funciones (crear_establecimiento, y en la Etapa 9 la gestión de usuarios)
create policy membresias_select on public.membresias
  for select to authenticated using (public.es_miembro(establecimiento_id));

-- Catálogos y potreros: miembros leen, editores cargan y editan
create policy personas_select on public.personas
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy personas_insert on public.personas
  for insert to authenticated with check (public.es_editor(establecimiento_id));
create policy personas_update on public.personas
  for update to authenticated
  using (public.es_editor(establecimiento_id)) with check (public.es_editor(establecimiento_id));

create policy especies_select on public.especies
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy especies_insert on public.especies
  for insert to authenticated with check (public.es_editor(establecimiento_id));
create policy especies_update on public.especies
  for update to authenticated
  using (public.es_editor(establecimiento_id)) with check (public.es_editor(establecimiento_id));

create policy categorias_animales_select on public.categorias_animales
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy categorias_animales_insert on public.categorias_animales
  for insert to authenticated with check (public.es_editor(establecimiento_id));
create policy categorias_animales_update on public.categorias_animales
  for update to authenticated
  using (public.es_editor(establecimiento_id)) with check (public.es_editor(establecimiento_id));

create policy rubros_select on public.rubros
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy rubros_insert on public.rubros
  for insert to authenticated with check (public.es_editor(establecimiento_id));
create policy rubros_update on public.rubros
  for update to authenticated
  using (public.es_editor(establecimiento_id)) with check (public.es_editor(establecimiento_id));

create policy potreros_select on public.potreros
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy potreros_insert on public.potreros
  for insert to authenticated with check (public.es_editor(establecimiento_id));
create policy potreros_update on public.potreros
  for update to authenticated
  using (public.es_editor(establecimiento_id)) with check (public.es_editor(establecimiento_id));

-- lotes: se crean con crear_lote() (sin política de insert); se editan solo algunas columnas (ver GRANTs)
create policy lotes_select on public.lotes
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy lotes_update on public.lotes
  for update to authenticated
  using (public.es_editor(establecimiento_id)) with check (public.es_editor(establecimiento_id));

-- Tablas inmutables: solo lectura para miembros; se escriben únicamente con funciones
create policy operaciones_lote_select on public.operaciones_lote
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy operacion_lote_vinculos_select on public.operacion_lote_vinculos
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy lote_eventos_select on public.lote_eventos
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy lote_cambios_estado_select on public.lote_cambios_estado
  for select to authenticated using (public.es_miembro(establecimiento_id));

-- ════════════════════════════════════════════════════════════════════════════
-- 5. GRANTs
-- ════════════════════════════════════════════════════════════════════════════
-- El RLS decide qué filas; los GRANTs, qué operaciones se pueden intentar.

revoke all on all tables in schema public from anon, authenticated;

-- Lectura: todas las tablas (el RLS filtra las filas)
grant select on all tables in schema public to authenticated;

-- Escritura directa solo en catálogos y potreros, y solo por columna:
--   * id, created_by, created_at y updated_at no se pueden escribir (la auditoría no se falsea);
--   * establecimiento_id (y especie_id en categorías) no se puede cambiar después del alta.
grant insert (establecimiento_id, nombre, rol, user_id, activo)                 on public.personas to authenticated;
grant update (nombre, rol, user_id, activo)                                     on public.personas to authenticated;

grant insert (establecimiento_id, nombre, activo)                               on public.especies to authenticated;
grant update (nombre, activo)                                                   on public.especies to authenticated;

grant insert (establecimiento_id, especie_id, nombre, orden, activo)            on public.categorias_animales to authenticated;
grant update (nombre, orden, activo)                                            on public.categorias_animales to authenticated;

grant insert (establecimiento_id, nombre, activo)                               on public.rubros to authenticated;
grant update (nombre, activo)                                                   on public.rubros to authenticated;

grant insert (establecimiento_id, nombre, superficie, uso_actual, tipo_pastura,
              aguada, sombra, estado, observaciones)                            on public.potreros to authenticated;
grant update (nombre, superficie, uso_actual, tipo_pastura,
              aguada, sombra, estado, observaciones)                            on public.potreros to authenticated;

-- establecimientos: solo datos descriptivos y estado (baja lógica)
grant update (nombre, departamento, localidad, paraje, superficie_total, sistema_productivo,
              propietario, rut, dicose, fecha_alta, estado, observaciones)
  on public.establecimientos to authenticated;

-- lotes: sin update sobre la tabla; solo estas columnas. Estado y fechas de cierre van por funciones.
grant update (nombre, campana, potrero_id, notas) on public.lotes to authenticated;

-- membresias, lote_eventos, operaciones_lote, operacion_lote_vinculos, lote_cambios_estado:
-- solo select. Ningún delete ni truncate en ninguna tabla.

commit;
