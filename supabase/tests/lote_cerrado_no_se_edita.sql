-- Campo Digital v2 — Pruebas: un lote cerrado no se edita
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261020000400_lote_cerrado_no_se_edita).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS LOTE CERRADO: N OK, ...", que deshace todo.
--      El resultado esperado es "41 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
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
-- 1. Administrador: establecimientos, roles y catálogo
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pruebas.como('u_admin');

select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
select pruebas.guardar('vacunos',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('terneros', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros' $q$);
select pruebas.guardar('novillos', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Novillos' $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Operador: lote abierto, cerrado y reabierto
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

select pruebas.guardar('P1', $q$ insert into public.potreros (establecimiento_id, nombre, superficie, uso_actual)
      values (pruebas.id('est_a'), 'Potrero 1', 50, 'Ganadería') returning id $q$);
select pruebas.guardar('L1', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'L1', p_fecha_apertura => pruebas.d(20), p_composicion => pruebas.comp('terneros', 5)) $q$);

select pruebas.espera_filas('E01 Operador edita nombre, notas, años y potrero de un lote abierto',
  $q$ update public.lotes set nombre = 'L1 editado', notas = 'abierto', anios_nacimiento = '{2024}', potrero_id = pruebas.id('P1')
      where id = pruebas.id('L1') $q$, 1);
select pruebas.espera_valor('E02 Los cambios quedaron guardados',
  $q$ select nombre || '|' || notas || '|' || anios_nacimiento::text || '|' || (potrero_id = pruebas.id('P1'))::text
      from public.lotes where id = pruebas.id('L1') $q$, 'L1 editado|abierto|{2024}|true');

-- L2: se vacía con un ajuste y se cierra con cerrar_lote
select pruebas.guardar('L2', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'L2', p_fecha_apertura => pruebas.d(20), p_composicion => pruebas.comp('terneros', 2), p_anios_nacimiento => array[2023]) $q$);
select pruebas.preparar('aj_L2', $q$ select public.registrar_ajuste(pruebas.id('L2'), pruebas.id('terneros'), -2, pruebas.d(2), 'Conteo') $q$);
select pruebas.espera_ok('E03 cerrar_lote sigue funcionando',
  $q$ select public.cerrar_lote(pruebas.id('L2'), pruebas.d(1), 'Prueba de cierre') $q$);
select pruebas.espera_valor('E04 L2 quedó cerrado',
  $q$ select estado from public.lotes where id = pruebas.id('L2') $q$, 'cerrado');

select pruebas.espera_filas('E05 Lote cerrado: no se edita el nombre',
  $q$ update public.lotes set nombre = 'L2 editado' where id = pruebas.id('L2') $q$, 0);
select pruebas.espera_filas('E06 Lote cerrado: no se editan las notas',
  $q$ update public.lotes set notas = 'cerrado' where id = pruebas.id('L2') $q$, 0);
select pruebas.espera_filas('E07 Lote cerrado: no se editan los años de nacimiento',
  $q$ update public.lotes set anios_nacimiento = '{2022}' where id = pruebas.id('L2') $q$, 0);
select pruebas.espera_filas('E08 Lote cerrado: no se edita el potrero',
  $q$ update public.lotes set potrero_id = pruebas.id('P1') where id = pruebas.id('L2') $q$, 0);
select pruebas.espera_valor('E09 El lote cerrado quedó sin cambios',
  $q$ select nombre || '|' || coalesce(notas, 'sin notas') || '|' || anios_nacimiento::text || '|' || coalesce(potrero_id::text, 'sin potrero')
      from public.lotes where id = pruebas.id('L2') $q$, 'L2|sin notas|{2023}|sin potrero');

select pruebas.espera_ok('E10 reabrir_lote sigue funcionando',
  $q$ select public.reabrir_lote(pruebas.id('L2'), public.fecha_hoy(), 'Se reabre para corregir') $q$);
select pruebas.espera_filas('E11 Reabierto: se vuelve a editar',
  $q$ update public.lotes set notas = 'reabierto', anios_nacimiento = '{2022,2023}' where id = pruebas.id('L2') $q$, 1);
select pruebas.espera_ok('E12 Se vuelve a cerrar',
  $q$ select public.cerrar_lote(pruebas.id('L2'), public.fecha_hoy()) $q$);
select pruebas.espera_filas('E13 Cerrado otra vez: no se edita',
  $q$ update public.lotes set notas = 'de nuevo' where id = pruebas.id('L2') $q$, 0);
select pruebas.espera_valor('E14 Quedan las notas de cuando estaba abierto',
  $q$ select notas || '|' || anios_nacimiento::text from public.lotes where id = pruebas.id('L2') $q$, 'reabierto|{2022,2023}');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Las funciones que escriben en lotes siguen funcionando
-- ════════════════════════════════════════════════════════════════════════════

-- Unir en un lote nuevo: cierra los orígenes
select pruebas.guardar('LA', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LA', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 2), p_anios_nacimiento => array[2023]) $q$);
select pruebas.guardar('LB', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LB', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 2), p_anios_nacimiento => array[2024]) $q$);
select pruebas.guardar('op_u', $q$ select public.unir_lotes(array[pruebas.id('LA'), pruebas.id('LB')], pruebas.d(1), null,
      jsonb_build_object('nombre', 'LU')) $q$);
select pruebas.espera_valor('U01 unir_lotes sigue funcionando: cierra los orígenes',
  $q$ select string_agg(estado, ',' order by nombre) from public.lotes where id in (pruebas.id('LA'), pruebas.id('LB')) $q$, 'cerrado,cerrado');
select pruebas.espera_valor('U02 El lote nuevo de la unión queda abierto con la unión de los años',
  $q$ select l.estado || '|' || l.anios_nacimiento::text from public.lotes l
      join public.operacion_lote_vinculos v on v.lote_id = l.id and v.rol = 'destino' and v.operacion_id = pruebas.id('op_u') $q$, 'activo|{2023,2024}');
select pruebas.espera_filas('U03 Un origen de la unión (cerrado) no se edita',
  $q$ update public.lotes set notas = 'x' where id = pruebas.id('LA') $q$, 0);

-- Unir a un destino existente: la función actualiza los años del destino
select pruebas.guardar('LC', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LC', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 2), p_anios_nacimiento => array[2022]) $q$);
select pruebas.guardar('LD', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LD', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 1), p_anios_nacimiento => array[2025]) $q$);
select pruebas.espera_ok('U04 Unir a un destino existente',
  $q$ select public.unir_lotes(array[pruebas.id('LD')], pruebas.d(1), pruebas.id('LC')) $q$);
select pruebas.espera_valor('U05 La función actualizó los años del destino y cerró el origen',
  $q$ select (select anios_nacimiento::text from public.lotes where id = pruebas.id('LC')) || '|'
          || (select estado from public.lotes where id = pruebas.id('LD')) $q$, '{2022,2025}|cerrado');

-- Dividir todo el stock: el origen se cierra y el lote nuevo se edita
select pruebas.guardar('LE', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LE', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 3)) $q$);
select pruebas.guardar('op_d', $q$ select public.dividir_lote(pruebas.id('LE'), pruebas.d(1), jsonb_build_array(
      jsonb_build_object('nombre', 'E1', 'composicion', pruebas.comp('terneros', 3)))) $q$);
select pruebas.espera_valor('D01 dividir_lote sigue funcionando: el origen vacío se cierra',
  $q$ select estado from public.lotes where id = pruebas.id('LE') $q$, 'cerrado');
select pruebas.espera_filas('D02 El lote nuevo de la división se edita',
  $q$ update public.lotes set notas = 'nuevo'
      where id = (select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_d') and v.rol = 'destino') $q$, 1);
select pruebas.espera_filas('D03 El origen dividido (cerrado) no se edita',
  $q$ update public.lotes set notas = 'x' where id = pruebas.id('LE') $q$, 0);

select pruebas.espera_ok('R01 recategorizar_lote sigue funcionando',
  $q$ select public.recategorizar_lote(pruebas.id('L1'), pruebas.d(1),
      jsonb_build_array(jsonb_build_object('desde_categoria_id', pruebas.id('terneros'), 'hacia_categoria_id', pruebas.id('novillos'), 'cabezas', 1))) $q$);

-- Venta que deja el lote en cero (lo cierra) y su anulación (lo reabre)
select pruebas.guardar('LV', $q$ select public.crear_lote(p_establecimiento_id => pruebas.id('est_a'), p_especie_id => pruebas.id('vacunos'),
      p_nombre => 'LV', p_fecha_apertura => pruebas.d(10), p_composicion => pruebas.comp('terneros', 2)) $q$);
select pruebas.guardar('v1', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LV'), p_fecha => pruebas.d(1),
      p_lineas => pruebas.comp('terneros', 2), p_modalidad => 'remate') $q$);
select pruebas.espera_valor('V01 La venta que deja el lote en cero lo cierra',
  $q$ select estado from public.lotes where id = pruebas.id('LV') $q$, 'cerrado');
select pruebas.espera_filas('V02 Lote cerrado por venta: no se edita',
  $q$ update public.lotes set notas = 'x' where id = pruebas.id('LV') $q$, 0);
select pruebas.espera_ok('V03 anular_actividad sigue funcionando',
  $q$ select public.anular_actividad(pruebas.id('v1'), 'Venta cargada por error') $q$);
select pruebas.espera_valor('V04 La anulación reabre el lote',
  $q$ select estado from public.lotes where id = pruebas.id('LV') $q$, 'activo');
select pruebas.espera_filas('V05 Reabierto por la anulación: se edita',
  $q$ update public.lotes set notas = 'venta anulada' where id = pruebas.id('LV') $q$, 1);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Consulta, otro establecimiento y anon
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_valor('Q01 Consulta ve el lote abierto',
  $q$ select count(*)::text from public.lotes where id = pruebas.id('L1') $q$, '1');
select pruebas.espera_filas('Q02 Consulta no edita un lote abierto',
  $q$ update public.lotes set notas = 'consulta' where id = pruebas.id('L1') $q$, 0);
select pruebas.espera_filas('Q03 Consulta no edita un lote cerrado',
  $q$ update public.lotes set notas = 'consulta' where id = pruebas.id('L2') $q$, 0);

select pruebas.como('u_ajeno');
select pruebas.espera_filas('X01 Un miembro de otro establecimiento no edita un lote abierto ajeno',
  $q$ update public.lotes set notas = 'ajeno' where id = pruebas.id('L1') $q$, 0);
select pruebas.espera_filas('X02 Ni uno cerrado',
  $q$ update public.lotes set notas = 'ajeno' where id = pruebas.id('L2') $q$, 0);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no edita un lote abierto',
  $q$ update public.lotes set notas = 'anon' where id = pruebas.id('L1') $q$, '42501');
select pruebas.espera_error('N02 anon no edita un lote cerrado',
  $q$ update public.lotes set notas = 'anon' where id = pruebas.id('L2') $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Base (postgres): la política, y por qué las funciones no dependen de ella
-- ════════════════════════════════════════════════════════════════════════════

reset role;

select pruebas.espera_valor('Z01 Nadie editó el lote abierto desde afuera (consulta, ajeno, anon)',
  $q$ select notas from public.lotes where id = pruebas.id('L1') $q$, 'abierto');
select pruebas.espera_valor('Z02 lotes tiene una sola política de update y exige estado activo en USING y WITH CHECK',
  $q$ select (count(*) = 1 and bool_and(qual like '%estado%activo%' and with_check like '%estado%activo%'))::text
      from pg_policies where schemaname = 'public' and tablename = 'lotes' and cmd = 'UPDATE' $q$, 'true');
select pruebas.espera_valor('Z03 lotes no tiene FORCE ROW LEVEL SECURITY (el dueño no queda sujeto a las políticas)',
  $q$ select relforcerowsecurity::text from pg_class where oid = 'public.lotes'::regclass $q$, 'false');
select pruebas.espera_valor('Z04 Las 12 funciones que escriben o cierran lotes son security definer y su dueño es el de la tabla (o salta RLS)',
  $q$ select count(*) filter (where p.prosecdef and (p.proowner = c.relowner or r.rolbypassrls))::text || '/' || count(*)
      from pg_proc p
      join pg_roles r on r.oid = p.proowner
      cross join (select relowner from pg_class where oid = 'public.lotes'::regclass) c
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('crear_lote', 'registrar_ajuste', 'cerrar_lote', 'reabrir_lote', 'dividir_lote', 'unir_lotes',
                          'recategorizar_lote', 'registrar_compra', 'registrar_venta', 'registrar_mortandad',
                          'registrar_paricion', 'anular_actividad') $q$, '12/12');
select pruebas.espera_valor('Z05 _cerrar_si_vacio no la puede llamar la app: solo corre dentro de las funciones',
  $q$ select (not has_function_privilege('authenticated', 'public._cerrar_si_vacio(uuid, date, text)', 'execute')
              and not has_function_privilege('anon', 'public._cerrar_si_vacio(uuid, date, text)', 'execute'))::text $q$, 'true');
select pruebas.espera_filas('Z06 El dueño de la tabla (como corren las funciones) sí escribe en un lote cerrado',
  $q$ update public.lotes set notas = 'dueño' where id = pruebas.id('L2') $q$, 1);

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
  raise exception E'PRUEBAS LOTE CERRADO: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
