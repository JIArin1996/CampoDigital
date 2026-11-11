-- Campo Digital v2 — Pruebas de la etapa 6a del tablero de Indicadores: medidas nuevas de stock y reproductivos
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261112000100_tablero_medidas_6a).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS MEDIDAS 6A: N OK, ...", que deshace todo.
--      El resultado esperado es "26 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Datos: el set de la sección 10 de contexto/DISENO-INDICADORES-TABLERO.md (stock y reproductivos), con los kg del
-- destete (6.840 de L-Cría y 6.475 de L-Cría-B) y L-Ovejas (200 ovejas de cría desde el 1/7/2026). Aparte, para la
-- categoría de entore "Mixto": L-Mix (ovinos, 30 ovejas de cría y 20 borregas desde el 30/6/2024), servicio el
-- 1/12/2024 (50 encarneradas), diagnóstico el 1/3/2025 (40 preñadas) y venta de las 50 el 1/4/2025: no cambia
-- ningún número del ejercicio 2025/26.
-- UG por nombre: Vacas de cría 1,0; Novillos 0,8; Ovejas de cría 0,15.

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


-- Lectura de las funciones del tablero, en el orden en que vienen: "periodo:etiqueta:valor" separados por "|"
-- (sin las partes vacías; el valor sin ceros de más). Período: el ejercicio 2025/26.
create function pruebas.tst(p_medida text, p_abrir text, p_tiempo text, p_filtros jsonb default '{}') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text), '|' order by r.n)
  from public.tablero_stock(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, '2025-07-01', '2026-06-30', p_filtros)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
-- Igual, para reproductivos, con numerador y denominador: "periodo:etiqueta:valor:numerador:denominador"
create function pruebas.trep(p_medida text, p_abrir text, p_tiempo text, p_filtros jsonb default '{}') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_reproductivos(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, '2025-07-01', '2026-06-30', p_filtros)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
-- Un tablero de prueba: p_paginas páginas con p_tarjetas tarjetas cada una
create function pruebas.tablero(p_paginas int, p_tarjetas int) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('nombre', 'Página ' || p, 'tarjetas',
           (select coalesce(jsonb_agg(jsonb_build_object('titulo', 'Tarjeta ' || t, 'definicion', jsonb_build_object('fuente', 'stock', 'medida', 'stock'),
                                                         'x', 0, 'y', (t - 1) * 2, 'w', 6, 'h', 2) order by t), '[]'::jsonb)
            from generate_series(1, p_tarjetas) t)) order by p), '[]'::jsonb)
  from generate_series(1, p_paginas) p
$$;
create function pruebas.cuenta_tablero() returns text language sql stable as $$
  select (select count(*) from public.tablero_paginas where establecimiento_id = pruebas.id('est_a')) || '|'
      || (select count(*) from public.tablero_tarjetas where establecimiento_id = pruebas.id('est_a'))
