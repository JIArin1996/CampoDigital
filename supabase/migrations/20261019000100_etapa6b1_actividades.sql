-- Campo Digital v2 — Etapa 6b-1: actividades que no mueven stock
--
-- Sanidad (uno o más productos, uno o más lotes), servicio, diagnóstico de gestación,
-- esquila (uno o más lotes ovinos) y personalizada (uno o más lotes). Varios lotes por
-- actividad con actividad_lotes, carencias propagadas a los lotes descendientes.
-- Diseño: contexto/DISENO-BASE-ETAPA-6B.md (partición 6b-1; el destete es la 6b-2).
--
-- Criterios de siempre: uuid, created_by sin FK, FKs compuestas con establecimiento_id,
-- nada se borra, escrituras solo por funciones security definer (search_path fijo,
-- validan puede_operar), p_id idempotente, y todo objeto nuevo nace sin permisos.
-- Las funciones registrar_* de la 6a no cambian: los triggers completan actividad_lotes.
-- Se reemplazan anular_actividad (lotes a bloquear desde actividad_lotes) y _cargar_catalogos_base
-- (grupo de cada especie); especies gana la columna grupo (bovino, ovino, otro).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Valores de parametros
-- ════════════════════════════════════════════════════════════════════════════

insert into public.parametros (clave, valor, orden)
select 'categorias_sanidad', c.valor, c.orden::int
from unnest(array['Vacunación', 'Antiparasitario', 'Tratamiento', 'Curación', 'Otro']) with ordinality as c(valor, orden)
on conflict (clave, valor) do nothing;

insert into public.parametros (clave, valor, orden)
select 'vias_aplicacion', c.valor, c.orden::int
from unnest(array['Inyectable', 'Oral', 'Pour-on', 'Otra']) with ordinality as c(valor, orden)
on conflict (clave, valor) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 bis. especies.grupo: bovino, ovino u otro (la esquila no depende del nombre)
-- ════════════════════════════════════════════════════════════════════════════
-- Las especies existentes se clasifican por el nombre del catálogo base. Desde acá el
-- grupo es un dato propio: renombrar "Ovinos" no cambia lo que es.

alter table public.especies
  add column grupo text not null default 'otro' check (grupo in ('bovino', 'ovino', 'otro'));

update public.especies
set grupo = case lower(btrim(nombre)) when 'vacunos' then 'bovino' when 'ovinos' then 'ovino' else 'otro' end;

-- El administrador lo carga y lo cambia (las políticas de especies ya son solo para el administrador)
grant insert (grupo) on public.especies to authenticated;
grant update (grupo) on public.especies to authenticated;

-- Catálogo base de un establecimiento nuevo: igual que antes, con el grupo de cada especie
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

  insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden)
  select p_establecimiento_id, v_vacunos, c.nombre, c.orden::int
  from unnest(array[
    'Terneros', 'Terneras', 'Vaquillonas', 'Novillos',
    'Vacas de cría', 'Vacas de invernada o descarte', 'Toros'
  ]) with ordinality as c(nombre, orden);

  insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden)
  select p_establecimiento_id, v_ovinos, c.nombre, c.orden::int
  from unnest(array[
    'Corderos', 'Corderas', 'Borregos', 'Borregas',
    'Ovejas de cría', 'Ovejas de descarte', 'Carneros'
  ]) with ordinality as c(nombre, orden);

  insert into public.rubros (establecimiento_id, nombre)
  select p_establecimiento_id, r.nombre
  from unnest(array['Vacunos', 'Ovinos', 'Forestación tercerizada', 'General']) as r(nombre);
end;
$$;

revoke execute on function public._cargar_catalogos_base(uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. actividad_lotes: a qué lotes concierne cada actividad (todos los tipos)
-- ════════════════════════════════════════════════════════════════════════════
-- principal: el lote sobre el que se hizo; cria: lote de cría de la parición;
-- origen y destino: destete (6b-2). Los tipos de un lote conservan actividades.lote_id.

create table public.actividad_lotes (
  actividad_id       uuid not null,
  lote_id            uuid not null,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  rol                text not null check (rol in ('principal', 'cria', 'origen', 'destino')),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  primary key (actividad_id, lote_id, rol),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict,
  foreign key (lote_id, establecimiento_id)      references public.lotes (id, establecimiento_id) on delete restrict
);

create index actividad_lotes_lote_idx on public.actividad_lotes (lote_id);

create trigger inmutable before update or delete on public.actividad_lotes for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.actividad_lotes for each statement execute function public.bloquear_modificacion();

-- Carga de las actividades ya registradas (6a): el lote principal y el lote de cría de las pariciones
insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol, created_by, created_at)
select a.id, a.lote_id, a.establecimiento_id, 'principal', a.created_by, a.created_at
from public.actividades a
where a.lote_id is not null;

insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol, created_by, created_at)
select p.actividad_id, p.lote_cria_id, p.establecimiento_id, 'cria', p.created_by, p.created_at
from public.act_paricion p;

-- Triggers que la completan solos: las funciones de la 6a no cambian.
-- security definer (escriben en una tabla sin permisos de escritura), search_path fijo,
-- y sin execute para nadie (solo los dispara la base).
create function public.actividad_lotes_desde_actividad() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  values (new.id, new.lote_id, new.establecimiento_id, 'principal');
  return null;
end;
$$;

create function public.actividad_lotes_desde_paricion() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  values (new.actividad_id, new.lote_cria_id, new.establecimiento_id, 'cria');
  return null;
end;
$$;

revoke execute on function public.actividad_lotes_desde_actividad() from public, anon, authenticated;
revoke execute on function public.actividad_lotes_desde_paricion() from public, anon, authenticated;

create trigger actividad_lotes after insert on public.actividades
  for each row when (new.lote_id is not null) execute function public.actividad_lotes_desde_actividad();
create trigger actividad_lotes after insert on public.act_paricion
  for each row execute function public.actividad_lotes_desde_paricion();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. operaciones_lote.actividad_id (lo completa el destete de la 6b-2)
-- ════════════════════════════════════════════════════════════════════════════
-- Se agrega ya para que v_carencias excluya las operaciones de actividades anuladas sin
-- reemplazarla después. ADD COLUMN no modifica filas (no choca con el trigger de inmutabilidad).

alter table public.operaciones_lote add column actividad_id uuid;
alter table public.operaciones_lote
  add constraint operaciones_lote_actividad_fkey
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Detalles por tipo (uno a uno con la actividad, salvo los productos; inmutables)
-- ════════════════════════════════════════════════════════════════════════════

create table public.act_sanidad_productos (
  actividad_id        uuid not null,
  establecimiento_id  uuid not null references public.establecimientos (id) on delete restrict,
  orden               int  not null check (orden > 0),
  producto            text not null check (btrim(producto) <> ''),
  categoria           text not null,   -- parametros, clave categorias_sanidad
  dosis               text,
  via                 text,            -- parametros, clave vias_aplicacion
  carencia_dias       int  check (carencia_dias is null or carencia_dias >= 0),
  fecha_proxima_dosis date,            -- la usa el calendario de la Etapa 8
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  primary key (actividad_id, orden),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict
);

create table public.act_servicio (
  actividad_id       uuid primary key,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  vacas_entoradas    int  not null check (vacas_entoradas > 0),
  toros              int  check (toros is null or toros > 0),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict
);

create table public.act_diagnostico (
  actividad_id         uuid primary key,
  establecimiento_id   uuid not null references public.establecimientos (id) on delete restrict,
  vacas_diagnosticadas int  not null check (vacas_diagnosticadas > 0),
  vacas_prenadas       int  not null check (vacas_prenadas >= 0),
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  check (vacas_prenadas <= vacas_diagnosticadas),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict
);

create table public.act_esquila (
  actividad_id       uuid primary key,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  kg_lana_total      numeric(10,1) not null check (kg_lana_total > 0),   -- uno para toda la carga; sin precio
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict
);

create table public.act_personalizada (
  actividad_id       uuid primary key,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text  not null check (btrim(nombre) <> ''),
  campos             jsonb not null default '[]'::jsonb check (jsonb_typeof(campos) = 'array'),   -- [{campo, valor}]
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict
);

