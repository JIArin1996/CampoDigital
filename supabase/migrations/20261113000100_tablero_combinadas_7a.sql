-- Campo Digital v2 — Tablero de Indicadores, etapa 7a: medidas combinadas (diseño: contexto/DISENO-INDICADORES-TABLERO.md,
-- sección 11). Después de 20261112000600.
--
--   1. tablero_medidas: las medidas propias de cada establecimiento (A op B). Leen los miembros; se escriben solo con
--      guardar_medida y eliminar_medida (administradores).
--   2. guardar_medida (nueva): crea o cambia una medida propia y valida su definición (fuentes y medidas de la lista
--      fija, constantes numéricas, sin ciclos y hasta 2 niveles).
--   3. eliminar_medida (nueva): borra una medida propia que no use ninguna tarjeta ni otra medida.
--   4. tablero_combinada (nueva, misma forma que las fuentes): calcula A op B con los mismos parámetros.
--   5. guardar_tablero (misma firma): acepta tarjetas de la fuente 'combinada' con medidas propias que existan.
-- Funciones: +3 (la auditoría de permisos pasa a 169).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Medidas propias
-- ════════════════════════════════════════════════════════════════════════════

-- definicion: {"a": {"fuente": "economia", "medida": "gastos_operativos"} | {"propia": "<id>"},
--              "op": "div" | "mul" | "sum" | "res",
--              "b": {"fuente", "medida"} | {"propia": "<id>"} | {"constante": 85}}
-- mejor: "sube" o "baja" (el color de la comparación con el año anterior); null, sin color.
create table public.tablero_medidas (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> '' and char_length(nombre) <= 60),
  unidad             text check (unidad is null or (btrim(unidad) <> '' and char_length(unidad) <= 20)),
  mejor              text check (mejor in ('sube', 'baja')),
  definicion         jsonb not null check (jsonb_typeof(definicion) = 'object'),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index tablero_medidas_nombre_idx on public.tablero_medidas (establecimiento_id, lower(btrim(nombre)));

alter table public.tablero_medidas enable row level security;
create policy tablero_medidas_select on public.tablero_medidas for select to authenticated using (public.es_miembro(establecimiento_id));
revoke all on public.tablero_medidas from anon, authenticated;
grant select on public.tablero_medidas to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Guardar una medida propia
-- ════════════════════════════════════════════════════════════════════════════

