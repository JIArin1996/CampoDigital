-- Campo Digital v2 — Tablero de Indicadores, etapa 8a: medidas de fábrica para los tableros por defecto (diseño:
-- contexto/DISENO-INDICADORES-TABLERO.md, sección 9, y contexto/INDICADORES-CATALOGO.md, sección 4). Después de
-- 20261113000100.
--
--   1. tablero_combinada (misma firma): además de las medidas propias, calcula las medidas de fábrica ('fab:...'):
--      resultado por ha SPG, producción de carne y carne equivalente por ha, costo por kg producido, margen por kg
--      (precio de venta − costo por kg, 2 niveles) y gasto por UG. No se guardan en tablero_medidas: son una lista
--      fija, así la plantilla del tablero sirve para cualquier establecimiento.
--   2. guardar_tablero (misma firma): acepta tarjetas con medidas de fábrica.
-- Funciones: las mismas (la auditoría de permisos sigue en 169).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Calcular una medida propia o de fábrica
-- ════════════════════════════════════════════════════════════════════════════

-- p_medida: el id de la medida propia, o la clave de una medida de fábrica ('fab:...', lista fija de abajo).
-- Llama a A y a B (la fuente de la lista fija, o esta misma función si es otra
-- propia) con los mismos parámetros y las cruza por período y grupo:
--   * valor = A op B, redondeado a 4 decimales. Al dividir, numerador = A y denominador = B. El total de una tarjeta
--     es otra llamada con tiempo 'total' (cada fuente calcula su total como corresponde), no la suma de las filas.
--   * B del establecimiento entero (Ha SPG, ha forestadas o una constante): se llama sin abrir y en el total, y vale
--     lo mismo para todos los grupos y períodos (aviso b_total cuando está abierta y B no es una constante). Otra B
--     se abre igual que A: si su fuente no se abre por eso, da error (el constructor no lo ofrece).
--   * Sin valor: A o B sin dato en ese grupo o período, o B = 0 al dividir (avisos a_sin_datos y b_sin_datos; nunca 0
--     ni infinito).
--   * Avisos: los de A y los de B, más los propios.
-- Los filtros y opciones pasan tal cual a A y a B: cada fuente ignora los filtros que no tiene.
create or replace function public.tablero_combinada(
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
  v_id       uuid;
  v_def      jsonb;
  v_op       text;
  v_lado     text;
  v_x        jsonb;
  v_fn       text;
  v_med      text;
  v_filas    jsonb;
  v_a        jsonb;
  v_b        jsonb;
  v_b_entero boolean := false;
begin
  if p_establecimiento_id is null or not public.es_miembro(p_establecimiento_id) then
    raise exception 'Sin acceso a este establecimiento' using errcode = '42501';
  end if;
  if p_medida like 'fab:%' then
    -- Medidas de fábrica: las mismas para todos los establecimientos (la plantilla del tablero las usa). La app tiene
    -- la misma lista (catalogo.ts, FABRICA).
    v_def := case p_medida
      when 'fab:resultado_ha_spg' then '{"a": {"fuente": "economia", "medida": "resultado"}, "op": "div", "b": {"fuente": "potreros", "medida": "ha_spg"}}'::jsonb
      when 'fab:produccion_carne_ha' then '{"a": {"fuente": "produccion", "medida": "produccion_carne"}, "op": "div", "b": {"fuente": "potreros", "medida": "ha_spg"}}'::jsonb
      when 'fab:carne_equivalente_ha' then '{"a": {"fuente": "produccion", "medida": "carne_equivalente"}, "op": "div", "b": {"fuente": "potreros", "medida": "ha_spg"}}'::jsonb
      when 'fab:costo_kg' then '{"a": {"fuente": "economia", "medida": "gastos_operativos"}, "op": "div", "b": {"fuente": "produccion", "medida": "produccion_carne"}}'::jsonb
      when 'fab:margen_kg' then '{"a": {"fuente": "economia", "medida": "precio_venta"}, "op": "res", "b": {"propia": "fab:costo_kg"}}'::jsonb
      when 'fab:gasto_ug' then '{"a": {"fuente": "economia", "medida": "gastos_operativos"}, "op": "div", "b": {"fuente": "stock", "medida": "ug_promedio"}}'::jsonb
    end;
  else
    begin
      v_id := p_medida::uuid;
    exception when invalid_text_representation then
      v_id := null;
    end;
    select m.definicion into v_def
    from public.tablero_medidas m where m.id = v_id and m.establecimiento_id = p_establecimiento_id;
  end if;
  if v_def is null then
    raise exception 'Medida propia desconocida: %', p_medida using errcode = '22023';
  end if;
  v_op := v_def ->> 'op';

  foreach v_lado in array array['a', 'b'] loop
    v_x := v_def -> v_lado;
    if v_x ? 'constante' then
      v_filas := jsonb_build_array(jsonb_build_object('valor', (v_x ->> 'constante')::numeric, 'n', 1));
      v_b_entero := true;
    else
      v_fn := case when v_x ? 'propia' then 'tablero_combinada'
                   else case v_x ->> 'fuente'
                          when 'stock'         then 'tablero_stock'
                          when 'reproductivos' then 'tablero_reproductivos'
                          when 'pesadas'       then 'tablero_pesadas'
                          when 'economia'      then 'tablero_economia'
                          when 'potreros'      then 'tablero_potreros'
                          when 'produccion'    then 'tablero_produccion'
                          when 'gestion'       then 'tablero_gestion'
                        end
              end;
      if v_fn is null then
        raise exception 'Fuente desconocida en la medida propia' using errcode = '22023';
      end if;
      v_med := coalesce(v_x ->> 'propia', v_x ->> 'medida');
      if v_lado = 'b' and v_fn = 'tablero_potreros' and v_med in ('ha_spg', 'ha_forestadas') then
        v_b_entero := true;
      end if;
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t) order by t.n), ''[]''::jsonb)
         from public.%I($1, $2, $3, $4, $5, $6, $7, $8)
              with ordinality as t(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)', v_fn)
        into v_filas
        using p_establecimiento_id, v_med,
              case when v_lado = 'b' and v_b_entero then null else p_abrir_por end,
              case when v_lado = 'b' and v_b_entero then 'total' else p_tiempo end,
              p_desde, p_hasta, p_filtros, p_opciones;
    end if;
    if v_lado = 'a' then v_a := v_filas; else v_b := v_filas; end if;
  end loop;

  return query
  with
  a as (
    select e ->> 'periodo' as per, e ->> 'clave' as cla, e ->> 'etiqueta' as eti, (e ->> 'valor')::numeric as val,
           case when jsonb_typeof(e -> 'avisos') = 'object' then e -> 'avisos' end as avi, (e ->> 'n')::int as n
    from jsonb_array_elements(v_a) e
  ),
  b as (
    select e ->> 'periodo' as per, e ->> 'clave' as cla, e ->> 'etiqueta' as eti, (e ->> 'valor')::numeric as val,
           case when jsonb_typeof(e -> 'avisos') = 'object' then e -> 'avisos' end as avi, (e ->> 'n')::int as n
    from jsonb_array_elements(v_b) e
  ),
  cruce as (
    -- B que se abre como A: por período y grupo (lo que tiene una sola queda sin valor)
    select coalesce(a.per, b.per) as per, coalesce(a.cla, b.cla) as cla, coalesce(a.eti, b.eti) as eti,
           a.val as av, b.val as bv, a.avi as aa, b.avi as ba, coalesce(a.n, 1000000 + b.n) as orden
    from a full join b on coalesce(a.per, '') = coalesce(b.per, '') and coalesce(a.cla, '') = coalesce(b.cla, '')
    where not v_b_entero
    union all
    -- B del establecimiento entero: la misma en todas las filas de A
    select a.per, a.cla, a.eti, a.val, b.val, a.avi, b.avi, a.n
    from a left join b on true
    where v_b_entero
  )
  select c.per, c.cla, c.eti,
         case when c.av is null or c.bv is null or (v_op = 'div' and c.bv = 0) then null
              else round(case v_op when 'div' then c.av / c.bv
                                   when 'mul' then c.av * c.bv
                                   when 'sum' then c.av + c.bv
                                   else c.av - c.bv end, 4)
         end,
         case when v_op = 'div' then c.av end,
         case when v_op = 'div' then c.bv end,
         nullif(
           (coalesce(c.aa, '{}'::jsonb) - array['a_sin_datos', 'b_sin_datos', 'b_total'])
           || (coalesce(c.ba, '{}'::jsonb) - array['a_sin_datos', 'b_sin_datos', 'b_total'])
           || jsonb_strip_nulls(jsonb_build_object(
                'a_sin_datos', case when c.av is null then true end,
                'b_sin_datos', case when c.bv is null or (v_op = 'div' and c.bv = 0) then true end,
                'b_total',     case when v_b_entero and p_abrir_por is not null and not ((v_def -> 'b') ? 'constante') then true end)),
           '{}'::jsonb)
  from cruce c
  order by c.orden;
