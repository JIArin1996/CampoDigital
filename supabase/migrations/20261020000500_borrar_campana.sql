-- Campo Digital v2 — Borrar lotes.campana
--
-- La campaña (texto libre) la reemplazó anios_nacimiento en 20261020000200, que migró los valores
-- (comparación verificada: los 5 lotes con campaña quedaron con sus años y los 6 sin campaña, vacíos).
-- La app ya no la manda ni la muestra. Esta migración borra la columna.
--
-- Antes de borrarla, las funciones que todavía la escribían dejan de hacerlo (el resto de cada
-- función queda igual a su versión vigente):
--   * crear_lote (20261020000200): se saca el parámetro p_campana. Cambia la firma: se borra y se
--     vuelve a crear, con los mismos permisos. La app lo llama con argumentos por nombre.
--   * dividir_lote, unir_lotes, registrar_compra (20261020000200) y registrar_paricion (20261016000400):
--     misma firma (create or replace conserva los permisos). Si el jsonb trae "campana", se ignora.
-- _anios_de_texto (la conversión de la campaña) queda: no lee la columna y la prueban sus tests.
--
-- Conteo de funciones de la auditoría: sin cambios (crear_lote se borra y se vuelve a crear).
-- Irreversible: después de esto la campaña escrita a mano ya no existe.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. crear_lote sin p_campana
-- ════════════════════════════════════════════════════════════════════════════

drop function public.crear_lote(uuid, uuid, text, date, jsonb, uuid, text, text, int[]);

create function public.crear_lote(
  p_establecimiento_id uuid,
  p_especie_id         uuid,
  p_nombre             text,
  p_fecha_apertura     date,
  p_composicion        jsonb,
  p_potrero_id         uuid  default null,
  p_notas              text  default null,
  p_anios_nacimiento   int[] default '{}'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  uuid;
  v_item  jsonb;
  v_cat   uuid;
  v_cab   int;
begin
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de edición en este establecimiento' using errcode = '42501';
  end if;

  if p_fecha_apertura is null or p_fecha_apertura > public.fecha_hoy() then
    raise exception 'La fecha de apertura no puede estar vacía ni ser futura' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.especies s
    where s.id = p_especie_id and s.establecimiento_id = p_establecimiento_id and s.activo
  ) then
    raise exception 'Especie inexistente o inactiva en este establecimiento' using errcode = '22023';
  end if;

  if p_composicion is null or jsonb_typeof(p_composicion) <> 'array' or jsonb_array_length(p_composicion) = 0 then
    raise exception 'La composición inicial tiene que tener al menos una categoría' using errcode = '22023';
  end if;

  if (select count(distinct x ->> 'categoria_id') from jsonb_array_elements(p_composicion) x)
     <> jsonb_array_length(p_composicion) then
    raise exception 'Hay categorías repetidas en la composición inicial' using errcode = '22023';
  end if;

  -- Los años los valida el trigger validar_anios_nacimiento
  insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id, notas, anios_nacimiento)
  values (p_establecimiento_id, p_especie_id, p_nombre, p_fecha_apertura, p_potrero_id, p_notas,
          coalesce(p_anios_nacimiento, '{}'))
  returning id into v_lote;

  for v_item in select * from jsonb_array_elements(p_composicion) loop
    v_cat := nullif(v_item ->> 'categoria_id', '')::uuid;
    v_cab := (v_item ->> 'cabezas')::int;

    if v_cab is null or v_cab <= 0 then
      raise exception 'Las cabezas del alta inicial tienen que ser mayores a cero' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.categorias_animales c
      where c.id = v_cat and c.especie_id = p_especie_id and c.activo
    ) then
      raise exception 'Categoría inexistente, inactiva o de otra especie' using errcode = '22023';
    end if;

    insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo)
    values (p_establecimiento_id, v_lote, p_especie_id, v_cat, v_cab, p_fecha_apertura, 'alta_inicial');
  end loop;

  return v_lote;
end;
$$;

