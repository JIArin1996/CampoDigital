-- Campo Digital v2 — Etapa 6a: actividades que mueven stock
--
-- Pesada, mortandad, compra, venta y parición; movimientos económicos de compra y venta;
-- anulación con eventos inversos. Diseño: contexto/DISENO-BASE-ETAPA-6A.md
--
-- Criterios de siempre: uuid, created_by sin FK, FKs compuestas con establecimiento_id,
-- nada se borra, escrituras solo por funciones security definer (search_path fijo,
-- validan puede_operar), bloqueo de lotes ordenado por id antes de leer el saldo,
-- saldo acumulado >= 0 todos los días, y todo objeto nuevo nace sin permisos.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Valores de parametros: causas de mortandad
-- ════════════════════════════════════════════════════════════════════════════

insert into public.parametros (clave, valor, orden)
select 'causas_mortandad', c.valor, c.orden::int
from unnest(array[
  'Enfermedad', 'Accidente', 'Parto', 'Depredación', 'Clima o temporal',
  'Abigeato o extravío', 'Desconocida', 'Otra'
]) with ordinality as c(valor, orden)
on conflict (clave, valor) do nothing;

-- rubros necesita (id, establecimiento_id) único para la FK compuesta de movimientos_economicos
alter table public.rubros add constraint rubros_id_establecimiento_key unique (id, establecimiento_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Tablas
-- ════════════════════════════════════════════════════════════════════════════

-- ── actividades: registro común ─────────────────────────────────────────────
create table public.actividades (
  id                 uuid primary key default gen_random_uuid(),   -- lo manda la app (idempotencia)
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  tipo               text not null check (tipo in (
                       'pesada', 'sanidad', 'antiparasitario', 'servicio', 'diagnostico_gestacion',
                       'paricion', 'destete', 'esquila', 'mortandad', 'compra', 'venta', 'personalizada')),
  fecha              date not null,
  lote_id            uuid,   -- lote sobre el que se hizo (en la parición, el de las madres)
  lote_creado_id     uuid,   -- lote que creó esta actividad (compra o parición), para cerrarlo si se anula
  persona_id         uuid,   -- responsable (catálogo personas)
  notas              text,
  anulada_en         timestamptz,
  anulada_por        uuid,   -- auditoría, sin FK
  motivo_anulacion   text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (lote_id, establecimiento_id)        references public.lotes (id, establecimiento_id) on delete restrict,
  foreign key (lote_creado_id, establecimiento_id) references public.lotes (id, establecimiento_id) on delete restrict,
  foreign key (persona_id, establecimiento_id)     references public.personas (id, establecimiento_id) on delete restrict,
  -- los tres datos de la anulación van juntos
  check ((anulada_en is null) = (anulada_por is null) and (anulada_en is null) = (motivo_anulacion is null)),
  check (motivo_anulacion is null or btrim(motivo_anulacion) <> ''),
  unique (id, establecimiento_id)
);

create index actividades_fecha_idx on public.actividades (establecimiento_id, fecha desc, created_at desc);
create index actividades_lote_idx  on public.actividades (lote_id);

-- ── actividad_lineas: cabezas y peso vivo por categoría ─────────────────────
create table public.actividad_lineas (
  actividad_id        uuid not null,
  establecimiento_id  uuid not null references public.establecimientos (id) on delete restrict,
  categoria_id        uuid not null,
  cabezas             int  not null check (cabezas > 0),
  peso_vivo_total_kg  numeric(10,1) check (peso_vivo_total_kg is null or peso_vivo_total_kg > 0),
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  primary key (actividad_id, categoria_id),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict,
  foreign key (categoria_id, establecimiento_id) references public.categorias_animales (id, establecimiento_id) on delete restrict
);

-- ── Detalles por tipo (uno a uno con la actividad) ──────────────────────────
create table public.act_compraventa (
  actividad_id       uuid primary key,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  modalidad          text not null check (modalidad in ('productor', 'remate', 'frigorifico', 'otra')),
  contraparte        text,
  kg_gancho          numeric(10,1) check (kg_gancho is null or kg_gancho > 0),   -- peso de carcasa (frigorífico)
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict
);

create table public.act_mortandad (
  actividad_id       uuid primary key,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  causa              text not null default 'Desconocida',   -- valor de parametros, clave causas_mortandad
  observaciones      text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict
);

create table public.act_paricion (
  actividad_id       uuid primary key,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  lote_cria_id       uuid not null,
  nacidos_muertos    int  not null default 0 check (nacidos_muertos >= 0),   -- no suman stock; para indicadores
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict,
  foreign key (lote_cria_id, establecimiento_id) references public.lotes (id, establecimiento_id) on delete restrict
  -- servicio_id y su FK a act_servicio se agregan en la Etapa 6b
);

-- ── movimientos_economicos ──────────────────────────────────────────────────
create table public.movimientos_economicos (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  fecha              date not null,
  sentido            text not null check (sentido in ('ingreso', 'egreso')),
  rubro_id           uuid not null,
  concepto           text not null check (btrim(concepto) <> ''),
  contraparte        text,
  monto_original     numeric(14,2) not null check (monto_original > 0),
  moneda_original    text not null check (moneda_original in ('USD', 'UYU')),
  tipo_cambio        numeric(10,4) check (tipo_cambio is null or tipo_cambio > 0),   -- pesos por dólar
  monto_usd          numeric(14,2) generated always as (
                       case when moneda_original = 'USD' then monto_original
                            else round(monto_original / tipo_cambio, 2) end
                     ) stored,
  actividad_id       uuid,
  lote_id            uuid,
  estado             text not null check (estado in ('pagado', 'pendiente')),
  fecha_pago         date,
  anulado_en         timestamptz,
  anulado_por        uuid,   -- auditoría, sin FK
  motivo_anulacion   text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (rubro_id, establecimiento_id)     references public.rubros (id, establecimiento_id) on delete restrict,
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict,
  foreign key (lote_id, establecimiento_id)      references public.lotes (id, establecimiento_id) on delete restrict,
  -- tipo de cambio: obligatorio con pesos, vacío con dólares
  check ((moneda_original = 'UYU') = (tipo_cambio is not null)),
  check ((anulado_en is null) = (anulado_por is null) and (anulado_en is null) = (motivo_anulacion is null)),
  check (motivo_anulacion is null or btrim(motivo_anulacion) <> '')
);

create index movimientos_economicos_fecha_idx     on public.movimientos_economicos (establecimiento_id, fecha desc);
create index movimientos_economicos_actividad_idx on public.movimientos_economicos (actividad_id) where actividad_id is not null;

-- ── lote_eventos: actividad que generó el evento ────────────────────────────
-- ADD COLUMN no modifica filas existentes (no choca con el trigger de inmutabilidad).
-- Regla en un solo sentido: parición, compra, venta y mortandad siempre vienen de una actividad.
-- No hay check de signo por tipo: los eventos inversos de la anulación (mismo tipo, signo opuesto) entran.
alter table public.lote_eventos add column actividad_id uuid;
alter table public.lote_eventos
  add constraint lote_eventos_actividad_fkey
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict;
alter table public.lote_eventos
  add constraint lote_eventos_actividad_check
  check (tipo not in ('paricion', 'compra', 'venta', 'mortandad') or actividad_id is not null);
create index lote_eventos_actividad_idx on public.lote_eventos (actividad_id) where actividad_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Triggers
-- ════════════════════════════════════════════════════════════════════════════

-- actividades: inmutable salvo UNA transición, la anulación (los tres datos juntos, una sola vez)
create function public.proteger_actividad() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'Las actividades no se borran: se anulan' using errcode = '42501';
  end if;
  if old.anulada_en is not null then
    raise exception 'La actividad ya está anulada' using errcode = '42501';
  end if;
  if new.anulada_en is null
     or (new.id, new.establecimiento_id, new.tipo, new.fecha, new.lote_id, new.lote_creado_id,
         new.persona_id, new.notas, new.created_by, new.created_at)
        is distinct from
        (old.id, old.establecimiento_id, old.tipo, old.fecha, old.lote_id, old.lote_creado_id,
         old.persona_id, old.notas, old.created_by, old.created_at) then
    raise exception 'Las actividades no se editan: solo se anulan' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_actividad() from public, anon, authenticated;

create trigger proteger before update or delete on public.actividades
  for each row execute function public.proteger_actividad();
create trigger sin_truncate before truncate on public.actividades
  for each statement execute function public.bloquear_modificacion();

-- Líneas y detalles: inmutables
create trigger inmutable before update or delete on public.actividad_lineas for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.actividad_lineas for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.act_compraventa  for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.act_compraventa  for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.act_mortandad    for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.act_mortandad    for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.act_paricion     for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.act_paricion     for each statement execute function public.bloquear_modificacion();

-- Movimientos económicos: no se borran (se anulan); se editan en la Etapa 7
create trigger set_updated_at before update on public.movimientos_economicos
  for each row execute function public.set_updated_at();
create trigger sin_borrado before delete on public.movimientos_economicos
  for each row execute function public.bloquear_borrado();
create trigger sin_truncate before truncate on public.movimientos_economicos
  for each statement execute function public.bloquear_borrado();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS y permisos: leen los miembros (consulta incluido); nadie escribe directo
-- ════════════════════════════════════════════════════════════════════════════

alter table public.actividades            enable row level security;
alter table public.actividad_lineas       enable row level security;
alter table public.act_compraventa        enable row level security;
alter table public.act_mortandad          enable row level security;
alter table public.act_paricion           enable row level security;
alter table public.movimientos_economicos enable row level security;

create policy actividades_select            on public.actividades            for select to authenticated using (public.es_miembro(establecimiento_id));
create policy actividad_lineas_select       on public.actividad_lineas       for select to authenticated using (public.es_miembro(establecimiento_id));
create policy act_compraventa_select        on public.act_compraventa        for select to authenticated using (public.es_miembro(establecimiento_id));
create policy act_mortandad_select          on public.act_mortandad          for select to authenticated using (public.es_miembro(establecimiento_id));
create policy act_paricion_select           on public.act_paricion           for select to authenticated using (public.es_miembro(establecimiento_id));
create policy movimientos_economicos_select on public.movimientos_economicos for select to authenticated using (public.es_miembro(establecimiento_id));

revoke all on public.actividades, public.actividad_lineas, public.act_compraventa, public.act_mortandad,
              public.act_paricion, public.movimientos_economicos from anon, authenticated;
grant select on public.actividades, public.actividad_lineas, public.act_compraventa, public.act_mortandad,
                public.act_paricion, public.movimientos_economicos to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Funciones internas
-- ════════════════════════════════════════════════════════════════════════════

-- Idempotencia. Serializa los intentos con el mismo id (bloqueo por id) y:
--   * si la actividad no existe: devuelve false (hay que crearla);
--   * si existe, del mismo tipo y establecimiento, cargada por el mismo usuario y con permiso vigente:
--     devuelve true (no se duplica nada);
--   * si existe con otro tipo, en otro establecimiento o la cargó otro usuario: 42501.
create function public._actividad_ya_registrada(p_id uuid, p_establecimiento_id uuid, p_tipo text) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v public.actividades;
begin
  if p_id is null then
    raise exception 'Falta el identificador de la actividad' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

  select * into v from public.actividades where id = p_id;
  if not found then
    return false;
  end if;
  if v.establecimiento_id is distinct from p_establecimiento_id or v.tipo <> p_tipo
     or v.created_by is distinct from auth.uid()
     or not public.puede_operar(v.establecimiento_id) then
    raise exception 'Identificador de actividad inválido' using errcode = '42501';
  end if;
  return true;
end;
$$;

-- Responsable: tiene que ser del establecimiento
create function public._exigir_persona(p_persona_id uuid, p_establecimiento_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_persona_id is not null and not exists (
    select 1 from public.personas p where p.id = p_persona_id and p.establecimiento_id = p_establecimiento_id
  ) then
    raise exception 'El responsable no es de este establecimiento' using errcode = '22023';
  end if;
end;
$$;

-- Stock de una categoría en un lote al cierre de una fecha
create function public._stock_categoria_al(p_lote_id uuid, p_categoria_id uuid, p_fecha date) returns int
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(e.cabezas), 0)::int
  from public.lote_eventos e
  where e.lote_id = p_lote_id and e.categoria_id = p_categoria_id and e.fecha <= p_fecha;
$$;

-- Inserta las líneas de una actividad y devuelve sus categorías.
-- p_peso: 'obligatorio' (pesada), 'opcional' (compra y venta) o 'no' (mortandad y parición).
create function public._insertar_lineas(
  p_actividad_id uuid, p_establecimiento_id uuid, p_especie_id uuid, p_lineas jsonb, p_peso text
) returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_cat  uuid;
  v_cab  int;
  v_peso numeric;
  v_cats uuid[] := '{}';
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Indicá al menos una categoría con cabezas' using errcode = '22023';
  end if;
  -- Solo cuenta las categorías presentes: una línea sin categoria_id la rechaza _exigir_categoria, con su propio mensaje
  if (select count(distinct x ->> 'categoria_id') <> count(x ->> 'categoria_id') from jsonb_array_elements(p_lineas) x) then
    raise exception 'Hay categorías repetidas' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_lineas) loop
    v_cat := nullif(v_item ->> 'categoria_id', '')::uuid;
    perform public._exigir_categoria(v_cat, p_especie_id);
    v_cab := public._cabezas(v_item -> 'cabezas');

    v_peso := null;
    if nullif(v_item ->> 'peso_vivo_total_kg', '') is not null then
      if p_peso = 'no' then
        raise exception 'Esta actividad no lleva peso' using errcode = '22023';
      end if;
      begin
        v_peso := (v_item ->> 'peso_vivo_total_kg')::numeric;
      exception when others then
        v_peso := null;
      end;
      if v_peso is null or v_peso <= 0 then
        raise exception 'El peso vivo tiene que ser un número mayor a cero' using errcode = '22023';
      end if;
    elsif p_peso = 'obligatorio' then
      raise exception 'Falta el peso vivo total de cada categoría' using errcode = '22023';
    end if;

    insert into public.actividad_lineas (actividad_id, establecimiento_id, categoria_id, cabezas, peso_vivo_total_kg)
    values (p_actividad_id, p_establecimiento_id, v_cat, v_cab, round(v_peso, 1));

    v_cats := array_append(v_cats, v_cat);
  end loop;

  return v_cats;
