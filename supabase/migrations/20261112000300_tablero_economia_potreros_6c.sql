-- Campo Digital v2 — Tablero de Indicadores, etapa 6c: medidas nuevas de economía y potreros (diseño:
-- contexto/DISENO-INDICADORES-TABLERO.md, sección 4 "Medidas nuevas" y sección 10). Después de 20261112000200.
--
--   1. tablero_economia (misma firma): gastos operativos (sin las compras de hacienda), precio promedio de venta
--      (USD/kg), flujo de caja (por fecha de pago), % del gasto y saldos entre pagadores; abrir por pagador.
--   2. tablero_potreros (misma firma): carga promedio y presión acumulada (UG-día), Ha SPG, ha forestadas, potreros
--      y ha sin animales, y días desde la última salida.
-- Funciones: ninguna nueva (la auditoría de permisos sigue en 165).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Economía
-- ════════════════════════════════════════════════════════════════════════════

-- Medidas (en USD):
--   'ingresos', 'gastos', 'resultado' (ingresos − gastos), 'pendiente_cobro' y 'pendiente_pago' (lo no pagado, de
--   movimientos del período; tiempo 'total')
--   'gastos_operativos' gastos sin las compras de hacienda (movimientos de una actividad de compra)
--   'precio_venta'      USD de las ventas de hacienda / kg vendidos, solo ventas con kg en todas sus líneas
--                       (numerador: USD; denominador: kg; aviso usd_ventas_sin_kg). Abrir: especie o lote.
--   'flujo_caja'        cobrado − pagado, por la fecha de pago (sin ella, la del movimiento); lo pendiente no entra
--   'pct_gasto'         gasto del grupo / gasto total del período, en % (numerador y denominador en USD)
--   'saldos'            quién le debe a quién, con lo pagado y las liquidaciones hasta el fin del período (como
--                       v_saldos); se abre por 'par' (una fila por deudor y acreedor), tiempo 'total', sin filtros
-- Abrir por: especie, lote, rubro, concepto, grupo, titular o pagador (lo que no tiene esa dimensión va a "Sin
-- asignar" / "Sin titular" / "Sin pagador"). Filtros: especie_ids y lote_ids.
create or replace function public.tablero_economia(
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
  if p_medida is null or p_medida not in ('ingresos', 'gastos', 'resultado', 'pendiente_cobro', 'pendiente_pago',
                                          'gastos_operativos', 'precio_venta', 'flujo_caja', 'pct_gasto', 'saldos') then
    raise exception 'Medida económica desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('total', 'mes', 'ejercicio')
     or (p_medida in ('pendiente_cobro', 'pendiente_pago', 'saldos') and p_tiempo <> 'total')
     or (p_medida in ('precio_venta', 'pct_gasto') and p_tiempo = 'mes') then
    raise exception 'Tiempo inválido para %: %', p_medida, p_tiempo using errcode = '22023';
  end if;
  if (p_abrir_por is not null and (p_abrir_por not in ('especie', 'lote', 'rubro', 'concepto', 'grupo', 'titular', 'pagador', 'par')
                                   or (p_abrir_por = 'par') <> (p_medida = 'saldos')
                                   or (p_medida = 'precio_venta' and p_abrir_por not in ('especie', 'lote'))))
     or (p_abrir_por is null and p_medida = 'saldos') then
    raise exception 'No se puede abrir % por %', p_medida, coalesce(p_abrir_por, 'nada') using errcode = '22023';
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

  -- Saldos: quién le debe a quién al fin del período (los filtros no aplican)
  if p_medida = 'saldos' then
    return query
    with
    aportes as (
      select s.deudor_tipo, s.deudor_id, s.acreedor_tipo, s.acreedor_id, s.monto_usd,
             (s.deudor_tipo || ':' || s.deudor_id) < (s.acreedor_tipo || ':' || s.acreedor_id) as directo
      from public.v_saldos_aportes s
      where s.establecimiento_id = p_establecimiento_id and s.fecha <= p_hasta
    ),
    pares as (
      select case when a.directo then a.deudor_tipo else a.acreedor_tipo end as tipo1,
             case when a.directo then a.deudor_id else a.acreedor_id end as id1,
             case when a.directo then a.acreedor_tipo else a.deudor_tipo end as tipo2,
             case when a.directo then a.acreedor_id else a.deudor_id end as id2,
             sum(case when a.directo then a.monto_usd else -a.monto_usd end) as neto   -- > 0: la parte 1 le debe a la 2
      from aportes a
      group by 1, 2, 3, 4
    ),
    sal as (
      select case when x.neto > 0 then x.tipo1 else x.tipo2 end as dt, case when x.neto > 0 then x.id1 else x.id2 end as di,
             case when x.neto > 0 then x.tipo2 else x.tipo1 end as at, case when x.neto > 0 then x.id2 else x.id1 end as ai,
             abs(x.neto) as monto
      from pares x
      where x.neto <> 0
    ),
    nom as (
      select s.*,
             case s.dt when 'titular' then (select t.nombre from public.titulares t where t.id = s.di)
                       else (select g.nombre from public.pagadores g where g.id = s.di) end as deudor,
             case s.at when 'titular' then (select t.nombre from public.titulares t where t.id = s.ai)
                       else (select g.nombre from public.pagadores g where g.id = s.ai) end as acreedor
      from sal s
    )
    select null::text, n.dt || ':' || n.di || '>' || n.at || ':' || n.ai, n.deudor || ' le debe a ' || n.acreedor,
           round(n.monto, 2), null::numeric, null::numeric, null::jsonb
    from nom n
    order by n.monto desc, 3;
    return;
  end if;

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
  -- Movimientos vigentes del período (en el flujo de caja, por la fecha de pago y solo los pagados), con su especie
  -- (lote o rubro), el tipo de la actividad de hacienda y, si se abre por titular, una fila por titular con su parte
  -- (en USD)
  mov0 as (
    select m.id, m.sentido, m.estado, m.lote_id, m.rubro_id, m.concepto_id, c.grupo_id, m.pagador_id, m.actividad_id,
           case when p_medida = 'flujo_caja' then coalesce(m.fecha_pago, m.fecha) else m.fecha end as fecha,
           coalesce(l.especie_id,
                    (select min(e.id::text)::uuid from public.especies e
                     where e.establecimiento_id = m.establecimiento_id and e.rubro_id = m.rubro_id
                     having count(*) = 1)) as especie_id,
           a.tipo as tipo_actividad,
           t.titular_id,
           coalesce(t.usd, m.monto_usd) as usd
    from public.movimientos_economicos m
    left join public.lotes l on l.id = m.lote_id
    left join public.conceptos c on c.id = m.concepto_id
    left join public.actividades a on a.id = m.actividad_id and a.tipo in ('compra', 'venta')
    left join lateral (
      select mt.titular_id, round(m.monto_usd * mt.monto / m.monto_original, 2) as usd
      from public.movimiento_titulares mt
      where mt.movimiento_id = m.id and p_abrir_por = 'titular'
    ) t on true
    where m.establecimiento_id = p_establecimiento_id
      and m.anulado_en is null
      and (p_medida <> 'flujo_caja' or m.estado = 'pagado')
  ),
  mov as (
    select x.*,
           -- Kg de la venta (todas sus líneas con kg), en el primer movimiento de la actividad
           case when x.tipo_actividad = 'venta'
                     and row_number() over (partition by x.actividad_id order by x.id) = 1
                then (select case when bool_and(li.peso_vivo_total_kg is not null) then sum(li.peso_vivo_total_kg) end
                      from public.actividad_lineas li where li.actividad_id = x.actividad_id) end as kg_venta
    from mov0 x
    where x.fecha between p_desde and p_hasta
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
             when 'pagador'  then coalesce(x.pagador_id::text, 'sin')
           end as grupo,
           -- Venta con kg (los kg van en uno solo de sus movimientos)
           x.tipo_actividad = 'venta' and x.sentido = 'ingreso'
             and bool_or(x.kg_venta is not null) over (partition by x.actividad_id) as venta_con_kg
    from mov x
    where (v_esp is null or x.especie_id = any (v_esp))
      and (v_lot is null or x.lote_id    = any (v_lot))
  ),
  -- Lo que quedó afuera de un filtro por no tener la dimensión (una vez por movimiento), y las ventas sin kg
  aviso as (
    select nullif(jsonb_strip_nulls(jsonb_build_object(
             'usd_sin_especie', case when v_esp is not null then nullif((select sum(u.monto_usd) from public.movimientos_economicos u
                                  where u.id in (select x.id from mov x where x.especie_id is null)), 0) end,
             'usd_sin_lote',    case when v_lot is not null then nullif((select sum(u.monto_usd) from public.movimientos_economicos u
                                  where u.id in (select x.id from mov x where x.lote_id is null)), 0) end,
             'usd_ventas_sin_kg', case when p_medida = 'precio_venta' then nullif((select sum(f.usd) from filtrados f
                                  where f.tipo_actividad = 'venta' and f.sentido = 'ingreso' and not f.venta_con_kg), 0) end
           )), '{}'::jsonb) as avisos
  ),
  datos as (
    select p.periodo, p.inicio as pini, f.grupo,
           case p_medida
             when 'ingresos'          then coalesce(sum(f.usd) filter (where f.sentido = 'ingreso'), 0)
             when 'gastos'            then coalesce(sum(f.usd) filter (where f.sentido = 'egreso'), 0)
             when 'resultado'         then coalesce(sum(case when f.sentido = 'ingreso' then f.usd else -f.usd end), 0)
             when 'pendiente_cobro'   then coalesce(sum(f.usd) filter (where f.sentido = 'ingreso' and f.estado = 'pendiente'), 0)
             when 'pendiente_pago'    then coalesce(sum(f.usd) filter (where f.sentido = 'egreso' and f.estado = 'pendiente'), 0)
             when 'gastos_operativos' then coalesce(sum(f.usd) filter (where f.sentido = 'egreso' and f.tipo_actividad is distinct from 'compra'), 0)
             when 'flujo_caja'        then coalesce(sum(case when f.sentido = 'ingreso' then f.usd else -f.usd end), 0)
             when 'pct_gasto'         then coalesce(sum(f.usd) filter (where f.sentido = 'egreso'), 0)
           end as valor,
           -- Precio de venta: USD y kg de las ventas con kg
           sum(f.usd) filter (where f.venta_con_kg) as usd_venta,
           sum(f.kg_venta) as kg_venta,
           count(f.id) as n
    from per p
    left join filtrados f on f.fecha between p.inicio and p.fin
    group by p.periodo, p.inicio, f.grupo
  ),
  calc as (
    select d.*,
           sum(d.valor) over (partition by d.pini) as total_periodo
    from datos d
  )
  select d.periodo, d.grupo,
         case
           when p_abrir_por is null then null
           when d.grupo = 'sin' then case p_abrir_por when 'titular' then 'Sin titular' when 'pagador' then 'Sin pagador' else 'Sin asignar' end
           else case p_abrir_por
             when 'especie'  then (select s.nombre from public.especies s where s.id = d.grupo::uuid)
             when 'lote'     then (select l.nombre from public.lotes l where l.id = d.grupo::uuid)
             when 'rubro'    then (select r.nombre from public.rubros r where r.id = d.grupo::uuid)
             when 'concepto' then (select c.nombre from public.conceptos c where c.id = d.grupo::uuid)
             when 'grupo'    then (select g.nombre from public.concepto_grupos g where g.id = d.grupo::uuid)
             when 'titular'  then (select t.nombre from public.titulares t where t.id = d.grupo::uuid)
             when 'pagador'  then (select g.nombre from public.pagadores g where g.id = d.grupo::uuid)
           end
         end,
         case p_medida
           when 'precio_venta' then round(d.usd_venta / nullif(d.kg_venta, 0), 2)
           when 'pct_gasto'    then round(100 * d.valor / nullif(d.total_periodo, 0), 2)
           else round(d.valor, 2)
         end,
         case p_medida when 'precio_venta' then round(d.usd_venta, 2) when 'pct_gasto' then round(d.valor, 2) end,
         case p_medida when 'precio_venta' then round(d.kg_venta, 1) when 'pct_gasto' then round(d.total_periodo, 2) end,
         a.avisos
  from calc d cross join aviso a
  where p_abrir_por is null
     or (d.grupo is not null and d.n > 0
         and not (p_medida = 'precio_venta' and d.kg_venta is null)
         and not (p_medida in ('pct_gasto', 'gastos_operativos') and d.valor = 0))
  order by d.pini, 4 desc nulls last, 3;
end;
$$;

revoke execute on function public.tablero_economia(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_economia(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Potreros
-- ════════════════════════════════════════════════════════════════════════════

-- Medidas:
--   'carga'     UG / ha efectiva al cierre de cada período: sin abrir, la global (UG de todos los animales / área
--               efectiva de los potreros activos de pastoreo); por potrero, las UG de los lotes que están en él / su
--               área efectiva
--   'carga_promedio' UG-día del período / días / ha efectiva: sin abrir, la global (todos los animales / Ha SPG, con
--               aviso ug_sin_potrero = las UG promedio de los lotes sin potrero); por potrero, las UG-día de sus
--               estadías (numerador: UG promedio; denominador: ha)
--   'presion'   UG-día del período / ha efectiva (global o por potrero; numerador: UG-día; denominador: ha)
--   'superficie_efectiva' ha efectivas (sin las zonas no aprovechables): sin abrir, la de los potreros activos de
--               pastoreo; por potrero, la de cada uno
--   'ha_spg'    Σ ha efectivas de los potreros activos de pastoreo (sin abrir; avisos potreros_sin_dibujar y
--               superficie_actual)
--   'ha_forestadas' Σ superficie de los potreros activos de uso Forestación + zonas de un tipo "Forestación" dentro
--               de los demás (sin abrir)
--   'potreros_sin_animales' cantidad de potreros activos de pastoreo sin lotes al cierre (numerador: sus ha);
--               'ha_sin_animales', sus ha efectivas
--   'dias_desde_salida' por potrero: fin del período − salida del último lote, de los potreros sin animales al
--               cierre que alguna vez tuvieron (tiempo 'total')
-- Pastoreo: uso Ganadería o sin uso cargado (no cuentan Forestación, Reserva ni Sin uso).
--   'ug'        UG al cierre (todos los animales, o por potrero)
--   'superficie' ha (de los potreros activos, o de cada uno); 'dias_ocupacion' y 'dias_descanso' (días del período
--               con y sin animales; por potrero)
-- Tiempo: carga, ug, superficies y potreros sin animales 'total' o 'mes' (al cierre); carga promedio, presión y los
-- días de ocupación y descanso, 'total', 'mes' o 'ejercicio'; Ha SPG, ha forestadas y días desde la salida, 'total'.
-- Filtros: especie_ids, categoria_ids y lote_ids (para las UG). Avisos: potreros_sin_dibujar (activos de pastoreo
-- sin superficie), categorias_sin_ug, ug_sin_potrero (carga global; con varios períodos, el mayor) y, en las medidas
-- nuevas con superficie, superficie_actual (el período termina antes del año en curso: las superficies son las de
-- hoy).
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
  if p_medida is null or p_medida not in ('carga', 'ug', 'superficie', 'superficie_efectiva', 'dias_ocupacion', 'dias_descanso',
                                          'carga_promedio', 'presion', 'ha_spg', 'ha_forestadas', 'potreros_sin_animales',
                                          'ha_sin_animales', 'dias_desde_salida') then
    raise exception 'Medida de potreros desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('total', 'mes', 'ejercicio')
     or (p_medida in ('carga', 'ug', 'superficie', 'superficie_efectiva', 'potreros_sin_animales', 'ha_sin_animales')
         and p_tiempo = 'ejercicio')
     or (p_medida in ('ha_spg', 'ha_forestadas', 'dias_desde_salida') and p_tiempo <> 'total') then
    raise exception 'Tiempo inválido para %: %', p_medida, p_tiempo using errcode = '22023';
  end if;
  if (p_abrir_por is not null and p_abrir_por <> 'potrero')
     or (p_medida in ('dias_ocupacion', 'dias_descanso', 'dias_desde_salida') and p_abrir_por is null)
     or (p_medida in ('ha_spg', 'ha_forestadas', 'potreros_sin_animales', 'ha_sin_animales') and p_abrir_por is not null) then
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
    select p.id, p.nombre, p.superficie, p.superficie_efectiva, p.forma,
           coalesce(p.uso_actual, 'Ganadería') = 'Ganadería' as pastoreo,
           p.uso_actual = 'Forestación' as forestal
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
  -- UG-día del período: de todos los animales (global) y de los lotes en cada potrero (estadías [ingreso, salida))
  ev as (
    select e.lote_id, e.fecha, e.cabezas * c.ug as ug, c.nombre as categoria, c.ug is null as sin_ug
    from public.lote_eventos e
    join public.categorias_animales c on c.id = e.categoria_id
    where e.establecimiento_id = p_establecimiento_id and e.fecha <= p_hasta
      and p_medida in ('carga_promedio', 'presion')
      and (v_esp is null or e.especie_id   = any (v_esp))
      and (v_cat is null or e.categoria_id = any (v_cat))
      and (v_lot is null or e.lote_id      = any (v_lot))
  ),
  ugd_global as (
    select p.periodo, p.inicio,
           coalesce(sum(v.ug * (p.fin - greatest(v.fecha, p.inicio) + 1)), 0) as ugd,
           p.fin - p.inicio + 1 as dias
    from per p
    left join ev v on v.fecha <= p.fin
    where p_medida in ('carga_promedio', 'presion')
    group by p.periodo, p.inicio, p.fin
  ),
  tramos as (
    select p.periodo, p.inicio, es.potrero_id, es.lote_id,
           greatest(es.fecha_ingreso, p.inicio) as a,
           least(coalesce(es.fecha_salida - 1, p.fin), p.fin) as b
    from per p
    join public.lote_estadias es on es.establecimiento_id = p_establecimiento_id and es.anulada_en is null
                                and es.fecha_ingreso <= p.fin and (es.fecha_salida is null or es.fecha_salida > p.inicio)
    where p_medida in ('carga_promedio', 'presion')
  ),
  ugd_pot as (
    select t.periodo, t.inicio, t.potrero_id,
           coalesce(sum(v.ug * (t.b - greatest(v.fecha, t.a) + 1)), 0) as ugd
    from tramos t
    join ev v on v.lote_id = t.lote_id and v.fecha <= t.b
    where t.b >= t.a
    group by t.periodo, t.inicio, t.potrero_id
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
  -- Potreros con algún lote al cierre de cada período (estadías abiertas ese día)
  ocupados as (
    select p.periodo, es.potrero_id
    from per p
    join public.lote_estadias es on es.establecimiento_id = p_establecimiento_id and es.anulada_en is null
                                and es.fecha_ingreso <= p.fin and (es.fecha_salida is null or es.fecha_salida > p.fin)
    where p_medida in ('potreros_sin_animales', 'ha_sin_animales', 'dias_desde_salida')
    group by p.periodo, es.potrero_id
  ),
  -- Zonas de un tipo "Forestación" dentro de los potreros que no son de uso Forestación (ha, recortadas al potrero)
  zonas_forestales as (
    select coalesce(sum(extensions.st_area(extensions.st_intersection(z.forma, pt.forma)::extensions.geography) / 10000), 0) as ha
    from public.potrero_zonas z
    join public.zona_tipos zt on zt.id = z.tipo_id
    join pot pt on pt.id = z.potrero_id
    where p_medida = 'ha_forestadas'
      and not pt.forestal and pt.forma is not null
      and translate(lower(btrim(zt.nombre)), 'áéíóú', 'aeiou') = 'forestacion'
  ),
  datos as (
    -- Global (sin abrir)
    select p.periodo, p.inicio as pini, null::text as grupo,
           case p_medida
             when 'ug'         then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo)
             when 'superficie' then (select sum(pt.superficie) from pot pt)
             when 'superficie_efectiva' then (select sum(pt.superficie_efectiva) from pot pt where pt.pastoreo)
             when 'ha_spg'     then (select coalesce(sum(pt.superficie_efectiva), 0) from pot pt where pt.pastoreo)
             when 'ha_forestadas' then (select coalesce(sum(pt.superficie), 0) from pot pt where pt.forestal)
                                       + (select z.ha from zonas_forestales z)
             when 'carga'      then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo)
                                    / nullif((select sum(pt.superficie_efectiva) from pot pt where pt.pastoreo), 0)
             when 'carga_promedio' then (select g.ugd / g.dias from ugd_global g where g.inicio = p.inicio)
                                    / nullif((select sum(pt.superficie_efectiva) from pot pt where pt.pastoreo), 0)
             when 'presion'    then (select g.ugd from ugd_global g where g.inicio = p.inicio)
                                    / nullif((select sum(pt.superficie_efectiva) from pot pt where pt.pastoreo), 0)
             when 'potreros_sin_animales' then (select count(*) from pot pt where pt.pastoreo
                                                and pt.id not in (select o.potrero_id from ocupados o where o.periodo is not distinct from p.periodo))
             when 'ha_sin_animales' then (select coalesce(sum(pt.superficie_efectiva), 0) from pot pt where pt.pastoreo
                                          and pt.id not in (select o.potrero_id from ocupados o where o.periodo is not distinct from p.periodo))
           end as valor,
           case p_medida
             when 'carga'          then (select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo)
             when 'carga_promedio' then (select round(g.ugd / g.dias, 2) from ugd_global g where g.inicio = p.inicio)
             when 'presion'        then (select g.ugd from ugd_global g where g.inicio = p.inicio)
             when 'potreros_sin_animales' then (select sum(pt.superficie_efectiva) from pot pt where pt.pastoreo
                                                and pt.id not in (select o.potrero_id from ocupados o where o.periodo is not distinct from p.periodo))
           end as num,
           case when p_medida in ('carga', 'carga_promedio', 'presion') then (select sum(pt.superficie_efectiva) from pot pt where pt.pastoreo) end as den,
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
             when 'carga_promedio' then coalesce((select u.ugd from ugd_pot u where u.inicio = p.inicio and u.potrero_id = pt.id), 0)
                                        / (p.fin - p.inicio + 1) / nullif(pt.superficie_efectiva, 0)
             when 'presion'        then coalesce((select u.ugd from ugd_pot u where u.inicio = p.inicio and u.potrero_id = pt.id), 0)
                                        / nullif(pt.superficie_efectiva, 0)
             when 'dias_ocupacion' then (select o.dias from ocupacion o where o.periodo is not distinct from p.periodo and o.potrero_id = pt.id)
             when 'dias_descanso'  then (select o.dias_periodo - o.dias from ocupacion o where o.periodo is not distinct from p.periodo and o.potrero_id = pt.id)
             when 'dias_desde_salida' then
               case when pt.id not in (select o.potrero_id from ocupados o where o.periodo is not distinct from p.periodo)
                    then p.fin - (select max(es.fecha_salida) from public.lote_estadias es
                                  where es.potrero_id = pt.id and es.anulada_en is null and es.fecha_salida <= p.fin) end
           end,
           case p_medida
             when 'carga'          then coalesce((select sum(d.cabezas * d.ug) from donde d where d.periodo is not distinct from p.periodo and d.potrero_id = pt.id), 0)
             when 'carga_promedio' then round(coalesce((select u.ugd from ugd_pot u where u.inicio = p.inicio and u.potrero_id = pt.id), 0)
                                              / (p.fin - p.inicio + 1), 2)
             when 'presion'        then coalesce((select u.ugd from ugd_pot u where u.inicio = p.inicio and u.potrero_id = pt.id), 0)
           end,
           case when p_medida in ('carga', 'carga_promedio', 'presion') then pt.superficie_efectiva end,
           1
    from per p cross join pot pt
    where p_abrir_por = 'potrero'
  ),
  aviso as (
    select nullif(jsonb_strip_nulls(jsonb_build_object(
             'potreros_sin_dibujar', nullif((select count(*) from pot where superficie is null and pastoreo), 0),
             'categorias_sin_ug', coalesce((select jsonb_agg(distinct d.categoria) from donde d where d.ug is null),
                                           (select jsonb_agg(distinct v.categoria) from ev v where v.sin_ug)),
             'ug_sin_potrero', case
               when p_medida = 'carga' and p_abrir_por is null then
                 nullif((select max(x.ug) from (select round(sum(d.cabezas * d.ug), 2) as ug from donde d
                                               where d.potrero_id is null group by d.periodo) x), 0)
               -- Carga promedio: las UG promedio que no estuvieron en ningún potrero (con varios períodos, el mayor)
               when p_medida = 'carga_promedio' and p_abrir_por is null then
                 nullif((select max(round((g.ugd - coalesce((select sum(u.ugd) from ugd_pot u where u.inicio = g.inicio), 0)) / g.dias, 2))
                         from ugd_global g), 0) end,
             'superficie_actual', case when p_medida in ('carga_promedio', 'presion', 'ha_spg', 'ha_forestadas', 'potreros_sin_animales', 'ha_sin_animales')
                                            and p_hasta < date_trunc('year', public.fecha_hoy())::date then true end
           )), '{}'::jsonb) as avisos
  )
  select d.periodo, d.grupo,
         case when d.grupo is not null then (select pt.nombre from pot pt where pt.id = d.grupo::uuid) end,
         case when p_medida in ('carga', 'carga_promedio') then round(d.valor, 3) else round(d.valor, 2) end,
         round(d.num, 2), d.den, a.avisos
  from datos d cross join aviso a
  where not (p_medida = 'dias_desde_salida' and d.valor is null)
  order by d.pini, 4 desc nulls last, 3;
end;
$$;

revoke execute on function public.tablero_potreros(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_potreros(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

commit;
