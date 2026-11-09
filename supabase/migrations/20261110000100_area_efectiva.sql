-- Campo Digital v2 — Área efectiva de los potreros (zonas no aprovechables). Diseño: contexto/DISENO-AREA-EFECTIVA.md
--
--   1. zona_tipos: catálogo editable de tipos de zona (Monte, Bañado, Cañada o agua, Casco o instalaciones, Otra, con
--      su color), por establecimiento. Leen los miembros; escribe el administrador (como los otros catálogos). No se
--      borran: se dan de baja. Se carga en los establecimientos que ya existen y en los nuevos (_cargar_catalogos_base).
--   2. potrero_zonas: zonas dibujadas dentro de un potrero, como se dibujaron (sin recortar). Authenticated solo lee;
--      se escriben con guardar_zona_potrero y borrar_zona_potrero (administrador u operador, como la forma del
--      potrero).
--   3. potreros.superficie_efectiva: superficie − área de (unión de las zonas ∩ forma del potrero), en ha con dos
--      decimales; null sin dibujar. La calcula el trigger calcular_superficie_potrero (también la superficie), y cada
--      cambio de zona la recalcula.
--   4. superficie_efectiva_total(establecimientos): suma de las efectivas de los potreros activos (columna calculada).
--   5. v_potreros_mapa suma superficie_efectiva y las zonas (recortadas al potrero, con tipo, color y ha).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tipos de zona
-- ════════════════════════════════════════════════════════════════════════════

create table public.zona_tipos (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> '' and char_length(nombre) <= 40),
  color              text not null default '#6b6b6b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  orden              int  not null default 0,
  activo             boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (establecimiento_id, nombre),
  unique (id, establecimiento_id)
);

create trigger set_updated_at before update on public.zona_tipos for each row execute function public.set_updated_at();

alter table public.zona_tipos enable row level security;
create policy zona_tipos_select on public.zona_tipos for select to authenticated using (public.es_miembro(establecimiento_id));
create policy zona_tipos_insert on public.zona_tipos for insert to authenticated with check (public.es_admin());
create policy zona_tipos_update on public.zona_tipos for update to authenticated using (public.es_admin()) with check (public.es_admin());

revoke all on public.zona_tipos from anon, authenticated;
grant select on public.zona_tipos to authenticated;
grant insert (establecimiento_id, nombre, color, orden, activo) on public.zona_tipos to authenticated;
grant update (nombre, color, orden, activo)                     on public.zona_tipos to authenticated;

-- Los tipos base de un establecimiento (si no los tiene)
create function public._cargar_zona_tipos(p_establecimiento_id uuid) returns void
language sql
set search_path = ''
as $$
  insert into public.zona_tipos (establecimiento_id, nombre, color, orden)
  select p_establecimiento_id, t.nombre, t.color, t.orden
  from (values
    ('Monte', '#3f6b2a', 1), ('Bañado', '#2b7a8f', 2), ('Cañada o agua', '#1f4e9c', 3),
    ('Casco o instalaciones', '#7a4808', 4), ('Otra', '#6b6b6b', 5)
  ) as t(nombre, color, orden)
  on conflict (establecimiento_id, nombre) do nothing;
$$;

revoke execute on function public._cargar_zona_tipos(uuid) from public, anon, authenticated;

-- Los establecimientos que ya existen
select public._cargar_zona_tipos(e.id) from public.establecimientos e;

-- Los nuevos: _cargar_catalogos_base también carga los tipos de zona
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
  perform public._cargar_zona_tipos(p_establecimiento_id);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Zonas
-- ════════════════════════════════════════════════════════════════════════════

create table public.potrero_zonas (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  potrero_id         uuid not null,
  tipo_id            uuid not null,
  forma              extensions.geometry(MultiPolygon, 4326) not null,
  nota               text check (nota is null or (btrim(nota) <> '' and char_length(nota) <= 200)),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (potrero_id, establecimiento_id) references public.potreros (id, establecimiento_id) on delete restrict,
  foreign key (tipo_id, establecimiento_id)    references public.zona_tipos (id, establecimiento_id) on delete restrict
);

