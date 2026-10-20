-- Campo Digital v2 — Kilos con dos decimales
--
-- Decisión (2026-10-20): los kilos aceptan cualquier número mayor a cero con hasta dos decimales.
-- Antes se guardaban con un decimal y la validación miraba el valor sin redondear: 0,04 kg pasaba
-- la validación, se redondeaba a 0,0 y caía en el check de la tabla (23514) en vez de dar el
-- mensaje claro (22023). Ahora se valida el valor ya redondeado a dos decimales.
--
--   * Columnas a numeric(12,2): actividad_lineas.peso_vivo_total_kg, act_compraventa.kg_gancho y
--     act_esquila.kg_lana_total. Los valores cargados no cambian (1 decimal entra en 2). Los checks
--     (> 0) quedan.
--   * v_actividades usa esas columnas: se borra antes y se vuelve a crear igual (misma definición
--     de 20261019000100), con los mismos permisos. Los promedios calculados (peso promedio,
--     rendimiento, lana por cabeza) siguen con un decimal.
--   * _insertar_lineas (peso vivo de pesada, mortandad, compra, venta y parición), registrar_compra
--     (versión de 20261020000500), registrar_venta y registrar_esquila: redondean a dos decimales
--     y rechazan con 22023 si el valor redondeado no es mayor a cero. Misma firma: create or
--     replace conserva los permisos. El resto de cada función queda igual a su versión vigente.
--
-- Requiere 20261020000500 aplicada. Conteo de funciones de la auditoría: sin cambios.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Columnas (sin la vista que las usa)
-- ════════════════════════════════════════════════════════════════════════════

drop view public.v_actividades;

alter table public.actividad_lineas alter column peso_vivo_total_kg type numeric(12,2);
alter table public.act_compraventa  alter column kg_gancho          type numeric(12,2);
alter table public.act_esquila      alter column kg_lana_total      type numeric(12,2);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. v_actividades, igual que en 20261019000100
-- ════════════════════════════════════════════════════════════════════════════

create view public.v_actividades
with (security_invoker = true) as
select
  a.id,
  a.establecimiento_id,
  a.tipo,
  a.fecha,
  a.lote_id,
  a.lote_creado_id,
  a.persona_id,
  a.notas,
  a.anulada_en,
  a.anulada_por,
  a.motivo_anulacion,
  a.created_by,
  a.created_at,
  l.cabezas,
  l.peso_vivo_total_kg,
  case when l.peso_vivo_total_kg is not null and l.cabezas_con_peso > 0
       then round(l.peso_vivo_total_kg / l.cabezas_con_peso, 1) end                     as peso_promedio_kg,
  cv.modalidad,
  cv.contraparte,
  cv.kg_gancho,
  case when cv.kg_gancho is not null and l.peso_vivo_total_kg > 0
       then round(cv.kg_gancho / l.peso_vivo_total_kg * 100, 1) end                    as rendimiento_pct,
  m.causa,
  m.observaciones,
  p.lote_cria_id,
  p.nacidos_muertos,
  (select sum(me.monto_usd) from public.movimientos_economicos me
    where me.actividad_id = a.id and me.anulado_en is null)                             as monto_usd,
  -- 6b-1
  (select array_agg(x.lote_id order by x.nombre, x.lote_id)
     from (select distinct al.lote_id, lo.nombre
             from public.actividad_lotes al
             join public.lotes lo on lo.id = al.lote_id
            where al.actividad_id = a.id) x)                                            as lotes,
  sp.productos,
  sp.producto,
  sv.vacas_entoradas,
  sv.toros,
  dg.vacas_diagnosticadas,
  dg.vacas_prenadas,
  dg.vacas_diagnosticadas - dg.vacas_prenadas                                           as vacas_vacias,
  es.kg_lana_total,
  -- Promedio aproximado: usa el stock total de los lotes a la fecha (todas las categorías)
  case when es.kg_lana_total is not null then
    round(es.kg_lana_total / nullif((
      select sum(e.cabezas)
      from public.actividad_lotes al
      join public.lote_eventos e on e.lote_id = al.lote_id and e.fecha <= a.fecha
      where al.actividad_id = a.id
    ), 0), 2)
  end                                                                                   as kg_lana_cabeza_aprox,
  pz.nombre                                                                             as personalizada,
  pz.campos
from public.actividades a
left join lateral (
  select sum(x.cabezas)::int as cabezas,
         sum(x.peso_vivo_total_kg) as peso_vivo_total_kg,
         sum(x.cabezas) filter (where x.peso_vivo_total_kg is not null)::int as cabezas_con_peso
  from public.actividad_lineas x where x.actividad_id = a.id
) l on true
left join public.act_compraventa cv on cv.actividad_id = a.id
left join public.act_mortandad   m  on m.actividad_id  = a.id
left join public.act_paricion    p  on p.actividad_id  = a.id
left join lateral (
  select nullif(count(*), 0)::int as productos,
         (array_agg(x.producto order by x.orden))[1] as producto
  from public.act_sanidad_productos x where x.actividad_id = a.id
) sp on true
left join public.act_servicio      sv on sv.actividad_id = a.id
left join public.act_diagnostico   dg on dg.actividad_id = a.id
left join public.act_esquila       es on es.actividad_id = a.id
left join public.act_personalizada pz on pz.actividad_id = a.id;

