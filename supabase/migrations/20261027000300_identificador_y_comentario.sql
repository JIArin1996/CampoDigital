-- Campo Digital v2 — Economía: identificador y comentario de cada movimiento
--
-- Pedido de Iñaki (2026-10-27), al revisar el listado de Movimientos:
--   1. movimientos_economicos.identificador: el nombre propio del movimiento (ej. "Venta terneras refugo"), lo que
--      más se destaca en la tabla; el concepto del catálogo (ej. "Venta ganado") pasa a ser otra columna.
--      Opcional, hasta 120 caracteres. Sin identificador, la app muestra el texto del concepto (los movimientos
--      que ya existen y los de una compra o venta: "Venta de 20 terneras").
--   2. movimientos_economicos.comentario: texto libre opcional, hasta 2000 caracteres. No se ve en la tabla,
--      solo en el detalle.
--   3. _guardar_pago_y_factura lee además "identificador" y "comentario" del precio (sin espacios de más; en
--      blanco = sin dato). Como las funciones de carga y edición ya la llaman (registrar_movimiento,
--      editar_movimiento, cargar_precio_actividad y la compra o venta), los dos datos se cargan en todas sin
--      cambiarlas. Al editar, una clave que no viene queda vacía, como la factura.
--
-- No cambian los saldos ni el resultado. Auditoría: 100 funciones y 25 filas de permisos (sin cambio).

begin;

alter table public.movimientos_economicos
  add column identificador text,
  add column comentario    text,
  add constraint movimientos_economicos_identificador_check
    check (identificador is null or (btrim(identificador) <> '' and length(identificador) <= 120)),
  add constraint movimientos_economicos_comentario_check
    check (comentario is null or (btrim(comentario) <> '' and length(comentario) <= 2000));

-- Pagador, identificador, comentario y datos de factura de un movimiento, desde el precio (reemplaza lo que
-- hubiera: una clave que no viene queda vacía). El pagador tiene que ser del establecimiento y estar activo,
-- salvo que ya estuviera en ese movimiento (al editar). Si hay pagador, queda como el último del usuario que carga.
create or replace function public._guardar_pago_y_factura(p_movimiento_id uuid, p_precio jsonb) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_mov           public.movimientos_economicos;
  v_pagador       uuid;
  v_identificador text := nullif(btrim(coalesce(p_precio ->> 'identificador', '')), '');
  v_comentario    text := nullif(btrim(coalesce(p_precio ->> 'comentario', '')), '');
  v_nombre        text := nullif(btrim(coalesce(p_precio ->> 'factura_nombre', '')), '');
  v_rut           text := nullif(regexp_replace(coalesce(p_precio ->> 'factura_rut', ''), '[\s.-]', '', 'g'), '');
  v_comprobante   text := nullif(btrim(coalesce(p_precio ->> 'numero_comprobante', '')), '');
begin
  select * into v_mov from public.movimientos_economicos where id = p_movimiento_id;
  begin
    v_pagador := nullif(p_precio ->> 'pagador_id', '')::uuid;
  exception when others then
    raise exception 'Quién pagó o cobró tiene que ser válido' using errcode = '22023';
  end;

  if length(v_identificador) > 120 then
    raise exception 'El identificador tiene hasta 120 caracteres' using errcode = '22023';
  end if;
  if length(v_comentario) > 2000 then
    raise exception 'El comentario tiene hasta 2000 caracteres' using errcode = '22023';
  end if;
  if length(v_nombre) > 120 then
    raise exception 'El nombre de la factura tiene hasta 120 caracteres' using errcode = '22023';
  end if;
  if v_rut !~ '^[0-9]{12}$' then
    raise exception 'El RUT tiene 12 dígitos' using errcode = '22023';
  end if;
  if length(v_comprobante) > 50 then
    raise exception 'El número de comprobante tiene hasta 50 caracteres' using errcode = '22023';
  end if;
  if v_pagador is not null and v_pagador is distinct from v_mov.pagador_id and not exists (
    select 1 from public.pagadores p where p.id = v_pagador and p.establecimiento_id = v_mov.establecimiento_id and p.activo
  ) then
    raise exception 'Elegí quién pagó o cobró entre los activos del establecimiento' using errcode = '22023';
  end if;

  update public.movimientos_economicos
  set pagador_id = v_pagador, identificador = v_identificador, comentario = v_comentario,
      factura_nombre = v_nombre, factura_rut = v_rut, numero_comprobante = v_comprobante
  where id = v_mov.id
    and (pagador_id, identificador, comentario, factura_nombre, factura_rut, numero_comprobante)
        is distinct from (v_pagador, v_identificador, v_comentario, v_nombre, v_rut, v_comprobante);

  if v_pagador is not null and auth.uid() is not null then
    insert into public.preferencias_economia (user_id, establecimiento_id, ultimo_pagador_id, updated_at)
    values (auth.uid(), v_mov.establecimiento_id, v_pagador, now())
    on conflict (user_id, establecimiento_id) do update
      set ultimo_pagador_id = excluded.ultimo_pagador_id, updated_at = excluded.updated_at;
  end if;
end;
$$;

commit;