revoke execute on function public.crear_lote(uuid, uuid, text, date, jsonb, uuid, text, int[]) from public, anon;
grant  execute on function public.crear_lote(uuid, uuid, text, date, jsonb, uuid, text, int[]) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Las funciones que crean lotes dejan de escribir campana (misma firma)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.dividir_lote(
  p_lote_id  uuid,
  p_fecha    date,
  p_destinos jsonb,
  p_notas    text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen  public.lotes;
  v_op      uuid;
  v_destino jsonb;
  v_item    jsonb;
  v_nuevo   uuid;
  v_nombre  text;
  v_cat     uuid;
  v_cab     int;
  v_cats    uuid[] := '{}';
  v_nombres text[] := '{}';
begin
  -- 1. Bloqueo y permiso (antes de leer el saldo)
  v_origen := public._bloquear_lote_editable(p_lote_id);

  -- 2. Validaciones
  if v_origen.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_origen.fecha_apertura);

  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Indicá al menos un lote nuevo' using errcode = '22023';
  end if;

  -- 3. Operación y vínculo del origen
  insert into public.operaciones_lote (establecimiento_id, tipo, fecha, notas)
  values (v_origen.establecimiento_id, 'division', p_fecha, p_notas)
  returning id into v_op;

  insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
  values (v_origen.establecimiento_id, v_op, v_origen.id, 'origen');

  -- 4. Cada destino: lote nuevo y eventos -n en el origen, +n en el destino
  for v_destino in select * from jsonb_array_elements(p_destinos) loop
    v_nombre := btrim(coalesce(v_destino ->> 'nombre', ''));
    if v_nombre = '' then
      raise exception 'Cada lote nuevo necesita un nombre' using errcode = '22023';
    end if;

    if jsonb_typeof(v_destino -> 'composicion') is distinct from 'array'
       or jsonb_array_length(v_destino -> 'composicion') = 0 then
      raise exception 'El lote "%" no tiene animales', v_nombre using errcode = '22023';
    end if;

    if (select count(distinct x ->> 'categoria_id') from jsonb_array_elements(v_destino -> 'composicion') x)
       <> jsonb_array_length(v_destino -> 'composicion') then
      raise exception 'Hay categorías repetidas en el lote "%"', v_nombre using errcode = '22023';
    end if;

    -- Años: los que indique la división para este lote o, si no vienen, los del origen
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id, anios_nacimiento)
    values (
      v_origen.establecimiento_id, v_origen.especie_id, v_nombre,
      p_fecha,
      nullif(v_destino ->> 'potrero_id', '')::uuid,
      coalesce(public._anios_de_jsonb(v_destino -> 'anios_nacimiento'), v_origen.anios_nacimiento)
    )
    returning id into v_nuevo;

    insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
    values (v_origen.establecimiento_id, v_op, v_nuevo, 'destino');

    -- Hereda los archivos visibles del origen (por referencia: el archivo no se duplica)
    insert into public.lote_archivos (lote_id, archivo_id, establecimiento_id, heredado_de_lote_id)
    select v_nuevo, la.archivo_id, v_origen.establecimiento_id, v_origen.id
    from public.lote_archivos la
    where la.lote_id = v_origen.id and not la.oculto
    on conflict (lote_id, archivo_id) do nothing;

    for v_item in select * from jsonb_array_elements(v_destino -> 'composicion') loop
      v_cat := nullif(v_item ->> 'categoria_id', '')::uuid;
      perform public._exigir_categoria(v_cat, v_origen.especie_id);
      v_cab := public._cabezas(v_item -> 'cabezas');

      insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, operacion_lote_id)
      values
        (v_origen.establecimiento_id, v_origen.id, v_origen.especie_id, v_cat, -v_cab, p_fecha, 'division', v_op),
        (v_origen.establecimiento_id, v_nuevo,     v_origen.especie_id, v_cat,  v_cab, p_fecha, 'division', v_op);

      v_cats := array_append(v_cats, v_cat);
    end loop;

    v_nombres := array_append(v_nombres, v_nombre);
  end loop;

  -- 5. Saldo del origen: acumulado de cada día >= 0, también con fecha hacia atrás
  foreach v_cat in array (select array_agg(distinct c) from unnest(v_cats) c) loop
    perform public._validar_saldo(v_origen.id, v_cat);
  end loop;

  -- 6. Si el origen quedó vacío, se cierra
  perform public._cerrar_si_vacio(v_origen.id, p_fecha, 'Dividido en ' || array_to_string(v_nombres, ', '));

  return v_op;
