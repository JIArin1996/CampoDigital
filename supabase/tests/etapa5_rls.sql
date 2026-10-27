-- Campo Digital v2 — Pruebas de la Etapa 5: operaciones de lote, stock a una fecha y bitácora
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261016000200_etapa5_lotes_y_bitacora).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ETAPA 5: N OK, M FALLA ...", que deshace todo.
--      El resultado esperado es "0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA y no
--      como FALLA: corregir primero las PREP, que son la causa raíz.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test), creados y borrados dentro de la transacción:
--   A = administrador, O = operador y Q = consulta de Santa Remigia, X = operador de otro campo.

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

insert into public.perfiles (id, email, nombre, es_admin)
values
  (current_setting('test.u_admin')::uuid,    'admin@campodigital.test',    'Ana',    true),
  (current_setting('test.u_operador')::uuid, 'operador@campodigital.test', 'Oscar',  false),
  (current_setting('test.u_consulta')::uuid, 'consulta@campodigital.test', 'Quena',  false),
  (current_setting('test.u_ajeno')::uuid,    'ajeno@campodigital.test',    'Xavier', false)
on conflict (id) do update set es_admin = excluded.es_admin, nombre = excluded.nombre;

-- Esquema auxiliar de pruebas (desaparece con el rollback final)
create schema pruebas;
grant usage on schema pruebas to authenticated, anon;

-- Registro de resultados. Cuatro tipos de línea:
--   OK, FALLA, OMITIDA (depende de una preparación que falló) y PREP (preparación fallida: la causa raíz).
create function pruebas.linea(p_tipo text, p text) returns void language plpgsql as $$
begin
  perform set_config('test.rep', current_setting('test.rep') || E'\n' || rpad(p_tipo, 8) || p, false);
end $$;

create function pruebas.ok(p text)      returns void language sql as $$ select pruebas.linea('OK', p) $$;
create function pruebas.falla(p text)   returns void language sql as $$ select pruebas.linea('FALLA', p) $$;
create function pruebas.omitida(p text) returns void language sql as $$ select pruebas.linea('OMITIDA', p) $$;

-- Id guardado durante la prueba. Si la preparación que lo crea falló (o nunca corrió),
-- corta con el código propio ZZ001, que las pruebas registran como OMITIDA y no como FALLA.
create function pruebas.id(p_clave text) returns uuid language plpgsql stable as $$
declare
  v text := current_setting('test.' || p_clave, true);
begin
  if v is null or v = '' or v = 'FALLIDA' then
    raise exception '%', p_clave using errcode = 'ZZ001';
  end if;
  return v::uuid;
end $$;

-- Fecha relativa a hoy
create function pruebas.d(p_dias int) returns date language sql stable as $$
  select public.fecha_hoy() - p_dias
$$;

create function pruebas.como(p_clave text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.' || p_clave), 'role', 'authenticated')::text, true);
end $$;

-- Composición jsonb de una categoría: [{"categoria_id": ..., "cabezas": n}]
create function pruebas.comp(p_cat text, p_cabezas int) returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas))
$$;

-- Stock actual de una categoría en un lote (0 si no tiene)
create function pruebas.stock(p_lote text, p_cat text) returns int language sql stable as $$
  select coalesce((select cabezas from public.v_stock_lote
                   where lote_id = pruebas.id(p_lote) and categoria_id = pruebas.id(p_cat)), 0)
$$;

