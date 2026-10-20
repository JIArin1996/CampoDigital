-- Campo Digital v2 — Pruebas de años de nacimiento del lote
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261020000500_borrar_campana: A12 espera que la
--      columna campana ya no exista).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS AÑOS DE NACIMIENTO: N OK, ...", que deshace todo
--      (también los objetos de Storage simulados).
--      El resultado esperado es "39 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
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


grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Administrador: establecimiento, roles y catálogo
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.guardar('vacunos',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('terneros', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros' $q$);
select pruebas.guardar('novillos', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Novillos' $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Operador: crear_lote con años
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

select pruebas.guardar('L1', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'L1', p_fecha_apertura => pruebas.d(20), p_composicion => pruebas.comp('terneros', 10),
      p_anios_nacimiento => array[2023, 2024]) $q$);
select pruebas.espera_valor('A01 crear_lote guarda los años de nacimiento',
  $q$ select anios_nacimiento::text from public.lotes where id = pruebas.id('L1') $q$, '{2023,2024}');
select pruebas.guardar('L0', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L0 sin años', pruebas.d(20), pruebas.comp('terneros', 1)) $q$);
select pruebas.espera_valor('A02 Sin años: lista vacía por defecto',
  $q$ select anios_nacimiento::text from public.lotes where id = pruebas.id('L0') $q$, '{}');
select pruebas.espera_error('A03 Años repetidos',
  $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'), p_nombre => 'X',
      p_fecha_apertura => pruebas.d(1), p_composicion => pruebas.comp('terneros', 1), p_anios_nacimiento => array[2025, 2025]) $q$, '23514');
select pruebas.espera_error('A04 Años desordenados',
  $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'), p_nombre => 'X',
      p_fecha_apertura => pruebas.d(1), p_composicion => pruebas.comp('terneros', 1), p_anios_nacimiento => array[2025, 2024]) $q$, '23514');
select pruebas.espera_error('A05 Año anterior a 1990',
  $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'), p_nombre => 'X',
      p_fecha_apertura => pruebas.d(1), p_composicion => pruebas.comp('terneros', 1), p_anios_nacimiento => array[1989]) $q$, '23514');
select pruebas.espera_error('A06 Año posterior al actual',
  $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'), p_nombre => 'X',
      p_fecha_apertura => pruebas.d(1), p_composicion => pruebas.comp('terneros', 1),
      p_anios_nacimiento => array[extract(year from public.fecha_hoy())::int + 1]) $q$, '23514');
select pruebas.espera_error('A07 Más de 10 años',
  $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'), p_nombre => 'X',
      p_fecha_apertura => pruebas.d(1), p_composicion => pruebas.comp('terneros', 1),
      p_anios_nacimiento => array(select generate_series(2010, 2020))) $q$, '23514');
select pruebas.guardar('L10', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'L10', p_fecha_apertura => pruebas.d(1), p_composicion => pruebas.comp('terneros', 1),
      p_anios_nacimiento => array(select generate_series(2011, 2020))) $q$);
select pruebas.espera_valor('A08 Exactamente 10 años: se acepta',
  $q$ select cardinality(anios_nacimiento)::text from public.lotes where id = pruebas.id('L10') $q$, '10');
select pruebas.guardar('Lhoy', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'Lhoy', p_fecha_apertura => pruebas.d(1), p_composicion => pruebas.comp('terneros', 1),
      p_anios_nacimiento => array[extract(year from public.fecha_hoy())::int]) $q$);
select pruebas.espera_valor('A09 El año actual se acepta',
  $q$ select (anios_nacimiento = array[extract(year from public.fecha_hoy())::int])::text from public.lotes where id = pruebas.id('Lhoy') $q$, 'true');

-- Edición directa (permiso de columna; la política exige poder cargar)
select pruebas.espera_filas('A10 El operador edita los años del lote',
  $q$ update public.lotes set anios_nacimiento = '{2022,2023}' where id = pruebas.id('L0') $q$, 1);
select pruebas.espera_error('A11 Edición con años desordenados',
  $q$ update public.lotes set anios_nacimiento = '{2023,2022}' where id = pruebas.id('L0') $q$, '23514');
select pruebas.espera_error('A12 La campaña ya no existe (columna borrada en 20261020000500)',
  $q$ update public.lotes set campana = '2025' where id = pruebas.id('L0') $q$, '42703');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Herencia: dividir, unir y recategorizar
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.guardar('op_div', $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(5), jsonb_build_array(
      jsonb_build_object('nombre', 'D1', 'composicion', pruebas.comp('terneros', 3)),
      jsonb_build_object('nombre', 'D2', 'composicion', pruebas.comp('terneros', 2)))) $q$);