-- p_id null: medida nueva. Devuelve su id. Reglas:
--   * A es una medida de una fuente o una medida propia; B, además, puede ser una constante (no 0 si se divide).
--   * Hasta 2 niveles: una medida propia que se usa adentro de otra no puede usar a su vez otra propia. Con eso no
--     hay ciclos (una medida no se usa a sí misma ni a través de otra).
create function public.guardar_medida(
  p_establecimiento_id uuid,
  p_id         uuid,
  p_nombre     text,
  p_unidad     text,
  p_mejor      text,
  p_definicion jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_unidad text := nullif(btrim(coalesce(p_unidad, '')), '');
  v_op     text;
  v_lado   text;
  v_x      jsonb;
  v_prop   uuid;
  v_ref    record;
  v_nivel  int := 1;
  v_usa    text;
  v_id     uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador crea o cambia medidas' using errcode = '42501';
  end if;
  -- Bloquea el establecimiento: dos medidas guardadas a la vez no arman un ciclo entre las dos
  perform 1 from public.establecimientos where id = p_establecimiento_id for update;
  if not found then
    raise exception 'Establecimiento inexistente' using errcode = '22023';
  end if;
  if p_id is not null and not exists (select 1 from public.tablero_medidas m
                                      where m.id = p_id and m.establecimiento_id = p_establecimiento_id) then
    raise exception 'La medida que se quiere cambiar no existe' using errcode = '22023';
  end if;
  if p_id is null and (select count(*) from public.tablero_medidas m where m.establecimiento_id = p_establecimiento_id) >= 100 then
    raise exception 'El establecimiento ya tiene 100 medidas propias' using errcode = '22023';
  end if;
  if v_nombre = '' or char_length(v_nombre) > 60 then
    raise exception 'La medida necesita un nombre (60 letras como mucho)' using errcode = '22023';
  end if;
  if char_length(v_unidad) > 20 then
    raise exception 'La unidad tiene 20 letras como mucho' using errcode = '22023';
  end if;
  if p_mejor is not null and p_mejor not in ('sube', 'baja') then
    raise exception 'Mejor si: sube, baja o sin color' using errcode = '22023';
  end if;
  if p_definicion is null or jsonb_typeof(p_definicion) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_definicion) k where k not in ('a', 'op', 'b')) then
    raise exception 'La definición tiene que tener A, la operación y B' using errcode = '22023';
  end if;
  v_op := p_definicion ->> 'op';
  if v_op is null or v_op not in ('div', 'mul', 'sum', 'res') then
    raise exception 'Operación desconocida: % (dividir, multiplicar, sumar o restar)', v_op using errcode = '22023';
  end if;

  foreach v_lado in array array['a', 'b'] loop
    v_x := p_definicion -> v_lado;
    if jsonb_typeof(v_x) is distinct from 'object' then
      raise exception 'Falta % en la definición', upper(v_lado) using errcode = '22023';
    end if;

    if v_x ? 'constante' then
      if v_lado = 'a' then
        raise exception 'A tiene que ser una medida (la constante va en B)' using errcode = '22023';
      end if;
      if jsonb_typeof(v_x -> 'constante') is distinct from 'number' or (select count(*) from jsonb_object_keys(v_x)) <> 1 then
        raise exception 'La constante tiene que ser un número' using errcode = '22023';
      end if;
      if abs((v_x ->> 'constante')::numeric) >= 1e12 then
        raise exception 'La constante es demasiado grande' using errcode = '22023';
      end if;
      if v_op = 'div' and (v_x ->> 'constante')::numeric = 0 then
        raise exception 'No se puede dividir por cero' using errcode = '22023';
      end if;

    elsif v_x ? 'propia' then
      if (select count(*) from jsonb_object_keys(v_x)) <> 1 then
        raise exception 'Medida propia desconocida en %', upper(v_lado) using errcode = '22023';
      end if;
      begin
        v_prop := (v_x ->> 'propia')::uuid;
      exception when invalid_text_representation then
        raise exception 'Medida propia desconocida en %', upper(v_lado) using errcode = '22023';
      end;
      if v_prop = p_id then
        raise exception 'Una medida no se puede usar a sí misma' using errcode = '22023';
      end if;
      select m.nombre, m.definicion into v_ref
      from public.tablero_medidas m where m.id = v_prop and m.establecimiento_id = p_establecimiento_id;
      if not found then
        raise exception 'Medida propia desconocida en %', upper(v_lado) using errcode = '22023';
      end if;
      if (v_ref.definicion -> 'a') ? 'propia' or (v_ref.definicion -> 'b') ? 'propia' then
        raise exception '"%" ya usa otra medida propia: se combinan hasta 2 niveles', v_ref.nombre using errcode = '22023';
      end if;
      v_nivel := 2;

    else
      if (select count(*) from jsonb_object_keys(v_x)) <> 2
         or jsonb_typeof(v_x -> 'fuente') is distinct from 'string' or jsonb_typeof(v_x -> 'medida') is distinct from 'string'
         or (v_x ->> 'fuente') || ':' || (v_x ->> 'medida') not in (
           'stock:stock', 'stock:movimientos', 'stock:mortandad_pct', 'stock:ug', 'stock:stock_promedio', 'stock:ug_promedio',
           'stock:pct_extraccion', 'stock:pct_vacas_cria', 'stock:lanar_vacuno', 'stock:lanar_vacuno_ug',
           'reproductivos:pct_prenez', 'reproductivos:pct_paricion', 'reproductivos:pct_paricion_total',
           'reproductivos:pct_destete', 'reproductivos:pct_perdidas', 'reproductivos:pct_reposicion',
           'reproductivos:kg_destetados', 'reproductivos:kg_destetados_vaca', 'reproductivos:peso_destete',
           'reproductivos:entoradas', 'reproductivos:prenadas', 'reproductivos:nacidos_vivos',
           'reproductivos:nacidos_muertos', 'reproductivos:destetados',
           'pesadas:peso_promedio', 'pesadas:ganancia_diaria', 'pesadas:kg_producidos',
           'economia:ingresos', 'economia:gastos', 'economia:resultado', 'economia:pendiente_cobro',
           'economia:pendiente_pago', 'economia:gastos_operativos', 'economia:precio_venta', 'economia:flujo_caja',
           'economia:pct_gasto', 'economia:saldos',
           'potreros:carga', 'potreros:ug', 'potreros:superficie', 'potreros:superficie_efectiva',
           'potreros:dias_ocupacion', 'potreros:dias_descanso', 'potreros:carga_promedio', 'potreros:presion',
           'potreros:ha_spg', 'potreros:ha_forestadas', 'potreros:potreros_sin_animales', 'potreros:ha_sin_animales',
           'potreros:dias_desde_salida',
           'produccion:kg_stock', 'produccion:produccion_carne', 'produccion:kg_vendidos', 'produccion:kg_comprados',
           'produccion:peso_venta', 'produccion:lana', 'produccion:lana_por_animal', 'produccion:carne_equivalente',
           'gestion:tareas_vencidas', 'gestion:tareas_proximas', 'gestion:lotes_carencia', 'gestion:cab_carencia',
           'gestion:proximas_dosis') then
        raise exception 'Medida desconocida en %: %', upper(v_lado), coalesce((v_x ->> 'fuente') || ' / ' || (v_x ->> 'medida'), '(vacía)')
          using errcode = '22023';
      end if;
    end if;
  end loop;

  -- Si esta medida pasa a usar otra propia, ninguna medida puede usarla a ella (quedaría de 3 niveles)
  if v_nivel = 2 and p_id is not null then
    select m.nombre into v_usa
    from public.tablero_medidas m
    where m.establecimiento_id = p_establecimiento_id
      and (m.definicion -> 'a' ->> 'propia' = p_id::text or m.definicion -> 'b' ->> 'propia' = p_id::text)
    order by m.nombre
    limit 1;
    if found then
      raise exception 'La usa "%": con otra medida propia adentro quedaría de 3 niveles (se combinan hasta 2)', v_usa
        using errcode = '22023';
    end if;
  end if;

  begin
    if p_id is null then
      insert into public.tablero_medidas (establecimiento_id, nombre, unidad, mejor, definicion)
      values (p_establecimiento_id, v_nombre, v_unidad, p_mejor, p_definicion)
      returning id into v_id;
    else
      update public.tablero_medidas
      set nombre = v_nombre, unidad = v_unidad, mejor = p_mejor, definicion = p_definicion, updated_at = now()
      where id = p_id;
      v_id := p_id;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay una medida que se llama "%"', v_nombre using errcode = '23505';
  end;
  return v_id;
