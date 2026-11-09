-- Campo Digital v2 — Indicadores como tablero (etapa 1a). Diseño: contexto/DISENO-INDICADORES-TABLERO.md
--
--   1. tablero_paginas y tablero_tarjetas: el tablero de cada establecimiento (páginas con nombre y tarjetas en una
--      grilla de 12 columnas). Leen los miembros; authenticated no escribe directo: se guarda entero con
--      guardar_tablero (solo administradores), que reemplaza todas las páginas y tarjetas del establecimiento.
--   2. Funciones del tablero (con los permisos de quien consulta, así respetan el RLS):
--      tablero_stock y tablero_reproductivos devuelven los datos ya agregados; _tablero_periodos y _tablero_uuids son
--      internas.
--   3. v_indicadores_aportes: el destete encuentra la parición también en los ancestros del lote de origen (si el
--      lote de las crías se dividió o se unió antes del destete, ya no queda "sin servicio registrado").
--      Misma forma de la vista: v_indicadores_reproductivos no cambia.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tablas del tablero
-- ════════════════════════════════════════════════════════════════════════════

create table public.tablero_paginas (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> '' and char_length(nombre) <= 40),
  orden              int  not null check (orden >= 0),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  unique (establecimiento_id, orden),
  unique (id, establecimiento_id)
);

-- Una tarjeta: título, su definición (fuente, medida, cómo abrirla, gráfico, filtro propio...) y su lugar en la
-- grilla de 12 columnas (x, y, ancho w, alto h, en celdas)
create table public.tablero_tarjetas (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  pagina_id          uuid not null,
  titulo             text not null check (btrim(titulo) <> '' and char_length(titulo) <= 80),
  definicion         jsonb not null check (jsonb_typeof(definicion) = 'object'),
  x                  int  not null check (x between 0 and 11),
  y                  int  not null check (y between 0 and 500),
  w                  int  not null check (w between 1 and 12),
  h                  int  not null check (h between 1 and 20),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  check (x + w <= 12),
  foreign key (pagina_id, establecimiento_id) references public.tablero_paginas (id, establecimiento_id) on delete cascade
);

create index tablero_tarjetas_pagina_idx on public.tablero_tarjetas (pagina_id);

alter table public.tablero_paginas  enable row level security;
alter table public.tablero_tarjetas enable row level security;

create policy tablero_paginas_select  on public.tablero_paginas  for select to authenticated using (public.es_miembro(establecimiento_id));
create policy tablero_tarjetas_select on public.tablero_tarjetas for select to authenticated using (public.es_miembro(establecimiento_id));

revoke all on public.tablero_paginas, public.tablero_tarjetas from anon, authenticated;
grant select on public.tablero_paginas, public.tablero_tarjetas to authenticated;

-- Guarda el tablero entero de un establecimiento (solo administradores): reemplaza todas sus páginas y tarjetas.
-- p_paginas: [{"nombre": "Resumen", "tarjetas": [{"titulo", "definicion": {"fuente": ...}, "x", "y", "w", "h"}]}],
-- en el orden de las pestañas. Una lista vacía borra el tablero (la app vuelve a mostrar la plantilla).
create function public.guardar_tablero(p_establecimiento_id uuid, p_paginas jsonb) returns void
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
         or coalesce(v_tarjeta -> 'definicion' ->> 'fuente', '') not in ('stock', 'reproductivos', 'pesadas', 'economia', 'potreros') then
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

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Funciones de datos del tablero
-- ════════════════════════════════════════════════════════════════════════════

-- Ids de un filtro: p_filtros -> p_clave es una lista de uuid. Sin la clave, null o lista vacía: sin filtro (null).
create function public._tablero_uuids(p_filtros jsonb, p_clave text) returns uuid[]
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_filtros is null or jsonb_typeof(p_filtros -> p_clave) is null or jsonb_typeof(p_filtros -> p_clave) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_filtros -> p_clave) <> 'array' then
    raise exception 'El filtro % tiene que ser una lista', p_clave using errcode = '22023';
  end if;
  if jsonb_array_length(p_filtros -> p_clave) = 0 then
    return null;
  end if;
  return array(select x::uuid from jsonb_array_elements_text(p_filtros -> p_clave) x);
exception when invalid_text_representation then
  raise exception 'El filtro % tiene ids inválidos', p_clave using errcode = '22023';
end;
$$;

-- Períodos entre dos fechas: 'total' (uno, desde-hasta), 'mes' (meses calendario) o 'ejercicio' (julio a junio).
-- Los de las puntas se recortan a desde y hasta. periodo: null, '2025-10' o '2025/26'.
create function public._tablero_periodos(p_tiempo text, p_desde date, p_hasta date)
returns table (periodo text, inicio date, fin date)
language sql
immutable
set search_path = ''
as $$
  select null::text, p_desde, p_hasta
  where p_tiempo = 'total'
  union all
  select to_char(m, 'YYYY-MM'), greatest(m::date, p_desde), least((m + interval '1 month' - interval '1 day')::date, p_hasta)
  from generate_series(date_trunc('month', p_desde::timestamp), p_hasta::timestamp, interval '1 month') m
  where p_tiempo = 'mes'
  union all
  select e || '/' || right((e + 1)::text, 2), greatest(make_date(e, 7, 1), p_desde), least(make_date(e + 1, 6, 30), p_hasta)
  from generate_series(extract(year from p_desde)::int - case when extract(month from p_desde) < 7 then 1 else 0 end,
                       extract(year from p_hasta)::int - case when extract(month from p_hasta) < 7 then 1 else 0 end) e
  where p_tiempo = 'ejercicio';