end;
$$;

-- Movimiento económico de una compra o venta. p_precio:
--   {"monto", "moneda": "USD"|"UYU", "tipo_cambio" (solo UYU), "estado": "pagado"|"pendiente",
--    "fecha_pago" (opcional), "rubro_id" (opcional: por defecto el rubro con el nombre de la especie)}
create function public._registrar_movimiento(
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
    select r.id into v_rubro
    from public.rubros r
    join public.especies s on s.id = p_especie_id
    where r.establecimiento_id = p_establecimiento_id and r.activo and lower(r.nombre) = lower(s.nombre)
    limit 1;
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

revoke execute on function public._actividad_ya_registrada(uuid, uuid, text)                 from public, anon, authenticated;
revoke execute on function public._exigir_persona(uuid, uuid)                                from public, anon, authenticated;
revoke execute on function public._stock_categoria_al(uuid, uuid, date)                     from public, anon, authenticated;
revoke execute on function public._insertar_lineas(uuid, uuid, uuid, jsonb, text)            from public, anon, authenticated;
revoke execute on function public._registrar_movimiento(uuid, uuid, uuid, uuid, date, text, text, text, jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Funciones de registro (una por tipo; idempotentes con p_id)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Pesada: no mueve stock; peso vivo obligatorio; no más cabezas que el stock a esa fecha ──
create function public.registrar_pesada(
  p_id         uuid,
  p_lote_id    uuid,
  p_fecha      date,
  p_lineas     jsonb,   -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"}]
  p_persona_id uuid default null,
  p_notas      text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
  v_cat  uuid;
  v_cab  int;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'pesada') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._exigir_persona(p_persona_id, v_lote.establecimiento_id);

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, v_lote.establecimiento_id, 'pesada', p_fecha, v_lote.id, p_persona_id, p_notas);

  perform public._insertar_lineas(p_id, v_lote.establecimiento_id, v_lote.especie_id, p_lineas, 'obligatorio');

  -- No se pesan más cabezas de las que había en la categoría ese día
  for v_cat, v_cab in select l.categoria_id, l.cabezas from public.actividad_lineas l where l.actividad_id = p_id loop
    if v_cab > public._stock_categoria_al(v_lote.id, v_cat, p_fecha) then
      raise exception 'Se pesan más cabezas de las que había en la categoría ese día (%)',
        public._stock_categoria_al(v_lote.id, v_cat, p_fecha) using errcode = '23514';
    end if;
  end loop;

  return p_id;
end;
$$;

-- ── Mortandad: baja por categoría ──
create function public.registrar_mortandad(
  p_id            uuid,
  p_lote_id       uuid,
  p_fecha         date,
  p_lineas        jsonb,   -- [{"categoria_id", "cabezas"}]
  p_causa         text default 'Desconocida',
  p_observaciones text default null,
  p_persona_id    uuid default null,
  p_notas         text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  public.lotes;
  v_causa text := coalesce(nullif(btrim(p_causa), ''), 'Desconocida');
  v_cat   uuid;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'mortandad') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._exigir_persona(p_persona_id, v_lote.establecimiento_id);

  if not exists (select 1 from public.parametros p where p.clave = 'causas_mortandad' and p.valor = v_causa and p.activo) then
    raise exception 'Causa de mortandad inválida' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, v_lote.establecimiento_id, 'mortandad', p_fecha, v_lote.id, p_persona_id, p_notas);

  insert into public.act_mortandad (actividad_id, establecimiento_id, causa, observaciones)
  values (p_id, v_lote.establecimiento_id, v_causa, nullif(btrim(coalesce(p_observaciones, '')), ''));

  perform public._insertar_lineas(p_id, v_lote.establecimiento_id, v_lote.especie_id, p_lineas, 'no');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select v_lote.establecimiento_id, v_lote.id, v_lote.especie_id, l.categoria_id, -l.cabezas, p_fecha, 'mortandad', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  for v_cat in select l.categoria_id from public.actividad_lineas l where l.actividad_id = p_id loop
    perform public._validar_saldo(v_lote.id, v_cat);
  end loop;

  return p_id;