end;
$$;

revoke execute on function public.guardar_medida(uuid, uuid, text, text, text, jsonb) from public, anon;
grant  execute on function public.guardar_medida(uuid, uuid, text, text, text, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Borrar una medida propia
-- ════════════════════════════════════════════════════════════════════════════

-- Solo si no la usa ninguna tarjeta guardada ni otra medida propia.
create function public.eliminar_medida(p_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_est    uuid;
  v_nombre text;
  v_usa    text;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador borra medidas' using errcode = '42501';
  end if;
  select m.establecimiento_id, m.nombre into v_est, v_nombre from public.tablero_medidas m where m.id = p_id;
  if not found then
    raise exception 'La medida no existe' using errcode = '22023';
  end if;
  perform 1 from public.establecimientos where id = v_est for update;

  select t.titulo into v_usa
  from public.tablero_tarjetas t
  where t.establecimiento_id = v_est and t.definicion ->> 'fuente' = 'combinada'
    and jsonb_typeof(t.definicion -> 'medidas') = 'array' and (t.definicion -> 'medidas') ? p_id::text
  order by t.titulo
  limit 1;
  if found then
    raise exception 'No se puede borrar "%": la usa la tarjeta "%"', v_nombre, v_usa using errcode = '23503';
  end if;

  select m.nombre into v_usa
  from public.tablero_medidas m
  where m.establecimiento_id = v_est
    and (m.definicion -> 'a' ->> 'propia' = p_id::text or m.definicion -> 'b' ->> 'propia' = p_id::text)
  order by m.nombre
  limit 1;
  if found then
    raise exception 'No se puede borrar "%": la usa la medida "%"', v_nombre, v_usa using errcode = '23503';
  end if;

  delete from public.tablero_medidas where id = p_id;
end;
$$;

revoke execute on function public.eliminar_medida(uuid) from public, anon;
grant  execute on function public.eliminar_medida(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Calcular una medida propia
-- ════════════════════════════════════════════════════════════════════════════

-- p_medida: el id de la medida propia. Llama a A y a B (la fuente de la lista fija, o esta misma función si es otra
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
create function public.tablero_combinada(
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
  begin
    v_id := p_medida::uuid;
  exception when invalid_text_representation then
    v_id := null;
  end;
  select m.definicion into v_def
  from public.tablero_medidas m where m.id = v_id and m.establecimiento_id = p_establecimiento_id;
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
-- 5. Guardar el tablero: la fuente combinada
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
      -- Medidas propias: tienen que existir en el establecimiento
      if v_tarjeta -> 'definicion' ->> 'fuente' = 'combinada' and (
           jsonb_typeof(v_tarjeta -> 'definicion' -> 'medidas') is distinct from 'array'
           or exists (select 1 from jsonb_array_elements_text(v_tarjeta -> 'definicion' -> 'medidas') x
                      where not exists (select 1 from public.tablero_medidas m
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
