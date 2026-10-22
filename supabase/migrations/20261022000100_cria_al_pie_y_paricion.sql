-- Campo Digital v2 — Cría al pie, crías sin sexar y parición al pie (Etapa 6b-2, parte 1)
--
-- Diseño: contexto/DISENO-BASE-ETAPA-6B2-DESTETE.md (secciones 2, 3 y 11), aprobado el 2026-10-22.
-- Se puede usar sola: permite cargar las pariciones como pasan en el campo. El destete va en la parte 2.
--
--   1. categorias_animales gana cria_al_pie (boolean) y sexo (macho, hembra o null = sin sexar; solo
--      con cria_al_pie). Las edita el administrador: permiso de columna para authenticated, y las
--      políticas de siempre lo limitan al administrador.
--   2. Datos existentes: se marcan Terneros (macho), Terneras (hembra), Corderos (macho) y Corderas
--      (hembra) por nombre, en especies de grupo bovino y ovino. Se agregan "Terneros/as" (bovinos) y
--      "Corderos/as" (ovinos), sin sexar, primeras en el orden. Si una ya existe con ese nombre, se marca.
--   3. _cargar_catalogos_base: los establecimientos nuevos nacen con lo mismo.
--   4. registrar_paricion (versión de 20261020000500), misma firma:
--      * el lote de cría puede ser el mismo de las madres (crías al pie; se bloquea una sola vez);
--      * las crías tienen que ser de categorías de cría al pie (22023).
--      Las pariciones ya registradas no cambian.
--
-- Conteo de funciones de la auditoría: sin cambios. Permisos de columna: categorias_animales suma
-- cria_al_pie y sexo en INSERT y UPDATE (siguen siendo 13 filas).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Columnas
-- ════════════════════════════════════════════════════════════════════════════

alter table public.categorias_animales
  add column cria_al_pie boolean not null default false,
  add column sexo        text check (sexo in ('macho', 'hembra')),
  add constraint categorias_sexo_solo_cria check (sexo is null or cria_al_pie);

grant insert (cria_al_pie, sexo) on public.categorias_animales to authenticated;
grant update (cria_al_pie, sexo) on public.categorias_animales to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Datos existentes
-- ════════════════════════════════════════════════════════════════════════════

update public.categorias_animales c
set cria_al_pie = true,
    sexo = case when c.nombre in ('Terneros', 'Corderos') then 'macho' else 'hembra' end
from public.especies e
where e.id = c.especie_id
  and ((e.grupo = 'bovino' and c.nombre in ('Terneros', 'Terneras'))
    or (e.grupo = 'ovino'  and c.nombre in ('Corderos', 'Corderas')));

insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden, cria_al_pie, sexo)
select e.establecimiento_id, e.id,
       case e.grupo when 'bovino' then 'Terneros/as' else 'Corderos/as' end,
       0, true, null
from public.especies e
where e.grupo in ('bovino', 'ovino')
on conflict (especie_id, nombre) do update set cria_al_pie = true, sexo = null;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Catálogo base de los establecimientos nuevos
-- ════════════════════════════════════════════════════════════════════════════

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
end;
$$;

revoke execute on function public._cargar_catalogos_base(uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Parición: crías al pie y solo categorías de cría
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.registrar_paricion(
  p_id               uuid,
  p_lote_madres_id   uuid,
  p_fecha            date,
  p_lineas           jsonb,                  -- crías vivas: [{"categoria_id", "cabezas"}], solo categorías de cría al pie
  p_nacidos_muertos  int   default 0,
  p_lote_cria_id     uuid  default null,     -- lote de cría existente (puede ser el de las madres: crías al pie)...
  p_lote_cria_nuevo  jsonb default null,     -- ...o nuevo: {"nombre", "potrero_id"}
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
  if coalesce(p_nacidos_muertos, 0) < 0 then   -- NULL cuenta como 0
    raise exception 'Los nacidos muertos tienen que ser cero o más' using errcode = '22023';
  end if;

  -- Bloqueo de los lotes ordenados por id (evita bloqueos cruzados). Con las crías al pie, el
  -- lote de cría es el mismo de las madres: se bloquea una sola vez.
  foreach v_id in array (select array_agg(distinct x order by x) from unnest(array[p_lote_madres_id, p_lote_cria_id]) x where x is not null) loop
    if v_id = p_lote_madres_id then
      v_madres := public._bloquear_lote_editable(v_id);
    else
      v_cria := public._bloquear_lote_editable(v_id);
    end if;
  end loop;
  if p_lote_cria_id = p_lote_madres_id then
    v_cria := v_madres;
  end if;

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
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id)
    values (
      v_madres.establecimiento_id, v_madres.especie_id, btrim(p_lote_cria_nuevo ->> 'nombre'),
      p_fecha,
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

  -- ...y de cría al pie: la parición no suma vacas, toros ni otras categorías
  if exists (
    select 1 from public.actividad_lineas l
    join public.categorias_animales c on c.id = l.categoria_id
    where l.actividad_id = p_id and not c.cria_al_pie
  ) then
    raise exception 'En la parición solo van categorías de cría al pie (por ejemplo, Terneros/as)' using errcode = '22023';
  end if;

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select v_madres.establecimiento_id, v_cria.id, v_cria.especie_id, l.categoria_id, l.cabezas, p_fecha, 'paricion', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  return p_id;
end;
$$;

commit;
