-- Campo Digital v2 — Tablero de Indicadores, etapa 2: producción y pesos (diseño: contexto/DISENO-INDICADORES-TABLERO.md)
--
-- tablero_pesadas: peso promedio, ganancia diaria y kg producidos, con la misma forma que tablero_stock (con los
-- permisos de quien consulta). Reglas de los tramos entre pesadas (sección 4 del diseño):
--   * Se compara el peso promedio del lote (Σ peso / Σ cabezas de las líneas pesadas) entre una pesada y la anterior
--     de su línea: la del mismo lote o, si no tiene, la última de cada lote de origen directo (división o unión;
--     varias: promedio ponderado por cabezas).
--   * El tramo se descarta si entre las dos pesadas hubo una división, unión, compra o venta en el lote o en sus
--     orígenes (salvo en el día de una de las dos pesadas), o si dura menos de min_dias (por defecto 21).
--   * Recategorización y mortandad no cortan el tramo. Kg producidos: (prom. final − prom. inicial) × cabezas de la
--     pesada final. Ganancia diaria de varios tramos: Σ kg / Σ (cabezas × días).
--   * Con filtro o apertura por categoría se comparan solo las líneas de esa categoría.
--   * El tramo cuenta en el período de su pesada final. avisos.tramos_descartados: cuántos y por qué.

begin;

