-- Campo Digital v2 — Editar compra, venta y pesada (paso 2a)
--
-- Diseño: contexto/DISENO-EDITAR-ACTIVIDADES.md, aprobado el 2026-11-04 (secciones 4 y 5; paso 2a).
-- Requiere 20261104000100_eliminar_actividades (marca, excepción de los triggers y versiones).
--
--   1. Esqueleto común de la edición, que reusan los otros tipos en el paso 2b:
--      * _empezar_edicion: bloquea la actividad y TODOS los lotes involucrados (los de la versión
--        vieja y los de la nueva, ordenados por id), guarda la versión anterior, borra con la marca
--        los eventos de stock, las líneas, el detalle, los lotes y los responsables, y reabre sin
--        registro los lotes viejos que estaban cerrados (para poder volver a cargar sobre ellos).
--        Devuelve el estado inicial de cada lote y los pares lote/categoría que tenían eventos.
--      * _terminar_edicion: valida el saldo una sola vez, día por día, en todos los pares tocados
--        (los de antes y los de ahora), y revisa el cierre y la reapertura de todos los lotes
--        involucrados. Si un lote termina igual que empezó, no deja registros.
--   2. Las registrar_<tipo> se parten: la parte compartida (_cargar_compraventa, _cargar_pesada)
--      carga lo que no es la fila de la actividad y recibe p_validar_saldo. Al registrar valida como
--      antes; al editar no (lo hace _terminar_edicion). registrar_compra, registrar_venta y
--      registrar_pesada mantienen su firma y su comportamiento.
--   3. _actualizar_movimiento_actividad: el precio edita el MISMO movimiento (conserva pagador,
--      factura, identificador, comentario, archivos y titulares). Sin precio se anula; con precio y
--      sin movimiento se crea. Reparto: si cambia el total, con un solo titular por el total su monto
--      sigue al total; con otro monto o con dos o más titulares se bloquea.
--   4. editar_compra, editar_venta y editar_pesada (administrador y operador).
--      * Compra que creó un lote: el destino queda fijo en ese lote.
--      * Venta que pasa del lote A al B: A se reabre (si la venta lo había cerrado) y B se cierra si
--        queda en cero.
--
-- Auditoría: +10 funciones (_lotes_de_actividad, _empezar_edicion, _terminar_edicion,
-- _cargar_compraventa, _cargar_pesada, _actualizar_movimiento_actividad, _responsables_de_actividad,
-- editar_compra, editar_venta, editar_pesada).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Esqueleto de la edición
-- ════════════════════════════════════════════════════════════════════════════

-- Los lotes de una actividad: los de sus eventos y los de actividad_lotes
create function public._lotes_de_actividad(p_actividad_id uuid) returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
  from (
    select e.lote_id as x from public.lote_eventos e where e.actividad_id = p_actividad_id
    union
    select al.lote_id from public.actividad_lotes al where al.actividad_id = p_actividad_id
  ) l
  where x is not null
$$;

-- Los responsables actuales de una actividad (para aceptar los inactivos que ya tenía)
create function public._responsables_de_actividad(p_actividad_id uuid) returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(r.persona_id order by r.persona_id), '{}'::uuid[])
  from public.actividad_responsables r where r.actividad_id = p_actividad_id
$$;

-- Empieza la edición de una actividad. p_lotes_nuevos: los lotes de la versión nueva.
-- Devuelve {"lotes": [{"id", "estado", "fecha_cierre", "ultimo_evento", "viejo"}], "pares": [{"lote_id", "categoria_id"}]}
create function public._empezar_edicion(p_actividad_id uuid, p_tipo text, p_lotes_nuevos uuid[]) returns jsonb
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

  -- Deshacer la versión vieja (con la marca): sin eventos inversos
  perform public._marcar_actividad(v_act.id);
  delete from public.lote_eventos           where actividad_id = v_act.id;
  delete from public.actividad_lineas       where actividad_id = v_act.id;
  delete from public.act_compraventa        where actividad_id = v_act.id;
  delete from public.actividad_lotes        where actividad_id = v_act.id;
  delete from public.actividad_responsables where actividad_id = v_act.id;

  -- Los lotes viejos cerrados se reabren sin registro, para volver a cargar sobre ellos;
  -- _terminar_edicion los deja como corresponda (y sin registros si terminan igual)
  update public.lotes set estado = 'activo', fecha_cierre = null
  where id = any (v_viejos) and estado = 'cerrado';

  return v_ctx;
