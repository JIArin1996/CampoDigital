-- Campo Digital v2 — Pruebas de RLS, permisos e inmutabilidad (Etapas 3a y 3c)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261016000100_etapa3c_usuarios_y_roles).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. El script TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS RLS: N OK, M FALLA ...".
--      Ese error deshace todo (usuarios, establecimientos, lotes y eventos de prueba):
--      no queda nada en la base. El resultado esperado es "0 FALLA".
--
-- QUÉ PRUEBA
--   * Administrador (A): ve y edita todo en todos los establecimientos, crea establecimientos,
--     configura catálogos y gestiona usuarios. No se puede quitar al último administrador.
--   * Operador (O) de Santa Remigia: carga el día a día (potreros, lotes, ajustes);
--     no configura ni gestiona usuarios.
--   * Consulta (Q) de Santa Remigia: ve todo, no escribe nada, ni llamando a la API directo.
--   * Operador de otro establecimiento (X): no ve ni toca nada de Santa Remigia.
--   * Usuario desactivado: pierde el acceso en el momento.
--   * Sin sesión (anon): no ve nada.
--   * Base (postgres): no puede modificar ni borrar eventos (inmutabilidad).
--
-- Los usuarios de prueba usan el dominio .test y se crean dentro de la transacción.
-- Las fotos de perfil (Storage) se prueban desde la app.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Preparación (como administrador de la base)
-- ════════════════════════════════════════════════════════════════════════════

select set_config('test.rep', '', false);
select set_config('test.u_admin',    'a0000000-0000-4000-8000-00000000000a', false);
select set_config('test.u_operador', 'b0000000-0000-4000-8000-00000000000b', false);
select set_config('test.u_consulta', 'c0000000-0000-4000-8000-00000000000c', false);
select set_config('test.u_ajeno',    'd0000000-0000-4000-8000-00000000000d', false);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', current_setting('test.' || u.clave)::uuid,
       'authenticated', 'authenticated', u.email, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
from (values
  ('u_admin',    'admin@campodigital.test'),
  ('u_operador', 'operador@campodigital.test'),
  ('u_consulta', 'consulta@campodigital.test'),
  ('u_ajeno',    'ajeno@campodigital.test')
) as u(clave, email);

-- Perfiles (en la app los crea el servidor al dar de alta el usuario)
insert into public.perfiles (id, email, nombre, apellido, es_admin)
values
  (current_setting('test.u_admin')::uuid,    'admin@campodigital.test',    'Ana',   'Admin',    true),
  (current_setting('test.u_operador')::uuid, 'operador@campodigital.test', 'Oscar', 'Operador', false),
  (current_setting('test.u_consulta')::uuid, 'consulta@campodigital.test', 'Quena', 'Consulta', false),
  (current_setting('test.u_ajeno')::uuid,    'ajeno@campodigital.test',    'Xavier', 'Ajeno',   false)
on conflict (id) do update set es_admin = excluded.es_admin, nombre = excluded.nombre;

-- Durante la prueba, el único administrador es A (así se puede probar "último administrador").
-- Si ya hay administradores reales, se les saca el rol solo dentro de esta transacción.
update public.perfiles set es_admin = false
where es_admin and id <> current_setting('test.u_admin')::uuid;

-- Esquema auxiliar de pruebas (desaparece con el rollback final)
create schema pruebas;
grant usage on schema pruebas to authenticated, anon;

create function pruebas.ok(p text) returns void language plpgsql as $$
begin
  perform set_config('test.rep', current_setting('test.rep') || E'\nOK     ' || p, false);
end $$;

create function pruebas.falla(p text) returns void language plpgsql as $$
begin
  perform set_config('test.rep', current_setting('test.rep') || E'\nFALLA  ' || p, false);
end $$;

create function pruebas.id(p_clave text) returns uuid language sql stable as $$
  select current_setting('test.' || p_clave)::uuid
$$;

