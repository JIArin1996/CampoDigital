-- Campo Digital v2 — Limpieza de un trabajo a medias (área efectiva) que se aplicó en la base sin quedar en el repo
--
-- En la base quedaron, de un intento de "área efectiva" que se descartó (decisión 9/11/2026):
--   * la columna potreros.superficie_efectiva, con su check, y la vista v_potreros_mapa rehecha para mostrarla;
--   * una función public.calcular_superficie_potrero() sin trigger.
-- La vista vuelve a ser la de 20261024000100 (misma definición y permisos).
-- Se borran para que 20261106000100_superficie_del_dibujo se pueda aplicar (crea una función con ese nombre y
-- rehace los checks de la superficie). En una base que no los tiene, esta migración no hace nada.
-- Va antes de 20261106000100 (por la fecha del nombre).

begin;

-- La vista del mapa depende de la columna: se borra y se vuelve a crear como en el repo (20261024000100).
-- Sin cascade: si algo más dependiera de la columna, que falle y se vea.
drop view if exists public.v_potreros_mapa;

alter table public.potreros drop column if exists superficie_efectiva;

-- Potreros para el mapa: la forma como GeoJSON, el área geodésica y un punto adentro para la etiqueta
create view public.v_potreros_mapa
with (security_invoker = true) as
select p.id, p.establecimiento_id, p.nombre, p.superficie, p.uso_actual, p.tipo_pastura, p.aguada, p.sombra,
       p.estado, p.observaciones,
       extensions.st_asgeojson(p.forma, 7)::jsonb as forma,
       round((extensions.st_area(p.forma::extensions.geography) / 10000)::numeric, 2) as area_ha,
       extensions.st_asgeojson(extensions.st_pointonsurface(p.forma), 7)::jsonb as etiqueta
from public.potreros p;

revoke all    on public.v_potreros_mapa from anon, authenticated;
grant  select on public.v_potreros_mapa to authenticated;

-- Solo si no la usa ningún trigger (la de 20261106000100 sí tiene trigger: esa no se toca)
do $$
begin
  if exists (select 1 from pg_proc where oid = to_regprocedure('public.calcular_superficie_potrero()'))
     and not exists (select 1 from pg_trigger t where t.tgfoid = to_regprocedure('public.calcular_superficie_potrero()')) then
    drop function public.calcular_superficie_potrero();
  end if;
end $$;

commit;