end;
$$;

-- Termina la edición: saldo una vez y cierre o reapertura de todos los lotes involucrados.
-- p_cerrar_vacio: el lote que se cierra solo si queda en cero (el de la venta), con p_motivo_cierre.
create function public._terminar_edicion(
  p_actividad_id uuid, p_ctx jsonb, p_fecha date, p_nombre text,
  p_cerrar_vacio uuid default null, p_motivo_cierre text default null
) returns void
language plpgsql
set search_path = ''
as $$
declare
  r        record;
  v_lote   public.lotes;
  v_tiene  boolean;
  v_ultimo date;
  v_cierre date;
begin
  -- 1. Saldo día por día en todos los pares tocados, los de antes y los de ahora
  for r in
    select (x ->> 'lote_id')::uuid as lote_id, (x ->> 'categoria_id')::uuid as categoria_id
    from jsonb_array_elements(p_ctx -> 'pares') x
    union
    select e.lote_id, e.categoria_id from public.lote_eventos e where e.actividad_id = p_actividad_id
  loop
    perform public._validar_saldo(r.lote_id, r.categoria_id);
  end loop;

  -- 2. Cierre y reapertura de todos los lotes involucrados
  for r in
    select (x ->> 'id')::uuid as id, x ->> 'estado' as estado, (x ->> 'fecha_cierre')::date as fecha_cierre,
           (x ->> 'ultimo_evento')::date as ultimo_evento
    from jsonb_array_elements(p_ctx -> 'lotes') x
  loop
    select * into v_lote from public.lotes where id = r.id;
    v_tiene := exists (
      select 1 from public.lote_eventos e where e.lote_id = r.id group by e.categoria_id having sum(e.cabezas) <> 0);

    if v_tiene then
      -- Estaba cerrado y ahora tiene animales: queda abierto, con su registro de reapertura
      if r.estado = 'cerrado' and v_lote.estado = 'activo' then
        insert into public.lote_cambios_estado (establecimiento_id, lote_id, tipo, fecha, motivo)
        values (v_lote.establecimiento_id, r.id, 'reapertura', greatest(public.fecha_hoy(), r.fecha_cierre),
                'Edición de ' || p_nombre);
      end if;
    elsif r.estado = 'cerrado' and v_lote.estado = 'activo' then
      -- Estaba cerrado y sigue vacío: vuelve a cerrarse sin registro. Si se había cerrado en su último
      -- movimiento (como una venta), la fecha sigue al último movimiento de ahora; si no, se conserva.
      select max(e.fecha) into v_ultimo from public.lote_eventos e where e.lote_id = r.id;
      v_cierre := case when r.fecha_cierre is not distinct from r.ultimo_evento
                       then coalesce(v_ultimo, r.fecha_cierre)
                       else greatest(r.fecha_cierre, coalesce(v_ultimo, r.fecha_cierre)) end;
      update public.lotes set estado = 'cerrado', fecha_cierre = v_cierre where id = r.id;
    elsif r.id = p_cerrar_vacio then
      perform public._cerrar_si_vacio(r.id, p_fecha, p_motivo_cierre);
    end if;
  end loop;

  perform set_config('campo.actividad_marcada', '', true);
end;
$$;

revoke execute on function public._lotes_de_actividad(uuid)                          from public, anon, authenticated;
revoke execute on function public._responsables_de_actividad(uuid)                   from public, anon, authenticated;
revoke execute on function public._empezar_edicion(uuid, text, uuid[])               from public, anon, authenticated;
revoke execute on function public._terminar_edicion(uuid, jsonb, date, text, uuid, text) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Partes compartidas de la carga
-- ════════════════════════════════════════════════════════════════════════════

