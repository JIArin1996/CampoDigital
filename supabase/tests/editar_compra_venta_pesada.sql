-- Campo Digital v2 — Pruebas de editar compra, venta y pesada (paso 2a)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261104000200_editar_compra_venta_pesada).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS EDITAR COMPRA, VENTA Y PESADA: N OK, ...", que deshace todo.
--      El resultado esperado es "48 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia.
-- El reparto entre titulares se arma directo en la tabla (como la base), para probar los tres casos.

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

-- Línea de una actividad: {"categoria_id", "cabezas", "peso_vivo_total_kg"?} (sin peso, la clave no va)
create function pruebas.lin(p_cat text, p_cabezas int, p_peso numeric default null) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas, 'peso_vivo_total_kg', p_peso))
$$;

-- Precio en dólares de una compra o venta
create function pruebas.precio(p_monto numeric, p_estado text) returns jsonb language sql immutable as $$
  select jsonb_build_object('monto', p_monto, 'moneda', 'USD', 'estado', p_estado)
$$;

-- Eventos de stock de una actividad: cuántos y la suma de cabezas ("n|suma")
create function pruebas.eventos(p_clave text) returns text language sql stable as $$
  select count(*) || '|' || coalesce(sum(cabezas), 0) from public.lote_eventos where actividad_id = pruebas.id(p_clave)
$$;

-- El movimiento vigente (no anulado) de una actividad
create function pruebas.mov(p_clave text) returns uuid language sql stable as $$
  select id from public.movimientos_economicos where actividad_id = pruebas.id(p_clave) and anulado_en is null
$$;

-- Registros de cierre y reapertura de un lote ("cierres|reaperturas")
create function pruebas.cambios(p_lote text) returns text language sql stable as $$
  select count(*) filter (where tipo = 'cierre') || '|' || count(*) filter (where tipo = 'reapertura')
  from public.lote_cambios_estado where lote_id = pruebas.id(p_lote)
$$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres): las funciones nuevas
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 editar_compra, editar_venta y editar_pesada: security definer, search_path fijo, authenticated sí y anon no',
  $q$ select count(*) filter (where p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('editar_compra', 'editar_venta', 'editar_pesada') $q$, '3/3');
select pruebas.espera_valor('B02 Las 7 internas nuevas: search_path fijo, sin security definer y nadie las ejecuta por la API',
  $q$ select count(*) filter (where not p.prosecdef and coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
          || '/' || count(*)
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_lotes_de_actividad', '_responsables_de_actividad', '_empezar_edicion', '_terminar_edicion',
                          '_cargar_compraventa', '_cargar_pesada', '_actualizar_movimiento_actividad') $q$, '7/7');
