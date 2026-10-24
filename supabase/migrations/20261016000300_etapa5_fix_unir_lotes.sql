-- Campo Digital v2 — Etapa 5, corrección: unir_lotes con destino nuevo
--
-- Bug de 20261016000200 (ya aplicada, no se edita): con destino nuevo, la lista de lotes a
-- bloquear incluía un NULL (array[NULL] no es NULL, así que coalesce no lo reemplazaba).
-- _bloquear_lote_editable(NULL) no encuentra lote y corta con 42501 "Lote inexistente o sin
-- permiso de edición". Con destino existente no pasaba, y si un origen fallaba antes por fecha
-- (prueba U04) el error de fecha salía primero porque el NULL se ordena al final.
--
-- La función se reemplaza entera con la misma firma (create or replace conserva los permisos).
-- Único cambio: cómo se arma v_ids.

begin;

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
  -- Corrección 0300: con destino nuevo (p_destino_id null), array[p_destino_id] es {NULL}, no NULL,
  -- así que coalesce no lo reemplazaba y la lista terminaba con un NULL que el helper de bloqueo
  -- rechazaba con 42501. Ahora el destino se agrega solo si existe.
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

-- Los permisos no cambian con create or replace; se reafirman por claridad
revoke execute on function public.unir_lotes(uuid[], date, uuid, jsonb, text) from public, anon;
grant  execute on function public.unir_lotes(uuid[], date, uuid, jsonb, text) to authenticated;

commit;
