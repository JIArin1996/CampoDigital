-- Campo Digital v2 — Pruebas de la etapa 8a del tablero de Indicadores: medidas de fábrica (tablero_combinada con
-- 'fab:...' y guardar_tablero)
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261114000100_tablero_fabrica_8a).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS FABRICA 8A: N OK, ...", que deshace todo.
--      El resultado esperado es "13 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Datos: los de tablero_combinadas_7a.sql (resultado 1.000, gastos operativos 8.000, UG promedio 213,07, precio de
-- venta 2,57 USD/kg, Ha SPG = área efectiva de P1 + P2). La producción de carne y la carne equivalente se comparan
-- contra lo que devuelve tablero_produccion (si dan 0 o no tienen dato, la medida de fábrica queda sin valor).

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



-- Fecha fija (las temporadas no dependen del día en que se corre la prueba)
create function pruebas.f(p text) returns date language sql immutable as $$ select p::date $$;
create function pruebas.lin(p_cat text, p_cabezas int) returns jsonb language sql stable as $$
  select jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas)
$$;
-- Fila de indicadores de los vacunos de Santa Remigia para una temporada (null = sin servicio registrado)
create function pruebas.ind(p_temporada int) returns public.v_indicadores_reproductivos language sql stable as $$
  select * from public.v_indicadores_reproductivos
  where establecimiento_id = pruebas.id('est_a') and especie_id = pruebas.id('vacunos') and temporada is not distinct from p_temporada
$$;
-- Elimina una actividad como administrador (desde 20261104000100 solo él elimina) y vuelve al
-- usuario que estaba. Si falla, el error deshace también el cambio de usuario.
create function pruebas.eliminar(p_actividad uuid) returns void language plpgsql as $$
declare
  v_antes text := current_setting('request.jwt.claims', true);
begin
  perform pruebas.como('u_admin');
  perform public.eliminar_actividad(p_actividad);
  perform set_config('request.jwt.claims', v_antes, true);
end $$;


-- Precio con titulares: {"monto", "moneda", "tipo_cambio", "estado", "titulares"}
create function pruebas.precio(p_monto numeric, p_moneda text, p_tc numeric, p_estado text, p_titulares jsonb) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('monto', p_monto, 'moneda', p_moneda, 'tipo_cambio', p_tc, 'estado', p_estado,
                                              'titulares', p_titulares))
$$;
create function pruebas.tit(p_clave text, p_monto numeric) returns jsonb language sql stable as $$
  select jsonb_build_object('titular_id', pruebas.id(p_clave), 'monto', p_monto)
$$;
-- Lectura de una función del tablero en el ejercicio 2025/26: "periodo:etiqueta:valor" separados por "|"
create function pruebas.teco(p_medida text, p_abrir text, p_tiempo text, p_filtros jsonb default '{}', p_sin_ceros boolean default false) returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text), '|' order by r.n)
  from public.tablero_economia(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, '2025-07-01', '2026-06-30', p_filtros)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
  where not (p_sin_ceros and coalesce(r.valor, 0) = 0)
$$;
create function pruebas.tpot(p_medida text, p_abrir text, p_tiempo text, p_filtros jsonb default '{}') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, coalesce(trim_scale(r.valor)::text, 'sin dato')), '|' order by r.n)
  from public.tablero_potreros(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, '2025-07-01', '2026-06-30', p_filtros)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
create function pruebas.cuadro(x1 numeric, x2 numeric, y1 numeric, y2 numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'Polygon', 'coordinates',
    jsonb_build_array(jsonb_build_array(jsonb_build_array(x1, y1), jsonb_build_array(x2, y1), jsonb_build_array(x2, y2),
                                        jsonb_build_array(x1, y2), jsonb_build_array(x1, y1))))
$$;
create function pruebas.sup(p_clave text) returns numeric language sql stable as $$
  select superficie from public.potreros where id = pruebas.id(p_clave)
