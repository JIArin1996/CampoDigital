-- Campo Digital v2 — Editar mortandad, parición, sanidad, servicio, diagnóstico, esquila, personalizada y destete (paso 2b)
--
-- Diseño: contexto/DISENO-EDITAR-ACTIVIDADES.md (secciones 4 y 6; paso 2b). Mismo patrón que
-- 20261104000200: _empezar_edicion, la parte compartida de cada registrar_<tipo> y _terminar_edicion.
--
--   1. Productos de sanidad con id. act_sanidad_productos pasa a tener clave id (el orden queda
--      único por sanidad, diferido, solo para mostrar). La marca de dosis dada apunta al id del
--      producto, nunca a la posición: se agrega sanidad_dosis_dadas.producto_id, se convierten las
--      marcas que ya existen (la migración se detiene si alguna no encuentra su producto) y se borra
--      la columna orden. marcar_dosis_dada mantiene su firma (la app manda el orden que ve) y v_calendario
--      sus columnas, con producto_id al final. _version_actividad deja de usar el orden de las dosis.
--   2. Excepción de los triggers, ampliada:
--      * act_sanidad_productos acepta un UPDATE de la actividad marcada (editar un producto por id),
--        sin cambiar su id, su sanidad ni su establecimiento.
--      * operaciones_lote y operacion_lote_vinculos (el linaje que deja el destete) aceptan un DELETE
--        de las operaciones de la actividad marcada. Las divisiones, uniones y recategorizaciones no
--        tienen actividad: siguen inmutables.
--   3. _empezar_edicion borra también el detalle de los otros tipos y las operaciones del destete.
--      Los productos de sanidad y sus dosis dadas no se borran: se editan por id.
--   4. Partes compartidas de la carga, usadas por registrar_<tipo> (misma firma y comportamiento) y
--      por editar_<tipo>.
--   5. editar_mortandad, editar_paricion, editar_sanidad, editar_servicio, editar_diagnostico,
--      editar_esquila, editar_personalizada y editar_destete (administrador y operador).
--      * Parición que creó su lote de cría: ese lote queda fijo.
--      * Sanidad: cada producto con id se actualiza, sin id se crea, y el que falta se borra con su
--        marca de dosis dada. Si cambia la fecha de la próxima dosis, la marca se borra.
--      * Destete: solo si los destinos no tuvieron otros movimientos ni una pesada (como para
--        eliminarlo). Los destinos quedan fijos (los mismos lotes); cambian la fecha, los orígenes y
--        las cabezas. El origen que queda vacío se cierra ("Destetado").
--
-- Auditoría: +22 funciones: 13 internas (_validar_lote_cria, _cargar_mortandad, _cargar_paricion,
-- _cargar_productos_sanidad, _cargar_servicio, _cargar_diagnostico, _cargar_esquila, _cargar_personalizada,
-- _origenes_destete, _cargar_destete, _actividad_para_editar, _actualizar_actividad, _lote_para_editar), el
-- trigger proteger_vinculo_de_actividad y las 8 editar_<tipo>.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Productos de sanidad con id y marcas de dosis dada por id
-- ════════════════════════════════════════════════════════════════════════════

-- ADD COLUMN con un valor por defecto volátil le da un id distinto a cada fila (no dispara triggers)
alter table public.act_sanidad_productos add column id uuid not null default gen_random_uuid();

alter table public.sanidad_dosis_dadas add column producto_id uuid;
update public.sanidad_dosis_dadas d
set producto_id = p.id
from public.act_sanidad_productos p
where p.actividad_id = d.actividad_id and p.orden = d.orden;

do $$
begin
  if exists (select 1 from public.sanidad_dosis_dadas where producto_id is null) then
    raise exception 'Hay marcas de dosis dada sin su producto: no se puede convertir';
  end if;
end $$;

alter table public.sanidad_dosis_dadas alter column producto_id set not null;

-- La FK por posición y las claves viejas (se buscan por definición: se crearon sin nombre)
do $$
declare
  v_nombre text;
begin
  for v_nombre in
    select conname from pg_constraint
    where conrelid = 'public.sanidad_dosis_dadas'::regclass and contype in ('f', 'p')
      and (contype = 'p' or confrelid = 'public.act_sanidad_productos'::regclass)
  loop
    execute format('alter table public.sanidad_dosis_dadas drop constraint %I', v_nombre);
  end loop;
  select conname into v_nombre from pg_constraint
  where conrelid = 'public.act_sanidad_productos'::regclass and contype = 'p';
  execute format('alter table public.act_sanidad_productos drop constraint %I', v_nombre);
end $$;

alter table public.act_sanidad_productos
  add constraint act_sanidad_productos_pkey primary key (id),
  -- El orden es solo para mostrar; diferido para poder reordenar en una edición
  add constraint act_sanidad_productos_orden_key unique (actividad_id, orden) deferrable initially deferred;

alter table public.sanidad_dosis_dadas
  add constraint sanidad_dosis_dadas_pkey primary key (producto_id),
  add constraint sanidad_dosis_dadas_producto_fkey foreign key (producto_id)
    references public.act_sanidad_productos (id) on delete restrict;

-- v_calendario usa el orden de las dosis: se rehace después de borrar la columna
drop view public.v_calendario;
alter table public.sanidad_dosis_dadas drop column orden;

create view public.v_calendario
with (security_invoker = true) as
select e.establecimiento_id, 'tarea'::text as origen, e.id as entrada_id, null::uuid as actividad_id, null::int as orden,
       e.vencimiento as fecha, e.texto,
       coalesce((select array_agg(r.persona_id order by r.persona_id) from public.bitacora_responsables r
                 where r.entrada_id = e.id), '{}'::uuid[]) as responsables,
       e.estado_tarea as estado, e.repetir_cada_dias,
       coalesce((select array_agg(bl.lote_id order by bl.lote_id) from public.bitacora_lotes bl where bl.entrada_id = e.id), '{}'::uuid[]) as lotes,
       e.completada_en as hecha_en,
       null::uuid as producto_id
from public.bitacora_entradas e
where e.tipo = 'tarea' and e.anulada_en is null
union all
select a.establecimiento_id, 'dosis', null, p.actividad_id, p.orden,
       p.fecha_proxima_dosis, 'Próxima dosis: ' || p.producto, '{}'::uuid[],
       case when dd.producto_id is not null and dd.deshecha_en is null then 'hecha' else 'pendiente' end,
       null::int,
       coalesce((select array_agg(al.lote_id order by al.lote_id) from public.actividad_lotes al
                 where al.actividad_id = a.id and al.rol = 'principal'), '{}'::uuid[]),
       case when dd.deshecha_en is null then dd.dada_en end,
       p.id
from public.act_sanidad_productos p
join public.actividades a on a.id = p.actividad_id
left join public.sanidad_dosis_dadas dd on dd.producto_id = p.id
where p.fecha_proxima_dosis is not null and a.anulada_en is null;

revoke all    on public.v_calendario from anon, authenticated;
grant  select on public.v_calendario to authenticated;

-- Misma firma (la app manda el orden que ve); la marca se guarda por el id del producto
create or replace function public.marcar_dosis_dada(p_actividad_id uuid, p_orden int, p_dada boolean default true) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act      public.actividades;
  v_producto public.act_sanidad_productos;
