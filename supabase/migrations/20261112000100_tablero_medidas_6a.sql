-- Campo Digital v2 — Tablero de Indicadores, etapa 6a: medidas nuevas de stock y reproductivos
-- (diseño: contexto/DISENO-INDICADORES-TABLERO.md, sección 4 "Medidas nuevas" y sección 10). Después de 20261111000300.
--
--   1. v_indicadores_aportes (mismas columnas y filas, más cuatro al final): servicio_id (el servicio al que suma
--      cada aporte), categoria_entore (la del lote servido el día del servicio: el id de su única categoría con rol,
--      'mixto' con más de una, null sin ninguna), kg_destetados (el peso de lo que salió de cada origen del destete)
--      y destetadas_con_peso.
--   2. tablero_stock (misma firma): UG al cierre, stock y UG promedio (ponderados por días), % de extracción
--      (ventas y consumo / stock al inicio), % de vacas de cría y relación lanar/vacuno (en cabezas y en UG).
--   3. tablero_reproductivos (misma firma): % de pérdidas preñez → destete, % de reposición, kg destetados, kg
--      destetados por vaca entorada y peso promedio al destete; abrir y filtrar por categoría de entore.
-- Funciones: ninguna nueva (la auditoría de permisos sigue en 164).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Aportes reproductivos: servicio, categoría de entore y kg destetados
-- ════════════════════════════════════════════════════════════════════════════

