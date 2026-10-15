-- Campo Digital v2 — Etapa 3: pruebas de RLS, permisos e inmutabilidad
--
-- CÓMO CORRERLO
--   1. Después de aplicar las migraciones 20261015000000 a 20261015000300.
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. El script TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS RLS ETAPA 3: N OK, M FALLA ...".
--      Ese error deshace todo (usuarios, establecimientos, lotes y eventos de prueba):
--      no queda nada en la base. El resultado esperado es "0 FALLA".
--
-- QUÉ PRUEBA
--   * Editor (A): ve y edita lo suyo; no puede escribir directo en tablas protegidas.
--   * Lector (B) del mismo establecimiento: ve todo, no puede escribir nada,
--     ni siquiera llamando a la API directamente.
--   * Usuario de otro establecimiento (C): no ve ni toca nada de A.
--   * Sin sesión (anon): no ve nada.
--   * Administrador (postgres): no puede modificar ni borrar eventos (inmutabilidad).
--
-- Los usuarios de prueba usan el dominio .test y se crean dentro de la transacción.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Preparación (como administrador)
-- ════════════════════════════════════════════════════════════════════════════

select set_config('test.rep', '', false);
select set_config('test.u_editor', 'a0000000-0000-4000-8000-00000000000a', false);
select set_config('test.u_lector', 'b0000000-0000-4000-8000-00000000000b', false);
select set_config('test.u_ajeno',  'c0000000-0000-4000-8000-00000000000c', false);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', current_setting('test.u_editor')::uuid, 'authenticated', 'authenticated',
   'editor@campodigital.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', current_setting('test.u_lector')::uuid, 'authenticated', 'authenticated',
   'lector@campodigital.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', current_setting('test.u_ajeno')::uuid,  'authenticated', 'authenticated',
   'ajeno@campodigital.test',  '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

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

-- Id guardado durante la prueba
create function pruebas.id(p_clave text) returns uuid language sql stable as $$
  select current_setting('test.' || p_clave)::uuid
$$;