$$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- Lectura con numerador y denominador: "periodo:etiqueta:valor:numerador:denominador"
create function pruebas.tstn(p_medida text, p_abrir text, p_tiempo text, p_desde date default '2025-07-01', p_hasta date default '2026-06-30',
                             p_filtros jsonb default '{}') returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_stock(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, p_desde, p_hasta, p_filtros)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;
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
select pruebas.guardar('ovinos',     $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Ovinos' $q$);
select pruebas.guardar('sin_sexar',  $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros/as' $q$);
select pruebas.guardar('terneros',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneros' $q$);
select pruebas.guardar('terneras',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Terneras' $q$);
select pruebas.guardar('vacas_cria', $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Vacas de cría' $q$);
select pruebas.guardar('novillos',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('vacunos') and nombre = 'Novillos' $q$);
select pruebas.guardar('ovejas',     $q$ select id from public.categorias_animales where especie_id = pruebas.id('ovinos') and nombre = 'Ovejas de cría' $q$);
select pruebas.guardar('borregas',   $q$ select id from public.categorias_animales where especie_id = pruebas.id('ovinos') and nombre = 'Borregas' $q$);

select pruebas.como('u_operador');
select pruebas.guardar('LC',  $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Cría', pruebas.f('2025-06-30'), pruebas.comp('vacas_cria', 100)) $q$);
select pruebas.guardar('LN1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Nov1', pruebas.f('2025-06-30'), pruebas.comp('novillos', 100)) $q$);
select pruebas.guardar('LN2', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Nov2', pruebas.f('2025-06-30'), pruebas.comp('novillos', 50)) $q$);
select pruebas.preparar('venta', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LN1'), p_fecha => pruebas.f('2025-10-01'),
      p_lineas => pruebas.comp('novillos', 30), p_modalidad => 'remate') $q$);
select pruebas.preparar('compra', $q$ select public.registrar_compra(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'),
      p_fecha => pruebas.f('2025-10-15'), p_lineas => pruebas.comp('novillos', 20), p_modalidad => 'productor', p_lote_id => pruebas.id('LN2')) $q$);
select pruebas.guardar('op_union', $q$ select public.unir_lotes(array[pruebas.id('LN1'), pruebas.id('LN2')], pruebas.f('2026-02-01'), null,
      jsonb_build_object('nombre', 'L-Nov3')) $q$);
select pruebas.guardar('LN3', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_union') and v.rol = 'destino' $q$);
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
        jsonb_build_object('lote_id', pruebas.id('LC'),  'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 38)), 'peso_vivo_total_kg', 6840),
        jsonb_build_object('lote_id', pruebas.id('LCB'), 'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 37)), 'peso_vivo_total_kg', 6475)),
      jsonb_build_array(jsonb_build_object('nombre', 'Destete 2026', 'lineas',
        jsonb_build_array(pruebas.lin('terneros', 40), pruebas.lin('terneras', 35))))) $q$);
select pruebas.guardar('LD', $q$ select al.lote_id from public.actividad_lotes al where al.actividad_id = pruebas.id('dest') and al.rol = 'destino' $q$);

select pruebas.guardar('LOV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('ovinos'), 'L-Ovejas', pruebas.f('2026-07-01'), pruebas.comp('ovejas', 200)) $q$);

-- L-Mix: ovinos de dos categorías con rol (Mixto), todo antes del ejercicio 2025/26
select pruebas.guardar('LMX', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('ovinos'), 'L-Mix', pruebas.f('2024-06-30'),
      jsonb_build_array(pruebas.lin('ovejas', 30), pruebas.lin('borregas', 20))) $q$);
select pruebas.preparar('serv_mx', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LMX'), pruebas.f('2024-12-01'), 50, 2) $q$);
select pruebas.preparar('diag_mx', $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LMX'), pruebas.f('2025-03-01'), 50, 40) $q$);
select pruebas.preparar('venta_mx', $q$ select public.registrar_venta(p_id => gen_random_uuid(), p_lote_id => pruebas.id('LMX'), p_fecha => pruebas.f('2025-04-01'),
      p_lineas => jsonb_build_array(pruebas.lin('ovejas', 30), pruebas.lin('borregas', 20)), p_modalidad => 'remate') $q$);


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Stock (ejercicio 2025/26)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_valor('S01 Stock al cierre sigue en 238 (L-Mix y L-Ovejas no cambian el ejercicio)',
  $q$ select pruebas.tst('stock', null, 'total') $q$, '238');
select pruebas.espera_valor('S02 UG al cierre: 100 × 1,0 + 138 × 0,8 = 210,4',
  $q$ select pruebas.tst('ug', null, 'total') $q$, '210.4');
select pruebas.espera_valor('S03 UG al cierre por categoría',
  $q$ select pruebas.tst('ug', 'categoria', 'total') $q$, 'Novillos:110.4|Vacas de cría:100');
select pruebas.espera_valor('S04 Stock promedio: (100 × 365 + 51.586) / 365 = 241,33 (cabezas-día / días)',
  $q$ select pruebas.tstn('stock_promedio', null, 'total') $q$, '241.33:88086:365');
select pruebas.espera_valor('S05 UG promedio: 100 + 51.586 × 0,8 / 365 = 213,07',
  $q$ select pruebas.tstn('ug_promedio', null, 'total') $q$, '213.07:77768.8:365');
select pruebas.espera_valor('S06 UG promedio por mes: jul 220; oct 204,77; abr 211,15 (y el ejercicio, Σ UG-día / días)',
  $q$ select string_agg(r.periodo || ':' || trim_scale(r.valor)::text, '|' order by r.periodo)
      from public.tablero_stock(pruebas.id('est_a'), 'ug_promedio', null, 'mes', '2025-07-01', '2026-06-30') r
      where r.periodo in ('2025-07', '2025-10', '2026-04') $q$, '2025-07:220|2025-10:204.77|2026-04:211.15');
select pruebas.espera_valor('S07 Stock promedio de novillos por lote (L-Nov1 hasta la unión, L-Nov2 y L-Nov3 desde ella)',
  $q$ select pruebas.tstn('stock_promedio', 'lote', 'total', p_filtros => jsonb_build_object('categoria_ids', jsonb_build_array(pruebas.id('novillos')))) $q$,
  'L-Nov3:57.11:20846:365|L-Nov1:48.79:17810:365|L-Nov2:35.42:12930:365');
select pruebas.espera_valor('S08 Tasa de extracción: 30 vendidos / 250 al inicio = 12 %',
  $q$ select pruebas.tstn('pct_extraccion', null, 'ejercicio') $q$, '2025/26:12:30:250');
select pruebas.espera_error('S09 Extracción por mes (no se puede)',
  $q$ select * from public.tablero_stock(pruebas.id('est_a'), 'pct_extraccion', null, 'mes', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_valor('S10 % vacas de cría al cierre: 100 / 238 = 42,02 %',
  $q$ select pruebas.tstn('pct_vacas_cria', null, 'total') $q$, '42.02:100:238');
select pruebas.espera_valor('S11 % vacas de cría por lote',
  $q$ select pruebas.tst('pct_vacas_cria', 'lote', 'total') $q$, 'L-Cría:100|L-Nov3:0');
select pruebas.espera_error('S12 % vacas de cría por categoría (no se puede)',
  $q$ select * from public.tablero_stock(pruebas.id('est_a'), 'pct_vacas_cria', 'categoria', 'total', '2025-07-01', '2026-06-30') $q$, '22023');
select pruebas.espera_valor('S13 Relación lanar/vacuno al 31/7/2026: 200 / 238 = 0,84',
  $q$ select pruebas.tstn('lanar_vacuno', null, 'total', '2026-07-01', '2026-07-31') $q$, '0.84:200:238');
select pruebas.espera_valor('S14 En UG: 200 × 0,15 / 210,4 = 0,14',
  $q$ select pruebas.tstn('lanar_vacuno_ug', null, 'total', '2026-07-01', '2026-07-31') $q$, '0.14:30:210.4');
select pruebas.espera_valor('S15 La relación no se filtra por especie (compara especies)',
  $q$ select pruebas.tstn('lanar_vacuno', null, 'total', '2026-07-01', '2026-07-31', jsonb_build_object('especie_ids', jsonb_build_array(pruebas.id('vacunos')))) $q$,
  '0.84:200:238');
select pruebas.espera_valor('S16 % vacas de cría al 31/7/2026 sin abrir: (100 vacas + 200 ovejas) / 438 = 68,49 %, mezcla especies y avisa',
  $q$ select trim_scale(r.valor)::text || ' ' || (r.avisos ->> 'varias_especies')
      from public.tablero_stock(pruebas.id('est_a'), 'pct_vacas_cria', null, 'total', '2026-07-01', '2026-07-31') r $q$, '68.49 true');

-- Una categoría sin UG con animales: no suma y avisa
select pruebas.como('u_admin');
select pruebas.guardar('bueyes', $q$ insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden)
      values (pruebas.id('est_a'), pruebas.id('vacunos'), 'Bueyes', 98) returning id $q$);
select pruebas.guardar('LBU', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Bueyes', pruebas.f('2026-06-01'), pruebas.comp('bueyes', 4)) $q$);
select pruebas.como('u_consulta');
select pruebas.espera_valor('S17 Bueyes sin UG: la UG al cierre sigue en 210,4 y avisa',
  $q$ select trim_scale(r.valor)::text || ' ' || (r.avisos -> 'categorias_sin_ug')::text
      from public.tablero_stock(pruebas.id('est_a'), 'ug', null, 'total', '2025-07-01', '2026-06-30') r $q$, '210.4 ["Bueyes"]');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Reproductivos (temporada 2025/26)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('R01 Pérdidas preñez → destete: (90 − 75) / 90 = 16,7 %',
  $q$ select pruebas.trep('pct_perdidas', null, 'temporada') $q$, '2025/26:16.7:15:90');
select pruebas.espera_valor('R02 Kg destetados: 6.840 + 6.475 = 13.315',
  $q$ select pruebas.trep('kg_destetados', null, 'temporada') $q$, '2025/26:13315');
select pruebas.espera_valor('R03 Kg destetados por vaca entorada: 13.315 / 100 = 133,2',
  $q$ select pruebas.trep('kg_destetados_vaca', null, 'temporada') $q$, '2025/26:133.2:13315:100');
select pruebas.espera_valor('R04 Peso promedio al destete: 13.315 / 75 = 177,5',
  $q$ select pruebas.trep('peso_destete', null, 'temporada') $q$, '2025/26:177.5:13315:75');
select pruebas.espera_valor('R05 % preñez por categoría de entore: Vacas de cría 90 %',
  $q$ select pruebas.trep('pct_prenez', 'categoria', 'temporada') $q$, '2025/26:Vacas de cría:90:90:100');
select pruebas.espera_valor('R06 Reposición: 0 vaquillonas / 100 entoradas',
  $q$ select pruebas.trep('pct_reposicion', null, 'temporada') $q$, '2025/26:0:0:100');
select pruebas.espera_valor('R07 Filtro por categoría de entore: Vacas de cría da 90 %; Novillos, nada',
  $q$ select pruebas.trep('pct_prenez', null, 'temporada', jsonb_build_object('categoria_ids', jsonb_build_array(pruebas.id('vacas_cria'))))
      || ' / ' || coalesce(pruebas.trep('pct_prenez', null, 'temporada', jsonb_build_object('categoria_ids', jsonb_build_array(pruebas.id('novillos')))), 'nada') $q$,
  '2025/26:90:90:100 / nada');
select pruebas.espera_valor('R08 Lote con ovejas de cría y borregas (2024/25): categoría "Mixto", 40 / 50',
  $q$ select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text, trim_scale(r.denominador)::text), '|')
      from public.tablero_reproductivos(pruebas.id('est_a'), 'pct_prenez', 'categoria', 'temporada', '2024-07-01', '2025-06-30') r $q$,
  '2024/25:Mixto:80:40:50');

-- Editar el destete: L-Cría-B sin peso
select pruebas.como('u_operador');
select pruebas.preparar('edit_dest', $q$ select public.editar_destete(pruebas.id('dest'), pruebas.f('2026-11-01'),
      jsonb_build_array(
        jsonb_build_object('lote_id', pruebas.id('LC'),  'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 38)), 'peso_vivo_total_kg', 6840),
        jsonb_build_object('lote_id', pruebas.id('LCB'), 'lineas', jsonb_build_array(pruebas.lin('sin_sexar', 37)))),
      jsonb_build_array(jsonb_build_object('lote_id', pruebas.id('LD'), 'lineas',
        jsonb_build_array(pruebas.lin('terneros', 40), pruebas.lin('terneras', 35))))) $q$);
select pruebas.como('u_consulta');
select pruebas.espera_valor('R09 Con un origen sin peso: 6.840 / 38 = 180 kg, y avisa 37 destetados sin peso',
  $q$ select trim_scale(r.valor)::text || ' ' || (r.avisos ->> 'destetados_sin_peso')
      from public.tablero_reproductivos(pruebas.id('est_a'), 'peso_destete', null, 'temporada', '2025-07-01', '2026-06-30') r $q$, '180 37');

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
  raise exception E'PRUEBAS MEDIDAS 6A: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
