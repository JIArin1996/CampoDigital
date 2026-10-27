-- Campo Digital v2 — Pruebas de la Etapa 6a: actividades que mueven stock
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (los kilos se guardan con dos decimales desde 20261020000600).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ETAPA 6A: N OK, M FALLA ...", que deshace todo.
--      El resultado esperado es "146 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS"
--      (121 pruebas sueltas + 25 de líneas mal formadas, generadas en un bloque do de la sección 6 bis).
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA y no
--      como FALLA: corregir primero las PREP, que son la causa raíz.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test), creados y borrados dentro de la transacción:
--   A = administrador, O = operador y Q = consulta de Santa Remigia, X = operador de otro campo.
-- Las actividades se cargan con p_id => gen_random_uuid(), como hará la app al abrir cada formulario.

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

-- Precio de una compra o venta (sin tipo de cambio, la clave no va)
create function pruebas.precio(p_monto numeric, p_moneda text, p_tc numeric, p_estado text) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('monto', p_monto, 'moneda', p_moneda, 'tipo_cambio', p_tc, 'estado', p_estado))
$$;

-- Líneas mal formadas (todas tienen que dar 22023). p_peso: se agrega a la línea si no es NULL,
-- para que en la pesada el error venga del caso probado y no de la falta de peso.
create function pruebas.mal(p_caso text, p_cat text, p_peso numeric) returns jsonb language plpgsql stable as $$
declare
  v_peso jsonb := case when p_peso is null then '{}'::jsonb else jsonb_build_object('peso_vivo_total_kg', p_peso) end;
begin
  return case p_caso
    when 'sin_categoria' then jsonb_build_array(jsonb_build_object('cabezas', 1) || v_peso)
    when 'cabezas_null'  then jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', null) || v_peso)
    when 'decimales'     then jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', 1.5) || v_peso)
    when 'vacio'         then '[]'::jsonb
    when 'null'          then null
  end;
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
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);