begin
  select * into v_act from public.actividades where id = p_actividad_id for update;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Sanidad inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_act.tipo <> 'sanidad' then
    raise exception 'Solo las sanidades tienen próximas dosis' using errcode = '22023';
  end if;
  if v_act.anulada_en is not null then
    raise exception 'La sanidad está eliminada' using errcode = '22023';
  end if;
  select * into v_producto from public.act_sanidad_productos p
  where p.actividad_id = p_actividad_id and p.orden = p_orden;
  if v_producto.fecha_proxima_dosis is null then
    raise exception 'Ese producto no tiene próxima dosis' using errcode = '22023';
  end if;

  if coalesce(p_dada, true) then
    insert into public.sanidad_dosis_dadas (actividad_id, producto_id, establecimiento_id)
    values (p_actividad_id, v_producto.id, v_act.establecimiento_id)
    on conflict (producto_id) do update
      set dada_en = now(), dada_por = auth.uid(), deshecha_en = null, deshecha_por = null;
  else
    update public.sanidad_dosis_dadas
    set deshecha_en = now(), deshecha_por = auth.uid()
    where producto_id = v_producto.id and deshecha_en is null;
  end if;
end;
$$;

-- La versión guardada ordena las dosis dadas por producto (ya no tienen orden)
create or replace function public._version_actividad(p_actividad_id uuid) returns jsonb
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
        ('dosis_dadas',       (select jsonb_agg(to_jsonb(x) order by x.producto_id)
                               from public.sanidad_dosis_dadas x where x.actividad_id = a.id)),
        ('operaciones',       (select jsonb_agg(to_jsonb(o) || jsonb_build_object('vinculos', (
                                        select jsonb_agg(to_jsonb(v) order by v.rol, v.lote_id)
                                        from public.operacion_lote_vinculos v where v.operacion_id = o.id))
                                      order by o.created_at, o.id)
                               from public.operaciones_lote o where o.actividad_id = a.id))
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

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Excepción de los triggers, ampliada
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.proteger_dato_de_actividad() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and public._actividad_marcada(old.actividad_id) then
    return old;
  end if;
  -- Un producto de sanidad se edita por id, sin cambiar de sanidad
  if tg_op = 'UPDATE' and tg_table_name = 'act_sanidad_productos' and public._actividad_marcada(old.actividad_id)
     and (new.id, new.actividad_id, new.establecimiento_id) = (old.id, old.actividad_id, old.establecimiento_id) then
    return new;
  end if;
  if tg_table_name in ('lote_eventos', 'operaciones_lote') then
    raise exception '% es inmutable: los errores se corrigen con un evento de ajuste', tg_table_name using errcode = '42501';
  end if;
  raise exception '% no se modifica directamente: la actividad se edita o se elimina', tg_table_name using errcode = '42501';
end;
$$;

-- Los vínculos de una operación: se borran solo si la operación es de la actividad marcada
create function public.proteger_vinculo_de_actividad() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1 from public.operaciones_lote o
    where o.id = old.operacion_id and public._actividad_marcada(o.actividad_id)
  ) then
    return old;
  end if;
  raise exception 'operacion_lote_vinculos es inmutable: los errores se corrigen con un evento de ajuste' using errcode = '42501';
end;
$$;

revoke execute on function public.proteger_vinculo_de_actividad() from public, anon, authenticated;

drop trigger inmutable on public.operaciones_lote;
create trigger inmutable before update or delete on public.operaciones_lote
  for each row execute function public.proteger_dato_de_actividad();
drop trigger inmutable on public.operacion_lote_vinculos;
create trigger inmutable before update or delete on public.operacion_lote_vinculos
  for each row execute function public.proteger_vinculo_de_actividad();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. _empezar_edicion: también el detalle de los otros tipos y el linaje del destete
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._empezar_edicion(p_actividad_id uuid, p_tipo text, p_lotes_nuevos uuid[]) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_act    public.actividades;
  v_viejos uuid[];
  v_todos  uuid[];
  v_id     uuid;
  v_ctx    jsonb;
begin
  select * into v_act from public.actividades where id = p_actividad_id for update;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Actividad inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_act.anulada_en is not null then
    raise exception 'La actividad está eliminada: no se edita' using errcode = '22023';
  end if;
  if v_act.tipo <> p_tipo then
    raise exception 'La actividad no es de este tipo' using errcode = '22023';
  end if;

  -- Todos los lotes involucrados, viejos y nuevos, bloqueados en orden de id
  v_viejos := public._lotes_de_actividad(v_act.id);
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_todos
  from unnest(v_viejos || coalesce(p_lotes_nuevos, '{}'::uuid[])) x
  where x is not null;
  foreach v_id in array v_todos loop
    perform public._bloquear_lote_editable(v_id);
  end loop;

  -- Estado inicial de cada lote y pares lote/categoría que tenían eventos (antes de borrar)
  select jsonb_build_object(
    'lotes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'estado', l.estado, 'fecha_cierre', l.fecha_cierre,
               'ultimo_evento', (select max(e.fecha) from public.lote_eventos e where e.lote_id = l.id),
               'viejo', l.id = any (v_viejos)) order by l.id)
      from public.lotes l where l.id = any (v_todos)), '[]'::jsonb),
    'pares', coalesce((
      select jsonb_agg(distinct jsonb_build_object('lote_id', e.lote_id, 'categoria_id', e.categoria_id))
      from public.lote_eventos e where e.actividad_id = v_act.id), '[]'::jsonb)
  ) into v_ctx;

  insert into public.actividad_versiones (establecimiento_id, actividad_id, accion, version)
  values (v_act.establecimiento_id, v_act.id, 'edicion', public._version_actividad(v_act.id));

  -- Deshacer la versión vieja (con la marca): sin eventos inversos. Los productos de sanidad y
  -- sus dosis dadas no se borran: se editan por id.
  perform public._marcar_actividad(v_act.id);
  delete from public.lote_eventos           where actividad_id = v_act.id;
  delete from public.actividad_lineas       where actividad_id = v_act.id;
  delete from public.act_compraventa        where actividad_id = v_act.id;
  delete from public.act_mortandad          where actividad_id = v_act.id;
  delete from public.act_paricion           where actividad_id = v_act.id;
  delete from public.act_servicio           where actividad_id = v_act.id;
  delete from public.act_diagnostico        where actividad_id = v_act.id;
  delete from public.act_esquila            where actividad_id = v_act.id;
  delete from public.act_personalizada      where actividad_id = v_act.id;
  delete from public.operacion_lote_vinculos v
  using public.operaciones_lote o where o.id = v.operacion_id and o.actividad_id = v_act.id;
  delete from public.operaciones_lote       where actividad_id = v_act.id;
  delete from public.actividad_lotes        where actividad_id = v_act.id;
  delete from public.actividad_responsables where actividad_id = v_act.id;

  -- Los lotes viejos cerrados se reabren sin registro, para volver a cargar sobre ellos;
  -- _terminar_edicion los deja como corresponda (y sin registros si terminan igual)
  update public.lotes set estado = 'activo', fecha_cierre = null
  where id = any (v_viejos) and estado = 'cerrado';

  return v_ctx;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Partes compartidas de la carga
