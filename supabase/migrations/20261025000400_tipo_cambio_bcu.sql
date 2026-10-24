-- Campo Digital v2 — Economía: tipo de cambio del BCU
--
-- Diseño aprobado el 2026-10-24. Requiere 20261025000300_editar_movimientos_y_titulares.
--
--   1. tipos_cambio: cotizaciones por fecha y moneda (global, no por establecimiento). La llena solo
--      la route /api/tipo-cambio del servidor (cliente service_role) con lo que devuelve el web service
--      del BCU (dólar billete, código 2225). La leen los usuarios autenticados. La fuente 'manual'
--      queda en el check para el futuro; hoy no se usa.
--   2. movimientos_economicos.tipo_cambio_fuente ('BCU' o 'manual') y tipo_cambio_fecha (fecha real de
--      la cotización usada). Con pesos la fuente es obligatoria; con dólares no hay tipo de cambio,
--      fuente ni fecha. Los movimientos en pesos ya cargados quedan como 'manual'.
--   3. _fuente_tipo_cambio: decide la fuente en la base (no la app). Es 'BCU' solo si el precio trae
--      "tipo_cambio_fecha", esa fecha está entre la del movimiento y 10 días antes, y existe en
--      tipos_cambio una cotización de esa fecha cuya venta o compra (4 decimales) es el tipo de cambio
--      cargado. En cualquier otro caso, 'manual' sin fecha. Nunca rechaza el guardado.
--   4. _registrar_movimiento, registrar_movimiento, cargar_precio_actividad y editar_movimiento: igual
--      que en 20261025000300, más la fuente y la fecha del tipo de cambio. Misma firma: create or
--      replace conserva los permisos.
--
-- Auditoría: +1 función (_fuente_tipo_cambio). Sin permisos de escritura nuevos para authenticated.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Cotizaciones
-- ════════════════════════════════════════════════════════════════════════════

create table public.tipos_cambio (
  fecha         date not null,
  moneda        text not null check (moneda in ('USD')),   -- ISO; el código del BCU (2225) vive en la route
  compra        numeric(12,6) not null check (compra > 0),
  venta         numeric(12,6) not null check (venta > 0),
  fuente        text not null check (fuente in ('BCU', 'manual')),
  consultado_en timestamptz not null default now(),
  primary key (fecha, moneda)
);

-- Leen los autenticados; nadie escribe por la API (la route usa service_role, que saltea el RLS)
alter table public.tipos_cambio enable row level security;
create policy tipos_cambio_select on public.tipos_cambio for select to authenticated using (true);
revoke all on public.tipos_cambio from anon, authenticated;
grant select on public.tipos_cambio to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Fuente y fecha del tipo de cambio de cada movimiento
-- ════════════════════════════════════════════════════════════════════════════

alter table public.movimientos_economicos
  add column tipo_cambio_fuente text check (tipo_cambio_fuente in ('BCU', 'manual')),
  add column tipo_cambio_fecha  date;

update public.movimientos_economicos set tipo_cambio_fuente = 'manual' where moneda_original = 'UYU';

alter table public.movimientos_economicos
  -- con pesos, la fuente es obligatoria; con dólares, no hay fuente
  add constraint movimientos_economicos_tc_fuente_check check ((moneda_original = 'UYU') = (tipo_cambio_fuente is not null)),
  -- la fecha de la cotización va solo con el BCU, y no es posterior al movimiento
  add constraint movimientos_economicos_tc_fecha_check check (
    (tipo_cambio_fuente = 'BCU') = (tipo_cambio_fecha is not null) and (tipo_cambio_fecha is null or tipo_cambio_fecha <= fecha)
  );

