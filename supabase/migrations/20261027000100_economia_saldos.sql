-- Campo Digital v2 — Economía: pagadores, saldos entre titulares, liquidaciones y datos de factura
--
-- Diseño aprobado el 2026-10-27 (contexto/DISENO-ECONOMIA-SALDOS.md). Requiere 20261025000400_tipo_cambio_bcu.
--
-- Tres roles que no se mezclan en un movimiento:
--   * titular (reparto, movimiento_titulares): de quién es el ingreso o el gasto → resultado;
--   * pagador ("Pagado por" / "Cobrado por"): de qué bolsillo salió o a cuál entró la plata → saldos;
--   * razón social ("Factura a nombre de") y número de comprobante: dato del comprobante, nada más.
--
--   1. pagadores y razones_sociales: catálogos por establecimiento, sin datos semilla. Los leen los
--      miembros; los crean el administrador y el operador; los editan, dan de baja o borran solo el
--      administrador (se borran solo si nadie los usa: las FK con restrict lo impiden). Un pagador
--      puede ser de un titular ("es el titular X"); un titular puede tener varios pagadores.
--   2. movimientos_economicos: pagador_id, facturado_a_id y numero_comprobante (opcionales).
--   3. preferencias_economia: el último pagador de cada usuario en cada establecimiento. La escriben
--      las funciones de carga; cada uno lee solo la suya.
--   4. _guardar_pago_y_factura (interna): valida y guarda los tres datos que vienen en el precio
--      ("pagador_id", "facturado_a_id", "numero_comprobante") y recuerda el pagador del usuario.
--      La llaman _registrar_movimiento, registrar_movimiento, cargar_precio_actividad y
--      editar_movimiento, que no cambian de firma (create or replace conserva los permisos).
--   5. liquidaciones: "de A a B" = A le pasó plata a B. No es ingreso ni gasto: no toca el resultado.
--      Cada lado es un titular o un pagador (una columna de cada tipo, exactamente una con valor).
--      registrar_liquidacion (idempotente por p_id) y anular_liquidacion. No se editan ni se borran.
--   6. Saldos, en dólares. Una parte es un titular, o un pagador sin titular: un pagador vinculado
--      al titular X cuenta como X (su propio bolsillo no genera deuda).
--      * v_saldos_aportes: una fila por deuda. Movimientos pagados, no anulados, con pagador y
--        reparto: en un gasto cada titular le debe al pagador su parte; en un ingreso el pagador le
--        debe a cada titular su parte. Una liquidación de A a B suma "B le debe a A".
--      * v_saldos: compensa cada par (A le debe 100 a B y B 30 a A → A le debe 70 a B).
--      * v_saldos_pendientes: movimientos pagados y no anulados sin reparto o sin pagador.
--   7. Consulta lee la plata (decisión original): movimientos, reparto, liquidaciones y las vistas
--      de resultado, pendientes, sin precio y saldos pasan a es_miembro. Ninguna escritura nueva.
--
-- Auditoría: 100 funciones (+4: _guardar_pago_y_factura, _parte_de_saldo, registrar_liquidacion,
-- anular_liquidacion). Permisos: pagadores y razones_sociales como titulares (select y delete de
-- tabla; insert y update por columna).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Catálogos: pagadores y razones sociales
-- ════════════════════════════════════════════════════════════════════════════

create table public.pagadores (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> ''),
  titular_id         uuid,                 -- "es el titular X" (opcional)
  activo             boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (establecimiento_id, nombre),
  unique (id, establecimiento_id),
  foreign key (titular_id, establecimiento_id) references public.titulares (id, establecimiento_id) on delete restrict
);

create index pagadores_titular_idx on public.pagadores (titular_id) where titular_id is not null;

create table public.razones_sociales (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> ''),
  rut                text check (rut is null or rut ~ '^[0-9]{12}$'),   -- RUT uruguayo: 12 dígitos
  activo             boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (establecimiento_id, nombre),
  unique (id, establecimiento_id)
);

create trigger set_updated_at before update on public.pagadores        for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.razones_sociales for each row execute function public.set_updated_at();

-- Leen los miembros; crean el administrador y el operador; editan y borran solo el administrador
alter table public.pagadores        enable row level security;
alter table public.razones_sociales enable row level security;