$$;

revoke execute on function public._tablero_uuids(jsonb, text) from public, anon, authenticated;
revoke execute on function public._tablero_periodos(text, date, date) from public, anon, authenticated;

-- Stock, desde los eventos de los lotes (como stock_al). Medidas:
--   'stock'         stock al cierre de cada período (semi-aditivo: al último día, nunca la suma de los meses)
--   'movimientos'   Σ de los eventos de cada período; abierto por 'motivo', cada tipo con su sentido
--                   ("compra+", "venta-", "union+" y "union-"...)
--   'mortandad_pct' muertes del período / (stock al inicio + pariciones + compras del período), en %
--                   (numerador y denominador aparte); tiempo 'total' o 'ejercicio'
-- Abrir por: null, 'especie', 'categoria', 'lote' o 'motivo' (solo movimientos). Filtros: especie_ids,
-- categoria_ids, lote_ids. Sin abrir hay una fila por período (0 si no hay nada); abierto, solo los grupos con datos
-- (en stock, los que no quedaron en 0).
create function public.tablero_stock(
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
  v_esp := public._tablero_uuids(p_filtros, 'especie_ids');
  v_cat := public._tablero_uuids(p_filtros, 'categoria_ids');
  v_lot := public._tablero_uuids(p_filtros, 'lote_ids');

  return query
  with
  per as (select * from public._tablero_periodos(p_tiempo, p_desde, p_hasta)),
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
create function public.tablero_reproductivos(
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
  v_esp := public._tablero_uuids(p_filtros, 'especie_ids');
  v_lot := public._tablero_uuids(p_filtros, 'lote_ids');

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

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Destete: la parición también en los ancestros del lote de origen
-- ════════════════════════════════════════════════════════════════════════════
-- Antes, lo que salía de un origen iba a la temporada de las pariciones con crías en ESE lote. Si el lote de las
-- crías se dividió o se unió antes del destete, las crías destetadas salían de un lote nuevo, sin pariciones, y
-- quedaban "sin servicio registrado". Ahora cuentan también las pariciones de sus ancestros (linaje_lote) anteriores
-- a la apertura del lote, y el "último destete" se busca en el lote y en esos ancestros.

create or replace view public.v_indicadores_aportes
with (security_invoker = true) as
with
servicios as (
  select a.id, a.establecimiento_id, a.lote_id, a.fecha, l.especie_id, s.vacas_entoradas,
         (extract(year from a.fecha)::int - case when extract(month from a.fecha) < 7 then 1 else 0 end) as temporada,
         row_number() over (
           partition by a.lote_id, (extract(year from a.fecha)::int - case when extract(month from a.fecha) < 7 then 1 else 0 end)
           order by s.vacas_entoradas desc, a.fecha, a.created_at
         ) = 1 as cuenta
  from public.actividades a
  join public.act_servicio s on s.actividad_id = a.id
  join public.lotes l on l.id = a.lote_id
  where a.tipo = 'servicio' and a.anulada_en is null
),
diagnosticos as (
  select a.id, a.establecimiento_id, a.lote_id, a.fecha, a.created_at, l.especie_id,
         d.vacas_diagnosticadas, d.vacas_prenadas, sv.temporada
  from public.actividades a
  join public.act_diagnostico d on d.actividad_id = a.id
  join public.lotes l on l.id = a.lote_id
  left join lateral (
    select x.temporada from servicios x
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
         sv.temporada
  from public.actividades a
  join public.act_paricion p on p.actividad_id = a.id
  join public.lotes l on l.id = a.lote_id
  left join lateral (
    select x.temporada from servicios x
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
         t.temporada, coalesce(t.mixto, false) as mixto
  from public.actividades a
  join public.actividad_lotes al on al.actividad_id = a.id and al.rol = 'origen'
  join public.lotes l on l.id = al.lote_id
  left join lateral (
    select (array_agg(pp.temporada order by pp.fecha))[1] as temporada,
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
       0 as nacidas_vivas, 0 as nacidas_muertas, 0 as destetadas, false as mixto
from servicios s
union all
select d.establecimiento_id, d.especie_id, d.temporada, 'diagnostico_gestacion', d.id, d.fecha, d.lote_id,
       row_number() over (partition by d.lote_id, d.temporada order by d.fecha desc, d.created_at desc) = 1,
       0, d.vacas_diagnosticadas, d.vacas_prenadas, 0, 0, 0, false
from diagnosticos d
union all
select p.establecimiento_id, p.especie_id, p.temporada, 'paricion', p.id, p.fecha, p.lote_id,
       true, 0, 0, 0, p.vivas, p.nacidos_muertos, 0, false
from pariciones p
union all
select t.establecimiento_id, t.especie_id, t.temporada, 'destete', t.id, t.fecha, t.lote_id,
       true, 0, 0, 0, 0, 0, t.destetadas, t.mixto
from destetes t;

commit;