select pruebas.espera_valor('D01 Dividir: cada lote nuevo hereda los años del origen, y el origen los conserva',
  $q$ select string_agg(l.nombre || ':' || l.anios_nacimiento::text, ' ' order by l.nombre)
      from public.lotes l
      where l.id = pruebas.id('L1')
         or l.id in (select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_div') and v.rol = 'destino') $q$,
  'D1:{2023,2024} D2:{2023,2024} L1:{2023,2024}');

-- Años propios para el lote nuevo (la pantalla los precarga con los del origen y se pueden cambiar)
select pruebas.guardar('op_div2', $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(4), jsonb_build_array(
      jsonb_build_object('nombre', 'D3', 'anios_nacimiento', jsonb_build_array(2024), 'composicion', pruebas.comp('terneros', 1)),
      jsonb_build_object('nombre', 'D4', 'anios_nacimiento', jsonb_build_array(), 'composicion', pruebas.comp('terneros', 1)))) $q$);
select pruebas.espera_valor('D02 Dividir con años propios: D3 {2024}; con lista vacía, D4 queda sin años',
  $q$ select string_agg(l.nombre || ':' || l.anios_nacimiento::text, ' ' order by l.nombre)
      from public.lotes l
      where l.id in (select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_div2') and v.rol = 'destino') $q$,
  'D3:{2024} D4:{}');
select pruebas.espera_error('D03 Dividir con años propios desordenados',
  $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(4), jsonb_build_array(
      jsonb_build_object('nombre', 'X', 'anios_nacimiento', jsonb_build_array(2025, 2024), 'composicion', pruebas.comp('terneros', 1)))) $q$, '23514');
select pruebas.espera_error('D04 Dividir con un año que no es un número',
  $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(4), jsonb_build_array(
      jsonb_build_object('nombre', 'X', 'anios_nacimiento', jsonb_build_array('2024'), 'composicion', pruebas.comp('terneros', 1)))) $q$, '22023');
select pruebas.espera_error('D05 Dividir con años que no son una lista',
  $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(4), jsonb_build_array(
      jsonb_build_object('nombre', 'X', 'anios_nacimiento', 2024, 'composicion', pruebas.comp('terneros', 1)))) $q$, '22023');
select pruebas.guardar('op_div3', $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(4), jsonb_build_array(
      jsonb_build_object('nombre', 'D5', 'anios_nacimiento', null, 'composicion', pruebas.comp('terneros', 1)))) $q$);
select pruebas.espera_valor('D06 Años null en la división: hereda los del origen',
  $q$ select l.anios_nacimiento::text from public.lotes l
      join public.operacion_lote_vinculos v on v.lote_id = l.id and v.rol = 'destino' and v.operacion_id = pruebas.id('op_div3') $q$, '{2023,2024}');

-- Compra a un lote nuevo: los años que indique el formulario (sin inferir)
select pruebas.guardar('c1', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(3), p_lineas => pruebas.comp('terneros', 2), p_modalidad => 'productor',
      p_lote_nuevo => jsonb_build_object('nombre', 'Comprados', 'especie_id', pruebas.id('vacunos'), 'anios_nacimiento', jsonb_build_array(2023, 2024))) $q$);
select pruebas.espera_valor('C01 Compra con lote nuevo y años: el lote los guarda',
  $q$ select l.anios_nacimiento::text from public.actividades a join public.lotes l on l.id = a.lote_id where a.id = pruebas.id('c1') $q$, '{2023,2024}');
select pruebas.guardar('c2', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(3), p_lineas => pruebas.comp('terneros', 2), p_modalidad => 'productor',
      p_lote_nuevo => jsonb_build_object('nombre', 'Comprados sin año', 'especie_id', pruebas.id('vacunos'))) $q$);
select pruebas.espera_valor('C02 Compra con lote nuevo sin años: queda vacío (no se infiere)',
  $q$ select l.anios_nacimiento::text from public.actividades a join public.lotes l on l.id = a.lote_id where a.id = pruebas.id('c2') $q$, '{}');
select pruebas.espera_error('C03 Compra con un año fuera de rango',
  $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.d(3), p_lineas => pruebas.comp('terneros', 2), p_modalidad => 'productor',
      p_lote_nuevo => jsonb_build_object('nombre', 'X', 'especie_id', pruebas.id('vacunos'), 'anios_nacimiento', jsonb_build_array(1980))) $q$, '23514');

