-- Campo Digital v2 — Arreglo de proteger_dato_de_actividad
--
-- En 20261104000300, el caso del UPDATE de act_sanidad_productos leía new.id en la misma condición
-- que tg_table_name. PL/pgSQL resuelve los campos de NEW al evaluar la expresión: en las tablas sin
-- columna id (actividad_lineas, actividad_responsables, act_*) un rechazo daba 42703 ("record new has
-- no field id") en lugar del 42501 con su mensaje. Se rechazaba igual, pero con el error equivocado.
-- Ahora el caso de los productos va en un IF propio, que solo se evalúa en esa tabla.
-- La edición y la eliminación no cambian: el DELETE con la marca se acepta antes de llegar ahí.

begin;

create or replace function public.proteger_dato_de_actividad() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and public._actividad_marcada(old.actividad_id) then
    return old;
  end if;
  -- Un producto de sanidad se edita por id, sin cambiar de sanidad (solo esta tabla tiene id)
  if tg_op = 'UPDATE' and tg_table_name = 'act_sanidad_productos' then
    if public._actividad_marcada(old.actividad_id)
       and (new.id, new.actividad_id, new.establecimiento_id) = (old.id, old.actividad_id, old.establecimiento_id) then
      return new;
    end if;
  end if;
  if tg_table_name in ('lote_eventos', 'operaciones_lote') then
    raise exception '% es inmutable: los errores se corrigen con un evento de ajuste', tg_table_name using errcode = '42501';
  end if;
  raise exception '% no se modifica directamente: la actividad se edita o se elimina', tg_table_name using errcode = '42501';
end;
$$;

commit;
