-- Campo Digital v2 — Tablero de Indicadores, etapa 5c: actividad Consumo (faena propia)
-- (diseño: contexto/DISENO-INDICADORES-TABLERO.md, secciones 12 y 13). Después de 20261111000200.
--
-- Los animales que se faenan para consumo del establecimiento: baja de stock de un lote, por categoría, con el peso
-- vivo total opcional de cada categoría. No es mortandad: cuenta en la extracción y la producción de carne (etapa 6),
-- no en el % de mortandad. Como la mortandad, no cierra el lote si queda vacío.
--
--   1. Tipo 'consumo' en actividades y en lote_eventos (con actividad obligatoria, como la mortandad).
--   2. Sin tabla de detalle: las cabezas y los kg van en actividad_lineas (peso opcional, como en compra y venta);
--      v_actividades ya los muestra (cabezas, peso vivo total y promedio).
--   3. _cargar_consumo (interna), registrar_consumo y editar_consumo (administrador y operador). Se elimina con
--      eliminar_actividad, como las demás.
--   4. tablero_stock (misma firma): el motivo "Consumo" en los movimientos.
--
-- Auditoría: +3 funciones (_cargar_consumo, registrar_consumo, editar_consumo): 164.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tipo 'consumo'
-- ════════════════════════════════════════════════════════════════════════════

-- El check de tipo de actividades se creó sin nombre: se busca por su definición
do $$
declare
  v_nombres text[];
begin
  select array_agg(conname) into v_nombres from pg_constraint
  where conrelid = 'public.actividades'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%diagnostico_gestacion%';
  if coalesce(array_length(v_nombres, 1), 0) <> 1 then
    raise exception 'Se esperaba un solo check de tipo en actividades y hay %', coalesce(array_length(v_nombres, 1), 0);
  end if;
  execute format('alter table public.actividades drop constraint %I', v_nombres[1]);
end $$;

alter table public.actividades add constraint actividades_tipo_check check (tipo in (
  'pesada', 'sanidad', 'antiparasitario', 'servicio', 'diagnostico_gestacion',
  'paricion', 'destete', 'esquila', 'mortandad', 'compra', 'venta', 'personalizada', 'consumo'));

alter table public.lote_eventos drop constraint lote_eventos_tipo_check;
alter table public.lote_eventos add constraint lote_eventos_tipo_check check (tipo in (
  'alta_inicial', 'paricion', 'compra', 'venta', 'mortandad',
  'recategorizacion', 'division', 'union', 'ajuste', 'destete', 'consumo'));

alter table public.lote_eventos drop constraint lote_eventos_actividad_check;
alter table public.lote_eventos add constraint lote_eventos_actividad_check
  check (tipo not in ('paricion', 'compra', 'venta', 'mortandad', 'destete', 'consumo') or actividad_id is not null);

-- ════════════════════════════════════════════════════════════════════════════
-- 2-3. Carga, registrar y editar
-- ════════════════════════════════════════════════════════════════════════════

-- Consumo: líneas (peso opcional) y eventos (-). Con p_validar_saldo, valida el saldo de sus categorías.
create function public._cargar_consumo(
  p_id uuid, p_lote public.lotes, p_fecha date, p_lineas jsonb, p_validar_saldo boolean
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_cat uuid;
begin
  perform public._insertar_lineas(p_id, p_lote.establecimiento_id, p_lote.especie_id, p_lineas, 'opcional');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select p_lote.establecimiento_id, p_lote.id, p_lote.especie_id, l.categoria_id, -l.cabezas, p_fecha, 'consumo', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  if p_validar_saldo then
    for v_cat in select l.categoria_id from public.actividad_lineas l where l.actividad_id = p_id loop
      perform public._validar_saldo(p_lote.id, v_cat);
    end loop;
  end if;
end;
$$;

revoke execute on function public._cargar_consumo(uuid, public.lotes, date, jsonb, boolean) from public, anon, authenticated;

-- Idempotente con p_id: si el mismo envío llega dos veces, devuelve la actividad ya creada
create function public.registrar_consumo(
  p_id           uuid,
  p_lote_id      uuid,
  p_fecha        date,
  p_lineas       jsonb,   -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
  p_responsables uuid[] default null,
  p_notas        text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'consumo') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'consumo', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  perform public._cargar_consumo(p_id, v_lote, p_fecha, p_lineas, true);

  return p_id;
end;
$$;

create function public.editar_consumo(
  p_actividad_id uuid,
  p_lote_id      uuid,
  p_fecha        date,
  p_lineas       jsonb,
  p_responsables uuid[] default null,
  p_notas        text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act  public.actividades := public._actividad_para_editar(p_actividad_id);
  v_ctx  jsonb;
  v_lote public.lotes;
begin
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));
  v_ctx := public._empezar_edicion(v_act.id, 'consumo', array[p_lote_id]);
  v_lote := public._lote_para_editar(v_act, p_lote_id, p_fecha);
  perform public._actualizar_actividad(v_act, p_fecha, v_lote.id, p_notas, p_responsables);
  perform public._cargar_consumo(v_act.id, v_lote, p_fecha, p_lineas, false);
  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'consumo');
  return v_act.id;
