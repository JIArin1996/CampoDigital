-- Campo Digital v2 — Limpieza de otro resto del intento de área efectiva que se descartó (ver 20261106000050)
--
-- En la base quedó la función public.guardar_area_efectiva (sin archivo en el repo), que la auditoría de permisos marca
-- como fuera de regla. El área efectiva ahora se guarda con guardar_zona_potrero (20261110000100). Se borran todas
-- las versiones de esa función, sea cual sea su firma. En una base que no la tiene, no hace nada.

begin;

do $$
declare
  v_funcion regprocedure;
begin
  for v_funcion in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'guardar_area_efectiva'
  loop
    execute format('drop function %s', v_funcion);
  end loop;
end $$;

commit;