select pruebas.espera_valor('B03 registrar_compra, registrar_venta y registrar_pesada: una versión cada una, con la misma firma',
  $q$ select count(*)::text from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('registrar_compra', 'registrar_venta', 'registrar_pesada') $q$, '3');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Preparación
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.guardar('vacunos',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('novillos', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('terneros', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros' $q$);
select pruebas.guardar('per_oper', $q$ select id from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_operador') $q$);

-- Titulares y un pagador (como la base, para no depender de los permisos de Economía)
reset role;
select pruebas.guardar('tit_1', $q$ insert into public.titulares (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Hermanos') returning id $q$);
select pruebas.guardar('tit_2', $q$ insert into public.titulares (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Madre') returning id $q$);
select pruebas.guardar('pag_1', $q$ insert into public.pagadores (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Juan tarjeta') returning id $q$);
set local role authenticated;

select pruebas.como('u_operador');
-- LA: 20 novillos (d-40). c1: compra de 10 terneros a LA (d-30), USD 1000 pagado por "Juan tarjeta",
-- con identificador. v1: venta de 8 terneros de LA (d-20), USD 2000 pendiente.
select pruebas.guardar('LA', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LA Recría', pruebas.d(40), pruebas.comp('novillos', 20)) $q$);
select pruebas.guardar('c1', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(30), p_lineas => jsonb_build_array(pruebas.lin('terneros', 10)), p_modalidad => 'productor',
      p_lote_id => pruebas.id('LA'),
      p_precio => pruebas.precio(1000, 'pagado') || jsonb_build_object('pagador_id', pruebas.id('pag_1'), 'identificador', 'Terneros de Pérez')) $q$);
select pruebas.guardar('c1_mov', $q$ select pruebas.mov('c1') $q$);
select pruebas.guardar('v1', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(20),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 8)), p_modalidad => 'remate', p_precio => pruebas.precio(2000, 'pendiente')) $q$);
select pruebas.guardar('v1_mov', $q$ select pruebas.mov('v1') $q$);
-- LS1 y LS2: 5 novillos cada uno (d-15). v2: venta de los 5 de LS1 (d-5), que lo cierra.
select pruebas.guardar('LS1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LS1 Gordos', pruebas.d(15), pruebas.comp('novillos', 5)) $q$);
select pruebas.guardar('LS2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LS2 Gordos', pruebas.d(15), pruebas.comp('novillos', 5)) $q$);
select pruebas.guardar('v2', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LS1'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5)), p_modalidad => 'frigorifico') $q$);
-- c3: compra de 6 terneros a un lote nuevo LN (d-10). pe1: pesada de 10 novillos de LA (d-5).
select pruebas.guardar('c3', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(10), p_lineas => jsonb_build_array(pruebas.lin('terneros', 6)), p_modalidad => 'remate',
      p_lote_nuevo => jsonb_build_object('nombre', 'LN Compra nueva', 'especie_id', pruebas.id('vacunos'))) $q$);
select pruebas.guardar('LN', $q$ select lote_creado_id from public.actividades where id = pruebas.id('c3') $q$);
select pruebas.guardar('pe1', $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 10, 3000))) $q$);

select pruebas.espera_valor('P01 Preparación: LA con 20 novillos y 2 terneros; LS1 cerrado (1 cierre); LS2 con 5; LN con 6',
  $q$ select pruebas.stock('LA', 'novillos') || '|' || pruebas.stock('LA', 'terneros') || '|'
          || (select estado from public.lotes where id = pruebas.id('LS1')) || '|' || pruebas.cambios('LS1') || '|'
          || pruebas.stock('LS2', 'novillos') || '|' || pruebas.stock('LN', 'terneros') $q$,
  '20|2|cerrado|1|0|5|6');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Compra: cabezas, saldo, fecha, versión y eventos
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_ok('C01 Compra de 10 a 12 terneros con 8 ya vendidos: se acepta',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c1'), p_fecha => pruebas.d(30),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 12)), p_modalidad => 'productor', p_lote_id => pruebas.id('LA'),
      p_precio => pruebas.precio(1000, 'pagado')) $q$);
select pruebas.espera_valor('C02 LA queda con 4 terneros (12 - 8)',
  $q$ select pruebas.stock('LA', 'terneros')::text $q$, '4');
select pruebas.espera_valor('C03 No quedan eventos de la versión vieja: un solo evento de la compra, +12 (sin inversos)',
  $q$ select pruebas.eventos('c1') $q$, '1|12');
-- Las versiones solo las lee el administrador (el operador no ve ninguna)
select pruebas.espera_valor('C04a El operador no ve las versiones',
  $q$ select count(*)::text from public.actividad_versiones where actividad_id = pruebas.id('c1') $q$, '0');
select pruebas.como('u_admin');
select pruebas.espera_valor('C04 Se guardó la versión anterior (edición), con su evento de +10 (como administrador)',
  $q$ select count(*) || '|' || min(accion) || '|' || min((version -> 'eventos' -> 0 ->> 'cabezas'))
      from public.actividad_versiones where actividad_id = pruebas.id('c1') $q$, '1|edicion|10');
select pruebas.como('u_operador');
select pruebas.espera_valor('C05 Marcada como editada por el operador; v_actividades la trae con 12 cabezas',
  $q$ select (a.editada_en is not null and a.editada_por = pruebas.id('u_operador'))::text || '|' || v.cabezas || '|' || (v.editada_en is not null)::text
      from public.actividades a join public.v_actividades v on v.id = a.id where a.id = pruebas.id('c1') $q$, 'true|12|true');
select pruebas.espera_valor('C06 Es el mismo movimiento, y conserva el pagador y el identificador',
  $q$ select (id = pruebas.id('c1_mov'))::text || '|' || (pagador_id = pruebas.id('pag_1'))::text || '|' || identificador
      from public.movimientos_economicos where id = pruebas.mov('c1') $q$, 'true|true|Terneros de Pérez');

select pruebas.espera_error('C07 Compra de 12 a 5 terneros con 8 vendidos: se rechaza (el stock quedaría negativo)',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c1'), p_fecha => pruebas.d(30),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 5)), p_modalidad => 'productor', p_lote_id => pruebas.id('LA'),
      p_precio => pruebas.precio(1000, 'pagado')) $q$, '23514');