create trigger inmutable before update or delete on public.act_sanidad_productos for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.act_sanidad_productos for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.act_servicio          for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.act_servicio          for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.act_diagnostico       for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.act_diagnostico       for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.act_esquila           for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.act_esquila           for each statement execute function public.bloquear_modificacion();
create trigger inmutable before update or delete on public.act_personalizada     for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.act_personalizada     for each statement execute function public.bloquear_modificacion();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RLS y permisos: leen los miembros (consulta incluido); nadie escribe directo
-- ════════════════════════════════════════════════════════════════════════════

alter table public.actividad_lotes       enable row level security;
alter table public.act_sanidad_productos enable row level security;
alter table public.act_servicio          enable row level security;
alter table public.act_diagnostico       enable row level security;
alter table public.act_esquila           enable row level security;
alter table public.act_personalizada     enable row level security;

create policy actividad_lotes_select       on public.actividad_lotes       for select to authenticated using (public.es_miembro(establecimiento_id));
create policy act_sanidad_productos_select on public.act_sanidad_productos for select to authenticated using (public.es_miembro(establecimiento_id));
create policy act_servicio_select          on public.act_servicio          for select to authenticated using (public.es_miembro(establecimiento_id));
create policy act_diagnostico_select       on public.act_diagnostico       for select to authenticated using (public.es_miembro(establecimiento_id));
create policy act_esquila_select           on public.act_esquila           for select to authenticated using (public.es_miembro(establecimiento_id));
create policy act_personalizada_select     on public.act_personalizada     for select to authenticated using (public.es_miembro(establecimiento_id));

revoke all on public.actividad_lotes, public.act_sanidad_productos, public.act_servicio, public.act_diagnostico,
              public.act_esquila, public.act_personalizada from anon, authenticated;
grant select on public.actividad_lotes, public.act_sanidad_productos, public.act_servicio, public.act_diagnostico,
                public.act_esquila, public.act_personalizada to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Funciones internas
-- ════════════════════════════════════════════════════════════════════════════

-- Lotes de una actividad de varios lotes: al menos uno, sin repetidos ni nulos, todos activos,
-- del establecimiento y con permiso de carga; fecha ni futura ni anterior a la apertura de ninguno.
-- Los bloquea ordenados por id (evita bloqueos cruzados).
create function public._bloquear_lotes_actividad(p_establecimiento_id uuid, p_lotes uuid[], p_fecha date) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id   uuid;
  v_lote public.lotes;
begin
  if p_lotes is null or cardinality(p_lotes) = 0 then
    raise exception 'Elegí al menos un lote' using errcode = '22023';
  end if;
  if array_position(p_lotes, null) is not null then
    raise exception 'Hay un lote vacío en la lista' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_lotes) x) <> cardinality(p_lotes) then
    raise exception 'Hay lotes repetidos' using errcode = '22023';
  end if;

  foreach v_id in array (select array_agg(x order by x) from unnest(p_lotes) x) loop
    v_lote := public._bloquear_lote_editable(v_id);
    if v_lote.establecimiento_id <> p_establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote % está cerrado', v_lote.nombre using errcode = '22023';
    end if;
    perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  end loop;
end;
$$;

-- Entero opcional de un valor jsonb: null si falta o está vacío; error si no es un número entero
create function public._entero_jsonb(p_valor jsonb, p_campo text) returns int
language plpgsql
set search_path = ''
as $$
declare
  v_texto text := p_valor #>> '{}';
  v       numeric;
begin
  if v_texto is null or btrim(v_texto) = '' then
    return null;
  end if;
  begin
    v := v_texto::numeric;
  exception when others then
    v := null;
  end;
  if v is null or v <> trunc(v) then
    raise exception '% tiene que ser un número entero', p_campo using errcode = '22023';
  end if;
  return v::int;
end;
$$;