select pruebas.guardar('vacunos',     $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('ovinos',      $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovinos' $q$);
select pruebas.guardar('terneros',    $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros' $q$);
select pruebas.guardar('terneras',    $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneras' $q$);
select pruebas.guardar('novillos',    $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Novillos' $q$);
select pruebas.guardar('toros',       $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Toros' $q$);
select pruebas.guardar('vacas_cria',  $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacas de cría' $q$);
select pruebas.guardar('corderos',    $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Corderos' $q$);
select pruebas.guardar('ovejas_cria', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovejas de cría' $q$);
select pruebas.guardar('persona_o',   $q$ select id from public.personas where establecimiento_id = pruebas.id('est_a') and user_id = pruebas.id('u_operador') $q$);
select pruebas.guardar('vacunos_x',   $q$ select id from public.especies where establecimiento_id = pruebas.id('est_x') and nombre = 'Vacunos' $q$);
select pruebas.guardar('terneros_x',  $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_x') and nombre = 'Terneros' $q$);
select pruebas.guardar('persona_x',   $q$ select id from public.personas where establecimiento_id = pruebas.id('est_x') and user_id = pruebas.id('u_ajeno') $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Operador: compras (precio, monedas, lote nuevo) e idempotencia
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

-- LV: 20 novillos y 10 terneros desde d-20
select pruebas.guardar('LV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV Novillos', pruebas.d(20),
      pruebas.comp('novillos', 20) || pruebas.comp('terneros', 10)) $q$);

-- c1: compra de 15 terneros en un lote nuevo, d-8, remate, USD 9000 pagado
select pruebas.guardar('c1', $q$ select public.registrar_compra(
      p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => pruebas.d(8),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 15, 2250)), p_modalidad => 'remate',
      p_lote_nuevo => jsonb_build_object('nombre', 'LC Compra remate', 'especie_id', pruebas.id('vacunos')),
      p_contraparte => 'Escritorio Rural', p_precio => pruebas.precio(9000, 'USD', null, 'pagado'),
      p_persona_id => pruebas.id('persona_o')) $q$);
select pruebas.guardar('LC', $q$ select lote_id from public.actividades where id = pruebas.id('c1') $q$);
select pruebas.espera_valor('C01 Compra con lote nuevo: 15 terneros, el lote abre en la fecha de la compra',
  $q$ select pruebas.stock('LC', 'terneros') || '|' || (l.fecha_apertura = pruebas.d(8))::text || '|' || l.estado
      from public.lotes l where l.id = pruebas.id('LC') $q$, '15|true|activo');
select pruebas.espera_valor('C02 La actividad guarda el lote que creó (lote_id = lote_creado_id)',
  $q$ select (lote_creado_id = lote_id)::text from public.actividades where id = pruebas.id('c1') $q$, 'true');
select pruebas.espera_valor('C03 Movimiento: egreso, USD 9000, pagado, rubro por defecto Vacunos',
  $q$ select me.sentido || '|' || me.monto_usd || '|' || me.estado || '|' || r.nombre
      from public.movimientos_economicos me join public.rubros r on r.id = me.rubro_id
      where me.actividad_id = pruebas.id('c1') $q$, 'egreso|9000.00|pagado|Vacunos');

-- c2: 5 novillos al lote existente LV, d-6, UYU 1000 con tipo de cambio 41,3333, pendiente
select pruebas.guardar('c2', $q$ select public.registrar_compra(
      p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => pruebas.d(6),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5)), p_modalidad => 'productor',
      p_lote_id => pruebas.id('LV'), p_precio => pruebas.precio(1000, 'UYU', 41.3333, 'pendiente')) $q$);
select pruebas.espera_valor('C04 UYU 1000 / 41,3333 = USD 24,19 (round a 2 decimales), pendiente',
  $q$ select monto_usd || '|' || tipo_cambio || '|' || estado from public.movimientos_economicos where actividad_id = pruebas.id('c2') $q$,
  '24.19|41.3333|pendiente');
select pruebas.espera_valor('C05 Compra a lote existente: LV pasa a 25 novillos y la actividad no creó lote',
  $q$ select pruebas.stock('LV', 'novillos') || '|' || coalesce(lote_creado_id::text, 'sin lote creado')
      from public.actividades where id = pruebas.id('c2') $q$, '25|sin lote creado');

-- Idempotencia: el mismo p_id otra vez
select pruebas.espera_valor('I01 Repetir la compra con el mismo p_id devuelve la misma actividad',
  $q$ select (public.registrar_compra(
        p_id => pruebas.id('c2'), p_establecimiento_id => pruebas.id('est_a'), p_fecha => pruebas.d(6),
        p_lineas => jsonb_build_array(pruebas.lin('novillos', 5)), p_modalidad => 'productor',
        p_lote_id => pruebas.id('LV'), p_precio => pruebas.precio(1000, 'UYU', 41.3333, 'pendiente')) = pruebas.id('c2'))::text $q$, 'true');
select pruebas.espera_valor('I02 Sin duplicados: 1 actividad, 1 evento, 1 movimiento y LV sigue en 25 novillos',
  $q$ select (select count(*) from public.actividades where id = pruebas.id('c2')) || '|'
          || (select count(*) from public.lote_eventos where actividad_id = pruebas.id('c2')) || '|'
          || (select count(*) from public.movimientos_economicos where actividad_id = pruebas.id('c2')) || '|'
          || pruebas.stock('LV', 'novillos') $q$, '1|1|1|25');
select pruebas.espera_error('I03 El mismo p_id en otra función (venta con el id de una compra)',
  $q$ select public.registrar_venta(p_id => pruebas.id('c2'), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor') $q$, '42501');
select pruebas.espera_error('I04 Falta el p_id',
  $q$ select public.registrar_compra(p_id => null, p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV')) $q$, '22023');

select pruebas.como('u_admin');
select pruebas.espera_error('I05 Otro usuario (el administrador) reusa el p_id del operador',
  $q$ select public.registrar_compra(
        p_id => pruebas.id('c2'), p_establecimiento_id => pruebas.id('est_a'), p_fecha => pruebas.d(6),
        p_lineas => jsonb_build_array(pruebas.lin('novillos', 5)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV')) $q$, '42501');
select pruebas.como('u_operador');

-- c3: compra con todos los opcionales en NULL explícito (2 toros a LV, d-6)
select pruebas.guardar('c3', $q$ select public.registrar_compra(
      p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => pruebas.d(6),
      p_lineas => jsonb_build_array(pruebas.lin('toros', 2)), p_modalidad => 'otra', p_lote_id => pruebas.id('LV'),
      p_lote_nuevo => null, p_contraparte => null, p_kg_gancho => null, p_precio => null, p_persona_id => null, p_notas => null) $q$);
select pruebas.espera_valor('C06 Compra con precio NULL: no crea movimiento económico',
  $q$ select count(*) from public.movimientos_economicos where actividad_id = pruebas.id('c3') $q$, '0');
select pruebas.espera_valor('C06b Compra con opcionales NULL: sin responsable, contraparte, kg al gancho ni monto; LV suma 2 toros',
  $q$ select coalesce(a.persona_id::text, 'sin persona') || '|' || coalesce(cv.contraparte, 'sin contraparte') || '|'
          || coalesce(cv.kg_gancho::text, 'sin gancho') || '|' || coalesce(v.monto_usd::text, 'sin monto') || '|' || pruebas.stock('LV', 'toros')
      from public.actividades a join public.act_compraventa cv on cv.actividad_id = a.id join public.v_actividades v on v.id = a.id
      where a.id = pruebas.id('c3') $q$, 'sin persona|sin contraparte|sin gancho|sin monto|2');
select pruebas.espera_valor('C06c Con responsable: la compra c1 guarda la persona',
  $q$ select (persona_id = pruebas.id('persona_o'))::text from public.actividades where id = pruebas.id('c1') $q$, 'true');

select pruebas.espera_error('C07 Pesos sin tipo de cambio',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV'),
      p_precio => pruebas.precio(1000, 'UYU', null, 'pagado')) $q$, '22023');
select pruebas.espera_error('C08 Dólares con tipo de cambio',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV'),
      p_precio => pruebas.precio(1000, 'USD', 40, 'pagado')) $q$, '22023');
select pruebas.espera_error('C09 Precio sin estado (pagado o pendiente)',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV'),
      p_precio => pruebas.precio(1000, 'USD', null, null)) $q$, '22023');
select pruebas.espera_error('C10 Lote existente y lote nuevo a la vez',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV'),
      p_lote_nuevo => jsonb_build_object('nombre', 'X', 'especie_id', pruebas.id('vacunos'))) $q$, '22023');
select pruebas.espera_error('C11 Sin lote destino',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor') $q$, '22023');
select pruebas.espera_error('C12 Modalidad inválida',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'trueque', p_lote_id => pruebas.id('LV')) $q$, '23514');
select pruebas.espera_error('C13 Compra con fecha futura',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => pruebas.d(-1),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV')) $q$, '22023');
select pruebas.espera_error('C14 Compra con una categoría de otra especie (corderos a un lote vacuno)',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('corderos', 1)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV')) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Operador: pesadas (no mueven stock; peso vivo obligatorio; no más que el stock a esa fecha)
-- ════════════════════════════════════════════════════════════════════════════
-- LV: novillos 20 desde d-20 y 25 desde d-6; terneros 10; toros 2 desde d-6.

select pruebas.guardar('pe1', $q$ select public.registrar_pesada(
      p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(5),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 10, 3500.5), pruebas.lin('terneros', 10, 1500)),
      p_persona_id => null, p_notas => null) $q$);
select pruebas.espera_valor('PE00 Pesada con responsable y notas NULL: se guarda sin persona',
  $q$ select coalesce(persona_id::text, 'sin persona') || '|' || coalesce(notas, 'sin notas') from public.actividades where id = pruebas.id('pe1') $q$,
  'sin persona|sin notas');
select pruebas.espera_valor('PE01 Pesada: no mueve stock (0 eventos, LV sigue en 25 novillos)',
  $q$ select (select count(*) from public.lote_eventos where actividad_id = pruebas.id('pe1')) || '|' || pruebas.stock('LV', 'novillos') $q$, '0|25');
select pruebas.espera_valor('PE02 Se guarda el peso vivo de cada línea (novillos: 3500,5 kg)',
  $q$ select peso_vivo_total_kg::text from public.actividad_lineas where actividad_id = pruebas.id('pe1') and categoria_id = pruebas.id('novillos') $q$, '3500.50');
select pruebas.espera_valor('PE03 Vista: 20 cabezas, 5000,50 kg, promedio 250,0 kg (calculado, no guardado)',
  $q$ select cabezas || '|' || peso_vivo_total_kg || '|' || peso_promedio_kg from public.v_actividades where id = pruebas.id('pe1') $q$, '20|5000.50|250.0');
select pruebas.espera_error('PE04 Pesada sin peso vivo',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5))) $q$, '22023');
select pruebas.espera_error('PE05 Pesada con peso vivo cero',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5, 0))) $q$, '22023');
select pruebas.espera_error('PE06 Pesada con más cabezas que el stock (26 novillos, hay 25)',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 26, 9000))) $q$, '23514');
select pruebas.espera_error('PE07 Pesada de 25 novillos el d-7, cuando ese día había 20',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(7),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 25, 9000))) $q$, '23514');
select pruebas.guardar('pe2', $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(6),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 25, 9000))) $q$);
select pruebas.espera_valor('PE08 Pesada de 25 novillos el d-6 (ese día ya había 25): se guarda',
  $q$ select count(*) from public.actividades where id = pruebas.id('pe2') $q$, '1');
