-- Campo Digital v2 — Destete (Etapa 6b-2, parte 2)
--
-- Diseño: contexto/DISENO-BASE-ETAPA-6B2-DESTETE.md, aprobado el 2026-10-22 (A1 a A11).
-- Requiere 20261022000100_cria_al_pie_y_paricion (categorias_animales.cria_al_pie y sexo).
--
--   1. Checks: lote_eventos acepta el tipo 'destete' y exige actividad_id para él; operaciones_lote
--      acepta 'destete'. La regla de operación de lote_eventos no cambia: los eventos del destete
--      cuelgan de la actividad, no de una operación (sección 7.2).
--   2. registrar_destete (nueva): mueve cabezas de cría al pie de uno o más lotes de origen a uno o
--      más lotes nuevos. Balance en cabezas totales; por categoría con sexo, lo que entra no es menos
--      que lo que sale (la diferencia sale de las sin sexar); ningún destino recibe sin sexar.
--      Una operación de tipo destete por cada par origen → destino que aportó (sin eventos), para
--      el linaje y la carencia. Archivos visibles de todos los orígenes a cada destino. El origen que
--      queda vacío se cierra ("Destetado").
--   3. anular_actividad: un destete se anula solo si ningún destino tuvo movimientos de stock ajenos
--      (de cualquier fecha) ni una pesada no anulada, y sigue abierto. Reabre los orígenes y cierra
--      los destinos.
--   4. linaje_lote: deja de mostrar las operaciones de actividades anuladas.
--
-- v_carencias no cambia: ya recorre las operaciones que no son recategorización y excluye las de
-- actividades anuladas. Auditoría: +1 función (registrar_destete).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Checks
-- ════════════════════════════════════════════════════════════════════════════
-- Los checks de tipo se crearon sin nombre: se buscan por su definición.

do $$
declare
  v_nombres text[];
begin
  select array_agg(conname) into v_nombres from pg_constraint
  where conrelid = 'public.lote_eventos'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%alta_inicial%';
  if coalesce(array_length(v_nombres, 1), 0) <> 1 then
    raise exception 'Se esperaba un solo check de tipo en lote_eventos y hay %', coalesce(array_length(v_nombres, 1), 0);
  end if;
  execute format('alter table public.lote_eventos drop constraint %I', v_nombres[1]);

  select array_agg(conname) into v_nombres from pg_constraint
  where conrelid = 'public.operaciones_lote'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%recategorizacion%';
  if coalesce(array_length(v_nombres, 1), 0) <> 1 then
    raise exception 'Se esperaba un solo check de tipo en operaciones_lote y hay %', coalesce(array_length(v_nombres, 1), 0);
  end if;
  execute format('alter table public.operaciones_lote drop constraint %I', v_nombres[1]);
end $$;

alter table public.lote_eventos add constraint lote_eventos_tipo_check check (tipo in (
  'alta_inicial', 'paricion', 'compra', 'venta', 'mortandad',
  'recategorizacion', 'division', 'union', 'ajuste', 'destete'));

alter table public.operaciones_lote add constraint operaciones_lote_tipo_check
  check (tipo in ('division', 'union', 'recategorizacion', 'destete'));

alter table public.lote_eventos drop constraint lote_eventos_actividad_check;
alter table public.lote_eventos add constraint lote_eventos_actividad_check
  check (tipo not in ('paricion', 'compra', 'venta', 'mortandad', 'destete') or actividad_id is not null);

-- ════════════════════════════════════════════════════════════════════════════
-- 2-3. registrar_destete
-- ════════════════════════════════════════════════════════════════════════════
-- p_origenes: [{"lote_id", "lineas": [{"categoria_id", "cabezas"}]}]
-- p_destinos: [{"nombre", "potrero_id"?, "anios_nacimiento"?: [..], "lineas": [{"categoria_id", "cabezas"}]}]
-- Idempotente con p_id: si el mismo envío llega dos veces, devuelve la actividad ya creada.