revoke all    on public.v_actividades from anon, authenticated;
grant  select on public.v_actividades to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Funciones: validan y guardan con dos decimales
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._insertar_lineas(
  p_actividad_id uuid, p_establecimiento_id uuid, p_especie_id uuid, p_lineas jsonb, p_peso text
) returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_cat  uuid;
  v_cab  int;
  v_peso numeric;
  v_cats uuid[] := '{}';
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Indicá al menos una categoría con cabezas' using errcode = '22023';
  end if;
  -- Solo cuenta las categorías presentes: una línea sin categoria_id la rechaza _exigir_categoria, con su propio mensaje
  if (select count(distinct x ->> 'categoria_id') <> count(x ->> 'categoria_id') from jsonb_array_elements(p_lineas) x) then
    raise exception 'Hay categorías repetidas' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_lineas) loop
    v_cat := nullif(v_item ->> 'categoria_id', '')::uuid;
    perform public._exigir_categoria(v_cat, p_especie_id);
    v_cab := public._cabezas(v_item -> 'cabezas');

    v_peso := null;
    if nullif(v_item ->> 'peso_vivo_total_kg', '') is not null then
      if p_peso = 'no' then
        raise exception 'Esta actividad no lleva peso' using errcode = '22023';
      end if;
      begin
        v_peso := (v_item ->> 'peso_vivo_total_kg')::numeric;
      exception when others then
        v_peso := null;
      end;
      if v_peso is null or round(v_peso, 2) <= 0 then
        raise exception 'El peso vivo tiene que ser un número mayor a cero (hasta dos decimales)' using errcode = '22023';
      end if;
    elsif p_peso = 'obligatorio' then
      raise exception 'Falta el peso vivo total de cada categoría' using errcode = '22023';
    end if;

    insert into public.actividad_lineas (actividad_id, establecimiento_id, categoria_id, cabezas, peso_vivo_total_kg)
    values (p_actividad_id, p_establecimiento_id, v_cat, v_cab, round(v_peso, 2));

    v_cats := array_append(v_cats, v_cat);
  end loop;

  return v_cats;
end;
$$;

create or replace function public.registrar_compra(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_lineas             jsonb,                  -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
  p_modalidad          text,                   -- productor, remate, frigorifico, otra
  p_lote_id            uuid  default null,     -- destino existente...
  p_lote_nuevo         jsonb default null,     -- ...o nuevo: {"nombre", "especie_id", "potrero_id", "anios_nacimiento"?}
  p_contraparte        text  default null,
  p_kg_gancho          numeric default null,
  p_precio             jsonb default null,     -- ver _registrar_movimiento; sin precio no hay movimiento
  p_persona_id         uuid  default null,
  p_notas              text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote    public.lotes;
  v_especie uuid;
  v_nuevo   uuid;
  v_total   int;
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'compra') then
    return p_id;
  end if;

  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  if (p_lote_id is null) = (p_lote_nuevo is null) then
    raise exception 'Indicá el lote destino: uno existente o uno nuevo' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_kg_gancho is not null and round(p_kg_gancho, 2) <= 0 then
    raise exception 'Los kg al gancho tienen que ser mayores a cero (hasta dos decimales)' using errcode = '22023';
  end if;
  perform public._exigir_persona(p_persona_id, p_establecimiento_id);

  if p_lote_id is not null then
    v_lote := public._bloquear_lote_editable(p_lote_id);
    if v_lote.establecimiento_id <> p_establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote está cerrado' using errcode = '22023';
    end if;
    perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  else
    v_especie := nullif(p_lote_nuevo ->> 'especie_id', '')::uuid;
    if btrim(coalesce(p_lote_nuevo ->> 'nombre', '')) = '' then
      raise exception 'El lote nuevo necesita un nombre' using errcode = '22023';
    end if;
    if not exists (select 1 from public.especies s where s.id = v_especie and s.establecimiento_id = p_establecimiento_id and s.activo) then
      raise exception 'Especie inexistente o inactiva en este establecimiento' using errcode = '22023';
    end if;
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id, anios_nacimiento)
    values (
      p_establecimiento_id, v_especie, btrim(p_lote_nuevo ->> 'nombre'),
      p_fecha,
      nullif(p_lote_nuevo ->> 'potrero_id', '')::uuid,
      coalesce(public._anios_de_jsonb(p_lote_nuevo -> 'anios_nacimiento'), '{}')   -- los que indique; sin inferir
    )
    returning id into v_nuevo;
    select * into v_lote from public.lotes where id = v_nuevo;
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, lote_creado_id, persona_id, notas)
  values (p_id, p_establecimiento_id, 'compra', p_fecha, v_lote.id, v_nuevo, p_persona_id, p_notas);

  insert into public.act_compraventa (actividad_id, establecimiento_id, modalidad, contraparte, kg_gancho)
  values (p_id, p_establecimiento_id, p_modalidad, nullif(btrim(coalesce(p_contraparte, '')), ''), round(p_kg_gancho, 2));

  perform public._insertar_lineas(p_id, p_establecimiento_id, v_lote.especie_id, p_lineas, 'opcional');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select p_establecimiento_id, v_lote.id, v_lote.especie_id, l.categoria_id, l.cabezas, p_fecha, 'compra', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  if p_precio is not null then
    select sum(l.cabezas) into v_total from public.actividad_lineas l where l.actividad_id = p_id;
    perform public._registrar_movimiento(
      p_establecimiento_id, p_id, v_lote.id, v_lote.especie_id, p_fecha, 'egreso',
      'Compra de ' || v_total || ' cabezas (' || v_lote.nombre || ')', p_contraparte, p_precio);
  end if;

  return p_id;
