-- Campo Digital v2 — Pruebas de la etapa 7a: indicadores reproductivos
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261022000400_indicadores_reproductivos).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ETAPA 7A (INDICADORES): N OK, ...", que deshace todo.
--      El resultado esperado es "12 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
-- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia,
-- X = operador de otro campo.
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
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 Las dos vistas: security_invoker, lectura para authenticated y nada para anon',
  $q$ select count(*) filter (where coalesce('security_invoker=true' = any (c.reloptions), false)
              and has_table_privilege('authenticated', c.oid, 'select') and not has_table_privilege('anon', c.oid, 'select'))::text
      from pg_class c where c.oid in ('public.v_indicadores_aportes'::regclass, 'public.v_indicadores_reproductivos'::regclass) $q$, '2');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Administrador y operador: dos temporadas de cría
-- ════════════════════════════════════════════════════════════════════════════
-- Temporada 2024 (servicios del 1/7/2024 al 30/6/2025):
--   LV: 100 vacas, servicio de 100 y repaso de 40 (cuenta 100); diagnóstico 100 / 85 preñadas.
--       Se divide LV2 (40 vacas) antes de parir. Paren LV (40 vivos, 2 muertos) y LV2 (30): siguen al servicio de LV.
--       Destete de LV (40) y LV2 (30): 70.
--   LX: 20 vacas, servicio de 20; parición de 5. En la temporada 2025, servicio de 20 y parición de 4.
--       Destete de las 9: van a 2024 (la parición más antigua) y es "mixto".
--   Total 2024: entoradas 120, preñadas 85, vivas 75, muertas 2, destetadas 79.
-- Temporada 2025: entoradas 60 (LV) + 20 (LX) = 80; vivas 10 (LV) + 4 (LX) = 14.
-- Sin servicio: LS con una parición de 5 y un servicio anulado.

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

select pruebas.como('u_operador');

