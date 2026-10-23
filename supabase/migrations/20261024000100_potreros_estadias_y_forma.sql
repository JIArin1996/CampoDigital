-- Campo Digital v2 — Potreros: estadías de los lotes (historial de potrero) y forma para el mapa
--
-- Diseño aprobado el 2026-10-23 (paso 1 del rediseño de Potreros, decisiones D1 a D5).
--
--   1. Extensiones postgis y btree_gist, en el esquema extensions.
--   2. potreros.forma: MultiPolygon en WGS84 (4326), opcional ("sin dibujar"), con índice GIST.
--   3. lote_estadias: en qué potrero estuvo cada lote y entre qué fechas. Es la fuente de verdad.
--        * Estadía abierta = sin fecha de salida. Una sola abierta por lote.
--        * Sin superposiciones entre las estadías vigentes de un lote (el día de salida no cuenta:
--          salir de un potrero y entrar a otro el mismo día no choca).
--        * Una estadía de cero días solo existe si la cerró el cierre del lote (lote que se abre y
--          se cierra el mismo día). Una cargada a mano dura al menos un día.
--        * No se borran: un cambio mal cargado se deshace (la estadía queda anulada).
--   4. lotes.potrero_id queda como copia derivada: el usuario ya no lo puede cambiar con un UPDATE,
--      y un trigger lo mantiene igual al potrero de la estadía abierta. En un lote cerrado conserva
--      el potrero en el que estaba al cerrarse (las pantallas de lotes cerrados lo siguen mostrando).
--   5. Triggers sobre lotes (las seis funciones que crean lotes no cambian):
--        * alta de un lote con potrero → estadía abierta desde la apertura (origen "alta");
--        * cierre (cerrar_lote, o dividir, unir, destete y anulaciones que lo vacían) → cierra la
--          estadía abierta con la fecha del cierre;
--        * reapertura por una anulación (anular_actividad) → reabre la MISMA estadía que cerró el
--          cierre, porque es deshacer. Si el potrero quedó inactivo, el lote queda sin potrero.
--   6. reabrir_lote (reapertura manual) → estadía NUEVA desde la fecha de reapertura, en el mismo
--      potrero si sigue activo (origen "reapertura"). La vieja queda cerrada: el período en que el
--      lote estuvo cerrado no cuenta como ocupación. Los dos caminos se distinguen porque
--      reabrir_lote marca la transacción (campo.reapertura_manual) antes de reabrir.
--   7. cambiar_potrero_lote y deshacer_cambio_potrero (administrador y operador).
--   8. Un potrero con lotes adentro no se desactiva.
--   9. guardar_forma_potrero, v_potreros_mapa y potreros_superpuestos (aviso, no bloqueo).
--  10. Datos existentes: cada lote con potrero recibe su estadía desde la apertura (origen "migracion").
--
-- Auditoría: 88 funciones (+10) y 13 filas de permisos de columna (lotes UPDATE pierde potrero_id).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Extensiones
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Forma del potrero
-- ════════════════════════════════════════════════════════════════════════════
-- Sin permiso de columna: se escribe solo con guardar_forma_potrero, que la valida.

alter table public.potreros add column forma extensions.geometry(MultiPolygon, 4326);
create index potreros_forma_idx on public.potreros using gist (forma);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Estadías de los lotes en los potreros
-- ════════════════════════════════════════════════════════════════════════════

