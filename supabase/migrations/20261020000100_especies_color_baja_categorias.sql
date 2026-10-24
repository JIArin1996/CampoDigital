-- Campo Digital v2 — Especies con color y baja de categorías sin stock
--
-- 1. especies.color: color propio de cada especie (#rrggbb), opcional. Vacío = el color por
--    defecto de su grupo (bovino verde, ovino ámbar, otro gris), que pone la app.
-- 2. Baja de categorías: nada se borra; una categoría se da de baja (activo = false) solo si no
--    tiene animales en stock en ningún lote. El historial de los lotes la sigue mostrando.
--    Se valida con un trigger, así vale para cualquier camino (la app actualiza activo directo,
--    con el permiso de columna y la política de solo administrador que ya existen).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Color de la especie
-- ════════════════════════════════════════════════════════════════════════════

alter table public.especies
  add column color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

-- Lo carga y lo cambia el administrador (las políticas de especies ya son solo para él)
grant insert (color) on public.especies to authenticated;
grant update (color) on public.especies to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Baja de una categoría: solo sin animales en stock
-- ════════════════════════════════════════════════════════════════════════════
-- security definer: el stock se cuenta en todos los lotes, sin depender de lo que el RLS
-- deja ver a quien actualiza. Reactivar (activo de false a true) no tiene condiciones.

create function public.validar_baja_categoria() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.activo and not new.activo and exists (
    select 1
    from public.lote_eventos e
    where e.categoria_id = new.id
    group by e.lote_id
    having sum(e.cabezas) <> 0
  ) then
    raise exception 'La categoría % tiene animales en stock: no se puede dar de baja', new.nombre using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.validar_baja_categoria() from public, anon, authenticated;

create trigger validar_baja before update of activo on public.categorias_animales
  for each row execute function public.validar_baja_categoria();

commit;