end;
$$;

create or replace function public.unir_lotes(
  p_lotes_origen uuid[],
  p_fecha        date,
  p_destino_id   uuid  default null,
  p_nuevo        jsonb default null,
  p_notas        text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_ids      uuid[];
  v_lote     public.lotes;
  v_primero  public.lotes;
  v_destino  uuid;
  v_nombre_destino text;
  v_op       uuid;
  v_ultimo   date;
  v_anios    int[];
  r          record;
begin
  -- 1. Validaciones de los parámetros
  if p_lotes_origen is null or cardinality(p_lotes_origen) = 0 then
    raise exception 'Indicá al menos un lote para unir' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_lotes_origen) x) <> cardinality(p_lotes_origen)
     or array_position(p_lotes_origen, null) is not null then
    raise exception 'Hay lotes repetidos o vacíos en la lista' using errcode = '22023';
  end if;
  if p_destino_id is not null and p_destino_id = any(p_lotes_origen) then
    raise exception 'El lote destino no puede ser también un lote de origen' using errcode = '22023';
  end if;
  if p_destino_id is null then
    if cardinality(p_lotes_origen) < 2 then
      raise exception 'Para crear un lote nuevo hacen falta al menos dos lotes de origen' using errcode = '22023';
    end if;
    if btrim(coalesce(p_nuevo ->> 'nombre', '')) = '' then
      raise exception 'El lote nuevo necesita un nombre' using errcode = '22023';
    end if;
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;

  -- 2. Bloqueo de todos los lotes, ordenados por id (evita bloqueos cruzados) y permiso en cada uno.
  -- El destino se agrega solo si existe (corrección 0300).
  v_ids := array(
    select distinct x
    from unnest(
      p_lotes_origen || case when p_destino_id is not null then array[p_destino_id] else '{}'::uuid[] end
    ) x
    order by x
  );
  foreach v_id in array v_ids loop
    v_lote := public._bloquear_lote_editable(v_id);
    if v_primero.id is null then
      v_primero := v_lote;
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote "%" está cerrado', v_lote.nombre using errcode = '22023';
    end if;
    if v_lote.establecimiento_id <> v_primero.establecimiento_id or v_lote.especie_id <> v_primero.especie_id then
      raise exception 'Solo se pueden unir lotes del mismo establecimiento y la misma especie' using errcode = '22023';
    end if;

    if v_id = any(p_lotes_origen) then
      -- Origen: la fecha no puede ser anterior a su último evento ni a su apertura
      select max(e.fecha) into v_ultimo from public.lote_eventos e where e.lote_id = v_id;
      if p_fecha < greatest(v_lote.fecha_apertura, coalesce(v_ultimo, v_lote.fecha_apertura)) then
        raise exception 'La fecha tiene que ser igual o posterior al último movimiento del lote "%" (%)',
          v_lote.nombre, to_char(greatest(v_lote.fecha_apertura, coalesce(v_ultimo, v_lote.fecha_apertura)), 'DD/MM/YYYY')
          using errcode = '22023';
      end if;
    else
      -- Destino existente: la fecha no puede ser anterior a su apertura
      if p_fecha < v_lote.fecha_apertura then
        raise exception 'La fecha no puede ser anterior a la apertura del lote destino (%)',
          to_char(v_lote.fecha_apertura, 'DD/MM/YYYY') using errcode = '22023';
      end if;
      v_nombre_destino := v_lote.nombre;
    end if;
  end loop;

  -- Años del destino: unión de los de todos los lotes (orígenes y, si existe, el destino)
  select coalesce(array_agg(distinct a order by a), '{}') into v_anios
  from public.lotes l, unnest(l.anios_nacimiento) a
  where l.id = any(v_ids);

  -- 3. Destino nuevo, o actualizar los años del existente
  if p_destino_id is null then
    v_nombre_destino := btrim(p_nuevo ->> 'nombre');
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id, anios_nacimiento)
    values (
      v_primero.establecimiento_id, v_primero.especie_id, v_nombre_destino,
      p_fecha,
      nullif(p_nuevo ->> 'potrero_id', '')::uuid,
      v_anios
    )
    returning id into v_destino;
  else
    v_destino := p_destino_id;
    update public.lotes set anios_nacimiento = v_anios where id = v_destino and anios_nacimiento is distinct from v_anios;
  end if;

  -- 4. Operación y vínculos
  insert into public.operaciones_lote (establecimiento_id, tipo, fecha, notas)
  values (v_primero.establecimiento_id, 'union', p_fecha, p_notas)
  returning id into v_op;

  insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
  select v_primero.establecimiento_id, v_op, x, 'origen' from unnest(p_lotes_origen) x
  union all
  select v_primero.establecimiento_id, v_op, v_destino, 'destino';

  -- Archivos visibles de los orígenes al destino, sin duplicar (si el mismo archivo estaba en dos
  -- orígenes, o ya en el destino, queda una sola vez). Los orígenes conservan los suyos.
  insert into public.lote_archivos (lote_id, archivo_id, establecimiento_id, heredado_de_lote_id)
  select distinct on (la.archivo_id) v_destino, la.archivo_id, v_primero.establecimiento_id, la.lote_id
  from public.lote_archivos la
  where la.lote_id = any(p_lotes_origen) and not la.oculto
  order by la.archivo_id, la.lote_id
  on conflict (lote_id, archivo_id) do nothing;

  -- 5. Todo el stock de cada origen pasa al destino, por categoría
  for r in
    select e.lote_id, e.categoria_id, sum(e.cabezas)::int as saldo
    from public.lote_eventos e
    where e.lote_id = any(p_lotes_origen)
    group by e.lote_id, e.categoria_id
    having sum(e.cabezas) <> 0
  loop
    insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, operacion_lote_id)
    values
      (v_primero.establecimiento_id, r.lote_id,  v_primero.especie_id, r.categoria_id, -r.saldo, p_fecha, 'union', v_op),
      (v_primero.establecimiento_id, v_destino,  v_primero.especie_id, r.categoria_id,  r.saldo, p_fecha, 'union', v_op);

    perform public._validar_saldo(r.lote_id, r.categoria_id);
  end loop;

  -- 6. Cada origen queda cerrado
  foreach v_id in array p_lotes_origen loop
    if not public._cerrar_si_vacio(v_id, p_fecha, 'Unido a ' || v_nombre_destino) then
      raise exception 'No se pudo cerrar un lote de origen: quedó con stock' using errcode = '23514';
    end if;
  end loop;

  return v_op;
