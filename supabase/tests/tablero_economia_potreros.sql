-- Campo Digital v2 — Pruebas del tablero de Indicadores, etapa 3: economía y potreros
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261111000100_tablero_arreglos_5a).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS TABLERO ECONOMÍA Y POTREROS: N OK, ...", que deshace todo.
--      El resultado esperado es "34 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Los datos son los de la sección 10 de contexto/DISENO-INDICADORES-TABLERO.md (lotes, movimientos económicos con
-- titulares y potreros), con fechas fijas; los resultados esperados están calculados a mano ahí.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia,
-- X = operador de otro campo.

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

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 tablero_economia y tablero_potreros: search_path fijo, con los permisos de quien consulta; authenticated sí, anon no',
  $q$ select count(*) filter (where coalesce('search_path=""' = any (p.proconfig), false) and not p.prosecdef
          and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('tablero_economia', 'tablero_potreros') $q$, '2');
select pruebas.espera_valor('B02 categorias_animales.ug: authenticated la escribe (las políticas la limitan al administrador); el trigger y la función interna sin execute',
  $q$ select (has_column_privilege('authenticated', 'public.categorias_animales', 'ug', 'update')
          and has_column_privilege('authenticated', 'public.categorias_animales', 'ug', 'insert')
          and not has_function_privilege('authenticated', 'public.completar_ug_categoria()', 'execute')
          and not has_function_privilege('authenticated', 'public._ug_por_nombre(text)', 'execute'))::text $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Datos (sección 10 del diseño: stock y reproductivos)
-- ════════════════════════════════════════════════════════════════════════════
--   30/6/2025  alta de L-Cría (100 vacas de cría), L-Nov1 (100 novillos) y L-Nov2 (50 novillos): 250 al inicio
--   1/10/2025  venta de 30 novillos de L-Nov1           15/10/2025  compra de 20 novillos a L-Nov2
--   1/2/2026   unión de L-Nov1 y L-Nov2 en L-Nov3 (140) 15/4/2026   mortandad de 2 novillos de L-Nov3 (138)
--   1/12/2025  servicio en L-Cría (100 entoradas)       1/3/2026    diagnóstico: 100, 90 preñadas
--   15/9/2026  parición en L-Cría: 80 vivos y 3 muertos, crías al pie
--   1/10/2026  división de L-Cría: L-Cría-B con 50 vacas y 40 terneros
--   1/11/2026  destete: 38 de L-Cría y 37 de L-Cría-B

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
      p_lineas => pruebas.comp('novillos', 30), p_modalidad => 'remate',
      p_precio => pruebas.precio(27000, 'USD', null, 'pagado', jsonb_build_array(pruebas.tit('t_a', 16200), pruebas.tit('t_b', 10800)))) $q$);
select pruebas.preparar('compra', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.f('2025-10-15'), p_lineas => pruebas.comp('novillos', 20), p_modalidad => 'productor', p_lote_id => pruebas.id('LN2'),
      p_precio => pruebas.precio(720000, 'UYU', 40, 'pagado', jsonb_build_array(pruebas.tit('t_a', 720000)))) $q$);
select pruebas.preparar('sanidad', $q$ select public.registrar_movimiento(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.f('2025-11-01'), p_sentido => 'egreso', p_rubro_id => pruebas.id('r_general'), p_concepto_id => pruebas.id('c_sanidad'),
      p_precio => pruebas.precio(2000, 'USD', null, 'pagado', null), p_titulares => jsonb_build_array(pruebas.tit('t_a', 2000))) $q$);
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