create index potrero_zonas_potrero_idx on public.potrero_zonas (potrero_id);
create index potrero_zonas_forma_idx   on public.potrero_zonas using gist (forma);
create trigger set_updated_at before update on public.potrero_zonas for each row execute function public.set_updated_at();

alter table public.potrero_zonas enable row level security;
create policy potrero_zonas_select on public.potrero_zonas for select to authenticated using (public.es_miembro(establecimiento_id));

revoke all on public.potrero_zonas from anon, authenticated;
grant select on public.potrero_zonas to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Superficie efectiva
-- ════════════════════════════════════════════════════════════════════════════

alter table public.potreros
  add column superficie_efectiva numeric(10,2) check (superficie_efectiva is null or superficie_efectiva >= 0);

-- La superficie (área del dibujo) y la efectiva (menos la unión de las zonas, recortada al potrero). Sin forma: null.
create or replace function public.calcular_superficie_potrero() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_zonas numeric;
begin
  new.superficie := case
    when new.forma is null then null
    else nullif(round((extensions.st_area(new.forma::extensions.geography) / 10000)::numeric, 2), 0)
  end;
  if new.superficie is null then
    new.superficie_efectiva := null;
  else
    select coalesce(extensions.st_area(extensions.st_intersection(extensions.st_union(z.forma), new.forma)::extensions.geography) / 10000, 0)
    into v_zonas
    from public.potrero_zonas z
    where z.potrero_id = new.id;
    new.superficie_efectiva := greatest(round((new.superficie - coalesce(v_zonas, 0))::numeric, 2), 0);
  end if;
  return new;
end;
$$;

-- Los potreros que ya existen (sin zonas: la efectiva es la superficie), sin tocar updated_at
alter table public.potreros disable trigger set_updated_at;
update public.potreros set superficie_efectiva = null;   -- el trigger recalcula las dos
alter table public.potreros enable trigger set_updated_at;

-- Lee una geometría GeoJSON (Polygon o MultiPolygon, en grados) y la corrige; errores 22023 como guardar_forma_potrero
create function public._geometria_de_geojson(p_forma jsonb) returns extensions.geometry
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_geom extensions.geometry;
begin
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
  return v_geom;
end;
$$;

revoke execute on function public._geometria_de_geojson(jsonb) from public, anon, authenticated;