end;
$$;

-- ── Compra: alta por categoría en un lote existente o en uno nuevo; precio opcional ──
create function public.registrar_compra(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_lineas             jsonb,                  -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
  p_modalidad          text,                   -- productor, remate, frigorifico, otra
  p_lote_id            uuid  default null,     -- destino existente...
  p_lote_nuevo         jsonb default null,     -- ...o nuevo: {"nombre", "especie_id", "potrero_id", "campana"}
  p_contraparte        text  default null,
  p_kg_gancho          numeric default null,
  p_precio             jsonb default null,     -- ver _registrar_movimiento; sin precio no hay movimiento
  p_persona_id         uuid  default null,
  p_notas              text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote    public.lotes;
  v_especie uuid;
  v_nuevo   uuid;
  v_total   int;
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'compra') then
    return p_id;
  end if;

  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  if (p_lote_id is null) = (p_lote_nuevo is null) then
    raise exception 'Indicá el lote destino: uno existente o uno nuevo' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_kg_gancho is not null and p_kg_gancho <= 0 then
    raise exception 'Los kg al gancho tienen que ser mayores a cero' using errcode = '22023';
  end if;
  perform public._exigir_persona(p_persona_id, p_establecimiento_id);

  if p_lote_id is not null then
    v_lote := public._bloquear_lote_editable(p_lote_id);
    if v_lote.establecimiento_id <> p_establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote está cerrado' using errcode = '22023';
    end if;
    perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  else
    v_especie := nullif(p_lote_nuevo ->> 'especie_id', '')::uuid;
    if btrim(coalesce(p_lote_nuevo ->> 'nombre', '')) = '' then
      raise exception 'El lote nuevo necesita un nombre' using errcode = '22023';
    end if;
    if not exists (select 1 from public.especies s where s.id = v_especie and s.establecimiento_id = p_establecimiento_id and s.activo) then
      raise exception 'Especie inexistente o inactiva en este establecimiento' using errcode = '22023';
    end if;
    insert into public.lotes (establecimiento_id, especie_id, nombre, campana, fecha_apertura, potrero_id)
    values (
      p_establecimiento_id, v_especie, btrim(p_lote_nuevo ->> 'nombre'),
      nullif(btrim(coalesce(p_lote_nuevo ->> 'campana', '')), ''), p_fecha,
      nullif(p_lote_nuevo ->> 'potrero_id', '')::uuid
    )
    returning id into v_nuevo;
    select * into v_lote from public.lotes where id = v_nuevo;
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, lote_creado_id, persona_id, notas)
  values (p_id, p_establecimiento_id, 'compra', p_fecha, v_lote.id, v_nuevo, p_persona_id, p_notas);

  insert into public.act_compraventa (actividad_id, establecimiento_id, modalidad, contraparte, kg_gancho)
  values (p_id, p_establecimiento_id, p_modalidad, nullif(btrim(coalesce(p_contraparte, '')), ''), round(p_kg_gancho, 1));

  perform public._insertar_lineas(p_id, p_establecimiento_id, v_lote.especie_id, p_lineas, 'opcional');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select p_establecimiento_id, v_lote.id, v_lote.especie_id, l.categoria_id, l.cabezas, p_fecha, 'compra', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  if p_precio is not null then
    select sum(l.cabezas) into v_total from public.actividad_lineas l where l.actividad_id = p_id;
    perform public._registrar_movimiento(
      p_establecimiento_id, p_id, v_lote.id, v_lote.especie_id, p_fecha, 'egreso',
      'Compra de ' || v_total || ' cabezas (' || v_lote.nombre || ')', p_contraparte, p_precio);
  end if;

  return p_id;