create table public.lote_estadias (
  id                    uuid primary key default gen_random_uuid(),
  establecimiento_id    uuid not null references public.establecimientos (id) on delete restrict,
  lote_id               uuid not null,
  potrero_id            uuid not null,
  fecha_ingreso         date not null,
  fecha_salida          date,                 -- vacía = el lote sigue en el potrero
  origen                text not null check (origen in ('alta', 'manual', 'reapertura', 'migracion')),
  motivo                text,                 -- del ingreso
  cerrada_por           text check (cerrada_por in ('cambio', 'cierre')),
  motivo_salida         text,
  salida_registrada_en  timestamptz,
  salida_registrada_por uuid,
  estadia_anterior_id   uuid,                 -- la que cerró el mismo cambio (para deshacerlo)
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  anulada_en            timestamptz,
  anulada_por           uuid,
  motivo_anulacion      text,
  foreign key (lote_id, establecimiento_id)
    references public.lotes (id, establecimiento_id) on delete restrict,
  foreign key (potrero_id, establecimiento_id)
    references public.potreros (id, establecimiento_id) on delete restrict,
  foreign key (estadia_anterior_id, establecimiento_id)
    references public.lote_estadias (id, establecimiento_id) on delete restrict,
  unique (id, establecimiento_id),
  constraint lote_estadias_salida_completa check (
    (fecha_salida is null) = (cerrada_por is null) and (fecha_salida is null) = (salida_registrada_en is null)),
  constraint lote_estadias_fechas check (
    fecha_salida is null or fecha_salida > fecha_ingreso or (fecha_salida = fecha_ingreso and cerrada_por = 'cierre')),
  constraint lote_estadias_anulacion check ((anulada_en is null) = (motivo_anulacion is null)),
  constraint lote_estadias_sin_superposicion exclude using gist (
    lote_id with =, daterange(fecha_ingreso, fecha_salida, '[)') with &&
  ) where (anulada_en is null)
);

create unique index lote_estadias_una_abierta on public.lote_estadias (lote_id)
  where fecha_salida is null and anulada_en is null;
create index lote_estadias_potrero_idx on public.lote_estadias (potrero_id, fecha_ingreso);

create trigger sin_borrado before delete on public.lote_estadias
  for each row execute function public.bloquear_borrado();
create trigger sin_truncate before truncate on public.lote_estadias
  for each statement execute function public.bloquear_borrado();

-- RLS: leen los miembros (consulta incluido); nadie escribe directo (solo funciones y triggers)
alter table public.lote_estadias enable row level security;
create policy lote_estadias_select on public.lote_estadias
  for select to authenticated using (public.es_miembro(establecimiento_id));
revoke all on public.lote_estadias from anon, authenticated;
grant select on public.lote_estadias to authenticated;

