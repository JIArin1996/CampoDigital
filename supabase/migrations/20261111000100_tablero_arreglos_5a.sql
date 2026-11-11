-- Campo Digital v2 — Tablero de Indicadores, etapa 5a: arreglos de lo hecho (diseño: contexto/DISENO-INDICADORES-TABLERO.md,
-- secciones 4 y 9; decisiones del 9/11/2026). Después de 20261110000300.
--
--   1. tablero_pesadas (misma firma): un tramo entre pesadas también se descarta por
--      * la parición de las madres pesadas (motivo paricion_madres), aunque las crías no se pesen;
--      * la esquila de los lotes (motivo esquila);
--      * el consumo (motivo consumo, para cuando exista la actividad);
--      * un evento el mismo día que una de las dos pesadas, salvo que las cabezas de la pesada digan que se pesó del
--        otro lado del evento (las de después en la pesada del inicio, las de antes en la del final).
--   2. tablero_potreros (misma firma): la carga global y la superficie efectiva sin abrir cuentan solo los potreros
--      de pastoreo (uso Ganadería o sin uso), y la carga global avisa las UG sin potrero asignado (ug_sin_potrero).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tramos de pesadas
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.tablero_pesadas(
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
           array_agg(distinct li.categoria_id) as cats,
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
           case when m.fecha is not null then array[f.lote_id] else array[f.lote_id] || an.lotes end as lotes,
           f.cats || coalesce(m.cats, an.cats) as cats
    from pes f
    -- La anterior del mismo lote
    left join lateral (
      select p.fecha, p.peso / p.cab as prom, p.cats
      from pes p
      where p.lote_id = f.lote_id and p.cat is not distinct from f.cat
        and (p.fecha < f.fecha or (p.fecha = f.fecha and p.created_at < f.created_at))
      order by p.fecha desc, p.created_at desc
      limit 1
    ) m on true
    -- Si no tiene: la última de cada lote de origen directo (división o unión), ponderada por cabezas
    left join lateral (
      select min(u.fecha) as fecha, sum(u.peso) / nullif(sum(u.cab), 0) as prom, array_agg(u.lote_id) as lotes,
             array(select distinct c from unnest(array_agg(u.cats_texto)) t, unnest(string_to_array(t, ',')) c)::uuid[] as cats
      from (
        select distinct on (p.lote_id) p.lote_id, p.fecha, p.peso, p.cab, array_to_string(p.cats, ',') as cats_texto
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
  -- Motivo de descarte: corto, o el primer evento que cambia quién está en las categorías pesadas entre las dos
  -- pesadas (en el lote o en sus orígenes)
  tr2 as (
    select t.*, t.fin - t.inicio as dias,
           case when t.fin - t.inicio < v_min then 'corto'
                else (select ev.tipo from (
                        -- Eventos que cambian las cabezas de las categorías pesadas (también los del día de una de
                        -- las dos pesadas: ver "adentro" abajo)
                        select e.fecha, e.tipo, e.lote_id, true as cambia
                        from public.lote_eventos e
                        where e.lote_id = any (t.lotes)
                          and e.categoria_id = any (t.cats)
                          and (e.tipo in ('division', 'union', 'compra', 'venta', 'destete', 'paricion', 'ajuste', 'consumo')
                               or (v_por_cat and e.tipo = 'recategorizacion'))
                          and e.fecha between t.inicio and t.fin
                        union all
                        -- La parición corta el tramo de las madres (las categorías pesadas que no son crías al pie)
                        select a.fecha, 'paricion_madres', a.lote_id, false
                        from public.actividades a
                        where a.tipo = 'paricion' and a.anulada_en is null
                          and a.lote_id = any (t.lotes)
                          and a.fecha > t.inicio and a.fecha < t.fin
                          and exists (select 1 from public.categorias_animales c where c.id = any (t.cats) and not c.cria_al_pie)
                        union all
                        -- La esquila corta el tramo de los lotes esquilados (no dice qué categorías: todas)
                        select a.fecha, 'esquila', al.lote_id, false
                        from public.actividades a
                        join public.actividad_lotes al on al.actividad_id = a.id
                        where a.tipo = 'esquila' and a.anulada_en is null
                          and al.lote_id = any (t.lotes)
                          and a.fecha > t.inicio and a.fecha < t.fin
                      ) ev
                      -- Un evento el día de una pesada: se comparan las cabezas de la pesada de ese lote ese día con
                      -- el stock de sus categorías antes (fecha < día) y después (fecha <= día) del evento. Si no
                      -- cambian, no corta. En el día del inicio queda adentro salvo que la pesada tenga las cabezas
                      -- de después (se pesó después del evento); en el del final, salvo que tenga las de antes. Sin
                      -- pesada de ese lote ese día, queda adentro.
                      left join lateral (
                        select x.cab, x.antes, x.despues
                        from (
                          select pp.cab,
                                 (select coalesce(sum(e2.cabezas), 0) from public.lote_eventos e2
                                  where e2.lote_id = ev.lote_id and e2.categoria_id = any (pp.cats) and e2.fecha < ev.fecha) as antes,
                                 (select coalesce(sum(e2.cabezas), 0) from public.lote_eventos e2
                                  where e2.lote_id = ev.lote_id and e2.categoria_id = any (pp.cats) and e2.fecha <= ev.fecha) as despues
                          from pes pp
                          where pp.lote_id = ev.lote_id and pp.fecha = ev.fecha and pp.cat is not distinct from t.cat
                          order by pp.created_at desc
                          limit 1
                        ) x
                      ) dia on ev.cambia and ev.fecha in (t.inicio, t.fin)
                      where (ev.fecha > t.inicio and ev.fecha < t.fin)
                         or (ev.fecha = t.inicio and (dia.cab is null or (dia.antes <> dia.despues and dia.cab <> dia.despues)))
                         or (ev.fecha = t.fin    and (dia.cab is null or (dia.antes <> dia.despues and dia.cab <> dia.antes)))
                      order by ev.fecha, ev.tipo limit 1)
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

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Carga y superficie: solo potreros de pastoreo; UG sin potrero
-- ════════════════════════════════════════════════════════════════════════════

-- Medidas:
--   'carga'     UG / ha efectiva al cierre de cada período: sin abrir, la global (UG de todos los animales / área
--               efectiva de los potreros activos de pastoreo); por potrero, las UG de los lotes que están en él / su
--               área efectiva
--   'superficie_efectiva' ha efectivas (sin las zonas no aprovechables): sin abrir, la de los potreros activos de
--               pastoreo (Ha SPG); por potrero, la de cada uno
-- Pastoreo: uso Ganadería o sin uso cargado (no cuentan Forestación, Reserva ni Sin uso).
--   'ug'        UG al cierre (todos los animales, o por potrero)
--   'superficie' ha (de los potreros activos, o de cada uno); 'dias_ocupacion' y 'dias_descanso' (días del período
--               con y sin animales; por potrero)
-- Tiempo: carga, ug y superficie 'total' o 'mes' (al cierre); los días, 'total', 'mes' o 'ejercicio'. Filtros:
-- especie_ids, categoria_ids y lote_ids (para las UG). Avisos: potreros_sin_dibujar (activos de pastoreo sin
-- superficie), categorias_sin_ug (nombres de las categorías con animales que no suman) y, en la carga global,
-- ug_sin_potrero (UG de los lotes sin potrero al cierre; con varios períodos, el mayor).
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
    select p.id, p.nombre, p.superficie, p.superficie_efectiva,
           coalesce(p.uso_actual, 'Ganadería') = 'Ganadería' as pastoreo
    from public.potreros p
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
             when 'superficie_efectiva' then (select sum(pt.superficie_efectiva) from pot pt where pt.pastoreo)
             when 'carga'      then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo)
                                    / nullif((select sum(pt.superficie_efectiva) from pot pt where pt.pastoreo), 0)
           end as valor,
           case when p_medida = 'carga' then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo) end as num,
           case when p_medida = 'carga' then (select sum(pt.superficie_efectiva) from pot pt where pt.pastoreo) end as den,
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
             'potreros_sin_dibujar', nullif((select count(*) from pot where superficie is null and pastoreo), 0),
             'categorias_sin_ug', (select jsonb_agg(distinct d.categoria) from donde d where d.ug is null),
             'ug_sin_potrero', case when p_medida = 'carga' and p_abrir_por is null then
               nullif((select max(x.ug) from (select round(sum(d.cabezas * d.ug), 2) as ug from donde d
                                             where d.potrero_id is null group by d.periodo) x), 0) end)), '{}'::jsonb) as avisos
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