$$;
create function pruebas.efe(p_clave text) returns numeric language sql stable as $$
  select superficie_efectiva from public.potreros where id = pruebas.id(p_clave)
$$;

grant execute on all functions in schema pruebas to authenticated, anon;


-- Precio con pagador y fecha de pago
create function pruebas.pago(p_precio jsonb, p_fecha text) returns jsonb language sql stable as $$
  select p_precio || jsonb_build_object('pagador_id', pruebas.id('cuenta_a'), 'fecha_pago', p_fecha)
$$;
-- Economía con numerador y denominador: "periodo:etiqueta:valor:numerador:denominador"
create function pruebas.tecon(p_medida text, p_abrir text, p_tiempo text, p_desde date default '2025-07-01', p_hasta date default '2026-06-30') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_economia(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, p_desde, p_hasta)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
-- Una fila de potreros (la del potrero, o la global con p_potrero null)
create function pruebas.fpot(p_medida text, p_potrero text, p_hasta date default '2026-06-30', p_desde date default '2025-07-01')
returns table (valor numeric, numerador numeric, denominador numeric, avisos jsonb) language sql stable as $$
  select r.valor, r.numerador, r.denominador, r.avisos
  from public.tablero_potreros(pruebas.id('est_a'), p_medida, case when p_potrero is not null then 'potrero' end, 'total',
                               p_desde, p_hasta) r
  where p_potrero is null or r.clave = pruebas.id(p_potrero)::text