revoke execute on function public._bloquear_lotes_actividad(uuid, uuid[], date) from public, anon, authenticated;
revoke execute on function public._entero_jsonb(jsonb, text)                    from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Funciones de registro (una por tipo; idempotentes con p_id; no mueven stock)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Sanidad: uno o más lotes, uno o más productos (se entiende que fue a todo el lote) ──
create function public.registrar_sanidad(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_productos          jsonb,   -- [{"producto", "categoria", "dosis"?, "via"?, "carencia_dias"?, "fecha_proxima_dosis"?}]
  p_persona_id         uuid default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item      jsonb;
  v_orden     bigint;
  v_producto  text;
  v_categoria text;
  v_via       text;
  v_carencia  int;
  v_proxima   date;
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'sanidad') then
    return p_id;
  end if;
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._bloquear_lotes_actividad(p_establecimiento_id, p_lotes, p_fecha);
  perform public._exigir_persona(p_persona_id, p_establecimiento_id);

  if p_productos is null or jsonb_typeof(p_productos) <> 'array' or jsonb_array_length(p_productos) = 0 then
    raise exception 'Indicá al menos un producto' using errcode = '22023';
  end if;
  if jsonb_array_length(p_productos) > 20 then
    raise exception 'Hasta 20 productos por carga' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, p_establecimiento_id, 'sanidad', p_fecha, null, p_persona_id, p_notas);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  for v_item, v_orden in select e.valor, e.n from jsonb_array_elements(p_productos) with ordinality as e(valor, n) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Producto mal formado' using errcode = '22023';
    end if;

    v_producto := btrim(coalesce(v_item ->> 'producto', ''));
    if v_producto = '' then
      raise exception 'Cada producto necesita un nombre' using errcode = '22023';
    end if;

    v_categoria := btrim(coalesce(v_item ->> 'categoria', ''));
    if not exists (select 1 from public.parametros p where p.clave = 'categorias_sanidad' and p.valor = v_categoria and p.activo) then
      raise exception 'Categoría de sanidad inválida' using errcode = '22023';
    end if;

    v_via := nullif(btrim(coalesce(v_item ->> 'via', '')), '');
    if v_via is not null
       and not exists (select 1 from public.parametros p where p.clave = 'vias_aplicacion' and p.valor = v_via and p.activo) then
      raise exception 'Vía de aplicación inválida' using errcode = '22023';
    end if;

    v_carencia := public._entero_jsonb(v_item -> 'carencia_dias', 'La carencia');
    if v_carencia < 0 then
      raise exception 'La carencia no puede ser negativa' using errcode = '22023';
    end if;

    begin
      v_proxima := nullif(btrim(coalesce(v_item ->> 'fecha_proxima_dosis', '')), '')::date;
    exception when others then
      raise exception 'Fecha de próxima dosis inválida' using errcode = '22023';
    end;
    if v_proxima is not null and v_proxima <= p_fecha then
      raise exception 'La próxima dosis tiene que ser posterior a la fecha de la sanidad' using errcode = '22023';
    end if;

    insert into public.act_sanidad_productos (actividad_id, establecimiento_id, orden, producto, categoria, dosis, via,
                                              carencia_dias, fecha_proxima_dosis)
    values (p_id, p_establecimiento_id, v_orden, v_producto, v_categoria,
            nullif(btrim(coalesce(v_item ->> 'dosis', '')), ''), v_via, v_carencia, v_proxima);
  end loop;

  return p_id;
end;
$$;

-- ── Servicio: un lote; vacas entoradas obligatorias; toros opcionales ──
-- No se compara contra el stock (la app avisa): solo la coherencia interna.
create function public.registrar_servicio(
  p_id              uuid,
  p_lote_id         uuid,
  p_fecha           date,
  p_vacas_entoradas int,
  p_toros           int  default null,
  p_persona_id      uuid default null,
  p_notas           text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'servicio') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._exigir_persona(p_persona_id, v_lote.establecimiento_id);

  if p_vacas_entoradas is null or p_vacas_entoradas <= 0 then
    raise exception 'Las vacas entoradas tienen que ser más de cero' using errcode = '22023';
  end if;
  if p_toros is not null and p_toros <= 0 then
    raise exception 'Los toros tienen que ser más de cero (o dejarlo vacío)' using errcode = '22023';
  end if;

  -- El trigger agrega la fila principal en actividad_lotes
  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, v_lote.establecimiento_id, 'servicio', p_fecha, v_lote.id, p_persona_id, p_notas);

  insert into public.act_servicio (actividad_id, establecimiento_id, vacas_entoradas, toros)
  values (p_id, v_lote.establecimiento_id, p_vacas_entoradas, p_toros);

  return p_id;
end;
$$;