create or replace view public.v_indicadores_aportes
with (security_invoker = true) as
with
servicios as (
  select a.id, a.establecimiento_id, a.lote_id, a.fecha, l.especie_id, s.vacas_entoradas,
         (extract(year from a.fecha)::int - case when extract(month from a.fecha) < 7 then 1 else 0 end) as temporada,
         row_number() over (
           partition by a.lote_id, (extract(year from a.fecha)::int - case when extract(month from a.fecha) < 7 then 1 else 0 end)
           order by s.vacas_entoradas desc, a.fecha, a.created_at
         ) = 1 as cuenta,
         (select case count(*) when 0 then null when 1 then min(x.categoria_id::text) else 'mixto' end
          from (select e.categoria_id from public.lote_eventos e
                join public.categorias_animales c on c.id = e.categoria_id and c.rol is not null
                where e.lote_id = a.lote_id and e.fecha <= a.fecha
                group by e.categoria_id having sum(e.cabezas) > 0) x) as categoria_entore
  from public.actividades a
  join public.act_servicio s on s.actividad_id = a.id
  join public.lotes l on l.id = a.lote_id
  where a.tipo = 'servicio' and a.anulada_en is null
),
diagnosticos as (
  select a.id, a.establecimiento_id, a.lote_id, a.fecha, a.created_at, l.especie_id,
         d.vacas_diagnosticadas, d.vacas_prenadas, sv.temporada, sv.id as servicio_id
  from public.actividades a
  join public.act_diagnostico d on d.actividad_id = a.id
  join public.lotes l on l.id = a.lote_id
  left join lateral (
    select x.temporada, x.id from servicios x
    where x.fecha <= a.fecha and x.fecha > a.fecha - 450
      and (x.lote_id = a.lote_id
           or x.lote_id in (select la.lote_id from public.linaje_lote(a.lote_id) la where la.relacion = 'ancestro'))
    order by x.fecha desc, x.vacas_entoradas desc
    limit 1
  ) sv on true
  where a.tipo = 'diagnostico_gestacion' and a.anulada_en is null
),
pariciones as (
  select a.id, a.establecimiento_id, a.lote_id, a.fecha, l.especie_id, p.lote_cria_id, p.nacidos_muertos,
         coalesce((select sum(li.cabezas) from public.actividad_lineas li where li.actividad_id = a.id), 0)::int as vivas,
         sv.temporada, sv.id as servicio_id
  from public.actividades a
  join public.act_paricion p on p.actividad_id = a.id
  join public.lotes l on l.id = a.lote_id
  left join lateral (
    select x.temporada, x.id from servicios x
    where x.fecha <= a.fecha and x.fecha > a.fecha - 450
      and (x.lote_id = a.lote_id
           or x.lote_id in (select la.lote_id from public.linaje_lote(a.lote_id) la where la.relacion = 'ancestro'))
    order by x.fecha desc, x.vacas_entoradas desc
    limit 1
  ) sv on true
  where a.tipo = 'paricion' and a.anulada_en is null
),
destetes as (
  select a.id, a.establecimiento_id, al.lote_id, a.fecha, l.especie_id,
         coalesce((select -sum(e.cabezas) from public.lote_eventos e
                   where e.actividad_id = a.id and e.lote_id = al.lote_id and e.cabezas < 0), 0)::int as destetadas,
         t.temporada, coalesce(t.mixto, false) as mixto, t.servicio_id, al.peso_vivo_total_kg
  from public.actividades a
  join public.actividad_lotes al on al.actividad_id = a.id and al.rol = 'origen'
  join public.lotes l on l.id = al.lote_id
  left join lateral (
    select (array_agg(pp.temporada order by pp.fecha))[1] as temporada,
           (array_agg(pp.servicio_id order by pp.fecha))[1] as servicio_id,
           count(distinct coalesce(pp.temporada, -1)) > 1 as mixto
    from pariciones pp
    where (pp.lote_cria_id = al.lote_id
           or (pp.fecha <= l.fecha_apertura
               and pp.lote_cria_id in (select la.lote_id from public.linaje_lote(al.lote_id) la where la.relacion = 'ancestro')))
      and pp.fecha <= a.fecha
      and pp.fecha > coalesce((
        select max(a2.fecha) from public.actividades a2
        join public.actividad_lotes al2 on al2.actividad_id = a2.id and al2.rol = 'origen'
        where a2.tipo = 'destete' and a2.anulada_en is null and a2.fecha < a.fecha
          and (al2.lote_id = al.lote_id
               or (a2.fecha <= l.fecha_apertura
                   and al2.lote_id in (select la.lote_id from public.linaje_lote(al.lote_id) la where la.relacion = 'ancestro')))),
        '-infinity'::date)
  ) t on true
  where a.tipo = 'destete' and a.anulada_en is null
)
select s.establecimiento_id, s.especie_id, s.temporada, 'servicio'::text as tipo, s.id as actividad_id, s.fecha, s.lote_id,
       s.cuenta, s.vacas_entoradas as entoradas, 0 as diagnosticadas, 0 as prenadas,
       0 as nacidas_vivas, 0 as nacidas_muertas, 0 as destetadas, false as mixto,
       s.id as servicio_id, s.categoria_entore, null::numeric as kg_destetados, 0 as destetadas_con_peso
from servicios s
union all
select d.establecimiento_id, d.especie_id, d.temporada, 'diagnostico_gestacion', d.id, d.fecha, d.lote_id,
       row_number() over (partition by d.lote_id, d.temporada order by d.fecha desc, d.created_at desc) = 1,
       0, d.vacas_diagnosticadas, d.vacas_prenadas, 0, 0, 0, false,
       d.servicio_id, (select x.categoria_entore from servicios x where x.id = d.servicio_id), null::numeric, 0
from diagnosticos d
union all
select p.establecimiento_id, p.especie_id, p.temporada, 'paricion', p.id, p.fecha, p.lote_id,
       true, 0, 0, 0, p.vivas, p.nacidos_muertos, 0, false,
       p.servicio_id, (select x.categoria_entore from servicios x where x.id = p.servicio_id), null::numeric, 0
from pariciones p
union all
select t.establecimiento_id, t.especie_id, t.temporada, 'destete', t.id, t.fecha, t.lote_id,
       true, 0, 0, 0, 0, 0, t.destetadas, t.mixto,
       t.servicio_id, (select x.categoria_entore from servicios x where x.id = t.servicio_id),
       t.peso_vivo_total_kg, case when t.peso_vivo_total_kg is not null then t.destetadas else 0 end
from destetes t;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Stock
-- ════════════════════════════════════════════════════════════════════════════