$$;
-- Medidas propias
create function pruebas.defm(p_a jsonb, p_op text, p_b jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('a', p_a, 'op', p_op, 'b', p_b)
$$;
create function pruebas.fm(p_fuente text, p_medida text) returns jsonb language sql immutable as $$
  select jsonb_build_object('fuente', p_fuente, 'medida', p_medida)
$$;
create function pruebas.pr(p_clave text) returns jsonb language sql stable as $$
  select jsonb_build_object('propia', pruebas.id(p_clave))
$$;
create function pruebas.cte(p numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('constante', p)
$$;
-- Filas de una medida propia (ejercicio 2025/26)
create function pruebas.fcomb(p_clave text, p_abrir text default null, p_tiempo text default 'total')
returns table (periodo text, etiqueta text, valor numeric, numerador numeric, denominador numeric, avisos jsonb, n bigint)
language sql stable as $$
  select r.periodo, r.etiqueta, r.valor, r.numerador, r.denominador, r.avisos, r.n
  from public.tablero_combinada(pruebas.id('est_a'), pruebas.id(p_clave)::text, p_abrir, p_tiempo, '2025-07-01', '2026-06-30')
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
-- "etiqueta:valor" (valor con 2 decimales; "-" si no tiene) separados por "|", en el orden de la función
create function pruebas.tcomb(p_clave text, p_abrir text default null, p_tiempo text default 'total') returns text
language sql stable as $$
  select string_agg(concat_ws(':', f.periodo, f.etiqueta, coalesce(trim_scale(round(f.valor, 2))::text, '-')), '|' order by f.n)
  from pruebas.fcomb(p_clave, p_abrir, p_tiempo) f
$$;
-- Ha SPG de los datos
create function pruebas.haspg() returns numeric language sql stable as $$
  select pruebas.efe('P1') + pruebas.efe('P2')
$$;
-- Una medida de fábrica (ejercicio 2025/26)
create function pruebas.ffab(p_medida text, p_abrir text default null)
returns table (etiqueta text, valor numeric, numerador numeric, denominador numeric, avisos jsonb, n bigint)
language sql stable as $$
  select r.etiqueta, r.valor, r.numerador, r.denominador, r.avisos, r.n
  from public.tablero_combinada(pruebas.id('est_a'), p_medida, p_abrir, 'total', '2025-07-01', '2026-06-30')
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
-- El valor total de una medida de una fuente (ejercicio 2025/26)
create function pruebas.vfuente(p_fuente text, p_medida text) returns numeric language plpgsql stable as $$
declare
  v numeric;
begin
  execute format('select r.valor from public.%I($1, $2, null, ''total'', ''2025-07-01'', ''2026-06-30'') r', 'tablero_' || p_fuente)
    into v using pruebas.id('est_a'), p_medida;
  return v;
end $$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Datos
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');
select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('vacunos',    $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('sin_sexar',  $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros/as' $q$);
select pruebas.guardar('terneros',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros' $q$);
select pruebas.guardar('terneras',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneras' $q$);
select pruebas.guardar('vacas_cria', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Vacas de cría' $q$);
select pruebas.guardar('novillos',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('t_a', $q$ insert into public.titulares (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Titular A') returning id $q$);
select pruebas.guardar('t_b', $q$ insert into public.titulares (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Titular B') returning id $q$);
select pruebas.guardar('r_general',  $q$ select id from public.rubros where establecimiento_id = pruebas.id('est_a') and nombre = 'General' $q$);
select pruebas.guardar('c_sanidad',  $q$ select id from public.conceptos where establecimiento_id = pruebas.id('est_a') and nombre = 'Sanidad' $q$);
select pruebas.guardar('c_sueldos',  $q$ select id from public.conceptos where establecimiento_id = pruebas.id('est_a') and nombre = 'Sueldos y cargas sociales' $q$);

select pruebas.como('u_operador');
select pruebas.guardar('cuenta_a', $q$ insert into public.pagadores (establecimiento_id, nombre, titular_id)
      values (pruebas.id('est_a'), 'Cuenta A', pruebas.id('t_a')) returning id $q$);
select pruebas.guardar('P1', $q$ insert into public.potreros (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Potrero 1') returning id $q$);
select pruebas.guardar('P2', $q$ insert into public.potreros (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Potrero 2') returning id $q$);
select pruebas.guardar('P3', $q$ insert into public.potreros (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Potrero 3') returning id $q$);
select pruebas.preparar('forma_P1', $q$ select public.guardar_forma_potrero(pruebas.id('P1'), pruebas.cuadro(-56.50, -56.49, -33.00, -32.99)) $q$);
select pruebas.preparar('forma_P2', $q$ select public.guardar_forma_potrero(pruebas.id('P2'), pruebas.cuadro(-56.49, -56.48, -33.00, -32.99)) $q$);
select pruebas.guardar('LC',  $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'), p_nombre => 'L-Cría',
      p_fecha_apertura => pruebas.f('2025-06-30'), p_composicion => pruebas.comp('vacas_cria', 100), p_potrero_id => pruebas.id('P2')) $q$);
select pruebas.guardar('LN1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Nov1', pruebas.f('2025-06-30'), pruebas.comp('novillos', 100)) $q$);
select pruebas.guardar('LN2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Nov2', pruebas.f('2025-06-30'), pruebas.comp('novillos', 50)) $q$);
select pruebas.preparar('venta', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LN1'), p_fecha => pruebas.f('2025-10-01'),
      p_lineas => jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id('novillos'), 'cabezas', 30, 'peso_vivo_total_kg', 10500)), p_modalidad => 'remate',
      p_precio => pruebas.pago(pruebas.precio(27000, 'USD', null, 'pagado', jsonb_build_array(pruebas.tit('t_a', 16200), pruebas.tit('t_b', 10800))), '2025-10-01')) $q$);
select pruebas.preparar('compra', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.f('2025-10-15'), p_lineas => pruebas.comp('novillos', 20), p_modalidad => 'productor', p_lote_id => pruebas.id('LN2'),
      p_precio => pruebas.pago(pruebas.precio(720000, 'UYU', 40, 'pagado', jsonb_build_array(pruebas.tit('t_a', 720000))), '2025-10-15')) $q$);
select pruebas.preparar('sanidad', $q$ select public.registrar_movimiento(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.f('2025-11-01'), p_sentido => 'egreso', p_rubro_id => pruebas.id('r_general'), p_concepto_id => pruebas.id('c_sanidad'),
      p_precio => pruebas.pago(pruebas.precio(2000, 'USD', null, 'pagado', null), '2025-11-01'), p_titulares => jsonb_build_array(pruebas.tit('t_a', 2000))) $q$);
select pruebas.preparar('sueldos', $q$ select public.registrar_movimiento(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.f('2025-12-01'), p_sentido => 'egreso', p_rubro_id => pruebas.id('r_general'), p_concepto_id => pruebas.id('c_sueldos'),
      p_precio => pruebas.precio(6000, 'USD', null, 'pendiente', null),
      p_titulares => jsonb_build_array(pruebas.tit('t_a', 4000), pruebas.tit('t_b', 2000))) $q$);
select pruebas.guardar('op_union', $q$ select public.unir_lotes(array[pruebas.id('LN1'), pruebas.id('LN2')], pruebas.f('2026-02-01'), null,
      jsonb_build_object('nombre', 'L-Nov3')) $q$);
select pruebas.guardar('LN3', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_union') and v.rol = 'destino' $q$);
select pruebas.preparar('LN3_P1', $q$ select public.cambiar_potrero_lote(pruebas.id('LN3'), pruebas.id('P1'), null, pruebas.f('2026-02-01')) $q$);
select pruebas.preparar('muerte', $q$ select public.registrar_mortandad(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LN3'), p_fecha => pruebas.f('2026-04-15'),
      p_lineas => pruebas.comp('novillos', 2), p_causa => 'Enfermedad') $q$);
-- L-Vieja: 10 novillos en P3 desde el 1/7/2024; se venden todos el 1/12/2024 (el lote se cierra y sale de P3)
select pruebas.guardar('LV', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'), p_nombre => 'L-Vieja',
      p_fecha_apertura => pruebas.f('2024-07-01'), p_composicion => pruebas.comp('novillos', 10), p_potrero_id => pruebas.id('P3')) $q$);
select pruebas.preparar('venta_lv', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.f('2024-12-01'),
      p_lineas => pruebas.comp('novillos', 10), p_modalidad => 'remate') $q$);




-- ════════════════════════════════════════════════════════════════════════════
-- 2. Medidas de fábrica (ejercicio 2025/26)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_valor('F01 Resultado por ha SPG: 1.000 / Ha SPG',
  $q$ select (f.valor = round(1000 / pruebas.haspg(), 4) and f.numerador = 1000 and f.denominador = pruebas.haspg())::text from pruebas.ffab('fab:resultado_ha_spg') f $q$, 'true');
select pruebas.espera_valor('F02 Resultado por ha SPG por rubro: cada rubro sobre la Ha SPG de todo el campo, con aviso',
  $q$ select string_agg(f.etiqueta || ':' || (f.valor = round(f.numerador / pruebas.haspg(), 4))::text || ':' || coalesce(f.avisos ->> 'b_total', 'sin aviso'), '|' order by f.n) from pruebas.ffab('fab:resultado_ha_spg', 'rubro') f $q$, 'Vacunos:true:true|General:true:true');
select pruebas.espera_valor('F03 Gasto por UG: 8.000 / 213,07 = 37,55',
  $q$ select trim_scale(round(f.valor, 2)) || ':' || trim_scale(f.numerador) || ':' || trim_scale(f.denominador) from pruebas.ffab('fab:gasto_ug') f $q$, '37.55:8000:213.07');
select pruebas.espera_valor('F04 Costo por kg producido: 8.000 / producción de carne (sin valor si la producción es 0 o no tiene dato)',
  $q$ select (f.numerador = 8000 and f.denominador is not distinct from pruebas.vfuente('produccion', 'produccion_carne') and f.valor is not distinct from (select case when p is null or p = 0 then null else round(8000 / p, 4) end from pruebas.vfuente('produccion', 'produccion_carne') p))::text from pruebas.ffab('fab:costo_kg') f $q$, 'true');
select pruebas.espera_valor('F05 Margen por kg (2 niveles): precio de venta 2,57 − costo por kg',
  $q$ select (f.valor is not distinct from round(pruebas.vfuente('economia', 'precio_venta') - (select g.valor from pruebas.ffab('fab:costo_kg') g), 4) and pruebas.vfuente('economia', 'precio_venta') = 2.57)::text from pruebas.ffab('fab:margen_kg') f $q$, 'true');
select pruebas.espera_valor('F06 Producción de carne por ha: producción de carne / Ha SPG',
  $q$ select (f.valor is not distinct from round(pruebas.vfuente('produccion', 'produccion_carne') / pruebas.haspg(), 4))::text from pruebas.ffab('fab:produccion_carne_ha') f $q$, 'true');
select pruebas.espera_valor('F07 Carne equivalente por ha: carne equivalente / Ha SPG',
  $q$ select (f.valor is not distinct from round(pruebas.vfuente('produccion', 'carne_equivalente') / pruebas.haspg(), 4))::text from pruebas.ffab('fab:carne_equivalente_ha') f $q$, 'true');

-- Una medida propia igual a una de fábrica da lo mismo
select pruebas.como('u_admin');
select pruebas.guardar('m_gpu', $q$ select public.guardar_medida(pruebas.id('est_a'), null, 'Gasto por UG (propia)', 'USD/UG', 'baja',
      pruebas.defm(pruebas.fm('economia', 'gastos_operativos'), 'div', pruebas.fm('stock', 'ug_promedio'))) $q$);
select pruebas.como('u_consulta');
select pruebas.espera_valor('F08 La propia "gasto por UG" da lo mismo que la de fábrica',
  $q$ select ((select f.valor from pruebas.fcomb('m_gpu') f) = (select g.valor from pruebas.ffab('fab:gasto_ug') g))::text $q$, 'true');
select pruebas.espera_error('E01 Una medida de fábrica que no existe',
  $q$ select * from pruebas.ffab('fab:inventada') $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Guardar el tablero
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_admin');
select pruebas.espera_ok('O01 El administrador guarda una tarjeta con una medida de fábrica (margen por kg)',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), jsonb_build_array(jsonb_build_object('nombre', 'Resumen', 'tarjetas', jsonb_build_array(jsonb_build_object('titulo', 'Fábrica', 'definicion', jsonb_build_object('fuente', 'combinada', 'medidas', jsonb_build_array('fab:margen_kg'), 'abrir_por', null, 'tiempo', 'total', 'grafico', 'numero'), 'x', 0, 'y', 0, 'w', 3, 'h', 3))))) $q$);
select pruebas.espera_error('E02 Pero no una de fábrica que no existe',
  $q$ select public.guardar_tablero(pruebas.id('est_a'), jsonb_build_array(jsonb_build_object('nombre', 'Resumen', 'tarjetas', jsonb_build_array(jsonb_build_object('titulo', 'Fábrica', 'definicion', jsonb_build_object('fuente', 'combinada', 'medidas', jsonb_build_array('fab:inventada'), 'abrir_por', null, 'tiempo', 'total', 'grafico', 'numero'), 'x', 0, 'y', 0, 'w', 3, 'h', 3))))) $q$, '22023');
select pruebas.espera_error('E03 Una medida propia no puede usar una de fábrica (se arma con las medidas de las fuentes)',
  $q$ select public.guardar_medida(pruebas.id('est_a'), null, 'Margen propio', 'USD/kg', null, jsonb_build_object('a', pruebas.fm('economia', 'precio_venta'), 'op', 'res', 'b', jsonb_build_object('propia', 'fab:costo_kg'))) $q$, '22023');
select pruebas.como('u_ajeno');
select pruebas.espera_error('E04 Un usuario de otro campo no calcula las medidas de fábrica de este',
  $q$ select * from pruebas.ffab('fab:gasto_ug') $q$, '42501');

reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS FABRICA 8A: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
