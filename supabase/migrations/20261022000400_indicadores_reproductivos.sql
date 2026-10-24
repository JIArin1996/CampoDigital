-- Campo Digital v2 — Indicadores reproductivos (Etapa 7a)
--
-- Diseño: contexto/DISENO-BASE-ETAPA-7.md, sección 2, aprobado el 2026-10-22 (B1, B6 y B7).
-- Solo lectura: dos vistas con security_invoker (el RLS de cada tabla aplica a quien consulta). No hay
-- tablas, columnas ni funciones nuevas: la auditoría no cambia (salvo las dos vistas).
--
--   v_indicadores_aportes: una fila por actividad que aporta a un indicador (servicio, diagnóstico,
--     parición y cada origen de un destete), con su especie, su temporada y lo que aporta. Es el
--     "ver detalle" de la pantalla.
--   v_indicadores_reproductivos: totales por establecimiento, especie y temporada, con los tres %.
--
-- Reglas:
--   * Temporada: de julio a junio, por la fecha del servicio (2025 = del 1/7/2025 al 30/6/2026).
--   * Entoradas: por lote y temporada cuenta el servicio con más vacas (repaso: no se suman las
--     mismas vacas dos veces; subestima si el repaso incluye vacas distintas). Se suma por lote.
--   * Diagnóstico y parición: van a la temporada del último servicio (no anulado) del mismo lote o de
--     sus ancestros (linaje), de hasta 450 días antes. Sin ese servicio: temporada null ("sin servicio
--     registrado"). Con varios diagnósticos de un lote en la misma temporada cuenta el último.
--   * Parición: crías vivas para el % (las muertas se informan aparte).
--   * Destete: lo que salió de cada origen va a la temporada de la parición más antigua de ese origen
--     desde su último destete; si esas pariciones son de más de una temporada, "mixto".
--   * Las actividades anuladas no cuentan.

begin;

create view public.v_indicadores_aportes
with (security_invoker = true) as
with
servicios as (
  select a.id, a.establecimiento_id, a.lote_id, a.fecha, l.especie_id, s.vacas_entoradas,
         (extract(year from a.fecha)::int - case when extract(month from a.fecha) < 7 then 1 else 0 end) as temporada,
         row_number() over (
           partition by a.lote_id, (extract(year from a.fecha)::int - case when extract(month from a.fecha) < 7 then 1 else 0 end)
           order by s.vacas_entoradas desc, a.fecha, a.created_at
         ) = 1 as cuenta
  from public.actividades a
  join public.act_servicio s on s.actividad_id = a.id
  join public.lotes l on l.id = a.lote_id
  where a.tipo = 'servicio' and a.anulada_en is null
),
diagnosticos as (
  select a.id, a.establecimiento_id, a.lote_id, a.fecha, a.created_at, l.especie_id,
         d.vacas_diagnosticadas, d.vacas_prenadas, sv.temporada
  from public.actividades a
  join public.act_diagnostico d on d.actividad_id = a.id
  join public.lotes l on l.id = a.lote_id
  left join lateral (
    select x.temporada from servicios x
    where x.fecha <= a.fecha and x.fecha > a.fecha - 450
      and (x.lote_id = a.lote_id
           or x.lote_id in (select la.lote_id from public.linaje_lote(a.lote_id) la where la.relacion = 'ancestro'))
    order by x.fecha desc, x.vacas_entoradas desc
    limit 1
  ) sv on true
  where a.tipo = 'diagnostico_gestacion' and a.anulada_en is null
),
pariciones as (
  select a.id, a.establecimiento_id, a.lote_id, a.fecha, l.especie_id, p.lote_cria_id, p.nacidos_muertos,
         coalesce((select sum(li.cabezas) from public.actividad_lineas li where li.actividad_id = a.id), 0)::int as vivas,
         sv.temporada
  from public.actividades a
  join public.act_paricion p on p.actividad_id = a.id
  join public.lotes l on l.id = a.lote_id
  left join lateral (
    select x.temporada from servicios x
    where x.fecha <= a.fecha and x.fecha > a.fecha - 450
      and (x.lote_id = a.lote_id
           or x.lote_id in (select la.lote_id from public.linaje_lote(a.lote_id) la where la.relacion = 'ancestro'))
    order by x.fecha desc, x.vacas_entoradas desc
    limit 1
  ) sv on true
  where a.tipo = 'paricion' and a.anulada_en is null
),
destetes as (
  select a.id, a.establecimiento_id, al.lote_id, a.fecha, l.especie_id,
         coalesce((select -sum(e.cabezas) from public.lote_eventos e
                   where e.actividad_id = a.id and e.lote_id = al.lote_id and e.cabezas < 0), 0)::int as destetadas,
         t.temporada, coalesce(t.mixto, false) as mixto
  from public.actividades a
  join public.actividad_lotes al on al.actividad_id = a.id and al.rol = 'origen'
  join public.lotes l on l.id = al.lote_id
  left join lateral (
    select (array_agg(pp.temporada order by pp.fecha))[1] as temporada,
           count(distinct coalesce(pp.temporada, -1)) > 1 as mixto
    from pariciones pp
    where pp.lote_cria_id = al.lote_id
      and pp.fecha <= a.fecha
      and pp.fecha > coalesce((
        select max(a2.fecha) from public.actividades a2
        join public.actividad_lotes al2 on al2.actividad_id = a2.id and al2.rol = 'origen' and al2.lote_id = al.lote_id
        where a2.tipo = 'destete' and a2.anulada_en is null and a2.fecha < a.fecha), '-infinity'::date)
  ) t on true
  where a.tipo = 'destete' and a.anulada_en is null
)
select s.establecimiento_id, s.especie_id, s.temporada, 'servicio'::text as tipo, s.id as actividad_id, s.fecha, s.lote_id,
       s.cuenta, s.vacas_entoradas as entoradas, 0 as diagnosticadas, 0 as prenadas,
       0 as nacidas_vivas, 0 as nacidas_muertas, 0 as destetadas, false as mixto
from servicios s
union all
select d.establecimiento_id, d.especie_id, d.temporada, 'diagnostico_gestacion', d.id, d.fecha, d.lote_id,
       row_number() over (partition by d.lote_id, d.temporada order by d.fecha desc, d.created_at desc) = 1,
       0, d.vacas_diagnosticadas, d.vacas_prenadas, 0, 0, 0, false
from diagnosticos d
union all
select p.establecimiento_id, p.especie_id, p.temporada, 'paricion', p.id, p.fecha, p.lote_id,
       true, 0, 0, 0, p.vivas, p.nacidos_muertos, 0, false
from pariciones p
union all
select t.establecimiento_id, t.especie_id, t.temporada, 'destete', t.id, t.fecha, t.lote_id,
       true, 0, 0, 0, 0, 0, t.destetadas, t.mixto
from destetes t;

create view public.v_indicadores_reproductivos
with (security_invoker = true) as
select x.establecimiento_id, x.especie_id, x.temporada,
       x.entoradas, x.diagnosticadas, x.prenadas, x.nacidas_vivas, x.nacidas_muertas, x.destetadas, x.destete_mixto,
       round(100.0 * x.prenadas      / nullif(x.entoradas, 0), 1) as pct_prenez,
       round(100.0 * x.nacidas_vivas / nullif(x.entoradas, 0), 1) as pct_paricion,
       round(100.0 * x.destetadas    / nullif(x.entoradas, 0), 1) as pct_destete
from (
  select a.establecimiento_id, a.especie_id, a.temporada,
         coalesce(sum(a.entoradas)      filter (where a.cuenta), 0)::int as entoradas,
         coalesce(sum(a.diagnosticadas) filter (where a.cuenta), 0)::int as diagnosticadas,
         coalesce(sum(a.prenadas)       filter (where a.cuenta), 0)::int as prenadas,
         coalesce(sum(a.nacidas_vivas)  filter (where a.cuenta), 0)::int as nacidas_vivas,
         coalesce(sum(a.nacidas_muertas) filter (where a.cuenta), 0)::int as nacidas_muertas,
         coalesce(sum(a.destetadas)     filter (where a.cuenta), 0)::int as destetadas,
         bool_or(a.mixto) as destete_mixto
  from public.v_indicadores_aportes a
  group by a.establecimiento_id, a.especie_id, a.temporada
) x;

revoke all    on public.v_indicadores_aportes, public.v_indicadores_reproductivos from anon, authenticated;
grant  select on public.v_indicadores_aportes, public.v_indicadores_reproductivos to authenticated;

commit;