create policy pagadores_select on public.pagadores for select to authenticated using (public.es_miembro(establecimiento_id));
create policy pagadores_insert on public.pagadores for insert to authenticated with check (public.puede_operar(establecimiento_id));
create policy pagadores_update on public.pagadores for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy pagadores_delete on public.pagadores for delete to authenticated using (public.es_admin());

create policy razones_sociales_select on public.razones_sociales for select to authenticated using (public.es_miembro(establecimiento_id));
create policy razones_sociales_insert on public.razones_sociales for insert to authenticated with check (public.puede_operar(establecimiento_id));
create policy razones_sociales_update on public.razones_sociales for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy razones_sociales_delete on public.razones_sociales for delete to authenticated using (public.es_admin());

revoke all on public.pagadores, public.razones_sociales from anon, authenticated;
grant select, delete on public.pagadores, public.razones_sociales to authenticated;
grant insert (establecimiento_id, nombre, titular_id, activo) on public.pagadores        to authenticated;
grant update (nombre, titular_id, activo)                     on public.pagadores        to authenticated;
grant insert (establecimiento_id, nombre, rut, activo)        on public.razones_sociales to authenticated;
grant update (nombre, rut, activo)                            on public.razones_sociales to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Movimientos: quién pagó o cobró, y datos de factura
-- ════════════════════════════════════════════════════════════════════════════

alter table public.movimientos_economicos
  add column pagador_id         uuid,
  add column facturado_a_id     uuid,
  add column numero_comprobante text,
  add constraint movimientos_economicos_comprobante_check
    check (numero_comprobante is null or (btrim(numero_comprobante) <> '' and length(numero_comprobante) <= 50)),
  add constraint movimientos_economicos_pagador_fkey
    foreign key (pagador_id, establecimiento_id) references public.pagadores (id, establecimiento_id) on delete restrict,
  add constraint movimientos_economicos_facturado_fkey
    foreign key (facturado_a_id, establecimiento_id) references public.razones_sociales (id, establecimiento_id) on delete restrict;

create index movimientos_economicos_pagador_idx  on public.movimientos_economicos (pagador_id)     where pagador_id is not null;
create index movimientos_economicos_facturado_idx on public.movimientos_economicos (facturado_a_id) where facturado_a_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Último pagador de cada usuario
-- ════════════════════════════════════════════════════════════════════════════

create table public.preferencias_economia (
  user_id            uuid not null references public.perfiles (id) on delete cascade,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  ultimo_pagador_id  uuid references public.pagadores (id) on delete set null,
  updated_at         timestamptz not null default now(),
  primary key (user_id, establecimiento_id)
);

-- Cada uno lee la suya; la escriben solo las funciones de carga
alter table public.preferencias_economia enable row level security;
create policy preferencias_economia_select on public.preferencias_economia
  for select to authenticated using (user_id = auth.uid());
revoke all on public.preferencias_economia from anon, authenticated;
grant select on public.preferencias_economia to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Pagador, razón social y comprobante de un movimiento
-- ════════════════════════════════════════════════════════════════════════════
-- Lee "pagador_id", "facturado_a_id" y "numero_comprobante" del precio y los guarda en el movimiento
-- (reemplaza lo que hubiera: una clave que no viene queda vacía). El pagador y la razón social tienen
-- que ser del establecimiento y estar activos, salvo que ya estuvieran en ese movimiento (al editar).
-- Si hay pagador, queda como el último del usuario que carga.
create function public._guardar_pago_y_factura(p_movimiento_id uuid, p_precio jsonb) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_mov         public.movimientos_economicos;
  v_pagador     uuid;
  v_factura     uuid;
  v_comprobante text;