end;
$$;

revoke execute on function public.registrar_consumo(uuid, uuid, date, jsonb, uuid[], text)  from public, anon;
revoke execute on function public.editar_consumo(uuid, uuid, date, jsonb, uuid[], text)     from public, anon;
grant  execute on function public.registrar_consumo(uuid, uuid, date, jsonb, uuid[], text)  to authenticated;
grant  execute on function public.editar_consumo(uuid, uuid, date, jsonb, uuid[], text)     to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. tablero_stock: el motivo "Consumo"
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.tablero_stock(
  p_establecimiento_id uuid,
  p_medida     text,
  p_abrir_por  text,
  p_tiempo     text,
  p_desde      date,
  p_hasta      date,
  p_filtros    jsonb default '{}',
  p_opciones   jsonb default '{}'
) returns table (periodo text, clave text, etiqueta text, valor numeric, numerador numeric, denominador numeric, avisos jsonb)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_esp uuid[];
  v_cat uuid[];
  v_lot uuid[];
begin
  if p_establecimiento_id is null or not public.es_miembro(p_establecimiento_id) then
    raise exception 'Sin acceso a este establecimiento' using errcode = '42501';
  end if;
  if p_medida is null or p_medida not in ('stock', 'movimientos', 'mortandad_pct') then
    raise exception 'Medida de stock desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('total', 'mes', 'ejercicio')
     or (p_medida = 'mortandad_pct' and p_tiempo = 'mes') then
    raise exception 'Tiempo inválido para %: %', p_medida, p_tiempo using errcode = '22023';
  end if;
  if p_abrir_por is not null and (p_abrir_por not in ('especie', 'categoria', 'lote', 'motivo')
                                  or (p_abrir_por = 'motivo' and p_medida <> 'movimientos')) then
    raise exception 'No se puede abrir % por %', p_medida, p_abrir_por using errcode = '22023';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 7320 then
    raise exception 'Período inválido (desde hasta hasta, 20 años como mucho)' using errcode = '22023';
  end if;
  -- Filtros: cada uno es una lista de ids (sin la clave, null o vacía: sin filtro)
  if p_filtros is not null and jsonb_typeof(p_filtros) <> 'object' then
    raise exception 'Los filtros tienen que ser un objeto' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(coalesce(p_filtros, '{}'::jsonb)) f
             where f.key in ('especie_ids', 'categoria_ids', 'lote_ids') and jsonb_typeof(f.value) not in ('array', 'null')) then
    raise exception 'Cada filtro tiene que ser una lista de ids' using errcode = '22023';
  end if;
  begin
    v_esp := case when jsonb_typeof(p_filtros -> 'especie_ids') = 'array' and jsonb_array_length(p_filtros -> 'especie_ids') > 0
                  then array(select x::uuid from jsonb_array_elements_text(p_filtros -> 'especie_ids') x) end;
    v_cat := case when jsonb_typeof(p_filtros -> 'categoria_ids') = 'array' and jsonb_array_length(p_filtros -> 'categoria_ids') > 0
                  then array(select x::uuid from jsonb_array_elements_text(p_filtros -> 'categoria_ids') x) end;
    v_lot := case when jsonb_typeof(p_filtros -> 'lote_ids') = 'array' and jsonb_array_length(p_filtros -> 'lote_ids') > 0
                  then array(select x::uuid from jsonb_array_elements_text(p_filtros -> 'lote_ids') x) end;
  exception when invalid_text_representation then
    raise exception 'Hay ids inválidos en los filtros' using errcode = '22023';
  end;

  return query
  with
  -- Períodos: 'total' (uno), 'mes' (meses calendario) o 'ejercicio' (julio a junio), recortados a desde y hasta
  per as (
    select null::text as periodo, p_desde as inicio, p_hasta as fin
    where p_tiempo = 'total'
    union all
    select to_char(m, 'YYYY-MM'), greatest(m::date, p_desde), least((m + interval '1 month' - interval '1 day')::date, p_hasta)
    from generate_series(date_trunc('month', p_desde::timestamp), p_hasta::timestamp, interval '1 month') m
    where p_tiempo = 'mes'
    union all
    select e || '/' || right((e + 1)::text, 2), greatest(make_date(e, 7, 1), p_desde), least(make_date(e + 1, 6, 30), p_hasta)
    from generate_series(extract(year from p_desde)::int - case when extract(month from p_desde) < 7 then 1 else 0 end,
                         extract(year from p_hasta)::int - case when extract(month from p_hasta) < 7 then 1 else 0 end) e
    where p_tiempo = 'ejercicio'
  ),
  ev as (
    select e.fecha, e.cabezas, e.tipo,
           case p_abrir_por
             when 'especie'   then e.especie_id::text
             when 'categoria' then e.categoria_id::text
             when 'lote'      then e.lote_id::text
             when 'motivo'    then e.tipo || case when e.cabezas > 0 then '+' else '-' end
           end as clave
    from public.lote_eventos e
    where e.establecimiento_id = p_establecimiento_id
      and e.fecha <= p_hasta
      and (v_esp is null or e.especie_id   = any (v_esp))
      and (v_cat is null or e.categoria_id = any (v_cat))
      and (v_lot is null or e.lote_id      = any (v_lot))
  ),
  datos as (
    select p.periodo, p.inicio, ev.clave,
           case p_medida
             when 'stock'       then coalesce(sum(ev.cabezas), 0)
             when 'movimientos' then coalesce(sum(ev.cabezas) filter (where ev.fecha >= p.inicio), 0)
           end::numeric as valor,
           case when p_medida = 'mortandad_pct'
                then coalesce(-sum(ev.cabezas) filter (where ev.tipo = 'mortandad' and ev.fecha >= p.inicio), 0) end::numeric as num,
           case when p_medida = 'mortandad_pct'
                then coalesce(sum(ev.cabezas) filter (where ev.fecha < p.inicio), 0)
                   + coalesce(sum(ev.cabezas) filter (where ev.tipo in ('paricion', 'compra') and ev.fecha >= p.inicio), 0) end::numeric as den,
           count(ev.fecha) filter (where p_medida = 'stock' or ev.fecha >= p.inicio) as eventos
    from per p
    left join ev on ev.fecha <= p.fin
    group by p.periodo, p.inicio, ev.clave
  )
  select d.periodo, d.clave,
         case p_abrir_por
           when 'especie'   then (select s.nombre from public.especies s where s.id = d.clave::uuid)
           when 'categoria' then (select c.nombre from public.categorias_animales c where c.id = d.clave::uuid)
           when 'lote'      then (select l.nombre from public.lotes l where l.id = d.clave::uuid)
           when 'motivo'    then
             case left(d.clave, -1)
               when 'alta_inicial' then 'Alta inicial' when 'paricion' then 'Parición' when 'compra' then 'Compra'
               when 'venta' then 'Venta' when 'mortandad' then 'Mortandad' when 'recategorizacion' then 'Recategorización'
               when 'division' then 'División' when 'union' then 'Unión' when 'ajuste' then 'Ajuste'
               when 'destete' then 'Destete' when 'consumo' then 'Consumo' else left(d.clave, -1)
             end || case when right(d.clave, 1) = '+' then ' (entran)' else ' (salen)' end
         end,
         case when p_medida = 'mortandad_pct' then round(100 * d.num / nullif(d.den, 0), 2) else d.valor end,
         d.num, d.den, null::jsonb
  from datos d
  where p_abrir_por is null
     or (d.clave is not null and d.eventos > 0
         and not (p_medida = 'stock' and d.valor = 0)
         and not (p_medida = 'movimientos' and d.valor = 0 and p_abrir_por <> 'motivo'))
  order by d.inicio, 4 desc nulls last, 3;
end;
$$;

revoke execute on function public.tablero_stock(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_stock(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

commit;
