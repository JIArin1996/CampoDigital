-- Campo Digital v2 — Economía (Etapa 7b)
--
-- Diseño: contexto/DISENO-BASE-ETAPA-7.md, sección 3 y 5, aprobado el 2026-10-22 (B2, B3, B5 y pedidos).
--
--   1. movimientos_economicos:
--      * origen ('actividad' o 'manual'). Los existentes y los que crean compra y venta: 'actividad'.
--        Los cargados a mano (también el precio cargado después a una compra o venta): 'manual'.
--      * Un solo movimiento vigente por actividad: índice único parcial (además de la validación).
--      * Lectura solo para quien puede cargar (administrador y operador): Consulta no ve plata [B5].
--        act_compraventa no tiene columnas de dinero; v_actividades.monto_usd sale de esta tabla, así
--        que para Consulta queda vacío.
--   2. especies.rubro_id: rubro por defecto de compra y venta, en lugar de buscar uno con el mismo
--      nombre (se completa con esa regla; si queda vacío, se sigue usando como respaldo).
--   3. Funciones: registrar_movimiento (carga manual), cargar_precio_actividad (el precio que faltó),
--      marcar_pagado, anular_movimiento (solo los manuales). Internas: _precio_valido, _rubro_de_especie.
--      _registrar_movimiento y _cargar_catalogos_base cambian solo en el rubro por defecto.
--   4. Vistas (security_invoker): v_resultado_rubro (devengado, por mes), v_movimientos_pendientes y
--      v_compraventas_sin_precio.
--
-- Auditoría: 75 funciones (+6). Permisos de columna: especies suma rubro_id en INSERT y UPDATE.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. movimientos_economicos: origen, uno vigente por actividad y lectura
-- ════════════════════════════════════════════════════════════════════════════

alter table public.movimientos_economicos
  add column origen text not null default 'actividad' check (origen in ('actividad', 'manual'));

create unique index movimientos_economicos_actividad_vigente_uniq
  on public.movimientos_economicos (actividad_id)
  where actividad_id is not null and anulado_en is null;

drop policy movimientos_economicos_select on public.movimientos_economicos;
create policy movimientos_economicos_select on public.movimientos_economicos
  for select to authenticated using (public.puede_operar(establecimiento_id));

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Rubro por defecto de cada especie
-- ════════════════════════════════════════════════════════════════════════════

alter table public.especies add column rubro_id uuid;
alter table public.especies
  add constraint especies_rubro_fkey foreign key (rubro_id, establecimiento_id)
  references public.rubros (id, establecimiento_id) on delete restrict;

-- Lo elige el administrador (las políticas de especies ya son solo para él)
grant insert (rubro_id) on public.especies to authenticated;
grant update (rubro_id) on public.especies to authenticated;

update public.especies s
set rubro_id = r.id
from public.rubros r
where r.establecimiento_id = s.establecimiento_id and r.activo and lower(r.nombre) = lower(s.nombre);

-- Rubro por defecto: el de la especie; si no tiene, uno activo con el mismo nombre (la regla anterior)
create function public._rubro_de_especie(p_establecimiento_id uuid, p_especie_id uuid) returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select s.rubro_id from public.especies s where s.id = p_especie_id and s.establecimiento_id = p_establecimiento_id),
    (select r.id from public.rubros r join public.especies s on s.id = p_especie_id
     where r.establecimiento_id = p_establecimiento_id and r.activo and lower(r.nombre) = lower(s.nombre)
     limit 1));
$$;

