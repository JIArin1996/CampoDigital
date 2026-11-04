-- Campo Digital v2 — Eliminar actividades, versiones anteriores y bitácora cerrada (paso 1)
--
-- Diseño: contexto/DISENO-EDITAR-ACTIVIDADES.md, aprobado el 2026-11-04 (paso 1 de la sección 9).
--
--   1. Marca de la actividad que se edita o elimina: local a la transacción (set_config con
--      is_local = true). La ponen solo eliminar_actividad y, desde el paso 2, las editar_<tipo>.
--   2. Excepción en los triggers de inmutabilidad: lote_eventos y los datos de las actividades
--      (líneas, detalles, lotes, responsables, productos y dosis dadas) aceptan un DELETE solo de las
--      filas de la actividad marcada. Un UPDATE sigue rechazado siempre. Sin marca, o con la de otra
--      actividad, nada cambia.
--   3. actividad_versiones: la versión completa anterior a cada edición o eliminación. Inmutable; la
--      lee solo el administrador.
--   4. actividades: editada_en y editada_por; el motivo pasa a ser opcional; proteger_actividad
--      acepta la eliminación y la edición solo con la marca.
--   5. eliminar_actividad (solo el administrador): guarda la versión, BORRA los eventos de stock (no
--      inserta inversos), valida el saldo, anula el movimiento económico, reabre o cierra los lotes y
--      la deja oculta. anular_actividad queda como alias hasta que la app use eliminar_actividad
--      (paso 3), solo para el administrador.
--   6. Las anuladas que ya existen pasan a ser eliminadas: se guarda su versión y se borran sus
--      eventos (el original y el inverso, de la misma fecha). Antes se verifica que sumen cero por
--      lote, categoría y fecha, para que el saldo de ningún día cambie.
--   7. v_actividades: solo las no eliminadas, con editada_en y editada_por al final.
--   8. bitacora_entradas: cerrada_en y cerrada_por (tarea hecha o cancelada, idea decidida o
--      descartada), con un trigger que los completa y los borra si la entrada se reabre.
--
-- Las próximas dosis no cambian: v_calendario ya excluye las sanidades eliminadas.
-- Auditoría: +7 funciones (_marcar_actividad, _actividad_marcada, _version_actividad, _eliminar_actividad,
-- eliminar_actividad y las de trigger proteger_dato_de_actividad y marcar_cierre_entrada).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Marca de la actividad que se edita o elimina
-- ════════════════════════════════════════════════════════════════════════════

