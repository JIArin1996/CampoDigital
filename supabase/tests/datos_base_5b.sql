-- Campo Digital v2 — Pruebas de la etapa 5b del tablero de Indicadores: datos base del catálogo del productor
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261111000200_datos_base_5b).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS DATOS BASE 5B: N OK, ...", que deshace todo.
--      El resultado esperado es "15 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
--      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
--
-- Qué prueba: el peso de referencia y el rol de las categorías (permisos, carga por nombre, límites) y el peso
-- opcional de las crías en el destete (por lote de origen, al registrar y al editar). Datos de la sección 10 de
-- contexto/DISENO-INDICADORES-TABLERO.md (L-Cría, parición, división y destete), con fechas fijas.
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


-- Línea de pesada: {categoria_id, cabezas, peso_vivo_total_kg}
create function pruebas.pl(p_cat text, p_cabezas int, p_kg numeric) returns jsonb language sql stable as $$
  select jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas, 'peso_vivo_total_kg', p_kg)
$$;
create function pruebas.pesar(p_lote text, p_fecha text, p_cabezas int, p_kg numeric) returns uuid language sql as $$
  select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id(p_lote), p_fecha => p_fecha::date,
                                 p_lineas => jsonb_build_array(pruebas.pl('novillos', p_cabezas, p_kg)))
$$;
-- Lectura de tablero_pesadas en el ejercicio 2025/26: "periodo:etiqueta:valor:numerador:denominador" separados por "|"
-- (sin las partes vacías; los números sin ceros de más). p_sin_ceros: saca las filas en 0.
create function pruebas.tpes(p_medida text, p_abrir text, p_tiempo text, p_filtros jsonb default '{}', p_opciones jsonb default '{}',
                             p_sin_ceros boolean default false) returns text
language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_pesadas(pruebas.id('est_a'), p_medida, p_abrir, p_tiempo, '2025-07-01', '2026-06-30', p_filtros, p_opciones)
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
  where not (p_sin_ceros and coalesce(r.valor, 0) = 0)
$$;

-- Pesada con varias líneas: p_lineas = jsonb_build_array(pruebas.pl(...), ...)
create function pruebas.pesarl(p_lote text, p_fecha text, p_lineas jsonb) returns uuid language sql as $$
  select public.registrar_pesada(p_id => gen_random_uuid(), p_lote_id => pruebas.id(p_lote), p_fecha => p_fecha::date, p_lineas => p_lineas)
$$;
-- Lo mismo que tpes, en el ejercicio 2026/27
create function pruebas.tpes27(p_medida text, p_abrir text) returns text language sql stable as $$
  select string_agg(concat_ws(':', r.periodo, r.etiqueta, trim_scale(r.valor)::text, trim_scale(r.numerador)::text,
                              trim_scale(r.denominador)::text), '|' order by r.n)
  from public.tablero_pesadas(pruebas.id('est_a'), p_medida, p_abrir, 'total', '2026-07-01', '2027-06-30')
       with ordinality r(periodo, clave, etiqueta, valor, numerador, denominador, avisos, n)
$$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- Peso de un origen del destete (texto, 'sin peso' si no tiene)
create function pruebas.peso_origen(p_actividad text, p_lote text) returns text language sql stable as $$
  select coalesce(trim_scale(al.peso_vivo_total_kg)::text, 'sin peso')
  from public.actividad_lotes al
  where al.actividad_id = pruebas.id(p_actividad) and al.lote_id = pruebas.id(p_lote) and al.rol = 'origen'
$$;
-- Origen del destete: {"lote_id", "lineas": [...], "peso_vivo_total_kg"?}
create function pruebas.origen(p_lote text, p_cabezas int, p_kg jsonb default null) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object('lote_id', pruebas.id(p_lote), 'lineas', jsonb_build_array(pruebas.lin('sin_sexar', p_cabezas)),
                                              'peso_vivo_total_kg', p_kg))
$$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Base (postgres)
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('B01 peso_referencia_kg y rol: authenticated los escribe (las políticas los limitan al administrador); el trigger sin execute',
  $q$ select (has_column_privilege('authenticated', 'public.categorias_animales', 'peso_referencia_kg', 'update')
          and has_column_privilege('authenticated', 'public.categorias_animales', 'peso_referencia_kg', 'insert')
          and has_column_privilege('authenticated', 'public.categorias_animales', 'rol', 'update')
          and has_column_privilege('authenticated', 'public.categorias_animales', 'rol', 'insert')
          and not has_function_privilege('authenticated', 'public.completar_ug_categoria()', 'execute')
          and not has_function_privilege('authenticated', 'public._cargar_destete(uuid, uuid, date, uuid, uuid[], jsonb, jsonb, boolean)', 'execute'))::text $q$, 'true');