-- ── Diagnóstico de gestación: un lote; diagnosticadas > 0; 0 <= preñadas <= diagnosticadas ──
create function public.registrar_diagnostico(
  p_id                   uuid,
  p_lote_id              uuid,
  p_fecha                date,
  p_vacas_diagnosticadas int,
  p_vacas_prenadas       int,
  p_persona_id           uuid default null,
  p_notas                text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'diagnostico_gestacion') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._exigir_persona(p_persona_id, v_lote.establecimiento_id);

  if p_vacas_diagnosticadas is null or p_vacas_diagnosticadas <= 0 then
    raise exception 'Las vacas diagnosticadas tienen que ser más de cero' using errcode = '22023';
  end if;
  if p_vacas_prenadas is null or p_vacas_prenadas < 0 then
    raise exception 'Las vacas preñadas tienen que ser cero o más' using errcode = '22023';
  end if;
  if p_vacas_prenadas > p_vacas_diagnosticadas then
    raise exception 'Las preñadas no pueden ser más que las diagnosticadas' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, v_lote.establecimiento_id, 'diagnostico_gestacion', p_fecha, v_lote.id, p_persona_id, p_notas);

  insert into public.act_diagnostico (actividad_id, establecimiento_id, vacas_diagnosticadas, vacas_prenadas)
  values (p_id, v_lote.establecimiento_id, p_vacas_diagnosticadas, p_vacas_prenadas);

  return p_id;
end;
$$;

-- ── Esquila: uno o más lotes, todos ovinos; un kg de lana total para la carga ──
create function public.registrar_esquila(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_kg_lana_total      numeric,
  p_persona_id         uuid default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'esquila') then
    return p_id;
  end if;
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._bloquear_lotes_actividad(p_establecimiento_id, p_lotes, p_fecha);
  perform public._exigir_persona(p_persona_id, p_establecimiento_id);

  -- Ovino = especie del grupo 'ovino' (no depende del nombre)
  if exists (
    select 1 from unnest(p_lotes) x
    join public.lotes l on l.id = x
    join public.especies s on s.id = l.especie_id
    where s.grupo <> 'ovino'
  ) then
    raise exception 'La esquila es solo para lotes ovinos' using errcode = '22023';
  end if;
  -- Se valida ya redondeado a 1 decimal (lo que se guarda): 0,04 kg daría 0,0
  if p_kg_lana_total is null or round(p_kg_lana_total, 1) <= 0 then
    raise exception 'Los kg de lana tienen que ser más de cero' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, p_establecimiento_id, 'esquila', p_fecha, null, p_persona_id, p_notas);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  insert into public.act_esquila (actividad_id, establecimiento_id, kg_lana_total)
  values (p_id, p_establecimiento_id, round(p_kg_lana_total, 1));

  return p_id;
end;
$$;

-- ── Personalizada: uno o más lotes, nombre obligatorio, hasta 20 pares campo-valor de texto ──
create function public.registrar_personalizada(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_nombre             text,
  p_campos             jsonb default null,   -- [{"campo", "valor"}]
  p_persona_id         uuid  default null,
  p_notas              text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campos jsonb := coalesce(p_campos, '[]'::jsonb);
  v_item   jsonb;
  v_campo  text;
  v_valor  text;
  v_norm   jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'personalizada') then
    return p_id;
  end if;
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._bloquear_lotes_actividad(p_establecimiento_id, p_lotes, p_fecha);
  perform public._exigir_persona(p_persona_id, p_establecimiento_id);

  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'La actividad necesita un nombre' using errcode = '22023';
  end if;
  if jsonb_typeof(v_campos) <> 'array' then
    raise exception 'Los campos tienen que ser una lista' using errcode = '22023';
  end if;
  if jsonb_array_length(v_campos) > 20 then
    raise exception 'Hasta 20 campos por actividad' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(v_campos) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Campo mal formado' using errcode = '22023';
    end if;
    v_campo := btrim(coalesce(v_item ->> 'campo', ''));
    v_valor := btrim(coalesce(v_item ->> 'valor', ''));
    if v_campo = '' or v_valor = '' then
      raise exception 'Cada campo necesita nombre y valor' using errcode = '22023';
    end if;
    if lower(v_campo) = any(v_vistos) then
      raise exception 'El campo "%" está repetido', v_campo using errcode = '22023';
    end if;
    v_vistos := array_append(v_vistos, lower(v_campo));
    v_norm := v_norm || jsonb_build_array(jsonb_build_object('campo', v_campo, 'valor', v_valor));
  end loop;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, p_establecimiento_id, 'personalizada', p_fecha, null, p_persona_id, p_notas);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  insert into public.act_personalizada (actividad_id, establecimiento_id, nombre, campos)
  values (p_id, p_establecimiento_id, btrim(p_nombre), v_norm);

  return p_id;