create function public._marcar_actividad(p_actividad_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('campo.actividad_marcada', p_actividad_id::text, true);
end;
$$;

create function public._actividad_marcada(p_actividad_id uuid) returns boolean
language sql
stable
set search_path = ''
as $$
  select p_actividad_id is not null
     and coalesce(current_setting('campo.actividad_marcada', true), '') = p_actividad_id::text
$$;

revoke execute on function public._marcar_actividad(uuid)  from public, anon, authenticated;
revoke execute on function public._actividad_marcada(uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Excepción en los triggers: DELETE solo de la actividad marcada
-- ════════════════════════════════════════════════════════════════════════════

create function public.proteger_dato_de_actividad() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and public._actividad_marcada(old.actividad_id) then
    return old;
  end if;
  if tg_table_name = 'lote_eventos' then
    raise exception 'lote_eventos es inmutable: los errores se corrigen con un evento de ajuste' using errcode = '42501';
  end if;
  raise exception '% no se modifica directamente: la actividad se edita o se elimina', tg_table_name using errcode = '42501';
end;
$$;

revoke execute on function public.proteger_dato_de_actividad() from public, anon, authenticated;

drop trigger inmutable on public.lote_eventos;
create trigger inmutable before update or delete on public.lote_eventos
  for each row execute function public.proteger_dato_de_actividad();

drop trigger inmutable on public.actividad_lineas;
create trigger inmutable before update or delete on public.actividad_lineas
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.act_compraventa;
create trigger inmutable before update or delete on public.act_compraventa
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.act_mortandad;
create trigger inmutable before update or delete on public.act_mortandad
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.act_paricion;
create trigger inmutable before update or delete on public.act_paricion
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.actividad_lotes;
create trigger inmutable before update or delete on public.actividad_lotes
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.act_sanidad_productos;
create trigger inmutable before update or delete on public.act_sanidad_productos
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.act_servicio;
create trigger inmutable before update or delete on public.act_servicio
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.act_diagnostico;
create trigger inmutable before update or delete on public.act_diagnostico
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.act_esquila;
create trigger inmutable before update or delete on public.act_esquila
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.act_personalizada;
create trigger inmutable before update or delete on public.act_personalizada
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.actividad_responsables;
create trigger inmutable before update or delete on public.actividad_responsables
  for each row execute function public.proteger_dato_de_actividad();

-- Dosis dadas: el UPDATE (marcar y desmarcar) sigue libre para marcar_dosis_dada; el DELETE, con marca
drop trigger sin_borrado on public.sanidad_dosis_dadas;
create trigger sin_borrado before delete on public.sanidad_dosis_dadas
  for each row execute function public.proteger_dato_de_actividad();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Versiones anteriores
-- ════════════════════════════════════════════════════════════════════════════

create table public.actividad_versiones (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  actividad_id       uuid not null,
  accion             text not null check (accion in ('edicion', 'eliminacion')),
  version            jsonb not null,
  hecha_por          uuid default auth.uid(),   -- auditoría, sin FK
  hecha_en           timestamptz not null default now(),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict
);

create index actividad_versiones_actividad_idx on public.actividad_versiones (actividad_id, hecha_en);

create trigger inmutable before update or delete on public.actividad_versiones
  for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.actividad_versiones
  for each statement execute function public.bloquear_modificacion();

alter table public.actividad_versiones enable row level security;
create policy actividad_versiones_select on public.actividad_versiones
  for select to authenticated using (public.es_admin());
revoke all on public.actividad_versiones from anon, authenticated;
grant select on public.actividad_versiones to authenticated;

-- La versión completa de una actividad: la fila, los responsables, las líneas, los lotes, los eventos
-- de stock, el detalle de su tipo y los movimientos económicos (con su reparto entre titulares)
create function public._version_actividad(p_actividad_id uuid) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'actividad', to_jsonb(a),
    'responsables', coalesce((select jsonb_agg(r.persona_id order by r.persona_id)
                              from public.actividad_responsables r where r.actividad_id = a.id), '[]'::jsonb),
    'lineas', coalesce((select jsonb_agg(to_jsonb(x) order by x.categoria_id)
                        from public.actividad_lineas x where x.actividad_id = a.id), '[]'::jsonb),
    'lotes', coalesce((select jsonb_agg(to_jsonb(x) order by x.rol, x.lote_id)
                       from public.actividad_lotes x where x.actividad_id = a.id), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha, x.created_at, x.id)
                         from public.lote_eventos x where x.actividad_id = a.id), '[]'::jsonb),
    'detalle', coalesce((
      select jsonb_object_agg(d.clave, d.valor)
      from (values
        ('compraventa',       (select to_jsonb(x) from public.act_compraventa x   where x.actividad_id = a.id)),
        ('mortandad',         (select to_jsonb(x) from public.act_mortandad x     where x.actividad_id = a.id)),
        ('paricion',          (select to_jsonb(x) from public.act_paricion x      where x.actividad_id = a.id)),
        ('servicio',          (select to_jsonb(x) from public.act_servicio x      where x.actividad_id = a.id)),
        ('diagnostico',       (select to_jsonb(x) from public.act_diagnostico x   where x.actividad_id = a.id)),
        ('esquila',           (select to_jsonb(x) from public.act_esquila x       where x.actividad_id = a.id)),
        ('personalizada',     (select to_jsonb(x) from public.act_personalizada x where x.actividad_id = a.id)),
        ('sanidad_productos', (select jsonb_agg(to_jsonb(x) order by x.orden)
                               from public.act_sanidad_productos x where x.actividad_id = a.id)),
        ('dosis_dadas',       (select jsonb_agg(to_jsonb(x) order by x.orden)
                               from public.sanidad_dosis_dadas x where x.actividad_id = a.id)),
        ('operaciones',       (select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
                               from public.operaciones_lote x where x.actividad_id = a.id))
      ) d(clave, valor)
      where d.valor is not null
    ), '{}'::jsonb),
    'movimientos', coalesce((
      select jsonb_agg(to_jsonb(m) || jsonb_build_object('titulares', coalesce((
               select jsonb_agg(to_jsonb(t) order by t.titular_id)
               from public.movimiento_titulares t where t.movimiento_id = m.id), '[]'::jsonb))
             order by m.created_at, m.id)
      from public.movimientos_economicos m where m.actividad_id = a.id
    ), '[]'::jsonb)
  )
  from public.actividades a
  where a.id = p_actividad_id
$$;