-- Stock, desde los eventos de los lotes (como stock_al). Medidas:
--   'stock'           stock al cierre de cada período (semi-aditivo: al último día, nunca la suma de los meses)
--   'movimientos'     Σ de los eventos de cada período; abierto por 'motivo', cada tipo con su sentido
--   'mortandad_pct'   muertes del período / (stock al inicio + pariciones + compras del período), en %
--   'ug'              UG al cierre: Σ cabezas × UG de la categoría (sin UG no suma: aviso categorias_sin_ug)
--   'stock_promedio'  Σ cabezas × días / días del período (numerador: cabezas-día; denominador: días)
--   'ug_promedio'     igual, con UG (numerador: UG-día)
--   'pct_extraccion'  cabezas vendidas y faenadas para consumo en el período / stock al inicio, en %
--   'pct_vacas_cria'  stock de las categorías de cría (rol 'cria') / stock, al cierre, en %; sin abrir por especie
--                     y con más de una especie, aviso varias_especies
--   'lanar_vacuno'    stock ovino / stock vacuno al cierre (por el grupo de la especie); 'lanar_vacuno_ug', en UG.
--                     Sin abrir; el filtro de especie no aplica.
-- Un evento cuenta desde su fecha (inclusive). Tiempo: 'total', 'mes' o 'ejercicio' (mortandad y extracción: sin
-- 'mes'). Abrir por: null, 'especie', 'categoria', 'lote' o 'motivo' (solo movimientos); % de vacas de cría sin
-- categoría. Filtros: especie_ids, categoria_ids, lote_ids.
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
  v_esp    uuid[];
  v_cat    uuid[];
  v_lot    uuid[];
  v_semi   boolean;
  v_sin_ug jsonb;
  v_varias boolean;