-- ════════════════════════════════════════════════════════════════════════════

-- Mortandad: detalle, líneas y eventos (-). Con p_validar_saldo, valida el saldo de sus categorías.
create function public._cargar_mortandad(
  p_id uuid, p_lote public.lotes, p_fecha date, p_lineas jsonb, p_causa text, p_observaciones text, p_validar_saldo boolean
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_causa text := coalesce(nullif(btrim(p_causa), ''), 'Desconocida');
  v_cat   uuid;
begin
  if not exists (select 1 from public.parametros p where p.clave = 'causas_mortandad' and p.valor = v_causa and p.activo) then
    raise exception 'Causa de mortandad inválida' using errcode = '22023';
  end if;

  insert into public.act_mortandad (actividad_id, establecimiento_id, causa, observaciones)
  values (p_id, p_lote.establecimiento_id, v_causa, nullif(btrim(coalesce(p_observaciones, '')), ''));

  perform public._insertar_lineas(p_id, p_lote.establecimiento_id, p_lote.especie_id, p_lineas, 'no');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select p_lote.establecimiento_id, p_lote.id, p_lote.especie_id, l.categoria_id, -l.cabezas, p_fecha, 'mortandad', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  if p_validar_saldo then
    for v_cat in select l.categoria_id from public.actividad_lineas l where l.actividad_id = p_id loop
      perform public._validar_saldo(p_lote.id, v_cat);
    end loop;
  end if;
end;
$$;

-- Lote de cría existente: activo, del mismo establecimiento y de la misma especie que el de madres
create function public._validar_lote_cria(p_madres public.lotes, p_cria public.lotes, p_fecha date) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_cria.establecimiento_id <> p_madres.establecimiento_id then
    raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if p_cria.estado <> 'activo' then
    raise exception 'El lote de cría está cerrado' using errcode = '22023';
  end if;
  if p_cria.especie_id <> p_madres.especie_id then
    raise exception 'El lote de cría tiene que ser de la misma especie que el de las madres' using errcode = '22023';
  end if;
  if p_fecha < p_cria.fecha_apertura then
    raise exception 'La fecha no puede ser anterior a la apertura del lote de cría' using errcode = '22023';
  end if;
end;
$$;

-- Parición: detalle, líneas (solo cría al pie) y eventos (+) en el lote de cría. Suma stock: no
-- tiene saldo que validar al registrar.
create function public._cargar_paricion(
  p_id uuid, p_madres public.lotes, p_cria public.lotes, p_fecha date, p_lineas jsonb, p_nacidos_muertos int
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(p_nacidos_muertos, 0) < 0 then   -- NULL cuenta como 0
    raise exception 'Los nacidos muertos tienen que ser cero o más' using errcode = '22023';
  end if;

  -- El trigger agrega la fila de cría en actividad_lotes
  insert into public.act_paricion (actividad_id, establecimiento_id, lote_cria_id, nacidos_muertos)
  values (p_id, p_madres.establecimiento_id, p_cria.id, coalesce(p_nacidos_muertos, 0));

  -- Las categorías de las crías tienen que ser de la especie (la del lote de madres y de cría)
  perform public._insertar_lineas(p_id, p_madres.establecimiento_id, p_madres.especie_id, p_lineas, 'no');

  -- ...y de cría al pie: la parición no suma vacas, toros ni otras categorías
  if exists (
    select 1 from public.actividad_lineas l
    join public.categorias_animales c on c.id = l.categoria_id
    where l.actividad_id = p_id and not c.cria_al_pie
  ) then
    raise exception 'En la parición solo van categorías de cría al pie (por ejemplo, Terneros/as)' using errcode = '22023';
  end if;

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select p_madres.establecimiento_id, p_cria.id, p_cria.especie_id, l.categoria_id, l.cabezas, p_fecha, 'paricion', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;
end;
$$;

-- Productos de una sanidad. Al registrar, todos nuevos (el orden es su posición). Al editar
-- (p_editando), por id: con id se actualiza (tiene que ser de esta sanidad), sin id se crea y el que
-- falta se borra con su marca de dosis dada. Si cambia la fecha de la próxima dosis, la marca se borra.
create function public._cargar_productos_sanidad(
  p_id uuid, p_establecimiento_id uuid, p_fecha date, p_productos jsonb, p_editando boolean
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item      jsonb;
  v_orden     bigint;
  v_pid       uuid;
  v_ids       uuid[] := '{}';
  v_actual    public.act_sanidad_productos;
  v_producto  text;
  v_categoria text;
  v_via       text;
  v_carencia  int;
  v_proxima   date;
begin
  if p_productos is null or jsonb_typeof(p_productos) <> 'array' or jsonb_array_length(p_productos) = 0 then
    raise exception 'Indicá al menos un producto' using errcode = '22023';
  end if;
  if jsonb_array_length(p_productos) > 20 then
    raise exception 'Hasta 20 productos por carga' using errcode = '22023';
  end if;

  -- Ids de la edición: de esta sanidad y sin repetir
  if p_editando then
    for v_item in select * from jsonb_array_elements(p_productos) loop
      if jsonb_typeof(v_item) = 'object' and nullif(v_item ->> 'id', '') is not null then
        begin
          v_pid := (v_item ->> 'id')::uuid;
        exception when others then
          raise exception 'Producto mal formado' using errcode = '22023';
        end;
        if v_pid = any (v_ids) then
          raise exception 'Un producto aparece dos veces' using errcode = '22023';
        end if;
        if not exists (select 1 from public.act_sanidad_productos p where p.id = v_pid and p.actividad_id = p_id) then
          raise exception 'El producto no es de esta sanidad' using errcode = '22023';
        end if;
        v_ids := v_ids || v_pid;
      end if;
    end loop;

    -- Los que faltan se borran, con su marca de dosis dada
    delete from public.sanidad_dosis_dadas d
    using public.act_sanidad_productos p
    where p.id = d.producto_id and p.actividad_id = p_id and not (p.id = any (v_ids));
    delete from public.act_sanidad_productos p where p.actividad_id = p_id and not (p.id = any (v_ids));
  end if;

  for v_item, v_orden in select e.valor, e.n from jsonb_array_elements(p_productos) with ordinality as e(valor, n) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Producto mal formado' using errcode = '22023';
    end if;

    v_producto := btrim(coalesce(v_item ->> 'producto', ''));
    if v_producto = '' then
      raise exception 'Cada producto necesita un nombre' using errcode = '22023';
    end if;

    v_categoria := btrim(coalesce(v_item ->> 'categoria', ''));
    if not exists (select 1 from public.parametros p where p.clave = 'categorias_sanidad' and p.valor = v_categoria and p.activo) then
      raise exception 'Categoría de sanidad inválida' using errcode = '22023';
    end if;

    v_via := nullif(btrim(coalesce(v_item ->> 'via', '')), '');
    if v_via is not null
       and not exists (select 1 from public.parametros p where p.clave = 'vias_aplicacion' and p.valor = v_via and p.activo) then
      raise exception 'Vía de aplicación inválida' using errcode = '22023';
    end if;

    v_carencia := public._entero_jsonb(v_item -> 'carencia_dias', 'La carencia');
    if v_carencia < 0 then
      raise exception 'La carencia no puede ser negativa' using errcode = '22023';
    end if;

    begin
      v_proxima := nullif(btrim(coalesce(v_item ->> 'fecha_proxima_dosis', '')), '')::date;
    exception when others then
      raise exception 'Fecha de próxima dosis inválida' using errcode = '22023';
    end;
    if v_proxima is not null and v_proxima <= p_fecha then
      raise exception 'La próxima dosis tiene que ser posterior a la fecha de la sanidad' using errcode = '22023';
    end if;

    v_pid := case when p_editando then nullif(v_item ->> 'id', '')::uuid end;
    if v_pid is null then
      insert into public.act_sanidad_productos (actividad_id, establecimiento_id, orden, producto, categoria, dosis, via,
                                                carencia_dias, fecha_proxima_dosis)
      values (p_id, p_establecimiento_id, v_orden, v_producto, v_categoria,
              nullif(btrim(coalesce(v_item ->> 'dosis', '')), ''), v_via, v_carencia, v_proxima);
    else
      select * into v_actual from public.act_sanidad_productos where id = v_pid;
      -- Fecha nueva (o sin fecha): es otra dosis, que todavía no se dio
      if v_actual.fecha_proxima_dosis is distinct from v_proxima then
        delete from public.sanidad_dosis_dadas where producto_id = v_pid;
      end if;
      update public.act_sanidad_productos
      set orden = v_orden, producto = v_producto, categoria = v_categoria,
          dosis = nullif(btrim(coalesce(v_item ->> 'dosis', '')), ''), via = v_via,
          carencia_dias = v_carencia, fecha_proxima_dosis = v_proxima
      where id = v_pid;
    end if;
  end loop;
end;
$$;

create function public._cargar_servicio(p_id uuid, p_establecimiento_id uuid, p_vacas_entoradas int, p_toros int) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_vacas_entoradas is null or p_vacas_entoradas <= 0 then
    raise exception 'Las vacas entoradas tienen que ser más de cero' using errcode = '22023';
  end if;
  if p_toros is not null and p_toros <= 0 then
    raise exception 'Los toros tienen que ser más de cero (o dejarlo vacío)' using errcode = '22023';
  end if;
  insert into public.act_servicio (actividad_id, establecimiento_id, vacas_entoradas, toros)
  values (p_id, p_establecimiento_id, p_vacas_entoradas, p_toros);
end;
$$;

create function public._cargar_diagnostico(
  p_id uuid, p_establecimiento_id uuid, p_vacas_diagnosticadas int, p_vacas_prenadas int
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_vacas_diagnosticadas is null or p_vacas_diagnosticadas <= 0 then
    raise exception 'Las vacas diagnosticadas tienen que ser más de cero' using errcode = '22023';
  end if;
  if p_vacas_prenadas is null or p_vacas_prenadas < 0 then
    raise exception 'Las vacas preñadas tienen que ser cero o más' using errcode = '22023';
  end if;
  if p_vacas_prenadas > p_vacas_diagnosticadas then
    raise exception 'Las preñadas no pueden ser más que las diagnosticadas' using errcode = '22023';
  end if;
  insert into public.act_diagnostico (actividad_id, establecimiento_id, vacas_diagnosticadas, vacas_prenadas)
  values (p_id, p_establecimiento_id, p_vacas_diagnosticadas, p_vacas_prenadas);
end;
$$;

create function public._cargar_esquila(p_id uuid, p_establecimiento_id uuid, p_lotes uuid[], p_kg_lana_total numeric) returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Ovino = especie del grupo 'ovino' (no depende del nombre)
  if exists (
    select 1 from unnest(p_lotes) x
    join public.lotes l on l.id = x
    join public.especies s on s.id = l.especie_id
    where s.grupo <> 'ovino'
  ) then
    raise exception 'La esquila es solo para lotes ovinos' using errcode = '22023';
  end if;
  if p_kg_lana_total is null or round(p_kg_lana_total, 2) <= 0 then
    raise exception 'Los kg de lana tienen que ser más de cero (hasta dos decimales)' using errcode = '22023';
  end if;
  insert into public.act_esquila (actividad_id, establecimiento_id, kg_lana_total)
  values (p_id, p_establecimiento_id, round(p_kg_lana_total, 2));
end;
$$;

create function public._cargar_personalizada(p_id uuid, p_establecimiento_id uuid, p_nombre text, p_campos jsonb) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_campos jsonb := coalesce(p_campos, '[]'::jsonb);
  v_item   jsonb;
  v_campo  text;
  v_valor  text;
  v_norm   jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
begin
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'La actividad necesita un nombre' using errcode = '22023';
  end if;
  if jsonb_typeof(v_campos) <> 'array' then
    raise exception 'Los campos tienen que ser una lista' using errcode = '22023';
  end if;
  if jsonb_array_length(v_campos) > 20 then
    raise exception 'Hasta 20 campos por actividad' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(v_campos) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Campo mal formado' using errcode = '22023';
    end if;
    v_campo := btrim(coalesce(v_item ->> 'campo', ''));
    v_valor := btrim(coalesce(v_item ->> 'valor', ''));
    if v_campo = '' or v_valor = '' then
      raise exception 'Cada campo necesita nombre y valor' using errcode = '22023';
    end if;
    if lower(v_campo) = any(v_vistos) then
      raise exception 'El campo "%" está repetido', v_campo using errcode = '22023';
    end if;
    v_vistos := array_append(v_vistos, lower(v_campo));
    v_norm := v_norm || jsonb_build_array(jsonb_build_object('campo', v_campo, 'valor', v_valor));
  end loop;

  insert into public.act_personalizada (actividad_id, establecimiento_id, nombre, campos)
  values (p_id, p_establecimiento_id, btrim(p_nombre), v_norm);
end;
$$;

-- Orígenes de un destete: sin repetir, bloqueados por id, activos, de la misma especie y con la
-- fecha válida. Devuelve la especie y los ids.
create function public._origenes_destete(
  p_establecimiento_id uuid, p_origenes jsonb, p_fecha date, out especie_id uuid, out lotes uuid[]
)
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id   uuid;
  v_lote public.lotes;
begin
  lotes := '{}';
  if p_origenes is null or jsonb_typeof(p_origenes) <> 'array' or jsonb_array_length(p_origenes) = 0 then
    raise exception 'Indicá al menos un lote de origen' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(p_origenes) e loop
    v_id := nullif(case when jsonb_typeof(v_item) = 'object' then v_item ->> 'lote_id' end, '')::uuid;
    if v_id is null then
      raise exception 'Falta el lote de un origen' using errcode = '22023';
    end if;
    if v_id = any(lotes) then
      raise exception 'Hay lotes de origen repetidos' using errcode = '22023';
    end if;
    lotes := lotes || v_id;
  end loop;

  foreach v_id in array (select array_agg(x order by x) from unnest(lotes) x) loop
    v_lote := public._bloquear_lote_editable(v_id);
    if v_lote.establecimiento_id <> p_establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote % está cerrado', v_lote.nombre using errcode = '22023';
    end if;
    if especie_id is null then
      especie_id := v_lote.especie_id;
    elsif especie_id <> v_lote.especie_id then
      raise exception 'Los lotes de origen tienen que ser de la misma especie' using errcode = '22023';
    end if;
    perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  end loop;
end;
$$;

-- Destete: eventos de los orígenes (-) y de los destinos (+), balance, líneas, linaje, archivos y
-- saldo. p_destinos: [{"lote_id", "lineas"}], lotes que ya existen (los crea registrar_destete o
-- son los de siempre al editar). No cierra los orígenes: lo hace quien llama.
create function public._cargar_destete(
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
begin
  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'origen' from unnest(p_origenes) x;

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

revoke execute on function public._cargar_mortandad(uuid, public.lotes, date, jsonb, text, text, boolean)      from public, anon, authenticated;
revoke execute on function public._validar_lote_cria(public.lotes, public.lotes, date)                         from public, anon, authenticated;
revoke execute on function public._cargar_paricion(uuid, public.lotes, public.lotes, date, jsonb, int)         from public, anon, authenticated;
revoke execute on function public._cargar_productos_sanidad(uuid, uuid, date, jsonb, boolean)                  from public, anon, authenticated;
revoke execute on function public._cargar_servicio(uuid, uuid, int, int)                                       from public, anon, authenticated;
revoke execute on function public._cargar_diagnostico(uuid, uuid, int, int)                                    from public, anon, authenticated;
revoke execute on function public._cargar_esquila(uuid, uuid, uuid[], numeric)                                 from public, anon, authenticated;
revoke execute on function public._cargar_personalizada(uuid, uuid, text, jsonb)                               from public, anon, authenticated;
revoke execute on function public._origenes_destete(uuid, jsonb, date)                                         from public, anon, authenticated;
revoke execute on function public._cargar_destete(uuid, uuid, date, uuid, uuid[], jsonb, jsonb, boolean)       from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Registrar: misma firma y comportamiento, con las partes compartidas
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.registrar_mortandad(
  p_id            uuid,
  p_lote_id       uuid,
  p_fecha         date,
  p_lineas        jsonb,   -- [{"categoria_id", "cabezas"}]
  p_causa         text default 'Desconocida',
  p_observaciones text default null,
  p_responsables  uuid[] default null,
  p_notas         text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'mortandad') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'mortandad', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  perform public._cargar_mortandad(p_id, v_lote, p_fecha, p_lineas, p_causa, p_observaciones, true);

  return p_id;
end;
$$;

create or replace function public.registrar_paricion(
  p_id               uuid,
  p_lote_madres_id   uuid,
  p_fecha            date,
  p_lineas           jsonb,                  -- crías vivas: [{"categoria_id", "cabezas"}], solo categorías de cría al pie
  p_nacidos_muertos  int   default 0,
  p_lote_cria_id     uuid  default null,     -- lote de cría existente (puede ser el de las madres: crías al pie)...
  p_lote_cria_nuevo  jsonb default null,     -- ...o nuevo: {"nombre", "potrero_id"}
  p_responsables     uuid[] default null,
  p_notas            text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_madres public.lotes;
  v_cria   public.lotes;
  v_nuevo  uuid;
  v_id     uuid;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_madres_id), 'paricion') then
    return p_id;
  end if;

  if p_lote_madres_id is null then
    raise exception 'Indicá el lote de las madres' using errcode = '22023';
  end if;
  if (p_lote_cria_id is null) = (p_lote_cria_nuevo is null) then
    raise exception 'Indicá el lote de cría: uno existente o uno nuevo' using errcode = '22023';
  end if;
  if coalesce(p_nacidos_muertos, 0) < 0 then   -- NULL cuenta como 0
    raise exception 'Los nacidos muertos tienen que ser cero o más' using errcode = '22023';
  end if;

  -- Bloqueo de los lotes ordenados por id (evita bloqueos cruzados). Con las crías al pie, el
  -- lote de cría es el mismo de las madres: se bloquea una sola vez.
  foreach v_id in array (select array_agg(distinct x order by x) from unnest(array[p_lote_madres_id, p_lote_cria_id]) x where x is not null) loop
    if v_id = p_lote_madres_id then
      v_madres := public._bloquear_lote_editable(v_id);
    else
      v_cria := public._bloquear_lote_editable(v_id);
    end if;
  end loop;
  if p_lote_cria_id = p_lote_madres_id then
    v_cria := v_madres;
  end if;

  if v_madres.estado <> 'activo' then
    raise exception 'El lote de madres está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_madres.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_madres.establecimiento_id);

  if p_lote_cria_id is not null then
    perform public._validar_lote_cria(v_madres, v_cria, p_fecha);
  else
    if btrim(coalesce(p_lote_cria_nuevo ->> 'nombre', '')) = '' then
      raise exception 'El lote de cría nuevo necesita un nombre' using errcode = '22023';
    end if;
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id)
    values (
      v_madres.establecimiento_id, v_madres.especie_id, btrim(p_lote_cria_nuevo ->> 'nombre'),
      p_fecha,
      nullif(p_lote_cria_nuevo ->> 'potrero_id', '')::uuid
    )
    returning id into v_nuevo;
    select * into v_cria from public.lotes where id = v_nuevo;
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, lote_creado_id, notas)
  values (p_id, v_madres.establecimiento_id, 'paricion', p_fecha, v_madres.id, v_nuevo, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  perform public._cargar_paricion(p_id, v_madres, v_cria, p_fecha, p_lineas, p_nacidos_muertos);

  return p_id;
end;
$$;

create or replace function public.registrar_sanidad(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_productos          jsonb,   -- [{"producto", "categoria", "dosis"?, "via"?, "carencia_dias"?, "fecha_proxima_dosis"?}]
  p_responsables       uuid[] default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'sanidad') then
    return p_id;
  end if;
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._bloquear_lotes_actividad(p_establecimiento_id, p_lotes, p_fecha);
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

  if p_productos is null or jsonb_typeof(p_productos) <> 'array' or jsonb_array_length(p_productos) = 0 then
    raise exception 'Indicá al menos un producto' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, p_establecimiento_id, 'sanidad', p_fecha, null, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  perform public._cargar_productos_sanidad(p_id, p_establecimiento_id, p_fecha, p_productos, false);

  return p_id;
end;
$$;

create or replace function public.registrar_servicio(
  p_id              uuid,
  p_lote_id         uuid,
  p_fecha           date,
  p_vacas_entoradas int,
  p_toros           int  default null,
  p_responsables    uuid[] default null,
  p_notas           text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'servicio') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);

  if p_vacas_entoradas is null or p_vacas_entoradas <= 0 then
    raise exception 'Las vacas entoradas tienen que ser más de cero' using errcode = '22023';
  end if;
  if p_toros is not null and p_toros <= 0 then
    raise exception 'Los toros tienen que ser más de cero (o dejarlo vacío)' using errcode = '22023';
  end if;

  -- El trigger agrega la fila principal en actividad_lotes
  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'servicio', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  perform public._cargar_servicio(p_id, v_lote.establecimiento_id, p_vacas_entoradas, p_toros);

  return p_id;
end;
$$;

create or replace function public.registrar_diagnostico(
  p_id                   uuid,
  p_lote_id              uuid,
  p_fecha                date,
  p_vacas_diagnosticadas int,
  p_vacas_prenadas       int,
  p_responsables         uuid[] default null,
  p_notas                text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'diagnostico_gestacion') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);

  if p_vacas_diagnosticadas is null or p_vacas_diagnosticadas <= 0 then
    raise exception 'Las vacas diagnosticadas tienen que ser más de cero' using errcode = '22023';
  end if;
  if p_vacas_prenadas is null or p_vacas_prenadas < 0 then
    raise exception 'Las vacas preñadas tienen que ser cero o más' using errcode = '22023';
  end if;
  if p_vacas_prenadas > p_vacas_diagnosticadas then
    raise exception 'Las preñadas no pueden ser más que las diagnosticadas' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'diagnostico_gestacion', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  perform public._cargar_diagnostico(p_id, v_lote.establecimiento_id, p_vacas_diagnosticadas, p_vacas_prenadas);

  return p_id;
end;
$$;

create or replace function public.registrar_esquila(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_kg_lana_total      numeric,
  p_responsables       uuid[] default null,
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
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, p_establecimiento_id, 'esquila', p_fecha, null, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  perform public._cargar_esquila(p_id, p_establecimiento_id, p_lotes, p_kg_lana_total);

  return p_id;
end;
$$;

create or replace function public.registrar_personalizada(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_lotes              uuid[],
  p_fecha              date,
  p_nombre             text,
  p_campos             jsonb default null,   -- [{"campo", "valor"}]
  p_responsables       uuid[] default null,
  p_notas              text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'personalizada') then
    return p_id;
  end if;
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  perform public._bloquear_lotes_actividad(p_establecimiento_id, p_lotes, p_fecha);
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'La actividad necesita un nombre' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, p_establecimiento_id, 'personalizada', p_fecha, null, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select p_id, x, p_establecimiento_id, 'principal' from unnest(p_lotes) x;

  perform public._cargar_personalizada(p_id, p_establecimiento_id, p_nombre, p_campos);

  return p_id;
end;
$$;

create or replace function public.registrar_destete(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_origenes           jsonb,
  p_destinos           jsonb,
  p_responsables       uuid[] default null,
  p_notas              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o          record;
  v_item     jsonb;
  v_nombre   text;
  v_destino  uuid;
  v_destinos jsonb := '[]'::jsonb;
  v_id       uuid;
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'destete') then
    return p_id;
  end if;

  if p_establecimiento_id is null or not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de edición en este establecimiento' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_origenes is null or jsonb_typeof(p_origenes) <> 'array' or jsonb_array_length(p_origenes) = 0 then
    raise exception 'Indicá al menos un lote de origen' using errcode = '22023';
  end if;
  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Indicá al menos un lote de destino' using errcode = '22023';
  end if;
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

  -- 1. Orígenes: sin repetir; se bloquean ordenados por id
  select * into o from public._origenes_destete(p_establecimiento_id, p_origenes, p_fecha);

  -- 2. La actividad (sin lote principal: los lotes van en actividad_lotes)
  insert into public.actividades (id, establecimiento_id, tipo, fecha, notas)
  values (p_id, p_establecimiento_id, 'destete', p_fecha, nullif(btrim(coalesce(p_notas, '')), ''));
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  -- 3. Destinos: lotes nuevos (los años los valida el trigger validar_anios_nacimiento)
  for v_item in select e from jsonb_array_elements(p_destinos) e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada lote de destino tiene que ser un objeto con nombre y categorías' using errcode = '22023';
    end if;
    v_nombre := btrim(coalesce(v_item ->> 'nombre', ''));
    if v_nombre = '' then
      raise exception 'Cada lote de destino necesita un nombre' using errcode = '22023';
    end if;
    insert into public.lotes (establecimiento_id, especie_id, nombre, fecha_apertura, potrero_id, anios_nacimiento)
    values (p_establecimiento_id, o.especie_id, v_nombre, p_fecha, nullif(v_item ->> 'potrero_id', '')::uuid,
            coalesce(public._anios_de_jsonb(v_item -> 'anios_nacimiento'), '{}'))
    returning id into v_destino;
    v_destinos := v_destinos || jsonb_build_array(jsonb_build_object('lote_id', v_destino, 'lineas', v_item -> 'lineas'));
  end loop;

  -- 4. Eventos, balance, líneas, linaje, archivos y saldo
  perform public._cargar_destete(p_id, p_establecimiento_id, p_fecha, o.especie_id, o.lotes, p_origenes, v_destinos, true);

  -- 5. El origen que queda vacío se cierra; para eso, el destete no puede ser anterior a su último movimiento
  foreach v_id in array o.lotes loop
    if not exists (
      select 1 from public.lote_eventos e where e.lote_id = v_id group by e.categoria_id having sum(e.cabezas) <> 0
    ) then
      if exists (select 1 from public.lote_eventos e where e.lote_id = v_id and e.fecha > p_fecha) then
        select l.nombre into v_nombre from public.lotes l where l.id = v_id;
        raise exception 'El lote % queda vacío: el destete no puede ser anterior a su último movimiento', v_nombre
          using errcode = '22023';
      end if;
      perform public._cerrar_si_vacio(v_id, p_fecha, 'Destetado');
    end if;
  end loop;

  return p_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Editar
-- ════════════════════════════════════════════════════════════════════════════
-- Mismo patrón que editar_compra: validar lo que se puede antes, _empezar_edicion (bloqueo, versión
-- y borrado), la fila de la actividad, la parte compartida sin validar el saldo y _terminar_edicion.

-- Lee la actividad para editar (sin bloquearla: la bloquea _empezar_edicion)
create function public._actividad_para_editar(p_actividad_id uuid) returns public.actividades
language plpgsql
set search_path = ''
as $$
declare
  v_act public.actividades;
begin
  select * into v_act from public.actividades where id = p_actividad_id;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Actividad inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  return v_act;
end;
$$;

-- La fila de la actividad (fecha, lote principal, notas y quién editó) y sus responsables
create function public._actualizar_actividad(
  p_act public.actividades, p_fecha date, p_lote_id uuid, p_notas text, p_responsables uuid[]
) returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.actividades
  set fecha = p_fecha, lote_id = p_lote_id, notas = p_notas, editada_en = now(), editada_por = auth.uid()
  where id = p_act.id;
  if p_lote_id is not null then
    insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
    values (p_act.id, p_lote_id, p_act.establecimiento_id, 'principal');
  end if;
  perform public._guardar_responsables_actividad(p_act.id, p_responsables);
end;
$$;

-- Un solo lote, activo y del establecimiento, con la fecha válida
create function public._lote_para_editar(p_act public.actividades, p_lote_id uuid, p_fecha date) returns public.lotes
language plpgsql
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if p_lote_id is null then
    raise exception 'Indicá el lote' using errcode = '22023';
  end if;
  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.establecimiento_id <> p_act.establecimiento_id then
    raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  return v_lote;
end;
$$;

revoke execute on function public._actividad_para_editar(uuid)                                  from public, anon, authenticated;
revoke execute on function public._actualizar_actividad(public.actividades, date, uuid, text, uuid[]) from public, anon, authenticated;
revoke execute on function public._lote_para_editar(public.actividades, uuid, date)             from public, anon, authenticated;

create function public.editar_mortandad(
  p_actividad_id  uuid,
  p_lote_id       uuid,
  p_fecha         date,
  p_lineas        jsonb,
  p_causa         text   default 'Desconocida',
  p_observaciones text   default null,
  p_responsables  uuid[] default null,
  p_notas         text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act  public.actividades := public._actividad_para_editar(p_actividad_id);
  v_ctx  jsonb;
  v_lote public.lotes;
begin
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));
  v_ctx := public._empezar_edicion(v_act.id, 'mortandad', array[p_lote_id]);
  v_lote := public._lote_para_editar(v_act, p_lote_id, p_fecha);
  perform public._actualizar_actividad(v_act, p_fecha, v_lote.id, p_notas, p_responsables);
  perform public._cargar_mortandad(v_act.id, v_lote, p_fecha, p_lineas, p_causa, p_observaciones, false);
  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'mortandad');
  return v_act.id;