revoke execute on function public._version_actividad(uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. actividades: editada, motivo opcional y proteger_actividad con la marca
-- ════════════════════════════════════════════════════════════════════════════

alter table public.actividades
  add column editada_en  timestamptz,
  add column editada_por uuid,   -- auditoría, sin FK
  add constraint actividades_editada_check check ((editada_en is null) = (editada_por is null));

-- El check de "los tres datos de la anulación juntos" se creó sin nombre: se busca por su definición
do $$
declare
  v_nombres text[];
begin
  select array_agg(conname) into v_nombres from pg_constraint
  where conrelid = 'public.actividades'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%anulada_por IS NULL%motivo_anulacion IS NULL%';
  if coalesce(array_length(v_nombres, 1), 0) <> 1 then
    raise exception 'Se esperaba un solo check de anulación en actividades y hay %', coalesce(array_length(v_nombres, 1), 0);
  end if;
  execute format('alter table public.actividades drop constraint %I', v_nombres[1]);
end $$;

-- Eliminada: quién y cuándo, juntos. El motivo es opcional (lo tienen las anuladas de antes)
alter table public.actividades
  add constraint actividades_eliminada_check
    check ((anulada_en is null) = (anulada_por is null) and (motivo_anulacion is null or anulada_en is not null));

-- Sin la marca no cambia nada. Con la marca: se elimina una vez, o se editan la fecha, el lote, las
-- notas y la marca de editada. Nunca el tipo, el establecimiento, el lote creado ni la auditoría.
create or replace function public.proteger_actividad() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'Las actividades no se borran: se eliminan (quedan ocultas)' using errcode = '42501';
  end if;
  if old.anulada_en is not null then
    raise exception 'La actividad está eliminada' using errcode = '42501';
  end if;
  if not public._actividad_marcada(old.id) then
    raise exception 'Las actividades solo se editan o se eliminan con sus funciones' using errcode = '42501';
  end if;
  if (new.id, new.establecimiento_id, new.tipo, new.lote_creado_id, new.created_by, new.created_at)
     is distinct from
     (old.id, old.establecimiento_id, old.tipo, old.lote_creado_id, old.created_by, old.created_at) then
    raise exception 'De una actividad no se cambia el tipo, el establecimiento ni el lote que creó' using errcode = '42501';
  end if;
  if new.anulada_en is not null
     and (new.fecha, new.lote_id, new.notas, new.editada_en, new.editada_por)
         is distinct from (old.fecha, old.lote_id, old.notas, old.editada_en, old.editada_por) then
    raise exception 'Una actividad se elimina o se edita, no las dos cosas a la vez' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. eliminar_actividad
-- ════════════════════════════════════════════════════════════════════════════
-- _eliminar_actividad hace el trabajo; p_motivo solo lo usa el alias anular_actividad.

create function public._eliminar_actividad(p_actividad_id uuid, p_motivo text) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_act      public.actividades;
  v_id       uuid;
  v_lote     public.lotes;
  v_lotes    uuid[];   -- todos los lotes de la actividad, ordenados por id
  v_ev_lotes uuid[];   -- pares lote y categoría que tenían eventos (posición a posición)
  v_ev_cats  uuid[];
  v_nombre   text;     -- tipo de actividad para los motivos ("Eliminación de venta")
begin
  select * into v_act from public.actividades where id = p_actividad_id for update;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Actividad inexistente o sin permiso' using errcode = '42501';
  end if;
  if not public.es_admin() then
    raise exception 'Solo el administrador elimina actividades' using errcode = '42501';
  end if;
  if v_act.anulada_en is not null then
    raise exception 'La actividad ya está eliminada' using errcode = '22023';
  end if;
  v_nombre := case v_act.tipo when 'paricion' then 'parición' when 'diagnostico_gestacion' then 'diagnóstico'
                              else v_act.tipo end;

  -- 1. Bloquear los lotes afectados, ordenados por id: los de sus eventos y los de actividad_lotes
  v_lotes := coalesce((
    select array_agg(distinct x order by x)
    from (
      select e.lote_id as x from public.lote_eventos e where e.actividad_id = v_act.id
      union
      select al.lote_id from public.actividad_lotes al where al.actividad_id = v_act.id
    ) l
    where x is not null
  ), '{}'::uuid[]);
  foreach v_id in array v_lotes loop
    perform public._bloquear_lote_editable(v_id);
  end loop;

  -- 1 bis. Destete: solo si ningún lote de destino tuvo movimientos de stock que no sean del propio
  -- destete (de cualquier fecha) ni una pesada vigente, y sigue abierto
  if v_act.tipo = 'destete' then
    for v_lote in
      select l.* from public.lotes l
      join public.actividad_lotes al on al.lote_id = l.id and al.actividad_id = v_act.id and al.rol = 'destino'
      order by l.nombre
    loop
      if v_lote.estado <> 'activo'
         or exists (select 1 from public.lote_eventos e
                    where e.lote_id = v_lote.id and e.actividad_id is distinct from v_act.id)
         or exists (select 1 from public.actividad_lotes ap
                    join public.actividades a on a.id = ap.actividad_id
                    where ap.lote_id = v_lote.id and a.tipo = 'pesada' and a.anulada_en is null) then
        raise exception 'El lote % ya tuvo movimientos o una pesada después del destete: eliminalos primero', v_lote.nombre
          using errcode = '22023';
      end if;
    end loop;
  end if;

  -- 2. Versión anterior
  insert into public.actividad_versiones (establecimiento_id, actividad_id, accion, version)
  values (v_act.establecimiento_id, v_act.id, 'eliminacion', public._version_actividad(v_act.id));

  -- 3. Borrar los eventos de stock (con la marca) y validar el saldo día por día en lo que tocaban
  select array_agg(x.lote_id), array_agg(x.categoria_id) into v_ev_lotes, v_ev_cats
  from (select distinct e.lote_id, e.categoria_id from public.lote_eventos e where e.actividad_id = v_act.id) x;

  perform public._marcar_actividad(v_act.id);
  delete from public.lote_eventos where actividad_id = v_act.id;
  for i in 1 .. coalesce(array_length(v_ev_lotes, 1), 0) loop
    perform public._validar_saldo(v_ev_lotes[i], v_ev_cats[i]);
  end loop;

  -- 4. Movimiento económico asociado
  update public.movimientos_economicos
  set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = 'Actividad eliminada'
  where actividad_id = v_act.id and anulado_en is null;

  -- 5. Lotes: reabrir los cerrados que vuelven a tener animales; cerrar el creado por la actividad
  -- (y los destinos del destete) si quedan vacíos
  foreach v_id in array v_lotes loop
    select * into v_lote from public.lotes where id = v_id;
    if v_lote.estado = 'cerrado' and exists (
      select 1 from public.lote_eventos e where e.lote_id = v_id group by e.categoria_id having sum(e.cabezas) <> 0
    ) then
      update public.lotes set estado = 'activo', fecha_cierre = null where id = v_id;
      insert into public.lote_cambios_estado (establecimiento_id, lote_id, tipo, fecha, motivo)
      values (v_lote.establecimiento_id, v_id, 'reapertura', greatest(public.fecha_hoy(), v_lote.fecha_cierre),
              'Eliminación de ' || v_nombre);
    end if;
  end loop;

  if v_act.lote_creado_id is not null then
    perform public._cerrar_si_vacio(v_act.lote_creado_id, v_act.fecha, 'Eliminación de ' || v_nombre);
  end if;
  if v_act.tipo = 'destete' then
    for v_id in select al.lote_id from public.actividad_lotes al where al.actividad_id = v_act.id and al.rol = 'destino' loop
      perform public._cerrar_si_vacio(v_id, v_act.fecha, 'Eliminación de destete');
    end loop;
  end if;

  -- 6. Marca de eliminada (proteger_actividad la acepta porque la actividad está marcada)
  update public.actividades
  set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = v_act.id;

  perform set_config('campo.actividad_marcada', '', true);
end;
$$;

revoke execute on function public._eliminar_actividad(uuid, text) from public, anon, authenticated;

create function public.eliminar_actividad(p_actividad_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._eliminar_actividad(p_actividad_id, null);
end;
$$;

-- Alias mientras la app siga llamando a anular_actividad (se borra en el paso 3): elimina igual,
-- solo el administrador, y guarda el motivo si viene
create or replace function public.anular_actividad(p_actividad_id uuid, p_motivo text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._eliminar_actividad(p_actividad_id, p_motivo);
end;
$$;

revoke execute on function public.eliminar_actividad(uuid)      from public, anon;
grant  execute on function public.eliminar_actividad(uuid)      to authenticated;
revoke execute on function public.anular_actividad(uuid, text)  from public, anon;
grant  execute on function public.anular_actividad(uuid, text)  to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Las anuladas que ya existen pasan a ser eliminadas
-- ════════════════════════════════════════════════════════════════════════════
-- Cada anulada tiene su evento original y el inverso, con la misma fecha: borrar los dos no cambia el
-- saldo de ningún día. Si en alguna no suman cero por lote, categoría y fecha, la migración se detiene.

do $$
declare
  r        record;
  v_malas  text;
begin
  select string_agg(distinct e.actividad_id::text, ', ') into v_malas
  from (
    select e.actividad_id
    from public.lote_eventos e
    join public.actividades a on a.id = e.actividad_id
    where a.anulada_en is not null
    group by e.actividad_id, e.lote_id, e.categoria_id, e.fecha
    having sum(e.cabezas) <> 0
  ) e;
  if v_malas is not null then
    raise exception 'Anuladas cuyos eventos no suman cero por lote, categoría y fecha: %', v_malas;
  end if;

  for r in select a.* from public.actividades a where a.anulada_en is not null order by a.anulada_en, a.id loop
    insert into public.actividad_versiones (establecimiento_id, actividad_id, accion, version, hecha_por, hecha_en)
    values (r.establecimiento_id, r.id, 'eliminacion',
            public._version_actividad(r.id) || jsonb_build_object('origen', 'anulacion', 'motivo', r.motivo_anulacion),
            r.anulada_por, r.anulada_en);
    perform public._marcar_actividad(r.id);
    delete from public.lote_eventos where actividad_id = r.id;
  end loop;
  perform set_config('campo.actividad_marcada', '', true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. v_actividades: solo las no eliminadas (mismas columnas, editada al final)
-- ════════════════════════════════════════════════════════════════════════════

create or replace view public.v_actividades
with (security_invoker = true) as
select
  a.id,
  a.establecimiento_id,
  a.tipo,
  a.fecha,
  a.lote_id,
  a.lote_creado_id,
  coalesce((select array_agg(r.persona_id order by r.persona_id) from public.actividad_responsables r
            where r.actividad_id = a.id), '{}'::uuid[])                                       as responsables,
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
  pz.campos,
  a.editada_en,
  a.editada_por
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
left join public.act_personalizada pz on pz.actividad_id = a.id
where a.anulada_en is null;

revoke all    on public.v_actividades from anon, authenticated;
grant  select on public.v_actividades to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Bitácora: cerrada_en y cerrada_por
-- ════════════════════════════════════════════════════════════════════════════

alter table public.bitacora_entradas
  add column cerrada_en  timestamptz,
  add column cerrada_por uuid;   -- auditoría, sin FK

-- Las que ya están cerradas: las tareas hechas con su completada_en y completada_por; las demás con
-- su última actualización y sin quién (hoy no se guarda). Sin tocar updated_at.
alter table public.bitacora_entradas disable trigger set_updated_at;

update public.bitacora_entradas
set cerrada_en  = case when estado_tarea = 'hecha' then completada_en  else updated_at end,
    cerrada_por = case when estado_tarea = 'hecha' then completada_por end
where (tipo = 'tarea' and estado_tarea in ('hecha', 'cancelada'))
   or (tipo = 'idea'  and estado_idea  in ('decidida', 'descartada'));

alter table public.bitacora_entradas enable trigger set_updated_at;

-- Cerrada = tarea hecha o cancelada, o idea decidida o descartada; solo ellas tienen cuándo
alter table public.bitacora_entradas
  add constraint bitacora_entradas_cerrada_check check (
    coalesce((tipo = 'tarea' and estado_tarea in ('hecha', 'cancelada'))
          or (tipo = 'idea'  and estado_idea  in ('decidida', 'descartada')), false)
    = (cerrada_en is not null)),
  add constraint bitacora_entradas_cerrada_por_check check (cerrada_por is null or cerrada_en is not null);

-- Completa cuándo y quién al cerrar (o al pasar de un estado cerrado a otro); los borra al reabrir;
-- si el estado no cambia, conserva los que había
create function public.marcar_cierre_entrada() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cerrada boolean := coalesce((new.tipo = 'tarea' and new.estado_tarea in ('hecha', 'cancelada'))
                             or (new.tipo = 'idea'  and new.estado_idea  in ('decidida', 'descartada')), false);
begin
  if not v_cerrada then
    new.cerrada_en := null;
    new.cerrada_por := null;
  elsif tg_op = 'INSERT'
     or (old.tipo, old.estado_tarea, old.estado_idea) is distinct from (new.tipo, new.estado_tarea, new.estado_idea) then
    new.cerrada_en := now();
    new.cerrada_por := auth.uid();
  else
    new.cerrada_en := old.cerrada_en;
    new.cerrada_por := old.cerrada_por;
  end if;
  return new;
end;
$$;

revoke execute on function public.marcar_cierre_entrada() from public, anon, authenticated;

create trigger marcar_cierre before insert or update on public.bitacora_entradas
  for each row execute function public.marcar_cierre_entrada();

commit;