begin
  if p_establecimiento_id is null or not public.es_miembro(p_establecimiento_id) then
    raise exception 'Sin acceso a este establecimiento' using errcode = '42501';
  end if;
  if p_medida is null or p_medida not in ('stock', 'movimientos', 'mortandad_pct', 'ug', 'stock_promedio', 'ug_promedio',
                                          'pct_extraccion', 'pct_vacas_cria', 'lanar_vacuno', 'lanar_vacuno_ug') then
    raise exception 'Medida de stock desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('total', 'mes', 'ejercicio')
     or (p_medida in ('mortandad_pct', 'pct_extraccion') and p_tiempo = 'mes') then
    raise exception 'Tiempo inválido para %: %', p_medida, p_tiempo using errcode = '22023';
  end if;
  if p_abrir_por is not null and (p_abrir_por not in ('especie', 'categoria', 'lote', 'motivo')
                                  or (p_abrir_por = 'motivo' and p_medida <> 'movimientos')
                                  or (p_abrir_por = 'categoria' and p_medida = 'pct_vacas_cria')
                                  or p_medida in ('lanar_vacuno', 'lanar_vacuno_ug')) then
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
  -- La relación lanar/vacuno compara especies: el filtro de especie no aplica
  if p_medida in ('lanar_vacuno', 'lanar_vacuno_ug') then
    v_esp := null;
  end if;
  -- Medidas que miran todo lo anterior al cierre (no solo los eventos del período)
  v_semi := p_medida not in ('movimientos', 'mortandad_pct');

  -- Categorías sin UG con animales en el período (no suman)
  if p_medida in ('ug', 'ug_promedio', 'lanar_vacuno_ug') then
    select jsonb_agg(x.nombre order by x.nombre) into v_sin_ug
    from (
      select c.nombre
      from public.lote_eventos e
      join public.categorias_animales c on c.id = e.categoria_id
      where e.establecimiento_id = p_establecimiento_id and e.fecha <= p_hasta and c.ug is null
        and (v_esp is null or e.especie_id   = any (v_esp))
        and (v_cat is null or e.categoria_id = any (v_cat))
        and (v_lot is null or e.lote_id      = any (v_lot))
      group by c.id, c.nombre
      having sum(e.cabezas) filter (where e.fecha < p_desde) <> 0 or bool_or(e.fecha >= p_desde)
    ) x;
  end if;
  -- % de vacas de cría sin abrir por especie: avisa si mezcla especies (al cierre)
  if p_medida = 'pct_vacas_cria' and p_abrir_por is distinct from 'especie' then
    select count(*) > 1 into v_varias
    from (
      select e.especie_id from public.lote_eventos e
      where e.establecimiento_id = p_establecimiento_id and e.fecha <= p_hasta
        and (v_esp is null or e.especie_id   = any (v_esp))
        and (v_lot is null or e.lote_id      = any (v_lot))
      group by e.especie_id having sum(e.cabezas) <> 0
    ) x;
  end if;

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
    select e.fecha, e.cabezas, e.tipo, coalesce(c.ug, 0) as ug, c.rol, s.grupo,
           case p_abrir_por
             when 'especie'   then e.especie_id::text
             when 'categoria' then e.categoria_id::text
             when 'lote'      then e.lote_id::text
             when 'motivo'    then e.tipo || case when e.cabezas > 0 then '+' else '-' end
           end as clave
    from public.lote_eventos e
    join public.categorias_animales c on c.id = e.categoria_id
    join public.especies s on s.id = e.especie_id
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
             when 'ug'          then coalesce(sum(ev.cabezas * ev.ug), 0)
           end::numeric as valor,
           case p_medida
             when 'mortandad_pct'   then coalesce(-sum(ev.cabezas) filter (where ev.tipo = 'mortandad' and ev.fecha >= p.inicio), 0)
             when 'pct_extraccion'  then coalesce(-sum(ev.cabezas) filter (where ev.tipo in ('venta', 'consumo') and ev.fecha >= p.inicio), 0)
             when 'pct_vacas_cria'  then coalesce(sum(ev.cabezas) filter (where ev.rol = 'cria'), 0)
             when 'stock_promedio'  then coalesce(sum(ev.cabezas * (p.fin - greatest(ev.fecha, p.inicio) + 1)), 0)
             when 'ug_promedio'     then coalesce(sum(ev.cabezas * ev.ug * (p.fin - greatest(ev.fecha, p.inicio) + 1)), 0)
             when 'lanar_vacuno'    then coalesce(sum(ev.cabezas) filter (where ev.grupo = 'ovino'), 0)
             when 'lanar_vacuno_ug' then coalesce(sum(ev.cabezas * ev.ug) filter (where ev.grupo = 'ovino'), 0)
           end::numeric as num,
           case p_medida
             when 'mortandad_pct'   then coalesce(sum(ev.cabezas) filter (where ev.fecha < p.inicio), 0)
                                       + coalesce(sum(ev.cabezas) filter (where ev.tipo in ('paricion', 'compra') and ev.fecha >= p.inicio), 0)
             when 'pct_extraccion'  then coalesce(sum(ev.cabezas) filter (where ev.fecha < p.inicio), 0)
             when 'pct_vacas_cria'  then coalesce(sum(ev.cabezas), 0)
             when 'stock_promedio'  then max(p.fin - p.inicio + 1)
             when 'ug_promedio'     then max(p.fin - p.inicio + 1)
             when 'lanar_vacuno'    then coalesce(sum(ev.cabezas) filter (where ev.grupo = 'bovino'), 0)
             when 'lanar_vacuno_ug' then coalesce(sum(ev.cabezas * ev.ug) filter (where ev.grupo = 'bovino'), 0)
           end::numeric as den,
           count(ev.fecha) filter (where v_semi or ev.fecha >= p.inicio) as eventos
    from per p
    left join ev on ev.fecha <= p.fin
    group by p.periodo, p.inicio, ev.clave
  ),
  calc as (
    select d.*,
           case
             when p_medida in ('mortandad_pct', 'pct_extraccion', 'pct_vacas_cria') then round(100 * d.num / nullif(d.den, 0), 2)
             when p_medida in ('stock_promedio', 'ug_promedio', 'lanar_vacuno', 'lanar_vacuno_ug') then round(d.num / nullif(d.den, 0), 2)
             when p_medida = 'ug' then round(d.valor, 2)
             else d.valor
           end as resultado
    from datos d
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
         d.resultado,
         d.num, d.den,
         nullif(jsonb_strip_nulls(jsonb_build_object(
           'categorias_sin_ug', v_sin_ug,
           'varias_especies',   case when v_varias then true end)), '{}'::jsonb)
  from calc d
  where p_abrir_por is null
     or (d.clave is not null and d.eventos > 0
         and not (p_medida in ('stock', 'ug', 'stock_promedio', 'ug_promedio') and coalesce(d.resultado, 0) = 0)
         and not (p_medida = 'movimientos' and d.valor = 0 and p_abrir_por <> 'motivo')
         and not (p_medida in ('pct_extraccion', 'pct_vacas_cria') and d.resultado is null))
  order by d.inicio, 4 desc nulls last, 3;
end;
$$;

revoke execute on function public.tablero_stock(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_stock(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Reproductivos
-- ════════════════════════════════════════════════════════════════════════════

-- Reproductivos, desde v_indicadores_aportes, por temporada (julio a junio, según la fecha del servicio). Entran
-- las temporadas que empiezan entre desde y hasta. Medidas (en %, con numerador y denominador):
--   'pct_prenez' preñadas / entoradas, 'pct_paricion' nacidos vivos / entoradas, 'pct_paricion_total'
--   (vivos + muertos) / entoradas, 'pct_destete' destetados / entoradas, 'pct_perdidas' (preñadas − destetados) /
--   preñadas, 'pct_reposicion' entoradas de categorías de reposición / entoradas;
--   en kg: 'kg_destetados' (Σ peso de lo destetado), 'kg_destetados_vaca' kg destetados / entoradas,
--   'peso_destete' kg destetados / destetados con peso (aviso destetados_sin_peso);
--   y los conteos 'entoradas', 'prenadas', 'nacidos_vivos', 'nacidos_muertos', 'destetados'.
-- Categoría de entore: la del lote servido el día del servicio (sus categorías con rol, cría o reposición); con más
-- de una, "Mixto". Cada diagnóstico, parición y destete va a la categoría de su servicio.
-- Tiempo: 'temporada' o 'total'. Abrir por: null, 'especie', 'categoria' (de entore) o 'lote'. Filtros: especie_ids,
-- categoria_ids (de entore) y lote_ids. Avisos: destete_mixto, sin_servicio y destetados_sin_peso.
create or replace function public.tablero_reproductivos(
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
  v_sin int;
begin
  if p_establecimiento_id is null or not public.es_miembro(p_establecimiento_id) then
    raise exception 'Sin acceso a este establecimiento' using errcode = '42501';
  end if;
  if p_medida is null or p_medida not in ('pct_prenez', 'pct_paricion', 'pct_paricion_total', 'pct_destete',
                                          'pct_perdidas', 'pct_reposicion', 'kg_destetados', 'kg_destetados_vaca',
                                          'peso_destete', 'entoradas', 'prenadas', 'nacidos_vivos', 'nacidos_muertos',
                                          'destetados') then
    raise exception 'Medida reproductiva desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('temporada', 'total') then
    raise exception 'Tiempo inválido para reproductivos: %', p_tiempo using errcode = '22023';
  end if;
  if p_abrir_por is not null and p_abrir_por not in ('especie', 'categoria', 'lote') then
    raise exception 'No se puede abrir reproductivos por %', p_abrir_por using errcode = '22023';
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

  select count(*) into v_sin
  from public.v_indicadores_aportes a
  where a.establecimiento_id = p_establecimiento_id and a.temporada is null
    and a.fecha between p_desde and p_hasta
    and (v_esp is null or a.especie_id = any (v_esp))
    and (v_lot is null or a.lote_id    = any (v_lot));

  return query
  with
  a as (
    select a.*,
           case p_abrir_por
             when 'especie'   then a.especie_id::text
             when 'lote'      then a.lote_id::text
             when 'categoria' then coalesce(a.categoria_entore, 'sin_categoria')
           end as grupo,
           case when a.categoria_entore <> 'mixto'
                then (select c.rol from public.categorias_animales c where c.id = a.categoria_entore::uuid) = 'reposicion'
           end as reposicion
    from public.v_indicadores_aportes a
    where a.establecimiento_id = p_establecimiento_id
      and a.temporada is not null
      and make_date(a.temporada, 7, 1) between p_desde and p_hasta
      and (v_esp is null or a.especie_id = any (v_esp))
      and (v_lot is null or a.lote_id    = any (v_lot))
      and (v_cat is null or case when a.categoria_entore <> 'mixto' then a.categoria_entore::uuid = any (v_cat) else false end)
  ),
  g as (
    select case when p_tiempo = 'temporada' then a.temporada end as temporada, a.grupo,
           coalesce(sum(a.entoradas)           filter (where a.cuenta), 0)::numeric as ent,
           coalesce(sum(a.entoradas)           filter (where a.cuenta and a.reposicion), 0)::numeric as ent_rep,
           coalesce(sum(a.prenadas)            filter (where a.cuenta), 0)::numeric as pre,
           coalesce(sum(a.nacidas_vivas)       filter (where a.cuenta), 0)::numeric as viv,
           coalesce(sum(a.nacidas_muertas)     filter (where a.cuenta), 0)::numeric as mue,
           coalesce(sum(a.destetadas)          filter (where a.cuenta), 0)::numeric as des,
           coalesce(sum(a.kg_destetados)       filter (where a.cuenta), 0)::numeric as kg,
           coalesce(sum(a.destetadas_con_peso) filter (where a.cuenta), 0)::numeric as des_kg,
           bool_or(a.mixto) as mixto
    from a
    group by 1, 2
  ),
  m as (
    select g.*,
           case p_medida
             when 'pct_prenez' then g.pre when 'pct_paricion' then g.viv when 'pct_paricion_total' then g.viv + g.mue
             when 'pct_destete' then g.des when 'pct_perdidas' then g.pre - g.des when 'pct_reposicion' then g.ent_rep
             when 'kg_destetados_vaca' then g.kg when 'peso_destete' then g.kg
           end as num,
           case p_medida
             when 'pct_perdidas' then g.pre
             when 'peso_destete' then g.des_kg
             else g.ent
           end as den
    from g
  )
  select case when m.temporada is null then null else m.temporada || '/' || right((m.temporada + 1)::text, 2) end,
         m.grupo,
         case p_abrir_por
           when 'especie'   then (select s.nombre from public.especies s where s.id = m.grupo::uuid)
           when 'lote'      then (select l.nombre from public.lotes l where l.id = m.grupo::uuid)
           when 'categoria' then case m.grupo when 'mixto' then 'Mixto' when 'sin_categoria' then 'Sin categoría'
                                   else (select c.nombre from public.categorias_animales c where c.id = m.grupo::uuid) end
         end,
         case p_medida
           when 'entoradas' then m.ent when 'prenadas' then m.pre when 'nacidos_vivos' then m.viv
           when 'nacidos_muertos' then m.mue when 'destetados' then m.des when 'kg_destetados' then m.kg
           when 'kg_destetados_vaca' then round(m.num / nullif(m.den, 0), 1)
           when 'peso_destete' then round(m.num / nullif(m.den, 0), 1)
           else round(100 * m.num / nullif(m.den, 0), 1)
         end,
         m.num,
         case when p_medida like 'pct\_%' or p_medida in ('kg_destetados_vaca', 'peso_destete') then m.den end,
         nullif(jsonb_strip_nulls(jsonb_build_object(
           'destete_mixto', case when m.mixto then true end,
           'sin_servicio',  nullif(v_sin, 0),
           'destetados_sin_peso', case when p_medida in ('kg_destetados', 'kg_destetados_vaca', 'peso_destete')
                                       then nullif(m.des - m.des_kg, 0) end)), '{}'::jsonb)
  from m
  order by m.temporada nulls first, 3;
end;
$$;

revoke execute on function public.tablero_reproductivos(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_reproductivos(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

commit;