select pruebas.espera_error('C08 Cambio de fecha que rompe el saldo (la compra pasa a después de la venta): se rechaza',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c1'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 12)), p_modalidad => 'productor', p_lote_id => pruebas.id('LA'),
      p_precio => pruebas.precio(1000, 'pagado')) $q$, '23514');
select pruebas.como('u_admin');
select pruebas.espera_valor('C09 Los intentos rechazados no cambiaron nada: +12 a d-30, 1 versión, 4 terneros',
  $q$ select pruebas.eventos('c1') || '|' || (select (min(fecha) = pruebas.d(30))::text from public.lote_eventos where actividad_id = pruebas.id('c1'))
          || '|' || (select count(*) from public.actividad_versiones where actividad_id = pruebas.id('c1')) || '|' || pruebas.stock('LA', 'terneros') $q$,
  '1|12|true|1|4');
select pruebas.como('u_operador');
select pruebas.espera_ok('C10 Cambio de fecha que no rompe el saldo (d-25): se acepta',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c1'), p_fecha => pruebas.d(25),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 12)), p_modalidad => 'productor', p_lote_id => pruebas.id('LA'),
      p_precio => pruebas.precio(1000, 'pagado')) $q$);
select pruebas.espera_valor('C11 El evento y el movimiento pasan a d-25',
  $q$ select (select (fecha = pruebas.d(25))::text from public.lote_eventos where actividad_id = pruebas.id('c1')) || '|'
          || (select (fecha = pruebas.d(25))::text from public.movimientos_economicos where id = pruebas.mov('c1')) $q$, 'true|true');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Venta: del lote A al B, y una edición que no cambia el cierre
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_ok('V01 La venta v2 pasa de LS1 a LS2',
  $q$ select public.editar_venta(p_actividad_id => pruebas.id('v2'), p_lote_id => pruebas.id('LS2'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5)), p_modalidad => 'frigorifico') $q$);
select pruebas.espera_valor('V02 LS1 se reabre con sus 5 novillos, con su registro de reapertura ("Edición de venta")',
  $q$ select l.estado || '|' || pruebas.stock('LS1', 'novillos') || '|' || pruebas.cambios('LS1') || '|'
          || (select motivo from public.lote_cambios_estado c where c.lote_id = l.id and c.tipo = 'reapertura')
      from public.lotes l where l.id = pruebas.id('LS1') $q$, 'activo|5|1|1|Edición de venta');
select pruebas.espera_valor('V03 LS2 queda en cero y se cierra ("Vendido")',
  $q$ select l.estado || '|' || pruebas.stock('LS2', 'novillos') || '|' || pruebas.cambios('LS2') || '|'
          || (select motivo from public.lote_cambios_estado c where c.lote_id = l.id and c.tipo = 'cierre')
      from public.lotes l where l.id = pruebas.id('LS2') $q$, 'cerrado|0|1|0|Vendido');