-- Simula la sesión de un usuario (además hay que hacer "set local role authenticated")
create function pruebas.como(p_clave text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.' || p_clave), 'role', 'authenticated')::text, true);
end $$;

create function pruebas.espera_error(p_nombre text, p_sql text, p_sqlstate text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_sqlstate then
      perform pruebas.ok(p_nombre || '  [' || sqlstate || ']');
    else
      perform pruebas.falla(p_nombre || ': esperaba ' || p_sqlstate || ', dio ' || sqlstate || ' ' || sqlerrm);
    end if;
    return;
  end;
  perform pruebas.falla(p_nombre || ': NO dio error (esperaba ' || p_sqlstate || ')');
end $$;

create function pruebas.espera_ok(p_nombre text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  perform pruebas.ok(p_nombre);
exception when others then
  perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
end $$;

create function pruebas.espera_filas(p_nombre text, p_sql text, p_filas int) returns void
language plpgsql as $$
declare
  v_n int;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  if v_n = p_filas then
    perform pruebas.ok(p_nombre || '  [' || v_n || ' filas]');
  else
    perform pruebas.falla(p_nombre || ': esperaba ' || p_filas || ' filas, afectó ' || v_n);
  end if;
exception when others then
  perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
end $$;

create function pruebas.espera_valor(p_nombre text, p_sql text, p_esperado text) returns void
language plpgsql as $$
declare
  v text;
begin
  execute p_sql into v;
  if v is not distinct from p_esperado then
    perform pruebas.ok(p_nombre || '  [' || coalesce(v, 'null') || ']');
  else
    perform pruebas.falla(p_nombre || ': esperaba ' || coalesce(p_esperado, 'null') || ', dio ' || coalesce(v, 'null'));
  end if;
exception when others then
  perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
end $$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Administrador A: crea dos establecimientos y asigna roles
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select set_config('test.est_a', public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno')::text, false);
select set_config('test.est_x', public.crear_establecimiento('Otro campo (prueba)', 'Salto')::text, false);

select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador');
select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta');
select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador');

select set_config('test.vacunos_a',
  (select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos')::text, false);
select set_config('test.vacunos_x',
  (select id from public.especies where establecimiento_id = pruebas.id('est_x') and nombre = 'Vacunos')::text, false);
select set_config('test.cat_terneros',
  (select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros')::text, false);
select set_config('test.cat_terneras',
  (select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneras')::text, false);
select set_config('test.cat_toros',
  (select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Toros')::text, false);
select set_config('test.cat_corderos',
  (select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Corderos')::text, false);

select pruebas.espera_valor('A01 Admin ve todos los establecimientos sin estar asignado',
  $q$ select count(*) from public.establecimientos where id in (pruebas.id('est_a'), pruebas.id('est_x')) $q$, '2');
select pruebas.espera_valor('A02 mi_rol del admin',
  $q$ select public.mi_rol(pruebas.id('est_a')) $q$, 'administrador');
select pruebas.espera_valor('A03 es_admin, es_miembro y puede_operar del admin',
  $q$ select (public.es_admin() and public.es_miembro(pruebas.id('est_x')) and public.puede_operar(pruebas.id('est_x')))::text $q$, 'true');
select pruebas.espera_valor('A04 Catálogos base: 7 categorías vacunas',
  $q$ select count(*) from public.categorias_animales where especie_id = pruebas.id('vacunos_a') $q$, '7');
select pruebas.espera_valor('A05 asignar_rol creó la ficha en personas del operador',
  $q$ select count(*) from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_operador') and activo $q$, '1');
select pruebas.espera_valor('A06 Admin ve todas las membresías y perfiles',
  $q$ select (select count(*) from public.membresias where establecimiento_id in (pruebas.id('est_a'), pruebas.id('est_x')))::text
           || '/' || (select count(*) from public.perfiles where email like '%@campodigital.test') $q$, '3/4');
select pruebas.espera_filas('A07 Admin edita un establecimiento',
  $q$ update public.establecimientos set sistema_productivo = 'cría y recría' where id = pruebas.id('est_a') $q$, 1);
select pruebas.espera_filas('A08 Admin agrega una especie (configuración)',
  $q$ insert into public.especies (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Equinos') $q$, 1);
select pruebas.espera_filas('A09 Admin edita el perfil de otro usuario',
  $q$ update public.perfiles set celular = '099111222' where id = pruebas.id('u_operador') $q$, 1);
select pruebas.espera_error('A10 Asignar un rol inválido',
  $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'editor') $q$, '22023');
select pruebas.espera_error('A11 Quitarse el admin siendo el último administrador',
  $q$ select public.definir_admin(pruebas.id('u_admin'), false) $q$, '23514');
select pruebas.espera_error('A12 Desactivarse siendo el último administrador',
  $q$ select public.definir_activo(pruebas.id('u_admin'), false) $q$, '23514');
select pruebas.espera_error('A13 Admin cambia su propio es_admin directo (sin función)',
  $q$ update public.perfiles set es_admin = false where id = pruebas.id('u_admin') $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Operador O de Santa Remigia: el día a día
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

select set_config('test.lote_a', public.crear_lote(
  pruebas.id('est_a'), pruebas.id('vacunos_a'), 'Terneros 2026', public.fecha_hoy() - 30,
  jsonb_build_array(
    jsonb_build_object('categoria_id', pruebas.id('cat_terneros'), 'cabezas', 120),
    jsonb_build_object('categoria_id', pruebas.id('cat_terneras'), 'cabezas', 80)
  ))::text, false);

select set_config('test.lote_b', public.crear_lote(
  pruebas.id('est_a'), pruebas.id('vacunos_a'), 'Toros', public.fecha_hoy() - 10,
  jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('cat_toros'), 'cabezas', 5))
  )::text, false);

select pruebas.espera_valor('O01 Operador ve solo su establecimiento',
  $q$ select count(*) from public.establecimientos $q$, '1');
select pruebas.espera_valor('O02 mi_rol del operador',
  $q$ select public.mi_rol(pruebas.id('est_a')) $q$, 'operador');
select pruebas.espera_valor('O03 Operador puede operar y no es admin',
  $q$ select (public.puede_operar(pruebas.id('est_a')) and not public.es_admin())::text $q$, 'true');
select pruebas.espera_valor('O04 Stock inicial de terneros (v_stock_lote)',
  $q$ select cabezas from public.v_stock_lote where lote_id = pruebas.id('lote_a') and categoria_id = pruebas.id('cat_terneros') $q$, '120');
select pruebas.espera_filas('O05 Operador crea un potrero',
  $q$ insert into public.potreros (establecimiento_id, nombre, superficie, uso_actual) values (pruebas.id('est_a'), 'Potrero 1', 50, 'Ganadería') $q$, 1);
select pruebas.espera_filas('O06 Operador edita las notas de un lote',
  $q$ update public.lotes set notas = 'nota de prueba' where id = pruebas.id('lote_a') $q$, 1);
select pruebas.espera_valor('O07 Ajuste válido de -8 terneros',
  $q$ select (public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), -8, public.fecha_hoy(), 'Error de conteo en el alta') is not null)::text $q$, 'true');
select pruebas.espera_valor('O08 Stock del establecimiento (v_stock_establecimiento): terneros',
  $q$ select cabezas from public.v_stock_establecimiento where establecimiento_id = pruebas.id('est_a') and categoria_id = pruebas.id('cat_terneros') $q$, '112');
select pruebas.espera_error('O09 Ajuste que deja el stock negativo',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), -200, public.fecha_hoy(), 'prueba') $q$, '23514');
select pruebas.espera_error('O10 Ajuste sin motivo',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), 1, public.fecha_hoy(), '') $q$, '22023');
select pruebas.espera_error('O11 Ajuste con categoría de otra especie',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_corderos'), 1, public.fecha_hoy(), 'prueba') $q$, '22023');
select pruebas.espera_error('O12 Ajuste con fecha futura',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), 1, public.fecha_hoy() + 1, 'prueba') $q$, '22023');
select pruebas.espera_error('O13 Cerrar un lote con stock',
  $q$ select public.cerrar_lote(pruebas.id('lote_a'), public.fecha_hoy()) $q$, '23514');
select pruebas.espera_ok('O14 Vender los 5 toros (ajuste a cero)',
  $q$ select public.registrar_ajuste(pruebas.id('lote_b'), pruebas.id('cat_toros'), -5, public.fecha_hoy(), 'Venta de prueba') $q$);
select pruebas.espera_ok('O14b Cerrar el lote con stock en cero',
  $q$ select public.cerrar_lote(pruebas.id('lote_b'), public.fecha_hoy(), 'Prueba de cierre') $q$);
select pruebas.espera_ok('O15 Reabrir el lote',
  $q$ select public.reabrir_lote(pruebas.id('lote_b'), public.fecha_hoy(), 'Prueba de reapertura') $q$);
select pruebas.espera_valor('O16 Cierre y reapertura quedaron registrados',
  $q$ select count(*) from public.lote_cambios_estado where lote_id = pruebas.id('lote_b') $q$, '2');
select pruebas.espera_filas('O17 Operador edita su propio perfil',
  $q$ update public.perfiles set celular = '099333444' where id = pruebas.id('u_operador') $q$, 1);
select pruebas.espera_valor('O18 Operador ve solo su propio perfil',
  $q$ select count(*) from public.perfiles $q$, '1');

-- Lo que el operador NO puede: configuración, usuarios, escrituras directas
select pruebas.espera_filas('O19 Operador edita el establecimiento: 0 filas (configuración)',
  $q$ update public.establecimientos set nombre = 'X' where id = pruebas.id('est_a') $q$, 0);
select pruebas.espera_error('O20 Operador agrega una categoría (configuración)',
  $q$ insert into public.categorias_animales (establecimiento_id, especie_id, nombre) values (pruebas.id('est_a'), pruebas.id('vacunos_a'), 'Nueva') $q$, '42501');
select pruebas.espera_error('O21 Operador agrega una persona (configuración)',
  $q$ insert into public.personas (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Intruso') $q$, '42501');
select pruebas.espera_error('O22 Operador crea un establecimiento',
  $q$ select public.crear_establecimiento('Nuevo', 'Salto') $q$, '42501');
select pruebas.espera_error('O23 Operador asigna roles',
  $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'operador') $q$, '42501');
select pruebas.espera_error('O24 Operador se hace administrador (función)',
  $q$ select public.definir_admin(pruebas.id('u_operador'), true) $q$, '42501');
select pruebas.espera_error('O25 Operador se hace administrador (columna directa)',
  $q$ update public.perfiles set es_admin = true where id = pruebas.id('u_operador') $q$, '42501');
select pruebas.espera_filas('O26 Operador edita el perfil de otro: 0 filas',
  $q$ update public.perfiles set celular = 'x' where id = pruebas.id('u_consulta') $q$, 0);
select pruebas.espera_error('O27 Operador inserta directo en lote_eventos',
  $q$ insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo)
      values (pruebas.id('est_a'), pruebas.id('lote_a'), pruebas.id('vacunos_a'), pruebas.id('cat_terneros'), 50, public.fecha_hoy(), 'compra') $q$, '42501');
select pruebas.espera_error('O28 Operador cambia el estado de un lote a mano (permiso por columna)',
  $q$ update public.lotes set estado = 'cerrado', fecha_cierre = public.fecha_hoy() where id = pruebas.id('lote_a') $q$, '42501');
select pruebas.espera_error('O29 Operador borra un lote',
  $q$ delete from public.lotes where id = pruebas.id('lote_a') $q$, '42501');
select pruebas.espera_error('O30 Operador inserta directo en membresías',
  $q$ insert into public.membresias (establecimiento_id, user_id, rol) values (pruebas.id('est_a'), pruebas.id('u_ajeno'), 'operador') $q$, '42501');
select pruebas.espera_error('O31 Operador falsea created_by de un potrero',
  $q$ insert into public.potreros (establecimiento_id, nombre, superficie, created_by) values (pruebas.id('est_a'), 'P2', 1, pruebas.id('u_ajeno')) $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Consulta Q de Santa Remigia: ve todo, no escribe nada
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');

select pruebas.espera_valor('Q01 Consulta ve el establecimiento',
  $q$ select count(*) from public.establecimientos $q$, '1');
select pruebas.espera_valor('Q02 mi_rol de consulta',
  $q$ select public.mi_rol(pruebas.id('est_a')) $q$, 'consulta');
select pruebas.espera_valor('Q03 Consulta es miembro pero no puede operar',
  $q$ select (public.es_miembro(pruebas.id('est_a')) and not public.puede_operar(pruebas.id('est_a')))::text $q$, 'true');
select pruebas.espera_valor('Q04 Consulta ve los lotes',
  $q$ select count(*) from public.lotes $q$, '2');
select pruebas.espera_valor('Q05 Consulta ve el stock por lote (terneros y terneras)',
  $q$ select count(*) from public.v_stock_lote where establecimiento_id = pruebas.id('est_a') $q$, '2');
select pruebas.espera_valor('Q06 Consulta ve el stock del establecimiento',
  $q$ select cabezas from public.v_stock_establecimiento where establecimiento_id = pruebas.id('est_a') and categoria_id = pruebas.id('cat_terneras') $q$, '80');
select pruebas.espera_error('Q07 Consulta crea un potrero',
  $q$ insert into public.potreros (establecimiento_id, nombre, superficie) values (pruebas.id('est_a'), 'Intruso', 1) $q$, '42501');
select pruebas.espera_filas('Q08 Consulta edita un lote: 0 filas, sin error (la app lo trata como "sin permiso")',
  $q$ update public.lotes set notas = 'hackeado' where id = pruebas.id('lote_a') $q$, 0);
select pruebas.espera_filas('Q09 Consulta edita un potrero: 0 filas',
  $q$ update public.potreros set nombre = 'Hackeado' where establecimiento_id = pruebas.id('est_a') $q$, 0);
select pruebas.espera_error('Q10 Consulta llama a registrar_ajuste (RPC)',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), 10, public.fecha_hoy(), 'prueba') $q$, '42501');
select pruebas.espera_error('Q11 Consulta llama a crear_lote (RPC)',
  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos_a'), 'X', public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('cat_terneros'), 'cabezas', 1))) $q$, '42501');
select pruebas.espera_error('Q12 Consulta llama a cerrar_lote (RPC)',
  $q$ select public.cerrar_lote(pruebas.id('lote_b'), public.fecha_hoy()) $q$, '42501');
select pruebas.espera_error('Q13 Consulta se cambia el rol a operador',
  $q$ update public.membresias set rol = 'operador' where user_id = pruebas.id('u_consulta') $q$, '42501');
select pruebas.espera_valor('Q14 El stock no cambió',
  $q$ select cabezas from public.v_stock_lote where lote_id = pruebas.id('lote_a') and categoria_id = pruebas.id('cat_terneros') $q$, '112');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. X, operador de otro establecimiento: no ve ni toca Santa Remigia
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_ajeno');

select pruebas.espera_valor('X01 X ve solo su establecimiento',
  $q$ select count(*) from public.establecimientos $q$, '1');
select pruebas.espera_valor('X02 X no ve Santa Remigia',
  $q$ select count(*) from public.establecimientos where id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('X03 X no ve los lotes de Santa Remigia',
  $q$ select count(*) from public.lotes where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('X04 X no ve el stock por lote de Santa Remigia',
  $q$ select count(*) from public.v_stock_lote where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('X05 X no ve el stock del establecimiento de Santa Remigia',
  $q$ select count(*) from public.v_stock_establecimiento where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('X06 X ve 0 filas en total en las vistas de stock (no tiene lotes)',
  $q$ select ((select count(*) from public.v_stock_lote) + (select count(*) from public.v_stock_establecimiento))::text $q$, '0');
select pruebas.espera_valor('X07 X no ve los eventos ni las membresías de Santa Remigia',
  $q$ select ((select count(*) from public.lote_eventos where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.membresias where establecimiento_id = pruebas.id('est_a')))::text $q$, '0');
select pruebas.espera_valor('X08 mi_rol de X en Santa Remigia',
  $q$ select public.mi_rol(pruebas.id('est_a')) $q$, null);
select pruebas.espera_error('X09 X ajusta un lote de Santa Remigia (RPC)',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), -10, public.fecha_hoy(), 'robo') $q$, '42501');
select pruebas.espera_error('X10 X crea un lote en Santa Remigia (RPC)',
  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos_a'), 'X', public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('cat_terneros'), 'cabezas', 1))) $q$, '42501');
select pruebas.espera_filas('X11 X edita un lote de Santa Remigia: 0 filas',
  $q$ update public.lotes set notas = 'x' where id = pruebas.id('lote_a') $q$, 0);
select pruebas.espera_error('X12 X crea un potrero en Santa Remigia',
  $q$ insert into public.potreros (establecimiento_id, nombre, superficie) values (pruebas.id('est_a'), 'Intruso', 1) $q$, '42501');
select pruebas.espera_error('X13 X crea un lote en su campo con una especie de Santa Remigia',
  $q$ select public.crear_lote(pruebas.id('est_x'), pruebas.id('vacunos_a'), 'X', public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('cat_terneros'), 'cabezas', 1))) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Usuario desactivado: pierde el acceso en el momento
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_admin');
select pruebas.espera_ok('D01 Admin desactiva al operador',
  $q$ select public.definir_activo(pruebas.id('u_operador'), false) $q$);

select pruebas.como('u_operador');
select pruebas.espera_valor('D02 Operador desactivado no ve establecimientos',
  $q$ select count(*) from public.establecimientos $q$, '0');
select pruebas.espera_error('D03 Operador desactivado no puede ajustar',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), -1, public.fecha_hoy(), 'prueba') $q$, '42501');

select pruebas.como('u_admin');
select pruebas.espera_ok('D04 Admin reactiva al operador',
  $q$ select public.definir_activo(pruebas.id('u_operador'), true) $q$);
select pruebas.espera_ok('D05 Admin quita el acceso del consulta',
  $q$ select public.quitar_acceso(pruebas.id('u_consulta'), pruebas.id('est_a')) $q$);
select pruebas.espera_valor('D06 La ficha de personas del consulta queda, inactiva',
  $q$ select count(*) from public.personas where user_id = pruebas.id('u_consulta') and not activo $q$, '1');

select pruebas.como('u_operador');
select pruebas.espera_valor('D07 Operador reactivado vuelve a ver su establecimiento',
  $q$ select count(*) from public.establecimientos $q$, '1');

select pruebas.como('u_consulta');
select pruebas.espera_valor('D08 Consulta sin acceso ya no ve Santa Remigia',
  $q$ select count(*) from public.establecimientos $q$, '0');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Sin sesión (anon)
-- ════════════════════════════════════════════════════════════════════════════

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pruebas.espera_error('N01 anon lee establecimientos',
  $q$ select count(*) from public.establecimientos $q$, '42501');
select pruebas.espera_error('N02 anon lee parametros',
  $q$ select count(*) from public.parametros $q$, '42501');
select pruebas.espera_error('N03 anon lee perfiles',
  $q$ select count(*) from public.perfiles $q$, '42501');
select pruebas.espera_error('N04 anon lee el stock',
  $q$ select count(*) from public.v_stock_establecimiento $q$, '42501');
select pruebas.espera_error('N05 anon llama a crear_establecimiento (RPC)',
  $q$ select public.crear_establecimiento('Anon', 'Salto') $q$, '42501');
select pruebas.espera_error('N06 anon llama a es_admin (RPC)',
  $q$ select public.es_admin() $q$, '42501');
select pruebas.espera_error('N07 anon llama a asignar_rol (RPC)',
  $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Base (postgres): inmutabilidad y restricciones
-- ════════════════════════════════════════════════════════════════════════════

reset role;

select pruebas.espera_valor('P01 Helpers: execute para authenticated, no para anon ni public',
  $q$ select bool_and(
        has_function_privilege('authenticated', p.oid, 'execute')
        and not has_function_privilege('anon', p.oid, 'execute')
        and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))::text
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('es_admin', 'es_miembro', 'puede_operar', 'mi_rol') $q$, 'true');
select pruebas.espera_error('P02 Modificar un evento',
  $q$ update public.lote_eventos set cabezas = 999 where lote_id = pruebas.id('lote_a') $q$, '42501');
select pruebas.espera_error('P03 Borrar un evento',
  $q$ delete from public.lote_eventos where lote_id = pruebas.id('lote_a') $q$, '42501');
select pruebas.espera_error('P04 Vaciar lote_eventos (truncate)',
  $q$ truncate public.lote_eventos $q$, '42501');
select pruebas.espera_error('P05 Modificar un cierre/reapertura',
  $q$ update public.lote_cambios_estado set motivo = 'x' $q$, '42501');
select pruebas.espera_error('P06 Borrar un establecimiento con datos (restrict, sin cascada)',
  $q$ delete from public.establecimientos where id = pruebas.id('est_a') $q$, '23503');
select pruebas.espera_error('P07 Borrar un lote con eventos (restrict, sin cascada)',
  $q$ delete from public.lotes where id = pruebas.id('lote_a') $q$, '23503');
select pruebas.espera_error('P08 Rol viejo "editor" en membresías',
  $q$ update public.membresias set rol = 'editor' where user_id = pruebas.id('u_operador') $q$, '23514');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Reporte (error a propósito: deshace todo)
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_rep   text := current_setting('test.rep');
  v_ok    int  := (select count(*) from regexp_matches(v_rep, E'\nOK ', 'g'));
  v_falla int  := (select count(*) from regexp_matches(v_rep, E'\nFALLA ', 'g'));
begin
  raise exception 'PRUEBAS RLS: % OK, % FALLA (este error es a propósito: deshace todos los datos de prueba)%',
    v_ok, v_falla, v_rep;
end $$;
