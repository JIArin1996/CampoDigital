-- Campo Digital v2 — Economía: conceptos (con grupos), titulares y archivos de los movimientos
--
-- Pedido del 2026-10-23. Requiere 20261025000100_movimientos_vencimiento (fecha_vencimiento).
--
--   1. Catálogos por establecimiento (los edita el administrador, los leen los miembros):
--      * concepto_grupos: nombre, orden, activo.
--      * conceptos: nombre, tipo (ingreso o egreso), grupo opcional, activo.
--      * titulares: nombre, activo. SIN datos semilla: arrancan vacíos.
--      Se borran solo si nadie los usa (las FK con restrict lo impiden); si no, se dan de baja.
--   2. Datos semilla de grupos y conceptos, POR ESTABLECIMIENTO: _cargar_conceptos_base los copia al
--      crear un establecimiento (desde _cargar_catalogos_base) y esta migración los carga una vez en
--      los que ya existen.
--   3. movimientos_economicos: concepto_id y titular_id (opcionales en la tabla: los movimientos
--      viejos cargados a mano no tienen concepto del catálogo). La columna concepto (texto) queda
--      como descripción: en la carga manual guarda el nombre del concepto elegido; en la compra y la
--      venta, "Venta de N cabezas (lote)".
--      Compra y venta toman el concepto del precio ("concepto_id") o, por defecto, por su nombre:
--      "Compra de ganado"; "Venta de ganado vacuno" u "ovino" según el grupo de la especie. Los
--      movimientos de compras y ventas ya cargados se completan con esa regla.
--   4. registrar_movimiento: cambia la firma (p_concepto texto → p_concepto_id; suma p_titular_id).
--      El concepto es obligatorio, activo y del mismo tipo que el movimiento.
--      _registrar_movimiento y cargar_precio_actividad: misma firma; leen "concepto_id",
--      "titular_id" y "vencimiento" del precio.
--   5. v_resultado_detalle: monto por mes, sentido, rubro, concepto, grupo y titular (la app agrupa
--      por la dimensión que se elija). v_resultado_rubro no cambia.
--   6. Archivos de un movimiento: tabla movimiento_archivos (un registro por objeto; se quita
--      ocultándolo, nunca se borra) y bucket privado movimiento-archivos. A diferencia de los
--      archivos del lote, los ven solo quienes pueden cargar (Consulta no ve plata).
--
-- Auditoría: +5 funciones (_cargar_conceptos_base, _concepto_por_defecto, proteger_movimiento_archivo,
-- adjuntar_archivo_movimiento, quitar_archivo_movimiento); registrar_movimiento se reemplaza (misma
-- cantidad). Permisos de columna nuevos en concepto_grupos, conceptos y titulares (insert, update y
-- delete para authenticated, filtrados por las políticas de administrador).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Catálogos
-- ════════════════════════════════════════════════════════════════════════════

create table public.concepto_grupos (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> ''),
  orden              int not null default 0,
  activo             boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (establecimiento_id, nombre),
  unique (id, establecimiento_id)
);

create table public.conceptos (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> ''),
  tipo               text not null check (tipo in ('ingreso', 'egreso')),
  grupo_id           uuid,
  activo             boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (establecimiento_id, tipo, nombre),
  unique (id, establecimiento_id),
  foreign key (grupo_id, establecimiento_id) references public.concepto_grupos (id, establecimiento_id) on delete restrict
);