select pruebas.espera_error('PE09 Pesada con fecha futura',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(-1),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1, 300))) $q$, '22023');
select pruebas.espera_error('PE10 Pesada anterior a la apertura del lote',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(21),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1, 300))) $q$, '22023');
select pruebas.espera_error('PE11 Pesada con un responsable de otro establecimiento',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1, 300)), p_persona_id => pruebas.id('persona_x')) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Operador: ventas (kg al gancho, rendimiento, cierre automático)
-- ════════════════════════════════════════════════════════════════════════════

-- v1: 5 novillos de LV a frigorífico, d-2: 2400 kg vivos, 1260 kg al gancho, USD 6000
select pruebas.guardar('v1', $q$ select public.registrar_venta(
      p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(2),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5, 2400)), p_modalidad => 'frigorifico',
      p_contraparte => 'Frigorífico (prueba)', p_kg_gancho => 1260, p_precio => pruebas.precio(6000, 'USD', null, 'pagado')) $q$);
select pruebas.espera_valor('V01 Venta con kg al gancho: se guardan 1260,00 kg',
  $q$ select kg_gancho::text from public.act_compraventa where actividad_id = pruebas.id('v1') $q$, '1260.00');
select pruebas.espera_valor('V02 Rendimiento = gancho / peso vivo = 52,5 %; promedio 480,0 kg; 5 cabezas',
  $q$ select rendimiento_pct || '|' || peso_promedio_kg || '|' || cabezas from public.v_actividades where id = pruebas.id('v1') $q$, '52.5|480.0|5');
select pruebas.espera_valor('V03 Movimiento: ingreso USD 6000; LV queda con 20 novillos y activo',
  $q$ select me.sentido || '|' || me.monto_usd || '|' || pruebas.stock('LV', 'novillos') || '|' || l.estado
      from public.movimientos_economicos me join public.lotes l on l.id = me.lote_id
      where me.actividad_id = pruebas.id('v1') $q$, 'ingreso|6000.00|20|activo');
select pruebas.espera_error('V04 Venta de más cabezas que el stock (21 novillos, hay 20)',
  $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 21)), p_modalidad => 'productor') $q$, '23514');
select pruebas.espera_error('V05 Venta con kg al gancho negativos',
  $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'frigorifico', p_kg_gancho => -5) $q$, '22023');

-- v2: venta que deja el lote en cero
select pruebas.guardar('LS', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LS Toros', pruebas.d(10), pruebas.comp('toros', 3)) $q$);
select pruebas.guardar('v2', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LS'), p_fecha => pruebas.d(3),
      p_lineas => jsonb_build_array(pruebas.lin('toros', 3)), p_modalidad => 'remate',
      p_contraparte => null, p_kg_gancho => null, p_precio => null, p_persona_id => null, p_notas => null) $q$);