end;
$$;

-- ── Venta: baja por categoría; precio opcional; si el lote queda en cero, se cierra ("Vendido") ──
create function public.registrar_venta(
  p_id          uuid,
  p_lote_id     uuid,
  p_fecha       date,
  p_lineas      jsonb,                  -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
  p_modalidad   text,
  p_contraparte text    default null,
  p_kg_gancho   numeric default null,
  p_precio      jsonb   default null,
  p_persona_id  uuid    default null,
  p_notas       text    default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  public.lotes;
  v_cat   uuid;
  v_total int;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'venta') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._exigir_persona(p_persona_id, v_lote.establecimiento_id);
  if p_kg_gancho is not null and p_kg_gancho <= 0 then
    raise exception 'Los kg al gancho tienen que ser mayores a cero' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, v_lote.establecimiento_id, 'venta', p_fecha, v_lote.id, p_persona_id, p_notas);

  insert into public.act_compraventa (actividad_id, establecimiento_id, modalidad, contraparte, kg_gancho)
  values (p_id, v_lote.establecimiento_id, p_modalidad, nullif(btrim(coalesce(p_contraparte, '')), ''), round(p_kg_gancho, 1));

  perform public._insertar_lineas(p_id, v_lote.establecimiento_id, v_lote.especie_id, p_lineas, 'opcional');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select v_lote.establecimiento_id, v_lote.id, v_lote.especie_id, l.categoria_id, -l.cabezas, p_fecha, 'venta', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  for v_cat in select l.categoria_id from public.actividad_lineas l where l.actividad_id = p_id loop
    perform public._validar_saldo(v_lote.id, v_cat);
  end loop;

  if p_precio is not null then
    select sum(l.cabezas) into v_total from public.actividad_lineas l where l.actividad_id = p_id;
    perform public._registrar_movimiento(
      v_lote.establecimiento_id, p_id, v_lote.id, v_lote.especie_id, p_fecha, 'ingreso',
      'Venta de ' || v_total || ' cabezas (' || v_lote.nombre || ')', p_contraparte, p_precio);
  end if;

  perform public._cerrar_si_vacio(v_lote.id, p_fecha, 'Vendido');

  return p_id;
