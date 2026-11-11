-- Campo Digital v2 — Tablero de Indicadores, etapa 3: economía y potreros (diseño: contexto/DISENO-INDICADORES-TABLERO.md)
--
--   1. categorias_animales.ug: unidades ganaderas por cabeza, editable por el administrador (como el resto de la
--      categoría). Se carga con la tabla que hoy usa la app (components/potreros/ug.ts), por nombre, y las
--      categorías nuevas la toman sola al crearse (trigger completar_ug_categoria). Sin UG: no suma y se avisa.
--   2. tablero_economia: ingresos, gastos, resultado y pendientes de cobro y pago, en USD. Especie del movimiento:
--      la de su lote; sin lote, la especie cuyo rubro es el del movimiento (si hay una sola); si no, "Sin asignar".
--      Al abrir por titular se respeta el reparto. Al filtrar por especie o lote, lo que quedó afuera por no tener
--      esa dimensión va en los avisos (usd_sin_especie, usd_sin_lote).
--   3. tablero_potreros: carga (UG/ha) global o por potrero, UG, superficie y días de ocupación y descanso.
--      Carga global: UG de todos los animales / superficie de los potreros activos (aviso de los sin dibujar).
--   Las dos funciones de datos corren con los permisos de quien consulta (como las otras del tablero).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. UG por categoría
-- ════════════════════════════════════════════════════════════════════════════

alter table public.categorias_animales
  add column ug numeric(5,2) check (ug is null or (ug > 0 and ug <= 5));

grant insert (ug), update (ug) on public.categorias_animales to authenticated;

-- UG de una categoría por su nombre (sin mayúsculas ni tildes); null si no está en la tabla
create function public._ug_por_nombre(p_nombre text) returns numeric
language sql
immutable
set search_path = ''
as $$
  select case translate(lower(btrim(p_nombre)), 'áéíóú', 'aeiou')
    -- Vacunos
    when 'terneros/as' then 0.5 when 'terneros' then 0.5 when 'terneras' then 0.5
    when 'vaquillonas' then 0.8 when 'novillos' then 0.8
    when 'vacas de cria' then 1 when 'vacas de invernada o descarte' then 1
    when 'toros' then 1.2
    -- Ovinos
    when 'corderos/as' then 0.1 when 'corderos' then 0.1 when 'corderas' then 0.1
    when 'borregos' then 0.16 when 'borregas' then 0.16
    when 'ovejas de cria' then 0.15 when 'ovejas de descarte' then 0.12
    when 'carneros' then 0.17
    -- Equinos
    when 'yeguas' then 1.2 when 'caballos' then 1.25
    when 'potrillos/as' then 0.5 when 'potrillos' then 0.5 when 'potrillas' then 0.5
    when 'padrillos' then 1.25
  end::numeric
$$;

revoke execute on function public._ug_por_nombre(text) from public, anon, authenticated;

-- Una categoría nueva sin UG la toma de la tabla (el administrador la puede cambiar después)
create function public.completar_ug_categoria() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ug is null then
    new.ug := public._ug_por_nombre(new.nombre);
  end if;
  return new;
end;
$$;

revoke execute on function public.completar_ug_categoria() from public, anon, authenticated;

create trigger completar_ug_categoria before insert on public.categorias_animales
  for each row execute function public.completar_ug_categoria();

-- Las que ya existen (sin tocar updated_at)
alter table public.categorias_animales disable trigger set_updated_at;
update public.categorias_animales set ug = public._ug_por_nombre(nombre) where ug is null;
alter table public.categorias_animales enable trigger set_updated_at;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Economía
-- ════════════════════════════════════════════════════════════════════════════