select pruebas.espera_valor('B02 actividad_lotes.peso_vivo_total_kg: nadie la escribe directo (solo las funciones)',
  $q$ select (not has_column_privilege('authenticated', 'public.actividad_lotes', 'peso_vivo_total_kg', 'update')
          and not has_column_privilege('authenticated', 'public.actividad_lotes', 'peso_vivo_total_kg', 'insert')
          and has_column_privilege('authenticated', 'public.actividad_lotes', 'peso_vivo_total_kg', 'select'))::text $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Datos
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

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Categorías: rol por nombre y peso de referencia
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.espera_valor('C01 Rol cargado por nombre al crear el establecimiento: cría y reposición en vacunos y ovinos; el resto sin rol',
  $q$ select string_agg(c.nombre || ':' || coalesce(c.rol, '-'), '|' order by c.nombre)
      from public.categorias_animales c
      where c.especie_id in (pruebas.id('vacunos'), pruebas.id('ovinos'))
        and c.nombre in ('Vacas de cría', 'Vaquillonas', 'Novillos', 'Ovejas de cría', 'Borregas', 'Carneros') $q$,
  'Borregas:reposicion|Carneros:-|Novillos:-|Ovejas de cría:cria|Vacas de cría:cria|Vaquillonas:reposicion');
select pruebas.espera_valor('C02 Sin peso de referencia por defecto (no se inventa)',
  $q$ select count(*)::text from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and peso_referencia_kg is not null $q$, '0');
select pruebas.espera_valor('C03 Una categoría nueva toma el rol de su nombre (sin importar mayúsculas ni tildes); una que no está, sin rol',
  $q$ with n as (insert into public.categorias_animales (establecimiento_id, especie_id, nombre, orden)
                 values (pruebas.id('est_a'), pruebas.id('vacunos'), 'VACAS DE CRIA 2', 97), (pruebas.id('est_a'), pruebas.id('ovinos'), 'yeguas', 96)
                 returning nombre, rol)
      select string_agg(nombre || ':' || coalesce(rol, '-'), '|' order by nombre) from n $q$, 'VACAS DE CRIA 2:-|yeguas:cria');
select pruebas.espera_filas('C04 El administrador carga el peso de referencia (450 kg) y cambia el rol',
  $q$ update public.categorias_animales set peso_referencia_kg = 450, rol = 'cria' where id = pruebas.id('vacas_cria') $q$, 1);
select pruebas.espera_error('C05 Peso de referencia 0: no',
  $q$ update public.categorias_animales set peso_referencia_kg = 0 where id = pruebas.id('novillos') $q$, '23514');
select pruebas.espera_error('C06 Rol que no existe: no',
  $q$ update public.categorias_animales set rol = 'invernada' where id = pruebas.id('novillos') $q$, '23514');
select pruebas.como('u_operador');
select pruebas.espera_filas('C07 El operador no cambia el peso de referencia (0 filas: la política es del administrador)',
  $q$ update public.categorias_animales set peso_referencia_kg = 380 where id = pruebas.id('novillos') $q$, 0);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Peso de las crías en el destete
-- ════════════════════════════════════════════════════════════════════════════
--   30/6/2025 alta de L-Cría (100 vacas de cría); 15/9/2026 parición: 80 terneros/as al pie; 1/10/2026 división:
--   L-Cría-B con 50 vacas y 40 terneros/as; 1/11/2026 destete de 38 de L-Cría y 37 de L-Cría-B.

select pruebas.guardar('LC', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L-Cría', pruebas.f('2025-06-30'), pruebas.comp('vacas_cria', 100)) $q$);
select pruebas.preparar('serv', $q$ select public.registrar_servicio(gen_random_uuid(), pruebas.id('LC'), pruebas.f('2025-12-01'), 100, 4) $q$);
select pruebas.preparar('diag', $q$ select public.registrar_diagnostico(gen_random_uuid(), pruebas.id('LC'), pruebas.f('2026-03-01'), 100, 90) $q$);
select pruebas.preparar('pari', $q$ select public.registrar_paricion(p_id => gen_random_uuid(), p_lote_madres_id => pruebas.id('LC'),
      p_fecha => pruebas.f('2026-09-15'), p_lineas => pruebas.comp('sin_sexar', 80), p_nacidos_muertos => 3, p_lote_cria_id => pruebas.id('LC')) $q$);
select pruebas.guardar('op_div', $q$ select public.dividir_lote(pruebas.id('LC'), pruebas.f('2026-10-01'),
      jsonb_build_array(jsonb_build_object('nombre', 'L-Cría-B', 'composicion',
        jsonb_build_array(pruebas.lin('vacas_cria', 50), pruebas.lin('sin_sexar', 40))))) $q$);
select pruebas.guardar('LCB', $q$ select v.lote_id from public.operacion_lote_vinculos v where v.operacion_id = pruebas.id('op_div') and v.rol = 'destino' $q$);

select pruebas.espera_error('D01 Peso de las crías 0: no',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.f('2026-11-01'),
      jsonb_build_array(pruebas.origen('LC', 38, '0'::jsonb)),
      jsonb_build_array(jsonb_build_object('nombre', 'Destete X', 'lineas', jsonb_build_array(pruebas.lin('terneros', 20), pruebas.lin('terneras', 18))))) $q$, '22023');
select pruebas.espera_error('D02 Peso que no es un número: no',
  $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.f('2026-11-01'),
      jsonb_build_array(pruebas.origen('LC', 38, '"mucho"'::jsonb)),
      jsonb_build_array(jsonb_build_object('nombre', 'Destete X', 'lineas', jsonb_build_array(pruebas.lin('terneros', 20), pruebas.lin('terneras', 18))))) $q$, '22023');