end;
$$;

-- ── Parición: crías vivas al lote de cría (existente o nuevo); nacidos muertos sin stock ──
create function public.registrar_paricion(
  p_id               uuid,
  p_lote_madres_id   uuid,
  p_fecha            date,
  p_lineas           jsonb,                  -- crías vivas: [{"categoria_id", "cabezas"}]
  p_nacidos_muertos  int   default 0,
  p_lote_cria_id     uuid  default null,     -- lote de cría existente...
  p_lote_cria_nuevo  jsonb default null,     -- ...o nuevo: {"nombre", "potrero_id", "campana"}
  p_persona_id       uuid  default null,
  p_notas            text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_madres public.lotes;
  v_cria   public.lotes;
  v_nuevo  uuid;
  v_id     uuid;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_madres_id), 'paricion') then
    return p_id;
  end if;

  if p_lote_madres_id is null then
    raise exception 'Indicá el lote de las madres' using errcode = '22023';
  end if;
  if (p_lote_cria_id is null) = (p_lote_cria_nuevo is null) then
    raise exception 'Indicá el lote de cría: uno existente o uno nuevo' using errcode = '22023';
  end if;
  if p_lote_cria_id is not null and p_lote_cria_id = p_lote_madres_id then
    raise exception 'El lote de cría no puede ser el de las madres' using errcode = '22023';
  end if;
  if coalesce(p_nacidos_muertos, 0) < 0 then   -- NULL cuenta como 0
    raise exception 'Los nacidos muertos tienen que ser cero o más' using errcode = '22023';
  end if;

  -- Bloqueo de los dos lotes ordenados por id (evita bloqueos cruzados)
  foreach v_id in array (select array_agg(x order by x) from unnest(array[p_lote_madres_id, p_lote_cria_id]) x where x is not null) loop
    if v_id = p_lote_madres_id then
      v_madres := public._bloquear_lote_editable(v_id);
    else
      v_cria := public._bloquear_lote_editable(v_id);
    end if;
  end loop;

  if v_madres.estado <> 'activo' then
    raise exception 'El lote de madres está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_madres.fecha_apertura);
  perform public._exigir_persona(p_persona_id, v_madres.establecimiento_id);

  if p_lote_cria_id is not null then
    -- Lote de cría existente: activo, del mismo establecimiento y de la misma especie
    if v_cria.establecimiento_id <> v_madres.establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_cria.estado <> 'activo' then
      raise exception 'El lote de cría está cerrado' using errcode = '22023';
    end if;
    if v_cria.especie_id <> v_madres.especie_id then
      raise exception 'El lote de cría tiene que ser de la misma especie que el de las madres' using errcode = '22023';
    end if;
    if p_fecha < v_cria.fecha_apertura then
      raise exception 'La fecha no puede ser anterior a la apertura del lote de cría' using errcode = '22023';
    end if;
  else
    if btrim(coalesce(p_lote_cria_nuevo ->> 'nombre', '')) = '' then
      raise exception 'El lote de cría nuevo necesita un nombre' using errcode = '22023';
    end if;
    insert into public.lotes (establecimiento_id, especie_id, nombre, campana, fecha_apertura, potrero_id)
    values (
      v_madres.establecimiento_id, v_madres.especie_id, btrim(p_lote_cria_nuevo ->> 'nombre'),
      nullif(btrim(coalesce(p_lote_cria_nuevo ->> 'campana', '')), ''), p_fecha,
      nullif(p_lote_cria_nuevo ->> 'potrero_id', '')::uuid
    )
    returning id into v_nuevo;
    select * into v_cria from public.lotes where id = v_nuevo;
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, lote_creado_id, persona_id, notas)
  values (p_id, v_madres.establecimiento_id, 'paricion', p_fecha, v_madres.id, v_nuevo, p_persona_id, p_notas);

  insert into public.act_paricion (actividad_id, establecimiento_id, lote_cria_id, nacidos_muertos)
  values (p_id, v_madres.establecimiento_id, v_cria.id, coalesce(p_nacidos_muertos, 0));

  -- Las categorías de las crías tienen que ser de la especie (la del lote de madres y de cría)
  perform public._insertar_lineas(p_id, v_madres.establecimiento_id, v_madres.especie_id, p_lineas, 'no');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select v_madres.establecimiento_id, v_cria.id, v_cria.especie_id, l.categoria_id, l.cabezas, p_fecha, 'paricion', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  return p_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Anular una actividad