-- LV y LV2
select pruebas.guardar('LV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LV Vacas', pruebas.f('2024-06-01'), pruebas.comp('vacas_cria', 100)) $q$);
select pruebas.guardar('s1',  $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LV'), pruebas.f('2024-11-15'), 100, 4) $q$);
select pruebas.guardar('s1b', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LV'), pruebas.f('2025-01-10'), 40, 2) $q$);
select pruebas.preparar('dg1', $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LV'), pruebas.f('2025-03-10'), 100, 85) $q$);
select pruebas.guardar('op_div', $q$ select public.dividir_lote(pruebas.id('LV'), pruebas.f('2025-05-01'),
      jsonb_build_array(jsonb_build_object('nombre', 'LV2 Vacas', 'composicion', pruebas.comp('vacas_cria', 40)))) $q$);
select pruebas.guardar('LV2', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_div') and v.rol = 'destino' $q$);
select pruebas.guardar('pa_lv2', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LV2'),
      p_fecha => pruebas.f('2025-09-01'), p_lineas => pruebas.comp('sin_sexar', 30), p_lote_cria_id => pruebas.id('LV2')) $q$);
select pruebas.preparar('pa_lv', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LV'),
      p_fecha => pruebas.f('2025-09-05'), p_lineas => pruebas.comp('sin_sexar', 40), p_nacidos_muertos => 2, p_lote_cria_id => pruebas.id('LV')) $q$);
select pruebas.preparar('dest_lv', $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.f('2026-04-01'),
      jsonb_build_array(
        jsonb_build_object('lote_id', pruebas.id('LV'),  'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 40))),
        jsonb_build_object('lote_id', pruebas.id('LV2'), 'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 30)))),
      jsonb_build_array(
        jsonb_build_object('nombre', 'Terneros 2025', 'lineas', jsonb_build_array(pruebas.lin('terneros', 35))),
        jsonb_build_object('nombre', 'Terneras 2025', 'lineas', jsonb_build_array(pruebas.lin('terneras', 35))))) $q$);
select pruebas.preparar('s2', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LV'), pruebas.f('2025-11-15'), 60, 3) $q$);
select pruebas.preparar('pa_lv_2', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LV'),
      p_fecha => pruebas.f('2026-09-01'), p_lineas => pruebas.comp('sin_sexar', 10), p_lote_cria_id => pruebas.id('LV')) $q$);

-- LX: caso mixto
select pruebas.guardar('LX', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LX Vacas', pruebas.f('2024-06-01'), pruebas.comp('vacas_cria', 20)) $q$);
select pruebas.preparar('sx1', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LX'), pruebas.f('2024-11-20'), 20, 1) $q$);
select pruebas.preparar('pax1', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LX'),
      p_fecha => pruebas.f('2025-09-10'), p_lineas => pruebas.comp('sin_sexar', 5), p_lote_cria_id => pruebas.id('LX')) $q$);
select pruebas.preparar('sx2', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LX'), pruebas.f('2025-11-20'), 20, 1) $q$);
select pruebas.preparar('pax2', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LX'),
      p_fecha => pruebas.f('2026-08-10'), p_lineas => pruebas.comp('sin_sexar', 4), p_lote_cria_id => pruebas.id('LX')) $q$);
select pruebas.guardar('dest_lx', $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.f('2026-09-15'),
      jsonb_build_array(jsonb_build_object('lote_id', pruebas.id('LX'), 'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 9)))),
      jsonb_build_array(jsonb_build_object('nombre', 'Destetados LX', 'lineas',
        jsonb_build_array(pruebas.lin('terneros', 5), pruebas.lin('terneras', 4))))) $q$);

-- LS: parición sin servicio; un servicio anulado no cuenta
select pruebas.guardar('LS', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LS Vacas', pruebas.f('2025-01-01'), pruebas.comp('vacas_cria', 10)) $q$);
select pruebas.guardar('s_ls', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LS'), pruebas.f('2025-01-15'), 10, 1) $q$);
select pruebas.preparar('anul_s_ls', $q$ select public.anular_actividad(pruebas.id('s_ls'), 'Era de otro lote') $q$);
select pruebas.preparar('pa_ls', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LS'),
      p_fecha => pruebas.f('2025-10-01'), p_lineas => pruebas.comp('sin_sexar', 5), p_lote_cria_id => pruebas.id('LS')) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Indicadores
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('I01 Temporada 2024: entoradas | diagnosticadas | preñadas | vivas | muertas | destetadas | mixto',
  $q$ select i.entoradas || '|' || i.diagnosticadas || '|' || i.prenadas || '|' || i.nacidas_vivas || '|' || i.nacidas_muertas
          || '|' || i.destetadas || '|' || i.destete_mixto from pruebas.ind(2024) i $q$, '120|100|85|75|2|79|true');
select pruebas.espera_valor('I02 Temporada 2024: % preñez, parición y destete (85, 75 y 79 sobre 120)',
  $q$ select i.pct_prenez || '|' || i.pct_paricion || '|' || i.pct_destete from pruebas.ind(2024) i $q$, '70.8|62.5|65.8');
select pruebas.espera_valor('I03 Temporada 2025: entoradas 80, sin diagnóstico, 14 vivas, sin destete',
  $q$ select i.entoradas || '|' || i.prenadas || '|' || i.nacidas_vivas || '|' || i.destetadas || '|' || i.destete_mixto || '|' || coalesce(i.pct_prenez::text, '0.0')
      from pruebas.ind(2025) i $q$, '80|0|14|0|false|0.0');
select pruebas.espera_valor('I04 Sin servicio registrado: la parición de LS (5), sin entoradas ni %',
  $q$ select i.entoradas || '|' || i.nacidas_vivas || '|' || coalesce(i.pct_paricion::text, 'sin %') from pruebas.ind(null) i $q$, '0|5|sin %');
select pruebas.espera_valor('I05 Repaso: de los dos servicios de LV en 2024 cuenta el de 100',
  $q$ select string_agg(entoradas || ':' || cuenta, ' ' order by entoradas) from public.v_indicadores_aportes
      where actividad_id in (pruebas.id('s1'), pruebas.id('s1b')) $q$, '40:false 100:true');
select pruebas.espera_valor('I06 La parición de LV2 (dividido de LV) sigue el linaje hasta el servicio de LV: temporada 2024',
  $q$ select temporada::text from public.v_indicadores_aportes where actividad_id = pruebas.id('pa_lv2') $q$, '2024');
select pruebas.espera_valor('I07 El servicio anulado de LS no aparece',
  $q$ select count(*)::text from public.v_indicadores_aportes where actividad_id = pruebas.id('s_ls') $q$, '0');
select pruebas.espera_valor('I08 Destete de LX: va a 2024 (la parición más antigua), 9 cabezas, mixto',
  $q$ select temporada || '|' || destetadas || '|' || mixto from public.v_indicadores_aportes where actividad_id = pruebas.id('dest_lx') $q$, '2024|9|true');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Permisos
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_valor('Q01 Consulta ve los indicadores (datos productivos)',
  $q$ select (count(*) > 0)::text from public.v_indicadores_reproductivos where establecimiento_id = pruebas.id('est_a') $q$, 'true');

select pruebas.como('u_ajeno');
select pruebas.espera_valor('X01 Un miembro de otro establecimiento no ve los de Santa Remigia',
  $q$ select count(*)::text from public.v_indicadores_aportes where establecimiento_id = pruebas.id('est_a') $q$, '0');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon no lee los indicadores',
  $q$ select count(*) from public.v_indicadores_reproductivos $q$, '42501');

reset role;

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
  raise exception E'PRUEBAS ETAPA 7A (INDICADORES): % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