-- Alta o cambio de una zona (administrador u operador). p_id: el de la zona (nuevo o existente). Devuelve las ha de
-- la zona dentro del potrero. El potrero tiene que estar dibujado y la zona tocarlo; el tipo, activo (o el que ya
-- tenía la zona).
create function public.guardar_zona_potrero(
  p_id         uuid,
  p_potrero_id uuid,
  p_tipo_id    uuid,
  p_forma      jsonb,
  p_nota       text default null
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_potrero public.potreros;
  v_zona    public.potrero_zonas;
  v_geom    extensions.geometry;
  v_ha      numeric;
begin
  select * into v_potrero from public.potreros where id = p_potrero_id for update;
  if v_potrero.id is null or not public.puede_operar(v_potrero.establecimiento_id) then
    raise exception 'Potrero inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Falta el id de la zona' using errcode = '22023';
  end if;
  select * into v_zona from public.potrero_zonas where id = p_id for update;
  if v_zona.id is not null and v_zona.potrero_id <> v_potrero.id then
    raise exception 'La zona es de otro potrero' using errcode = '22023';
  end if;
  if v_potrero.forma is null then
    raise exception 'Dibujá primero el potrero' using errcode = '22023';
  end if;
  if not exists (select 1 from public.zona_tipos t
                 where t.id = p_tipo_id and t.establecimiento_id = v_potrero.establecimiento_id
                   and (t.activo or t.id = v_zona.tipo_id)) then
    raise exception 'Elegí un tipo de zona de este establecimiento' using errcode = '22023';
  end if;

  v_geom := public._geometria_de_geojson(p_forma);
  v_ha := round((extensions.st_area(extensions.st_intersection(v_geom, v_potrero.forma)::extensions.geography) / 10000)::numeric, 2);
  if coalesce(v_ha, 0) <= 0 then
    raise exception 'La zona tiene que quedar dentro del potrero' using errcode = '22023';
  end if;

  if v_zona.id is null then
    insert into public.potrero_zonas (id, establecimiento_id, potrero_id, tipo_id, forma, nota)
    values (p_id, v_potrero.establecimiento_id, v_potrero.id, p_tipo_id, v_geom, nullif(btrim(p_nota), ''));
  else
    update public.potrero_zonas set tipo_id = p_tipo_id, forma = v_geom, nota = nullif(btrim(p_nota), '') where id = v_zona.id;
  end if;

  -- Recalcula la superficie efectiva del potrero (el trigger)
  update public.potreros set forma = forma where id = v_potrero.id;
  return v_ha;
end;
$$;

revoke execute on function public.guardar_zona_potrero(uuid, uuid, uuid, jsonb, text) from public, anon;
grant  execute on function public.guardar_zona_potrero(uuid, uuid, uuid, jsonb, text) to authenticated;

-- Borra una zona (administrador u operador) y recalcula la superficie efectiva de su potrero
create function public.borrar_zona_potrero(p_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona public.potrero_zonas;
begin
  select * into v_zona from public.potrero_zonas where id = p_id for update;
  if v_zona.id is null or not public.puede_operar(v_zona.establecimiento_id) then
    raise exception 'Zona inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  delete from public.potrero_zonas where id = v_zona.id;
  update public.potreros set forma = forma where id = v_zona.potrero_id;
end;
$$;

revoke execute on function public.borrar_zona_potrero(uuid) from public, anon;
grant  execute on function public.borrar_zona_potrero(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Superficie efectiva del establecimiento
-- ════════════════════════════════════════════════════════════════════════════

-- Suma de las efectivas de los potreros activos dibujados (null si no hay ninguno). Columna calculada de la API:
-- select=*,superficie_total,superficie_efectiva_total.
create function public.superficie_efectiva_total(e public.establecimientos) returns numeric
language sql
stable
set search_path = ''
as $$
  select sum(p.superficie_efectiva) from public.potreros p
  where p.establecimiento_id = e.id and p.estado = 'activo'
$$;

revoke execute on function public.superficie_efectiva_total(public.establecimientos) from public, anon;
grant  execute on function public.superficie_efectiva_total(public.establecimientos) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Mapa: superficie efectiva y zonas
-- ════════════════════════════════════════════════════════════════════════════

-- Las columnas nuevas van al final (create or replace no cambia las que ya tiene)
create or replace view public.v_potreros_mapa
with (security_invoker = true) as
select p.id, p.establecimiento_id, p.nombre, p.superficie, p.uso_actual, p.tipo_pastura, p.aguada, p.sombra,
       p.estado, p.observaciones,
       extensions.st_asgeojson(p.forma, 7)::jsonb as forma,
       round((extensions.st_area(p.forma::extensions.geography) / 10000)::numeric, 2) as area_ha,
       extensions.st_asgeojson(extensions.st_pointonsurface(p.forma), 7)::jsonb as etiqueta,
       p.superficie_efectiva,
       -- Zonas: recortadas al potrero para dibujarlas, y como se dibujaron para editarlas
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'id', z.id, 'tipo_id', z.tipo_id, 'tipo', t.nombre, 'color', t.color, 'nota', z.nota,
                  'forma', extensions.st_asgeojson(extensions.st_multi(extensions.st_collectionextract(extensions.st_intersection(z.forma, p.forma), 3)), 7)::jsonb,
                  'forma_dibujada', extensions.st_asgeojson(z.forma, 7)::jsonb,
                  'ha', round((extensions.st_area(extensions.st_intersection(z.forma, p.forma)::extensions.geography) / 10000)::numeric, 2))
                order by t.orden, z.created_at)
         from public.potrero_zonas z
         join public.zona_tipos t on t.id = z.tipo_id
         where z.potrero_id = p.id and p.forma is not null
       ), '[]'::jsonb) as zonas
from public.potreros p;

commit;