end;
$$;

revoke execute on function public.tablero_combinada(uuid, text, text, text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.tablero_combinada(uuid, text, text, text, date, date, jsonb, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Guardar el tablero: medidas de fábrica
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
         or coalesce(v_tarjeta -> 'definicion' ->> 'fuente', '') not in ('stock', 'reproductivos', 'pesadas', 'economia', 'potreros', 'produccion', 'gestion', 'combinada') then
        raise exception 'Una tarjeta de "%" tiene una fuente de datos desconocida', v_pagina ->> 'nombre' using errcode = '22023';
      end if;
      -- Medidas propias: tienen que existir en el establecimiento (o ser de fábrica)
      if v_tarjeta -> 'definicion' ->> 'fuente' = 'combinada' and (
           jsonb_typeof(v_tarjeta -> 'definicion' -> 'medidas') is distinct from 'array'
           or exists (select 1 from jsonb_array_elements_text(v_tarjeta -> 'definicion' -> 'medidas') x
                      where x not in ('fab:resultado_ha_spg', 'fab:produccion_carne_ha', 'fab:carne_equivalente_ha', 'fab:costo_kg', 'fab:margen_kg', 'fab:gasto_ug')
                        and not exists (select 1 from public.tablero_medidas m
                                        where m.establecimiento_id = p_establecimiento_id and m.id::text = x))) then
        raise exception 'La tarjeta "%" usa una medida propia que ya no existe', coalesce(v_tarjeta ->> 'titulo', '(sin título)')
          using errcode = '22023';
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
