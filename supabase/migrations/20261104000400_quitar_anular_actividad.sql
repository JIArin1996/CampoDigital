-- Campo Digital v2 — Se borra anular_actividad (paso 3)
--
-- Diseño: contexto/DISENO-EDITAR-ACTIVIDADES.md (paso 3). Desde 20261104000100, anular_actividad era
-- un alias de eliminar_actividad para que la app de antes siguiera andando. La app ya llama a
-- eliminar_actividad (solo el administrador): el alias se borra. _eliminar_actividad conserva su
-- parámetro de motivo (las eliminaciones nuevas lo dejan vacío).
--
-- Auditoría: -1 función (anular_actividad).

begin;

drop function public.anular_actividad(uuid, text);

commit;
