-- Campo Digital v2 — Tablero de Indicadores, etapa 6b: fuente Producción (diseño: contexto/DISENO-INDICADORES-TABLERO.md,
-- sección 4 "Medidas nuevas" y "Kg en stock", sección 10). Después de 20261112000100.
--
--   1. tablero_produccion (nueva, misma forma que las otras fuentes): kg en stock, producción de carne por
--      inventario, kg vendidos y comprados, peso promedio de venta, lana (total y por animal) y carne equivalente.
--   2. guardar_tablero (misma firma): acepta tarjetas de la fuente 'produccion'.
-- Funciones: +1 (la auditoría de permisos pasa a 165).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Producción
-- ════════════════════════════════════════════════════════════════════════════

-- Medidas:
--   'kg_stock'          kg en stock al cierre de cada período (semi-aditivo). Cada lote y categoría con animales se
--                       valúa con la pesada más cercana a la fecha, a 60 días o menos (si empatan, la anterior):
--                       * la anterior, del lote o de sus ancestros (si hay varias ese día, ponderadas por cabezas);
--                       * la posterior, solo del mismo lote y si entre la fecha y la pesada no hubo división, unión,
--                         compra, venta, destete, parición, ajuste, consumo ni recategorización de esa categoría (un
--                         evento el día de la pesada no corta si la pesada tiene las cabezas de la fecha), ni una
--                         parición del lote.
--                       Sin pesada que sirva: peso de referencia de la categoría (aviso cab_con_peso_referencia); sin
--                       referencia, no suma (aviso cab_sin_peso).
--   'produccion_carne'  kg en stock al cierre − kg en stock al inicio (el día anterior) + kg vendidos + kg de consumo
--                       − kg comprados − kg de las altas iniciales del período (valuadas a su fecha, como el stock).
--                       Ventas, compras y consumos sin kg se valúan con el peso de referencia (avisos
--                       cab_vendidas_sin_kg, cab_compradas_sin_kg, cab_consumidas_sin_kg). La mortandad no entra.
--   'kg_vendidos', 'kg_comprados'  Σ peso vivo de las líneas (las que no tienen kg no suman: aviso de cabezas sin kg)
--   'peso_venta'        kg vendidos / cabezas vendidas con kg (numerador: kg; denominador: cabezas)
--   'lana'              Σ kg de lana de las esquilas del período; una esquila de varios lotes se reparte por las
--                       cabezas de cada uno ese día
--   'lana_por_animal'   lana / cabezas esquiladas (el stock de los lotes esquilados ese día)
--   'carne_equivalente' producción de carne de las especies vacunas y ovinas + lana × factor (opción factor_lana,
--                       2,48 por defecto)
-- Tiempo: 'total', 'mes' o 'ejercicio' (producción, carne equivalente y lana: sin 'mes'). Abrir por: 'especie',
-- 'categoria' o 'lote' (producción y carne equivalente: solo especie, porque los kg pasan de un lote o categoría a
-- otro; lana: especie o lote). Filtros: especie_ids, categoria_ids, lote_ids (producción y carne equivalente: solo
-- especie; lana: especie y lote). Los avisos son los del último período.
create function public.tablero_produccion(
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
  v_factor numeric;
  v_inv    boolean;   -- método de inventario (producción y carne equivalente)
begin
  if p_establecimiento_id is null or not public.es_miembro(p_establecimiento_id) then
    raise exception 'Sin acceso a este establecimiento' using errcode = '42501';
  end if;
  if p_medida is null or p_medida not in ('kg_stock', 'produccion_carne', 'kg_vendidos', 'kg_comprados', 'peso_venta',
                                          'lana', 'lana_por_animal', 'carne_equivalente') then
    raise exception 'Medida de producción desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo not in ('total', 'mes', 'ejercicio')
     or (p_tiempo = 'mes' and p_medida in ('produccion_carne', 'carne_equivalente', 'lana', 'lana_por_animal')) then
    raise exception 'Tiempo inválido para %: %', p_medida, p_tiempo using errcode = '22023';
  end if;
  if p_abrir_por is not null and (p_abrir_por not in ('especie', 'categoria', 'lote')
                                  or (p_medida in ('produccion_carne', 'carne_equivalente') and p_abrir_por <> 'especie')
                                  or (p_medida in ('lana', 'lana_por_animal') and p_abrir_por = 'categoria')) then
    raise exception 'No se puede abrir % por %', p_medida, p_abrir_por using errcode = '22023';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 7320 then
    raise exception 'Período inválido (desde hasta hasta, 20 años como mucho)' using errcode = '22023';
  end if;
  begin
    v_factor := coalesce((p_opciones ->> 'factor_lana')::numeric, 2.48);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'factor_lana tiene que ser un número' using errcode = '22023';
  end;
  if v_factor < 0 or v_factor > 10 then
    raise exception 'factor_lana tiene que estar entre 0 y 10' using errcode = '22023';
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
  v_inv := p_medida in ('produccion_carne', 'carne_equivalente');
  -- Filtros que no aplican (la app los marca)
  if v_inv then
    v_cat := null;
    v_lot := null;
  elsif p_medida in ('lana', 'lana_por_animal') then
    v_cat := null;
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
  ultimo as (select max(inicio) as pini from per),
  -- Pesadas con peso: una fila por pesada y categoría
  pes as (
    select a.lote_id, a.fecha, max(a.created_at) as creada, li.categoria_id as cat,
           sum(li.cabezas)::numeric as cab, sum(li.peso_vivo_total_kg)::numeric as peso
    from public.actividades a
    join public.actividad_lineas li on li.actividad_id = a.id and li.peso_vivo_total_kg is not null
    where a.establecimiento_id = p_establecimiento_id
      and a.tipo = 'pesada' and a.anulada_en is null
      and a.fecha <= p_hasta + 60
      and p_medida in ('kg_stock', 'produccion_carne', 'carne_equivalente')
    group by a.id, a.lote_id, a.fecha, li.categoria_id
  ),
  -- Fechas en que se valúa el stock: el cierre de cada período y, en producción, el día anterior al inicio
  fechas as (
    select p.periodo, p.inicio as pini, 'fin'::text as tag, p.fin as fecha
    from per p
    where p_medida = 'kg_stock' or v_inv
    union all
    select p.periodo, p.inicio, 'ini', p.inicio - 1
    from per p
    where v_inv
  ),
  -- Puntos a valuar: lote y categoría con animales en cada fecha, y las altas iniciales del período (producción)
  pts as (
    select f.periodo, f.pini, f.tag, f.fecha, e.lote_id, e.especie_id, e.categoria_id as cat, sum(e.cabezas)::numeric as cab
    from fechas f
    join public.lote_eventos e on e.establecimiento_id = p_establecimiento_id and e.fecha <= f.fecha
    where (v_esp is null or e.especie_id   = any (v_esp))
      and (v_cat is null or e.categoria_id = any (v_cat))
      and (v_lot is null or e.lote_id      = any (v_lot))
    group by f.periodo, f.pini, f.tag, f.fecha, e.lote_id, e.especie_id, e.categoria_id
    having sum(e.cabezas) > 0
    union all
    select p.periodo, p.inicio, 'alta', e.fecha, e.lote_id, e.especie_id, e.categoria_id, sum(e.cabezas)::numeric
    from per p
    join public.lote_eventos e on e.establecimiento_id = p_establecimiento_id and e.tipo = 'alta_inicial'
                              and e.fecha between p.inicio and p.fin
    where v_inv
      and (v_esp is null or e.especie_id = any (v_esp))
    group by p.periodo, p.inicio, e.fecha, e.lote_id, e.especie_id, e.categoria_id
    having sum(e.cabezas) > 0
  ),
  val as (
    select t.*, c.peso_referencia_kg as ref, s.grupo,
           case when an.fecha is not null and (po.fecha is null or t.fecha - an.fecha <= po.fecha - t.fecha) then an.prom
                when po.fecha is not null then po.prom end as prom
    from pts t
    join public.categorias_animales c on c.id = t.cat
    join public.especies s on s.id = t.especie_id
    -- La anterior (60 días o menos), del lote o de sus ancestros; varias el mismo día, ponderadas por cabezas
    left join lateral (
      select x.fecha, sum(x.peso) / nullif(sum(x.cab), 0) as prom
      from pes x
      where x.cat = t.cat and x.fecha <= t.fecha and x.fecha >= t.fecha - 60
        and (x.lote_id = t.lote_id
             or x.lote_id in (select la.lote_id from public.linaje_lote(t.lote_id) la where la.relacion = 'ancestro'))
      group by x.fecha
      order by x.fecha desc
      limit 1
    ) an on true
    -- La posterior (60 días o menos), del mismo lote, si nada cambió quién está en el medio
    left join lateral (
      select x.fecha, x.peso / nullif(x.cab, 0) as prom
      from pes x
      where x.lote_id = t.lote_id and x.cat = t.cat and x.fecha > t.fecha and x.fecha <= t.fecha + 60
        and not exists (
          select 1 from public.lote_eventos e
          where e.lote_id = t.lote_id and e.categoria_id = t.cat
            and e.tipo in ('division', 'union', 'compra', 'venta', 'destete', 'paricion', 'ajuste', 'consumo', 'recategorizacion')
            and e.fecha > t.fecha
            and (e.fecha < x.fecha or (e.fecha = x.fecha and x.cab <> t.cab)))
        and not exists (
          select 1 from public.actividades a
          where a.lote_id = t.lote_id and a.tipo = 'paricion' and a.anulada_en is null
            and a.fecha > t.fecha and a.fecha <= x.fecha)
      order by x.fecha, x.creada
      limit 1
    ) po on true
    where p_medida <> 'carne_equivalente' or s.grupo in ('bovino', 'ovino')
  ),
  kgp as (
    select v.*,
           case when v.prom is not null then v.cab * v.prom when v.ref is not null then v.cab * v.ref end as kg,
           v.prom is null and v.ref is not null as con_ref,
           v.prom is null and v.ref is null     as sin_peso
    from val v
  ),
  -- Ventas, compras y consumos del período (cabezas en positivo), con los kg de su línea
  mov as (
    select p.periodo, p.inicio as pini, e.tipo, e.lote_id, e.especie_id, e.categoria_id as cat,
           abs(e.cabezas)::numeric as cab, li.peso_vivo_total_kg::numeric as kg, c.peso_referencia_kg as ref
    from per p
    join public.lote_eventos e on e.establecimiento_id = p_establecimiento_id and e.fecha between p.inicio and p.fin
    join public.categorias_animales c on c.id = e.categoria_id
    join public.especies s on s.id = e.especie_id
    left join public.actividad_lineas li on li.actividad_id = e.actividad_id and li.categoria_id = e.categoria_id
    where e.tipo in ('venta', 'compra', 'consumo')
      and p_medida in ('produccion_carne', 'kg_vendidos', 'kg_comprados', 'peso_venta', 'carne_equivalente')
      and (p_medida <> 'carne_equivalente' or s.grupo in ('bovino', 'ovino'))
      and (v_esp is null or e.especie_id   = any (v_esp))
      and (v_cat is null or e.categoria_id = any (v_cat))
      and (v_lot is null or e.lote_id      = any (v_lot))
  ),
  -- Esquilas del período: los kg de cada una repartidos entre sus lotes por las cabezas de ese día
  esq0 as (
    select p.periodo, p.inicio as pini, al.lote_id, l.especie_id, sc.cab,
           x.kg_lana_total * coalesce(sc.cab / nullif(sum(sc.cab) over (partition by p.inicio, a.id), 0),
                                      1.0 / count(*) over (partition by p.inicio, a.id)) as kg
    from per p
    join public.actividades a on a.establecimiento_id = p_establecimiento_id and a.tipo = 'esquila'
                             and a.anulada_en is null and a.fecha between p.inicio and p.fin
    join public.act_esquila x on x.actividad_id = a.id
    join (select distinct z.actividad_id, z.lote_id from public.actividad_lotes z) al on al.actividad_id = a.id
    join public.lotes l on l.id = al.lote_id
    left join lateral (
      select greatest(coalesce(sum(e.cabezas), 0), 0)::numeric as cab
      from public.lote_eventos e where e.lote_id = al.lote_id and e.fecha <= a.fecha
    ) sc on true
    where p_medida in ('lana', 'lana_por_animal', 'carne_equivalente')
  ),
  esq as (
    select q.* from esq0 q
    where (v_esp is null or q.especie_id = any (v_esp))
      and (v_lot is null or q.lote_id    = any (v_lot))
  ),
  -- Aportes, cada uno con su grupo
  ap as (
    select k.periodo, k.pini,
           case p_abrir_por when 'especie' then k.especie_id::text when 'categoria' then k.cat::text when 'lote' then k.lote_id::text end as grupo,
           case k.tag when 'fin' then coalesce(k.kg, 0) when 'ini' then -coalesce(k.kg, 0) else -coalesce(k.kg, 0) end as kg_inv,
           case when k.tag = 'fin' then coalesce(k.kg, 0) else 0 end as kg_fin,
           0::numeric as kg_mov, 0::numeric as cab_mov, 0::numeric as lana, 0::numeric as cab_esq
    from kgp k
    union all
    select m.periodo, m.pini,
           case p_abrir_por when 'especie' then m.especie_id::text when 'categoria' then m.cat::text when 'lote' then m.lote_id::text end,
           -- En producción: + vendidos y consumidos, − comprados (sin kg, con la referencia)
           case m.tipo when 'compra' then -1 else 1 end * coalesce(m.kg, m.cab * m.ref, 0),
           0,
           case when (p_medida in ('kg_vendidos', 'peso_venta') and m.tipo = 'venta') or (p_medida = 'kg_comprados' and m.tipo = 'compra')
                then coalesce(m.kg, 0) else 0 end,
           case when p_medida = 'peso_venta' and m.tipo = 'venta' and m.kg is not null then m.cab else 0 end,
           0, 0
    from mov m
    union all
    select q.periodo, q.pini,
           case p_abrir_por when 'especie' then q.especie_id::text when 'lote' then q.lote_id::text end,
           0, 0, 0, 0, q.kg, q.cab
    from esq q
  ),
  datos as (
    select p.periodo, p.inicio as pini, a.grupo,
           coalesce(sum(a.kg_inv), 0) as kg_inv, coalesce(sum(a.kg_fin), 0) as kg_fin,
           coalesce(sum(a.kg_mov), 0) as kg_mov, coalesce(sum(a.cab_mov), 0) as cab_mov,
           coalesce(sum(a.lana), 0) as lana, coalesce(sum(a.cab_esq), 0) as cab_esq,
           count(a.pini) as n
    from per p
    left join ap a on a.pini = p.inicio
    group by p.periodo, p.inicio, a.grupo
  ),
  calc as (
    select d.*,
           case p_medida
             when 'kg_stock'          then round(d.kg_fin, 1)
             when 'produccion_carne'  then round(d.kg_inv, 1)
             when 'carne_equivalente' then round(d.kg_inv + d.lana * v_factor, 1)
             when 'kg_vendidos'       then round(d.kg_mov, 1)
             when 'kg_comprados'      then round(d.kg_mov, 1)
             when 'peso_venta'        then round(d.kg_mov / nullif(d.cab_mov, 0), 1)
             when 'lana'              then round(d.lana, 1)
             when 'lana_por_animal'   then round(d.lana / nullif(d.cab_esq, 0), 2)
           end as resultado,
           case p_medida when 'peso_venta' then round(d.kg_mov, 1) when 'lana_por_animal' then round(d.lana, 1) end as num,
           case p_medida when 'peso_venta' then d.cab_mov when 'lana_por_animal' then d.cab_esq end as den
    from datos d
  ),
  -- Avisos del último período. Las cabezas valuadas con referencia o sin peso, una vez por lote y categoría (en
  -- producción, la mayor entre el inicio, el cierre y el alta)
  av as (
    select nullif(jsonb_strip_nulls(jsonb_build_object(
             'cab_con_peso_referencia', (select nullif(sum(x.cab), 0) from (select max(k.cab) as cab from kgp k, ultimo u
                                          where k.pini = u.pini and k.con_ref group by k.lote_id, k.cat) x),
             'cab_sin_peso',            (select nullif(sum(x.cab), 0) from (select max(k.cab) as cab from kgp k, ultimo u
                                          where k.pini = u.pini and k.sin_peso group by k.lote_id, k.cat) x),
             'cab_vendidas_sin_kg',     (select nullif(sum(m.cab), 0) from mov m, ultimo u where m.pini = u.pini and m.kg is null
                                           and m.tipo = 'venta' and p_medida <> 'kg_comprados'),
             'cab_compradas_sin_kg',    (select nullif(sum(m.cab), 0) from mov m, ultimo u where m.pini = u.pini and m.kg is null
                                           and m.tipo = 'compra' and p_medida not in ('kg_vendidos', 'peso_venta')),
             'cab_consumidas_sin_kg',   (select nullif(sum(m.cab), 0) from mov m, ultimo u where m.pini = u.pini and m.kg is null
                                           and m.tipo = 'consumo' and v_inv)
           )), '{}'::jsonb) as avisos
  )
  select d.periodo, d.grupo,
         case p_abrir_por
           when 'especie'   then (select s.nombre from public.especies s where s.id = d.grupo::uuid)
           when 'categoria' then (select c.nombre from public.categorias_animales c where c.id = d.grupo::uuid)
           when 'lote'      then (select l.nombre from public.lotes l where l.id = d.grupo::uuid)
         end,
         d.resultado, d.num, d.den, av.avisos
  from calc d cross join av
  where p_abrir_por is null
     or (d.grupo is not null and d.n > 0 and d.resultado is not null
         and not (p_medida in ('kg_stock', 'kg_vendidos', 'kg_comprados', 'lana') and d.resultado = 0))
  order by d.pini, 4 desc nulls last, 3;
end;
$$;

revoke execute on function public.tablero_produccion(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_produccion(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Guardar el tablero: la fuente nueva
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.guardar_tablero(p_establecimiento_id uuid, p_paginas jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagina  jsonb;
  v_tarjeta jsonb;
  v_orden   int := 0;
  v_id      uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador modifica el tablero' using errcode = '42501';
  end if;
  -- Bloquea el establecimiento: dos guardados a la vez quedan uno después del otro
  perform 1 from public.establecimientos where id = p_establecimiento_id for update;
  if not found then
    raise exception 'Establecimiento inexistente' using errcode = '22023';
  end if;
  if p_paginas is null or jsonb_typeof(p_paginas) <> 'array' then
    raise exception 'Las páginas tienen que ser una lista' using errcode = '22023';
  end if;
  if jsonb_array_length(p_paginas) > 20 then
    raise exception 'El tablero tiene como mucho 20 páginas' using errcode = '22023';
  end if;

  delete from public.tablero_paginas where establecimiento_id = p_establecimiento_id;   -- y sus tarjetas

  for v_pagina in select value from jsonb_array_elements(p_paginas) with ordinality order by ordinality loop
    if jsonb_typeof(v_pagina) <> 'object' or coalesce(btrim(v_pagina ->> 'nombre'), '') = '' then
      raise exception 'Cada página necesita un nombre' using errcode = '22023';
    end if;
    if jsonb_typeof(coalesce(v_pagina -> 'tarjetas', '[]'::jsonb)) <> 'array' then
      raise exception 'Las tarjetas de "%" tienen que ser una lista', v_pagina ->> 'nombre' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(v_pagina -> 'tarjetas', '[]'::jsonb)) > 40 then
      raise exception 'La página "%" tiene más de 40 tarjetas', v_pagina ->> 'nombre' using errcode = '22023';
    end if;

    begin
      insert into public.tablero_paginas (establecimiento_id, nombre, orden)
      values (p_establecimiento_id, btrim(v_pagina ->> 'nombre'), v_orden)
      returning id into v_id;
    exception when check_violation then
      raise exception 'El nombre de la página "%" es demasiado largo (40 letras como mucho)', v_pagina ->> 'nombre' using errcode = '22023';
    end;

    for v_tarjeta in select value from jsonb_array_elements(coalesce(v_pagina -> 'tarjetas', '[]'::jsonb)) loop
      if jsonb_typeof(v_tarjeta) <> 'object' or jsonb_typeof(v_tarjeta -> 'definicion') is distinct from 'object'
         or coalesce(v_tarjeta -> 'definicion' ->> 'fuente', '') not in ('stock', 'reproductivos', 'pesadas', 'economia', 'potreros', 'produccion') then
        raise exception 'Una tarjeta de "%" tiene una fuente de datos desconocida', v_pagina ->> 'nombre' using errcode = '22023';
      end if;
      begin
        insert into public.tablero_tarjetas (establecimiento_id, pagina_id, titulo, definicion, x, y, w, h)
        values (p_establecimiento_id, v_id, btrim(v_tarjeta ->> 'titulo'), v_tarjeta -> 'definicion',
                (v_tarjeta ->> 'x')::int, (v_tarjeta ->> 'y')::int, (v_tarjeta ->> 'w')::int, (v_tarjeta ->> 'h')::int);
      exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
        raise exception 'La tarjeta "%" tiene un título, una posición o un tamaño inválidos', coalesce(v_tarjeta ->> 'titulo', '(sin título)')
          using errcode = '22023';
      end;
    end loop;

    v_orden := v_orden + 1;
  end loop;
end;
$$;

revoke execute on function public.guardar_tablero(uuid, jsonb) from public, anon;
grant  execute on function public.guardar_tablero(uuid, jsonb) to authenticated;

commit;