create table public.titulares (
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

create index conceptos_grupo_idx on public.conceptos (grupo_id) where grupo_id is not null;

create trigger set_updated_at before update on public.concepto_grupos for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.conceptos       for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.titulares       for each row execute function public.set_updated_at();

alter table public.concepto_grupos enable row level security;
alter table public.conceptos       enable row level security;
alter table public.titulares       enable row level security;

-- Leen los miembros (como los rubros); escribe solo el administrador
create policy concepto_grupos_select on public.concepto_grupos for select to authenticated using (public.es_miembro(establecimiento_id));
create policy concepto_grupos_insert on public.concepto_grupos for insert to authenticated with check (public.es_admin());
create policy concepto_grupos_update on public.concepto_grupos for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy concepto_grupos_delete on public.concepto_grupos for delete to authenticated using (public.es_admin());

create policy conceptos_select on public.conceptos for select to authenticated using (public.es_miembro(establecimiento_id));
create policy conceptos_insert on public.conceptos for insert to authenticated with check (public.es_admin());
create policy conceptos_update on public.conceptos for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy conceptos_delete on public.conceptos for delete to authenticated using (public.es_admin());

create policy titulares_select on public.titulares for select to authenticated using (public.es_miembro(establecimiento_id));
create policy titulares_insert on public.titulares for insert to authenticated with check (public.es_admin());
create policy titulares_update on public.titulares for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy titulares_delete on public.titulares for delete to authenticated using (public.es_admin());

revoke all on public.concepto_grupos, public.conceptos, public.titulares from anon, authenticated;
grant select, delete on public.concepto_grupos, public.conceptos, public.titulares to authenticated;
grant insert (establecimiento_id, nombre, orden, activo)           on public.concepto_grupos to authenticated;
grant update (nombre, orden, activo)                               on public.concepto_grupos to authenticated;
grant insert (establecimiento_id, nombre, tipo, grupo_id, activo)  on public.conceptos       to authenticated;
grant update (nombre, grupo_id, activo)                            on public.conceptos       to authenticated;
grant insert (establecimiento_id, nombre, activo)                  on public.titulares       to authenticated;
grant update (nombre, activo)                                      on public.titulares       to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Datos semilla de grupos y conceptos (por establecimiento)
-- ════════════════════════════════════════════════════════════════════════════

-- Copia los grupos y conceptos de base a un establecimiento. No hace nada si ya tiene alguno.
create function public._cargar_conceptos_base(p_establecimiento_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.concepto_grupos g where g.establecimiento_id = p_establecimiento_id)
     or exists (select 1 from public.conceptos c where c.establecimiento_id = p_establecimiento_id) then
    return;
  end if;

  insert into public.concepto_grupos (establecimiento_id, nombre, orden)
  select p_establecimiento_id, g.nombre, g.orden
  from (values ('Costos directos', 1), ('Estructura', 2), ('Impuestos y tasas', 3), ('Otros', 4)) as g(nombre, orden);

  -- Ingresos, sin grupo
  insert into public.conceptos (establecimiento_id, nombre, tipo)
  select p_establecimiento_id, c.nombre, 'ingreso'
  from unnest(array[
    'Venta de ganado vacuno', 'Venta de ganado ovino', 'Venta de lana', 'Arrendamiento forestal', 'Otros ingresos'
  ]) as c(nombre);

  -- Gastos, por grupo
  insert into public.conceptos (establecimiento_id, nombre, tipo, grupo_id)
  select p_establecimiento_id, c.nombre, 'egreso', g.id
  from (values
    ('Costos directos', 'Compra de ganado'), ('Costos directos', 'Sanidad'), ('Costos directos', 'Nutrición y suplementación'),
    ('Costos directos', 'Pasturas y verdeos'), ('Costos directos', 'Esquila'), ('Costos directos', 'Fletes'),
    ('Costos directos', 'Comisiones'),
    ('Estructura', 'Sueldos y cargas sociales'), ('Estructura', 'Alambrados e instalaciones'),
    ('Estructura', 'Mantenimiento y reparaciones'), ('Estructura', 'Combustible'),
    ('Estructura', 'Asesoramiento técnico y contable'), ('Estructura', 'Seguros'),
    ('Impuestos y tasas', 'Contribución inmobiliaria'), ('Impuestos y tasas', 'Tasas intendencia'),
    ('Impuestos y tasas', 'Otros impuestos'),
    ('Otros', 'Otros gastos')
  ) as c(grupo, nombre)
  join public.concepto_grupos g on g.establecimiento_id = p_establecimiento_id and g.nombre = c.grupo;
end;
$$;

revoke execute on function public._cargar_conceptos_base(uuid) from public, anon, authenticated;

-- Catálogo base de un establecimiento nuevo: igual que en 20261022000500_economia.sql, más los conceptos
create or replace function public._cargar_catalogos_base(p_establecimiento_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_vacunos uuid;
  v_ovinos  uuid;
begin
  insert into public.especies (establecimiento_id, nombre, grupo)
  values (p_establecimiento_id, 'Vacunos', 'bovino')
  returning id into v_vacunos;

  insert into public.especies (establecimiento_id, nombre, grupo)
  values (p_establecimiento_id, 'Ovinos', 'ovino')
  returning id into v_ovinos;

  -- Las crías (sin sexar, machos y hembras) van primero y con la marca de cría al pie
  insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden, cria_al_pie, sexo)
  select p_establecimiento_id, v_vacunos, c.nombre, c.orden, c.cria_al_pie, c.sexo
  from (values
    ('Terneros/as', 1, true, null), ('Terneros', 2, true, 'macho'), ('Terneras', 3, true, 'hembra'),
    ('Vaquillonas', 4, false, null), ('Novillos', 5, false, null), ('Vacas de cría', 6, false, null),
    ('Vacas de invernada o descarte', 7, false, null), ('Toros', 8, false, null)
  ) as c(nombre, orden, cria_al_pie, sexo);

  insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden, cria_al_pie, sexo)
  select p_establecimiento_id, v_ovinos, c.nombre, c.orden, c.cria_al_pie, c.sexo
  from (values
    ('Corderos/as', 1, true, null), ('Corderos', 2, true, 'macho'), ('Corderas', 3, true, 'hembra'),
    ('Borregos', 4, false, null), ('Borregas', 5, false, null), ('Ovejas de cría', 6, false, null),
    ('Ovejas de descarte', 7, false, null), ('Carneros', 8, false, null)
  ) as c(nombre, orden, cria_al_pie, sexo);

  insert into public.rubros (establecimiento_id, nombre)
  select p_establecimiento_id, r.nombre
  from unnest(array['Vacunos', 'Ovinos', 'Forestación tercerizada', 'General']) as r(nombre);

  -- Rubro por defecto de cada especie (compra y venta): el que se llama igual
  update public.especies s
  set rubro_id = r.id
  from public.rubros r
  where s.establecimiento_id = p_establecimiento_id and r.establecimiento_id = p_establecimiento_id and r.nombre = s.nombre;

  perform public._cargar_conceptos_base(p_establecimiento_id);
