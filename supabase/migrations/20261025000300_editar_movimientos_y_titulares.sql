-- Campo Digital v2 — Economía: editar movimientos y repartir un movimiento entre titulares
--
-- Pedido del 2026-10-23. Requiere 20261025000200_conceptos_titulares_archivos.
--
--   1. movimiento_titulares: un movimiento se reparte entre uno o más titulares, cada uno con su
--      parte del monto (en la moneda del movimiento). La suma tiene que dar el monto exacto.
--      Ej.: gasto de USD 240 → titular 1: 40, titular 2: 200. Sin filas: el movimiento no tiene titular.
--      Reemplaza a movimientos_economicos.titular_id (se pasa a una fila con el monto entero y se borra).
--   2. movimientos_economicos.editado_en / editado_por: quién lo editó por última vez.
--   3. editar_movimiento: cambia fecha, sentido, rubro, concepto, contraparte, lote, monto, moneda,
--      tipo de cambio, estado, vencimiento y titulares de un movimiento no anulado. Si viene de una
--      compra o una venta, la fecha, el sentido y el lote son los de la actividad y no cambian.
--   4. registrar_movimiento cambia la firma (p_titular_id → p_titulares jsonb).
--      _registrar_movimiento y cargar_precio_actividad (misma firma) leen "titulares" del precio.
--      Formato de titulares: [{"titular_id": uuid, "monto": número}, ...].
--   5. v_resultado_detalle: por titular, con la parte de cada uno (en dólares, proporcional).
--
-- Auditoría: +2 funciones (_guardar_titulares, editar_movimiento); registrar_movimiento se reemplaza.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Titulares de un movimiento
-- ════════════════════════════════════════════════════════════════════════════

create table public.movimiento_titulares (
  movimiento_id      uuid not null,
  titular_id         uuid not null,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  monto              numeric(14,2) not null check (monto > 0),   -- en la moneda del movimiento
  primary key (movimiento_id, titular_id),
  foreign key (movimiento_id, establecimiento_id) references public.movimientos_economicos (id, establecimiento_id) on delete restrict,
  foreign key (titular_id, establecimiento_id)    references public.titulares (id, establecimiento_id) on delete restrict
);

create index movimiento_titulares_titular_idx on public.movimiento_titulares (titular_id);

-- Leen quienes pueden cargar (Consulta no ve plata); se escribe solo por funciones
alter table public.movimiento_titulares enable row level security;
create policy movimiento_titulares_select on public.movimiento_titulares
  for select to authenticated using (public.puede_operar(establecimiento_id));
revoke all on public.movimiento_titulares from anon, authenticated;
grant select on public.movimiento_titulares to authenticated;

-- El titular único de antes pasa a ser una fila con el monto entero
insert into public.movimiento_titulares (movimiento_id, titular_id, establecimiento_id, monto)
select m.id, m.titular_id, m.establecimiento_id, m.monto_original
from public.movimientos_economicos m
where m.titular_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Edición
-- ════════════════════════════════════════════════════════════════════════════

alter table public.movimientos_economicos
  add column editado_en  timestamptz,
  add column editado_por uuid;   -- auditoría, sin FK

