-- Campo Digital v2 — Tablero de Indicadores, etapa 5b: datos base del catálogo del productor
-- (diseño: contexto/DISENO-INDICADORES-TABLERO.md, secciones 4, 9 y 12). Después de 20261111000100.
--
--   1. categorias_animales.peso_referencia_kg: peso vivo de referencia por cabeza, editable por el administrador en
--      Especies (como la UG). Valúa en kg el stock de los lotes sin pesada cerca. Sin valor por defecto: no se
--      inventa; sin peso, la categoría no suma kilos y la tarjeta lo avisa.
--   2. categorias_animales.rol: 'cria' (Vacas de cría, Ovejas de cría, Yeguas) o 'reposicion' (Vaquillonas,
--      Borregas), para el % de vacas de cría y la reposición. Se carga por nombre, como la UG, y las categorías
--      nuevas lo toman al crearse (el mismo trigger completar_ug_categoria). El administrador lo cambia.
--   3. actividad_lotes.peso_vivo_total_kg: en el destete, el peso vivo total (opcional) de las crías que salen de
--      cada lote de origen. _cargar_destete (misma firma) lo lee de p_origenes[].peso_vivo_total_kg, al registrar y al
--      editar.
-- Funciones: ninguna nueva (la auditoría de permisos sigue en 161).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 y 2. Peso de referencia y rol de la categoría
-- ════════════════════════════════════════════════════════════════════════════

alter table public.categorias_animales
  add column peso_referencia_kg numeric(6,1) check (peso_referencia_kg is null or (peso_referencia_kg > 0 and peso_referencia_kg <= 2000)),
  add column rol text check (rol in ('cria', 'reposicion'));

grant insert (peso_referencia_kg, rol), update (peso_referencia_kg, rol) on public.categorias_animales to authenticated;

-- Una categoría nueva sin UG ni rol los toma de su nombre (el administrador los puede cambiar después)
create or replace function public.completar_ug_categoria() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ug is null then
    new.ug := public._ug_por_nombre(new.nombre);
  end if;
  if new.rol is null then
    new.rol := case translate(lower(btrim(new.nombre)), 'áéíóú', 'aeiou')
                 when 'vacas de cria' then 'cria' when 'ovejas de cria' then 'cria' when 'yeguas' then 'cria'
                 when 'vaquillonas' then 'reposicion' when 'borregas' then 'reposicion'
               end;
  end if;
  return new;
end;
$$;

revoke execute on function public.completar_ug_categoria() from public, anon, authenticated;

-- Las que ya existen (sin tocar updated_at)
alter table public.categorias_animales disable trigger set_updated_at;
update public.categorias_animales
set rol = case translate(lower(btrim(nombre)), 'áéíóú', 'aeiou')
            when 'vacas de cria' then 'cria' when 'ovejas de cria' then 'cria' when 'yeguas' then 'cria'
            when 'vaquillonas' then 'reposicion' when 'borregas' then 'reposicion'
          end
where rol is null;
alter table public.categorias_animales enable trigger set_updated_at;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Peso de las crías en el destete (por lote de origen)
-- ════════════════════════════════════════════════════════════════════════════

alter table public.actividad_lotes
  add column peso_vivo_total_kg numeric(12,2)
    check (peso_vivo_total_kg is null or (peso_vivo_total_kg > 0 and rol = 'origen'));

