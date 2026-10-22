-- Campo Digital v2 — Mensaje de stock negativo con la categoría y el lote
--
-- _validar_saldo (20261015000200) controla el stock día por día y, si una categoría queda negativa
-- en algún día, rechaza con 23514. El mensaje decía "El stock de la categoría quedaría negativo
-- (-30 cabezas al 22/10/2026)" sin decir cuál ni en qué lote. Ahora:
--   "El stock de Terneros/as en el lote Vacas de Cría quedaría negativo (-30 cabezas al 22/10/2026)".
--
-- Misma firma, mismo código (23514), misma lógica: create or replace conserva los permisos (ninguno
-- para authenticated ni anon). La usan todas las funciones que mueven stock. Auditoría: sin cambios.

begin;

create or replace function public._validar_saldo(p_lote_id uuid, p_categoria_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_fecha     date;
  v_saldo     bigint;
  v_categoria text;
  v_lote      text;
begin
  select d.fecha, d.saldo into v_fecha, v_saldo
  from (
    select e.fecha, sum(sum(e.cabezas)) over (order by e.fecha) as saldo
    from public.lote_eventos e
    where e.lote_id = p_lote_id
      and e.categoria_id = p_categoria_id
    group by e.fecha
  ) d
  where d.saldo < 0
  order by d.fecha
  limit 1;

  if v_fecha is not null then
    select c.nombre into v_categoria from public.categorias_animales c where c.id = p_categoria_id;
    select l.nombre into v_lote from public.lotes l where l.id = p_lote_id;
    raise exception 'El stock de % en el lote % quedaría negativo (% cabezas al %)',
      coalesce(v_categoria, 'la categoría'), coalesce(v_lote, '(sin nombre)'), v_saldo, to_char(v_fecha, 'DD/MM/YYYY')
      using errcode = '23514';
  end if;
end;
$$;

revoke execute on function public._validar_saldo(uuid, uuid) from public, anon, authenticated;

commit;