create function public.registrar_destete(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_origenes           jsonb,
  p_destinos           jsonb,
  p_persona_id         uuid default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_especie  uuid;
  v_lote     public.lotes;
  v_item     jsonb;
  v_linea    jsonb;
  v_id       uuid;
  v_origenes uuid[] := '{}';
  v_destinos uuid[] := '{}';
  v_cats     uuid[];
  v_cat      uuid;
  v_cab      int;
  v_cria     boolean;
  v_sexo     text;
  v_nombre   text;
  v_destino  uuid;
  v_op       uuid;
  v_sale     int;
  v_entra    int;
  r          record;
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'destete') then
    return p_id;
  end if;

  if p_establecimiento_id is null or not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de edición en este establecimiento' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_origenes is null or jsonb_typeof(p_origenes) <> 'array' or jsonb_array_length(p_origenes) = 0 then
    raise exception 'Indicá al menos un lote de origen' using errcode = '22023';
  end if;
  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Indicá al menos un lote de destino' using errcode = '22023';
  end if;
  perform public._exigir_persona(p_persona_id, p_establecimiento_id);

  -- 1. Orígenes: sin repetir; se bloquean ordenados por id (evita bloqueos cruzados)
  for v_item in select e from jsonb_array_elements(p_origenes) e loop
    v_id := nullif(case when jsonb_typeof(v_item) = 'object' then v_item ->> 'lote_id' end, '')::uuid;
    if v_id is null then
      raise exception 'Falta el lote de un origen' using errcode = '22023';
    end if;
    if v_id = any(v_origenes) then
      raise exception 'Hay lotes de origen repetidos' using errcode = '22023';
    end if;
    v_origenes := v_origenes || v_id;
  end loop;

  foreach v_id in array (select array_agg(x order by x) from unnest(v_origenes) x) loop
    v_lote := public._bloquear_lote_editable(v_id);
    if v_lote.establecimiento_id <> p_establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote % está cerrado', v_lote.nombre using errcode = '22023';
    end if;
    if v_especie is null then
      v_especie := v_lote.especie_id;
    elsif v_especie <> v_lote.especie_id then
      raise exception 'Los lotes de origen tienen que ser de la misma especie' using errcode = '22023';
    end if;
    perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  end loop;

  -- 2. La actividad (sin lote principal: los lotes van en actividad_lotes)
  insert into public.actividades (id, establecimiento_id, tipo, fecha, persona_id, notas)
  values (p_id, p_establecimiento_id, 'destete', p_fecha, p_persona_id, nullif(btrim(coalesce(p_notas, '')), ''));

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'origen' from unnest(v_origenes) x;

  -- 3. Lo que sale de cada origen: solo categorías de cría al pie
  for v_item in select e from jsonb_array_elements(p_origenes) e loop
    v_id := (v_item ->> 'lote_id')::uuid;
    if jsonb_typeof(v_item -> 'lineas') is distinct from 'array' or jsonb_array_length(v_item -> 'lineas') = 0 then
      raise exception 'Cada lote de origen necesita al menos una categoría con cabezas' using errcode = '22023';
    end if;
    v_cats := '{}';
    for v_linea in select e from jsonb_array_elements(v_item -> 'lineas') e loop
      v_cat := nullif(v_linea ->> 'categoria_id', '')::uuid;
      perform public._exigir_categoria(v_cat, v_especie);
      select c.cria_al_pie into v_cria from public.categorias_animales c where c.id = v_cat;
      if not v_cria then
        raise exception 'Solo se destetan categorías de cría al pie' using errcode = '22023';
      end if;
      if v_cat = any(v_cats) then
        raise exception 'Hay categorías repetidas en un lote de origen' using errcode = '22023';
      end if;
      v_cats := v_cats || v_cat;
      v_cab := public._cabezas(v_linea -> 'cabezas');
      insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
      values (p_establecimiento_id, v_id, v_especie, v_cat, -v_cab, p_fecha, 'destete', p_id);
    end loop;
  end loop;

  -- 4. Destinos: lotes nuevos, solo con crías sexadas
  for v_item in select e from jsonb_array_elements(p_destinos) e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada lote de destino tiene que ser un objeto con nombre y categorías' using errcode = '22023';
    end if;
    v_nombre := btrim(coalesce(v_item ->> 'nombre', ''));
    if v_nombre = '' then
      raise exception 'Cada lote de destino necesita un nombre' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'lineas') is distinct from 'array' or jsonb_array_length(v_item -> 'lineas') = 0 then
      raise exception 'El lote % necesita al menos una categoría con cabezas', v_nombre using errcode = '22023';
    end if;

    -- Los años los valida el trigger validar_anios_nacimiento
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id, anios_nacimiento)
    values (p_establecimiento_id, v_especie, v_nombre, p_fecha, nullif(v_item ->> 'potrero_id', '')::uuid,
            coalesce(public._anios_de_jsonb(v_item -> 'anios_nacimiento'), '{}'))
    returning id into v_destino;
    v_destinos := v_destinos || v_destino;

    insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
    values (p_id, v_destino, p_establecimiento_id, 'destino');

    v_cats := '{}';
    for v_linea in select e from jsonb_array_elements(v_item -> 'lineas') e loop
      v_cat := nullif(v_linea ->> 'categoria_id', '')::uuid;
      perform public._exigir_categoria(v_cat, v_especie);
      select c.cria_al_pie, c.sexo into v_cria, v_sexo from public.categorias_animales c where c.id = v_cat;
      if not v_cria then
        raise exception 'Solo se destetan categorías de cría al pie' using errcode = '22023';
      end if;
      if v_sexo is null then
        raise exception 'Las crías sin sexar se separan en machos y hembras: ningún lote de destino puede recibirlas'
          using errcode = '22023';
      end if;
      if v_cat = any(v_cats) then
        raise exception 'Hay categorías repetidas en el lote %', v_nombre using errcode = '22023';
      end if;
      v_cats := v_cats || v_cat;
      v_cab := public._cabezas(v_linea -> 'cabezas');
      insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
      values (p_establecimiento_id, v_destino, v_especie, v_cat, v_cab, p_fecha, 'destete', p_id);
    end loop;
  end loop;

  -- 5. Balance: en cabezas totales, lo que sale es lo que entra...
  select coalesce(-sum(e.cabezas) filter (where e.cabezas < 0), 0), coalesce(sum(e.cabezas) filter (where e.cabezas > 0), 0)
  into v_sale, v_entra
  from public.lote_eventos e where e.actividad_id = p_id;
  if v_sale <> v_entra then
    raise exception 'Salen % cabezas de los orígenes y entran % a los destinos: tienen que ser las mismas', v_sale, v_entra
      using errcode = '22023';
  end if;

  -- ...y en cada categoría con sexo, lo que entra no es menos que lo que sale (la diferencia sale de
  -- las sin sexar: el sexo solo se asigna a ellas)
  for r in
    select c.nombre, -sum(e.cabezas) filter (where e.cabezas < 0) as sale, sum(e.cabezas) filter (where e.cabezas > 0) as entra
    from public.lote_eventos e
    join public.categorias_animales c on c.id = e.categoria_id
    where e.actividad_id = p_id and c.sexo is not null
    group by c.nombre
    having sum(e.cabezas) < 0
  loop
    raise exception 'Salen % % y entran %: una cría ya sexada no cambia de sexo', r.sale, r.nombre, coalesce(r.entra, 0)
      using errcode = '22023';
  end loop;

  -- 6. Total por categoría (lo que entra a los destinos, ya con el sexo asignado)
  insert into public.actividad_lineas (actividad_id, establecimiento_id, categoria_id, cabezas)
  select p_id, p_establecimiento_id, e.categoria_id, sum(e.cabezas)
  from public.lote_eventos e
  where e.actividad_id = p_id and e.cabezas > 0
  group by e.categoria_id;

  -- 7. Linaje y carencia: una operación por cada par origen → destino que aportó. X aportó a Y si
  -- X saca una categoría que Y recibe, o crías sin sexar (que Y recibe ya sexadas). Sin eventos.
  for r in
    select distinct o.lote_id as origen, d.lote_id as destino
    from public.lote_eventos o
    join public.categorias_animales co on co.id = o.categoria_id
    join public.lote_eventos d on d.actividad_id = p_id and d.cabezas > 0
                              and (d.categoria_id = o.categoria_id or co.sexo is null)
    where o.actividad_id = p_id and o.cabezas < 0
    order by 1, 2
  loop
    insert into public.operaciones_lote (establecimiento_id, tipo, fecha, actividad_id)
    values (p_establecimiento_id, 'destete', p_fecha, p_id)
    returning id into v_op;
    insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
    values (p_establecimiento_id, v_op, r.origen, 'origen'),
           (p_establecimiento_id, v_op, r.destino, 'destino');
  end loop;

  -- 8. Archivos visibles de todos los orígenes a cada destino, por referencia y sin duplicar
  insert into public.lote_archivos (lote_id, archivo_id, establecimiento_id, heredado_de_lote_id)
  select distinct on (d.x, la.archivo_id) d.x, la.archivo_id, p_establecimiento_id, la.lote_id
  from unnest(v_destinos) d(x)
  join public.lote_archivos la on la.lote_id = any(v_origenes) and not la.oculto
  order by d.x, la.archivo_id, la.lote_id
  on conflict (lote_id, archivo_id) do nothing;

  -- 9. Saldo día por día en cada origen y categoría
  for r in select distinct e.lote_id, e.categoria_id from public.lote_eventos e where e.actividad_id = p_id and e.cabezas < 0 loop
    perform public._validar_saldo(r.lote_id, r.categoria_id);
  end loop;

  -- 10. El origen que queda vacío se cierra; para eso, el destete no puede ser anterior a su último movimiento
  foreach v_id in array v_origenes loop
    if not exists (
      select 1 from public.lote_eventos e where e.lote_id = v_id group by e.categoria_id having sum(e.cabezas) <> 0
    ) then
      if exists (select 1 from public.lote_eventos e where e.lote_id = v_id and e.fecha > p_fecha) then
        select l.nombre into v_nombre from public.lotes l where l.id = v_id;
        raise exception 'El lote % queda vacío: el destete no puede ser anterior a su último movimiento', v_nombre
          using errcode = '22023';
      end if;
      perform public._cerrar_si_vacio(v_id, p_fecha, 'Destetado');
    end if;
  end loop;

  return p_id;
