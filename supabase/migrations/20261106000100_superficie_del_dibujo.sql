-- Campo Digital v2 — La superficie sale del dibujo
--
--   1. potreros.superficie: la calcula la base a partir de la forma (área geodésica en ha, con dos
--      decimales). Sin forma ("sin dibujar") es null. Ya no se escribe a mano: authenticated pierde el
--      insert y el update de la columna, y un trigger la recalcula en cada alta o cambio.
--      Los potreros existentes pasan a tener la superficie de su dibujo; los sin dibujar quedan en null
--      (se borra la superficie cargada a mano).
--   2. guardar_forma_potrero(p_potrero_id, p_forma): sale el parámetro p_actualizar_superficie (la
--      superficie ya es siempre la del dibujo). Se borra la de tres parámetros y se crea la de dos.
--   3. establecimientos.superficie_total: se borra la columna. La superficie total es la suma de los
--      potreros activos, calculada por la función superficie_total(establecimientos), que la API expone
--      como columna calculada (select=*,superficie_total). crear_establecimiento pierde p_superficie_total.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Superficie del potrero = área del dibujo
-- ════════════════════════════════════════════════════════════════════════════

alter table public.potreros alter column superficie drop not null;

-- El check sin nombre de la creación (superficie > 0), buscado por su definición
do $$
declare
  v_nombre text;
begin
  for v_nombre in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.potreros'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%superficie%'
  loop
    execute format('alter table public.potreros drop constraint %I', v_nombre);
  end loop;
end $$;

alter table public.potreros add constraint potreros_superficie_check check (superficie is null or superficie > 0);

-- Ya no se escribe directo
revoke insert (superficie), update (superficie) on public.potreros from authenticated;

-- Calcula la superficie a partir de la forma en cada alta o cambio
create function public.calcular_superficie_potrero() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.superficie := case
    when new.forma is null then null
    else nullif(round((extensions.st_area(new.forma::extensions.geography) / 10000)::numeric, 2), 0)
  end;
  return new;
end;
$$;

revoke execute on function public.calcular_superficie_potrero() from public, anon, authenticated;

create trigger calcular_superficie_potrero before insert or update on public.potreros
  for each row execute function public.calcular_superficie_potrero();

-- Datos existentes: la superficie de su dibujo, o null sin dibujar (sin tocar updated_at)
alter table public.potreros disable trigger set_updated_at;
update public.potreros set superficie = null;   -- el trigger la recalcula de la forma
alter table public.potreros enable trigger set_updated_at;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. guardar_forma_potrero sin p_actualizar_superficie
-- ════════════════════════════════════════════════════════════════════════════

drop function public.guardar_forma_potrero(uuid, jsonb, boolean);

-- Guarda (o borra, con p_forma null) la forma de un potrero. p_forma es una geometría GeoJSON
-- (Polygon o MultiPolygon, en grados). Se corrige si es inválida y se devuelve el área geodésica
-- en hectáreas, que pasa a ser la superficie del potrero (la calcula el trigger calcular_superficie_potrero).
create function public.guardar_forma_potrero(
  p_potrero_id  uuid,
  p_forma       jsonb
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

  update public.potreros set forma = v_geom where id = v_potrero.id;

  return v_ha;
end;
$$;

revoke execute on function public.guardar_forma_potrero(uuid, jsonb) from public, anon;
grant  execute on function public.guardar_forma_potrero(uuid, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Superficie total del establecimiento = suma de los potreros activos
-- ════════════════════════════════════════════════════════════════════════════

-- crear_establecimiento sin p_superficie_total (antes de borrar la columna que usa)
drop function public.crear_establecimiento(text, text, text, text, numeric, text, text, text, text, date, text, boolean);

alter table public.establecimientos drop column superficie_total;

create function public.crear_establecimiento(
  p_nombre                text,
  p_departamento          text,
  p_localidad             text    default null,
  p_paraje                text    default null,
  p_sistema_productivo    text    default null,
  p_propietario           text    default null,
  p_rut                   text    default null,
  p_dicose                text    default null,
  p_fecha_alta            date    default null,
  p_observaciones         text    default null,
  p_cargar_catalogos_base boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_est uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede crear establecimientos' using errcode = '42501';
  end if;

  insert into public.establecimientos (
    nombre, departamento, localidad, paraje, sistema_productivo,
    propietario, rut, dicose, fecha_alta, observaciones
  ) values (
    p_nombre, p_departamento, p_localidad, p_paraje, p_sistema_productivo,
    p_propietario, p_rut, p_dicose, coalesce(p_fecha_alta, public.fecha_hoy()), p_observaciones
  )
  returning id into v_est;

  if p_cargar_catalogos_base then
    perform public._cargar_catalogos_base(v_est);
  end if;

  -- Los administradores son responsables posibles en todos los establecimientos
  perform public._fichas_de_admins(v_est, null);

  return v_est;
end;
$$;

revoke execute on function public.crear_establecimiento(text, text, text, text, text, text, text, text, date, text, boolean) from public, anon;
grant  execute on function public.crear_establecimiento(text, text, text, text, text, text, text, text, date, text, boolean) to authenticated;

-- Superficie total: la suma de los potreros activos dibujados (null si no hay ninguno). Columna calculada
-- de la API: select=*,superficie_total. Con los permisos de quien consulta (lee solo potreros de sus campos).
create function public.superficie_total(e public.establecimientos) returns numeric
language sql
stable
set search_path = ''
as $$
  select sum(p.superficie) from public.potreros p
  where p.establecimiento_id = e.id and p.estado = 'activo'
$$;

revoke execute on function public.superficie_total(public.establecimientos) from public, anon;
grant  execute on function public.superficie_total(public.establecimientos) to authenticated;