-- Reemplaza los titulares de un movimiento. p_titulares: null o [] = sin titular. Cada titular una
-- vez, de este establecimiento, activo (o ya puesto en este movimiento) y con monto > 0; la suma
-- tiene que dar p_monto.
create function public._guardar_titulares(
  p_movimiento_id uuid, p_establecimiento_id uuid, p_monto numeric, p_titulares jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item    jsonb;
  v_titular uuid;
  v_monto   numeric;
  v_suma    numeric := 0;
  v_ids     uuid[] := '{}';
  v_montos  numeric[] := '{}';
begin
  if p_titulares is not null and jsonb_typeof(p_titulares) <> 'null' then
    if jsonb_typeof(p_titulares) <> 'array' then
      raise exception 'Los titulares tienen que ser una lista' using errcode = '22023';
    end if;
    for v_item in select * from jsonb_array_elements(p_titulares) loop
      begin
        v_titular := (v_item ->> 'titular_id')::uuid;
        v_monto   := round((v_item ->> 'monto')::numeric, 2);
      exception when others then
        raise exception 'Cada titular necesita un titular y un monto válidos' using errcode = '22023';
      end;
      if v_titular is null or v_monto is null or v_monto <= 0 then
        raise exception 'Cada titular necesita un titular y un monto mayor a cero' using errcode = '22023';
      end if;
      if v_titular = any (v_ids) then
        raise exception 'Un titular aparece dos veces' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.titulares t
        where t.id = v_titular and t.establecimiento_id = p_establecimiento_id
          and (t.activo or exists (
            select 1 from public.movimiento_titulares mt where mt.movimiento_id = p_movimiento_id and mt.titular_id = v_titular))
      ) then
        raise exception 'Elegí titulares activos del establecimiento' using errcode = '22023';
      end if;
      v_ids    := v_ids || v_titular;
      v_montos := v_montos || v_monto;
      v_suma   := v_suma + v_monto;
    end loop;
    if array_length(v_ids, 1) > 0 and v_suma <> round(p_monto, 2) then
      raise exception 'Lo repartido entre los titulares (%) tiene que sumar el monto (%)',
        to_char(v_suma, 'FM999G999G990D00'), to_char(round(p_monto, 2), 'FM999G999G990D00') using errcode = '22023';
    end if;
  end if;

  delete from public.movimiento_titulares where movimiento_id = p_movimiento_id;
  insert into public.movimiento_titulares (movimiento_id, titular_id, establecimiento_id, monto)
  select p_movimiento_id, u.titular_id, p_establecimiento_id, u.monto
  from unnest(v_ids, v_montos) as u(titular_id, monto);
end;
$$;

revoke execute on function public._guardar_titulares(uuid, uuid, numeric, jsonb) from public, anon, authenticated;

