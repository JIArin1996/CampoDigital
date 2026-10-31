-- Campo Digital v2 — Personas: el nombre de un usuario es el de su perfil
--
-- Pedido de Iñaki (2026-10-27), al revisar Configuraciones > Personas: la ficha de un usuario lleva el nombre que
-- figura en Usuarios, y desde Personas no se cambia.
--   1. sincronizar_nombre_persona (trigger de perfiles): cuando cambia el nombre o el apellido del perfil (en
--      Usuarios o en Mi perfil), sus fichas en todos los establecimientos pasan a ese nombre. Security definer:
--      el propio usuario cambia su perfil, pero las fichas solo las escribe el administrador.
--   2. proteger_nombre_persona (trigger de personas): en la ficha de un usuario, el nombre es siempre el del perfil
--      (al crearla se completa solo; editarlo a otro da error) y el vínculo con el usuario no cambia. El rol y el
--      activo se siguen editando.
--   3. Las fichas que ya existen quedan con el nombre de su perfil.
--
-- Auditoría: 105 funciones (+2) y 25 filas de permisos (sin cambio).

begin;

-- El nombre de una ficha de usuario: nombre y apellido del perfil, como en asignar_rol
create function public.proteger_nombre_persona() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nombre text;
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'El vínculo de una persona con un usuario no se cambia' using errcode = '42501';
  end if;
  if new.user_id is null then
    return new;
  end if;

  select btrim(pf.nombre || ' ' || coalesce(pf.apellido, '')) into v_nombre from public.perfiles pf where pf.id = new.user_id;
  if v_nombre is null then
    return new;   -- sin perfil a la vista: queda el nombre que trae
  end if;
  if tg_op = 'INSERT' then
    new.nombre := v_nombre;
  elsif new.nombre is distinct from old.nombre and new.nombre is distinct from v_nombre then
    raise exception 'El nombre de un usuario se cambia en Usuarios' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger nombre_de_usuario before insert or update on public.personas
  for each row execute function public.proteger_nombre_persona();

-- Cuando cambia el nombre del perfil, sus fichas lo siguen
create function public.sincronizar_nombre_persona() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.personas
  set nombre = btrim(new.nombre || ' ' || coalesce(new.apellido, ''))
  where user_id = new.id and nombre is distinct from btrim(new.nombre || ' ' || coalesce(new.apellido, ''));
  return null;
end;
$$;

create trigger nombre_en_personas after update of nombre, apellido on public.perfiles
  for each row execute function public.sincronizar_nombre_persona();

revoke execute on function public.proteger_nombre_persona()    from public, anon, authenticated;
revoke execute on function public.sincronizar_nombre_persona() from public, anon, authenticated;

-- Las fichas que ya existen, con el nombre de su perfil
update public.personas pe
set nombre = btrim(pf.nombre || ' ' || coalesce(pf.apellido, ''))
from public.perfiles pf
where pf.id = pe.user_id and pe.nombre is distinct from btrim(pf.nombre || ' ' || coalesce(pf.apellido, ''));

commit;