end;
$$;

revoke execute on function public.registrar_destete(uuid, uuid, date, jsonb, jsonb, uuid, text) from public, anon;
grant  execute on function public.registrar_destete(uuid, uuid, date, jsonb, jsonb, uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. anular_actividad: reglas del destete (misma firma)
-- ════════════════════════════════════════════════════════════════════════════

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

  -- 1 bis. Destete: solo si ningún lote de destino tuvo movimientos de stock que no sean del propio
  -- destete (de cualquier fecha) ni una pesada no anulada, y sigue abierto. La sanidad no bloquea.
  if v_act.tipo = 'destete' then
    for v_lote in
      select l.* from public.lotes l
      join public.actividad_lotes al on al.lote_id = l.id and al.actividad_id = v_act.id and al.rol = 'destino'
      order by l.nombre
    loop
      if v_lote.estado <> 'activo'
         or exists (select 1 from public.lote_eventos e
                    where e.lote_id = v_lote.id and e.actividad_id is distinct from v_act.id)
         or exists (select 1 from public.actividad_lotes ap
                    join public.actividades a on a.id = ap.actividad_id
                    where ap.lote_id = v_lote.id and a.tipo = 'pesada' and a.anulada_en is null) then
        raise exception 'El lote % ya tuvo movimientos o una pesada después del destete: anulalos primero', v_lote.nombre
          using errcode = '22023';
      end if;
    end loop;
  end if;

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

  -- Destete: los lotes de destino quedan vacíos y se cierran (los orígenes ya se reabrieron arriba)
  if v_act.tipo = 'destete' then
    for v_id in select al.lote_id from public.actividad_lotes al where al.actividad_id = v_act.id and al.rol = 'destino' loop
      perform public._cerrar_si_vacio(v_id, v_act.fecha, 'Anulación de destete: ' || v_motivo);
    end loop;
  end if;

  -- 6. Marca de anulación (el trigger solo permite esta transición)
  update public.actividades
  set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = v_motivo
  where id = v_act.id;
end;
$$;

revoke execute on function public.anular_actividad(uuid, text) from public, anon;
grant  execute on function public.anular_actividad(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. linaje_lote: sin las operaciones de actividades anuladas (misma firma)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.linaje_lote(p_lote_id uuid)
returns table (
  lote_id uuid, nombre text, estado text, relacion text, nivel int,
  operacion_id uuid, tipo text, fecha date
)
language sql
stable
set search_path = ''
as $$
  with recursive
  ancestros (lote_id, nivel, operacion_id, visitados) as (
    select vo.lote_id, 1, o.id, array[p_lote_id, vo.lote_id]
    from public.operacion_lote_vinculos vd
    join public.operaciones_lote o on o.id = vd.operacion_id and o.tipo <> 'recategorizacion' and not exists (select 1 from public.actividades oa where oa.id = o.actividad_id and oa.anulada_en is not null)
    join public.operacion_lote_vinculos vo on vo.operacion_id = vd.operacion_id and vo.rol = 'origen'
    where vd.lote_id = p_lote_id and vd.rol = 'destino' and vo.lote_id <> p_lote_id
    union all
    select vo.lote_id, a.nivel + 1, o.id, a.visitados || vo.lote_id
    from ancestros a
    join public.operacion_lote_vinculos vd on vd.lote_id = a.lote_id and vd.rol = 'destino'
    join public.operaciones_lote o on o.id = vd.operacion_id and o.tipo <> 'recategorizacion' and not exists (select 1 from public.actividades oa where oa.id = o.actividad_id and oa.anulada_en is not null)
    join public.operacion_lote_vinculos vo on vo.operacion_id = vd.operacion_id and vo.rol = 'origen'
    where not (vo.lote_id = any(a.visitados)) and a.nivel < 20
  ),
  descendientes (lote_id, nivel, operacion_id, visitados) as (
    select vd.lote_id, 1, o.id, array[p_lote_id, vd.lote_id]
    from public.operacion_lote_vinculos vo
    join public.operaciones_lote o on o.id = vo.operacion_id and o.tipo <> 'recategorizacion' and not exists (select 1 from public.actividades oa where oa.id = o.actividad_id and oa.anulada_en is not null)
    join public.operacion_lote_vinculos vd on vd.operacion_id = vo.operacion_id and vd.rol = 'destino'
    where vo.lote_id = p_lote_id and vo.rol = 'origen' and vd.lote_id <> p_lote_id
    union all
    select vd.lote_id, d.nivel + 1, o.id, d.visitados || vd.lote_id
    from descendientes d
    join public.operacion_lote_vinculos vo on vo.lote_id = d.lote_id and vo.rol = 'origen'
    join public.operaciones_lote o on o.id = vo.operacion_id and o.tipo <> 'recategorizacion' and not exists (select 1 from public.actividades oa where oa.id = o.actividad_id and oa.anulada_en is not null)
    join public.operacion_lote_vinculos vd on vd.operacion_id = vo.operacion_id and vd.rol = 'destino'
    where not (vd.lote_id = any(d.visitados)) and d.nivel < 20
  ),
  todos as (
    select a.lote_id, 'ancestro'::text as relacion, a.nivel, a.operacion_id from ancestros a
    union all
    select d.lote_id, 'descendiente'::text, d.nivel, d.operacion_id from descendientes d
  ),
  unicos as (
    select distinct on (t.lote_id, t.relacion) t.lote_id, t.relacion, t.nivel, t.operacion_id
    from todos t
    where t.lote_id <> p_lote_id
    order by t.lote_id, t.relacion, t.nivel
  )
  select u.lote_id, l.nombre, l.estado, u.relacion, u.nivel, u.operacion_id, o.tipo, o.fecha
  from unicos u
  join public.lotes l on l.id = u.lote_id
  join public.operaciones_lote o on o.id = u.operacion_id
  order by u.relacion, u.nivel, o.fecha;
$$;

revoke execute on function public.linaje_lote(uuid) from public, anon;
grant  execute on function public.linaje_lote(uuid) to authenticated;

commit;