create or replace function public._cargar_destete(
  p_id uuid, p_establecimiento_id uuid, p_fecha date, p_especie_id uuid, p_origenes uuid[],
  p_lineas_origenes jsonb, p_destinos jsonb, p_validar_saldo boolean
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item    jsonb;
  v_linea   jsonb;
  v_id      uuid;
  v_cats    uuid[];
  v_cat     uuid;
  v_cab     int;
  v_cria    boolean;
  v_sexo    text;
  v_nombre  text;
  v_destino uuid;
  v_op      uuid;
  v_sale    int;
  v_entra   int;
  r         record;
  v_kg      numeric;
begin
  -- Peso vivo total de lo que sale de cada origen (opcional): un número mayor a cero, con dos decimales
  for v_item in select e from jsonb_array_elements(p_lineas_origenes) e loop
    if nullif(v_item ->> 'peso_vivo_total_kg', '') is not null then
      begin
        v_kg := (v_item ->> 'peso_vivo_total_kg')::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'El peso de las crías destetadas tiene que ser un número de kilos' using errcode = '22023';
      end;
      if v_kg is null or round(v_kg, 2) <= 0 or v_kg >= 10000000000 then
        raise exception 'El peso de las crías destetadas tiene que ser un número mayor a cero' using errcode = '22023';
      end if;
    end if;
  end loop;

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol, peso_vivo_total_kg)
  select p_id, x, p_establecimiento_id, 'origen',
         (select round(nullif(e ->> 'peso_vivo_total_kg', '')::numeric, 2)
          from jsonb_array_elements(p_lineas_origenes) e
          where (e ->> 'lote_id')::uuid = x
          limit 1)
  from unnest(p_origenes) x;

  -- Lo que sale de cada origen: solo categorías de cría al pie
  for v_item in select e from jsonb_array_elements(p_lineas_origenes) e loop
    v_id := (v_item ->> 'lote_id')::uuid;
    if jsonb_typeof(v_item -> 'lineas') is distinct from 'array' or jsonb_array_length(v_item -> 'lineas') = 0 then
      raise exception 'Cada lote de origen necesita al menos una categoría con cabezas' using errcode = '22023';
    end if;
    v_cats := '{}';
    for v_linea in select e from jsonb_array_elements(v_item -> 'lineas') e loop
      v_cat := nullif(v_linea ->> 'categoria_id', '')::uuid;
      perform public._exigir_categoria(v_cat, p_especie_id);
      select c.cria_al_pie into v_cria from public.categorias_animales c where c.id = v_cat;
      if not v_cria then
        raise exception 'Solo se destetan categorías de cría al pie' using errcode = '22023';
      end if;
      if v_cat = any(v_cats) then
        raise exception 'Hay categorías repetidas en un lote de origen' using errcode = '22023';
      end if;
      v_cats := v_cats || v_cat;
      v_cab := public._cabezas(v_linea -> 'cabezas');
      insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
      values (p_establecimiento_id, v_id, p_especie_id, v_cat, -v_cab, p_fecha, 'destete', p_id);
    end loop;
  end loop;

  -- Lo que entra a cada destino: solo crías sexadas
  for v_item in select e from jsonb_array_elements(p_destinos) e loop
    v_destino := (v_item ->> 'lote_id')::uuid;
    select l.nombre into v_nombre from public.lotes l where l.id = v_destino;
    insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
    values (p_id, v_destino, p_establecimiento_id, 'destino');

    if jsonb_typeof(v_item -> 'lineas') is distinct from 'array' or jsonb_array_length(v_item -> 'lineas') = 0 then
      raise exception 'El lote % necesita al menos una categoría con cabezas', v_nombre using errcode = '22023';
    end if;
    v_cats := '{}';
    for v_linea in select e from jsonb_array_elements(v_item -> 'lineas') e loop
      v_cat := nullif(v_linea ->> 'categoria_id', '')::uuid;
      perform public._exigir_categoria(v_cat, p_especie_id);
      select c.cria_al_pie, c.sexo into v_cria, v_sexo from public.categorias_animales c where c.id = v_cat;
      if not v_cria then
        raise exception 'Solo se destetan categorías de cría al pie' using errcode = '22023';
      end if;
      if v_sexo is null then
        raise exception 'Las crías sin sexar se separan en machos y hembras: ningún lote de destino puede recibirlas'
          using errcode = '22023';
      end if;
      if v_cat = any(v_cats) then
        raise exception 'Hay categorías repetidas en el lote %', v_nombre using errcode = '22023';
      end if;
      v_cats := v_cats || v_cat;
      v_cab := public._cabezas(v_linea -> 'cabezas');
      insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
      values (p_establecimiento_id, v_destino, p_especie_id, v_cat, v_cab, p_fecha, 'destete', p_id);
    end loop;
  end loop;

  -- Balance: en cabezas totales, lo que sale es lo que entra...
  select coalesce(-sum(e.cabezas) filter (where e.cabezas < 0), 0), coalesce(sum(e.cabezas) filter (where e.cabezas > 0), 0)
  into v_sale, v_entra
  from public.lote_eventos e where e.actividad_id = p_id;
  if v_sale <> v_entra then
    raise exception 'Salen % cabezas de los orígenes y entran % a los destinos: tienen que ser las mismas', v_sale, v_entra
      using errcode = '22023';
  end if;

  -- ...y en cada categoría con sexo, lo que entra no es menos que lo que sale
  for r in
    select c.nombre, -sum(e.cabezas) filter (where e.cabezas < 0) as sale, sum(e.cabezas) filter (where e.cabezas > 0) as entra
    from public.lote_eventos e
    join public.categorias_animales c on c.id = e.categoria_id
    where e.actividad_id = p_id and c.sexo is not null
    group by c.nombre
    having sum(e.cabezas) < 0
  loop
    raise exception 'Salen % % y entran %: una cría ya sexada no cambia de sexo', r.sale, r.nombre, coalesce(r.entra, 0)
      using errcode = '22023';
  end loop;

  -- Total por categoría (lo que entra a los destinos, ya con el sexo asignado)
  insert into public.actividad_lineas (actividad_id, establecimiento_id, categoria_id, cabezas)
  select p_id, p_establecimiento_id, e.categoria_id, sum(e.cabezas)
  from public.lote_eventos e
  where e.actividad_id = p_id and e.cabezas > 0
  group by e.categoria_id;

  -- Linaje y carencia: una operación por cada par origen → destino que aportó. Sin eventos.
  for r in
    select distinct o.lote_id as origen, d.lote_id as destino
    from public.lote_eventos o
    join public.categorias_animales co on co.id = o.categoria_id
    join public.lote_eventos d on d.actividad_id = p_id and d.cabezas > 0
                              and (d.categoria_id = o.categoria_id or co.sexo is null)
    where o.actividad_id = p_id and o.cabezas < 0
    order by 1, 2
  loop
    insert into public.operaciones_lote (establecimiento_id, tipo, fecha, actividad_id)
    values (p_establecimiento_id, 'destete', p_fecha, p_id)
    returning id into v_op;
    insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
    values (p_establecimiento_id, v_op, r.origen, 'origen'),
           (p_establecimiento_id, v_op, r.destino, 'destino');
  end loop;

  -- Archivos visibles de todos los orígenes a cada destino, por referencia y sin duplicar
  insert into public.lote_archivos (lote_id, archivo_id, establecimiento_id, heredado_de_lote_id)
  select distinct on (d.lote_id, la.archivo_id) d.lote_id, la.archivo_id, p_establecimiento_id, la.lote_id
  from public.actividad_lotes d
  join public.lote_archivos la on la.lote_id = any(p_origenes) and not la.oculto
  where d.actividad_id = p_id and d.rol = 'destino'
  order by d.lote_id, la.archivo_id, la.lote_id
  on conflict (lote_id, archivo_id) do nothing;

  if p_validar_saldo then
    for r in select distinct e.lote_id, e.categoria_id from public.lote_eventos e where e.actividad_id = p_id and e.cabezas < 0 loop
      perform public._validar_saldo(r.lote_id, r.categoria_id);
    end loop;
  end if;
end;
$$;

revoke execute on function public._cargar_destete(uuid, uuid, date, uuid, uuid[], jsonb, jsonb, boolean) from public, anon, authenticated;

commit;