revoke execute on function public._rubro_de_especie(uuid, uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Compra y venta y el catálogo base: el rubro por defecto sale de la especie
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._registrar_movimiento(
  p_establecimiento_id uuid, p_actividad_id uuid, p_lote_id uuid, p_especie_id uuid,
  p_fecha date, p_sentido text, p_concepto text, p_contraparte text, p_precio jsonb
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_monto  numeric;
  v_moneda text := upper(btrim(coalesce(p_precio ->> 'moneda', '')));
  v_tc     numeric;
  v_estado text := btrim(coalesce(p_precio ->> 'estado', ''));
  v_rubro  uuid := nullif(p_precio ->> 'rubro_id', '')::uuid;
  v_id     uuid;
begin
  begin
    v_monto := (p_precio ->> 'monto')::numeric;
    v_tc    := nullif(p_precio ->> 'tipo_cambio', '')::numeric;
  exception when others then
    raise exception 'El monto y el tipo de cambio tienen que ser números' using errcode = '22023';
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

  if v_rubro is null then
    v_rubro := public._rubro_de_especie(p_establecimiento_id, p_especie_id);
    if v_rubro is null then
      raise exception 'Elegí el rubro del movimiento' using errcode = '22023';
    end if;
  elsif not exists (select 1 from public.rubros r where r.id = v_rubro and r.establecimiento_id = p_establecimiento_id) then
    raise exception 'El rubro no es de este establecimiento' using errcode = '22023';
  end if;

  insert into public.movimientos_economicos (
    establecimiento_id, fecha, sentido, rubro_id, concepto, contraparte, monto_original, moneda_original,
    tipo_cambio, actividad_id, lote_id, estado, fecha_pago
  ) values (
    p_establecimiento_id, p_fecha, p_sentido, v_rubro, p_concepto, nullif(btrim(coalesce(p_contraparte, '')), ''),
    round(v_monto, 2), v_moneda, v_tc, p_actividad_id, p_lote_id, v_estado, nullif(p_precio ->> 'fecha_pago', '')::date
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public._registrar_movimiento(uuid, uuid, uuid, uuid, date, text, text, text, jsonb) from public, anon, authenticated;

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
end;
$$;

revoke execute on function public._cargar_catalogos_base(uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Precio: validación común de la carga manual
-- ════════════════════════════════════════════════════════════════════════════
-- precio: {"monto", "moneda": USD|UYU, "tipo_cambio"? (solo UYU), "estado": pagado|pendiente, "fecha_pago"?}

create function public._precio_valido(
  p_precio jsonb,
  out monto numeric, out moneda text, out tipo_cambio numeric, out estado text, out fecha_pago date
)
language plpgsql
set search_path = ''
as $$
begin
  if p_precio is null or jsonb_typeof(p_precio) <> 'object' then
    raise exception 'Falta el monto' using errcode = '22023';
  end if;
  begin
    monto       := (p_precio ->> 'monto')::numeric;
    tipo_cambio := nullif(p_precio ->> 'tipo_cambio', '')::numeric;
    fecha_pago  := nullif(p_precio ->> 'fecha_pago', '')::date;
  exception when others then
    raise exception 'El monto, el tipo de cambio y la fecha de pago tienen que ser válidos' using errcode = '22023';
  end;
  moneda := upper(btrim(coalesce(p_precio ->> 'moneda', '')));
  estado := btrim(coalesce(p_precio ->> 'estado', ''));

  if monto is null or round(monto, 2) <= 0 then
    raise exception 'El monto tiene que ser mayor a cero' using errcode = '22023';
  end if;
  monto := round(monto, 2);
  if moneda not in ('USD', 'UYU') then
    raise exception 'La moneda tiene que ser USD o UYU' using errcode = '22023';
  end if;
  if moneda = 'UYU' and (tipo_cambio is null or tipo_cambio <= 0) then
    raise exception 'Con pesos hay que cargar el tipo de cambio' using errcode = '22023';
  end if;
  if moneda = 'USD' and tipo_cambio is not null then
    raise exception 'Con dólares no va tipo de cambio' using errcode = '22023';
  end if;
  if estado not in ('pagado', 'pendiente') then
    raise exception 'Indicá si está pagado o pendiente' using errcode = '22023';
  end if;
  if estado = 'pendiente' and fecha_pago is not null then
    raise exception 'Un movimiento pendiente no lleva fecha de pago' using errcode = '22023';
  end if;
  if fecha_pago > public.fecha_hoy() then
    raise exception 'La fecha de pago no puede ser futura' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public._precio_valido(jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Carga manual de un ingreso o gasto
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente con p_id (es el id del movimiento): el mismo envío dos veces devuelve el ya creado.

create function public.registrar_movimiento(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_sentido            text,
  p_rubro_id           uuid,
  p_concepto           text,
  p_precio             jsonb,
  p_contraparte        text default null,
  p_lote_id            uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.movimientos_economicos;
  v     record;
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
  if btrim(coalesce(p_concepto, '')) = '' then
    raise exception 'Indicá el concepto' using errcode = '22023';
  end if;
  if p_rubro_id is null or not exists (
    select 1 from public.rubros r where r.id = p_rubro_id and r.establecimiento_id = p_establecimiento_id and r.activo
  ) then
    raise exception 'Elegí un rubro activo del establecimiento' using errcode = '22023';
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

  insert into public.movimientos_economicos (
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, contraparte, monto_original, moneda_original,
    tipo_cambio, lote_id, estado, fecha_pago, origen
  ) values (
    p_id, p_establecimiento_id, p_fecha, p_sentido, p_rubro_id, btrim(p_concepto), nullif(btrim(coalesce(p_contraparte, '')), ''),
    v.monto, v.moneda, v.tipo_cambio, p_lote_id, v.estado, v.fecha_pago, 'manual'
  );
  return p_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. El precio que faltó en una compra o una venta
-- ════════════════════════════════════════════════════════════════════════════
-- Sentido, fecha, lote, concepto y contraparte salen de la actividad. Solo si no está anulada y no
-- tiene un movimiento vigente (además, el índice único lo impide). Se anula solo (origen manual) o
-- junto con la actividad.

create function public.cargar_precio_actividad(
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
  v_mov   public.movimientos_economicos;
  v_act   public.actividades;
  v_lote  public.lotes;
  v_rubro uuid := p_rubro_id;
  v_total int;
  v_contra text;
  v       record;
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

  select * into v_lote from public.lotes where id = v_act.lote_id;
  if v_rubro is null then
    v_rubro := public._rubro_de_especie(v_act.establecimiento_id, v_lote.especie_id);
  end if;
  if v_rubro is null or not exists (
    select 1 from public.rubros r where r.id = v_rubro and r.establecimiento_id = v_act.establecimiento_id
  ) then
    raise exception 'Elegí el rubro del movimiento' using errcode = '22023';
  end if;

  select * into v from public._precio_valido(p_precio);
  if v.fecha_pago < v_act.fecha then
    raise exception 'La fecha de pago no puede ser anterior a la de la actividad' using errcode = '22023';
  end if;

  select coalesce(sum(l.cabezas), 0) into v_total from public.actividad_lineas l where l.actividad_id = v_act.id;
  select cv.contraparte into v_contra from public.act_compraventa cv where cv.actividad_id = v_act.id;

  insert into public.movimientos_economicos (
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, contraparte, monto_original, moneda_original,
    tipo_cambio, actividad_id, lote_id, estado, fecha_pago, origen
  ) values (
    p_id, v_act.establecimiento_id, v_act.fecha,
    case v_act.tipo when 'compra' then 'egreso' else 'ingreso' end, v_rubro,
    case v_act.tipo when 'compra' then 'Compra' else 'Venta' end || ' de ' || v_total || ' cabezas (' || v_lote.nombre || ')',
    v_contra, v.monto, v.moneda, v.tipo_cambio, v_act.id, v_act.lote_id, v.estado, v.fecha_pago, 'manual'
  );
  return p_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Marcar pagado y anular
-- ════════════════════════════════════════════════════════════════════════════

-- Pendiente → pagado, con la fecha de pago. Es el único cambio que admite un movimiento.
create function public.marcar_pagado(p_movimiento_id uuid, p_fecha_pago date) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.movimientos_economicos;
begin
  select * into v_mov from public.movimientos_economicos where id = p_movimiento_id for update;
  if not found or not public.puede_operar(v_mov.establecimiento_id) then
    raise exception 'Movimiento inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_mov.anulado_en is not null then
    raise exception 'El movimiento está anulado' using errcode = '22023';
  end if;
  if v_mov.estado <> 'pendiente' then
    raise exception 'El movimiento ya está pagado' using errcode = '22023';
  end if;
  if p_fecha_pago is null or p_fecha_pago > public.fecha_hoy() or p_fecha_pago < v_mov.fecha then
    raise exception 'La fecha de pago va entre la del movimiento y hoy' using errcode = '22023';
  end if;
  update public.movimientos_economicos set estado = 'pagado', fecha_pago = p_fecha_pago where id = v_mov.id;
end;
$$;

-- Solo los cargados a mano. Los de una compra o venta se anulan anulando la actividad.
create function public.anular_movimiento(p_movimiento_id uuid, p_motivo text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov    public.movimientos_economicos;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  select * into v_mov from public.movimientos_economicos where id = p_movimiento_id for update;
  if not found or not public.puede_operar(v_mov.establecimiento_id) then
    raise exception 'Movimiento inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_mov.anulado_en is not null then
    raise exception 'El movimiento ya está anulado' using errcode = '22023';
  end if;
  if v_mov.origen <> 'manual' then
    raise exception 'Este movimiento es de una compra o venta: se anula anulando la actividad' using errcode = '22023';
  end if;
  if v_motivo = '' then
    raise exception 'Indicá el motivo de la anulación' using errcode = '22023';
  end if;
  update public.movimientos_economicos
  set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = v_motivo
  where id = v_mov.id;
end;
$$;

revoke execute on function public.registrar_movimiento(uuid, uuid, date, text, uuid, text, jsonb, text, uuid) from public, anon;
revoke execute on function public.cargar_precio_actividad(uuid, uuid, jsonb, uuid)                         from public, anon;
revoke execute on function public.marcar_pagado(uuid, date)                                                 from public, anon;
revoke execute on function public.anular_movimiento(uuid, text)                                             from public, anon;
grant  execute on function public.registrar_movimiento(uuid, uuid, date, text, uuid, text, jsonb, text, uuid) to authenticated;
grant  execute on function public.cargar_precio_actividad(uuid, uuid, jsonb, uuid)                         to authenticated;
grant  execute on function public.marcar_pagado(uuid, date)                                                 to authenticated;
grant  execute on function public.anular_movimiento(uuid, text)                                             to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Vistas de plata (security_invoker: respetan la política de lectura; Consulta no ve nada)
-- ════════════════════════════════════════════════════════════════════════════

-- Resultado por rubro y mes, devengado (por la fecha del movimiento), sin anulados
create view public.v_resultado_rubro
with (security_invoker = true) as
select m.establecimiento_id, m.rubro_id, r.nombre as rubro, date_trunc('month', m.fecha)::date as mes,
       coalesce(sum(m.monto_usd) filter (where m.sentido = 'ingreso'), 0) as ingresos_usd,
       coalesce(sum(m.monto_usd) filter (where m.sentido = 'egreso'), 0) as egresos_usd,
       coalesce(sum(case when m.sentido = 'ingreso' then m.monto_usd else -m.monto_usd end), 0) as resultado_usd
from public.movimientos_economicos m
join public.rubros r on r.id = m.rubro_id
where m.anulado_en is null
group by m.establecimiento_id, m.rubro_id, r.nombre, date_trunc('month', m.fecha);

-- Por cobrar (ingresos) y por pagar (egresos) pendientes
create view public.v_movimientos_pendientes
with (security_invoker = true) as
select m.id, m.establecimiento_id, m.fecha, m.sentido, m.rubro_id, r.nombre as rubro, m.concepto, m.contraparte,
       m.monto_original, m.moneda_original, m.monto_usd, m.actividad_id, m.lote_id,
       public.fecha_hoy() - m.fecha as dias
from public.movimientos_economicos m
join public.rubros r on r.id = m.rubro_id
where m.anulado_en is null and m.estado = 'pendiente';

-- Compras y ventas vigentes sin precio (el resultado no las cuenta). Exige poder ver la economía:
-- sin esa condición, Consulta (que no ve los movimientos) vería todas como "sin precio".
create view public.v_compraventas_sin_precio
with (security_invoker = true) as
select a.id as actividad_id, a.establecimiento_id, a.tipo, a.fecha, a.lote_id, cv.contraparte,
       coalesce((select sum(l.cabezas) from public.actividad_lineas l where l.actividad_id = a.id), 0)::int as cabezas
from public.actividades a
left join public.act_compraventa cv on cv.actividad_id = a.id
where a.tipo in ('compra', 'venta') and a.anulada_en is null
  and public.puede_operar(a.establecimiento_id)
  and not exists (select 1 from public.movimientos_economicos m where m.actividad_id = a.id and m.anulado_en is null);

revoke all    on public.v_resultado_rubro, public.v_movimientos_pendientes, public.v_compraventas_sin_precio from anon, authenticated;
grant  select on public.v_resultado_rubro, public.v_movimientos_pendientes, public.v_compraventas_sin_precio to authenticated;

commit;