select pruebas.espera_valor('V05b Venta con opcionales NULL: sin movimiento, sin kg al gancho ni rendimiento, sin persona',
  $q$ select (select count(*) from public.movimientos_economicos where actividad_id = a.id) || '|'
          || coalesce(cv.kg_gancho::text, 'sin gancho') || '|' || coalesce(v.rendimiento_pct::text, 'sin rendimiento') || '|'
          || coalesce(v.peso_promedio_kg::text, 'sin peso') || '|' || coalesce(a.persona_id::text, 'sin persona')
      from public.actividades a join public.act_compraventa cv on cv.actividad_id = a.id join public.v_actividades v on v.id = a.id
      where a.id = pruebas.id('v2') $q$, '0|sin gancho|sin rendimiento|sin peso|sin persona');
select pruebas.espera_valor('V06 La venta que deja el lote en cero lo cierra con la fecha de la venta',
  $q$ select estado || '|' || (fecha_cierre = pruebas.d(3))::text from public.lotes where id = pruebas.id('LS') $q$, 'cerrado|true');
select pruebas.espera_valor('V07 Registro de cierre con motivo "Vendido"',
  $q$ select tipo || '|' || motivo from public.lote_cambios_estado where lote_id = pruebas.id('LS') $q$, 'cierre|Vendido');
select pruebas.espera_error('V08 Venta en un lote cerrado',
  $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LS'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('toros', 1)), p_modalidad => 'remate') $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Operador: mortandad
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('m1', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(3),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 2)), p_causa => null, p_observaciones => 'En el bañado',
      p_persona_id => null, p_notas => null) $q$);
select pruebas.espera_valor('M01 Mortandad con causa NULL: LV baja a 8 terneros y la causa queda "Desconocida"',
  $q$ select pruebas.stock('LV', 'terneros') || '|' || causa || '|' || observaciones from public.act_mortandad where actividad_id = pruebas.id('m1') $q$,
  '8|Desconocida|En el bañado');
-- m2: causa en blanco, en un lote propio (LMB) para no tocar los saldos de LV
select pruebas.guardar('LMB', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LMB Terneros', pruebas.d(10), pruebas.comp('terneros', 2)) $q$);
select pruebas.guardar('m2', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LMB'), p_fecha => pruebas.d(1),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1)), p_causa => '  ') $q$);
select pruebas.espera_valor('M01b Mortandad con causa en blanco ("  "): se guarda "Desconocida" y LMB baja a 1 ternero',
  $q$ select causa || '|' || pruebas.stock('LMB', 'terneros') from public.act_mortandad where actividad_id = pruebas.id('m2') $q$, 'Desconocida|1');
select pruebas.espera_error('M02 Causa que no está en parametros',
  $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1)), p_causa => 'Rayo') $q$, '22023');
select pruebas.espera_error('M03 Mortandad con peso (no lleva)',
  $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1, 150))) $q$, '22023');
select pruebas.espera_error('M04 Mortandad de más cabezas que el stock (9 terneros, hay 8)',
  $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 9)), p_causa => 'Enfermedad') $q$, '23514');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Operador: parición
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('LM',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LM Vacas', pruebas.d(30), pruebas.comp('vacas_cria', 30)) $q$);
select pruebas.guardar('LCE', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LCE Terneros', pruebas.d(30), pruebas.comp('terneros', 1)) $q$);
select pruebas.guardar('LO',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('ovinos'), 'LO Ovejas', pruebas.d(30), pruebas.comp('ovejas_cria', 10)) $q$);

-- pa1: crías a un lote de cría nuevo, d-7, con 2 nacidos muertos
select pruebas.guardar('pa1', $q$ select public.registrar_paricion(
      p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => pruebas.d(7),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 12), pruebas.lin('terneras', 10)), p_nacidos_muertos => 2,
      p_lote_cria_nuevo => jsonb_build_object('nombre', 'Terneros Nacidos 2026')) $q$);
select pruebas.guardar('LN', $q$ select lote_cria_id from public.act_paricion where actividad_id = pruebas.id('pa1') $q$);
select pruebas.espera_valor('PA01 Lote de cría nuevo: 12 terneros y 10 terneras; las madres siguen en 30',
  $q$ select pruebas.stock('LN', 'terneros') || '|' || pruebas.stock('LN', 'terneras') || '|' || pruebas.stock('LM', 'vacas_cria') $q$, '12|10|30');
select pruebas.espera_valor('PA02 Lote de cría: vacuno, abre en la fecha de la parición',
  $q$ select (especie_id = pruebas.id('vacunos') and fecha_apertura = pruebas.d(7))::text from public.lotes where id = pruebas.id('LN') $q$, 'true');
select pruebas.espera_valor('PA03 Actividad: lote_id = madres, lote creado = cría, 2 nacidos muertos (fuera del stock)',
  $q$ select (a.lote_id = pruebas.id('LM'))::text || '|' || (a.lote_creado_id = pruebas.id('LN'))::text || '|' || p.nacidos_muertos
      from public.actividades a join public.act_paricion p on p.actividad_id = a.id where a.id = pruebas.id('pa1') $q$, 'true|true|2');

-- pa2: crías a un lote de cría existente
select pruebas.guardar('pa2', $q$ select public.registrar_paricion(
      p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => pruebas.d(4),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 3)), p_lote_cria_id => pruebas.id('LCE'),
      p_nacidos_muertos => null, p_lote_cria_nuevo => null, p_persona_id => null, p_notas => null) $q$);