end;
$$;

revoke execute on function public.registrar_sanidad(uuid, uuid, uuid[], date, jsonb, uuid, text)                  from public, anon;
revoke execute on function public.registrar_servicio(uuid, uuid, date, int, int, uuid, text)                       from public, anon;
revoke execute on function public.registrar_diagnostico(uuid, uuid, date, int, int, uuid, text)                    from public, anon;
revoke execute on function public.registrar_esquila(uuid, uuid, uuid[], date, numeric, uuid, text)                 from public, anon;
revoke execute on function public.registrar_personalizada(uuid, uuid, uuid[], date, text, jsonb, uuid, text)       from public, anon;
grant  execute on function public.registrar_sanidad(uuid, uuid, uuid[], date, jsonb, uuid, text)                  to authenticated;
grant  execute on function public.registrar_servicio(uuid, uuid, date, int, int, uuid, text)                       to authenticated;
grant  execute on function public.registrar_diagnostico(uuid, uuid, date, int, int, uuid, text)                    to authenticated;
grant  execute on function public.registrar_esquila(uuid, uuid, uuid[], date, numeric, uuid, text)                 to authenticated;
grant  execute on function public.registrar_personalizada(uuid, uuid, uuid[], date, text, jsonb, uuid, text)       to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7 bis. anular_actividad: los lotes a bloquear salen de actividad_lotes
-- ════════════════════════════════════════════════════════════════════════════
-- Antes: lotes de los eventos + actividades.lote_id, que en sanidad, esquila y personalizada
-- es null (no bloqueaba ningún lote). Ahora: lotes de los eventos + todos los de
-- actividad_lotes, sin nulos y con lista vacía tolerada. El resto no cambia.