end;
$$;

create function public.editar_paricion(
  p_actividad_id    uuid,
  p_lote_madres_id  uuid,
  p_fecha           date,
  p_lineas          jsonb,
  p_nacidos_muertos int    default 0,
  p_lote_cria_id    uuid   default null,   -- en una parición que creó su lote de cría, ese lote (o null)
  p_responsables    uuid[] default null,
  p_notas           text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act    public.actividades := public._actividad_para_editar(p_actividad_id);
  v_ctx    jsonb;
  v_cria_id uuid;
  v_madres public.lotes;
  v_cria   public.lotes;
begin
  if p_lote_madres_id is null then
    raise exception 'Indicá el lote de las madres' using errcode = '22023';
  end if;
  if v_act.lote_creado_id is not null then
    if p_lote_cria_id is not null and p_lote_cria_id <> v_act.lote_creado_id then
      raise exception 'Esta parición creó su lote de cría: el lote de cría no se cambia' using errcode = '22023';
    end if;
    v_cria_id := v_act.lote_creado_id;
  else
    if p_lote_cria_id is null then
      raise exception 'Indicá el lote de cría' using errcode = '22023';
    end if;
    v_cria_id := p_lote_cria_id;
  end if;
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));

  v_ctx := public._empezar_edicion(v_act.id, 'paricion', array[p_lote_madres_id, v_cria_id]);

  v_madres := public._lote_para_editar(v_act, p_lote_madres_id, p_fecha);
  if v_cria_id = v_madres.id then
    v_cria := v_madres;
  else
    v_cria := public._bloquear_lote_editable(v_cria_id);
  end if;
  perform public._validar_lote_cria(v_madres, v_cria, p_fecha);

  perform public._actualizar_actividad(v_act, p_fecha, v_madres.id, p_notas, p_responsables);
  perform public._cargar_paricion(v_act.id, v_madres, v_cria, p_fecha, p_lineas, p_nacidos_muertos);
  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'parición');
  return v_act.id;
