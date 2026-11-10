-- Campo Digital v2 — Tablero de Indicadores, etapa 6d: fuente Gestión (diseño: contexto/DISENO-INDICADORES-TABLERO.md,
-- sección 4 "Medidas nuevas" y sección 10). Después de 20261112000500.
--
--   1. tablero_gestion (nueva, misma forma que las otras fuentes): tareas vencidas y próximas, lotes y cabezas con
--      carencia y próximas dosis, a la fecha de cierre del período.
--   2. guardar_tablero (misma firma): acepta tarjetas de la fuente 'gestion'.
-- Funciones: +1 (la auditoría de permisos pasa a 166).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Gestión
-- ════════════════════════════════════════════════════════════════════════════

-- Todo a la fecha de cierre (p_hasta, "el cierre"); tiempo 'total'. Medidas:
--   'tareas_vencidas'  tareas pendientes al cierre con vencimiento anterior al cierre
--   'tareas_proximas'  tareas pendientes al cierre que vencen entre el cierre y 15 días después
--                      Pendiente al cierre: cargada hasta ese día y no realizada (o realizada después).
--   'lotes_carencia'   lotes con animales al cierre y una carencia que todavía no terminó (v_carencias: fin de la
--                      carencia posterior al cierre); numerador: sus cabezas
--   'cab_carencia'     las cabezas de esos lotes
--   'proximas_dosis'   próximas dosis de sanidad entre el cierre y 15 días después, no dadas al cierre
-- Abrir por: 'lote' (una tarea con varios lotes cuenta en cada uno; sin lote: "Sin lote"). Filtros: especie_ids y
-- lote_ids (por los lotes; lo que no tiene lote queda afuera del filtro).
create function public.tablero_gestion(
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
  if p_medida is null or p_medida not in ('tareas_vencidas', 'tareas_proximas', 'lotes_carencia', 'cab_carencia', 'proximas_dosis') then
    raise exception 'Medida de gestión desconocida: %', p_medida using errcode = '22023';
  end if;
  if p_tiempo is null or p_tiempo <> 'total' then
    raise exception 'Tiempo inválido para %: % (es a la fecha de cierre)', p_medida, p_tiempo using errcode = '22023';
  end if;
  if p_abrir_por is not null and p_abrir_por <> 'lote' then
    raise exception 'No se puede abrir % por %', p_medida, p_abrir_por using errcode = '22023';
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
    v_lot := case when jsonb_typeof(p_filtros -> 'lote_ids') = 'array' and jsonb_array_length(p_filtros -> 'lote_ids') > 0
                  then array(select x::uuid from jsonb_array_elements_text(p_filtros -> 'lote_ids') x) end;
  exception when invalid_text_representation then
    raise exception 'Hay ids inválidos en los filtros' using errcode = '22023';
  end;

  return query
  with
  -- Cada cosa que se cuenta (id) con su lote (null si no tiene)
  items as (
    -- Tareas pendientes al cierre
    select e.id, bl.lote_id
    from public.bitacora_entradas e
    left join public.bitacora_lotes bl on bl.entrada_id = e.id
    where p_medida in ('tareas_vencidas', 'tareas_proximas')
      and e.establecimiento_id = p_establecimiento_id and e.tipo = 'tarea' and e.anulada_en is null
      and e.fecha <= p_hasta
      and (e.estado_tarea = 'pendiente'
           or (e.estado_tarea = 'realizada' and (e.completada_en at time zone 'America/Montevideo')::date > p_hasta))
      and case p_medida when 'tareas_vencidas' then e.vencimiento < p_hasta
                        else e.vencimiento between p_hasta and p_hasta + 15 end
    union all
    -- Próximas dosis no dadas al cierre
    select p.id, al.lote_id
    from public.act_sanidad_productos p
    join public.actividades a on a.id = p.actividad_id
    left join public.actividad_lotes al on al.actividad_id = a.id and al.rol = 'principal'
    left join public.sanidad_dosis_dadas dd on dd.producto_id = p.id
    where p_medida = 'proximas_dosis'
      and a.establecimiento_id = p_establecimiento_id and a.anulada_en is null and a.fecha <= p_hasta
      and p.fecha_proxima_dosis between p_hasta and p_hasta + 15
      and not coalesce(dd.deshecha_en is null and (dd.dada_en at time zone 'America/Montevideo')::date <= p_hasta, false)
    union all
    -- Lotes con una carencia que no terminó al cierre
    select c.lote_id, c.lote_id
    from public.v_carencias c
    where p_medida in ('lotes_carencia', 'cab_carencia')
      and c.establecimiento_id = p_establecimiento_id and c.fecha <= p_hasta and c.fin_carencia > p_hasta
  ),
  -- Stock de cada lote al cierre
  stock as (
    select e.lote_id, sum(e.cabezas)::numeric as cab
    from public.lote_eventos e
    where e.establecimiento_id = p_establecimiento_id and e.fecha <= p_hasta
      and p_medida in ('lotes_carencia', 'cab_carencia')
    group by e.lote_id
  ),
  filtrados as (
    select distinct i.id, i.lote_id, s.cab,
           case when p_abrir_por = 'lote' then coalesce(i.lote_id::text, 'sin') end as grupo
    from items i
    left join public.lotes l on l.id = i.lote_id
    left join stock s on s.lote_id = i.lote_id
    where (v_esp is null or l.especie_id = any (v_esp))
      and (v_lot is null or i.lote_id = any (v_lot))
      -- Carencias: solo lotes con animales al cierre
      and (p_medida not in ('lotes_carencia', 'cab_carencia') or coalesce(s.cab, 0) > 0)
  ),
  datos as (
    select f.grupo, count(distinct f.id)::numeric as n,
           -- Cabezas: una vez por lote
           (select coalesce(sum(x.cab), 0) from (select distinct g.lote_id, g.cab from filtrados g
                                                 where g.grupo is not distinct from f.grupo) x) as cab
    from filtrados f
    group by f.grupo
  ),
  todo as (
    select d.grupo, d.n, d.cab from datos d
    union all
    -- Sin abrir y sin nada que contar: una fila en 0
    select null, 0, 0 where p_abrir_por is null and not exists (select 1 from datos)
  )
  select null::text, t.grupo,
         case when t.grupo is null then null when t.grupo = 'sin' then 'Sin lote'
              else (select l.nombre from public.lotes l where l.id = t.grupo::uuid) end,
         case when p_medida = 'cab_carencia' then t.cab else t.n end,
         case when p_medida = 'lotes_carencia' then t.cab end,
         null::numeric, null::jsonb
  from todo t
  order by 4 desc nulls last, 3;
end;
$$;

revoke execute on function public.tablero_gestion(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_gestion(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

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
         or coalesce(v_tarjeta -> 'definicion' ->> 'fuente', '') not in ('stock', 'reproductivos', 'pesadas', 'economia', 'potreros', 'produccion', 'gestion') then
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