create or replace function public.anular_actividad(p_actividad_id uuid, p_motivo text) returns void
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

  -- 1. Bloquear los lotes afectados, ordenados por id: los de sus eventos y los de actividad_lotes
  foreach v_id in array coalesce((
    select array_agg(distinct x order by x)
    from (
      select e.lote_id as x from public.lote_eventos e where e.actividad_id = v_act.id
      union
      select al.lote_id from public.actividad_lotes al where al.actividad_id = v_act.id
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

-- create or replace conserva los permisos (authenticated sí, public y anon no); se reafirman
revoke execute on function public.anular_actividad(uuid, text) from public, anon;
grant  execute on function public.anular_actividad(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. v_actividades: se agregan lotes y los detalles nuevos (al final: create or replace)
-- ════════════════════════════════════════════════════════════════════════════
-- Las columnas de la 6a quedan iguales y en el mismo orden. lote_id puede venir vacío
-- (tipos de varios lotes): los lotes salen de actividad_lotes.

create or replace view public.v_actividades
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
    where me.actividad_id = a.id and me.anulado_en is null)                             as monto_usd,
  -- 6b-1
  (select array_agg(x.lote_id order by x.nombre, x.lote_id)
     from (select distinct al.lote_id, lo.nombre
             from public.actividad_lotes al
             join public.lotes lo on lo.id = al.lote_id
            where al.actividad_id = a.id) x)                                            as lotes,
  sp.productos,
  sp.producto,
  sv.vacas_entoradas,
  sv.toros,
  dg.vacas_diagnosticadas,
  dg.vacas_prenadas,
  dg.vacas_diagnosticadas - dg.vacas_prenadas                                           as vacas_vacias,
  es.kg_lana_total,
  -- Promedio aproximado: usa el stock total de los lotes a la fecha (todas las categorías)
  case when es.kg_lana_total is not null then
    round(es.kg_lana_total / nullif((
      select sum(e.cabezas)
      from public.actividad_lotes al
      join public.lote_eventos e on e.lote_id = al.lote_id and e.fecha <= a.fecha
      where al.actividad_id = a.id
    ), 0), 2)
  end                                                                                   as kg_lana_cabeza_aprox,
  pz.nombre                                                                             as personalizada,
  pz.campos
from public.actividades a
left join lateral (
  select sum(x.cabezas)::int as cabezas,
         sum(x.peso_vivo_total_kg) as peso_vivo_total_kg,
         sum(x.cabezas) filter (where x.peso_vivo_total_kg is not null)::int as cabezas_con_peso
  from public.actividad_lineas x where x.actividad_id = a.id
) l on true
left join public.act_compraventa cv on cv.actividad_id = a.id
left join public.act_mortandad   m  on m.actividad_id  = a.id
left join public.act_paricion    p  on p.actividad_id  = a.id
left join lateral (
  select nullif(count(*), 0)::int as productos,
         (array_agg(x.producto order by x.orden))[1] as producto
  from public.act_sanidad_productos x where x.actividad_id = a.id
) sp on true
left join public.act_servicio      sv on sv.actividad_id = a.id
left join public.act_diagnostico   dg on dg.actividad_id = a.id
left join public.act_esquila       es on es.actividad_id = a.id
left join public.act_personalizada pz on pz.actividad_id = a.id;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. v_carencias: carencias por lote, propagadas a los lotes descendientes
-- ════════════════════════════════════════════════════════════════════════════
-- Una fila por lote, sanidad y producto con carencia (> 0 días), de sanidades no anuladas.
-- Desde los lotes de la sanidad se recorren las operaciones de lote (división, unión y,
-- desde la 6b-2, destete; no la recategorización) con fecha igual o posterior a la sanidad
-- (una del mismo día se toma como posterior), salvo las de actividades anuladas.
-- Falso positivo aceptado: si al lote descendiente entran animales comprados después,
-- la carencia se marca a todo el lote (es un aviso, no un bloqueo).
-- fin_carencia puede estar vencida: quien consulta filtra por la fecha que le interesa.

create view public.v_carencias
with (security_invoker = true) as
with recursive
sanidades as (
  select a.id as actividad_id, a.establecimiento_id, a.fecha, al.lote_id
  from public.actividades a
  join public.actividad_lotes al on al.actividad_id = a.id and al.rol = 'principal'
  where a.tipo = 'sanidad'
    and a.anulada_en is null
    and exists (select 1 from public.act_sanidad_productos sp where sp.actividad_id = a.id and sp.carencia_dias > 0)
),
alcance (actividad_id, establecimiento_id, fecha, lote_id, heredada, visitados, nivel) as (
  select s.actividad_id, s.establecimiento_id, s.fecha, s.lote_id, false, array[s.lote_id], 0
  from sanidades s
  union all
  select r.actividad_id, r.establecimiento_id, r.fecha, vd.lote_id, true, r.visitados || vd.lote_id, r.nivel + 1
  from alcance r
  join public.operacion_lote_vinculos vo on vo.lote_id = r.lote_id and vo.rol = 'origen'
  join public.operaciones_lote o on o.id = vo.operacion_id and o.tipo <> 'recategorizacion' and o.fecha >= r.fecha
  join public.operacion_lote_vinculos vd on vd.operacion_id = o.id and vd.rol = 'destino'
  left join public.actividades oa on oa.id = o.actividad_id
  where (o.actividad_id is null or oa.anulada_en is null)
    and not (vd.lote_id = any(r.visitados))
    and r.nivel < 20
)
select distinct on (r.lote_id, r.actividad_id, sp.orden)
  r.lote_id,
  r.establecimiento_id,
  r.actividad_id,
  r.fecha,
  sp.orden,
  sp.producto,
  sp.categoria,
  sp.carencia_dias,
  r.fecha + sp.carencia_dias as fin_carencia,
  r.heredada
from alcance r
join public.act_sanidad_productos sp on sp.actividad_id = r.actividad_id and sp.carencia_dias > 0
order by r.lote_id, r.actividad_id, sp.orden, r.heredada;

revoke all    on public.v_carencias from anon, authenticated;
grant  select on public.v_carencias to authenticated;

commit;