-- Compra o venta: detalle, líneas y eventos (+ en la compra, - en la venta). El lote ya está
-- bloqueado y validado. Con p_validar_saldo, la venta valida el saldo de sus categorías.
create function public._cargar_compraventa(
  p_id uuid, p_lote public.lotes, p_fecha date, p_lineas jsonb, p_tipo text,
  p_modalidad text, p_contraparte text, p_kg_gancho numeric, p_validar_saldo boolean
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_cat uuid;
begin
  if p_kg_gancho is not null and round(p_kg_gancho, 2) <= 0 then
    raise exception 'Los kg al gancho tienen que ser mayores a cero (hasta dos decimales)' using errcode = '22023';
  end if;

  insert into public.act_compraventa (actividad_id, establecimiento_id, modalidad, contraparte, kg_gancho)
  values (p_id, p_lote.establecimiento_id, p_modalidad, nullif(btrim(coalesce(p_contraparte, '')), ''), round(p_kg_gancho, 2));

  perform public._insertar_lineas(p_id, p_lote.establecimiento_id, p_lote.especie_id, p_lineas, 'opcional');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select p_lote.establecimiento_id, p_lote.id, p_lote.especie_id, l.categoria_id,
         case when p_tipo = 'venta' then -l.cabezas else l.cabezas end, p_fecha, p_tipo, p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  if p_validar_saldo and p_tipo = 'venta' then
    for v_cat in select l.categoria_id from public.actividad_lineas l where l.actividad_id = p_id loop
      perform public._validar_saldo(p_lote.id, v_cat);
    end loop;
  end if;
end;
$$;

-- Pesada: líneas con peso obligatorio y no más cabezas que el stock de la categoría ese día.
-- No mueve stock: no tiene saldo que validar.
create function public._cargar_pesada(p_id uuid, p_lote public.lotes, p_fecha date, p_lineas jsonb) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_cat uuid;
  v_cab int;
begin
  perform public._insertar_lineas(p_id, p_lote.establecimiento_id, p_lote.especie_id, p_lineas, 'obligatorio');

  for v_cat, v_cab in select l.categoria_id, l.cabezas from public.actividad_lineas l where l.actividad_id = p_id loop
    if v_cab > public._stock_categoria_al(p_lote.id, v_cat, p_fecha) then
      raise exception 'Se pesan más cabezas de las que había en la categoría ese día (%)',
        public._stock_categoria_al(p_lote.id, v_cat, p_fecha) using errcode = '23514';
    end if;
  end loop;
end;
$$;

revoke execute on function public._cargar_compraventa(uuid, public.lotes, date, jsonb, text, text, text, numeric, boolean) from public, anon, authenticated;
revoke execute on function public._cargar_pesada(uuid, public.lotes, date, jsonb)                                         from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Precio de una compra o venta al editar
-- ════════════════════════════════════════════════════════════════════════════
-- Edita el mismo movimiento. Lo que p_precio no trae (pagador, factura, identificador, comentario,
-- rubro, concepto) queda como estaba; una clave presente con null lo borra. Los titulares no vienen
-- en el precio: se conservan, con la regla del reparto si cambia el total.

create function public._actualizar_movimiento_actividad(
  p_actividad_id uuid, p_lote public.lotes, p_fecha date, p_sentido text, p_concepto text,
  p_contraparte text, p_precio jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_mov      public.movimientos_economicos;
  v          record;
  f          record;
  v_precio   jsonb;
  v_rubro    uuid;
  v_concepto uuid;
  v_vence    date;
  v_tit      int;
  v_tit_monto numeric;
begin
  select * into v_mov from public.movimientos_economicos
  where actividad_id = p_actividad_id and anulado_en is null
  order by created_at, id limit 1
  for update;

  -- Sin precio: el movimiento que había se anula
  if p_precio is null then
    if v_mov.id is not null then
      update public.movimientos_economicos
      set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = 'Precio quitado al editar la actividad'
      where id = v_mov.id;
    end if;
    return;
  end if;

  -- Con precio y sin movimiento: se crea, como al registrar
  if v_mov.id is null then
    perform public._registrar_movimiento(
      p_lote.establecimiento_id, p_actividad_id, p_lote.id, p_lote.especie_id, p_fecha, p_sentido,
      p_concepto, p_contraparte, p_precio);
    return;
  end if;

  -- Con precio y con movimiento: se edita el mismo
  v_precio := jsonb_build_object(
    'pagador_id', v_mov.pagador_id, 'identificador', v_mov.identificador, 'comentario', v_mov.comentario,
    'factura_nombre', v_mov.factura_nombre, 'factura_rut', v_mov.factura_rut,
    'numero_comprobante', v_mov.numero_comprobante,
    'rubro_id', v_mov.rubro_id, 'concepto_id', v_mov.concepto_id
  ) || p_precio;

  select * into v from public._precio_valido(v_precio);
  if v.fecha_pago < p_fecha then
    raise exception 'La fecha de pago no puede ser anterior a la de la actividad' using errcode = '22023';
  end if;
  if v.estado = 'pendiente' then
    begin
      v_vence := nullif(v_precio ->> 'vencimiento', '')::date;
    exception when others then
      raise exception 'La fecha prevista de cobro o pago tiene que ser válida' using errcode = '22023';
    end;
    if v_vence < p_fecha then
      raise exception 'La fecha prevista de cobro o pago no puede ser anterior a la de la actividad' using errcode = '22023';
    end if;
  end if;

  begin
    v_rubro    := nullif(v_precio ->> 'rubro_id', '')::uuid;
    v_concepto := nullif(v_precio ->> 'concepto_id', '')::uuid;
  exception when others then
    raise exception 'El rubro y el concepto tienen que ser válidos' using errcode = '22023';
  end;
  if v_rubro is null then
    v_rubro := public._rubro_de_especie(p_lote.establecimiento_id, p_lote.especie_id);
    if v_rubro is null then
      raise exception 'Elegí el rubro del movimiento' using errcode = '22023';
    end if;
  elsif not exists (select 1 from public.rubros r where r.id = v_rubro and r.establecimiento_id = p_lote.establecimiento_id
                    and (r.activo or r.id = v_mov.rubro_id)) then
    raise exception 'Elegí un rubro activo del establecimiento' using errcode = '22023';
  end if;
  if v_concepto is null then
    v_concepto := public._concepto_por_defecto(p_lote.establecimiento_id, p_sentido, p_lote.especie_id);
  elsif not exists (select 1 from public.conceptos c where c.id = v_concepto and c.establecimiento_id = p_lote.establecimiento_id
                    and c.tipo = p_sentido and (c.activo or c.id = v_mov.concepto_id)) then
    raise exception 'El concepto no es de este establecimiento o no corresponde (ingreso o gasto)' using errcode = '22023';
  end if;

  -- Reparto entre titulares si cambia el total: un solo titular por el total actual sigue al total
  -- nuevo; un solo titular con otro monto, o dos o más, bloquean
  if v.monto <> v_mov.monto_original then
    select count(*), min(t.monto) into v_tit, v_tit_monto from public.movimiento_titulares t where t.movimiento_id = v_mov.id;
    if v_tit > 1 or (v_tit = 1 and v_tit_monto <> v_mov.monto_original) then
      raise exception 'El movimiento está repartido entre titulares: ajustá primero el reparto en Economía' using errcode = '22023';
    end if;
  end if;

  select * into f from public._fuente_tipo_cambio(v_precio, v.moneda, v.tipo_cambio, p_fecha);

  update public.movimientos_economicos
  set fecha = p_fecha, rubro_id = v_rubro, concepto = p_concepto, concepto_id = v_concepto,
      contraparte = nullif(btrim(coalesce(p_contraparte, '')), ''), lote_id = p_lote.id,
      monto_original = v.monto, moneda_original = v.moneda, tipo_cambio = v.tipo_cambio,
      tipo_cambio_fuente = f.fuente, tipo_cambio_fecha = f.fecha,
      estado = v.estado, fecha_pago = v.fecha_pago, fecha_vencimiento = v_vence,
      editado_en = now(), editado_por = auth.uid()
  where id = v_mov.id;

  if v.monto <> v_mov.monto_original and v_tit = 1 then
    update public.movimiento_titulares set monto = v.monto where movimiento_id = v_mov.id;
  end if;

  perform public._guardar_pago_y_factura(v_mov.id, v_precio);
end;
$$;

revoke execute on function public._actualizar_movimiento_actividad(uuid, public.lotes, date, text, text, text, jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Registrar: misma firma y comportamiento, con las partes compartidas
-- ════════════════════════════════════════════════════════════════════════════

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
  p_responsables       uuid[] default null,
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
  perform public._validar_responsables(p_responsables, p_establecimiento_id);

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

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, lote_creado_id, notas)
  values (p_id, p_establecimiento_id, 'compra', p_fecha, v_lote.id, v_nuevo, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  perform public._cargar_compraventa(p_id, v_lote, p_fecha, p_lineas, 'compra', p_modalidad, p_contraparte, p_kg_gancho, true);

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
  p_responsables uuid[]  default null,
  p_notas       text    default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  public.lotes;
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
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);
  if p_kg_gancho is not null and round(p_kg_gancho, 2) <= 0 then
    raise exception 'Los kg al gancho tienen que ser mayores a cero (hasta dos decimales)' using errcode = '22023';
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'venta', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  perform public._cargar_compraventa(p_id, v_lote, p_fecha, p_lineas, 'venta', p_modalidad, p_contraparte, p_kg_gancho, true);

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

create or replace function public.registrar_pesada(
  p_id         uuid,
  p_lote_id    uuid,
  p_fecha      date,
  p_lineas     jsonb,   -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"}]
  p_responsables uuid[] default null,
  p_notas      text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes;
begin
  if public._actividad_ya_registrada(p_id, (select l.establecimiento_id from public.lotes l where l.id = p_lote_id), 'pesada') then
    return p_id;
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  perform public._validar_responsables(p_responsables, v_lote.establecimiento_id);

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, notas)
  values (p_id, v_lote.establecimiento_id, 'pesada', p_fecha, v_lote.id, p_notas);
  perform public._guardar_responsables_actividad(p_id, p_responsables);

  perform public._cargar_pesada(p_id, v_lote, p_fecha, p_lineas);

  return p_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Editar
-- ════════════════════════════════════════════════════════════════════════════
-- Mismos datos que su registrar_<tipo>, salvo el id (es el de la actividad) y, en la compra, el lote
-- nuevo (el destino de una compra que creó un lote queda fijo en ese lote).

create function public.editar_compra(
  p_actividad_id uuid,
  p_fecha        date,
  p_lineas       jsonb,
  p_modalidad    text,
  p_lote_id      uuid    default null,   -- destino; en una compra que creó su lote, ese lote (o null)
  p_contraparte  text    default null,
  p_kg_gancho    numeric default null,
  p_precio       jsonb   default null,   -- null: sin precio (si había movimiento, se anula)
  p_responsables uuid[]  default null,
  p_notas        text    default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act   public.actividades;
  v_dest  uuid;
  v_ctx   jsonb;
  v_lote  public.lotes;
  v_total int;
begin
  select * into v_act from public.actividades where id = p_actividad_id;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Actividad inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_act.lote_creado_id is not null then
    if p_lote_id is not null and p_lote_id <> v_act.lote_creado_id then
      raise exception 'Esta compra creó su lote: el destino no se cambia' using errcode = '22023';
    end if;
    v_dest := v_act.lote_creado_id;
  else
    if p_lote_id is null then
      raise exception 'Indicá el lote destino' using errcode = '22023';
    end if;
    v_dest := p_lote_id;
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));

  v_ctx := public._empezar_edicion(v_act.id, 'compra', array[v_dest]);

  v_lote := public._bloquear_lote_editable(v_dest);
  if v_lote.establecimiento_id <> v_act.establecimiento_id then
    raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);

  update public.actividades
  set fecha = p_fecha, lote_id = v_lote.id, notas = p_notas, editada_en = now(), editada_por = auth.uid()
  where id = v_act.id;
  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  values (v_act.id, v_lote.id, v_act.establecimiento_id, 'principal');
  perform public._guardar_responsables_actividad(v_act.id, p_responsables);

  perform public._cargar_compraventa(v_act.id, v_lote, p_fecha, p_lineas, 'compra', p_modalidad, p_contraparte, p_kg_gancho, false);

  select sum(l.cabezas) into v_total from public.actividad_lineas l where l.actividad_id = v_act.id;
  perform public._actualizar_movimiento_actividad(
    v_act.id, v_lote, p_fecha, 'egreso', 'Compra de ' || v_total || ' cabezas (' || v_lote.nombre || ')', p_contraparte, p_precio);

  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'compra');
  return v_act.id;