select pruebas.espera_valor('V04 La venta queda en LS2: su lote principal y su único evento',
  $q$ select (a.lote_id = pruebas.id('LS2'))::text || '|'
          || (select string_agg(al.lote_id::text, ',') = pruebas.id('LS2')::text from public.actividad_lotes al where al.actividad_id = a.id)::text
          || '|' || pruebas.eventos('v2')
      from public.actividades a where a.id = pruebas.id('v2') $q$, 'true|true|1|-5');
select pruebas.espera_ok('V05 Otra edición de la venta en LS2 (cambia la contraparte; el lote sigue vendido)',
  $q$ select public.editar_venta(p_actividad_id => pruebas.id('v2'), p_lote_id => pruebas.id('LS2'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5)), p_modalidad => 'frigorifico', p_contraparte => 'Frigorífico Tacuarembó') $q$);
select pruebas.espera_valor('V06 LS2 termina igual que empezó: cerrado, misma fecha y sin registros nuevos',
  $q$ select l.estado || '|' || (l.fecha_cierre = pruebas.d(5))::text || '|' || pruebas.cambios('LS2')
      from public.lotes l where l.id = pruebas.id('LS2') $q$, 'cerrado|true|1|0');
select pruebas.espera_error('V07 No se pasa una venta a un lote cerrado que no era suyo (LS2 está cerrado; la venta v1 es de LA)',
  $q$ select public.editar_venta(p_actividad_id => pruebas.id('v1'), p_lote_id => pruebas.id('LS2'), p_fecha => pruebas.d(20),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'remate', p_precio => pruebas.precio(2000, 'pendiente')) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Precio: editar, quitar y agregar
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_ok('M01 Editar el precio de la venta v1 (2000 a 2500)',
  $q$ select public.editar_venta(p_actividad_id => pruebas.id('v1'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(20),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 8)), p_modalidad => 'remate', p_precio => pruebas.precio(2500, 'pendiente')) $q$);
select pruebas.espera_valor('M02 Es el mismo movimiento, con USD 2500 y marcado como editado',
  $q$ select (id = pruebas.id('v1_mov'))::text || '|' || monto_usd || '|' || (editado_en is not null)::text
      from public.movimientos_economicos where id = pruebas.mov('v1') $q$, 'true|2500.00|true');
select pruebas.espera_ok('M03 Quitar el precio de la venta v1',
  $q$ select public.editar_venta(p_actividad_id => pruebas.id('v1'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(20),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 8)), p_modalidad => 'remate', p_precio => null) $q$);
select pruebas.espera_valor('M04 El movimiento queda anulado ("Precio quitado al editar la actividad") y la vista, sin monto',
  $q$ select (m.anulado_en is not null)::text || '|' || m.motivo_anulacion || '|' || coalesce(v.monto_usd::text, 'sin monto')
      from public.movimientos_economicos m, public.v_actividades v
      where m.id = pruebas.id('v1_mov') and v.id = pruebas.id('v1') $q$, 'true|Precio quitado al editar la actividad|sin monto');
select pruebas.espera_ok('M05 Volver a ponerle precio (USD 1800)',
  $q$ select public.editar_venta(p_actividad_id => pruebas.id('v1'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(20),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 8)), p_modalidad => 'remate', p_precio => pruebas.precio(1800, 'pendiente')) $q$);
select pruebas.espera_valor('M06 Se crea un movimiento nuevo (el anulado sigue anulado): uno vigente de USD 1800',
  $q$ select count(*) filter (where anulado_en is null) || '|' || count(*) || '|'
          || (select monto_usd from public.movimientos_economicos where id = pruebas.mov('v1'))::text
          || '|' || (pruebas.mov('v1') <> pruebas.id('v1_mov'))::text
      from public.movimientos_economicos where actividad_id = pruebas.id('v1') $q$, '1|2|1800.00|true');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Reparto entre titulares (el movimiento de c1, USD 1000)
