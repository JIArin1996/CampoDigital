-- Campo Digital v2 — Economía: fecha prevista de cobro o pago de los pendientes
--
-- Pedido del 2026-10-23:
--   * Un movimiento cargado como pagado o cobrado se paga en su fecha (la app manda fecha_pago = fecha).
--   * Uno pendiente lleva, opcional, la fecha en que se espera cobrar o pagar: fecha_vencimiento.
--
--   1. movimientos_economicos.fecha_vencimiento (date, opcional, no anterior a la fecha del movimiento).
--      Al marcarlo pagado se conserva: queda como dato de cuándo se esperaba.
--   2. registrar_movimiento y cargar_precio_actividad: leen "vencimiento" del precio (solo si está
--      pendiente; con pagado se ignora). Misma firma: se reemplazan y conservan sus permisos.
--   3. v_movimientos_pendientes: suma fecha_vencimiento al final.
--
-- Auditoría: sin funciones nuevas (75). Sin permisos de columna nuevos: se escribe solo por funciones.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Columna
-- ════════════════════════════════════════════════════════════════════════════

alter table public.movimientos_economicos
  add column fecha_vencimiento date,
  add constraint movimientos_economicos_vencimiento_check check (fecha_vencimiento is null or fecha_vencimiento >= fecha);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Carga manual de un ingreso o gasto
-- ════════════════════════════════════════════════════════════════════════════
-- Igual que en 20261022000500_economia.sql, más el vencimiento.

create or replace function public.registrar_movimiento(
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
  v_mov   public.movimientos_economicos;
  v       record;
  v_vence date;
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
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, contraparte, monto_original, moneda_original,
    tipo_cambio, lote_id, estado, fecha_pago, fecha_vencimiento, origen
  ) values (
    p_id, p_establecimiento_id, p_fecha, p_sentido, p_rubro_id, btrim(p_concepto), nullif(btrim(coalesce(p_contraparte, '')), ''),
    v.monto, v.moneda, v.tipo_cambio, p_lote_id, v.estado, v.fecha_pago, v_vence, 'manual'
  );
  return p_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. El precio que faltó en una compra o una venta
-- ════════════════════════════════════════════════════════════════════════════

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
  v_mov   public.movimientos_economicos;
  v_act   public.actividades;
  v_lote  public.lotes;
  v_rubro uuid := p_rubro_id;
  v_total int;
  v_contra text;
  v       record;
  v_vence date;
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
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, contraparte, monto_original, moneda_original,
    tipo_cambio, actividad_id, lote_id, estado, fecha_pago, fecha_vencimiento, origen
  ) values (
    p_id, v_act.establecimiento_id, v_act.fecha,
    case v_act.tipo when 'compra' then 'egreso' else 'ingreso' end, v_rubro,
    case v_act.tipo when 'compra' then 'Compra' else 'Venta' end || ' de ' || v_total || ' cabezas (' || v_lote.nombre || ')',
    v_contra, v.monto, v.moneda, v.tipo_cambio, v_act.id, v_act.lote_id, v.estado, v.fecha_pago, v_vence, 'manual'
  );
  return p_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Pendientes, con la fecha prevista
-- ════════════════════════════════════════════════════════════════════════════

create or replace view public.v_movimientos_pendientes
with (security_invoker = true) as
select m.id, m.establecimiento_id, m.fecha, m.sentido, m.rubro_id, r.nombre as rubro, m.concepto, m.contraparte,
       m.monto_original, m.moneda_original, m.monto_usd, m.actividad_id, m.lote_id,
       public.fecha_hoy() - m.fecha as dias,
       m.fecha_vencimiento
from public.movimientos_economicos m
join public.rubros r on r.id = m.rubro_id
where m.anulado_en is null and m.estado = 'pendiente';

commit;