begin
  select * into v_mov from public.movimientos_economicos where id = p_movimiento_id;
  begin
    v_pagador := nullif(p_precio ->> 'pagador_id', '')::uuid;
    v_factura := nullif(p_precio ->> 'facturado_a_id', '')::uuid;
  exception when others then
    raise exception 'Quién pagó y la razón social tienen que ser válidos' using errcode = '22023';
  end;
  v_comprobante := nullif(btrim(coalesce(p_precio ->> 'numero_comprobante', '')), '');

  if length(v_comprobante) > 50 then
    raise exception 'El número de comprobante tiene hasta 50 caracteres' using errcode = '22023';
  end if;
  if v_pagador is not null and v_pagador is distinct from v_mov.pagador_id and not exists (
    select 1 from public.pagadores p where p.id = v_pagador and p.establecimiento_id = v_mov.establecimiento_id and p.activo
  ) then
    raise exception 'Elegí quién pagó o cobró entre los activos del establecimiento' using errcode = '22023';
  end if;
  if v_factura is not null and v_factura is distinct from v_mov.facturado_a_id and not exists (
    select 1 from public.razones_sociales r where r.id = v_factura and r.establecimiento_id = v_mov.establecimiento_id and r.activo
  ) then
    raise exception 'Elegí la razón social de la factura entre las activas del establecimiento' using errcode = '22023';
  end if;

  update public.movimientos_economicos
  set pagador_id = v_pagador, facturado_a_id = v_factura, numero_comprobante = v_comprobante
  where id = v_mov.id
    and (pagador_id, facturado_a_id, numero_comprobante) is distinct from (v_pagador, v_factura, v_comprobante);

  if v_pagador is not null and auth.uid() is not null then
    insert into public.preferencias_economia (user_id, establecimiento_id, ultimo_pagador_id, updated_at)
    values (auth.uid(), v_mov.establecimiento_id, v_pagador, now())
    on conflict (user_id, establecimiento_id) do update
      set ultimo_pagador_id = excluded.ultimo_pagador_id, updated_at = excluded.updated_at;
  end if;
end;
$$;