select pruebas.espera_valor('PA04 Lote de cría existente: LCE pasa de 1 a 4 terneros; nacidos muertos NULL queda en 0; sin persona',
  $q$ select pruebas.stock('LCE', 'terneros') || '|' || p.nacidos_muertos || '|' || coalesce(a.persona_id::text, 'sin persona')
      from public.act_paricion p join public.actividades a on a.id = p.actividad_id where p.actividad_id = pruebas.id('pa2') $q$, '4|0|sin persona');
select pruebas.espera_error('PA04b Parición sin lote de madres (NULL)',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => null, p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1)), p_lote_cria_id => pruebas.id('LCE')) $q$, '22023');
select pruebas.espera_error('PA05 Lote de cría de otra especie (ovino para crías vacunas)',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1)), p_lote_cria_id => pruebas.id('LO')) $q$, '22023');
select pruebas.espera_error('PA06 Lote de cría cerrado',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1)), p_lote_cria_id => pruebas.id('LS')) $q$, '22023');
select pruebas.espera_error('PA07 Crías de otra especie (corderos de vacas)',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('corderos', 1)), p_lote_cria_id => pruebas.id('LCE')) $q$, '22023');
select pruebas.espera_error('PA08 Nacidos muertos negativos',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1)), p_nacidos_muertos => -1, p_lote_cria_id => pruebas.id('LCE')) $q$, '22023');
select pruebas.espera_error('PA09 Parición con una categoría que no es de cría al pie (vacas): desde 20261022000100 se rechaza (el lote de cría igual al de las madres ya se acepta: ver cria_al_pie.sql)',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('vacas_cria', 1)), p_lote_cria_id => pruebas.id('LCE')) $q$, '22023');
select pruebas.espera_error('PA10 Sin lote de cría (ni existente ni nuevo)',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1))) $q$, '22023');
select pruebas.espera_error('PA11 Fecha anterior a la apertura del lote de cría (LN abrió el d-7)',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => pruebas.d(10),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1)), p_lote_cria_id => pruebas.id('LN')) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 6 bis. Líneas mal formadas en las 5 funciones registrar_* (25 pruebas, todas 22023)
-- ════════════════════════════════════════════════════════════════════════════
-- Casos: elemento sin categoria_id, cabezas NULL (JSON null), cabezas decimales (1,5),
-- p_lineas vacío ([]) y p_lineas NULL. El resto de cada llamada es válido.

do $$
declare
  f record;
  c record;
  n int := 0;
begin
  for f in select * from (values
    ('registrar_pesada',    'novillos', 300::numeric,
     $f$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(), p_lineas => %s) $f$),
    ('registrar_mortandad', 'terneros', null,
     $f$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(), p_lineas => %s) $f$),
    ('registrar_compra',    'novillos', null,
     $f$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
         p_lineas => %s, p_modalidad => 'productor', p_lote_id => pruebas.id('LV')) $f$),
    ('registrar_venta',     'novillos', null,
     $f$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
         p_lineas => %s, p_modalidad => 'productor') $f$),
    ('registrar_paricion',  'terneros', null,
     $f$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => public.fecha_hoy(),
         p_lineas => %s, p_lote_cria_id => pruebas.id('LCE')) $f$)
  ) as t(funcion, cat, peso, plantilla) loop
    for c in select * from (values
      ('sin_categoria', 'elemento sin categoria_id'),
      ('cabezas_null',  'cabezas NULL'),
      ('decimales',     'cabezas decimales (1,5)'),
      ('vacio',         'p_lineas vacío'),
      ('null',          'p_lineas NULL')
    ) as t(caso, texto) loop
      n := n + 1;
      perform pruebas.espera_error(
        format('MF%s %s: %s', lpad(n::text, 2, '0'), f.funcion, c.texto),
        format(f.plantilla, format('pruebas.mal(%L, %L, %s)', c.caso, f.cat, coalesce(f.peso::text, 'null'))),
        '22023');
    end loop;
  end loop;
end $$;

select pruebas.espera_error('MF26 registrar_venta: la misma categoría en dos líneas',
  $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1), pruebas.lin('novillos', 2)), p_modalidad => 'productor') $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Operador: anular
-- ════════════════════════════════════════════════════════════════════════════

-- Pesada: solo se marca (no tiene eventos)
select pruebas.espera_ok('A01 Anular una pesada',
  $q$ select public.anular_actividad(pruebas.id('pe1'), 'Pesada repetida') $q$);
select pruebas.espera_valor('A02 Quedan los tres datos de la anulación y ningún evento',
  $q$ select (anulada_en is not null)::text || '|' || motivo_anulacion || '|' || (anulada_por = pruebas.id('u_operador'))::text || '|'
          || (select count(*) from public.lote_eventos where actividad_id = pruebas.id('pe1'))
      from public.actividades where id = pruebas.id('pe1') $q$, 'true|Pesada repetida|true|0');
select pruebas.espera_error('A03 Anular dos veces',
  $q$ select public.anular_actividad(pruebas.id('pe1'), 'Otra vez') $q$, '22023');
select pruebas.espera_error('A04 Anular sin motivo',
  $q$ select public.anular_actividad(pruebas.id('m1'), '   ') $q$, '22023');
select pruebas.espera_error('A05 Anular una actividad inexistente',
  $q$ select public.anular_actividad(gen_random_uuid(), 'x') $q$, '42501');

-- Mortandad
select pruebas.espera_ok('A06 Anular la mortandad',
  $q$ select public.anular_actividad(pruebas.id('m1'), 'Aparecieron') $q$);