end;
$$;

create function public.editar_sanidad(
  p_actividad_id uuid,
  p_lotes        uuid[],
  p_fecha        date,
  p_productos    jsonb,   -- [{"id"?, "producto", "categoria", "dosis"?, "via"?, "carencia_dias"?, "fecha_proxima_dosis"?}]
  p_responsables uuid[] default null,
  p_notas        text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.actividades := public._actividad_para_editar(p_actividad_id);
  v_ctx jsonb;
begin
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));
  v_ctx := public._empezar_edicion(v_act.id, 'sanidad', p_lotes);
  perform public._bloquear_lotes_actividad(v_act.establecimiento_id, p_lotes, p_fecha);
  perform public._actualizar_actividad(v_act, p_fecha, null, p_notas, p_responsables);
  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select v_act.id, x, v_act.establecimiento_id, 'principal' from unnest(p_lotes) x;
  perform public._cargar_productos_sanidad(v_act.id, v_act.establecimiento_id, p_fecha, p_productos, true);
  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'sanidad');
  return v_act.id;
end;
$$;

create function public.editar_servicio(
  p_actividad_id    uuid,
  p_lote_id         uuid,
  p_fecha           date,
  p_vacas_entoradas int,
  p_toros           int    default null,
  p_responsables    uuid[] default null,
  p_notas           text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act  public.actividades := public._actividad_para_editar(p_actividad_id);
  v_ctx  jsonb;
  v_lote public.lotes;
begin
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));
  v_ctx := public._empezar_edicion(v_act.id, 'servicio', array[p_lote_id]);
  v_lote := public._lote_para_editar(v_act, p_lote_id, p_fecha);
  perform public._actualizar_actividad(v_act, p_fecha, v_lote.id, p_notas, p_responsables);
  perform public._cargar_servicio(v_act.id, v_act.establecimiento_id, p_vacas_entoradas, p_toros);
  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'servicio');
  return v_act.id;