-- Simula la sesión de un usuario (además hay que hacer "set local role authenticated")
create function pruebas.como(p_clave text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.' || p_clave), 'role', 'authenticated')::text, true);
end $$;

-- La sentencia tiene que fallar con ese código de error
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

-- La sentencia tiene que ejecutarse sin error
create function pruebas.espera_ok(p_nombre text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  perform pruebas.ok(p_nombre);
exception when others then
  perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
end $$;

-- La sentencia (insert/update/delete) tiene que afectar exactamente esa cantidad de filas
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

-- La consulta tiene que devolver ese valor
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
-- 1. Editor A crea Santa Remigia (prueba) y dos lotes
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_editor');

select set_config('test.est_a', public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno')::text, false);

select set_config('test.vacunos_a',
  (select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos')::text, false);
select set_config('test.cat_terneros',
  (select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros')::text, false);
select set_config('test.cat_terneras',
  (select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneras')::text, false);
select set_config('test.cat_toros',
  (select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Toros')::text, false);
select set_config('test.cat_corderos',
  (select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Corderos')::text, false);

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

-- El administrador da de alta al lector B en Santa Remigia (hasta la Etapa 9 se hace así)
reset role;
insert into public.membresias (establecimiento_id, user_id, rol)
values (pruebas.id('est_a'), pruebas.id('u_lector'), 'lector');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Editor A
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_editor');

select pruebas.espera_valor('A01 Editor ve su establecimiento',
  $q$ select count(*) from public.establecimientos $q$, '1');
select pruebas.espera_valor('A02 mi_rol del editor',
  $q$ select public.mi_rol(pruebas.id('est_a')) $q$, 'editor');
select pruebas.espera_valor('A02b es_miembro y es_editor del editor (authenticated puede ejecutarlas)',
  $q$ select (public.es_miembro(pruebas.id('est_a')) and public.es_editor(pruebas.id('est_a')))::text $q$, 'true');
select pruebas.espera_valor('A03 Editor lee membresías sin recursión (A y B)',
  $q$ select count(*) from public.membresias $q$, '2');
select pruebas.espera_valor('A04 Catálogos base: 7 categorías vacunas',
  $q$ select count(*) from public.categorias_animales where especie_id = pruebas.id('vacunos_a') $q$, '7');
select pruebas.espera_valor('A05 Stock inicial de terneros',
  $q$ select cabezas from public.v_stock_lote where lote_id = pruebas.id('lote_a') and categoria_id = pruebas.id('cat_terneros') $q$, '120');
select pruebas.espera_filas('A06 Editor crea una persona',
  $q$ insert into public.personas (establecimiento_id, nombre, rol) values (pruebas.id('est_a'), 'Capataz de prueba', 'capataz') $q$, 1);
select pruebas.espera_filas('A07 Editor edita las notas de un lote',
  $q$ update public.lotes set notas = 'nota de prueba' where id = pruebas.id('lote_a') $q$, 1);

-- Ajustes
select pruebas.espera_valor('A08 Ajuste válido de -8 terneros',
  $q$ select (public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), -8, public.fecha_hoy(), 'Error de conteo en el alta') is not null)::text $q$, 'true');
select pruebas.espera_valor('A09 Stock de terneros después del ajuste',
  $q$ select cabezas from public.v_stock_lote where lote_id = pruebas.id('lote_a') and categoria_id = pruebas.id('cat_terneros') $q$, '112');
select pruebas.espera_valor('A09b Stock del establecimiento (v_stock_establecimiento): terneros',
  $q$ select cabezas from public.v_stock_establecimiento where establecimiento_id = pruebas.id('est_a') and categoria_id = pruebas.id('cat_terneros') $q$, '112');
select pruebas.espera_error('A10 Ajuste que deja el stock negativo',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), -200, public.fecha_hoy(), 'prueba') $q$, '23514');
select pruebas.espera_error('A11 Ajuste sin motivo',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), 1, public.fecha_hoy(), '') $q$, '22023');
select pruebas.espera_error('A12 Ajuste con categoría de otra especie (corderos en lote vacuno)',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_corderos'), 1, public.fecha_hoy(), 'prueba') $q$, '22023');
select pruebas.espera_error('A13 Ajuste con fecha futura',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), 1, public.fecha_hoy() + 1, 'prueba') $q$, '22023');

-- Escrituras directas prohibidas aun para el editor
select pruebas.espera_error('A14 Editor inserta directo en lote_eventos',
  $q$ insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo)
      values (pruebas.id('est_a'), pruebas.id('lote_a'), pruebas.id('vacunos_a'), pruebas.id('cat_terneros'), 50, public.fecha_hoy(), 'compra') $q$, '42501');
select pruebas.espera_error('A15 Editor cambia el estado de un lote a mano (permiso por columna)',
  $q$ update public.lotes set estado = 'cerrado', fecha_cierre = public.fecha_hoy() where id = pruebas.id('lote_a') $q$, '42501');
select pruebas.espera_error('A16 Editor borra un lote',
  $q$ delete from public.lotes where id = pruebas.id('lote_a') $q$, '42501');
select pruebas.espera_error('A17 Editor inserta directo en establecimientos',
  $q$ insert into public.establecimientos (nombre, departamento) values ('Directo', 'Salto') $q$, '42501');
select pruebas.espera_error('A18 Editor inserta directo en membresías',
  $q$ insert into public.membresias (establecimiento_id, user_id, rol) values (pruebas.id('est_a'), pruebas.id('u_ajeno'), 'editor') $q$, '42501');
select pruebas.espera_error('A19 Editor falsea created_by de una persona',
  $q$ insert into public.personas (establecimiento_id, nombre, created_by) values (pruebas.id('est_a'), 'X', pruebas.id('u_ajeno')) $q$, '42501');

-- Cierre y reapertura
select pruebas.espera_error('A20 Cerrar un lote con stock',
  $q$ select public.cerrar_lote(pruebas.id('lote_a'), public.fecha_hoy()) $q$, '23514');
select pruebas.espera_valor('A21 Vender los 5 toros (ajuste a cero)',
  $q$ select (public.registrar_ajuste(pruebas.id('lote_b'), pruebas.id('cat_toros'), -5, public.fecha_hoy(), 'Venta de prueba') is not null)::text $q$, 'true');
select pruebas.espera_ok('A22 Cerrar el lote con stock en cero',
  $q$ select public.cerrar_lote(pruebas.id('lote_b'), public.fecha_hoy(), 'Prueba de cierre') $q$);
select pruebas.espera_valor('A23 El lote quedó cerrado',
  $q$ select estado from public.lotes where id = pruebas.id('lote_b') $q$, 'cerrado');
select pruebas.espera_error('A24 Ajuste en un lote cerrado',
  $q$ select public.registrar_ajuste(pruebas.id('lote_b'), pruebas.id('cat_toros'), 1, public.fecha_hoy(), 'prueba') $q$, '22023');
select pruebas.espera_ok('A25 Reabrir el lote',
  $q$ select public.reabrir_lote(pruebas.id('lote_b'), public.fecha_hoy(), 'Prueba de reapertura') $q$);
select pruebas.espera_valor('A26 Cierre y reapertura quedaron registrados',
  $q$ select count(*) from public.lote_cambios_estado where lote_id = pruebas.id('lote_b') $q$, '2');
select pruebas.espera_valor('A27 Parámetros: 19 departamentos',
  $q$ select count(*) from public.parametros where clave = 'departamentos' $q$, '19');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Lector B (mismo establecimiento): ve todo, no escribe nada
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_lector');

select pruebas.espera_valor('B01 Lector ve el establecimiento',
  $q$ select count(*) from public.establecimientos $q$, '1');
select pruebas.espera_valor('B02 mi_rol del lector',
  $q$ select public.mi_rol(pruebas.id('est_a')) $q$, 'lector');
select pruebas.espera_valor('B02b Lector es miembro pero no editor',
  $q$ select (public.es_miembro(pruebas.id('est_a')) and not public.es_editor(pruebas.id('est_a')))::text $q$, 'true');
select pruebas.espera_valor('B03 Lector ve los lotes',
  $q$ select count(*) from public.lotes $q$, '2');
select pruebas.espera_valor('B04 Lector ve el stock por lote (v_stock_lote)',
  $q$ select cabezas from public.v_stock_lote where lote_id = pruebas.id('lote_a') and categoria_id = pruebas.id('cat_terneros') $q$, '112');
select pruebas.espera_valor('B04b Lector ve las filas de stock por lote de su establecimiento (terneros y terneras)',
  $q$ select count(*) from public.v_stock_lote where establecimiento_id = pruebas.id('est_a') $q$, '2');
select pruebas.espera_valor('B04c Lector ve el stock del establecimiento (v_stock_establecimiento)',
  $q$ select cabezas from public.v_stock_establecimiento where establecimiento_id = pruebas.id('est_a') and categoria_id = pruebas.id('cat_terneras') $q$, '80');
select pruebas.espera_valor('B04d Lector ve solo su establecimiento en v_stock_establecimiento',
  $q$ select count(distinct establecimiento_id) from public.v_stock_establecimiento $q$, '1');
select pruebas.espera_error('B05 Lector crea una persona',
  $q$ insert into public.personas (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Intruso') $q$, '42501');
select pruebas.espera_filas('B06 Lector edita un lote: 0 filas, sin error (la app lo trata como "sin permiso")',
  $q$ update public.lotes set notas = 'hackeado' where id = pruebas.id('lote_a') $q$, 0);
select pruebas.espera_filas('B07 Lector edita el establecimiento: 0 filas',
  $q$ update public.establecimientos set nombre = 'Hackeado' where id = pruebas.id('est_a') $q$, 0);
select pruebas.espera_filas('B08 Lector edita una categoría: 0 filas',
  $q$ update public.categorias_animales set nombre = 'Hackeada' where id = pruebas.id('cat_terneros') $q$, 0);
select pruebas.espera_error('B09 Lector inserta directo en lote_eventos',
  $q$ insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo)
      values (pruebas.id('est_a'), pruebas.id('lote_a'), pruebas.id('vacunos_a'), pruebas.id('cat_terneros'), 50, public.fecha_hoy(), 'compra') $q$, '42501');
select pruebas.espera_error('B10 Lector llama a registrar_ajuste (RPC)',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), 10, public.fecha_hoy(), 'prueba') $q$, '42501');
select pruebas.espera_error('B11 Lector llama a crear_lote (RPC)',
  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos_a'), 'X', public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('cat_terneros'), 'cabezas', 1))) $q$, '42501');
select pruebas.espera_error('B12 Lector llama a cerrar_lote (RPC)',
  $q$ select public.cerrar_lote(pruebas.id('lote_b'), public.fecha_hoy()) $q$, '42501');
select pruebas.espera_error('B13 Lector se agrega como editor',
  $q$ insert into public.membresias (establecimiento_id, user_id, rol) values (pruebas.id('est_a'), pruebas.id('u_lector'), 'editor') $q$, '42501');
select pruebas.espera_error('B14 Lector se cambia el rol a editor',
  $q$ update public.membresias set rol = 'editor' where user_id = pruebas.id('u_lector') $q$, '42501');
select pruebas.espera_valor('B15 El stock no cambió',
  $q$ select cabezas from public.v_stock_lote where lote_id = pruebas.id('lote_a') and categoria_id = pruebas.id('cat_terneros') $q$, '112');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Usuario C, editor de otro establecimiento: no ve ni toca nada de A
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_ajeno');

select set_config('test.est_c', public.crear_establecimiento('Otro campo (prueba)', 'Salto')::text, false);

select pruebas.espera_valor('C01 C ve solo su establecimiento',
  $q$ select count(*) from public.establecimientos $q$, '1');
select pruebas.espera_valor('C02 C no ve Santa Remigia',
  $q$ select count(*) from public.establecimientos where id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('C03 C no ve los lotes de A',
  $q$ select count(*) from public.lotes where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('C04 C no ve el stock por lote de A (v_stock_lote)',
  $q$ select count(*) from public.v_stock_lote where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('C04b C no ve el stock del establecimiento de A (v_stock_establecimiento)',
  $q$ select count(*) from public.v_stock_establecimiento where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('C04c C ve 0 filas en total en v_stock_lote (no tiene lotes)',
  $q$ select count(*) from public.v_stock_lote $q$, '0');
select pruebas.espera_valor('C04d C ve 0 filas en total en v_stock_establecimiento',
  $q$ select count(*) from public.v_stock_establecimiento $q$, '0');
select pruebas.espera_valor('C05 C no ve los eventos de A',
  $q$ select count(*) from public.lote_eventos where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('C06 C no ve las membresías de A',
  $q$ select count(*) from public.membresias where establecimiento_id = pruebas.id('est_a') $q$, '0');
select pruebas.espera_valor('C07 mi_rol de C en Santa Remigia',
  $q$ select public.mi_rol(pruebas.id('est_a')) $q$, null);
select pruebas.espera_error('C08 C ajusta un lote de A (RPC)',
  $q$ select public.registrar_ajuste(pruebas.id('lote_a'), pruebas.id('cat_terneros'), -10, public.fecha_hoy(), 'robo') $q$, '42501');
select pruebas.espera_error('C09 C crea un lote en el establecimiento de A (RPC)',
  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos_a'), 'X', public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('cat_terneros'), 'cabezas', 1))) $q$, '42501');
select pruebas.espera_filas('C10 C edita un lote de A: 0 filas',
  $q$ update public.lotes set notas = 'x' where id = pruebas.id('lote_a') $q$, 0);
select pruebas.espera_error('C11 C crea una persona en el establecimiento de A',
  $q$ insert into public.personas (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Intruso') $q$, '42501');
select pruebas.espera_error('C12 C usa una especie de A en su propio establecimiento (FK compuesta)',
  $q$ insert into public.categorias_animales (establecimiento_id, especie_id, nombre)
      values (pruebas.id('est_c'), pruebas.id('vacunos_a'), 'Robada') $q$, '23503');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Sin sesión (anon)
-- ════════════════════════════════════════════════════════════════════════════

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pruebas.espera_error('N01 anon lee establecimientos',
  $q$ select count(*) from public.establecimientos $q$, '42501');
select pruebas.espera_error('N02 anon lee parametros',
  $q$ select count(*) from public.parametros $q$, '42501');
select pruebas.espera_error('N03 anon lee el stock por lote',
  $q$ select count(*) from public.v_stock_lote $q$, '42501');
select pruebas.espera_error('N03b anon lee el stock del establecimiento',
  $q$ select count(*) from public.v_stock_establecimiento $q$, '42501');
select pruebas.espera_error('N04 anon llama a crear_establecimiento (RPC)',
  $q$ select public.crear_establecimiento('Anon', 'Salto') $q$, '42501');
select pruebas.espera_error('N05 anon llama a es_editor (RPC)',
  $q$ select public.es_editor(pruebas.id('est_a')) $q$, '42501');
select pruebas.espera_error('N06 anon llama a es_miembro (RPC)',
  $q$ select public.es_miembro(pruebas.id('est_a')) $q$, '42501');
select pruebas.espera_error('N07 anon llama a mi_rol (RPC)',
  $q$ select public.mi_rol(pruebas.id('est_a')) $q$, '42501');

-- Permisos declarados (no por comportamiento): helpers solo para authenticated
reset role;
select pruebas.espera_valor('N08 Helpers: execute para authenticated, no para anon ni public',
  $q$ select bool_and(
        has_function_privilege('authenticated', p.oid, 'execute')
        and not has_function_privilege('anon', p.oid, 'execute')
        and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))::text
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('es_miembro', 'es_editor', 'mi_rol') $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Administrador: la inmutabilidad vale también para él
-- ════════════════════════════════════════════════════════════════════════════

reset role;

select pruebas.espera_error('P01 Admin modifica un evento',
  $q$ update public.lote_eventos set cabezas = 999 where lote_id = pruebas.id('lote_a') $q$, '42501');
select pruebas.espera_error('P02 Admin borra un evento',
  $q$ delete from public.lote_eventos where lote_id = pruebas.id('lote_a') $q$, '42501');
select pruebas.espera_error('P03 Admin vacía lote_eventos (truncate)',
  $q$ truncate public.lote_eventos $q$, '42501');
select pruebas.espera_error('P04 Admin modifica un cierre/reapertura',
  $q$ update public.lote_cambios_estado set motivo = 'x' $q$, '42501');
select pruebas.espera_error('P05 Admin borra un establecimiento con datos (restrict, sin cascada)',
  $q$ delete from public.establecimientos where id = pruebas.id('est_a') $q$, '23503');
select pruebas.espera_error('P06 Admin borra un lote con eventos (restrict, sin cascada)',
  $q$ delete from public.lotes where id = pruebas.id('lote_a') $q$, '23503');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Reporte (error a propósito: deshace todo)
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_rep   text := current_setting('test.rep');
  v_ok    int  := (select count(*) from regexp_matches(v_rep, E'\nOK ', 'g'));
  v_falla int  := (select count(*) from regexp_matches(v_rep, E'\nFALLA ', 'g'));
begin
  raise exception 'PRUEBAS RLS ETAPA 3: % OK, % FALLA (este error es a propósito: deshace todos los datos de prueba)%',
    v_ok, v_falla, v_rep;
end $$;