select pruebas.espera_valor('A07 LV vuelve a 10 terneros; evento inverso con la fecha original (d-3), mismo tipo',
  $q$ select pruebas.stock('LV', 'terneros') || '|' || count(*) || '|' || sum(cabezas) || '|' || bool_and(fecha = pruebas.d(3) and tipo = 'mortandad')
      from public.lote_eventos where actividad_id = pruebas.id('m1') $q$, '10|2|0|true');

-- Compra a lote existente, con movimiento en pesos
select pruebas.espera_ok('A08 Anular la compra de 5 novillos (c2)',
  $q$ select public.anular_actividad(pruebas.id('c2'), 'Se cargó dos veces') $q$);
select pruebas.espera_valor('A09 LV baja a 15 novillos y el movimiento queda anulado (sin monto en la vista)',
  $q$ select pruebas.stock('LV', 'novillos') || '|' || (me.anulado_en is not null)::text || '|' || me.motivo_anulacion || '|'
          || coalesce((select monto_usd::text from public.v_actividades where id = pruebas.id('c2')), 'sin monto')
      from public.movimientos_economicos me where me.actividad_id = pruebas.id('c2') $q$,
  '15|true|Actividad anulada: Se cargó dos veces|sin monto');

-- Compra cuyos animales ya se vendieron: no se puede anular hasta anular la venta
select pruebas.guardar('v3', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LC'), p_fecha => pruebas.d(1),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 15)), p_modalidad => 'productor') $q$);
select pruebas.espera_valor('A10 (preparación) La venta de los 15 terneros cerró LC',
  $q$ select estado from public.lotes where id = pruebas.id('LC') $q$, 'cerrado');
select pruebas.espera_error('A11 Anular la compra c1 cuando sus animales ya se vendieron (el stock quedaría negativo)',
  $q$ select public.anular_actividad(pruebas.id('c1'), 'Error') $q$, '23514');
select pruebas.espera_ok('A12 Anular la venta v3',
  $q$ select public.anular_actividad(pruebas.id('v3'), 'Venta cargada en el lote equivocado') $q$);
select pruebas.espera_valor('A13 LC se reabre con 15 terneros y queda el registro de reapertura',
  $q$ select l.estado || '|' || coalesce(l.fecha_cierre::text, 'sin cierre') || '|' || pruebas.stock('LC', 'terneros') || '|'
          || (select motivo from public.lote_cambios_estado where lote_id = l.id and tipo = 'reapertura')
      from public.lotes l where l.id = pruebas.id('LC') $q$,
  'activo|sin cierre|15|Anulación de venta: Venta cargada en el lote equivocado');
select pruebas.espera_ok('A14 Ahora sí: anular la compra c1, que creó LC',
  $q$ select public.anular_actividad(pruebas.id('c1'), 'Compra que no se hizo') $q$);
select pruebas.espera_valor('A15 LC queda en cero y se cierra solo; el movimiento de USD 9000 queda anulado',
  $q$ select l.estado || '|' || pruebas.stock('LC', 'terneros') || '|'
          || (select string_agg(motivo, ' / ' order by motivo) from public.lote_cambios_estado where lote_id = l.id and tipo = 'cierre') || '|'
          || (select (anulado_en is not null)::text from public.movimientos_economicos where actividad_id = pruebas.id('c1'))
      from public.lotes l where l.id = pruebas.id('LC') $q$,
  'cerrado|0|Anulación de compra: Compra que no se hizo / Vendido|true');

-- Parición que creó su propio lote de cría
select pruebas.espera_ok('A16 Anular la parición pa1',
  $q$ select public.anular_actividad(pruebas.id('pa1'), 'Era de otro rodeo') $q$);
select pruebas.espera_valor('A17 El lote de cría queda en cero y cerrado con la fecha de la parición (d-7); las madres siguen en 30',
  $q$ select l.estado || '|' || (l.fecha_cierre = pruebas.d(7))::text || '|' || pruebas.stock('LN', 'terneros') || '|' || pruebas.stock('LM', 'vacas_cria')
      from public.lotes l where l.id = pruebas.id('LN') $q$, 'cerrado|true|0|30');
select pruebas.espera_valor('A18 Eventos inversos de la parición: 4 en total, suma 0, todos con fecha d-7 y tipo paricion',
  $q$ select count(*) || '|' || sum(cabezas) || '|' || bool_and(fecha = pruebas.d(7) and tipo = 'paricion')
      from public.lote_eventos where actividad_id = pruebas.id('pa1') $q$, '4|0|true');

-- Parición a un lote de cría existente: vuelve al stock anterior y sigue activo
select pruebas.espera_ok('A19 Anular la parición pa2',
  $q$ select public.anular_actividad(pruebas.id('pa2'), 'Mal cargada') $q$);
select pruebas.espera_valor('A20 LCE vuelve a 1 ternero y sigue activo (no lo creó la parición)',
  $q$ select pruebas.stock('LCE', 'terneros') || '|' || estado from public.lotes where id = pruebas.id('LCE') $q$, '1|activo');

-- Venta que había cerrado el lote
select pruebas.espera_ok('A21 Anular la venta v2, que había cerrado LS',
  $q$ select public.anular_actividad(pruebas.id('v2'), 'No se concretó') $q$);
select pruebas.espera_valor('A22 LS reabierto con sus 3 toros',
  $q$ select estado || '|' || pruebas.stock('LS', 'toros') from public.lotes where id = pruebas.id('LS') $q$, 'activo|3');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Consulta: lee todo, no escribe nada
-- ════════════════════════════════════════════════════════════════════════════
-- Actividades de Santa Remigia: c1, c2, c3, pe1, pe2, v1, v2, v3, m1, m2, pa1, pa2 = 12. Movimientos: c1, c2, v1 = 3.

select pruebas.como('u_consulta');

select pruebas.espera_valor('Q01 Consulta lee actividades, la vista, las líneas y los movimientos (desde 20261027000100 ve la plata, en modo lectura)',
  $q$ select (select count(*) from public.actividades where establecimiento_id = pruebas.id('est_a')) || '|'
          || (select count(*) from public.v_actividades where establecimiento_id = pruebas.id('est_a')) || '|'
          || (select count(*) from public.actividad_lineas where actividad_id = pruebas.id('pe1')) || '|'
          || (select count(*) from public.movimientos_economicos where establecimiento_id = pruebas.id('est_a')) $q$, '12|12|2|3');
select pruebas.espera_error('Q02 Consulta: registrar_pesada',
  $q$ select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1, 300))) $q$, '42501');