-- Editar un movimiento no anulado (manual o de una compra o venta)
create function public.editar_movimiento(
  p_movimiento_id uuid,
  p_fecha         date,
  p_sentido       text,
  p_rubro_id      uuid,
  p_concepto_id   uuid,
  p_precio        jsonb,
  p_contraparte   text default null,
  p_lote_id       uuid default null,
  p_titulares     jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov      public.movimientos_economicos;
  v          record;
  v_fecha    date := p_fecha;
  v_sentido  text := p_sentido;
  v_lote     uuid := p_lote_id;
  v_concepto text;
  v_texto    text;
  v_vence    date;
begin
  select * into v_mov from public.movimientos_economicos where id = p_movimiento_id for update;
  if not found or not public.puede_operar(v_mov.establecimiento_id) then
    raise exception 'Movimiento inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_mov.anulado_en is not null then
    raise exception 'El movimiento está anulado: no se edita' using errcode = '22023';
  end if;

  -- De una compra o una venta: fecha, sentido y lote son los de la actividad
  if v_mov.actividad_id is not null then
    v_fecha := v_mov.fecha;
    v_sentido := v_mov.sentido;
    v_lote := v_mov.lote_id;
  else
    if v_fecha is null or v_fecha > public.fecha_hoy() then
      raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
    end if;
    if coalesce(v_sentido, '') not in ('ingreso', 'egreso') then
      raise exception 'Indicá si es un ingreso o un gasto' using errcode = '22023';
    end if;
    if v_lote is not null and not exists (
      select 1 from public.lotes l where l.id = v_lote and l.establecimiento_id = v_mov.establecimiento_id
    ) then
      raise exception 'El lote no es de este establecimiento' using errcode = '22023';
    end if;
  end if;

  -- Concepto y rubro: activos, o los que ya tenía
  select c.nombre into v_concepto
  from public.conceptos c
  where c.id = p_concepto_id and c.establecimiento_id = v_mov.establecimiento_id and c.tipo = v_sentido
    and (c.activo or c.id = v_mov.concepto_id);
  if v_concepto is null then
    raise exception 'Elegí un concepto activo de %', case v_sentido when 'ingreso' then 'ingreso' else 'gasto' end
      using errcode = '22023';
  end if;
  if p_rubro_id is null or not exists (
    select 1 from public.rubros r
    where r.id = p_rubro_id and r.establecimiento_id = v_mov.establecimiento_id and (r.activo or r.id = v_mov.rubro_id)
  ) then
    raise exception 'Elegí un rubro activo del establecimiento' using errcode = '22023';
  end if;

  select * into v from public._precio_valido(p_precio);
  if v.fecha_pago < v_fecha then
    raise exception 'La fecha de pago no puede ser anterior a la del movimiento' using errcode = '22023';
  end if;
  if v.estado = 'pendiente' then
    begin
      v_vence := nullif(p_precio ->> 'vencimiento', '')::date;
    exception when others then
      raise exception 'La fecha prevista de cobro o pago tiene que ser válida' using errcode = '22023';
    end;
    if v_vence < v_fecha then
      raise exception 'La fecha prevista de cobro o pago no puede ser anterior a la del movimiento' using errcode = '22023';
    end if;
  end if;

  -- El texto: en los manuales, el nombre del concepto; en compras y ventas, su descripción
  v_texto := case when v_mov.actividad_id is null then v_concepto else v_mov.concepto end;

  update public.movimientos_economicos
  set fecha = v_fecha, sentido = v_sentido, rubro_id = p_rubro_id, concepto = v_texto, concepto_id = p_concepto_id,
      contraparte = case when v_mov.actividad_id is null then nullif(btrim(coalesce(p_contraparte, '')), '') else v_mov.contraparte end,
      lote_id = v_lote, monto_original = v.monto, moneda_original = v.moneda, tipo_cambio = v.tipo_cambio,
      estado = v.estado, fecha_pago = v.fecha_pago, fecha_vencimiento = v_vence,
      editado_en = now(), editado_por = auth.uid()
  where id = v_mov.id;

  perform public._guardar_titulares(v_mov.id, v_mov.establecimiento_id, v.monto, p_titulares);
end;
$$;

revoke execute on function public.editar_movimiento(uuid, date, text, uuid, uuid, jsonb, text, uuid, jsonb) from public, anon;
grant  execute on function public.editar_movimiento(uuid, date, text, uuid, uuid, jsonb, text, uuid, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Carga: titulares repartidos (en lugar de uno solo)
-- ════════════════════════════════════════════════════════════════════════════

drop view public.v_resultado_detalle;   -- depende de titular_id; se rehace al final

-- Compra y venta (interna): igual que en 20261025000200, con "titulares" en lugar de "titular_id"
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
  v_vence    date;
  v_id       uuid;
begin
  begin
    v_monto    := (p_precio ->> 'monto')::numeric;
    v_tc       := nullif(p_precio ->> 'tipo_cambio', '')::numeric;
    v_rubro    := nullif(p_precio ->> 'rubro_id', '')::uuid;
    v_concepto := nullif(p_precio ->> 'concepto_id', '')::uuid;
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

  insert into public.movimientos_economicos (
    establecimiento_id, fecha, sentido, rubro_id, concepto, concepto_id, contraparte, monto_original,
    moneda_original, tipo_cambio, actividad_id, lote_id, estado, fecha_pago, fecha_vencimiento
  ) values (
    p_establecimiento_id, p_fecha, p_sentido, v_rubro, p_concepto, v_concepto,
    nullif(btrim(coalesce(p_contraparte, '')), ''), round(v_monto, 2), v_moneda, v_tc, p_actividad_id, p_lote_id, v_estado,
    nullif(p_precio ->> 'fecha_pago', '')::date, v_vence
  )
  returning id into v_id;

  perform public._guardar_titulares(v_id, p_establecimiento_id, round(v_monto, 2), p_precio -> 'titulares');
  return v_id;
end;
$$;

revoke execute on function public._registrar_movimiento(uuid, uuid, uuid, uuid, date, text, text, text, jsonb) from public, anon, authenticated;

-- Carga manual: igual que en 20261025000200, con p_titulares en lugar de p_titular_id
drop function public.registrar_movimiento(uuid, uuid, date, text, uuid, uuid, jsonb, text, uuid, uuid);

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
  p_titulares          jsonb default null
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
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, concepto_id, contraparte, monto_original,
    moneda_original, tipo_cambio, lote_id, estado, fecha_pago, fecha_vencimiento, origen
  ) values (
    p_id, p_establecimiento_id, p_fecha, p_sentido, p_rubro_id, v_concepto, p_concepto_id,
    nullif(btrim(coalesce(p_contraparte, '')), ''), v.monto, v.moneda, v.tipo_cambio, p_lote_id, v.estado, v.fecha_pago,
    v_vence, 'manual'
  );

  perform public._guardar_titulares(p_id, p_establecimiento_id, v.monto, p_titulares);
  return p_id;
end;
$$;

revoke execute on function public.registrar_movimiento(uuid, uuid, date, text, uuid, uuid, jsonb, text, uuid, jsonb) from public, anon;
grant  execute on function public.registrar_movimiento(uuid, uuid, date, text, uuid, uuid, jsonb, text, uuid, jsonb) to authenticated;

-- El precio que faltó en una compra o una venta: igual que en 20261025000200, con "titulares"
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
  exception when others then
    raise exception 'El concepto tiene que ser válido' using errcode = '22023';
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
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, concepto_id, contraparte, monto_original,
    moneda_original, tipo_cambio, actividad_id, lote_id, estado, fecha_pago, fecha_vencimiento, origen
  ) values (
    p_id, v_act.establecimiento_id, v_act.fecha, v_sentido, v_rubro,
    case v_act.tipo when 'compra' then 'Compra' else 'Venta' end || ' de ' || v_total || ' cabezas (' || v_lote.nombre || ')',
    v_concepto, v_contra, v.monto, v.moneda, v.tipo_cambio, v_act.id, v_act.lote_id, v.estado, v.fecha_pago,
    v_vence, 'manual'
  );

  perform public._guardar_titulares(p_id, v_act.establecimiento_id, v.monto, p_precio -> 'titulares');
  return p_id;
