-- Campo Digital v2 — Tablero de Indicadores: la carga sobre el área efectiva (después de 20261110000100_area_efectiva)
--
-- tablero_potreros (misma firma): la carga global y por potrero se calcula sobre el área efectiva (la superficie menos
-- las zonas no aprovechables), y se suma la medida 'superficie_efectiva'. Diseño: contexto/DISENO-AREA-EFECTIVA.md
-- (etapa D3) y contexto/DISENO-INDICADORES-TABLERO.md (carga).

begin;

-- Medidas:
--   'carga'     UG / ha efectiva al cierre de cada período: sin abrir, la global (UG de todos los animales / área
--               efectiva de los potreros activos); por potrero, las UG de los lotes que están en él / su área efectiva
--   'superficie_efectiva' ha efectivas (sin las zonas no aprovechables), de los potreros activos o de cada uno
--   'ug'        UG al cierre (todos los animales, o por potrero)
--   'superficie' ha (de los potreros activos, o de cada uno); 'dias_ocupacion' y 'dias_descanso' (días del período
--               con y sin animales; por potrero)
-- Tiempo: carga, ug y superficie 'total' o 'mes' (al cierre); los días, 'total', 'mes' o 'ejercicio'. Filtros:
-- especie_ids, categoria_ids y lote_ids (para las UG). Avisos: potreros_sin_dibujar (activos sin superficie) y
-- categorias_sin_ug (nombres de las categorías con animales que no suman).
create or replace function public.tablero_potreros(
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
  if p_medida is null or p_medida not in ('carga', 'ug', 'superficie', 'superficie_efectiva', 'dias_ocupacion', 'dias_descanso') then
    raise exception 'Medida de potreros desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('total', 'mes', 'ejercicio')
     or (p_medida in ('carga', 'ug', 'superficie', 'superficie_efectiva') and p_tiempo = 'ejercicio') then
    raise exception 'Tiempo inválido para %: %', p_medida, p_tiempo using errcode = '22023';
  end if;
  if (p_abrir_por is not null and p_abrir_por <> 'potrero')
     or (p_medida in ('dias_ocupacion', 'dias_descanso') and p_abrir_por is null) then
    raise exception 'No se puede abrir % por %', p_medida, coalesce(p_abrir_por, 'nada') using errcode = '22023';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 7320 then
    raise exception 'Período inválido (desde hasta hasta, 20 años como mucho)' using errcode = '22023';
  end if;
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
  pot as (
    select p.id, p.nombre, p.superficie, p.superficie_efectiva from public.potreros p
    where p.establecimiento_id = p_establecimiento_id and p.estado = 'activo'
  ),
  -- Stock al cierre de cada período, por lote y categoría (con los filtros), con su UG
  stock as (
    select p.periodo, p.fin, e.lote_id, e.categoria_id, sum(e.cabezas) as cabezas, c.ug, c.nombre as categoria
    from per p
    join public.lote_eventos e on e.establecimiento_id = p_establecimiento_id and e.fecha <= p.fin
    join public.categorias_animales c on c.id = e.categoria_id
    where p_medida in ('carga', 'ug')
      and (v_esp is null or e.especie_id   = any (v_esp))
      and (v_cat is null or e.categoria_id = any (v_cat))
      and (v_lot is null or e.lote_id      = any (v_lot))
    group by p.periodo, p.fin, e.lote_id, e.categoria_id, c.ug, c.nombre
    having sum(e.cabezas) <> 0
  ),
  -- En qué potrero estaba cada lote al cierre de cada período
  donde as (
    select s.*, (select es.potrero_id from public.lote_estadias es
                 where es.lote_id = s.lote_id and es.anulada_en is null
                   and es.fecha_ingreso <= s.fin and (es.fecha_salida is null or es.fecha_salida > s.fin)
                 order by es.fecha_ingreso desc limit 1) as potrero_id
    from stock s
  ),
  -- Días con animales de cada potrero en cada período (estadías [ingreso, salida) recortadas al período)
  ocupacion as (
    select p.periodo, pt.id as potrero_id,
           coalesce((select sum(upper(r) - lower(r)) from unnest((
             select range_agg(daterange(greatest(es.fecha_ingreso, p.inicio), least(coalesce(es.fecha_salida, p.fin + 1), p.fin + 1), '[)'))
             from public.lote_estadias es
             where es.potrero_id = pt.id and es.anulada_en is null
               and es.fecha_ingreso <= p.fin and (es.fecha_salida is null or es.fecha_salida > p.inicio)
           )) r), 0) as dias,
           p.fin - p.inicio + 1 as dias_periodo
    from per p cross join pot pt
    where p_medida in ('dias_ocupacion', 'dias_descanso')
  ),
  datos as (
    -- Global (sin abrir)
    select p.periodo, p.inicio as pini, null::text as grupo,
           case p_medida
             when 'ug'         then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo)
             when 'superficie' then (select sum(pt.superficie) from pot pt)
             when 'superficie_efectiva' then (select sum(pt.superficie_efectiva) from pot pt)
             when 'carga'      then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo)
                                    / nullif((select sum(pt.superficie_efectiva) from pot pt), 0)
           end as valor,
           case when p_medida = 'carga' then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo) end as num,
           case when p_medida = 'carga' then (select sum(pt.superficie_efectiva) from pot pt) end as den,
           1 as n
    from per p
    where p_abrir_por is null
    union all
    -- Por potrero
    select p.periodo, p.inicio, pt.id::text,
           case p_medida
             when 'ug'             then coalesce((select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo and d.potrero_id = pt.id), 0)
             when 'superficie'     then pt.superficie
             when 'superficie_efectiva' then pt.superficie_efectiva
             when 'carga'          then coalesce((select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo and d.potrero_id = pt.id), 0)
                                        / nullif(pt.superficie_efectiva, 0)
             when 'dias_ocupacion' then (select o.dias from ocupacion o where o.periodo is not distinct from p.periodo and o.potrero_id = pt.id)
             when 'dias_descanso'  then (select o.dias_periodo - o.dias from ocupacion o where o.periodo is not distinct from p.periodo and o.potrero_id = pt.id)
           end,
           case when p_medida = 'carga' then coalesce((select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo and d.potrero_id = pt.id), 0) end,
           case when p_medida = 'carga' then pt.superficie_efectiva end,
           1
    from per p cross join pot pt
    where p_abrir_por = 'potrero'
  ),
  aviso as (
    select nullif(jsonb_strip_nulls(jsonb_build_object(
             'potreros_sin_dibujar', nullif((select count(*) from pot where superficie is null), 0),
             'categorias_sin_ug', (select jsonb_agg(distinct d.categoria) from donde d where d.ug is null))), '{}'::jsonb) as avisos
  )
  select d.periodo, d.grupo,
         case when d.grupo is not null then (select pt.nombre from pot pt where pt.id = d.grupo::uuid) end,
         case when p_medida = 'carga' then round(d.valor, 3) else round(d.valor, 2) end,
         round(d.num, 2), d.den, a.avisos
  from datos d cross join aviso a
  order by d.pini, 4 desc nulls last, 3;
end;
$$;

revoke execute on function public.tablero_potreros(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_potreros(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

commit;