select pruebas.espera_error('Q03 Consulta: registrar_mortandad',
  $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1))) $q$, '42501');
select pruebas.espera_error('Q04 Consulta: registrar_compra',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV')) $q$, '42501');
select pruebas.espera_error('Q05 Consulta: registrar_venta',
  $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor') $q$, '42501');
select pruebas.espera_error('Q06 Consulta: registrar_paricion',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LM'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros', 1)), p_lote_cria_id => pruebas.id('LCE')) $q$, '42501');
select pruebas.espera_error('Q07 Consulta: anular_actividad',
  $q$ select public.anular_actividad(pruebas.id('v1'), 'x') $q$, '42501');
select pruebas.espera_error('Q08 Consulta reusa el p_id de una venta del operador',
  $q$ select public.registrar_venta(p_id => pruebas.id('v1'), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(2),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 5, 2400)), p_modalidad => 'frigorifico') $q$, '42501');
select pruebas.espera_error('Q09 Consulta: insertar una actividad directo en la tabla',
  $q$ insert into public.actividades (establecimiento_id, tipo, fecha) values (pruebas.id('est_a'), 'pesada', public.fecha_hoy()) $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 9. X, de otro establecimiento: no ve ni toca nada de Santa Remigia
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_ajeno');

select pruebas.guardar('LX', $q$ select public.crear_lote(pruebas.id('est_x'), pruebas.id('vacunos_x'), 'LX', pruebas.d(10), pruebas.comp('terneros_x', 5)) $q$);

select pruebas.espera_valor('X01 X ve 0 actividades, líneas, detalles y movimientos de Santa Remigia',
  $q$ select ((select count(*) from public.actividades where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.v_actividades where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.actividad_lineas where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.act_compraventa where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.act_mortandad where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.act_paricion where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.movimientos_economicos where establecimiento_id = pruebas.id('est_a')))::text $q$, '0');
select pruebas.espera_error('X02 X vende de un lote ajeno',
  $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor') $q$, '42501');
select pruebas.espera_error('X03 X anula una actividad ajena',
  $q$ select public.anular_actividad(pruebas.id('v1'), 'x') $q$, '42501');
select pruebas.espera_error('X04 X reusa un p_id de Santa Remigia en su propio campo',
  $q$ select public.registrar_venta(p_id => pruebas.id('v1'), p_lote_id => pruebas.id('LX'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros_x', 1)), p_modalidad => 'productor') $q$, '42501');
select pruebas.espera_error('X05 X compra en su campo pero hacia un lote ajeno',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_x'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros_x', 1)), p_modalidad => 'productor', p_lote_id => pruebas.id('LV')) $q$, '42501');
select pruebas.espera_error('X06 X compra a nombre de Santa Remigia',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('novillos', 1)), p_modalidad => 'productor',
      p_lote_nuevo => jsonb_build_object('nombre', 'X', 'especie_id', pruebas.id('vacunos'))) $q$, '42501');
select pruebas.espera_error('X07 X registra una parición con un lote de cría ajeno',
  $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LX'), p_fecha => public.fecha_hoy(),
      p_lineas => jsonb_build_array(pruebas.lin('terneros_x', 1)), p_lote_cria_id => pruebas.id('LCE')) $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Sin sesión (anon): ninguna función ni tabla nueva