end;
$$;

-- El titular único ya pasó a movimiento_titulares
alter table public.movimientos_economicos drop column titular_id;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Resultado: la parte de cada titular
-- ════════════════════════════════════════════════════════════════════════════
-- Un movimiento sin titulares da una fila sin titular con el monto entero; uno repartido, una fila por
-- titular con su parte en dólares (proporcional al monto en la moneda original).

create view public.v_resultado_detalle
with (security_invoker = true) as
select m.establecimiento_id, date_trunc('month', m.fecha)::date as mes, m.sentido,
       m.rubro_id, r.nombre as rubro,
       m.concepto_id, c.nombre as concepto,
       c.grupo_id, g.nombre as grupo,
       mt.titular_id, t.nombre as titular,
       sum(case when mt.movimiento_id is null then m.monto_usd
                else round(m.monto_usd * mt.monto / m.monto_original, 2) end) as monto_usd
from public.movimientos_economicos m
join public.rubros r on r.id = m.rubro_id
left join public.conceptos c on c.id = m.concepto_id
left join public.concepto_grupos g on g.id = c.grupo_id
left join public.movimiento_titulares mt on mt.movimiento_id = m.id
left join public.titulares t on t.id = mt.titular_id
where m.anulado_en is null
group by m.establecimiento_id, date_trunc('month', m.fecha), m.sentido, m.rubro_id, r.nombre,
         m.concepto_id, c.nombre, c.grupo_id, g.nombre, mt.titular_id, t.nombre;

revoke all    on public.v_resultado_detalle from anon, authenticated;
grant  select on public.v_resultado_detalle to authenticated;

commit;