-- ════════════════════════════════════════════════════════════════════════════

reset role;
select pruebas.preparar('rep_1', $q$ insert into public.movimiento_titulares (movimiento_id, titular_id, establecimiento_id, monto)
      values (pruebas.id('c1_mov'), pruebas.id('tit_1'), pruebas.id('est_a'), 1000) $q$);
set local role authenticated;
select pruebas.como('u_operador');
select pruebas.espera_ok('R01 Un solo titular por el total: el precio pasa de 1000 a 1200',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c1'), p_fecha => pruebas.d(25),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 12)), p_modalidad => 'productor', p_lote_id => pruebas.id('LA'),
      p_precio => pruebas.precio(1200, 'pagado')) $q$);
select pruebas.espera_valor('R02 ...y el monto del titular sigue al total (1200)',
  $q$ select string_agg(monto::text, ',') from public.movimiento_titulares where movimiento_id = pruebas.id('c1_mov') $q$, '1200.00');

reset role;
select pruebas.preparar('rep_2', $q$ update public.movimiento_titulares set monto = 600 where movimiento_id = pruebas.id('c1_mov') $q$);
select pruebas.preparar('rep_2b', $q$ insert into public.movimiento_titulares (movimiento_id, titular_id, establecimiento_id, monto)
      values (pruebas.id('c1_mov'), pruebas.id('tit_2'), pruebas.id('est_a'), 600) $q$);
set local role authenticated;
select pruebas.como('u_operador');
select pruebas.espera_error('R03 Dos titulares y cambia el total (1200 a 1300): se bloquea',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c1'), p_fecha => pruebas.d(25),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 12)), p_modalidad => 'productor', p_lote_id => pruebas.id('LA'),
      p_precio => pruebas.precio(1300, 'pagado')) $q$, '22023');
select pruebas.espera_ok('R04 Dos titulares y el total no cambia (solo las notas): se acepta',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c1'), p_fecha => pruebas.d(25),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 12)), p_modalidad => 'productor', p_lote_id => pruebas.id('LA'),
      p_precio => pruebas.precio(1200, 'pagado'), p_notas => 'Precio confirmado') $q$);
select pruebas.espera_valor('R05 El reparto queda igual (600 y 600)',
  $q$ select string_agg(monto::text, ',' order by monto) from public.movimiento_titulares where movimiento_id = pruebas.id('c1_mov') $q$, '600.00,600.00');

reset role;
select pruebas.preparar('rep_3', $q$ delete from public.movimiento_titulares where movimiento_id = pruebas.id('c1_mov') and titular_id = pruebas.id('tit_2') $q$);
set local role authenticated;
select pruebas.como('u_operador');
select pruebas.espera_error('R06 Un solo titular con otro monto (600 de 1200) y cambia el total: se bloquea',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c1'), p_fecha => pruebas.d(25),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 12)), p_modalidad => 'productor', p_lote_id => pruebas.id('LA'),
      p_precio => pruebas.precio(1250, 'pagado')) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Compra que creó su lote: el destino queda fijo
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('N01 La compra que creó LN no pasa a otro lote',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c3'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 6)), p_modalidad => 'remate', p_lote_id => pruebas.id('LA')) $q$, '22023');
select pruebas.espera_ok('N02 Sin indicar lote, queda en LN: de 6 a 7 terneros',
  $q$ select public.editar_compra(p_actividad_id => pruebas.id('c3'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 7)), p_modalidad => 'remate') $q$);
select pruebas.espera_valor('N03 LN con 7 terneros y la compra sigue siendo la que lo creó',
  $q$ select pruebas.stock('LN', 'terneros') || '|' || (lote_creado_id = pruebas.id('LN') and lote_id = pruebas.id('LN'))::text
      from public.actividades where id = pruebas.id('c3') $q$, '7|true');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Pesada, responsables y permisos
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_error('S01 Pesada con más cabezas que el stock de la categoría ese día (25 de 20): se rechaza',
  $q$ select public.editar_pesada(p_actividad_id => pruebas.id('pe1'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 25, 7500))) $q$, '23514');