end;
$$;

create function public.editar_venta(
  p_actividad_id uuid,
  p_lote_id      uuid,
  p_fecha        date,
  p_lineas       jsonb,
  p_modalidad    text,
  p_contraparte  text    default null,
  p_kg_gancho    numeric default null,
  p_precio       jsonb   default null,
  p_responsables uuid[]  default null,
  p_notas        text    default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act   public.actividades;
  v_ctx   jsonb;
  v_lote  public.lotes;
  v_total int;
begin
  select * into v_act from public.actividades where id = p_actividad_id;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Actividad inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if p_lote_id is null then
    raise exception 'Indicá el lote' using errcode = '22023';
  end if;
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));

  v_ctx := public._empezar_edicion(v_act.id, 'venta', array[p_lote_id]);

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.establecimiento_id <> v_act.establecimiento_id then
    raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);

  update public.actividades
  set fecha = p_fecha, lote_id = v_lote.id, notas = p_notas, editada_en = now(), editada_por = auth.uid()
  where id = v_act.id;
  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  values (v_act.id, v_lote.id, v_act.establecimiento_id, 'principal');
  perform public._guardar_responsables_actividad(v_act.id, p_responsables);

  perform public._cargar_compraventa(v_act.id, v_lote, p_fecha, p_lineas, 'venta', p_modalidad, p_contraparte, p_kg_gancho, false);

  select sum(l.cabezas) into v_total from public.actividad_lineas l where l.actividad_id = v_act.id;
  perform public._actualizar_movimiento_actividad(
    v_act.id, v_lote, p_fecha, 'ingreso', 'Venta de ' || v_total || ' cabezas (' || v_lote.nombre || ')', p_contraparte, p_precio);

  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'venta', v_lote.id, 'Vendido');
  return v_act.id;