end;
$$;

revoke execute on function public._cargar_catalogos_base(uuid) from public, anon, authenticated;

-- Los establecimientos que ya existen: una sola vez
do $$
declare
  v_est uuid;
begin
  for v_est in select e.id from public.establecimientos e loop
    perform public._cargar_conceptos_base(v_est);
  end loop;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. movimientos_economicos: concepto y titular
-- ════════════════════════════════════════════════════════════════════════════

alter table public.movimientos_economicos
  add column concepto_id uuid,
  add column titular_id  uuid,
  add constraint movimientos_economicos_concepto_fkey
    foreign key (concepto_id, establecimiento_id) references public.conceptos (id, establecimiento_id) on delete restrict,
  add constraint movimientos_economicos_titular_fkey
    foreign key (titular_id, establecimiento_id) references public.titulares (id, establecimiento_id) on delete restrict,
  add constraint movimientos_economicos_id_establecimiento_key unique (id, establecimiento_id);

create index movimientos_economicos_concepto_idx on public.movimientos_economicos (concepto_id) where concepto_id is not null;
create index movimientos_economicos_titular_idx  on public.movimientos_economicos (titular_id)  where titular_id is not null;

-- Concepto por defecto de una compra (egreso) o una venta (ingreso), por su nombre: "Compra de
-- ganado"; "Venta de ganado vacuno" u "ovino" según el grupo de la especie. Null si no hay uno activo.
create function public._concepto_por_defecto(p_establecimiento_id uuid, p_sentido text, p_especie_id uuid) returns uuid
language sql
stable
set search_path = ''
as $$
  select c.id
  from public.conceptos c
  where c.establecimiento_id = p_establecimiento_id and c.activo and c.tipo = p_sentido
    and lower(c.nombre) = case
      when p_sentido = 'egreso' then 'compra de ganado'
      else case (select s.grupo from public.especies s where s.id = p_especie_id)
             when 'bovino' then 'venta de ganado vacuno'
             when 'ovino'  then 'venta de ganado ovino'
           end
    end
  limit 1;
$$;

revoke execute on function public._concepto_por_defecto(uuid, text, uuid) from public, anon, authenticated;

-- Compras y ventas ya cargadas
update public.movimientos_economicos m
set concepto_id = public._concepto_por_defecto(m.establecimiento_id, m.sentido, l.especie_id)
from public.actividades a
join public.lotes l on l.id = a.lote_id
where a.id = m.actividad_id and m.concepto_id is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Funciones de carga
-- ════════════════════════════════════════════════════════════════════════════