select pruebas.espera_ok('S02 Pesada de 10 a 15 novillos, con un responsable',
  $q$ select public.editar_pesada(p_actividad_id => pruebas.id('pe1'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 15, 4500)), p_responsables => array[pruebas.id('per_oper')]) $q$);
select pruebas.espera_valor('S03 Una sola línea, de 15 cabezas y 300 kg de promedio; 1 responsable; sin eventos de stock',
  $q$ select v.cabezas || '|' || v.peso_promedio_kg || '|' || cardinality(v.responsables) || '|' || pruebas.eventos('pe1')
      from public.v_actividades v where v.id = pruebas.id('pe1') $q$, '15|300.0|1|0|0');
select pruebas.espera_ok('S04 Otra edición sin responsables',
  $q$ select public.editar_pesada(p_actividad_id => pruebas.id('pe1'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 15, 4500))) $q$);
select pruebas.como('u_admin');
select pruebas.espera_valor('S05 La pesada queda sin responsables y con 2 versiones guardadas',
  $q$ select (select count(*) from public.actividad_responsables where actividad_id = pruebas.id('pe1')) || '|'
          || (select count(*) from public.actividad_versiones where actividad_id = pruebas.id('pe1')) $q$, '0|2');
select pruebas.como('u_operador');

select pruebas.espera_error('S06 editar_venta sobre una compra: no es de ese tipo',
  $q$ select public.editar_venta(p_actividad_id => pruebas.id('c1'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(25),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 12)), p_modalidad => 'productor') $q$, '22023');

select pruebas.como('u_consulta');
select pruebas.espera_error('S07 Consulta no edita actividades',
  $q$ select public.editar_pesada(p_actividad_id => pruebas.id('pe1'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 15, 4500))) $q$, '42501');

-- Una eliminada no se edita
select pruebas.como('u_operador');
select pruebas.guardar('pe2', $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(4),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5, 1500))) $q$);
select pruebas.como('u_admin');
select pruebas.preparar('elim_pe2', $q$ select public.eliminar_actividad(pruebas.id('pe2')) $q$);
select pruebas.como('u_operador');
select pruebas.espera_error('S08 Una actividad eliminada no se edita',
  $q$ select public.editar_pesada(p_actividad_id => pruebas.id('pe2'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(4),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 6, 1800))) $q$, '22023');

-- Registrar sigue igual
select pruebas.espera_ok('S09 registrar_pesada sigue funcionando (y es idempotente con el mismo id)',
  $q$ select public.registrar_pesada(p_id => pruebas.id('pe1'), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 15, 4500))) $q$);
select pruebas.espera_error('S10 registrar_venta sigue validando el saldo (vender 30 novillos de LA, que tiene 20)',
  $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LA'), p_fecha => pruebas.d(1),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 30)), p_modalidad => 'remate') $q$, '23514');

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Reporte (error a propósito: deshace todo)
-- ════════════════════════════════════════════════════════════════════════════

reset role;
do $$
declare
  v_rep      text := current_setting('test.rep');
  v_ok       int  := (select count(*) from regexp_matches(v_rep, E'\nOK ', 'g'));
  v_falla    int  := (select count(*) from regexp_matches(v_rep, E'\nFALLA ', 'g'));
  v_omitida  int  := (select count(*) from regexp_matches(v_rep, E'\nOMITIDA ', 'g'));
  v_prep     int  := (select count(*) from regexp_matches(v_rep, E'\nPREP ', 'g'));
  v_raices   text := coalesce((select string_agg(m[1], E'\n') from regexp_matches(v_rep, E'\n(PREP [^\n]*)', 'g') m), '(ninguna)');
begin
  raise exception E'PRUEBAS EDITAR COMPRA, VENTA Y PESADA: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