-- ════════════════════════════════════════════════════════════════════════════

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pruebas.espera_error('N01 anon: registrar_pesada',    $q$ select public.registrar_pesada(gen_random_uuid(), pruebas.id('LV'), public.fecha_hoy(), '[]'::jsonb) $q$, '42501');
select pruebas.espera_error('N02 anon: registrar_mortandad', $q$ select public.registrar_mortandad(gen_random_uuid(), pruebas.id('LV'), public.fecha_hoy(), '[]'::jsonb) $q$, '42501');
select pruebas.espera_error('N03 anon: registrar_compra',    $q$ select public.registrar_compra(gen_random_uuid(), pruebas.id('est_a'), public.fecha_hoy(), '[]'::jsonb, 'otra') $q$, '42501');
select pruebas.espera_error('N04 anon: registrar_venta',     $q$ select public.registrar_venta(gen_random_uuid(), pruebas.id('LV'), public.fecha_hoy(), '[]'::jsonb, 'otra') $q$, '42501');
select pruebas.espera_error('N05 anon: registrar_paricion',  $q$ select public.registrar_paricion(gen_random_uuid(), pruebas.id('LM'), public.fecha_hoy(), '[]'::jsonb) $q$, '42501');
select pruebas.espera_error('N06 anon: anular_actividad',    $q$ select public.anular_actividad(pruebas.id('v1'), 'x') $q$, '42501');
select pruebas.espera_error('N07 anon: leer actividades',    $q$ select count(*) from public.actividades $q$, '42501');
select pruebas.espera_error('N08 anon: leer la vista',       $q$ select count(*) from public.v_actividades $q$, '42501');
select pruebas.espera_error('N09 anon: leer movimientos',    $q$ select count(*) from public.movimientos_economicos $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Base (postgres): restricciones que valen para todos
-- ════════════════════════════════════════════════════════════════════════════

reset role;

select pruebas.espera_error('B01 Editar la fecha de una actividad, aun como postgres',
  $q$ update public.actividades set fecha = fecha - 1 where id = pruebas.id('v1') $q$, '42501');
select pruebas.espera_error('B02 Des-anular una actividad anulada',
  $q$ update public.actividades set anulada_en = null, anulada_por = null, motivo_anulacion = null where id = pruebas.id('c2') $q$, '42501');
select pruebas.espera_error('B03 Borrar una actividad',
  $q$ delete from public.actividades where id = pruebas.id('v1') $q$, '42501');
select pruebas.espera_error('B04 Anulación incompleta (sin motivo ni autor): check de todo o nada',
  $q$ update public.actividades set anulada_en = now() where id = pruebas.id('v1') $q$, '23514');
select pruebas.espera_error('B05 Modificar una línea de actividad (inmutable)',
  $q$ update public.actividad_lineas set cabezas = 1 where actividad_id = pruebas.id('v1') $q$, '42501');
select pruebas.espera_error('B06 Modificar el detalle de una venta (inmutable)',
  $q$ update public.act_compraventa set kg_gancho = 1 where actividad_id = pruebas.id('v1') $q$, '42501');
select pruebas.espera_error('B07 Borrar un movimiento económico',
  $q$ delete from public.movimientos_economicos where actividad_id = pruebas.id('v1') $q$, '42501');
select pruebas.espera_error('B08 Evento de compra sin actividad (regla de lote_eventos)',
  $q$ insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo)
      values (pruebas.id('est_a'), pruebas.id('LV'), pruebas.id('vacunos'), pruebas.id('novillos'), 1, public.fecha_hoy(), 'compra') $q$, '23514');
select pruebas.espera_error('B09 Movimiento en pesos sin tipo de cambio',
  $q$ insert into public.movimientos_economicos (establecimiento_id, fecha, sentido, rubro_id, concepto, monto_original, moneda_original, estado)
      values (pruebas.id('est_a'), public.fecha_hoy(), 'egreso',
              (select id from public.rubros where establecimiento_id = pruebas.id('est_a') and nombre = 'General'), 'x', 100, 'UYU', 'pagado') $q$, '23514');
select pruebas.espera_error('B10 Movimiento en dólares con tipo de cambio',
  $q$ insert into public.movimientos_economicos (establecimiento_id, fecha, sentido, rubro_id, concepto, monto_original, moneda_original, tipo_cambio, estado)
      values (pruebas.id('est_a'), public.fecha_hoy(), 'egreso',
              (select id from public.rubros where establecimiento_id = pruebas.id('est_a') and nombre = 'General'), 'x', 100, 'USD', 40, 'pagado') $q$, '23514');
select pruebas.espera_error('B11 Movimiento con un rubro de otro establecimiento (FK compuesta)',
  $q$ insert into public.movimientos_economicos (establecimiento_id, fecha, sentido, rubro_id, concepto, monto_original, moneda_original, estado)
      values (pruebas.id('est_a'), public.fecha_hoy(), 'egreso',
              (select id from public.rubros where establecimiento_id = pruebas.id('est_x') and nombre = 'General'), 'x', 100, 'USD', 'pagado') $q$, '23503');
select pruebas.espera_valor('B12 Causas de mortandad en parametros (8, en orden)',
  $q$ select string_agg(valor, ', ' order by orden) from public.parametros where clave = 'causas_mortandad' $q$,
  'Enfermedad, Accidente, Parto, Depredación, Clima o temporal, Abigeato o extravío, Desconocida, Otra');
select pruebas.espera_valor('B13 Funciones nuevas: ninguna para anon; internas y de trigger sin authenticated',
  $q$ select (count(*) = 12 and bool_and(
        not has_function_privilege('anon', p.oid, 'execute')
        and has_function_privilege('authenticated', p.oid, 'execute') = (p.proname not like '\_%' and p.proname <> 'proteger_actividad')))::text
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('registrar_pesada', 'registrar_mortandad', 'registrar_compra', 'registrar_venta', 'registrar_paricion',
                          'anular_actividad', '_actividad_ya_registrada', '_exigir_persona', '_stock_categoria_al',
                          '_insertar_lineas', '_registrar_movimiento', 'proteger_actividad') $q$, 'true');
select pruebas.espera_valor('B14 Tablas y vista nuevas: authenticated solo lee; anon nada',
  $q$ select bool_and(has_table_privilege('authenticated', t, 'select')
                      and not has_table_privilege('authenticated', t, 'insert')
                      and not has_table_privilege('authenticated', t, 'update')
                      and not has_table_privilege('authenticated', t, 'delete')
                      and not has_table_privilege('anon', t, 'select'))::text
      from unnest(array['public.actividades', 'public.actividad_lineas', 'public.act_compraventa', 'public.act_mortandad',
                        'public.act_paricion', 'public.movimientos_economicos', 'public.v_actividades']) t $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 12. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS ETAPA 6A: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