revoke execute on function public._guardar_pago_y_factura(uuid, jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Funciones de carga y edición: guardan el pagador y la factura (misma firma)
-- ════════════════════════════════════════════════════════════════════════════
-- Iguales a 20261025000400_tipo_cambio_bcu, más la llamada a _guardar_pago_y_factura.

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
  perform public._guardar_pago_y_factura(v_id, p_precio);
  return v_id;
end;
$$;

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
  perform public._guardar_pago_y_factura(p_id, p_precio);
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
  perform public._guardar_pago_y_factura(p_id, p_precio);
  return p_id;
end;
$$;

-- Edición (reemplaza el pagador y los datos de factura con lo que venga en el precio)
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
  perform public._guardar_pago_y_factura(v_mov.id, p_precio);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Liquidaciones
-- ════════════════════════════════════════════════════════════════════════════

create table public.liquidaciones (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  fecha              date not null,
  de_titular_id      uuid,                 -- quién pagó: un titular...
  de_pagador_id      uuid,                 -- ...o un pagador
  a_titular_id       uuid,                 -- quién recibió: un titular...
  a_pagador_id       uuid,                 -- ...o un pagador
  moneda_original    text not null check (moneda_original in ('USD', 'UYU')),
  monto_original     numeric(14,2) not null check (monto_original > 0),
  tipo_cambio        numeric(10,4) check (tipo_cambio is null or tipo_cambio > 0),   -- pesos por dólar
  tipo_cambio_fuente text check (tipo_cambio_fuente in ('BCU', 'manual')),
  tipo_cambio_fecha  date,
  monto_usd          numeric(14,2) generated always as (
                       case when moneda_original = 'USD' then monto_original
                            else round(monto_original / tipo_cambio, 2) end
                     ) stored,
  observacion        text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  anulado_en         timestamptz,
  anulado_por        uuid,   -- auditoría, sin FK
  motivo_anulacion   text,
  unique (id, establecimiento_id),
  constraint liquidaciones_de_check check (num_nonnulls(de_titular_id, de_pagador_id) = 1),
  constraint liquidaciones_a_check  check (num_nonnulls(a_titular_id, a_pagador_id) = 1),
  constraint liquidaciones_tc_check check ((moneda_original = 'UYU') = (tipo_cambio is not null)),
  constraint liquidaciones_tc_fuente_check check ((moneda_original = 'UYU') = (tipo_cambio_fuente is not null)),
  constraint liquidaciones_tc_fecha_check check (
    (tipo_cambio_fuente = 'BCU') = (tipo_cambio_fecha is not null) and (tipo_cambio_fecha is null or tipo_cambio_fecha <= fecha)),
  constraint liquidaciones_anulacion_check check ((anulado_en is null) = (motivo_anulacion is null)),
  foreign key (de_titular_id, establecimiento_id) references public.titulares (id, establecimiento_id) on delete restrict,
  foreign key (de_pagador_id, establecimiento_id) references public.pagadores (id, establecimiento_id) on delete restrict,
  foreign key (a_titular_id,  establecimiento_id) references public.titulares (id, establecimiento_id) on delete restrict,
  foreign key (a_pagador_id,  establecimiento_id) references public.pagadores (id, establecimiento_id) on delete restrict
);

create index liquidaciones_establecimiento_idx on public.liquidaciones (establecimiento_id, fecha);

create trigger sin_borrado before delete on public.liquidaciones
  for each row execute function public.bloquear_borrado();
create trigger sin_truncate before truncate on public.liquidaciones
  for each statement execute function public.bloquear_borrado();

-- Leen los miembros (Consulta incluido); se escriben solo por funciones
alter table public.liquidaciones enable row level security;
create policy liquidaciones_select on public.liquidaciones
  for select to authenticated using (public.es_miembro(establecimiento_id));
revoke all on public.liquidaciones from anon, authenticated;
grant select on public.liquidaciones to authenticated;

-- La parte de saldo de un titular o un pagador del establecimiento: 'titular:<id>' o 'pagador:<id>'.
-- Un pagador vinculado a un titular es ese titular. Los dos lados tienen que estar activos.
create function public._parte_de_saldo(p_establecimiento_id uuid, p_tipo text, p_id uuid) returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_titular uuid;
begin
  if p_tipo = 'titular' then
    if not exists (
      select 1 from public.titulares t where t.id = p_id and t.establecimiento_id = p_establecimiento_id and t.activo
    ) then
      raise exception 'El titular no es de este establecimiento o está dado de baja' using errcode = '22023';
    end if;
    return 'titular:' || p_id;
  elsif p_tipo = 'pagador' then
    select p.titular_id into v_titular from public.pagadores p
    where p.id = p_id and p.establecimiento_id = p_establecimiento_id and p.activo;
    if not found then
      raise exception 'El pagador no es de este establecimiento o está dado de baja' using errcode = '22023';
    end if;
    return coalesce('titular:' || v_titular, 'pagador:' || p_id);
  end if;
  raise exception 'Cada lado de la liquidación es un titular o un pagador' using errcode = '22023';
end;
$$;

revoke execute on function public._parte_de_saldo(uuid, text, uuid) from public, anon, authenticated;

-- "De A a B": A le pasó plata a B. p_precio: {"moneda", "monto", "tipo_cambio", "tipo_cambio_fecha"}.
-- Idempotente con p_id: el mismo envío dos veces devuelve la ya creada.
create function public.registrar_liquidacion(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_de_tipo            text,
  p_de_id              uuid,
  p_a_tipo             text,
  p_a_id               uuid,
  p_precio             jsonb,
  p_observacion        text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_liq public.liquidaciones;
  v     record;
  f     record;
begin
  if p_id is null then
    raise exception 'Falta el identificador de la liquidación' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into v_liq from public.liquidaciones where id = p_id;
  if found then
    if v_liq.establecimiento_id is distinct from p_establecimiento_id or v_liq.created_by is distinct from auth.uid()
       or not public.puede_operar(v_liq.establecimiento_id) then
      raise exception 'Identificador de liquidación inválido' using errcode = '42501';
    end if;
    return p_id;
  end if;

  if p_establecimiento_id is null or not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de edición en este establecimiento' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if public._parte_de_saldo(p_establecimiento_id, p_de_tipo, p_de_id)
     = public._parte_de_saldo(p_establecimiento_id, p_a_tipo, p_a_id) then
    raise exception 'Quien paga y quien recibe no pueden ser la misma persona' using errcode = '22023';
  end if;

  -- Monto, moneda y tipo de cambio con las reglas de los movimientos (una liquidación siempre está hecha)
  select * into v from public._precio_valido((coalesce(p_precio, '{}'::jsonb) - 'fecha_pago') || '{"estado": "pagado"}'::jsonb);
  select * into f from public._fuente_tipo_cambio(p_precio, v.moneda, v.tipo_cambio, p_fecha);

  insert into public.liquidaciones (
    id, establecimiento_id, fecha, de_titular_id, de_pagador_id, a_titular_id, a_pagador_id,
    moneda_original, monto_original, tipo_cambio, tipo_cambio_fuente, tipo_cambio_fecha, observacion
  ) values (
    p_id, p_establecimiento_id, p_fecha,
    case when p_de_tipo = 'titular' then p_de_id end, case when p_de_tipo = 'pagador' then p_de_id end,
    case when p_a_tipo  = 'titular' then p_a_id  end, case when p_a_tipo  = 'pagador' then p_a_id  end,
    v.moneda, v.monto, v.tipo_cambio, f.fuente, f.fecha, nullif(btrim(coalesce(p_observacion, '')), '')
  );
  return p_id;
end;
$$;

create function public.anular_liquidacion(p_id uuid, p_motivo text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_liq    public.liquidaciones;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_liq from public.liquidaciones where id = p_id for update;
  if not found or not public.puede_operar(v_liq.establecimiento_id) then
    raise exception 'Liquidación inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_liq.anulado_en is not null then
    raise exception 'La liquidación ya está anulada' using errcode = '22023';
  end if;
  if v_motivo is null then
    raise exception 'Escribí el motivo de la anulación' using errcode = '22023';
  end if;
  update public.liquidaciones
  set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = v_motivo
  where id = v_liq.id;
end;
$$;

revoke execute on function public.registrar_liquidacion(uuid, uuid, date, text, uuid, text, uuid, jsonb, text) from public, anon;
revoke execute on function public.anular_liquidacion(uuid, text)                                              from public, anon;
grant  execute on function public.registrar_liquidacion(uuid, uuid, date, text, uuid, text, uuid, jsonb, text) to authenticated;
grant  execute on function public.anular_liquidacion(uuid, text)                                              to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Saldos (en dólares)
-- ════════════════════════════════════════════════════════════════════════════

-- Una fila por deuda: deudor le debe a acreedor monto_usd. Partes: 'titular' o 'pagador' (sin titular).
create view public.v_saldos_aportes
with (security_invoker = true) as
-- Movimientos pagados, no anulados, con pagador y reparto: en un gasto, cada titular le debe al pagador
-- su parte; en un ingreso, el pagador le debe a cada titular la suya. Con el propio bolsillo, nada.
select m.establecimiento_id, m.fecha, 'movimiento'::text as origen, m.id as origen_id, m.sentido, m.concepto as descripcion,
       case when m.sentido = 'egreso' then 'titular' else pp.tipo end as deudor_tipo,
       case when m.sentido = 'egreso' then mt.titular_id else pp.id end as deudor_id,
       case when m.sentido = 'egreso' then pp.tipo else 'titular' end as acreedor_tipo,
       case when m.sentido = 'egreso' then pp.id else mt.titular_id end as acreedor_id,
       round(m.monto_usd * mt.monto / m.monto_original, 2) as monto_usd
from public.movimientos_economicos m
join public.movimiento_titulares mt on mt.movimiento_id = m.id
join public.pagadores p on p.id = m.pagador_id
cross join lateral (
  select case when p.titular_id is null then 'pagador' else 'titular' end as tipo, coalesce(p.titular_id, p.id) as id
) pp
where m.anulado_en is null and m.estado = 'pagado'
  and not (pp.tipo = 'titular' and pp.id = mt.titular_id)
union all
-- Liquidación de A a B: "B le debe a A" (al compensar, descuenta lo que A le debía a B)
select l.establecimiento_id, l.fecha, 'liquidacion', l.id, null, coalesce(l.observacion, 'Liquidación'),
       a.tipo, a.id, de.tipo, de.id, l.monto_usd
from public.liquidaciones l
left join public.pagadores dp on dp.id = l.de_pagador_id
left join public.pagadores ap on ap.id = l.a_pagador_id
cross join lateral (
  select case when l.de_titular_id is null and dp.titular_id is null then 'pagador' else 'titular' end as tipo,
         coalesce(l.de_titular_id, dp.titular_id, dp.id) as id
) de
cross join lateral (
  select case when l.a_titular_id is null and ap.titular_id is null then 'pagador' else 'titular' end as tipo,
         coalesce(l.a_titular_id, ap.titular_id, ap.id) as id
) a
where l.anulado_en is null;

-- Una fila por par con saldo: compensa lo que se deben en los dos sentidos
create view public.v_saldos
with (security_invoker = true) as
with aportes as (
  -- Cada par en un orden fijo (parte 1 < parte 2): "directo" si el deudor es la parte 1
  select s.establecimiento_id, s.deudor_tipo, s.deudor_id, s.acreedor_tipo, s.acreedor_id, s.monto_usd,
         (s.deudor_tipo || ':' || s.deudor_id) < (s.acreedor_tipo || ':' || s.acreedor_id) as directo
  from public.v_saldos_aportes s
),
pares as (
  select establecimiento_id,
         case when directo then deudor_tipo else acreedor_tipo end as tipo1,
         case when directo then deudor_id else acreedor_id end as id1,
         case when directo then acreedor_tipo else deudor_tipo end as tipo2,
         case when directo then acreedor_id else deudor_id end as id2,
         sum(case when directo then monto_usd else -monto_usd end) as neto   -- > 0: la parte 1 le debe a la 2
  from aportes
  group by 1, 2, 3, 4, 5
),
saldos as (
  select establecimiento_id,
         case when neto > 0 then tipo1 else tipo2 end as deudor_tipo,
         case when neto > 0 then id1 else id2 end as deudor_id,
         case when neto > 0 then tipo2 else tipo1 end as acreedor_tipo,
         case when neto > 0 then id2 else id1 end as acreedor_id,
         abs(neto) as monto_usd
  from pares
  where neto <> 0
)
select s.*,
       case s.deudor_tipo when 'titular' then td.nombre else pd.nombre end as deudor,
       case s.acreedor_tipo when 'titular' then ta.nombre else pa.nombre end as acreedor
from saldos s
left join public.titulares td on s.deudor_tipo = 'titular' and td.id = s.deudor_id
left join public.pagadores pd on s.deudor_tipo = 'pagador' and pd.id = s.deudor_id
left join public.titulares ta on s.acreedor_tipo = 'titular' and ta.id = s.acreedor_id
left join public.pagadores pa on s.acreedor_tipo = 'pagador' and pa.id = s.acreedor_id;

-- Lo que queda afuera del saldo: movimientos pagados y no anulados sin reparto o sin pagador
create view public.v_saldos_pendientes
with (security_invoker = true) as
select m.id, m.establecimiento_id, m.fecha, m.sentido, m.concepto, m.monto_usd, m.actividad_id,
       m.pagador_id is null as falta_pagador,
       not exists (select 1 from public.movimiento_titulares mt where mt.movimiento_id = m.id) as falta_reparto
from public.movimientos_economicos m
where m.anulado_en is null and m.estado = 'pagado'
  and (m.pagador_id is null or not exists (select 1 from public.movimiento_titulares mt where mt.movimiento_id = m.id));

revoke all    on public.v_saldos_aportes, public.v_saldos, public.v_saldos_pendientes from anon, authenticated;
grant  select on public.v_saldos_aportes, public.v_saldos, public.v_saldos_pendientes to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Consulta lee la plata (en modo lectura)
-- ════════════════════════════════════════════════════════════════════════════
-- Movimientos y reparto pasan a es_miembro. Las vistas de resultado, pendientes y saldos son
-- security_invoker: siguen a las tablas. "Sin precio" filtraba con puede_operar: pasa a es_miembro.
-- Las funciones de escritura siguen exigiendo puede_operar. Los archivos de los movimientos no cambian.

alter policy movimientos_economicos_select on public.movimientos_economicos
  using (public.es_miembro(establecimiento_id));
alter policy movimiento_titulares_select on public.movimiento_titulares
  using (public.es_miembro(establecimiento_id));

create or replace view public.v_compraventas_sin_precio
with (security_invoker = true) as
select a.id as actividad_id, a.establecimiento_id, a.tipo, a.fecha, a.lote_id, cv.contraparte,
       coalesce((select sum(l.cabezas) from public.actividad_lineas l where l.actividad_id = a.id), 0)::int as cabezas
from public.actividades a
left join public.act_compraventa cv on cv.actividad_id = a.id
where a.tipo in ('compra', 'venta') and a.anulada_en is null
  and public.es_miembro(a.establecimiento_id)
  and not exists (select 1 from public.movimientos_economicos m where m.actividad_id = a.id and m.anulado_en is null);

commit;