create function public.tablero_pesadas(
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
  v_esp     uuid[];
  v_cat     uuid[];
  v_lot     uuid[];
  v_min     int;
  v_por_cat boolean;
begin
  if p_establecimiento_id is null or not public.es_miembro(p_establecimiento_id) then
    raise exception 'Sin acceso a este establecimiento' using errcode = '42501';
  end if;
  if p_medida is null or p_medida not in ('peso_promedio', 'ganancia_diaria', 'kg_producidos') then
    raise exception 'Medida de pesadas desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('total', 'mes', 'ejercicio') then
    raise exception 'Tiempo inválido para pesadas: %', p_tiempo using errcode = '22023';
  end if;
  if p_abrir_por is not null and p_abrir_por not in ('especie', 'categoria', 'lote') then
    raise exception 'No se puede abrir pesadas por %', p_abrir_por using errcode = '22023';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 7320 then
    raise exception 'Período inválido (desde hasta hasta, 20 años como mucho)' using errcode = '22023';
  end if;
  begin
    v_min := coalesce((p_opciones ->> 'min_dias')::int, 21);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'min_dias tiene que ser un número de días' using errcode = '22023';
  end;
  if v_min < 1 or v_min > 365 then
    raise exception 'min_dias tiene que estar entre 1 y 365' using errcode = '22023';
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
  v_por_cat := p_abrir_por = 'categoria' or v_cat is not null;

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
  -- Pesadas: una fila por pesada (o por pesada y categoría), con las líneas que tienen peso
  pes as (
    select a.id, a.lote_id, l.especie_id, a.fecha, a.created_at,
           case when v_por_cat then li.categoria_id end as cat,
           sum(li.cabezas)::numeric as cab, sum(li.peso_vivo_total_kg)::numeric as peso
    from public.actividades a
    join public.lotes l on l.id = a.lote_id
    join public.actividad_lineas li on li.actividad_id = a.id and li.peso_vivo_total_kg is not null
    where a.establecimiento_id = p_establecimiento_id
      and a.tipo = 'pesada' and a.anulada_en is null
      and a.fecha <= p_hasta
      and (v_esp is null or l.especie_id = any (v_esp))
      and (v_cat is null or li.categoria_id = any (v_cat))
    group by a.id, a.lote_id, l.especie_id, a.fecha, a.created_at, case when v_por_cat then li.categoria_id end
  ),
  -- Tramos: cada pesada con la anterior de su línea
  tr as (
    select f.id, f.lote_id, f.especie_id, f.cat, f.fecha as fin, f.cab as cab_fin, f.peso / f.cab as prom_fin,
           coalesce(m.fecha, an.fecha) as inicio,
           coalesce(m.prom, an.prom) as prom_ini,
           case when m.fecha is not null then array[f.lote_id] else array[f.lote_id] || an.lotes end as lotes
    from pes f
    -- La anterior del mismo lote
    left join lateral (
      select p.fecha, p.peso / p.cab as prom
      from pes p
      where p.lote_id = f.lote_id and p.cat is not distinct from f.cat
        and (p.fecha < f.fecha or (p.fecha = f.fecha and p.created_at < f.created_at))
      order by p.fecha desc, p.created_at desc
      limit 1
    ) m on true
    -- Si no tiene: la última de cada lote de origen directo (división o unión), ponderada por cabezas
    left join lateral (
      select min(u.fecha) as fecha, sum(u.peso) / nullif(sum(u.cab), 0) as prom, array_agg(u.lote_id) as lotes
      from (
        select distinct on (p.lote_id) p.lote_id, p.fecha, p.peso, p.cab
        from pes p
        where p.lote_id in (select la.lote_id from public.linaje_lote(f.lote_id) la where la.relacion = 'ancestro' and la.nivel = 1)
          and p.cat is not distinct from f.cat
          and p.fecha <= f.fecha
        order by p.lote_id, p.fecha desc, p.created_at desc
      ) u
      having count(*) > 0
    ) an on m.fecha is null
    where f.cab > 0 and coalesce(m.fecha, an.fecha) is not null
  ),
  -- Motivo de descarte: corto, o el primer evento que cambia la composición entre las dos pesadas
  tr2 as (
    select t.*, t.fin - t.inicio as dias,
           case when t.fin - t.inicio < v_min then 'corto'
                else (select e.tipo from public.lote_eventos e
                      where e.lote_id = any (t.lotes) and e.tipo in ('division', 'union', 'compra', 'venta')
                        and e.fecha > t.inicio and e.fecha < t.fin
                      order by e.fecha, e.tipo limit 1)
           end as descarte,
           case p_abrir_por when 'especie' then t.especie_id::text when 'categoria' then t.cat::text when 'lote' then t.lote_id::text end as grupo
    from tr t
    where t.fin between p_desde and p_hasta
      and (v_lot is null or t.lote_id = any (v_lot))
  ),
  aviso as (
    select case when count(*) filter (where d.descarte is not null) > 0
                then jsonb_build_object('tramos_descartados', jsonb_object_agg(d.descarte, d.n) filter (where d.descarte is not null))
           end as avisos
    from (select descarte, count(*) as n from tr2 group by descarte) d
  ),
  datos_tr as (
    select p.periodo, p.inicio as pini, v.grupo,
           sum((v.prom_fin - v.prom_ini) * v.cab_fin) as kg,
           sum(v.cab_fin * v.dias) as cabdias,
           count(v.fin) as n
    from per p
    left join (select * from tr2 where descarte is null) v on v.fin between p.inicio and p.fin
    group by p.periodo, p.inicio, v.grupo
  ),
  -- Peso promedio: la última pesada (en el período) de cada lote abierto al cierre del período
  datos_peso as (
    select p.periodo, p.inicio as pini, x.grupo, sum(x.peso) as peso, sum(x.cab) as cab, count(x.fecha) as n
    from per p
    left join lateral (
      select distinct on (f.lote_id, f.cat) f.fecha, f.peso, f.cab,
             case p_abrir_por when 'especie' then f.especie_id::text when 'categoria' then f.cat::text when 'lote' then f.lote_id::text end as grupo
      from pes f
      join public.lotes l on l.id = f.lote_id
      where f.fecha between p.inicio and p.fin
        and l.fecha_apertura <= p.fin and (l.fecha_cierre is null or l.fecha_cierre > p.fin)
        and (v_lot is null or f.lote_id = any (v_lot))
      order by f.lote_id, f.cat, f.fecha desc, f.created_at desc
    ) x on true
    group by p.periodo, p.inicio, x.grupo
  ),
  d as (
    select t.periodo, t.pini, t.grupo,
           case p_medida when 'kg_producidos' then round(coalesce(t.kg, 0), 1)
                         else round(t.kg / nullif(t.cabdias, 0), 3) end as valor,
           case when p_medida = 'ganancia_diaria' then round(t.kg, 1) end as num,
           case when p_medida = 'ganancia_diaria' then t.cabdias end as den,
           t.n
    from datos_tr t
    where p_medida <> 'peso_promedio'
    union all
    select w.periodo, w.pini, w.grupo, round(w.peso / nullif(w.cab, 0), 1), round(w.peso, 1), w.cab, w.n
    from datos_peso w
    where p_medida = 'peso_promedio'
  )
  select d.periodo, d.grupo,
         case p_abrir_por
           when 'especie'   then (select s.nombre from public.especies s where s.id = d.grupo::uuid)
           when 'categoria' then (select c.nombre from public.categorias_animales c where c.id = d.grupo::uuid)
           when 'lote'      then (select l.nombre from public.lotes l where l.id = d.grupo::uuid)
         end,
         d.valor, d.num, d.den, a.avisos
  from d cross join aviso a
  where p_abrir_por is null or (d.grupo is not null and d.n > 0)
  order by d.pini, 4 desc nulls last, 3;
end;
$$;

revoke execute on function public.tablero_pesadas(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_pesadas(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

commit;