end;
$$;

create function public.editar_diagnostico(
  p_actividad_id         uuid,
  p_lote_id              uuid,
  p_fecha                date,
  p_vacas_diagnosticadas int,
  p_vacas_prenadas       int,
  p_responsables         uuid[] default null,
  p_notas                text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act  public.actividades := public._actividad_para_editar(p_actividad_id);
  v_ctx  jsonb;
  v_lote public.lotes;
begin
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));
  v_ctx := public._empezar_edicion(v_act.id, 'diagnostico_gestacion', array[p_lote_id]);
  v_lote := public._lote_para_editar(v_act, p_lote_id, p_fecha);
  perform public._actualizar_actividad(v_act, p_fecha, v_lote.id, p_notas, p_responsables);
  perform public._cargar_diagnostico(v_act.id, v_act.establecimiento_id, p_vacas_diagnosticadas, p_vacas_prenadas);
  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'diagnóstico');
  return v_act.id;
end;
$$;

create function public.editar_esquila(
  p_actividad_id  uuid,
  p_lotes         uuid[],
  p_fecha         date,
  p_kg_lana_total numeric,
  p_responsables  uuid[] default null,
  p_notas         text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.actividades := public._actividad_para_editar(p_actividad_id);
  v_ctx jsonb;
begin
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));
  v_ctx := public._empezar_edicion(v_act.id, 'esquila', p_lotes);
  perform public._bloquear_lotes_actividad(v_act.establecimiento_id, p_lotes, p_fecha);
  perform public._actualizar_actividad(v_act, p_fecha, null, p_notas, p_responsables);
  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select v_act.id, x, v_act.establecimiento_id, 'principal' from unnest(p_lotes) x;
  perform public._cargar_esquila(v_act.id, v_act.establecimiento_id, p_lotes, p_kg_lana_total);
  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'esquila');
  return v_act.id;