-- ── Validación de cada estadía ──────────────────────────────────────────────
-- Fechas dentro de la vida del lote y no futuras; potrero activo al entrar o al reabrir
-- (salvo la migración, que copia lo que ya había). Lo que identifica a una estadía no cambia.
create function public.validar_estadia() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if tg_op = 'UPDATE' and (new.lote_id, new.potrero_id, new.fecha_ingreso, new.origen, new.establecimiento_id)
                          is distinct from (old.lote_id, old.potrero_id, old.fecha_ingreso, old.origen, old.establecimiento_id) then
    raise exception 'Una estadía no cambia de lote, potrero ni fecha de ingreso: se deshace y se carga de nuevo' using errcode = '22023';
  end if;

  select * into v_lote from public.lotes where id = new.lote_id;
  if new.fecha_ingreso < v_lote.fecha_apertura then
    raise exception 'El ingreso al potrero no puede ser anterior a la apertura del lote (%)', to_char(v_lote.fecha_apertura, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  if new.fecha_ingreso > public.fecha_hoy() or new.fecha_salida > public.fecha_hoy() then
    raise exception 'Las fechas de potrero no pueden ser futuras' using errcode = '22023';
  end if;

  if (tg_op = 'INSERT' and new.origen <> 'migracion')
     or (tg_op = 'UPDATE' and old.fecha_salida is not null and new.fecha_salida is null and new.anulada_en is null) then
    if not exists (select 1 from public.potreros p where p.id = new.potrero_id and p.estado = 'activo') then
      raise exception 'El potrero % está inactivo', (select p.nombre from public.potreros p where p.id = new.potrero_id)
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger validar_estadia before insert or update on public.lote_estadias
  for each row execute function public.validar_estadia();

-- ── lotes.potrero_id derivado de las estadías ───────────────────────────────
-- Activo: el potrero de la estadía abierta (o ninguno). Cerrado: el de la estadía que cerró el cierre.
create function public._sincronizar_potrero_lote(p_lote_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lote    public.lotes;
  v_potrero uuid;
begin
  select * into v_lote from public.lotes where id = p_lote_id;
  if v_lote.estado = 'activo' then
    select e.potrero_id into v_potrero from public.lote_estadias e
    where e.lote_id = p_lote_id and e.fecha_salida is null and e.anulada_en is null;
  else
    select e.potrero_id into v_potrero from public.lote_estadias e
    where e.lote_id = p_lote_id and e.cerrada_por = 'cierre' and e.fecha_salida = v_lote.fecha_cierre and e.anulada_en is null
    order by e.salida_registrada_en desc limit 1;
  end if;

  update public.lotes set potrero_id = v_potrero
  where id = p_lote_id and potrero_id is distinct from v_potrero;
end;
$$;

create function public.sincronizar_potrero_lote() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._sincronizar_potrero_lote(new.lote_id);
  return null;
end;
$$;

create trigger sincronizar_potrero_lote after insert or update on public.lote_estadias
  for each row execute function public.sincronizar_potrero_lote();

-- El potrero de un lote solo cambia por las estadías
revoke update (potrero_id) on public.lotes from authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Triggers sobre lotes: alta, cierre y reapertura
-- ════════════════════════════════════════════════════════════════════════════

-- Alta con potrero (crear_lote, dividir, unir a un lote nuevo, compra, parición y destete a lotes nuevos)
create function public.estadia_alta_lote() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lote_estadias (establecimiento_id, lote_id, potrero_id, fecha_ingreso, origen)
  values (new.establecimiento_id, new.id, new.potrero_id, new.fecha_apertura, 'alta');
  return null;
end;
$$;

create trigger estadia_alta_lote after insert on public.lotes
  for each row when (new.potrero_id is not null) execute function public.estadia_alta_lote();

-- Cierre: cierra la estadía abierta con la fecha del cierre.
-- Reapertura por anulación: reabre la estadía que cerró ese cierre (si el potrero sigue activo).
-- Reapertura manual (reabrir_lote marca la transacción): la estadía nueva la abre reabrir_lote.
create function public.estadia_cambio_estado_lote() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estadia public.lote_estadias;
begin
  if new.estado = 'cerrado' then
    select * into v_estadia from public.lote_estadias e
    where e.lote_id = new.id and e.fecha_salida is null and e.anulada_en is null;
    if v_estadia.id is not null then
      if new.fecha_cierre < v_estadia.fecha_ingreso then
        raise exception 'El lote entró a su potrero actual el %: la fecha de cierre no puede ser anterior',
          to_char(v_estadia.fecha_ingreso, 'DD/MM/YYYY') using errcode = '22023';
      end if;
      update public.lote_estadias
      set fecha_salida = new.fecha_cierre, cerrada_por = 'cierre',
          salida_registrada_en = clock_timestamp(), salida_registrada_por = auth.uid()
      where id = v_estadia.id;
    end if;

  elsif coalesce(current_setting('campo.reapertura_manual', true), '') <> 'si' then
    select * into v_estadia from public.lote_estadias e
    where e.lote_id = new.id and e.cerrada_por = 'cierre' and e.fecha_salida = old.fecha_cierre and e.anulada_en is null
    order by e.salida_registrada_en desc limit 1;
    if v_estadia.id is not null
       and exists (select 1 from public.potreros p where p.id = v_estadia.potrero_id and p.estado = 'activo') then
      update public.lote_estadias
      set fecha_salida = null, cerrada_por = null, motivo_salida = null,
          salida_registrada_en = null, salida_registrada_por = null
      where id = v_estadia.id;
    end if;
  end if;

  perform public._sincronizar_potrero_lote(new.id);
  return null;
end;
$$;

create trigger estadia_cambio_estado_lote after update of estado on public.lotes
  for each row when (old.estado is distinct from new.estado) execute function public.estadia_cambio_estado_lote();

-- Reapertura manual: igual que antes, más la estadía nueva desde la fecha de reapertura
create or replace function public.reabrir_lote(
  p_lote_id uuid,
  p_fecha   date,
  p_motivo  text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote    public.lotes;
  v_estadia public.lote_estadias;
begin
  v_lote := public._bloquear_lote_editable(p_lote_id);

  if v_lote.estado <> 'cerrado' then
    raise exception 'El lote no está cerrado' using errcode = '22023';
  end if;

  if p_fecha is null or p_fecha > public.fecha_hoy() or p_fecha < v_lote.fecha_cierre then
    raise exception 'La fecha de reapertura tiene que estar entre el cierre del lote y hoy' using errcode = '22023';
  end if;

  -- El potrero en el que estaba al cerrarse
  select * into v_estadia from public.lote_estadias e
  where e.lote_id = v_lote.id and e.cerrada_por = 'cierre' and e.fecha_salida = v_lote.fecha_cierre and e.anulada_en is null
  order by e.salida_registrada_en desc limit 1;

  perform set_config('campo.reapertura_manual', 'si', true);
  update public.lotes
  set estado = 'activo', fecha_cierre = null
  where id = v_lote.id;
  perform set_config('campo.reapertura_manual', '', true);

  insert into public.lote_cambios_estado (establecimiento_id, lote_id, tipo, fecha, motivo)
  values (v_lote.establecimiento_id, v_lote.id, 'reapertura', p_fecha, p_motivo);

  if v_estadia.id is not null
     and exists (select 1 from public.potreros p where p.id = v_estadia.potrero_id and p.estado = 'activo') then
    insert into public.lote_estadias (establecimiento_id, lote_id, potrero_id, fecha_ingreso, origen, motivo, created_at)
    values (v_lote.establecimiento_id, v_lote.id, v_estadia.potrero_id, p_fecha, 'reapertura', p_motivo, clock_timestamp());
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Cambiar de potrero y deshacer el último cambio
-- ════════════════════════════════════════════════════════════════════════════

-- Saca al lote de su potrero (fecha de salida) y lo entra a otro (fecha de ingreso), o lo deja sin
-- potrero (p_potrero_id null). Las dos fechas pueden ser distintas: los días entre una y otra el
-- lote estuvo sin potrero (corral, camión, etc.). Devuelve el id de la estadía nueva (o null).
create function public.cambiar_potrero_lote(
  p_lote_id       uuid,
  p_potrero_id    uuid,
  p_fecha_salida  date default null,   -- obligatoria si el lote está en un potrero
  p_fecha_ingreso date default null,   -- obligatoria si va a un potrero
  p_motivo        text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote    public.lotes;
  v_abierta public.lote_estadias;
  v_ultima  public.lote_estadias;
  v_potrero public.potreros;
  v_hoy     date := public.fecha_hoy();
  v_motivo  text := nullif(btrim(p_motivo), '');
  v_nueva   uuid;
begin
  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado: reabrilo para cambiarlo de potrero' using errcode = '22023';
  end if;

  select * into v_abierta from public.lote_estadias e
  where e.lote_id = v_lote.id and e.fecha_salida is null and e.anulada_en is null;

  if v_abierta.id is null and p_potrero_id is null then
    raise exception 'El lote ya está sin potrero' using errcode = '22023';
  end if;
  if v_abierta.potrero_id = p_potrero_id then
    raise exception 'El lote ya está en ese potrero' using errcode = '22023';
  end if;

  if p_potrero_id is not null then
    select * into v_potrero from public.potreros p
    where p.id = p_potrero_id and p.establecimiento_id = v_lote.establecimiento_id;
    if v_potrero.id is null then
      raise exception 'Potrero inexistente o de otro establecimiento' using errcode = '22023';
    end if;
    if v_potrero.estado <> 'activo' then
      raise exception 'El potrero % está inactivo', v_potrero.nombre using errcode = '22023';
    end if;
    if p_fecha_ingreso is null or p_fecha_ingreso > v_hoy or p_fecha_ingreso < v_lote.fecha_apertura then
      raise exception 'La fecha de ingreso tiene que estar entre la apertura del lote (%) y hoy',
        to_char(v_lote.fecha_apertura, 'DD/MM/YYYY') using errcode = '22023';
    end if;
  end if;

  if v_abierta.id is not null then
    if p_fecha_salida is null or p_fecha_salida > v_hoy or p_fecha_salida <= v_abierta.fecha_ingreso then
      raise exception 'La fecha de salida tiene que ser posterior al ingreso al potrero actual (%) y no puede ser futura',
        to_char(v_abierta.fecha_ingreso, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    if p_potrero_id is not null and p_fecha_ingreso < p_fecha_salida then
      raise exception 'La fecha de ingreso no puede ser anterior a la de salida' using errcode = '22023';
    end if;
    update public.lote_estadias
    set fecha_salida = p_fecha_salida, cerrada_por = 'cambio', motivo_salida = v_motivo,
        salida_registrada_en = clock_timestamp(), salida_registrada_por = auth.uid()
    where id = v_abierta.id;
  else
    -- Estaba sin potrero: el ingreso no puede pisar la última estadía
    select * into v_ultima from public.lote_estadias e
    where e.lote_id = v_lote.id and e.anulada_en is null
    order by e.fecha_ingreso desc limit 1;
    if v_ultima.id is not null and p_fecha_ingreso < v_ultima.fecha_salida then
      raise exception 'El lote estuvo en otro potrero hasta el %: la fecha de ingreso no puede ser anterior',
        to_char(v_ultima.fecha_salida, 'DD/MM/YYYY') using errcode = '22023';
    end if;
  end if;

  if p_potrero_id is not null then
    insert into public.lote_estadias (establecimiento_id, lote_id, potrero_id, fecha_ingreso, origen, motivo, estadia_anterior_id, created_at)
    values (v_lote.establecimiento_id, v_lote.id, p_potrero_id, p_fecha_ingreso, 'manual', v_motivo, v_abierta.id, clock_timestamp())
    returning id into v_nueva;
  end if;

  return v_nueva;
end;
$$;

-- Deshace el último cambio de potrero del lote: anula la estadía que abrió y reabre la que cerró.
-- Solo cambios hechos con cambiar_potrero_lote (no el alta, la reapertura ni la migración).
create function public.deshacer_cambio_potrero(p_lote_id uuid, p_motivo text default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote     public.lotes;
  v_abierta  public.lote_estadias;
  v_cerrada  public.lote_estadias;
  v_reabrir  uuid;
  v_motivo   text := coalesce(nullif(btrim(p_motivo), ''), 'Cambio de potrero deshecho');
begin
  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado: reabrilo para cambiarlo de potrero' using errcode = '22023';
  end if;

  select * into v_abierta from public.lote_estadias e
  where e.lote_id = v_lote.id and e.fecha_salida is null and e.anulada_en is null;
  -- La última salida por un cambio (vigente). Las horas son de reloj (clock_timestamp): dos cambios
  -- seguidos en la misma transacción no empatan.
  select * into v_cerrada from public.lote_estadias e
  where e.lote_id = v_lote.id and e.cerrada_por = 'cambio' and e.anulada_en is null
  order by e.salida_registrada_en desc limit 1;

  if v_abierta.id is not null and v_abierta.origen = 'manual'
     and (v_cerrada.id is null or v_abierta.created_at >= v_cerrada.salida_registrada_en) then
    -- El último cambio fue una entrada: se anula, y si cerró otra estadía, esa se reabre
    update public.lote_estadias
    set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = v_motivo
    where id = v_abierta.id;
    v_reabrir := v_abierta.estadia_anterior_id;
  elsif v_abierta.id is null and v_cerrada.id is not null then
    -- El último cambio fue una salida a "sin potrero": se reabre
    v_reabrir := v_cerrada.id;
  else
    raise exception 'No hay un cambio de potrero para deshacer' using errcode = '22023';
  end if;

  if v_reabrir is not null then
    update public.lote_estadias
    set fecha_salida = null, cerrada_por = null, motivo_salida = null,
        salida_registrada_en = null, salida_registrada_por = null
    where id = v_reabrir;
  end if;
end;
$$;

revoke execute on function public.cambiar_potrero_lote(uuid, uuid, date, date, text) from public, anon;
revoke execute on function public.deshacer_cambio_potrero(uuid, text)                from public, anon;
grant  execute on function public.cambiar_potrero_lote(uuid, uuid, date, date, text) to authenticated;
grant  execute on function public.deshacer_cambio_potrero(uuid, text)                to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Un potrero con lotes adentro no se desactiva
-- ════════════════════════════════════════════════════════════════════════════

create function public.proteger_potrero_ocupado() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lotes text;
begin
  select string_agg(l.nombre, ', ' order by l.nombre) into v_lotes
  from public.lote_estadias e
  join public.lotes l on l.id = e.lote_id
  where e.potrero_id = new.id and e.fecha_salida is null and e.anulada_en is null;

  if v_lotes is not null then
    raise exception 'El potrero % tiene lotes adentro (%): primero movelos a otro potrero', new.nombre, v_lotes
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger proteger_potrero_ocupado before update of estado on public.potreros
  for each row when (old.estado = 'activo' and new.estado = 'inactivo') execute function public.proteger_potrero_ocupado();

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Forma del potrero: guardar, leer y superposiciones
-- ════════════════════════════════════════════════════════════════════════════

-- Guarda (o borra, con p_forma null) la forma de un potrero. p_forma es una geometría GeoJSON
-- (Polygon o MultiPolygon, en grados). Se corrige si es inválida y se devuelve el área geodésica
-- en hectáreas. Con p_actualizar_superficie, la superficie del potrero pasa a ser esa área.
create function public.guardar_forma_potrero(
  p_potrero_id             uuid,
  p_forma                  jsonb,
  p_actualizar_superficie  boolean default false
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_potrero public.potreros;
  v_geom    extensions.geometry;
  v_ha      numeric;
begin
  select * into v_potrero from public.potreros where id = p_potrero_id for update;
  if v_potrero.id is null or not public.puede_operar(v_potrero.establecimiento_id) then
    raise exception 'Potrero inexistente o sin permiso de edición' using errcode = '42501';
  end if;

  if p_forma is null then
    update public.potreros set forma = null where id = v_potrero.id;
    return null;
  end if;

  begin
    v_geom := extensions.st_setsrid(extensions.st_force2d(extensions.st_geomfromgeojson(p_forma::text)), 4326);
  exception when others then
    raise exception 'La forma no es una geometría GeoJSON válida' using errcode = '22023';
  end;

  v_geom := extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(v_geom), 3));
  if extensions.st_isempty(v_geom) then
    raise exception 'La forma tiene que ser un polígono' using errcode = '22023';
  end if;
  if extensions.st_xmin(v_geom) < -180 or extensions.st_xmax(v_geom) > 180
     or extensions.st_ymin(v_geom) < -90 or extensions.st_ymax(v_geom) > 90 then
    raise exception 'Las coordenadas tienen que estar en grados (longitud y latitud)' using errcode = '22023';
  end if;

  v_ha := round((extensions.st_area(v_geom::extensions.geography) / 10000)::numeric, 2);
  if v_ha <= 0 then
    raise exception 'La forma es demasiado chica' using errcode = '22023';
  end if;

  update public.potreros
  set forma = v_geom,
      superficie = case when p_actualizar_superficie then v_ha else superficie end
  where id = v_potrero.id;

  return v_ha;
end;
$$;

revoke execute on function public.guardar_forma_potrero(uuid, jsonb, boolean) from public, anon;
grant  execute on function public.guardar_forma_potrero(uuid, jsonb, boolean) to authenticated;

-- Potreros para el mapa: la forma como GeoJSON, el área geodésica y un punto adentro para la etiqueta
create view public.v_potreros_mapa
with (security_invoker = true) as
select p.id, p.establecimiento_id, p.nombre, p.superficie, p.uso_actual, p.tipo_pastura, p.aguada, p.sombra,
       p.estado, p.observaciones,
       extensions.st_asgeojson(p.forma, 7)::jsonb as forma,
       round((extensions.st_area(p.forma::extensions.geography) / 10000)::numeric, 2) as area_ha,
       extensions.st_asgeojson(extensions.st_pointonsurface(p.forma), 7)::jsonb as etiqueta
from public.potreros p;

revoke all    on public.v_potreros_mapa from anon, authenticated;
grant  select on public.v_potreros_mapa to authenticated;

-- Pares de potreros activos que se superponen en más de 100 m² (que compartan un alambrado no cuenta).
-- Es un aviso: no impide guardar.
create function public.potreros_superpuestos(p_establecimiento_id uuid)
returns table (potrero_a uuid, potrero_b uuid, hectareas numeric)
language sql
stable
set search_path = ''
as $$
  select a.id, b.id, round((extensions.st_area(extensions.st_intersection(a.forma, b.forma)::extensions.geography) / 10000)::numeric, 2)
  from public.potreros a
  join public.potreros b on b.establecimiento_id = a.establecimiento_id and a.id < b.id
  where a.establecimiento_id = p_establecimiento_id
    and a.estado = 'activo' and b.estado = 'activo'
    and a.forma is not null and b.forma is not null
    and extensions.st_intersects(a.forma, b.forma)
    and extensions.st_area(extensions.st_intersection(a.forma, b.forma)::extensions.geography) > 100
$$;

revoke execute on function public.potreros_superpuestos(uuid) from public, anon;
grant  execute on function public.potreros_superpuestos(uuid) to authenticated;

-- Internas y de trigger: nadie las ejecuta por la API
revoke execute on function public.validar_estadia()                 from public, anon, authenticated;
revoke execute on function public._sincronizar_potrero_lote(uuid)   from public, anon, authenticated;
revoke execute on function public.sincronizar_potrero_lote()        from public, anon, authenticated;
revoke execute on function public.estadia_alta_lote()               from public, anon, authenticated;
revoke execute on function public.estadia_cambio_estado_lote()      from public, anon, authenticated;
revoke execute on function public.proteger_potrero_ocupado()        from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Datos existentes
-- ════════════════════════════════════════════════════════════════════════════
-- La apertura del lote es la única fecha que había: es la mejor aproximación del ingreso.
-- Activos: estadía abierta. Cerrados: estadía entre la apertura y el cierre.

insert into public.lote_estadias (establecimiento_id, lote_id, potrero_id, fecha_ingreso, fecha_salida, origen,
                                  cerrada_por, salida_registrada_en, created_by)
select l.establecimiento_id, l.id, l.potrero_id, l.fecha_apertura, l.fecha_cierre, 'migracion',
       case when l.estado = 'cerrado' then 'cierre' end,
       case when l.estado = 'cerrado' then now() end,
       null
from public.lotes l
where l.potrero_id is not null;

commit;