-- Fuente del tipo de cambio de un precio: 'BCU' (con la fecha de la cotización) si coincide con una
-- cotización guardada de hasta 10 días antes del movimiento; si no, 'manual'. Con dólares, nada.
create function public._fuente_tipo_cambio(
  p_precio jsonb, p_moneda text, p_tipo_cambio numeric, p_fecha_movimiento date,
  out fuente text, out fecha date
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fecha date;
begin
  if p_moneda is distinct from 'UYU' then
    return;   -- fuente y fecha null
  end if;
  begin
    v_fecha := nullif(p_precio ->> 'tipo_cambio_fecha', '')::date;
  exception when others then
    v_fecha := null;   -- una fecha mal formada no bloquea: queda manual
  end;
  if v_fecha is not null and v_fecha <= p_fecha_movimiento and v_fecha >= p_fecha_movimiento - 10
     and exists (
       select 1 from public.tipos_cambio t
       where t.fecha = v_fecha and t.moneda = 'USD'
         and round(p_tipo_cambio, 4) in (round(t.venta, 4), round(t.compra, 4))
     ) then
    fuente := 'BCU';
    fecha := v_fecha;
  else
    fuente := 'manual';
  end if;
end;
$$;

revoke execute on function public._fuente_tipo_cambio(jsonb, text, numeric, date) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Funciones de carga y edición: guardan la fuente y la fecha
-- ════════════════════════════════════════════════════════════════════════════

-- Compra y venta (interna)
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
  f          record;
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

  select * into f from public._fuente_tipo_cambio(p_precio, v_moneda, v_tc, p_fecha);

  insert into public.movimientos_economicos (
    establecimiento_id, fecha, sentido, rubro_id, concepto, concepto_id, contraparte, monto_original,
    moneda_original, tipo_cambio, tipo_cambio_fuente, tipo_cambio_fecha, actividad_id, lote_id, estado, fecha_pago,
    fecha_vencimiento
  ) values (
    p_establecimiento_id, p_fecha, p_sentido, v_rubro, p_concepto, v_concepto,
    nullif(btrim(coalesce(p_contraparte, '')), ''), round(v_monto, 2), v_moneda, v_tc, f.fuente, f.fecha, p_actividad_id,
    p_lote_id, v_estado, nullif(p_precio ->> 'fecha_pago', '')::date, v_vence
  )
  returning id into v_id;

  perform public._guardar_titulares(v_id, p_establecimiento_id, round(v_monto, 2), p_precio -> 'titulares');
  return v_id;
end;
$$;

revoke execute on function public._registrar_movimiento(uuid, uuid, uuid, uuid, date, text, text, text, jsonb) from public, anon, authenticated;

-- Carga manual
create or replace function public.registrar_movimiento(
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
  f          record;
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

  select * into f from public._fuente_tipo_cambio(p_precio, v.moneda, v.tipo_cambio, p_fecha);

  insert into public.movimientos_economicos (
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, concepto_id, contraparte, monto_original,
    moneda_original, tipo_cambio, tipo_cambio_fuente, tipo_cambio_fecha, lote_id, estado, fecha_pago, fecha_vencimiento, origen
  ) values (
    p_id, p_establecimiento_id, p_fecha, p_sentido, p_rubro_id, v_concepto, p_concepto_id,
    nullif(btrim(coalesce(p_contraparte, '')), ''), v.monto, v.moneda, v.tipo_cambio, f.fuente, f.fecha, p_lote_id, v.estado,
    v.fecha_pago, v_vence, 'manual'
  );

  perform public._guardar_titulares(p_id, p_establecimiento_id, v.monto, p_titulares);
  return p_id;
end;
$$;

-- El precio que faltó en una compra o una venta
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
  f          record;
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

  select * into f from public._fuente_tipo_cambio(p_precio, v.moneda, v.tipo_cambio, v_act.fecha);

  insert into public.movimientos_economicos (
    id, establecimiento_id, fecha, sentido, rubro_id, concepto, concepto_id, contraparte, monto_original,
    moneda_original, tipo_cambio, tipo_cambio_fuente, tipo_cambio_fecha, actividad_id, lote_id, estado, fecha_pago,
    fecha_vencimiento, origen
  ) values (
    p_id, v_act.establecimiento_id, v_act.fecha, v_sentido, v_rubro,
    case v_act.tipo when 'compra' then 'Compra' else 'Venta' end || ' de ' || v_total || ' cabezas (' || v_lote.nombre || ')',
    v_concepto, v_contra, v.monto, v.moneda, v.tipo_cambio, f.fuente, f.fecha, v_act.id, v_act.lote_id, v.estado,
    v.fecha_pago, v_vence, 'manual'
  );

  perform public._guardar_titulares(p_id, v_act.establecimiento_id, v.monto, p_precio -> 'titulares');
  return p_id;
end;
$$;

-- Edición
create or replace function public.editar_movimiento(
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
  f          record;
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

  select * into f from public._fuente_tipo_cambio(p_precio, v.moneda, v.tipo_cambio, v_fecha);

  update public.movimientos_economicos
  set fecha = v_fecha, sentido = v_sentido, rubro_id = p_rubro_id, concepto = v_texto, concepto_id = p_concepto_id,
      contraparte = case when v_mov.actividad_id is null then nullif(btrim(coalesce(p_contraparte, '')), '') else v_mov.contraparte end,
      lote_id = v_lote, monto_original = v.monto, moneda_original = v.moneda, tipo_cambio = v.tipo_cambio,
      tipo_cambio_fuente = f.fuente, tipo_cambio_fecha = f.fecha,
      estado = v.estado, fecha_pago = v.fecha_pago, fecha_vencimiento = v_vence,
      editado_en = now(), editado_por = auth.uid()
  where id = v_mov.id;

  perform public._guardar_titulares(v_mov.id, v_mov.establecimiento_id, v.monto, p_titulares);
end;
$$;

commit;