-- Compra y venta (interna): igual que en 20261022000500_economia.sql, más concepto, titular y vencimiento
create or replace function public._registrar_movimiento(
  p_establecimiento_id uuid, p_actividad_id uuid, p_lote_id uuid, p_especie_id uuid,
  p_fecha date, p_sentido text, p_concepto text, p_contraparte text, p_precio jsonb
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_monto    numeric;
  v_moneda   text := upper(btrim(coalesce(p_precio ->> 'moneda', '')));
  v_tc       numeric;
  v_estado   text := btrim(coalesce(p_precio ->> 'estado', ''));
  v_rubro    uuid;
  v_concepto uuid;
  v_titular  uuid;
  v_vence    date;
  v_id       uuid;
begin
  begin
    v_monto    := (p_precio ->> 'monto')::numeric;
    v_tc       := nullif(p_precio ->> 'tipo_cambio', '')::numeric;
    v_rubro    := nullif(p_precio ->> 'rubro_id', '')::uuid;
    v_concepto := nullif(p_precio ->> 'concepto_id', '')::uuid;
    v_titular  := nullif(p_precio ->> 'titular_id', '')::uuid;
    v_vence    := nullif(p_precio ->> 'vencimiento', '')::date;
  exception when others then
    raise exception 'El monto, el tipo de cambio y las fechas tienen que ser válidos' using errcode = '22023';
  end;

  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero' using errcode = '22023';
  end if;
  if v_moneda not in ('USD', 'UYU') then
    raise exception 'La moneda tiene que ser USD o UYU' using errcode = '22023';
  end if;
  if v_moneda = 'UYU' and (v_tc is null or v_tc <= 0) then
    raise exception 'Con pesos hay que cargar el tipo de cambio' using errcode = '22023';
  end if;
  if v_moneda = 'USD' and v_tc is not null then
    raise exception 'Con dólares no va tipo de cambio' using errcode = '22023';
  end if;
  if v_estado not in ('pagado', 'pendiente') then
    raise exception 'Indicá si está pagado o pendiente' using errcode = '22023';
  end if;
  if v_estado = 'pagado' then
    v_vence := null;
  elsif v_vence < p_fecha then
    raise exception 'La fecha prevista de cobro o pago no puede ser anterior a la de la actividad' using errcode = '22023';
  end if;

  if v_rubro is null then
    v_rubro := public._rubro_de_especie(p_establecimiento_id, p_especie_id);
    if v_rubro is null then
      raise exception 'Elegí el rubro del movimiento' using errcode = '22023';
    end if;
  elsif not exists (select 1 from public.rubros r where r.id = v_rubro and r.establecimiento_id = p_establecimiento_id) then
    raise exception 'El rubro no es de este establecimiento' using errcode = '22023';
  end if;

  if v_concepto is null then
    v_concepto := public._concepto_por_defecto(p_establecimiento_id, p_sentido, p_especie_id);
  elsif not exists (
    select 1 from public.conceptos c where c.id = v_concepto and c.establecimiento_id = p_establecimiento_id and c.tipo = p_sentido
  ) then
    raise exception 'El concepto no es de este establecimiento o no corresponde (ingreso o gasto)' using errcode = '22023';
  end if;

  if v_titular is not null and not exists (
    select 1 from public.titulares t where t.id = v_titular and t.establecimiento_id = p_establecimiento_id
  ) then
    raise exception 'El titular no es de este establecimiento' using errcode = '22023';
  end if;

  insert into public.movimientos_economicos (
    establecimiento_id, fecha, sentido, rubro_id, concepto, concepto_id, titular_id, contraparte, monto_original,
    moneda_original, tipo_cambio, actividad_id, lote_id, estado, fecha_pago, fecha_vencimiento
  ) values (
    p_establecimiento_id, p_fecha, p_sentido, v_rubro, p_concepto, v_concepto, v_titular,
    nullif(btrim(coalesce(p_contraparte, '')), ''), round(v_monto, 2), v_moneda, v_tc, p_actividad_id, p_lote_id, v_estado,
    nullif(p_precio ->> 'fecha_pago', '')::date, v_vence
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public._registrar_movimiento(uuid, uuid, uuid, uuid, date, text, text, text, jsonb) from public, anon, authenticated;

-- Carga manual de un ingreso o gasto: el concepto sale del catálogo (obligatorio); titular opcional.
-- Idempotente con p_id (es el id del movimiento).
drop function public.registrar_movimiento(uuid, uuid, date, text, uuid, text, jsonb, text, uuid);

create function public.registrar_movimiento(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_sentido            text,
  p_rubro_id           uuid,
  p_concepto_id        uuid,
  p_precio             jsonb,
  p_contraparte        text default null,
  p_lote_id            uuid default null,
  p_titular_id         uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov      public.movimientos_economicos;
  v          record;
  v_vence    date;
  v_concepto text;
begin
  if p_id is null then
    raise exception 'Falta el identificador del movimiento' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into v_mov from public.movimientos_economicos where id = p_id;
  if found then
    if v_mov.establecimiento_id is distinct from p_establecimiento_id or v_mov.created_by is distinct from auth.uid()
       or not public.puede_operar(v_mov.establecimiento_id) then
      raise exception 'Identificador de movimiento inválido' using errcode = '42501';
    end if;
    return p_id;
  end if;

  if p_establecimiento_id is null or not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de edición en este establecimiento' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if coalesce(p_sentido, '') not in ('ingreso', 'egreso') then
    raise exception 'Indicá si es un ingreso o un gasto' using errcode = '22023';
  end if;
  select c.nombre into v_concepto
  from public.conceptos c
  where c.id = p_concepto_id and c.establecimiento_id = p_establecimiento_id and c.activo and c.tipo = p_sentido;
  if v_concepto is null then
    raise exception 'Elegí un concepto activo de %', case p_sentido when 'ingreso' then 'ingreso' else 'gasto' end
      using errcode = '22023';
  end if;
  if p_rubro_id is null or not exists (
    select 1 from public.rubros r where r.id = p_rubro_id and r.establecimiento_id = p_establecimiento_id and r.activo
  ) then
    raise exception 'Elegí un rubro activo del establecimiento' using errcode = '22023';
  end if;
  if p_titular_id is not null and not exists (
    select 1 from public.titulares t where t.id = p_titular_id and t.establecimiento_id = p_establecimiento_id and t.activo
  ) then
    raise exception 'Elegí un titular activo del establecimiento' using errcode = '22023';
  end if;
  if p_lote_id is not null and not exists (
    select 1 from public.lotes l where l.id = p_lote_id and l.establecimiento_id = p_establecimiento_id
  ) then
    raise exception 'El lote no es de este establecimiento' using errcode = '22023';
  end if;

  select * into v from public._precio_valido(p_precio);
  if v.fecha_pago < p_fecha then
    raise exception 'La fecha de pago no puede ser anterior a la del movimiento' using errcode = '22023';
  end if;

  if v.estado = 'pendiente' then
    begin
      v_vence := nullif(p_precio ->> 'vencimiento', '')::date;
    exception when others then
      raise exception 'La fecha prevista de cobro o pago tiene que ser válida' using errcode = '22023';
    end;
    if v_vence < p_fecha then
      raise exception 'La fecha prevista de cobro o pago no puede ser anterior a la del movimiento' using errcode = '22023';
    end if;
  end if;

  insert into public.movimientos_economicos (
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, concepto_id, titular_id, contraparte, monto_original,
    moneda_original, tipo_cambio, lote_id, estado, fecha_pago, fecha_vencimiento, origen
  ) values (
    p_id, p_establecimiento_id, p_fecha, p_sentido, p_rubro_id, v_concepto, p_concepto_id, p_titular_id,
    nullif(btrim(coalesce(p_contraparte, '')), ''), v.monto, v.moneda, v.tipo_cambio, p_lote_id, v.estado, v.fecha_pago,
    v_vence, 'manual'
  );
  return p_id;
end;
$$;

revoke execute on function public.registrar_movimiento(uuid, uuid, date, text, uuid, uuid, jsonb, text, uuid, uuid) from public, anon;
grant  execute on function public.registrar_movimiento(uuid, uuid, date, text, uuid, uuid, jsonb, text, uuid, uuid) to authenticated;

-- El precio que faltó en una compra o una venta: igual que en 20261025000100, más concepto y titular
create or replace function public.cargar_precio_actividad(
  p_id           uuid,
  p_actividad_id uuid,
  p_precio       jsonb,
  p_rubro_id     uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov      public.movimientos_economicos;
  v_act      public.actividades;
  v_lote     public.lotes;
  v_rubro    uuid := p_rubro_id;
  v_total    int;
  v_contra   text;
  v          record;
  v_vence    date;
  v_sentido  text;
  v_concepto uuid;
  v_titular  uuid;
begin
  if p_id is null then
    raise exception 'Falta el identificador del movimiento' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into v_mov from public.movimientos_economicos where id = p_id;
  if found then
    if v_mov.actividad_id is distinct from p_actividad_id or v_mov.created_by is distinct from auth.uid()
       or not public.puede_operar(v_mov.establecimiento_id) then
      raise exception 'Identificador de movimiento inválido' using errcode = '42501';
    end if;
    return p_id;
  end if;

  select * into v_act from public.actividades where id = p_actividad_id for update;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Actividad inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_act.tipo not in ('compra', 'venta') then
    raise exception 'Solo las compras y las ventas llevan precio' using errcode = '22023';
  end if;
  if v_act.anulada_en is not null then
    raise exception 'La actividad está anulada' using errcode = '22023';
  end if;
  if exists (select 1 from public.movimientos_economicos m where m.actividad_id = v_act.id and m.anulado_en is null) then
    raise exception 'La actividad ya tiene precio: para cambiarlo, anulá ese movimiento y cargá otro' using errcode = '22023';
  end if;
  v_sentido := case v_act.tipo when 'compra' then 'egreso' else 'ingreso' end;

  select * into v_lote from public.lotes where id = v_act.lote_id;
  if v_rubro is null then
    v_rubro := public._rubro_de_especie(v_act.establecimiento_id, v_lote.especie_id);
  end if;
  if v_rubro is null or not exists (
    select 1 from public.rubros r where r.id = v_rubro and r.establecimiento_id = v_act.establecimiento_id
  ) then
    raise exception 'Elegí el rubro del movimiento' using errcode = '22023';
  end if;

  begin
    v_concepto := nullif(p_precio ->> 'concepto_id', '')::uuid;
    v_titular  := nullif(p_precio ->> 'titular_id', '')::uuid;
  exception when others then
    raise exception 'El concepto y el titular tienen que ser válidos' using errcode = '22023';
  end;
  if v_concepto is null then
    v_concepto := public._concepto_por_defecto(v_act.establecimiento_id, v_sentido, v_lote.especie_id);
  elsif not exists (
    select 1 from public.conceptos c
    where c.id = v_concepto and c.establecimiento_id = v_act.establecimiento_id and c.tipo = v_sentido and c.activo
  ) then
    raise exception 'Elegí un concepto activo de %', case v_sentido when 'ingreso' then 'ingreso' else 'gasto' end
      using errcode = '22023';
  end if;
  if v_titular is not null and not exists (
    select 1 from public.titulares t where t.id = v_titular and t.establecimiento_id = v_act.establecimiento_id and t.activo
  ) then
    raise exception 'Elegí un titular activo del establecimiento' using errcode = '22023';
  end if;

  select * into v from public._precio_valido(p_precio);
  if v.fecha_pago < v_act.fecha then
    raise exception 'La fecha de pago no puede ser anterior a la de la actividad' using errcode = '22023';
  end if;

  if v.estado = 'pendiente' then
    begin
      v_vence := nullif(p_precio ->> 'vencimiento', '')::date;
    exception when others then
      raise exception 'La fecha prevista de cobro o pago tiene que ser válida' using errcode = '22023';
    end;
    if v_vence < v_act.fecha then
      raise exception 'La fecha prevista de cobro o pago no puede ser anterior a la de la actividad' using errcode = '22023';
    end if;
  end if;

  select coalesce(sum(l.cabezas), 0) into v_total from public.actividad_lineas l where l.actividad_id = v_act.id;
  select cv.contraparte into v_contra from public.act_compraventa cv where cv.actividad_id = v_act.id;

  insert into public.movimientos_economicos (
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, concepto_id, titular_id, contraparte, monto_original,
    moneda_original, tipo_cambio, actividad_id, lote_id, estado, fecha_pago, fecha_vencimiento, origen
  ) values (
    p_id, v_act.establecimiento_id, v_act.fecha, v_sentido, v_rubro,
    case v_act.tipo when 'compra' then 'Compra' else 'Venta' end || ' de ' || v_total || ' cabezas (' || v_lote.nombre || ')',
    v_concepto, v_titular, v_contra, v.monto, v.moneda, v.tipo_cambio, v_act.id, v_act.lote_id, v.estado, v.fecha_pago,
    v_vence, 'manual'
  );
  return p_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Resultado por rubro, concepto, grupo y titular
-- ════════════════════════════════════════════════════════════════════════════
-- Devengado (por la fecha del movimiento), sin anulados. Un registro por mes, sentido y combinación
-- de dimensiones: la app suma por la que se elija. Sin concepto o sin titular: null.

create view public.v_resultado_detalle
with (security_invoker = true) as
select m.establecimiento_id, date_trunc('month', m.fecha)::date as mes, m.sentido,
       m.rubro_id, r.nombre as rubro,
       m.concepto_id, c.nombre as concepto,
       c.grupo_id, g.nombre as grupo,
       m.titular_id, t.nombre as titular,
       sum(m.monto_usd) as monto_usd
from public.movimientos_economicos m
join public.rubros r on r.id = m.rubro_id
left join public.conceptos c on c.id = m.concepto_id
left join public.concepto_grupos g on g.id = c.grupo_id
left join public.titulares t on t.id = m.titular_id
where m.anulado_en is null
group by m.establecimiento_id, date_trunc('month', m.fecha), m.sentido, m.rubro_id, r.nombre,
         m.concepto_id, c.nombre, c.grupo_id, g.nombre, m.titular_id, t.nombre;

revoke all    on public.v_resultado_detalle from anon, authenticated;
grant  select on public.v_resultado_detalle to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Archivos de un movimiento
-- ════════════════════════════════════════════════════════════════════════════

-- Un registro por objeto de Storage (bucket movimiento-archivos, ruta {establecimiento_id}/{id}).
-- Solo cambian los datos de quitar (ocultar); no se borra.
create table public.movimiento_archivos (
  id                 uuid primary key,   -- lo genera la app; también es el nombre del objeto en Storage
  movimiento_id      uuid not null,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  ruta               text not null unique,
  nombre             text not null check (btrim(nombre) <> '' and char_length(nombre) <= 255),   -- nombre original
  tipo_mime          text not null,
  tamano_bytes       bigint not null check (tamano_bytes > 0 and tamano_bytes <= 20971520),       -- 20 MB
  oculto             boolean not null default false,
  ocultado_por       uuid,   -- auditoría, sin FK
  ocultado_en        timestamptz,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (movimiento_id, establecimiento_id) references public.movimientos_economicos (id, establecimiento_id) on delete restrict,
  check (ruta = establecimiento_id::text || '/' || id::text),
  check (oculto = (ocultado_en is not null) and (ocultado_en is null) = (ocultado_por is null))
);

create index movimiento_archivos_movimiento_idx on public.movimiento_archivos (movimiento_id);

create function public.proteger_movimiento_archivo() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'Los archivos de un movimiento no se borran: se quitan (se ocultan)' using errcode = '42501';
  end if;
  if (new.id, new.movimiento_id, new.establecimiento_id, new.ruta, new.nombre, new.tipo_mime, new.tamano_bytes,
      new.created_by, new.created_at)
     is distinct from
     (old.id, old.movimiento_id, old.establecimiento_id, old.ruta, old.nombre, old.tipo_mime, old.tamano_bytes,
      old.created_by, old.created_at) then
    raise exception 'De un archivo solo se cambia si está quitado o no' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_movimiento_archivo() from public, anon, authenticated;

create trigger proteger before update or delete on public.movimiento_archivos
  for each row execute function public.proteger_movimiento_archivo();
create trigger sin_truncate before truncate on public.movimiento_archivos
  for each statement execute function public.bloquear_modificacion();

-- RLS: leen quienes pueden cargar (Consulta no ve plata); nadie escribe directo
alter table public.movimiento_archivos enable row level security;
create policy movimiento_archivos_select on public.movimiento_archivos
  for select to authenticated using (public.puede_operar(establecimiento_id));
revoke all on public.movimiento_archivos from anon, authenticated;
grant select on public.movimiento_archivos to authenticated;

-- Bucket privado, mismos formatos y tamaño que el de los lotes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('movimiento-archivos', 'movimiento-archivos', false, 20971520, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Subir: ruta {establecimiento_id}/{uuid}, donde el usuario puede cargar
create policy movimiento_archivos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'movimiento-archivos'
    and case
          when array_length(storage.foldername(name), 1) = 1
               and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.puede_operar(((storage.foldername(name))[1])::uuid)
          else false
        end
  );

-- Leer (y firmar URLs de descarga): quienes pueden cargar en el establecimiento de la carpeta
create policy movimiento_archivos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'movimiento-archivos'
    and case
          when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.puede_operar(((storage.foldername(name))[1])::uuid)
          else false
        end
  );

-- Adjuntar un archivo ya subido ({establecimiento_id}/{p_archivo_id}) a un movimiento no anulado.
-- Tamaño y tipo salen del objeto en Storage. Idempotente: un reintento devuelve el ya registrado.
create function public.adjuntar_archivo_movimiento(
  p_archivo_id    uuid,
  p_movimiento_id uuid,
  p_nombre        text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov     public.movimientos_economicos;
  v_archivo public.movimiento_archivos;
  v_ruta    text;
  v_meta    jsonb;
  v_tamano  bigint;
  v_mime    text;
begin
  if p_archivo_id is null then
    raise exception 'Falta el identificador del archivo' using errcode = '22023';
  end if;
  select * into v_mov from public.movimientos_economicos where id = p_movimiento_id for update;
  if not found or not public.puede_operar(v_mov.establecimiento_id) then
    raise exception 'Movimiento inexistente o sin permiso de carga' using errcode = '42501';
  end if;

  select * into v_archivo from public.movimiento_archivos where id = p_archivo_id;
  if found then
    if v_archivo.movimiento_id <> v_mov.id then
      raise exception 'Archivo inexistente o de otro movimiento' using errcode = '42501';
    end if;
    return p_archivo_id;
  end if;

  if v_mov.anulado_en is not null then
    raise exception 'El movimiento está anulado: no se le agregan archivos' using errcode = '22023';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' or char_length(p_nombre) > 255 then
    raise exception 'El archivo necesita un nombre (hasta 255 caracteres)' using errcode = '22023';
  end if;

  v_ruta := v_mov.establecimiento_id::text || '/' || p_archivo_id::text;
  select o.metadata into v_meta
  from storage.objects o
  where o.bucket_id = 'movimiento-archivos' and o.name = v_ruta;
  if not found then
    raise exception 'El archivo no está subido (o la subida no terminó)' using errcode = '22023';
  end if;

  v_tamano := nullif(v_meta ->> 'size', '')::bigint;
  v_mime := lower(coalesce(v_meta ->> 'mimetype', ''));
  if v_tamano is null or v_tamano <= 0 then
    raise exception 'El archivo está vacío' using errcode = '22023';
  end if;
  if v_tamano > 20971520 then
    raise exception 'El archivo supera los 20 MB' using errcode = '22023';
  end if;
  if not public._archivo_permitido(p_nombre, v_mime) then
    raise exception 'Formato no permitido: PDF, Word, Excel, CSV, texto, PowerPoint o imágenes (JPG, PNG, WEBP, HEIC)'
      using errcode = '22023';
  end if;

  insert into public.movimiento_archivos (id, movimiento_id, establecimiento_id, ruta, nombre, tipo_mime, tamano_bytes)
  values (p_archivo_id, v_mov.id, v_mov.establecimiento_id, v_ruta, btrim(p_nombre), v_mime, v_tamano);
  return p_archivo_id;
end;
$$;

-- Quitar (ocultar) un archivo de un movimiento: quien puede cargar. El objeto queda en Storage.
create function public.quitar_archivo_movimiento(p_archivo_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archivo public.movimiento_archivos;
begin
  select * into v_archivo from public.movimiento_archivos where id = p_archivo_id for update;
  if not found or not public.puede_operar(v_archivo.establecimiento_id) then
    raise exception 'Archivo inexistente o sin permiso de carga' using errcode = '42501';
  end if;
  if v_archivo.oculto then
    raise exception 'El archivo ya está quitado' using errcode = '22023';
  end if;
  update public.movimiento_archivos
  set oculto = true, ocultado_por = auth.uid(), ocultado_en = now()
  where id = p_archivo_id;
end;
$$;

revoke execute on function public.adjuntar_archivo_movimiento(uuid, uuid, text) from public, anon;
revoke execute on function public.quitar_archivo_movimiento(uuid)             from public, anon;
grant  execute on function public.adjuntar_archivo_movimiento(uuid, uuid, text) to authenticated;
grant  execute on function public.quitar_archivo_movimiento(uuid)             to authenticated;

commit;