-- El destete, con peso solo en L-Cría (el de L-Cría-B queda sin peso: es opcional)
select pruebas.guardar('dest', $q$ select public.registrar_destete(gen_random_uuid(), pruebas.id('est_a'), pruebas.f('2026-11-01'),
      jsonb_build_array(pruebas.origen('LC', 38, '6840'::jsonb), pruebas.origen('LCB', 37)),
      jsonb_build_array(jsonb_build_object('nombre', 'Destete 2026', 'lineas',
        jsonb_build_array(pruebas.lin('terneros', 40), pruebas.lin('terneras', 35))))) $q$);
select pruebas.guardar('LD', $q$ select al.lote_id from public.actividad_lotes al where al.actividad_id = pruebas.id('dest') and al.rol = 'destino' $q$);

select pruebas.como('u_consulta');
select pruebas.espera_valor('D03 Peso por origen: L-Cría 6.840 kg; L-Cría-B sin peso',
  $q$ select pruebas.peso_origen('dest', 'LC') || '|' || pruebas.peso_origen('dest', 'LCB') $q$, '6840|sin peso');
select pruebas.espera_valor('D04 El destino no lleva peso (el peso es de lo que sale de cada origen)',
  $q$ select coalesce(trim_scale(al.peso_vivo_total_kg)::text, 'sin peso') from public.actividad_lotes al
      where al.actividad_id = pruebas.id('dest') and al.rol = 'destino' $q$, 'sin peso');

-- Editar: se agrega el peso de L-Cría-B (6.475 kg) y se corrige el de L-Cría (6.900 kg)
select pruebas.como('u_operador');
select pruebas.espera_ok('D05 Editar el destete cambia los pesos',
  $q$ select public.editar_destete(pruebas.id('dest'), pruebas.f('2026-11-01'),
      jsonb_build_array(pruebas.origen('LC', 38, '6900'::jsonb), pruebas.origen('LCB', 37, '6475'::jsonb)),
      jsonb_build_array(jsonb_build_object('lote_id', pruebas.id('LD'), 'lineas', jsonb_build_array(pruebas.lin('terneros', 40), pruebas.lin('terneras', 35))))) $q$);
select pruebas.espera_valor('D06 Después de editar: L-Cría 6.900 y L-Cría-B 6.475',
  $q$ select pruebas.peso_origen('dest', 'LC') || '|' || pruebas.peso_origen('dest', 'LCB') $q$, '6900|6475');

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
  raise exception E'PRUEBAS DATOS BASE 5B: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