end;
$$;

create or replace function public.registrar_compra(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_lineas             jsonb,                  -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
  p_modalidad          text,                   -- productor, remate, frigorifico, otra
  p_lote_id            uuid  default null,     -- destino existente...
  p_lote_nuevo         jsonb default null,     -- ...o nuevo: {"nombre", "especie_id", "potrero_id", "anios_nacimiento"?}
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
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id, anios_nacimiento)
    values (
      p_establecimiento_id, v_especie, btrim(p_lote_nuevo ->> 'nombre'),
      p_fecha,
      nullif(p_lote_nuevo ->> 'potrero_id', '')::uuid,
      coalesce(public._anios_de_jsonb(p_lote_nuevo -> 'anios_nacimiento'), '{}')   -- los que indique; sin inferir
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

create or replace function public.registrar_paricion(
  p_id               uuid,
  p_lote_madres_id   uuid,
  p_fecha            date,
  p_lineas           jsonb,                  -- crías vivas: [{"categoria_id", "cabezas"}]
  p_nacidos_muertos  int   default 0,
  p_lote_cria_id     uuid  default null,     -- lote de cría existente...
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

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select v_madres.establecimiento_id, v_cria.id, v_cria.especie_id, l.categoria_id, l.cabezas, p_fecha, 'paricion', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  return p_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. La columna
-- ════════════════════════════════════════════════════════════════════════════

alter table public.lotes drop column campana;

commit;