end;
$$;

create function public.editar_personalizada(
  p_actividad_id uuid,
  p_lotes        uuid[],
  p_fecha        date,
  p_nombre       text,
  p_campos       jsonb  default null,
  p_responsables uuid[] default null,
  p_notas        text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.actividades := public._actividad_para_editar(p_actividad_id);
  v_ctx jsonb;
begin
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));
  v_ctx := public._empezar_edicion(v_act.id, 'personalizada', p_lotes);
  perform public._bloquear_lotes_actividad(v_act.establecimiento_id, p_lotes, p_fecha);
  perform public._actualizar_actividad(v_act, p_fecha, null, p_notas, p_responsables);
  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  select v_act.id, x, v_act.establecimiento_id, 'principal' from unnest(p_lotes) x;
  perform public._cargar_personalizada(v_act.id, v_act.establecimiento_id, p_nombre, p_campos);
  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'personalizada');
  return v_act.id;
end;
$$;

-- Destete: los destinos son los mismos lotes (p_destinos: [{"lote_id", "lineas"}], uno por cada
-- destino actual, sin agregar ni sacar). Solo si los destinos no tuvieron otros movimientos ni una
-- pesada (como para eliminarlo).
create function public.editar_destete(
  p_actividad_id uuid,
  p_fecha        date,
  p_origenes     jsonb,   -- [{"lote_id", "lineas": [{"categoria_id", "cabezas"}]}]
  p_destinos     jsonb,   -- [{"lote_id", "lineas": [{"categoria_id", "cabezas"}]}]
  p_responsables uuid[] default null,
  p_notas        text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act      public.actividades := public._actividad_para_editar(p_actividad_id);
  v_ctx      jsonb;
  v_lote     public.lotes;
  v_actuales uuid[];
  v_nuevos   uuid[];
  v_origenes uuid[];
  v_id       uuid;
  v_nombre   text;
  o          record;
begin
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Indicá los lotes de destino' using errcode = '22023';
  end if;
  if p_origenes is null or jsonb_typeof(p_origenes) <> 'array' or jsonb_array_length(p_origenes) = 0 then
    raise exception 'Indicá al menos un lote de origen' using errcode = '22023';
  end if;
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));

  -- Los destinos son los mismos de siempre: ni nuevos ni de menos
  select coalesce(array_agg(al.lote_id order by al.lote_id), '{}') into v_actuales
  from public.actividad_lotes al where al.actividad_id = v_act.id and al.rol = 'destino';
  begin
    select coalesce(array_agg(distinct (x ->> 'lote_id')::uuid order by (x ->> 'lote_id')::uuid), '{}') into v_nuevos
    from jsonb_array_elements(p_destinos) x;
  exception when others then
    raise exception 'Cada lote de destino necesita su lote' using errcode = '22023';
  end;
  if v_nuevos is distinct from v_actuales or cardinality(v_nuevos) <> jsonb_array_length(p_destinos) then
    raise exception 'Los lotes de destino de un destete no se cambian: para agregar o sacar uno, eliminalo y cargalo de nuevo'
      using errcode = '22023';
  end if;
  select coalesce(array_agg((x ->> 'lote_id')::uuid), '{}') into v_origenes
  from jsonb_array_elements(p_origenes) x where jsonb_typeof(x) = 'object' and nullif(x ->> 'lote_id', '') is not null;

  v_ctx := public._empezar_edicion(v_act.id, 'destete', v_origenes || v_actuales);

  -- Como para eliminarlo: los destinos seguían abiertos (estado antes de empezar) y no tuvieron otros
  -- movimientos (los del destete ya se borraron: los que quedan son de otros) ni una pesada
  for v_lote in select l.* from public.lotes l where l.id = any (v_actuales) order by l.nombre loop
    if exists (select 1 from jsonb_array_elements(v_ctx -> 'lotes') x
               where (x ->> 'id')::uuid = v_lote.id and x ->> 'estado' <> 'activo')
       or exists (select 1 from public.lote_eventos e where e.lote_id = v_lote.id)
       or exists (select 1 from public.actividad_lotes ap
                  join public.actividades a on a.id = ap.actividad_id
                  where ap.lote_id = v_lote.id and a.tipo = 'pesada' and a.anulada_en is null) then
      raise exception 'El lote % ya tuvo movimientos o una pesada después del destete: eliminalos primero', v_lote.nombre
        using errcode = '22023';
    end if;
    perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  end loop;

  select * into o from public._origenes_destete(v_act.establecimiento_id, p_origenes, p_fecha);
  if exists (select 1 from public.lotes l where l.id = any (v_actuales) and l.especie_id <> o.especie_id) then
    raise exception 'Los lotes de origen tienen que ser de la misma especie que los de destino' using errcode = '22023';
  end if;

  perform public._actualizar_actividad(v_act, p_fecha, null, nullif(btrim(coalesce(p_notas, '')), ''), p_responsables);
  perform public._cargar_destete(v_act.id, v_act.establecimiento_id, p_fecha, o.especie_id, o.lotes, p_origenes, p_destinos, false);
  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'destete');

  -- El origen que queda vacío se cierra ("Destetado"), como al registrar
  foreach v_id in array o.lotes loop
    select * into v_lote from public.lotes where id = v_id;
    if v_lote.estado = 'activo' and not exists (
      select 1 from public.lote_eventos e where e.lote_id = v_id group by e.categoria_id having sum(e.cabezas) <> 0
    ) then
      if exists (select 1 from public.lote_eventos e where e.lote_id = v_id and e.fecha > p_fecha) then
        raise exception 'El lote % queda vacío: el destete no puede ser anterior a su último movimiento', v_lote.nombre
          using errcode = '22023';
      end if;
      perform public._cerrar_si_vacio(v_id, p_fecha, 'Destetado');
    end if;
  end loop;

  return v_act.id;