select pruebas.guardar('LA', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LA', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 4), p_anios_nacimiento => array[2023, 2024]) $q$);
select pruebas.guardar('LB', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LB', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 4), p_anios_nacimiento => array[2024, 2025]) $q$);
select pruebas.guardar('op_union', $q$ select public.unir_lotes(array[pruebas.id('LA'), pruebas.id('LB')], pruebas.d(2), null,
      jsonb_build_object('nombre', 'LU')) $q$);
select pruebas.espera_valor('U01 Unir en un lote nuevo: unión de los años, sin repetir y ordenada',
  $q$ select l.anios_nacimiento::text from public.lotes l
      join public.operacion_lote_vinculos v on v.lote_id = l.id and v.rol = 'destino' and v.operacion_id = pruebas.id('op_union') $q$,
  '{2023,2024,2025}');

select pruebas.guardar('LC', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LC', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 2), p_anios_nacimiento => array[2022]) $q$);
select pruebas.guardar('LD', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LD', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 2), p_anios_nacimiento => array[2025]) $q$);
select pruebas.espera_ok('U02 Unir LD a un destino existente (LC)',
  $q$ select public.unir_lotes(array[pruebas.id('LD')], pruebas.d(2), pruebas.id('LC')) $q$);
select pruebas.espera_valor('U03 El destino existente suma los años del origen a los suyos',
  $q$ select anios_nacimiento::text from public.lotes where id = pruebas.id('LC') $q$, '{2022,2025}');

select pruebas.guardar('LE', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LE', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 1),
      p_anios_nacimiento => array(select generate_series(2011, 2016))) $q$);
select pruebas.guardar('LF', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LF', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 1),
      p_anios_nacimiento => array(select generate_series(2017, 2021))) $q$);
select pruebas.espera_error('U04 Unir lotes cuyos años juntos son más de 10 (11): se rechaza y no cambia nada',
  $q$ select public.unir_lotes(array[pruebas.id('LE'), pruebas.id('LF')], pruebas.d(2), null, jsonb_build_object('nombre', 'LEF')) $q$, '23514');

select pruebas.espera_ok('R01 Recategorizar 2 terneros de LC a novillos',
  $q$ select public.recategorizar_lote(pruebas.id('LC'), pruebas.d(1),
      jsonb_build_array(jsonb_build_object('desde_categoria_id', pruebas.id('terneros'), 'hacia_categoria_id', pruebas.id('novillos'), 'cabezas', 2))) $q$);
select pruebas.espera_valor('R02 Recategorizar mantiene los años',
  $q$ select anios_nacimiento::text from public.lotes where id = pruebas.id('LC') $q$, '{2022,2025}');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Base (postgres): carga desde campaña y permisos
-- ════════════════════════════════════════════════════════════════════════════

reset role;

select pruebas.espera_valor('M01 Campaña "2024 y 2025" → {2024,2025}', $q$ select public._anios_de_texto('2024 y 2025')::text $q$, '{2024,2025}');
select pruebas.espera_valor('M02 Campaña "2025" → {2025}', $q$ select public._anios_de_texto('2025')::text $q$, '{2025}');
select pruebas.espera_valor('M03 Campaña "2025, 2024 y 2025" → sin repetir y ordenada', $q$ select public._anios_de_texto('2025, 2024 y 2025')::text $q$, '{2024,2025}');
select pruebas.espera_valor('M04 Campaña sin años → vacío', $q$ select public._anios_de_texto('campaña vieja')::text $q$, '{}');
select pruebas.espera_valor('M05 "2024/25": solo el año de 4 dígitos', $q$ select public._anios_de_texto('2024/25')::text $q$, '{2024}');
select pruebas.espera_valor('M06 Año fuera de rango (1985) se descarta', $q$ select public._anios_de_texto('1985 y 2020')::text $q$, '{2020}');
select pruebas.espera_valor('M07 Número de más de 4 dígitos no es un año', $q$ select public._anios_de_texto('lote 120245')::text $q$, '{}');
select pruebas.espera_valor('M08 Campaña nula → vacío', $q$ select public._anios_de_texto(null)::text $q$, '{}');

select pruebas.espera_valor('P01 Funciones nuevas sin execute para authenticated ni anon, con search_path fijo',
  $q$ select (count(*) = 3 and bool_and(coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('authenticated', p.oid, 'execute')
              and not has_function_privilege('anon', p.oid, 'execute')))::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('_anios_de_texto', '_anios_de_jsonb', 'validar_anios_nacimiento') $q$, 'true');
select pruebas.espera_valor('P02 crear_lote: una sola versión (la nueva, con años), para authenticated y no para anon',
  $q$ select (count(*) = 1 and bool_and(pg_get_function_identity_arguments(p.oid) like '%p_anios_nacimiento integer[]'
              and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')))::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'crear_lote' $q$, 'true');
select pruebas.espera_valor('P03 Permisos de columna de lotes: authenticated edita anios_nacimiento, anon no',
  $q$ select (has_column_privilege('authenticated', 'public.lotes', 'anios_nacimiento', 'UPDATE')
              and not has_column_privilege('anon', 'public.lotes', 'anios_nacimiento', 'UPDATE'))::text $q$, 'true');
select pruebas.espera_error('P04 La base rechaza años inválidos aun como postgres',
  $q$ update public.lotes set anios_nacimiento = '{1950}' where id = pruebas.id('L0') $q$, '23514');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS AÑOS DE NACIMIENTO: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