-- ════════════════════════════════════════════════════════════════════════════
-- Eventos inversos con la fecha de la actividad original (mismo tipo y actividad_id, signo
-- opuesto); saldo día por día; anula el movimiento económico; reabre un lote cerrado que
-- vuelve a tener animales; cierra el lote que creó la actividad si queda vacío.

create function public.anular_actividad(p_actividad_id uuid, p_motivo text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act    public.actividades;
  v_id     uuid;
  v_lote   public.lotes;
  r        record;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_nombre text;   -- tipo de actividad para los motivos ("Anulación de parición: ...")
begin
  select * into v_act from public.actividades where id = p_actividad_id for update;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Actividad inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_act.anulada_en is not null then
    raise exception 'La actividad ya está anulada' using errcode = '22023';
  end if;
  if v_motivo = '' then
    raise exception 'Indicá el motivo de la anulación' using errcode = '22023';
  end if;
  v_nombre := case v_act.tipo when 'paricion' then 'parición' else v_act.tipo end;

  -- 1. Bloquear los lotes afectados, ordenados por id
  foreach v_id in array coalesce((
    select array_agg(distinct x order by x)
    from (
      select e.lote_id as x from public.lote_eventos e where e.actividad_id = v_act.id
      union select v_act.lote_id
    ) l
    where x is not null
  ), '{}'::uuid[]) loop
    perform public._bloquear_lote_editable(v_id);
  end loop;

  -- 2. Eventos inversos, con la fecha original
  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id, nota)
  select e.establecimiento_id, e.lote_id, e.especie_id, e.categoria_id, -e.cabezas, e.fecha, e.tipo, e.actividad_id,
         'Anulación: ' || v_motivo
  from public.lote_eventos e
  where e.actividad_id = v_act.id;

  -- 3. Saldo día por día en cada lote y categoría tocados
  for r in select distinct e.lote_id, e.categoria_id from public.lote_eventos e where e.actividad_id = v_act.id loop
    perform public._validar_saldo(r.lote_id, r.categoria_id);
  end loop;

  -- 4. Movimiento económico asociado
  update public.movimientos_economicos
  set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = 'Actividad anulada: ' || v_motivo
  where actividad_id = v_act.id and anulado_en is null;

  -- 5. Lotes: reabrir los cerrados que vuelven a tener animales; cerrar el creado por la actividad si queda vacío
  for v_id in select distinct e.lote_id from public.lote_eventos e where e.actividad_id = v_act.id loop
    select * into v_lote from public.lotes where id = v_id;
    if v_lote.estado = 'cerrado' and exists (
      select 1 from public.lote_eventos e where e.lote_id = v_id group by e.categoria_id having sum(e.cabezas) <> 0
    ) then
      update public.lotes set estado = 'activo', fecha_cierre = null where id = v_id;
      insert into public.lote_cambios_estado (establecimiento_id, lote_id, tipo, fecha, motivo)
      values (v_lote.establecimiento_id, v_id, 'reapertura', greatest(public.fecha_hoy(), v_lote.fecha_cierre),
              'Anulación de ' || v_nombre || ': ' || v_motivo);
    end if;
  end loop;

  if v_act.lote_creado_id is not null then
    perform public._cerrar_si_vacio(v_act.lote_creado_id, v_act.fecha, 'Anulación de ' || v_nombre || ': ' || v_motivo);
  end if;

  -- 6. Marca de anulación (el trigger solo permite esta transición)
  update public.actividades
  set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = v_motivo
  where id = v_act.id;
