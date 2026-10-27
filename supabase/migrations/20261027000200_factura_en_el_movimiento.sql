-- Campo Digital v2 — Economía: "Factura a nombre de" se escribe en cada movimiento (sin catálogo)
--
-- Pedido de Iñaki (2026-10-27): las razones sociales no se cargan antes; son un dato que se pone al cargar
-- cada ingreso o gasto. Reemplaza lo de 20261027000100:
--   1. movimientos_economicos: facturado_a_id (FK a razones_sociales) pasa a ser factura_nombre (texto,
--      hasta 120 caracteres) y factura_rut (opcional, 12 dígitos). numero_comprobante no cambia.
--      Siguen siendo solo datos del comprobante: no entran en los saldos ni en el resultado.
--   2. Se borra la tabla razones_sociales (con sus políticas y permisos): no tenía movimientos (la carga
--      todavía no la usaba).
--   3. _guardar_pago_y_factura lee del precio "factura_nombre", "factura_rut" y "numero_comprobante"
--      (además de "pagador_id"). El RUT se acepta con espacios, puntos o guiones y se guarda solo con dígitos.
--      Las funciones de carga y edición no cambian: siguen llamándola igual.
--
-- La app sugiere los nombres ya usados en otros movimientos (los lee de movimientos_economicos).
-- Auditoría: 100 funciones (sin cambio) y 25 filas de permisos (razones_sociales tenía 3).

begin;

alter table public.movimientos_economicos drop constraint movimientos_economicos_facturado_fkey;
drop index public.movimientos_economicos_facturado_idx;
alter table public.movimientos_economicos drop column facturado_a_id;

alter table public.movimientos_economicos
  add column factura_nombre text,
  add column factura_rut    text,
  add constraint movimientos_economicos_factura_nombre_check
    check (factura_nombre is null or (btrim(factura_nombre) <> '' and length(factura_nombre) <= 120)),
  add constraint movimientos_economicos_factura_rut_check
    check (factura_rut is null or factura_rut ~ '^[0-9]{12}$');

drop table public.razones_sociales;

-- Pagador y datos de factura de un movimiento, desde el precio (reemplaza lo que hubiera: una clave que
-- no viene queda vacía). El pagador tiene que ser del establecimiento y estar activo, salvo que ya
-- estuviera en ese movimiento (al editar). Si hay pagador, queda como el último del usuario que carga.
create or replace function public._guardar_pago_y_factura(p_movimiento_id uuid, p_precio jsonb) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_mov         public.movimientos_economicos;
  v_pagador     uuid;
  v_nombre      text := nullif(btrim(coalesce(p_precio ->> 'factura_nombre', '')), '');
  v_rut         text := nullif(regexp_replace(coalesce(p_precio ->> 'factura_rut', ''), '[\s.-]', '', 'g'), '');
  v_comprobante text := nullif(btrim(coalesce(p_precio ->> 'numero_comprobante', '')), '');
begin
  select * into v_mov from public.movimientos_economicos where id = p_movimiento_id;
  begin
    v_pagador := nullif(p_precio ->> 'pagador_id', '')::uuid;
  exception when others then
    raise exception 'Quién pagó o cobró tiene que ser válido' using errcode = '22023';
  end;

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
  set pagador_id = v_pagador, factura_nombre = v_nombre, factura_rut = v_rut, numero_comprobante = v_comprobante
  where id = v_mov.id
    and (pagador_id, factura_nombre, factura_rut, numero_comprobante) is distinct from (v_pagador, v_nombre, v_rut, v_comprobante);

  if v_pagador is not null and auth.uid() is not null then
    insert into public.preferencias_economia (user_id, establecimiento_id, ultimo_pagador_id, updated_at)
    values (auth.uid(), v_mov.establecimiento_id, v_pagador, now())
    on conflict (user_id, establecimiento_id) do update
      set ultimo_pagador_id = excluded.ultimo_pagador_id, updated_at = excluded.updated_at;
  end if;
end;
$$;

commit;