create function pruebas.espera_error(p_nombre text, p_sql text, p_sqlstate text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = 'ZZ001' then
      perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
    elsif sqlstate = p_sqlstate then
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
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
  end if;
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
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
  end if;
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
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
  end if;
end $$;

-- Preparación que guarda un id en test.<clave>. Si falla, la clave queda FALLIDA:
--   * si falló por su propia cuenta, es una causa raíz (PREP);
--   * si falló porque dependía de otra preparación fallida, se registra como OMITIDA.
create function pruebas.guardar(p_clave text, p_sql text) returns void
language plpgsql as $$
declare
  v text;
begin
  execute p_sql into v;
  if v is null then
    raise exception 'la sentencia no devolvió ningún id' using errcode = 'P0002';
  end if;
  perform set_config('test.' || p_clave, v, false);
exception when others then
  perform set_config('test.' || p_clave, 'FALLIDA', false);
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida('preparación ' || p_clave || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.linea('PREP', p_clave || ': ' || sqlstate || ' ' || sqlerrm);
  end if;
end $$;

-- Preparación sin resultado (por ejemplo, un ajuste o una asignación de rol). Misma lógica:
-- si falla, deja FALLIDA la clave indicada, para que lo que dependa de ella quede omitido.
create function pruebas.preparar(p_clave text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
exception when others then
  perform set_config('test.' || p_clave, 'FALLIDA', false);
  if sqlstate = 'ZZ001' then
    perform pruebas.omitida('preparación ' || p_clave || '  (depende de la preparación: ' || sqlerrm || ')');
  else
    perform pruebas.linea('PREP', p_clave || ': ' || sqlstate || ' ' || sqlerrm);
  end if;
end $$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Administrador: establecimientos, roles y catálogos
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno', $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);

select pruebas.guardar('vacunos', $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('ovinos',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovinos' $q$);
select pruebas.guardar('terneros', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros' $q$);
select pruebas.guardar('novillos', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Novillos' $q$);
select pruebas.guardar('toros',    $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Toros' $q$);
select pruebas.guardar('corderos', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Corderos' $q$);
select pruebas.guardar('persona_o', $q$ select id from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_operador') $q$);
select pruebas.guardar('vacunos_x', $q$ select id from public.especies where establecimiento_id = pruebas.id('est_x') and nombre = 'Vacunos' $q$);
select pruebas.guardar('terneros_x', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_x') and nombre = 'Terneros' $q$);
select pruebas.guardar('persona_x', $q$ select id from public.personas where establecimiento_id = pruebas.id('est_x') and user_id = pruebas.id('u_ajeno') $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Operador: dividir (saldo día por día)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

-- L1: 10 terneros el día d-10 ("día 1") y +40 el día d-5 ("día 5")
select pruebas.guardar('L1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L1 Terneros', pruebas.d(10), pruebas.comp('terneros', 10)) $q$);
select pruebas.preparar('L1', $q$ select public.registrar_ajuste(pruebas.id('L1'), pruebas.id('terneros'), 40, pruebas.d(5), 'Compra no registrada') $q$);

select pruebas.espera_error('D01 Dividir 30 con fecha del "día 3" (d-7) cuando ese día había 10: el día queda en -20',
  $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(7),
      jsonb_build_array(jsonb_build_object('nombre', 'Separados', 'composicion', pruebas.comp('terneros', 30)))) $q$, '23514');
select pruebas.espera_valor('D02 El intento fallido no dejó lotes ni eventos',
  $q$ select (select count(*) from public.lotes where nombre = 'Separados') + (select count(*) from public.lote_eventos where lote_id = pruebas.id('L1') and tipo = 'division') $q$, '0');

select pruebas.guardar('op_div', $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(5),
      jsonb_build_array(jsonb_build_object('nombre', 'L2 Pesados', 'composicion', pruebas.comp('terneros', 30)))) $q$);
select pruebas.guardar('L2', $q$ select l.lote_id from public.operacion_lote_vinculos l where l.operacion_id = pruebas.id('op_div') and l.rol = 'destino' $q$);
select pruebas.espera_valor('D03 Dividir 30 el mismo día que entraron los 40: origen 20, destino 30',
  $q$ select pruebas.stock('L1', 'terneros') || '/' || pruebas.stock('L2', 'terneros') $q$, '20/30');
select pruebas.espera_valor('D04 El lote nuevo abre en la fecha de la operación, con la misma especie',
  $q$ select (fecha_apertura = pruebas.d(5) and especie_id = pruebas.id('vacunos'))::text from public.lotes where id = pruebas.id('L2') $q$, 'true');
select pruebas.espera_valor('D05 Vínculos: un origen y un destino',
  $q$ select string_agg(rol, ',' order by rol) from public.operacion_lote_vinculos where operacion_id = pruebas.id('op_div') $q$, 'destino,origen');
select pruebas.espera_valor('D06 El origen con stock sigue activo',
  $q$ select estado from public.lotes where id = pruebas.id('L1') $q$, 'activo');
select pruebas.espera_error('D08 Dividir más cabezas de las que hay (25 de 20)',
  $q$ select public.dividir_lote(pruebas.id('L1'), public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('nombre', 'X', 'composicion', pruebas.comp('terneros', 25)))) $q$, '23514');
select pruebas.espera_error('D09 Dividir con una categoría de otra especie (corderos en lote vacuno)',
  $q$ select public.dividir_lote(pruebas.id('L1'), public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('nombre', 'X', 'composicion', pruebas.comp('corderos', 1)))) $q$, '22023');
select pruebas.espera_error('D10 Dividir con cabezas decimales',
  $q$ select public.dividir_lote(pruebas.id('L1'), public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('nombre', 'X', 'composicion', jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('terneros'), 'cabezas', 1.5))))) $q$, '22023');
select pruebas.espera_error('D11 Dividir con fecha anterior a la apertura',
  $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(11),
      jsonb_build_array(jsonb_build_object('nombre', 'X', 'composicion', pruebas.comp('terneros', 1)))) $q$, '22023');
select pruebas.espera_error('D12 Dividir con fecha futura',
  $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(-1),
      jsonb_build_array(jsonb_build_object('nombre', 'X', 'composicion', pruebas.comp('terneros', 1)))) $q$, '22023');
select pruebas.espera_error('D13 Dividir sin destinos',
  $q$ select public.dividir_lote(pruebas.id('L1'), public.fecha_hoy(), '[]'::jsonb) $q$, '22023');

-- Dividir todo el lote: el origen se cierra y queda el registro de cierre
select pruebas.guardar('L3', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L3 Toros', pruebas.d(3), pruebas.comp('toros', 5)) $q$);
select pruebas.espera_ok('D14 Dividir los 5 toros (todo el lote)',
  $q$ select public.dividir_lote(pruebas.id('L3'), pruebas.d(2),
      jsonb_build_array(jsonb_build_object('nombre', 'L3b Toros', 'composicion', pruebas.comp('toros', 5)))) $q$);
select pruebas.espera_valor('D15 El origen quedó cerrado con fecha d-2',
  $q$ select estado || '/' || (fecha_cierre = pruebas.d(2))::text from public.lotes where id = pruebas.id('L3') $q$, 'cerrado/true');
select pruebas.espera_valor('D16 Registro de cierre en lote_cambios_estado, con motivo',
  $q$ select tipo || '|' || (fecha = pruebas.d(2))::text || '|' || motivo from public.lote_cambios_estado where lote_id = pruebas.id('L3') $q$, 'cierre|true|Dividido en L3b Toros');

-- Cierre con fecha = último evento cuando la operación es retroactiva
select pruebas.guardar('L4', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L4 Toros', pruebas.d(6), pruebas.comp('toros', 5)) $q$);
select pruebas.preparar('L4', $q$ select public.registrar_ajuste(pruebas.id('L4'), pruebas.id('toros'),  1, pruebas.d(1), 'Entró uno') $q$);
select pruebas.preparar('L4', $q$ select public.registrar_ajuste(pruebas.id('L4'), pruebas.id('toros'), -1, pruebas.d(1), 'Salió uno') $q$);
select pruebas.espera_ok('D17 Dividir todo L4 con fecha d-4 (hay eventos posteriores, en d-1)',
  $q$ select public.dividir_lote(pruebas.id('L4'), pruebas.d(4),
      jsonb_build_array(jsonb_build_object('nombre', 'L4b', 'composicion', pruebas.comp('toros', 5)))) $q$);
select pruebas.espera_valor('D18 Fecha de cierre = la mayor entre la operación (d-4) y el último evento (d-1)',
  $q$ select (fecha_cierre = pruebas.d(1))::text from public.lotes where id = pruebas.id('L4') $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: recategorizar
-- ════════════════════════════════════════════════════════════════════════════

-- L1 hoy: 20 terneros (10 el d-10, +40 y -30 el d-5)
select pruebas.espera_ok('R01 Recategorizar 8 terneros a novillos con fecha hacia atrás (d-4)',
  $q$ select public.recategorizar_lote(pruebas.id('L1'), pruebas.d(4),
      jsonb_build_array(jsonb_build_object('desde_categoria_id', pruebas.id('terneros'), 'hacia_categoria_id', pruebas.id('novillos'), 'cabezas', 8))) $q$);
select pruebas.espera_valor('R02 Saldos: 12 terneros y 8 novillos',
  $q$ select pruebas.stock('L1', 'terneros') || '/' || pruebas.stock('L1', 'novillos') $q$, '12/8');
select pruebas.espera_error('R03 Recategorizar a la misma categoría',
  $q$ select public.recategorizar_lote(pruebas.id('L1'), public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('desde_categoria_id', pruebas.id('terneros'), 'hacia_categoria_id', pruebas.id('terneros'), 'cabezas', 1))) $q$, '22023');
select pruebas.espera_error('R04 Recategorizar más de lo que hay (50 de 12)',
  $q$ select public.recategorizar_lote(pruebas.id('L1'), public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('desde_categoria_id', pruebas.id('terneros'), 'hacia_categoria_id', pruebas.id('novillos'), 'cabezas', 50))) $q$, '23514');
select pruebas.espera_error('R05 Recategorizar hacia atrás cuando ese día no había (10 el d-9, antes de los +40)',
  $q$ select public.recategorizar_lote(pruebas.id('L1'), pruebas.d(9),
      jsonb_build_array(jsonb_build_object('desde_categoria_id', pruebas.id('terneros'), 'hacia_categoria_id', pruebas.id('novillos'), 'cabezas', 11))) $q$, '23514');
select pruebas.espera_error('R06 Recategorizar a una categoría de otra especie',
  $q$ select public.recategorizar_lote(pruebas.id('L1'), public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('desde_categoria_id', pruebas.id('terneros'), 'hacia_categoria_id', pruebas.id('corderos'), 'cabezas', 1))) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Operador: unir
-- ════════════════════════════════════════════════════════════════════════════

-- Volver a unir L2 en L1 (ciclo de linaje: L1 → L2 → L1)
select pruebas.espera_ok('U01 Unir L2 (30 terneros) en L1, destino existente',
  $q$ select public.unir_lotes(array[pruebas.id('L2')], public.fecha_hoy(), pruebas.id('L1')) $q$);
select pruebas.espera_valor('U02 L1 ahora tiene 42 terneros (12 + 30) y L2 quedó cerrado',
  $q$ select pruebas.stock('L1', 'terneros') || '/' || (select estado from public.lotes where id = pruebas.id('L2')) $q$, '42/cerrado');
select pruebas.espera_valor('U03 Motivo del cierre de L2',
  $q$ select motivo from public.lote_cambios_estado where lote_id = pruebas.id('L2') and tipo = 'cierre' $q$, 'Unido a L1 Terneros');

-- Dos lotes a uno nuevo
select pruebas.guardar('L6', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L6', pruebas.d(2), pruebas.comp('terneros', 5)) $q$);
select pruebas.preparar('L6', $q$ select public.registrar_ajuste(pruebas.id('L6'), pruebas.id('terneros'), 1, pruebas.d(1), 'Apareció uno') $q$);
select pruebas.guardar('L7', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L7', pruebas.d(2), pruebas.comp('terneros', 3)) $q$);
select pruebas.espera_error('U04 Unir con fecha anterior al último movimiento de un origen (L6 tiene un evento el d-1)',
  $q$ select public.unir_lotes(array[pruebas.id('L6'), pruebas.id('L7')], pruebas.d(2), null, '{"nombre": "Juntos"}'::jsonb) $q$, '22023');
select pruebas.guardar('op_union', $q$ select public.unir_lotes(array[pruebas.id('L6'), pruebas.id('L7')], public.fecha_hoy(), null, '{"nombre": "Juntos"}'::jsonb) $q$);
select pruebas.guardar('L_juntos', $q$ select lote_id from public.operacion_lote_vinculos where operacion_id = pruebas.id('op_union') and rol = 'destino' $q$);
select pruebas.espera_valor('U05 El lote nuevo tiene 9 terneros (6 + 3) y los dos orígenes están cerrados',
  $q$ select pruebas.stock('L_juntos', 'terneros') || '/' || (select count(*) from public.lotes where id in (pruebas.id('L6'), pruebas.id('L7')) and estado = 'cerrado') $q$, '9/2');
select pruebas.espera_error('U06 El destino no puede ser también un origen',
  $q$ select public.unir_lotes(array[pruebas.id('L1')], public.fecha_hoy(), pruebas.id('L1')) $q$, '22023');
select pruebas.espera_error('U07 Lote nuevo con un solo origen',
  $q$ select public.unir_lotes(array[pruebas.id('L1')], public.fecha_hoy(), null, '{"nombre": "Solo"}'::jsonb) $q$, '22023');
select pruebas.guardar('L8', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('ovinos'), 'L8 Corderos', pruebas.d(1), pruebas.comp('corderos', 10)) $q$);
select pruebas.espera_error('U08 Unir lotes de especies distintas (ovinos en vacunos)',
  $q$ select public.unir_lotes(array[pruebas.id('L8')], public.fecha_hoy(), pruebas.id('L1')) $q$, '22023');
select pruebas.espera_error('U09 Unir un lote cerrado',
  $q$ select public.unir_lotes(array[pruebas.id('L2')], public.fecha_hoy(), pruebas.id('L1')) $q$, '22023');
select pruebas.guardar('L9', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L9', pruebas.d(3), pruebas.comp('terneros', 2)) $q$);
select pruebas.espera_error('U10 Unir con fecha anterior a la apertura del destino (destino "Juntos" abrió hoy)',
  $q$ select public.unir_lotes(array[pruebas.id('L9')], pruebas.d(1), pruebas.id('L_juntos')) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Linaje y stock a una fecha
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('L01 Linaje de L1 con ciclo (L1 → L2 → L1): termina, L2 una vez por relación',
  $q$ select string_agg(relacion || ':' || nombre, ',' order by relacion) from public.linaje_lote(pruebas.id('L1')) $q$,
  'ancestro:L2 Pesados,descendiente:L2 Pesados');
select pruebas.espera_valor('L02 Sin duplicados: filas = pares (lote, relación) distintos',
  $q$ select (count(*) = count(distinct (lote_id, relacion)))::text from public.linaje_lote(pruebas.id('L1')) $q$, 'true');
select pruebas.espera_valor('L03 El lote consultado no aparece en su propio linaje',
  $q$ select count(*) from public.linaje_lote(pruebas.id('L1')) where lote_id = pruebas.id('L1') $q$, '0');
select pruebas.espera_valor('L04 Linaje de "Juntos": sus dos ancestros, nivel 1',
  $q$ select string_agg(nombre || '@' || nivel, ',' order by nombre) from public.linaje_lote(pruebas.id('L_juntos')) where relacion = 'ancestro' $q$, 'L6@1,L7@1');
select pruebas.espera_valor('L05 La recategorización no aparece en el linaje',
  $q$ select count(*) from public.linaje_lote(pruebas.id('L1')) where tipo = 'recategorizacion' $q$, '0');

select pruebas.espera_valor('S01 stock_al(hoy) = v_stock_establecimiento (sin diferencias en ningún sentido)',
  $q$ select count(*) from (
        (select especie_id, categoria_id, cabezas from public.stock_al(pruebas.id('est_a'), public.fecha_hoy())
         except select especie_id, categoria_id, cabezas from public.v_stock_establecimiento where establecimiento_id = pruebas.id('est_a'))
        union all
        (select especie_id, categoria_id, cabezas from public.v_stock_establecimiento where establecimiento_id = pruebas.id('est_a')
         except select especie_id, categoria_id, cabezas from public.stock_al(pruebas.id('est_a'), public.fecha_hoy()))
      ) d $q$, '0');
select pruebas.espera_valor('S02 stock_al antes de la división (d-6): terneros como antes (10)',
  $q$ select cabezas from public.stock_al(pruebas.id('est_a'), pruebas.d(6)) where categoria_id = pruebas.id('terneros') $q$, '10');
select pruebas.espera_valor('S03 stock_al(d-8): solo los 10 terneros del alta de L1',
  $q$ select count(*) || '/' || sum(cabezas) from public.stock_al(pruebas.id('est_a'), pruebas.d(8)) $q$, '1/10');
select pruebas.espera_valor('S04 stock_al cuenta lotes hoy cerrados (toros de L3 y L4 al d-3)',
  $q$ select cabezas from public.stock_al(pruebas.id('est_a'), pruebas.d(3)) where categoria_id = pruebas.id('toros') $q$, '10');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Operador: bitácora
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('e_idea', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'idea',
      'Probar suplemento en los terneros', array[pruebas.id('L1'), pruebas.id('L_juntos')], array[pruebas.id('persona_o')]) $q$);
select pruebas.espera_valor('B01 Una idea nueva arranca abierta, con 2 lotes y fecha de hoy',
  $q$ select e.estado_idea || '/' || (select count(*) from public.bitacora_lotes l where l.entrada_id = e.id) || '/' || (e.fecha = public.fecha_hoy())::text
      from public.bitacora_entradas e where e.id = pruebas.id('e_idea') $q$, 'abierta/2/true');
select pruebas.guardar('e_dec', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), pruebas.d(2), 'decision', 'Vender los toros en marzo') $q$);
select pruebas.espera_valor('B02 Lo que no es idea no tiene estado',
  $q$ select coalesce(estado_idea, 'sin estado') from public.bitacora_entradas where id = pruebas.id('e_dec') $q$, 'sin estado');
select pruebas.espera_ok('B03 Cambiar el estado de la idea a decidida',
  $q$ select public.cambiar_estado_idea(pruebas.id('e_idea'), 'decidida') $q$);
select pruebas.espera_valor('B04 Cambiar el estado NO cuenta como edición',
  $q$ select estado_idea || '/' || (editada_en is null)::text from public.bitacora_entradas where id = pruebas.id('e_idea') $q$, 'decidida/true');
select pruebas.espera_error('B05 Cambiar el estado de algo que no es idea',
  $q$ select public.cambiar_estado_idea(pruebas.id('e_dec'), 'decidida') $q$, '22023');
select pruebas.espera_error('B06 Crear con fecha futura',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), pruebas.d(-1), 'observacion', 'x') $q$, '22023');
select pruebas.espera_error('B07 Crear con texto vacío',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', '   ') $q$, '22023');
select pruebas.espera_error('B08 Operador escribe en un establecimiento donde no está asignado',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_x'), null, 'observacion', 'x', array[pruebas.id('L1')]) $q$, '42501');
select pruebas.espera_error('B09 Responsable de otro establecimiento',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x', null, array[pruebas.id('persona_x')]) $q$, '22023');

-- Edición por otro usuario (admin): created_by no cambia, editada_* sí
select pruebas.como('u_admin');
select pruebas.espera_ok('B10 El admin edita la idea: pasa a observación, con un solo lote',
  $q$ select public.editar_entrada_bitacora(pruebas.id('e_idea'), public.fecha_hoy(), 'observacion',
      'Se probó suplemento en los terneros', array[pruebas.id('L1')], array[pruebas.id('persona_o')]) $q$);
select pruebas.espera_valor('B11 Después de editar: sin estado, 1 lote, created_by = operador, editada_por = admin',
  $q$ select coalesce(e.estado_idea, 'sin estado') || '/' || (select count(*) from public.bitacora_lotes l where l.entrada_id = e.id)
           || '/' || (e.created_by = pruebas.id('u_operador'))::text || '/' || (e.editada_por = pruebas.id('u_admin'))::text
      from public.bitacora_entradas e where e.id = pruebas.id('e_idea') $q$, 'sin estado/1/true/true');
select pruebas.espera_ok('B12 Volver a idea: arranca abierta',
  $q$ select public.editar_entrada_bitacora(pruebas.id('e_idea'), public.fecha_hoy(), 'idea', 'Probar suplemento', null) $q$);
select pruebas.espera_valor('B13 Estado abierta y sin lotes (null los reemplaza por ninguno)',
  $q$ select e.estado_idea || '/' || (select count(*) from public.bitacora_lotes l where l.entrada_id = e.id)
      from public.bitacora_entradas e where e.id = pruebas.id('e_idea') $q$, 'abierta/0');

-- Anular y restaurar
select pruebas.como('u_operador');
select pruebas.espera_error('B14 Anular sin motivo',
  $q$ select public.anular_entrada_bitacora(pruebas.id('e_idea'), ' ') $q$, '22023');
select pruebas.espera_ok('B15 Anular con motivo',
  $q$ select public.anular_entrada_bitacora(pruebas.id('e_idea'), 'Cargada por error') $q$);
select pruebas.espera_valor('B16 Datos de la anulación completos',
  $q$ select (anulada_en is not null and anulada_por = pruebas.id('u_operador') and motivo_anulacion = 'Cargada por error')::text
      from public.bitacora_entradas where id = pruebas.id('e_idea') $q$, 'true');
select pruebas.espera_error('B17 Una entrada anulada no se edita',
  $q$ select public.editar_entrada_bitacora(pruebas.id('e_idea'), public.fecha_hoy(), 'idea', 'x') $q$, '22023');
select pruebas.espera_error('B18 Una entrada anulada no cambia de estado',
  $q$ select public.cambiar_estado_idea(pruebas.id('e_idea'), 'descartada') $q$, '22023');
select pruebas.espera_valor('B19 Ideas abiertas para el inicio: excluye las anuladas',
  $q$ select count(*) from public.bitacora_entradas where establecimiento_id = pruebas.id('est_a')
      and tipo = 'idea' and estado_idea = 'abierta' and anulada_en is null $q$, '0');
select pruebas.espera_ok('B20 Restaurar',
  $q$ select public.restaurar_entrada_bitacora(pruebas.id('e_idea')) $q$);
select pruebas.espera_valor('B21 Restaurada: sin datos de anulación y vuelve a contar como idea abierta',
  $q$ select (anulada_en is null and anulada_por is null and motivo_anulacion is null)::text
           || '/' || (select count(*) from public.bitacora_entradas where establecimiento_id = pruebas.id('est_a')
                      and tipo = 'idea' and estado_idea = 'abierta' and anulada_en is null)
      from public.bitacora_entradas where id = pruebas.id('e_idea') $q$, 'true/1');

-- No se borra ni se escribe directo
select pruebas.espera_error('B22 Borrar una entrada (operador)',
  $q$ delete from public.bitacora_entradas where id = pruebas.id('e_dec') $q$, '42501');
select pruebas.espera_error('B23 Insertar directo en bitacora_entradas',
  $q$ insert into public.bitacora_entradas (establecimiento_id, tipo, texto) values (pruebas.id('est_a'), 'observacion', 'x') $q$, '42501');
select pruebas.espera_error('B24 Actualizar directo (dejar una idea sin estado)',
  $q$ update public.bitacora_entradas set estado_idea = null where id = pruebas.id('e_idea') $q$, '42501');
select pruebas.espera_error('B25 Borrar etiquetas directo',
  $q$ delete from public.bitacora_lotes $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Consulta: lee todo, no escribe nada (ni por RPC)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');

select pruebas.espera_valor('Q01 Consulta lee la bitácora',
  $q$ select count(*) from public.bitacora_entradas where establecimiento_id = pruebas.id('est_a') $q$, '2');
select pruebas.espera_valor('Q02 Consulta usa linaje_lote (lectura)',
  $q$ select count(*) from public.linaje_lote(pruebas.id('L1')) $q$, '2');
select pruebas.espera_valor('Q03 Consulta usa stock_al (lectura)',
  $q$ select sum(cabezas) from public.stock_al(pruebas.id('est_a'), pruebas.d(8)) $q$, '10');
select pruebas.espera_error('Q04 Consulta: dividir_lote',
  $q$ select public.dividir_lote(pruebas.id('L1'), public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('nombre', 'X', 'composicion', pruebas.comp('terneros', 1)))) $q$, '42501');
select pruebas.espera_error('Q05 Consulta: unir_lotes',
  $q$ select public.unir_lotes(array[pruebas.id('L_juntos')], public.fecha_hoy(), pruebas.id('L1')) $q$, '42501');
select pruebas.espera_error('Q06 Consulta: recategorizar_lote',
  $q$ select public.recategorizar_lote(pruebas.id('L1'), public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('desde_categoria_id', pruebas.id('terneros'), 'hacia_categoria_id', pruebas.id('novillos'), 'cabezas', 1))) $q$, '42501');
select pruebas.espera_error('Q07 Consulta: crear_entrada_bitacora',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x') $q$, '42501');
select pruebas.espera_error('Q08 Consulta: editar_entrada_bitacora',
  $q$ select public.editar_entrada_bitacora(pruebas.id('e_dec'), public.fecha_hoy(), 'decision', 'x') $q$, '42501');
select pruebas.espera_error('Q09 Consulta: cambiar_estado_idea',
  $q$ select public.cambiar_estado_idea(pruebas.id('e_idea'), 'decidida') $q$, '42501');
select pruebas.espera_error('Q10 Consulta: anular_entrada_bitacora',
  $q$ select public.anular_entrada_bitacora(pruebas.id('e_dec'), 'x') $q$, '42501');
select pruebas.espera_error('Q11 Consulta: restaurar_entrada_bitacora',
  $q$ select public.restaurar_entrada_bitacora(pruebas.id('e_dec')) $q$, '42501');
select pruebas.espera_error('Q12 Consulta: borrar una entrada',
  $q$ delete from public.bitacora_entradas where id = pruebas.id('e_dec') $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. X, de otro establecimiento: no ve ni toca nada de Santa Remigia
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_ajeno');

select pruebas.espera_valor('X01 X ve 0 entradas de bitácora de Santa Remigia',
  $q$ select ((select count(*) from public.bitacora_entradas where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.bitacora_lotes where establecimiento_id = pruebas.id('est_a')))::text $q$, '0');
select pruebas.espera_valor('X02 X: linaje de un lote ajeno, 0 filas',
  $q$ select count(*) from public.linaje_lote(pruebas.id('L1')) $q$, '0');
select pruebas.espera_valor('X03 X: stock_al de un establecimiento ajeno, 0 filas',
  $q$ select count(*) from public.stock_al(pruebas.id('est_a'), public.fecha_hoy()) $q$, '0');
select pruebas.espera_error('X04 X divide un lote ajeno',
  $q$ select public.dividir_lote(pruebas.id('L1'), public.fecha_hoy(),
      jsonb_build_array(jsonb_build_object('nombre', 'X', 'composicion', pruebas.comp('terneros', 1)))) $q$, '42501');
select pruebas.espera_error('X05 X escribe en la bitácora ajena',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x') $q$, '42501');
select pruebas.espera_error('X06 X anula una entrada ajena',
  $q$ select public.anular_entrada_bitacora(pruebas.id('e_dec'), 'x') $q$, '42501');
select pruebas.espera_error('X07 X etiqueta un lote ajeno en su propia bitácora',
  $q$ select public.crear_entrada_bitacora(pruebas.id('est_x'), null, 'observacion', 'x', array[pruebas.id('L1')]) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Sin sesión (anon): ninguna función nueva
-- ════════════════════════════════════════════════════════════════════════════

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pruebas.espera_error('N01 anon: dividir_lote',        $q$ select public.dividir_lote(pruebas.id('L1'), public.fecha_hoy(), '[]'::jsonb) $q$, '42501');
select pruebas.espera_error('N02 anon: unir_lotes',          $q$ select public.unir_lotes(array[pruebas.id('L1')], public.fecha_hoy()) $q$, '42501');
select pruebas.espera_error('N03 anon: recategorizar_lote',  $q$ select public.recategorizar_lote(pruebas.id('L1'), public.fecha_hoy(), '[]'::jsonb) $q$, '42501');
select pruebas.espera_error('N04 anon: linaje_lote',         $q$ select * from public.linaje_lote(pruebas.id('L1')) $q$, '42501');
select pruebas.espera_error('N05 anon: stock_al',            $q$ select * from public.stock_al(pruebas.id('est_a'), public.fecha_hoy()) $q$, '42501');
select pruebas.espera_error('N06 anon: crear_entrada_bitacora', $q$ select public.crear_entrada_bitacora(pruebas.id('est_a'), null, 'observacion', 'x') $q$, '42501');
select pruebas.espera_error('N07 anon: editar_entrada_bitacora', $q$ select public.editar_entrada_bitacora(pruebas.id('e_dec'), public.fecha_hoy(), 'decision', 'x') $q$, '42501');
select pruebas.espera_error('N08 anon: cambiar_estado_idea', $q$ select public.cambiar_estado_idea(pruebas.id('e_idea'), 'decidida') $q$, '42501');
select pruebas.espera_error('N09 anon: anular_entrada_bitacora', $q$ select public.anular_entrada_bitacora(pruebas.id('e_dec'), 'x') $q$, '42501');
select pruebas.espera_error('N10 anon: restaurar_entrada_bitacora', $q$ select public.restaurar_entrada_bitacora(pruebas.id('e_dec')) $q$, '42501');
select pruebas.espera_error('N11 anon: leer la bitácora',     $q$ select count(*) from public.bitacora_entradas $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Base (postgres): restricciones que valen para todos
-- ════════════════════════════════════════════════════════════════════════════

reset role;

select pruebas.espera_error('P01 Una idea no puede quedar sin estado (check, aun como postgres)',
  $q$ update public.bitacora_entradas set estado_idea = null where id = pruebas.id('e_idea') $q$, '23514');
select pruebas.espera_error('P02 Lo que no es idea no puede tener estado',
  $q$ update public.bitacora_entradas set estado_idea = 'abierta' where id = pruebas.id('e_dec') $q$, '23514');
select pruebas.espera_error('P03 Anulación incompleta (sin motivo)',
  $q$ update public.bitacora_entradas set anulada_en = now(), anulada_por = pruebas.id('u_admin') where id = pruebas.id('e_dec') $q$, '23514');
select pruebas.espera_error('P04 Borrar una entrada, aun como postgres',
  $q$ delete from public.bitacora_entradas where id = pruebas.id('e_dec') $q$, '42501');
select pruebas.espera_error('P05 Etiquetar un lote de otro establecimiento (FK compuesta)',
  $q$ insert into public.bitacora_lotes (establecimiento_id, entrada_id, lote_id) values (pruebas.id('est_x'), pruebas.id('e_dec'), pruebas.id('L1')) $q$, '23503');
select pruebas.espera_error('P06 Modificar un evento de división (inmutable)',
  $q$ update public.lote_eventos set cabezas = 1 where operacion_lote_id = pruebas.id('op_div') $q$, '42501');
select pruebas.espera_valor('P07 Funciones nuevas: escritura sin anon; internas sin authenticated',
  $q$ select bool_and(
        not has_function_privilege('anon', p.oid, 'execute')
        and has_function_privilege('authenticated', p.oid, 'execute') = (p.proname not like '\_%' and p.proname <> 'bloquear_borrado'))::text
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('dividir_lote', 'unir_lotes', 'recategorizar_lote', 'linaje_lote', 'stock_al',
                          'crear_entrada_bitacora', 'editar_entrada_bitacora', 'cambiar_estado_idea',
                          'anular_entrada_bitacora', 'restaurar_entrada_bitacora',
                          '_validar_fecha_operacion', '_cabezas', '_exigir_categoria', '_cerrar_si_vacio',
                          '_validar_entrada_bitacora', '_guardar_lotes_bitacora', '_bloquear_entrada_bitacora',
                          'bloquear_borrado') $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Reporte (error a propósito: deshace todo)
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_rep      text := current_setting('test.rep');
  v_ok       int  := (select count(*) from regexp_matches(v_rep, E'\nOK ', 'g'));
  v_falla    int  := (select count(*) from regexp_matches(v_rep, E'\nFALLA ', 'g'));
  v_omitida  int  := (select count(*) from regexp_matches(v_rep, E'\nOMITIDA ', 'g'));
  v_prep     int  := (select count(*) from regexp_matches(v_rep, E'\nPREP ', 'g'));
  v_raices   text := coalesce((select string_agg(m[1], E'\n') from regexp_matches(v_rep, E'\n(PREP [^\n]*)', 'g') m), '(ninguna)');
begin
  raise exception E'PRUEBAS ETAPA 5: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