end;
$$;

revoke execute on function public.editar_mortandad(uuid, uuid, date, jsonb, text, text, uuid[], text)  from public, anon;
revoke execute on function public.editar_paricion(uuid, uuid, date, jsonb, int, uuid, uuid[], text)    from public, anon;
revoke execute on function public.editar_sanidad(uuid, uuid[], date, jsonb, uuid[], text)              from public, anon;
revoke execute on function public.editar_servicio(uuid, uuid, date, int, int, uuid[], text)            from public, anon;
revoke execute on function public.editar_diagnostico(uuid, uuid, date, int, int, uuid[], text)         from public, anon;
revoke execute on function public.editar_esquila(uuid, uuid[], date, numeric, uuid[], text)            from public, anon;
revoke execute on function public.editar_personalizada(uuid, uuid[], date, text, jsonb, uuid[], text)  from public, anon;
revoke execute on function public.editar_destete(uuid, date, jsonb, jsonb, uuid[], text)               from public, anon;
grant  execute on function public.editar_mortandad(uuid, uuid, date, jsonb, text, text, uuid[], text)  to authenticated;
grant  execute on function public.editar_paricion(uuid, uuid, date, jsonb, int, uuid, uuid[], text)    to authenticated;
grant  execute on function public.editar_sanidad(uuid, uuid[], date, jsonb, uuid[], text)              to authenticated;
grant  execute on function public.editar_servicio(uuid, uuid, date, int, int, uuid[], text)            to authenticated;
grant  execute on function public.editar_diagnostico(uuid, uuid, date, int, int, uuid[], text)         to authenticated;
grant  execute on function public.editar_esquila(uuid, uuid[], date, numeric, uuid[], text)            to authenticated;
grant  execute on function public.editar_personalizada(uuid, uuid[], date, text, jsonb, uuid[], text)  to authenticated;
grant  execute on function public.editar_destete(uuid, date, jsonb, jsonb, uuid[], text)               to authenticated;

commit;
