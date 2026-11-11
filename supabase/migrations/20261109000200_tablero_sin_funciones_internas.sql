-- Campo Digital v2 — Tablero de Indicadores: arreglo de permisos (después de 20261109000100)
--
-- tablero_stock y tablero_reproductivos corren con los permisos de quien consulta (security invoker), así que no
-- pueden llamar a funciones internas sin permiso de ejecución (_tablero_uuids y _tablero_periodos daban
-- "permission denied"). Las dos pasan a tener esa lógica adentro (misma firma, mismo resultado) y las internas se
-- borran: las funciones con "_" siguen sin execute para nadie.

begin;

-- Stock, desde los eventos de los lotes (como stock_al). Medidas:
--   'stock'         stock al cierre de cada período (semi-aditivo: al último día, nunca la suma de los meses)
--   'movimientos'   Σ de los eventos de cada período; abierto por 'motivo', cada tipo con su sentido
--                   ("compra+", "venta-", "union+" y "union-"...)
--   'mortandad_pct' muertes del período / (stock al inicio + pariciones + compras del período), en %
--                   (numerador y denominador aparte); tiempo 'total' o 'ejercicio'
-- Abrir por: null, 'especie', 'categoria', 'lote' o 'motivo' (solo movimientos). Filtros: especie_ids,
-- categoria_ids, lote_ids. Sin abrir hay una fila por período (0 si no hay nada); abierto, solo los grupos con datos
-- (en stock, los que no quedaron en 0).
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
               when 'destete' then 'Destete' else left(d.clave, -1)
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

-- Reproductivos, desde v_indicadores_aportes (las mismas reglas que la pantalla de hoy), por temporada (julio a
-- junio, según la fecha del servicio). Entran las temporadas que empiezan entre desde y hasta. Medidas:
--   'pct_prenez' preñadas / entoradas, 'pct_paricion' nacidos vivos / entoradas, 'pct_paricion_total'
--   (vivos + muertos) / entoradas, 'pct_destete' destetados / entoradas (en %, con numerador y denominador),
--   y los conteos 'entoradas', 'prenadas', 'nacidos_vivos', 'nacidos_muertos', 'destetados'.
-- Tiempo: 'temporada' o 'total'. Abrir por: null, 'especie' o 'lote'. Filtros: especie_ids y lote_ids (la categoría
-- no aplica). Avisos: destete_mixto y sin_servicio (actividades del período que no suman a ninguna temporada).
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
  v_lot uuid[];
  v_sin int;
begin
  if p_establecimiento_id is null or not public.es_miembro(p_establecimiento_id) then
    raise exception 'Sin acceso a este establecimiento' using errcode = '42501';
  end if;
  if p_medida is null or p_medida not in ('pct_prenez', 'pct_paricion', 'pct_paricion_total', 'pct_destete',
                                          'entoradas', 'prenadas', 'nacidos_vivos', 'nacidos_muertos', 'destetados') then
    raise exception 'Medida reproductiva desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('temporada', 'total') then
    raise exception 'Tiempo inválido para reproductivos: %', p_tiempo using errcode = '22023';
  end if;
  if p_abrir_por is not null and p_abrir_por not in ('especie', 'lote') then
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
           case p_abrir_por when 'especie' then a.especie_id::text when 'lote' then a.lote_id::text end as grupo
    from public.v_indicadores_aportes a
    where a.establecimiento_id = p_establecimiento_id
      and a.temporada is not null
      and make_date(a.temporada, 7, 1) between p_desde and p_hasta
      and (v_esp is null or a.especie_id = any (v_esp))
      and (v_lot is null or a.lote_id    = any (v_lot))
  ),
  g as (
    select case when p_tiempo = 'temporada' then a.temporada end as temporada, a.grupo,
           coalesce(sum(a.entoradas)       filter (where a.cuenta), 0)::numeric as ent,
           coalesce(sum(a.prenadas)        filter (where a.cuenta), 0)::numeric as pre,
           coalesce(sum(a.nacidas_vivas)   filter (where a.cuenta), 0)::numeric as viv,
           coalesce(sum(a.nacidas_muertas) filter (where a.cuenta), 0)::numeric as mue,
           coalesce(sum(a.destetadas)      filter (where a.cuenta), 0)::numeric as des,
           bool_or(a.mixto) as mixto
    from a
    group by 1, 2
  ),
  m as (
    select g.*,
           case p_medida
             when 'pct_prenez' then g.pre when 'pct_paricion' then g.viv when 'pct_paricion_total' then g.viv + g.mue
             when 'pct_destete' then g.des
           end as num
    from g
  )
  select case when m.temporada is null then null else m.temporada || '/' || right((m.temporada + 1)::text, 2) end,
         m.grupo,
         case p_abrir_por
           when 'especie' then (select s.nombre from public.especies s where s.id = m.grupo::uuid)
           when 'lote'    then (select l.nombre from public.lotes l where l.id = m.grupo::uuid)
         end,
         case p_medida
           when 'entoradas' then m.ent when 'prenadas' then m.pre when 'nacidos_vivos' then m.viv
           when 'nacidos_muertos' then m.mue when 'destetados' then m.des
           else round(100 * m.num / nullif(m.ent, 0), 1)
         end,
         m.num,
         case when p_medida like 'pct\_%' then m.ent end,
         nullif(jsonb_strip_nulls(jsonb_build_object(
           'destete_mixto', case when m.mixto then true end,
           'sin_servicio',  nullif(v_sin, 0))), '{}'::jsonb)
  from m
  order by m.temporada nulls first, 3;
end;
$$;

revoke execute on function public.tablero_reproductivos(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_reproductivos(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

drop function public._tablero_uuids(jsonb, text);
drop function public._tablero_periodos(text, date, date);

commit;