end;
$$;

create or replace function public.registrar_venta(
  p_id          uuid,
  p_lote_id     uuid,
  p_fecha       date,
  p_lineas      jsonb,                  -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
  p_modalidad   text,
  p_contraparte text    default null,
  p_kg_gancho   numeric default null,
  p_precio      jsonb   default null,
  p_persona_id  uuid    default null,
  p_notas       text    default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  public.lotes;
  v_cat   uuid;
  v_total int;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'venta') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._exigir_persona(p_persona_id, v_lote.establecimiento_id);
  if p_kg_gancho is not null and round(p_kg_gancho, 2) <= 0 then
    raise exception 'Los kg al gancho tienen que ser mayores a cero (hasta dos decimales)' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, v_lote.establecimiento_id, 'venta', p_fecha, v_lote.id, p_persona_id, p_notas);

  insert into public.act_compraventa (actividad_id, establecimiento_id, modalidad, contraparte, kg_gancho)
  values (p_id, v_lote.establecimiento_id, p_modalidad, nullif(btrim(coalesce(p_contraparte, '')), ''), round(p_kg_gancho, 2));

  perform public._insertar_lineas(p_id, v_lote.establecimiento_id, v_lote.especie_id, p_lineas, 'opcional');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select v_lote.establecimiento_id, v_lote.id, v_lote.especie_id, l.categoria_id, -l.cabezas, p_fecha, 'venta', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  for v_cat in select l.categoria_id from public.actividad_lineas l where l.actividad_id = p_id loop
    perform public._validar_saldo(v_lote.id, v_cat);
  end loop;

  if p_precio is not null then
    select sum(l.cabezas) into v_total from public.actividad_lineas l where l.actividad_id = p_id;
    perform public._registrar_movimiento(
      v_lote.establecimiento_id, p_id, v_lote.id, v_lote.especie_id, p_fecha, 'ingreso',
      'Venta de ' || v_total || ' cabezas (' || v_lote.nombre || ')', p_contraparte, p_precio);
  end if;

  perform public._cerrar_si_vacio(v_lote.id, p_fecha, 'Vendido');

  return p_id;
end;
$$;

create or replace function public.registrar_esquila(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_kg_lana_total      numeric,
  p_persona_id         uuid default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'esquila') then
    return p_id;
  end if;
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._bloquear_lotes_actividad(p_establecimiento_id, p_lotes, p_fecha);
  perform public._exigir_persona(p_persona_id, p_establecimiento_id);

  -- Ovino = especie del grupo 'ovino' (no depende del nombre)
  if exists (
    select 1 from unnest(p_lotes) x
    join public.lotes l on l.id = x
    join public.especies s on s.id = l.especie_id
    where s.grupo <> 'ovino'
  ) then
    raise exception 'La esquila es solo para lotes ovinos' using errcode = '22023';
  end if;
  -- Se valida ya redondeado a 1 decimal (lo que se guarda): 0,04 kg daría 0,0
  if p_kg_lana_total is null or round(p_kg_lana_total, 2) <= 0 then
    raise exception 'Los kg de lana tienen que ser más de cero (hasta dos decimales)' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, persona_id, notas)
  values (p_id, p_establecimiento_id, 'esquila', p_fecha, null, p_persona_id, p_notas);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  insert into public.act_esquila (actividad_id, establecimiento_id, kg_lana_total)
  values (p_id, p_establecimiento_id, round(p_kg_lana_total, 2));

  return p_id;
end;
$$;

commit;