select pruebas.preparar('serv', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LC'), pruebas.f('2025-12-01'), 100, 4) $q$);
select pruebas.preparar('diag', $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LC'), pruebas.f('2026-03-01'), 100, 90) $q$);
select pruebas.preparar('pari', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LC'),
      p_fecha => pruebas.f('2026-09-15'), p_lineas => pruebas.comp('sin_sexar', 80), p_nacidos_muertos => 3, p_lote_cria_id => pruebas.id('LC')) $q$);
select pruebas.guardar('op_div', $q$ select public.dividir_lote(pruebas.id('LC'), pruebas.f('2026-10-01'),
      jsonb_build_array(jsonb_build_object('nombre', 'L-Cría-B', 'composicion',
        jsonb_build_array(pruebas.lin('vacas_cria', 50), pruebas.lin('sin_sexar', 40))))) $q$);
select pruebas.guardar('LCB', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_div') and v.rol = 'destino' $q$);
select pruebas.guardar('dest', $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.f('2026-11-01'),
      jsonb_build_array(
        jsonb_build_object('lote_id', pruebas.id('LC'),  'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 38))),
        jsonb_build_object('lote_id', pruebas.id('LCB'), 'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 37)))),
      jsonb_build_array(jsonb_build_object('nombre', 'Destete 2026', 'lineas',
        jsonb_build_array(pruebas.lin('terneros', 40), pruebas.lin('terneras', 35))))) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Economía (ejercicio 2025/26)
-- ════════════════════════════════════════════════════════════════════════════
-- Venta 27.000 (A 60 %, B 40 %; L-Nov1), compra UYU 720.000 a 40 = 18.000 (A; L-Nov2), Sanidad 2.000 (A; rubro
-- General, sin especie ni lote) y Sueldos 6.000 pendiente (A 4.000, B 2.000; rubro General).

select pruebas.como('u_consulta');
select pruebas.espera_valor('E01 Ingresos, gastos y resultado: 27.000, 26.000 y 1.000 (la compra en pesos a 40)',
  $q$ select pruebas.teco('ingresos', null, 'total') || '|' || pruebas.teco('gastos', null, 'total') || '|' || pruebas.teco('resultado', null, 'total') $q$,
  '27000|26000|1000');
select pruebas.espera_valor('E02 Por titular, con el reparto: B 8.800 y A −7.800 (suman 1.000)',
  $q$ select pruebas.teco('resultado', 'titular', 'total') $q$, 'Titular B:8800|Titular A:-7800');
select pruebas.espera_valor('E03 Por especie: Vacunos 9.000 y Sin asignar −8.000 (rubro General)',
  $q$ select pruebas.teco('resultado', 'especie', 'total') $q$, 'Vacunos:9000|Sin asignar:-8000');
select pruebas.espera_valor('E04 Filtrado por Vacunos: 9.000, con el aviso de USD 8.000 sin especie asignada',
  $q$ select trim_scale(r.valor) || '|' || (r.avisos ->> 'usd_sin_especie')
      from public.tablero_economia(pruebas.id('est_a'), 'resultado', null, 'total', '2025-07-01', '2026-06-30',
                                   jsonb_build_object('especie_ids', jsonb_build_array(pruebas.id('vacunos')))) r $q$, '9000|8000.00');
select pruebas.espera_valor('E05 Por lote: L-Nov1 27.000, Sin asignar −8.000, L-Nov2 −18.000',
  $q$ select pruebas.teco('resultado', 'lote', 'total') $q$, 'L-Nov1:27000|Sin asignar:-8000|L-Nov2:-18000');
select pruebas.espera_valor('E06 Por mes (sin los meses en 0): oct 9.000, nov −2.000, dic −6.000',
  $q$ select pruebas.teco('resultado', null, 'mes', p_sin_ceros => true) $q$, '2025-10:9000|2025-11:-2000|2025-12:-6000');
select pruebas.espera_valor('E07 Pendiente de pago 6.000 (sueldos) y de cobro 0',
  $q$ select pruebas.teco('pendiente_pago', null, 'total') || '|' || pruebas.teco('pendiente_cobro', null, 'total') $q$, '6000|0');
select pruebas.espera_valor('E08 Por rubro: Vacunos 9.000 y General −8.000',
  $q$ select pruebas.teco('resultado', 'rubro', 'total') $q$, 'Vacunos:9000|General:-8000');
select pruebas.espera_valor('E09 Sin filtro de especie no hay aviso',
  $q$ select coalesce((select r.avisos::text from public.tablero_economia(pruebas.id('est_a'), 'resultado', null, 'total', '2025-07-01', '2026-06-30') r), 'sin avisos') $q$,
  'sin avisos');
select pruebas.espera_error('E10 Pendientes por mes (no se puede)',
  $q$ select * from public.tablero_economia(pruebas.id('est_a'), 'pendiente_pago', null, 'mes', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_error('E11 Abrir la economía por categoría (no se puede)',
  $q$ select * from public.tablero_economia(pruebas.id('est_a'), 'resultado', 'categoria', 'total', '2025-07-01', '2026-06-30') $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Potreros (al 30/6/2026; días en el ejercicio 2025/26)
-- ════════════════════════════════════════════════════════════════════════════
-- P1 (dibujado) con L-Nov3 desde el 1/2/2026: 138 × 0,8 = 110,4 UG. P2 (dibujado) con L-Cría desde el alta:
-- 100 × 1 = 100 UG. P3 activo sin dibujar y sin animales.

select pruebas.espera_valor('U01 UG de las categorías: novillos 0,8, vacas de cría 1 (la tabla, al crear el establecimiento)',
  $q$ select string_agg(nombre || ':' || trim_scale(ug), '|' order by nombre) from public.categorias_animales
      where id in (pruebas.id('novillos'), pruebas.id('vacas_cria')) $q$, 'Novillos:0.8|Vacas de cría:1');
select pruebas.espera_valor('U02 UG al cierre: 110,4 + 100 = 210,4',
  $q$ select pruebas.tpot('ug', null, 'total') $q$, '210.4');
select pruebas.espera_valor('U03 Carga global: 210,4 / (superficie de P1 + P2), con el aviso de 1 potrero sin dibujar',
  $q$ select (r.valor = round(210.4 / (pruebas.sup('P1') + pruebas.sup('P2')), 3) and r.numerador = 210.4
              and r.denominador = pruebas.sup('P1') + pruebas.sup('P2') and (r.avisos ->> 'potreros_sin_dibujar') = '1')::text
      from public.tablero_potreros(pruebas.id('est_a'), 'carga', null, 'total', '2025-07-01', '2026-06-30') r $q$, 'true');
select pruebas.espera_valor('U04 Carga por potrero: P1 110,4 / su superficie, P2 100 / la suya, P3 sin dato (sin dibujar)',
  $q$ select string_agg(r.etiqueta || ':' || coalesce((r.valor = round(r.numerador / nullif(r.denominador, 0), 3))::text, 'sin dato')
                        || ':' || trim_scale(r.numerador), '|' order by r.etiqueta)
      from public.tablero_potreros(pruebas.id('est_a'), 'carga', 'potrero', 'total', '2025-07-01', '2026-06-30') r $q$,
  'Potrero 1:true:110.4|Potrero 2:true:100|Potrero 3:sin dato:0');
select pruebas.espera_valor('U05 Días de ocupación 2025/26: P2 365, P1 150 (desde el 1/2), P3 0',
  $q$ select pruebas.tpot('dias_ocupacion', 'potrero', 'total') $q$, 'Potrero 2:365|Potrero 1:150|Potrero 3:0');
select pruebas.espera_valor('U06 Días de descanso: P3 365, P1 215, P2 0',
  $q$ select pruebas.tpot('dias_descanso', 'potrero', 'total') $q$, 'Potrero 3:365|Potrero 1:215|Potrero 2:0');
select pruebas.espera_valor('U07 UG filtradas por novillos: 110,4',
  $q$ select pruebas.tpot('ug', null, 'total', jsonb_build_object('categoria_ids', jsonb_build_array(pruebas.id('novillos')))) $q$, '110.4');
-- Una zona no aprovechable (Monte) en la mitad izquierda de P1: la carga pasa a ser sobre el área efectiva
select pruebas.guardar('t_monte', $q$ select id from public.zona_tipos where establecimiento_id = pruebas.id('est_a') and nombre = 'Monte' $q$);
select pruebas.como('u_operador');
select pruebas.preparar('zona_P1', $q$ select public.guardar_zona_potrero(gen_random_uuid(), pruebas.id('P1'), pruebas.id('t_monte'),
      pruebas.cuadro(-56.50, -56.495, -33.00, -32.99)) $q$);
select pruebas.espera_valor('U07b Con la zona, la efectiva de P1 es menor que su superficie (la mitad, aprox.)',
  $q$ select (pruebas.efe('P1') < pruebas.sup('P1') and pruebas.efe('P1') between pruebas.sup('P1') * 0.45 and pruebas.sup('P1') * 0.55)::text $q$, 'true');
select pruebas.espera_valor('U07c Carga de P1 sobre su área efectiva: 110,4 / efectiva',
  $q$ select (r.valor = round(110.4 / pruebas.efe('P1'), 3) and r.denominador = pruebas.efe('P1'))::text
      from public.tablero_potreros(pruebas.id('est_a'), 'carga', 'potrero', 'total', '2025-07-01', '2026-06-30') r
      where r.clave = pruebas.id('P1')::text $q$, 'true');
select pruebas.espera_valor('U07d Carga global sobre la suma de las efectivas, y la medida superficie_efectiva',
  $q$ select (r.valor = round(210.4 / (pruebas.efe('P1') + pruebas.efe('P2')), 3)
              and (select trim_scale(x.valor) from public.tablero_potreros(pruebas.id('est_a'), 'superficie_efectiva', null, 'total', '2025-07-01', '2026-06-30') x)
                  = trim_scale(pruebas.efe('P1') + pruebas.efe('P2')))::text
      from public.tablero_potreros(pruebas.id('est_a'), 'carga', null, 'total', '2025-07-01', '2026-06-30') r $q$, 'true');
-- P4: potrero de uso Forestación, dibujado. No es de pastoreo: no entra en la carga global ni en la Ha SPG
select pruebas.guardar('P4', $q$ insert into public.potreros (establecimiento_id, nombre, uso_actual)
      values (pruebas.id('est_a'), 'Potrero 4', 'Forestación') returning id $q$);
select pruebas.preparar('forma_P4', $q$ select public.guardar_forma_potrero(pruebas.id('P4'), pruebas.cuadro(-56.48, -56.47, -33.00, -32.99)) $q$);
select pruebas.espera_valor('U07e Con P4 de forestación: la carga global y la superficie efectiva sin abrir siguen siendo de P1 + P2; P4 aparece por potrero',
  $q$ select (pruebas.efe('P4') > 0 and r.valor = round(210.4 / (pruebas.efe('P1') + pruebas.efe('P2')), 3)
              and (select trim_scale(x.valor) from public.tablero_potreros(pruebas.id('est_a'), 'superficie_efectiva', null, 'total', '2025-07-01', '2026-06-30') x)
                  = trim_scale(pruebas.efe('P1') + pruebas.efe('P2'))
              and (select count(*) from public.tablero_potreros(pruebas.id('est_a'), 'carga', 'potrero', 'total', '2025-07-01', '2026-06-30') x
                   where x.clave = pruebas.id('P4')::text) = 1)::text
      from public.tablero_potreros(pruebas.id('est_a'), 'carga', null, 'total', '2025-07-01', '2026-06-30') r $q$, 'true');
select pruebas.espera_valor('U07f UG sin potrero al cierre de octubre de 2025: L-Nov1 y L-Nov2, 140 × 0,8 = 112',
  $q$ select trim_scale((r.avisos ->> 'ug_sin_potrero')::numeric)::text
      from public.tablero_potreros(pruebas.id('est_a'), 'carga', null, 'total', '2025-10-01', '2025-10-31') r $q$, '112');
select pruebas.espera_valor('U07g Al 30/6/2026 no hay UG sin potrero (sin aviso); por mes, el aviso dice el mayor: 150 × 0,8 = 120 (jul a set)',
  $q$ select ((select r.avisos ? 'ug_sin_potrero' from public.tablero_potreros(pruebas.id('est_a'), 'carga', null, 'total', '2025-07-01', '2026-06-30') r)::text
             || ' ' || (select distinct trim_scale((r.avisos ->> 'ug_sin_potrero')::numeric)::text
                        from public.tablero_potreros(pruebas.id('est_a'), 'carga', null, 'mes', '2025-07-01', '2026-06-30') r)) $q$, 'false 120');
select pruebas.espera_error('U08 Días sin abrir por potrero (no se puede)',
  $q$ select * from public.tablero_potreros(pruebas.id('est_a'), 'dias_ocupacion', null, 'total', '2025-07-01', '2026-06-30') $q$, '22023');

select pruebas.como('u_admin');
select pruebas.espera_valor('U09 Una categoría nueva con nombre de la tabla (sin importar mayúsculas) toma su UG; una que no está, queda sin UG',
  $q$ with n as (insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden)
                 values (pruebas.id('est_a'), pruebas.id('vacunos'), 'Bueyes', 99), (pruebas.id('est_a'), pruebas.id('vacunos'), 'POTRILLOS', 98)
                 returning nombre, ug)
      select string_agg(btrim(nombre) || ':' || coalesce(trim_scale(ug)::text, 'sin UG'), '|' order by nombre) from n $q$, 'Bueyes:sin UG|POTRILLOS:0.5');
select pruebas.espera_filas('U10 El administrador corrige la UG de una categoría',
  $q$ update public.categorias_animales set ug = 0.75 where id = pruebas.id('novillos') $q$, 1);
select pruebas.como('u_operador');
select pruebas.espera_filas('U11 El operador no la cambia (0 filas: la política es del administrador)',
  $q$ update public.categorias_animales set ug = 2 where id = pruebas.id('novillos') $q$, 0);

select pruebas.como('u_ajeno');
select pruebas.espera_error('X01 Un usuario de otro campo no saca datos económicos',
  $q$ select * from public.tablero_economia(pruebas.id('est_a'), 'resultado', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');
select pruebas.espera_error('X02 Ni de potreros',
  $q$ select * from public.tablero_potreros(pruebas.id('est_a'), 'carga', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no usa tablero_economia',
  $q$ select * from public.tablero_economia(pruebas.id('est_a'), 'resultado', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');
select pruebas.espera_error('N02 anon no usa tablero_potreros',
  $q$ select * from public.tablero_potreros(pruebas.id('est_a'), 'carga', null, 'total', '2025-07-01', '2026-06-30') $q$, '42501');

reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS TABLERO ECONOMÍA Y POTREROS: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