end;
$$;

create function public.editar_pesada(
  p_actividad_id uuid,
  p_lote_id      uuid,
  p_fecha        date,
  p_lineas       jsonb,
  p_responsables uuid[] default null,
  p_notas        text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act  public.actividades;
  v_ctx  jsonb;
  v_lote public.lotes;
begin
  select * into v_act from public.actividades where id = p_actividad_id;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Actividad inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if p_lote_id is null then
    raise exception 'Indicá el lote' using errcode = '22023';
  end if;
  perform public._validar_responsables(p_responsables, v_act.establecimiento_id, public._responsables_de_actividad(v_act.id));

  v_ctx := public._empezar_edicion(v_act.id, 'pesada', array[p_lote_id]);

  v_lote := public._bloquear_lote_editable(p_lote_id);
  if v_lote.establecimiento_id <> v_act.establecimiento_id then
    raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
  end if;
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);

  update public.actividades
  set fecha = p_fecha, lote_id = v_lote.id, notas = p_notas, editada_en = now(), editada_por = auth.uid()
  where id = v_act.id;
  insert into public.actividad_lotes (actividad_id, lote_id, establecimiento_id, rol)
  values (v_act.id, v_lote.id, v_act.establecimiento_id, 'principal');
  perform public._guardar_responsables_actividad(v_act.id, p_responsables);

  perform public._cargar_pesada(v_act.id, v_lote, p_fecha, p_lineas);

  perform public._terminar_edicion(v_act.id, v_ctx, p_fecha, 'pesada');
  return v_act.id;
end;
$$;

revoke execute on function public.editar_compra(uuid, date, jsonb, text, uuid, text, numeric, jsonb, uuid[], text) from public, anon;
revoke execute on function public.editar_venta(uuid, uuid, date, jsonb, text, text, numeric, jsonb, uuid[], text)  from public, anon;
revoke execute on function public.editar_pesada(uuid, uuid, date, jsonb, uuid[], text)                             from public, anon;
grant  execute on function public.editar_compra(uuid, date, jsonb, text, uuid, text, numeric, jsonb, uuid[], text) to authenticated;
grant  execute on function public.editar_venta(uuid, uuid, date, jsonb, text, text, numeric, jsonb, uuid[], text)  to authenticated;
grant  execute on function public.editar_pesada(uuid, uuid, date, jsonb, uuid[], text)                             to authenticated;

commit;
