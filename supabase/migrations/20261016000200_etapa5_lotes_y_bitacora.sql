-- Campo Digital v2 — Etapa 5: operaciones de lote, stock a una fecha y bitácora
--
-- Diseño: contexto/DISENO-BASE-ETAPA-5.md
--
-- Mismos criterios que las Etapas 3a y 3c: uuid, created_by sin FK, FKs compuestas con
-- establecimiento_id, nada se borra, escrituras de varias tablas solo por funciones
-- security definer (search_path fijo, validan puede_operar), y todo objeto nuevo nace
-- sin permisos (los default privileges de la 3a ya no dan nada a anon ni authenticated).
--
-- No hace falta ampliar checks: lote_eventos.tipo y operaciones_lote.tipo aceptan
-- 'division', 'union' y 'recategorizacion' desde la Etapa 3a.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Funciones internas para las operaciones de lote
-- ════════════════════════════════════════════════════════════════════════════

-- Valida la fecha de una operación: no vacía, no futura, no anterior a la apertura del lote
create function public._validar_fecha_operacion(p_fecha date, p_apertura date) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_fecha < p_apertura then
    raise exception 'La fecha no puede ser anterior a la apertura del lote (%)', to_char(p_apertura, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
end;
$$;

-- Cabezas de un elemento jsonb: entero mayor a cero (rechaza decimales, negativos y texto)
create function public._cabezas(p_valor jsonb) returns int
language plpgsql
set search_path = ''
as $$
declare
  v numeric;
begin
  begin
    v := (p_valor #>> '{}')::numeric;
  exception when others then
    v := null;
  end;
  if v is null or v <= 0 or v <> trunc(v) then
    raise exception 'Las cabezas tienen que ser un número entero mayor a cero' using errcode = '22023';
  end if;
  return v::int;
end;
$$;

-- Verifica que la categoría exista y sea de la especie indicada
create function public._exigir_categoria(p_categoria_id uuid, p_especie_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_categoria_id is null or not exists (
    select 1 from public.categorias_animales c
    where c.id = p_categoria_id and c.especie_id = p_especie_id
  ) then
    raise exception 'Categoría inexistente o de otra especie' using errcode = '22023';
  end if;
end;
$$;

-- Si el lote quedó con stock cero en todas sus categorías, lo cierra igual que cerrar_lote:
-- estado, fecha de cierre y registro en lote_cambios_estado.
-- Fecha de cierre = la mayor entre la de la operación y la del último evento del lote.
-- Devuelve true si lo cerró.
create function public._cerrar_si_vacio(p_lote_id uuid, p_fecha date, p_motivo text) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_lote  public.lotes;
  v_ultimo date;
  v_cierre date;
begin
  select * into v_lote from public.lotes where id = p_lote_id;

  if v_lote.estado <> 'activo' then
    return false;
  end if;

  if exists (
    select 1 from public.lote_eventos e
    where e.lote_id = p_lote_id
    group by e.categoria_id
    having sum(e.cabezas) <> 0
  ) then
    return false;
  end if;

  select max(e.fecha) into v_ultimo from public.lote_eventos e where e.lote_id = p_lote_id;
  v_cierre := greatest(p_fecha, coalesce(v_ultimo, p_fecha));

  update public.lotes set estado = 'cerrado', fecha_cierre = v_cierre where id = p_lote_id;

  insert into public.lote_cambios_estado (establecimiento_id, lote_id, tipo, fecha, motivo)
  values (v_lote.establecimiento_id, p_lote_id, 'cierre', v_cierre, p_motivo);

  return true;
end;
$$;

revoke execute on function public._validar_fecha_operacion(date, date) from public, anon, authenticated;
revoke execute on function public._cabezas(jsonb)                        from public, anon, authenticated;
revoke execute on function public._exigir_categoria(uuid, uuid)          from public, anon, authenticated;
revoke execute on function public._cerrar_si_vacio(uuid, date, text)     from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. dividir_lote: separa animales de un lote en lotes nuevos
-- ════════════════════════════════════════════════════════════════════════════
-- p_destinos: [{"nombre", "potrero_id", "campana", "composicion": [{"categoria_id", "cabezas"}]}]

create function public.dividir_lote(
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

    insert into public.lotes (establecimiento_id, especie_id, nombre, campana, fecha_apertura, potrero_id)
    values (
      v_origen.establecimiento_id, v_origen.especie_id, v_nombre,
      nullif(btrim(coalesce(v_destino ->> 'campana', '')), ''),
      p_fecha,
      nullif(v_destino ->> 'potrero_id', '')::uuid
    )
    returning id into v_nuevo;

    insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
    values (v_origen.establecimiento_id, v_op, v_nuevo, 'destino');

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

-- ════════════════════════════════════════════════════════════════════════════
-- 3. unir_lotes: junta TODO el stock de uno o más lotes en un destino
-- ════════════════════════════════════════════════════════════════════════════
-- Destino existente (p_destino_id) o nuevo (p_nuevo: {"nombre", "potrero_id", "campana"}).

create function public.unir_lotes(
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

  -- 2. Bloqueo de todos los lotes, ordenados por id (evita bloqueos cruzados) y permiso en cada uno
  v_ids := array(
    select distinct x from unnest(p_lotes_origen || coalesce(array[p_destino_id], '{}'::uuid[])) x order by x
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

  -- 3. Destino nuevo
  if p_destino_id is null then
    v_nombre_destino := btrim(p_nuevo ->> 'nombre');
    insert into public.lotes (establecimiento_id, especie_id, nombre, campana, fecha_apertura, potrero_id)
    values (
      v_primero.establecimiento_id, v_primero.especie_id, v_nombre_destino,
      nullif(btrim(coalesce(p_nuevo ->> 'campana', '')), ''),
      p_fecha,
      nullif(p_nuevo ->> 'potrero_id', '')::uuid
    )
    returning id into v_destino;
  else
    v_destino := p_destino_id;
  end if;

  -- 4. Operación y vínculos
  insert into public.operaciones_lote (establecimiento_id, tipo, fecha, notas)
  values (v_primero.establecimiento_id, 'union', p_fecha, p_notas)
  returning id into v_op;

  insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
  select v_primero.establecimiento_id, v_op, x, 'origen' from unnest(p_lotes_origen) x
  union all
  select v_primero.establecimiento_id, v_op, v_destino, 'destino';

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

-- ════════════════════════════════════════════════════════════════════════════
-- 4. recategorizar_lote: pasa cabezas de una categoría a otra en el mismo lote
-- ════════════════════════════════════════════════════════════════════════════
-- p_cambios: [{"desde_categoria_id", "hacia_categoria_id", "cabezas"}]

create function public.recategorizar_lote(
  p_lote_id uuid,
  p_fecha   date,
  p_cambios jsonb,
  p_notas   text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote   public.lotes;
  v_op     uuid;
  v_item   jsonb;
  v_desde  uuid;
  v_hacia  uuid;
  v_cab    int;
  v_cats   uuid[] := '{}';
  v_cat    uuid;
begin
  v_lote := public._bloquear_lote_editable(p_lote_id);

  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' or jsonb_array_length(p_cambios) = 0 then
    raise exception 'Indicá al menos un cambio de categoría' using errcode = '22023';
  end if;

  insert into public.operaciones_lote (establecimiento_id, tipo, fecha, notas)
  values (v_lote.establecimiento_id, 'recategorizacion', p_fecha, p_notas)
  returning id into v_op;

  -- El mismo lote es origen y destino (el linaje lo ignora)
  insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
  values (v_lote.establecimiento_id, v_op, v_lote.id, 'origen'),
         (v_lote.establecimiento_id, v_op, v_lote.id, 'destino');

  for v_item in select * from jsonb_array_elements(p_cambios) loop
    v_desde := nullif(v_item ->> 'desde_categoria_id', '')::uuid;
    v_hacia := nullif(v_item ->> 'hacia_categoria_id', '')::uuid;
    perform public._exigir_categoria(v_desde, v_lote.especie_id);
    perform public._exigir_categoria(v_hacia, v_lote.especie_id);
    if v_desde = v_hacia then
      raise exception 'La categoría de origen y la de destino tienen que ser distintas' using errcode = '22023';
    end if;
    v_cab := public._cabezas(v_item -> 'cabezas');

    insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, operacion_lote_id)
    values
      (v_lote.establecimiento_id, v_lote.id, v_lote.especie_id, v_desde, -v_cab, p_fecha, 'recategorizacion', v_op),
      (v_lote.establecimiento_id, v_lote.id, v_lote.especie_id, v_hacia,  v_cab, p_fecha, 'recategorizacion', v_op);

    v_cats := v_cats || array[v_desde, v_hacia];
  end loop;

  -- Saldo de cada categoría tocada, día por día (también con fecha hacia atrás)
  foreach v_cat in array (select array_agg(distinct c) from unnest(v_cats) c) loop
    perform public._validar_saldo(v_lote.id, v_cat);
  end loop;

  return v_op;
end;
$$;

revoke execute on function public.dividir_lote(uuid, date, jsonb, text)            from public, anon;
revoke execute on function public.unir_lotes(uuid[], date, uuid, jsonb, text)      from public, anon;
revoke execute on function public.recategorizar_lote(uuid, date, jsonb, text)      from public, anon;
grant  execute on function public.dividir_lote(uuid, date, jsonb, text)            to authenticated;
grant  execute on function public.unir_lotes(uuid[], date, uuid, jsonb, text)      to authenticated;
grant  execute on function public.recategorizar_lote(uuid, date, jsonb, text)      to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Lectura: linaje y stock a una fecha (security invoker: el RLS aplica)
-- ════════════════════════════════════════════════════════════════════════════

-- De qué lotes viene un lote (ancestros) y en qué lotes terminó (descendientes).
-- Ignora las recategorizaciones. Corta ciclos con el arreglo de visitados (caso: dividir
-- A en B y unir B en A), tiene tope de 20 niveles y no repite lotes dentro de una misma
-- relación (si a un lote se llega por varios caminos, queda el nivel más cercano).
create function public.linaje_lote(p_lote_id uuid)
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
    join public.operaciones_lote o on o.id = vd.operacion_id and o.tipo <> 'recategorizacion'
    join public.operacion_lote_vinculos vo on vo.operacion_id = vd.operacion_id and vo.rol = 'origen'
    where vd.lote_id = p_lote_id and vd.rol = 'destino' and vo.lote_id <> p_lote_id
    union all
    select vo.lote_id, a.nivel + 1, o.id, a.visitados || vo.lote_id
    from ancestros a
    join public.operacion_lote_vinculos vd on vd.lote_id = a.lote_id and vd.rol = 'destino'
    join public.operaciones_lote o on o.id = vd.operacion_id and o.tipo <> 'recategorizacion'
    join public.operacion_lote_vinculos vo on vo.operacion_id = vd.operacion_id and vo.rol = 'origen'
    where not (vo.lote_id = any(a.visitados)) and a.nivel < 20
  ),
  descendientes (lote_id, nivel, operacion_id, visitados) as (
    select vd.lote_id, 1, o.id, array[p_lote_id, vd.lote_id]
    from public.operacion_lote_vinculos vo
    join public.operaciones_lote o on o.id = vo.operacion_id and o.tipo <> 'recategorizacion'
    join public.operacion_lote_vinculos vd on vd.operacion_id = vo.operacion_id and vd.rol = 'destino'
    where vo.lote_id = p_lote_id and vo.rol = 'origen' and vd.lote_id <> p_lote_id
    union all
    select vd.lote_id, d.nivel + 1, o.id, d.visitados || vd.lote_id
    from descendientes d
    join public.operacion_lote_vinculos vo on vo.lote_id = d.lote_id and vo.rol = 'origen'
    join public.operaciones_lote o on o.id = vo.operacion_id and o.tipo <> 'recategorizacion'
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

-- Stock por especie y categoría a una fecha, sumando todos los lotes (también los que
-- hoy están cerrados: a esa fecha podían tener animales).
create function public.stock_al(p_establecimiento_id uuid, p_fecha date)
returns table (especie_id uuid, categoria_id uuid, cabezas int)
language sql
stable
set search_path = ''
as $$
  select e.especie_id, e.categoria_id, sum(e.cabezas)::int
  from public.lote_eventos e
  where e.establecimiento_id = p_establecimiento_id
    and e.fecha <= p_fecha
  group by e.especie_id, e.categoria_id
  having sum(e.cabezas) <> 0;
$$;

revoke execute on function public.linaje_lote(uuid)    from public, anon;
revoke execute on function public.stock_al(uuid, date) from public, anon;
grant  execute on function public.linaje_lote(uuid)    to authenticated;
grant  execute on function public.stock_al(uuid, date) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Bitácora
-- ════════════════════════════════════════════════════════════════════════════

create table public.bitacora_entradas (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  fecha              date not null default public.fecha_hoy(),
  tipo               text not null check (tipo in ('decision', 'idea', 'observacion', 'compra_venta_gasto')),
  texto              text not null check (btrim(texto) <> ''),
  estado_idea        text check (estado_idea in ('abierta', 'decidida', 'descartada')),
  persona_id         uuid,   -- responsable (catálogo personas)
  editada_en         timestamptz,
  editada_por        uuid,   -- auditoría, sin FK (como created_by)
  anulada_en         timestamptz,
  anulada_por        uuid,   -- auditoría, sin FK
  motivo_anulacion   text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),   -- técnico: no se usa para "editada"
  foreign key (persona_id, establecimiento_id)
    references public.personas (id, establecimiento_id) on delete restrict,
  -- toda idea tiene estado y nada que no sea idea lo tiene
  check ((tipo = 'idea') = (estado_idea is not null)),
  check ((editada_en is null) = (editada_por is null)),
  -- los tres datos de la anulación van juntos
  check ((anulada_en is null) = (anulada_por is null) and (anulada_en is null) = (motivo_anulacion is null)),
  check (motivo_anulacion is null or btrim(motivo_anulacion) <> ''),
  unique (id, establecimiento_id)
);

create index bitacora_entradas_fecha_idx on public.bitacora_entradas (establecimiento_id, fecha desc, created_at desc);
create index bitacora_entradas_tipo_idx  on public.bitacora_entradas (establecimiento_id, tipo);

create table public.bitacora_lotes (
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  entrada_id         uuid not null,
  lote_id            uuid not null,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  primary key (entrada_id, lote_id),
  foreign key (entrada_id, establecimiento_id)
    references public.bitacora_entradas (id, establecimiento_id) on delete restrict,
  -- el lote tiene que ser del mismo establecimiento que la entrada
  foreign key (lote_id, establecimiento_id)
    references public.lotes (id, establecimiento_id) on delete restrict
);

create index bitacora_lotes_lote_idx on public.bitacora_lotes (lote_id);

create trigger set_updated_at before update on public.bitacora_entradas
  for each row execute function public.set_updated_at();

-- Las entradas no se borran: se anulan. Frena incluso a service_role y al SQL Editor.
create function public.bloquear_borrado() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las entradas de % no se borran: se anulan', tg_table_name using errcode = '42501';
end;
$$;

revoke execute on function public.bloquear_borrado() from public, anon, authenticated;

create trigger sin_borrado before delete on public.bitacora_entradas
  for each row execute function public.bloquear_borrado();
create trigger sin_truncate before truncate on public.bitacora_entradas
  for each statement execute function public.bloquear_borrado();

-- RLS: leen los miembros (consulta incluido); nadie escribe directo
alter table public.bitacora_entradas enable row level security;
alter table public.bitacora_lotes    enable row level security;

create policy bitacora_entradas_select on public.bitacora_entradas
  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy bitacora_lotes_select on public.bitacora_lotes
  for select to authenticated using (public.es_miembro(establecimiento_id));

revoke all on public.bitacora_entradas, public.bitacora_lotes from anon, authenticated;
grant select on public.bitacora_entradas, public.bitacora_lotes to authenticated;

-- ── Funciones internas de la bitácora ───────────────────────────────────────

-- Valida tipo, texto, fecha y responsable de una entrada
create function public._validar_entrada_bitacora(
  p_establecimiento_id uuid, p_fecha date, p_tipo text, p_texto text, p_persona_id uuid
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_tipo is null or p_tipo not in ('decision', 'idea', 'observacion', 'compra_venta_gasto') then
    raise exception 'Tipo inválido: decisión, idea, observación o compra/venta/gasto' using errcode = '22023';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'La entrada necesita un texto' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_persona_id is not null and not exists (
    select 1 from public.personas p where p.id = p_persona_id and p.establecimiento_id = p_establecimiento_id
  ) then
    raise exception 'El responsable no es de este establecimiento' using errcode = '22023';
  end if;
end;
$$;

-- Reemplaza los lotes etiquetados de una entrada (solo lotes del mismo establecimiento)
create function public._guardar_lotes_bitacora(p_entrada_id uuid, p_establecimiento_id uuid, p_lotes uuid[]) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_lotes is not null and exists (
    select 1 from unnest(p_lotes) x
    where x is null or not exists (
      select 1 from public.lotes l where l.id = x and l.establecimiento_id = p_establecimiento_id
    )
  ) then
    raise exception 'Hay lotes inexistentes o de otro establecimiento' using errcode = '22023';
  end if;

  delete from public.bitacora_lotes where entrada_id = p_entrada_id;

  insert into public.bitacora_lotes (establecimiento_id, entrada_id, lote_id)
  select distinct p_establecimiento_id, p_entrada_id, x from unnest(coalesce(p_lotes, '{}'::uuid[])) x;
end;
$$;

-- Bloquea la entrada y verifica permiso de carga; no distingue "no existe" de "sin permiso"
create function public._bloquear_entrada_bitacora(p_entrada_id uuid) returns public.bitacora_entradas
language plpgsql
set search_path = ''
as $$
declare
  v public.bitacora_entradas;
begin
  select * into v from public.bitacora_entradas where id = p_entrada_id for update;
  if not found or not public.puede_operar(v.establecimiento_id) then
    raise exception 'Entrada inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  return v;
end;
$$;

revoke execute on function public._validar_entrada_bitacora(uuid, date, text, text, uuid) from public, anon, authenticated;
revoke execute on function public._guardar_lotes_bitacora(uuid, uuid, uuid[])             from public, anon, authenticated;
revoke execute on function public._bloquear_entrada_bitacora(uuid)                        from public, anon, authenticated;

-- ── Funciones de escritura de la bitácora (administrador u operador) ────────

create function public.crear_entrada_bitacora(
  p_establecimiento_id uuid,
  p_fecha              date,
  p_tipo               text,
  p_texto              text,
  p_lotes              uuid[] default null,
  p_persona_id         uuid   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_fecha date := coalesce(p_fecha, public.fecha_hoy());
begin
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._validar_entrada_bitacora(p_establecimiento_id, v_fecha, p_tipo, p_texto, p_persona_id);

  insert into public.bitacora_entradas (establecimiento_id, fecha, tipo, texto, estado_idea, persona_id)
  values (
    p_establecimiento_id, v_fecha, p_tipo, btrim(p_texto),
    case when p_tipo = 'idea' then 'abierta' end,
    p_persona_id
  )
  returning id into v_id;

  perform public._guardar_lotes_bitacora(v_id, p_establecimiento_id, p_lotes);
  return v_id;
end;
$$;

-- Edita el contenido y reemplaza los lotes. Cuenta como edición (editada_en/editada_por).
create function public.editar_entrada_bitacora(
  p_entrada_id uuid,
  p_fecha      date,
  p_tipo       text,
  p_texto      text,
  p_lotes      uuid[] default null,
  p_persona_id uuid   default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bitacora_entradas;
begin
  v := public._bloquear_entrada_bitacora(p_entrada_id);
  if v.anulada_en is not null then
    raise exception 'La entrada está anulada: restaurala antes de editarla' using errcode = '22023';
  end if;
  perform public._validar_entrada_bitacora(v.establecimiento_id, p_fecha, p_tipo, p_texto, p_persona_id);

  update public.bitacora_entradas
  set fecha       = p_fecha,
      tipo        = p_tipo,
      texto       = btrim(p_texto),
      persona_id  = p_persona_id,
      -- sigue siendo idea: conserva su estado; pasa a ser idea: arranca abierta; deja de serlo: sin estado
      estado_idea = case when p_tipo = 'idea' then coalesce(v.estado_idea, 'abierta') end,
      editada_en  = now(),
      editada_por = auth.uid()
  where id = v.id;

  perform public._guardar_lotes_bitacora(v.id, v.establecimiento_id, p_lotes);
end;
$$;

-- Cambia el estado de una idea. NO cuenta como edición.
create function public.cambiar_estado_idea(p_entrada_id uuid, p_estado text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bitacora_entradas;
begin
  v := public._bloquear_entrada_bitacora(p_entrada_id);
  if v.anulada_en is not null then
    raise exception 'La entrada está anulada: restaurala antes de cambiarla' using errcode = '22023';
  end if;
  if v.tipo <> 'idea' then
    raise exception 'Solo las ideas tienen estado' using errcode = '22023';
  end if;
  if p_estado is null or p_estado not in ('abierta', 'decidida', 'descartada') then
    raise exception 'Estado inválido: abierta, decidida o descartada' using errcode = '22023';
  end if;

  update public.bitacora_entradas set estado_idea = p_estado where id = v.id;
end;
$$;

create function public.anular_entrada_bitacora(p_entrada_id uuid, p_motivo text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bitacora_entradas;
begin
  v := public._bloquear_entrada_bitacora(p_entrada_id);
  if v.anulada_en is not null then
    raise exception 'La entrada ya está anulada' using errcode = '22023';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indicá el motivo de la anulación' using errcode = '22023';
  end if;

  update public.bitacora_entradas
  set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
  where id = v.id;
end;
$$;

create function public.restaurar_entrada_bitacora(p_entrada_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bitacora_entradas;
begin
  v := public._bloquear_entrada_bitacora(p_entrada_id);
  if v.anulada_en is null then
    raise exception 'La entrada no está anulada' using errcode = '22023';
  end if;

  update public.bitacora_entradas
  set anulada_en = null, anulada_por = null, motivo_anulacion = null
  where id = v.id;
end;
$$;

revoke execute on function public.crear_entrada_bitacora(uuid, date, text, text, uuid[], uuid)  from public, anon;
revoke execute on function public.editar_entrada_bitacora(uuid, date, text, text, uuid[], uuid) from public, anon;
revoke execute on function public.cambiar_estado_idea(uuid, text)                               from public, anon;
revoke execute on function public.anular_entrada_bitacora(uuid, text)                           from public, anon;
revoke execute on function public.restaurar_entrada_bitacora(uuid)                              from public, anon;
grant  execute on function public.crear_entrada_bitacora(uuid, date, text, text, uuid[], uuid)  to authenticated;
grant  execute on function public.editar_entrada_bitacora(uuid, date, text, text, uuid[], uuid) to authenticated;
grant  execute on function public.cambiar_estado_idea(uuid, text)                               to authenticated;
grant  execute on function public.anular_entrada_bitacora(uuid, text)                           to authenticated;
grant  execute on function public.restaurar_entrada_bitacora(uuid)                              to authenticated;

commit;