end;
$$;

revoke execute on function public.registrar_pesada(uuid, uuid, date, jsonb, uuid, text)                                        from public, anon;
revoke execute on function public.registrar_mortandad(uuid, uuid, date, jsonb, text, text, uuid, text)                         from public, anon;
revoke execute on function public.registrar_compra(uuid, uuid, date, jsonb, text, uuid, jsonb, text, numeric, jsonb, uuid, text) from public, anon;
revoke execute on function public.registrar_venta(uuid, uuid, date, jsonb, text, text, numeric, jsonb, uuid, text)             from public, anon;
revoke execute on function public.registrar_paricion(uuid, uuid, date, jsonb, int, uuid, jsonb, uuid, text)                    from public, anon;
revoke execute on function public.anular_actividad(uuid, text)                                                                 from public, anon;
grant  execute on function public.registrar_pesada(uuid, uuid, date, jsonb, uuid, text)                                        to authenticated;
grant  execute on function public.registrar_mortandad(uuid, uuid, date, jsonb, text, text, uuid, text)                         to authenticated;
grant  execute on function public.registrar_compra(uuid, uuid, date, jsonb, text, uuid, jsonb, text, numeric, jsonb, uuid, text) to authenticated;
grant  execute on function public.registrar_venta(uuid, uuid, date, jsonb, text, text, numeric, jsonb, uuid, text)             to authenticated;
grant  execute on function public.registrar_paricion(uuid, uuid, date, jsonb, int, uuid, jsonb, uuid, text)                    to authenticated;
grant  execute on function public.anular_actividad(uuid, text)                                                                 to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Vista para listar: totales, detalle, rendimiento y monto (security_invoker: el RLS aplica)
-- ════════════════════════════════════════════════════════════════════════════
-- Peso promedio y rendimiento se calculan acá; no se guardan.