-- Medidas: 'ingresos', 'gastos', 'resultado' (ingresos − gastos), 'pendiente_cobro' y 'pendiente_pago' (lo no
-- pagado, de movimientos del período; tiempo 'total'). Abrir por: especie, lote, rubro, concepto, grupo o titular
-- (lo que no tiene esa dimensión va a "Sin asignar" / "Sin titular"). Filtros: especie_ids y lote_ids.
create function public.tablero_economia(
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
begin
  if p_establecimiento_id is null or not public.es_miembro(p_establecimiento_id) then
    raise exception 'Sin acceso a este establecimiento' using errcode = '42501';
  end if;
  if p_medida is null or p_medida not in ('ingresos', 'gastos', 'resultado', 'pendiente_cobro', 'pendiente_pago') then
    raise exception 'Medida económica desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('total', 'mes', 'ejercicio')
     or (p_medida like 'pendiente\_%' and p_tiempo <> 'total') then
    raise exception 'Tiempo inválido para %: %', p_medida, p_tiempo using errcode = '22023';
  end if;
  if p_abrir_por is not null and p_abrir_por not in ('especie', 'lote', 'rubro', 'concepto', 'grupo', 'titular') then
    raise exception 'No se puede abrir la economía por %', p_abrir_por using errcode = '22023';
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
  -- Movimientos vigentes del período, con su especie (lote o rubro) y, si se abre por titular, una fila por titular
  -- con su parte (en USD)
  mov as (
    select m.id, m.fecha, m.sentido, m.estado, m.lote_id, m.rubro_id, m.concepto_id, c.grupo_id,
           coalesce(l.especie_id,
                    (select min(e.id::text)::uuid from public.especies e
                     where e.establecimiento_id = m.establecimiento_id and e.rubro_id = m.rubro_id
                     having count(*) = 1)) as especie_id,
           t.titular_id,
           coalesce(t.usd, m.monto_usd) as usd
    from public.movimientos_economicos m
    left join public.lotes l on l.id = m.lote_id
    left join public.conceptos c on c.id = m.concepto_id
    left join lateral (
      select mt.titular_id, round(m.monto_usd * mt.monto / m.monto_original, 2) as usd
      from public.movimiento_titulares mt
      where mt.movimiento_id = m.id and p_abrir_por = 'titular'
    ) t on true
    where m.establecimiento_id = p_establecimiento_id
      and m.anulado_en is null
      and m.fecha between p_desde and p_hasta
  ),
  filtrados as (
    select x.*,
           case p_abrir_por
             when 'especie'  then coalesce(x.especie_id::text, 'sin')
             when 'lote'     then coalesce(x.lote_id::text, 'sin')
             when 'rubro'    then x.rubro_id::text
             when 'concepto' then coalesce(x.concepto_id::text, 'sin')
             when 'grupo'    then coalesce(x.grupo_id::text, 'sin')
             when 'titular'  then coalesce(x.titular_id::text, 'sin')
           end as grupo
    from mov x
    where (v_esp is null or x.especie_id = any (v_esp))
      and (v_lot is null or x.lote_id    = any (v_lot))
  ),
  -- Lo que quedó afuera de un filtro por no tener la dimensión (una vez por movimiento)
  aviso as (
    select nullif(jsonb_strip_nulls(jsonb_build_object(
             'usd_sin_especie', case when v_esp is not null then nullif((select sum(u.monto_usd) from public.movimientos_economicos u
                                  where u.id in (select x.id from mov x where x.especie_id is null)), 0) end,
             'usd_sin_lote',    case when v_lot is not null then nullif((select sum(u.monto_usd) from public.movimientos_economicos u
                                  where u.id in (select x.id from mov x where x.lote_id is null)), 0) end)), '{}'::jsonb) as avisos
  ),
  datos as (
    select p.periodo, p.inicio as pini, f.grupo,
           case p_medida
             when 'ingresos'        then coalesce(sum(f.usd) filter (where f.sentido = 'ingreso'), 0)
             when 'gastos'          then coalesce(sum(f.usd) filter (where f.sentido = 'egreso'), 0)
             when 'resultado'       then coalesce(sum(case when f.sentido = 'ingreso' then f.usd else -f.usd end), 0)
             when 'pendiente_cobro' then coalesce(sum(f.usd) filter (where f.sentido = 'ingreso' and f.estado = 'pendiente'), 0)
             when 'pendiente_pago'  then coalesce(sum(f.usd) filter (where f.sentido = 'egreso' and f.estado = 'pendiente'), 0)
           end as valor,
           count(f.id) as n
    from per p
    left join filtrados f on f.fecha between p.inicio and p.fin
    group by p.periodo, p.inicio, f.grupo
  )
  select d.periodo, d.grupo,
         case
           when p_abrir_por is null then null
           when d.grupo = 'sin' then case p_abrir_por when 'titular' then 'Sin titular' else 'Sin asignar' end
           else case p_abrir_por
             when 'especie'  then (select s.nombre from public.especies s where s.id = d.grupo::uuid)
             when 'lote'     then (select l.nombre from public.lotes l where l.id = d.grupo::uuid)
             when 'rubro'    then (select r.nombre from public.rubros r where r.id = d.grupo::uuid)
             when 'concepto' then (select c.nombre from public.conceptos c where c.id = d.grupo::uuid)
             when 'grupo'    then (select g.nombre from public.concepto_grupos g where g.id = d.grupo::uuid)
             when 'titular'  then (select t.nombre from public.titulares t where t.id = d.grupo::uuid)
           end
         end,
         round(d.valor, 2), null::numeric, null::numeric, a.avisos
  from datos d cross join aviso a
  where p_abrir_por is null or (d.grupo is not null and d.n > 0)
  order by d.pini, 4 desc nulls last, 3;
end;
$$;

revoke execute on function public.tablero_economia(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_economia(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Potreros
-- ════════════════════════════════════════════════════════════════════════════

-- Medidas:
--   'carga'     UG / ha al cierre de cada período: sin abrir, la global (UG de todos los animales / superficie de los
--               potreros activos); por potrero, las UG de los lotes que están en él / su superficie
--   'ug'        UG al cierre (todos los animales, o por potrero)
--   'superficie' ha (de los potreros activos, o de cada uno); 'dias_ocupacion' y 'dias_descanso' (días del período
--               con y sin animales; por potrero)
-- Tiempo: carga, ug y superficie 'total' o 'mes' (al cierre); los días, 'total', 'mes' o 'ejercicio'. Filtros:
-- especie_ids, categoria_ids y lote_ids (para las UG). Avisos: potreros_sin_dibujar (activos sin superficie) y
-- categorias_sin_ug (nombres de las categorías con animales que no suman).
create function public.tablero_potreros(
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
  if p_medida is null or p_medida not in ('carga', 'ug', 'superficie', 'dias_ocupacion', 'dias_descanso') then
    raise exception 'Medida de potreros desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('total', 'mes', 'ejercicio')
     or (p_medida in ('carga', 'ug', 'superficie') and p_tiempo = 'ejercicio') then
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
    select p.id, p.nombre, p.superficie from public.potreros p
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
             when 'carga'      then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo)
                                    / nullif((select sum(pt.superficie) from pot pt), 0)
           end as valor,
           case when p_medida = 'carga' then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo) end as num,
           case when p_medida = 'carga' then (select sum(pt.superficie) from pot pt) end as den,
           1 as n
    from per p
    where p_abrir_por is null
    union all
    -- Por potrero
    select p.periodo, p.inicio, pt.id::text,
           case p_medida
             when 'ug'             then coalesce((select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo and d.potrero_id = pt.id), 0)
             when 'superficie'     then pt.superficie
             when 'carga'          then coalesce((select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo and d.potrero_id = pt.id), 0)
                                        / nullif(pt.superficie, 0)
             when 'dias_ocupacion' then (select o.dias from ocupacion o where o.periodo is not distinct from p.periodo and o.potrero_id = pt.id)
             when 'dias_descanso'  then (select o.dias_periodo - o.dias from ocupacion o where o.periodo is not distinct from p.periodo and o.potrero_id = pt.id)
           end,
           case when p_medida = 'carga' then coalesce((select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo and d.potrero_id = pt.id), 0) end,
           case when p_medida = 'carga' then pt.superficie end,
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
