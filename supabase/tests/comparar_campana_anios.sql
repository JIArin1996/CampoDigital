-- Campo Digital v2 — Comparar campaña con años de nacimiento (migración 20261020000200)
--
-- Solo lectura. Correr la consulta 1 ANTES de aplicar la migración (y guardar el resultado),
-- y la 2 DESPUÉS.
--
-- Desde 20261020000500_borrar_campana la columna campana ya no existe: estas consultas dan error.
-- Correr la 2 por última vez (y guardar el resultado) antes de aplicar la 500.

-- 1. ANTES: todas las campañas cargadas
select l.id, l.nombre, l.campana
from public.lotes l
where l.campana is not null and btrim(l.campana) <> ''
order by l.nombre;

-- 2. DESPUÉS: campaña, años cargados y años de 4 dígitos que tenía el texto (sin filtrar el rango).
--    estado = 'ok' si coinciden; 'revisar' si el texto no tenía años o tenía alguno fuera de 1990..hoy.
select
  l.nombre,
  l.campana,
  l.anios_nacimiento,
  t.anios_en_texto,
  case when l.anios_nacimiento = coalesce(t.anios_en_texto, '{}') and cardinality(l.anios_nacimiento) > 0
       then 'ok' else 'revisar' end as estado
from public.lotes l
cross join lateral (
  select array_agg(distinct m[1]::int order by m[1]::int) as anios_en_texto
  from regexp_matches(l.campana, '(?<![0-9])([0-9]{4})(?![0-9])', 'g') m
) t
where l.campana is not null and btrim(l.campana) <> ''
order by estado desc, l.nombre;

-- 3. DESPUÉS: lotes sin campaña que quedaron sin años (lo esperado: todos los que no tenían campaña)
select count(*) as lotes_sin_campana, count(*) filter (where cardinality(anios_nacimiento) = 0) as sin_anios
from public.lotes
where campana is null or btrim(campana) = '';