create view public.v_actividades
with (security_invoker = true) as
select
  a.id,
  a.establecimiento_id,
  a.tipo,
  a.fecha,
  a.lote_id,
  a.lote_creado_id,
  a.persona_id,
  a.notas,
  a.anulada_en,
  a.anulada_por,
  a.motivo_anulacion,
  a.created_by,
  a.created_at,
  l.cabezas,
  l.peso_vivo_total_kg,
  case when l.peso_vivo_total_kg is not null and l.cabezas_con_peso > 0
       then round(l.peso_vivo_total_kg / l.cabezas_con_peso, 1) end                     as peso_promedio_kg,
  cv.modalidad,
  cv.contraparte,
  cv.kg_gancho,
  case when cv.kg_gancho is not null and l.peso_vivo_total_kg > 0
       then round(cv.kg_gancho / l.peso_vivo_total_kg * 100, 1) end                    as rendimiento_pct,
  m.causa,
  m.observaciones,
  p.lote_cria_id,
  p.nacidos_muertos,
  (select sum(me.monto_usd) from public.movimientos_economicos me
    where me.actividad_id = a.id and me.anulado_en is null)                             as monto_usd
from public.actividades a
left join lateral (
  select sum(x.cabezas)::int as cabezas,
         sum(x.peso_vivo_total_kg) as peso_vivo_total_kg,
         sum(x.cabezas) filter (where x.peso_vivo_total_kg is not null)::int as cabezas_con_peso
  from public.actividad_lineas x where x.actividad_id = a.id
) l on true
left join public.act_compraventa cv on cv.actividad_id = a.id
left join public.act_mortandad   m  on m.actividad_id  = a.id
left join public.act_paricion    p  on p.actividad_id  = a.id;

revoke all    on public.v_actividades from anon, authenticated;
grant  select on public.v_actividades to authenticated;

commit;
