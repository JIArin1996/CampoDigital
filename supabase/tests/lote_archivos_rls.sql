-- Campo Digital v2 — Pruebas de archivos del lote
--
-- CÓMO CORRERLO
--   1. Con todas las migraciones aplicadas (hasta 20261020000300_archivo_permitido).
--   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo.
--   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ARCHIVOS DE LOTE: N OK, ...", que deshace todo
--      (también los objetos de Storage simulados).
--      El resultado esperado es "64 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
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


-- Subida simulada: lo que hace Storage al subir (insert en storage.objects con la sesión del usuario,
-- así se prueban las políticas del bucket). metadata como la guarda Storage: size y mimetype.
create function pruebas.subir(p_ruta text, p_mime text, p_tamano bigint) returns void language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, metadata)
  values ('lote-archivos', p_ruta, jsonb_build_object('size', p_tamano, 'mimetype', p_mime));
end $$;

-- Ruta {establecimiento}/{archivo} a partir de dos claves guardadas
create function pruebas.ruta(p_est text, p_archivo text) returns text language sql stable as $$
  select pruebas.id(p_est)::text || '/' || pruebas.id(p_archivo)::text
$$;

-- Cuenta filas; si el rol no tiene permiso de lectura, cuenta 0 (para "no ve nada")
create function pruebas.contar(p_sql text) returns bigint language plpgsql as $$
declare
  v bigint;
begin
  execute p_sql into v;
  return v;
exception when insufficient_privilege then
  return 0;
end $$;

-- Una escritura que tiene que quedar bloqueada: vale tanto "0 filas" (RLS sin política) como
-- "sin permiso" (42501: Supabase impide el borrado directo en storage.objects con un trigger)
create function pruebas.bloqueado(p_sql text) returns text language plpgsql as $$
declare
  v_n int;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return case when v_n = 0 then 'bloqueado' else 'afectó ' || v_n || ' filas' end;
exception when insufficient_privilege then
  return 'bloqueado';
end $$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- Ids de los archivos (los genera la app; acá, la prueba)
select pruebas.guardar(k, 'select gen_random_uuid()')
from unnest(array['f1', 'f2', 'f3', 'f4', 'f5', 'f_exe', 'f_html', 'f_svg', 'f_png_svg', 'f_sinext', 'f_grande', 'f_20mb',
                  'f_nosubido', 'f_x', 'f_q', 'f_xlsx_pdf', 'f_csv']) k;

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
select pruebas.guardar('vacunos',    $q$ select id from public.especies where establecimiento_id = pruebas.id('est_a') and nombre = 'Vacunos' $q$);
select pruebas.guardar('terneros',   $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_a') and nombre = 'Terneros' $q$);
select pruebas.guardar('vacunos_x',  $q$ select id from public.especies where establecimiento_id = pruebas.id('est_x') and nombre = 'Vacunos' $q$);
select pruebas.guardar('terneros_x', $q$ select id from public.categorias_animales where establecimiento_id = pruebas.id('est_x') and nombre = 'Terneros' $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Operador: lotes, subida y adjuntar
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

select pruebas.guardar('L1', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'L1', pruebas.d(20), pruebas.comp('terneros', 10)) $q$);
select pruebas.guardar('LA', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LA', pruebas.d(20), pruebas.comp('terneros', 4)) $q$);
select pruebas.guardar('LB', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LB', pruebas.d(20), pruebas.comp('terneros', 4)) $q$);
-- LZ: cerrado (se divide entero)
select pruebas.guardar('LZ', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LZ', pruebas.d(20), pruebas.comp('terneros', 2)) $q$);
select pruebas.preparar('LZ', $q$ select public.dividir_lote(pruebas.id('LZ'), pruebas.d(10),
      jsonb_build_array(jsonb_build_object('nombre', 'LZ2', 'composicion', pruebas.comp('terneros', 2)))) $q$);

-- Subidas válidas
select pruebas.preparar('f1', $q$ select pruebas.subir(pruebas.ruta('est_a', 'f1'), 'application/pdf', 1000) $q$);
select pruebas.preparar('f2', $q$ select pruebas.subir(pruebas.ruta('est_a', 'f2'), 'application/pdf', 2000) $q$);
select pruebas.preparar('f3', $q$ select pruebas.subir(pruebas.ruta('est_a', 'f3'), 'image/jpeg', 3000) $q$);
select pruebas.preparar('f4', $q$ select pruebas.subir(pruebas.ruta('est_a', 'f4'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 4000) $q$);
select pruebas.preparar('f5', $q$ select pruebas.subir(pruebas.ruta('est_a', 'f5'), 'image/heic', 5000) $q$);

select pruebas.espera_valor('S01 El operador adjunta un PDF de trazabilidad a L1',
  $q$ select (public.adjuntar_archivo_lote(pruebas.id('f1'), pruebas.id('L1'), 'Guía DICOSE.pdf', 'trazabilidad') = pruebas.id('f1'))::text $q$, 'true');
select pruebas.espera_valor('S01b Tamaño y tipo salen del objeto de Storage; nombre original y tipo guardados',
  $q$ select tamano_bytes || '|' || tipo_mime || '|' || tipo || '|' || nombre from public.archivos where id = pruebas.id('f1') $q$,
  '1000|application/pdf|trazabilidad|Guía DICOSE.pdf');
select pruebas.espera_ok('S02 Un segundo archivo de trazabilidad en el mismo lote',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f2'), pruebas.id('L1'), 'Planilla.pdf', 'trazabilidad') $q$);
select pruebas.espera_ok('S03 Una foto (otro) en el mismo lote',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f3'), pruebas.id('L1'), 'Foto caravanas.JPG', 'otro') $q$);
select pruebas.espera_valor('S04 L1 tiene 3 archivos visibles, 2 de trazabilidad; la ruta es {establecimiento}/{id}',
  $q$ select count(*) || '|' || count(*) filter (where a.tipo = 'trazabilidad') || '|' || bool_and(a.ruta = a.establecimiento_id || '/' || a.id)
      from public.lote_archivos la join public.archivos a on a.id = la.archivo_id
      where la.lote_id = pruebas.id('L1') and not la.oculto $q$, '3|2|true');
select pruebas.espera_valor('S05 Adjuntar de nuevo el mismo archivo (reintento) devuelve el mismo id',
  $q$ select (public.adjuntar_archivo_lote(pruebas.id('f1'), pruebas.id('L1'), 'Guía DICOSE.pdf', 'trazabilidad') = pruebas.id('f1'))::text $q$, 'true');
select pruebas.espera_valor('S05b ...y no duplica ni el archivo ni el vínculo',
  $q$ select (select count(*) from public.lote_archivos where archivo_id = pruebas.id('f1'))
          || '|' || (select count(*) from public.archivos where id = pruebas.id('f1')) $q$, '1|1');

-- Formatos y tamaños no permitidos (la subida simulada entra; la función los rechaza)
select pruebas.preparar('f_exe',     $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_exe'), 'application/pdf', 100) $q$);
select pruebas.preparar('f_html',    $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_html'), 'text/html', 100) $q$);
select pruebas.preparar('f_svg',     $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_svg'), 'image/svg+xml', 100) $q$);
select pruebas.preparar('f_png_svg', $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_png_svg'), 'image/svg+xml', 100) $q$);
select pruebas.preparar('f_sinext',  $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_sinext'), 'application/pdf', 100) $q$);
select pruebas.preparar('f_grande',  $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_grande'), 'application/pdf', 20971521) $q$);
select pruebas.preparar('f_20mb',    $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_20mb'), 'application/pdf', 20971520) $q$);

select pruebas.espera_error('E01 Ejecutable (.exe), aunque diga ser PDF',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_exe'), pruebas.id('L1'), 'programa.exe') $q$, '22023');
select pruebas.espera_error('E02 HTML',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_html'), pruebas.id('L1'), 'pagina.html') $q$, '22023');
select pruebas.espera_error('E03 SVG',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_svg'), pruebas.id('L1'), 'logo.svg') $q$, '22023');
select pruebas.espera_error('E04 Nombre .png pero contenido SVG (tipo MIME no permitido)',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_png_svg'), pruebas.id('L1'), 'imagen.png') $q$, '22023');
select pruebas.espera_error('E05 Sin extensión',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_sinext'), pruebas.id('L1'), 'documento') $q$, '22023');
select pruebas.espera_error('E06 Más de 20 MB',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_grande'), pruebas.id('L1'), 'grande.pdf') $q$, '22023');
select pruebas.espera_ok('E07 Exactamente 20 MB: se acepta',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_20mb'), pruebas.id('LA'), 'justo.pdf') $q$);
select pruebas.espera_error('E08 Archivo que no se subió a Storage',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_nosubido'), pruebas.id('L1'), 'fantasma.pdf') $q$, '22023');
select pruebas.espera_error('E09 Tipo distinto de trazabilidad u otro',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f4'), pruebas.id('L1'), 'planilla.xlsx', 'factura') $q$, '22023');
select pruebas.espera_error('E10 Adjuntar a un lote cerrado (solo lectura)',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f4'), pruebas.id('LZ'), 'planilla.xlsx') $q$, '22023');

-- Coherencia entre extensión y tipo MIME (20261020000300)
select pruebas.preparar('f_xlsx_pdf', $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_xlsx_pdf'), 'application/pdf', 100) $q$);
select pruebas.preparar('f_csv',      $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_csv'), 'application/vnd.ms-excel', 100) $q$);
select pruebas.guardar('LCSV', $q$ select public.crear_lote(pruebas.id('est_a'), pruebas.id('vacunos'), 'LCSV', pruebas.d(20), pruebas.comp('terneros', 1)) $q$);
select pruebas.espera_error('E11 Extensión y tipo que no corresponden (.xlsx con contenido PDF)',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_xlsx_pdf'), pruebas.id('L1'), 'planilla.xlsx') $q$, '22023');
select pruebas.espera_ok('E12 CSV como lo manda Windows (application/vnd.ms-excel): se acepta',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_csv'), pruebas.id('LCSV'), 'caravanas.csv') $q$);

-- Políticas de Storage y escrituras directas
select pruebas.espera_error('ST01 Subir a la carpeta de otro establecimiento',
  $q$ select pruebas.subir(pruebas.id('est_x') || '/' || gen_random_uuid(), 'application/pdf', 100) $q$, '42501');
select pruebas.espera_error('ST02 Subir con subcarpetas',
  $q$ select pruebas.subir(pruebas.id('est_a') || '/sub/' || gen_random_uuid(), 'application/pdf', 100) $q$, '42501');
select pruebas.espera_error('ST03 Subir con el nombre original en la ruta (no es un id)',
  $q$ select pruebas.subir(pruebas.id('est_a') || '/guia.pdf', 'application/pdf', 100) $q$, '42501');
select pruebas.espera_error('ST04 Subir sin carpeta de establecimiento',
  $q$ select pruebas.subir(gen_random_uuid()::text, 'application/pdf', 100) $q$, '42501');
select pruebas.espera_filas('ST05 Modificar un objeto subido (sin política de update: 0 filas)',
  $q$ update storage.objects set metadata = '{}' where bucket_id = 'lote-archivos' and name = pruebas.ruta('est_a', 'f1') $q$, 0);
select pruebas.espera_valor('ST06 Borrar un objeto subido: bloqueado (0 filas o 42501)',
  $q$ select pruebas.bloqueado($s$ delete from storage.objects where bucket_id = 'lote-archivos' and name = $s$
          || quote_literal(pruebas.ruta('est_a', 'f1'))) $q$, 'bloqueado');
select pruebas.espera_error('ST07 Insertar directo en archivos',
  $q$ insert into public.archivos (id, establecimiento_id, ruta, nombre, tipo_mime, tamano_bytes, tipo)
      values (gen_random_uuid(), pruebas.id('est_a'), 'x', 'x.pdf', 'application/pdf', 1, 'otro') $q$, '42501');
select pruebas.espera_error('ST08 Ocultar directo un vínculo',
  $q$ update public.lote_archivos set oculto = true where lote_id = pruebas.id('L1') $q$, '42501');

-- Quitar y restaurar: solo el administrador
select pruebas.espera_error('Q01 El operador no puede quitar',
  $q$ select public.quitar_archivo_lote(pruebas.id('L1'), pruebas.id('f3')) $q$, '42501');
select pruebas.espera_error('Q02 El operador no puede restaurar',
  $q$ select public.restaurar_archivo_lote(pruebas.id('L1'), pruebas.id('f3')) $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Administrador: quitar y restaurar
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_admin');

select pruebas.espera_ok('Q03 El administrador quita la foto de L1',
  $q$ select public.quitar_archivo_lote(pruebas.id('L1'), pruebas.id('f3')) $q$);
select pruebas.espera_valor('Q04 Queda oculta con quién y cuándo; el archivo y el objeto de Storage siguen',
  $q$ select la.oculto::text || '|' || (la.ocultado_por = pruebas.id('u_admin'))::text || '|' || (la.ocultado_en is not null)::text
          || '|' || (select count(*) from public.archivos where id = pruebas.id('f3'))
          || '|' || (select count(*) from storage.objects where bucket_id = 'lote-archivos' and name = pruebas.ruta('est_a', 'f3'))
      from public.lote_archivos la where la.lote_id = pruebas.id('L1') and la.archivo_id = pruebas.id('f3') $q$,
  'true|true|true|1|1');
select pruebas.espera_error('Q05 Quitar dos veces',
  $q$ select public.quitar_archivo_lote(pruebas.id('L1'), pruebas.id('f3')) $q$, '22023');
select pruebas.espera_error('Q06 Quitar un archivo que no está en el lote',
  $q$ select public.quitar_archivo_lote(pruebas.id('LB'), pruebas.id('f3')) $q$, '22023');
select pruebas.espera_ok('Q07 Restaurar',
  $q$ select public.restaurar_archivo_lote(pruebas.id('L1'), pruebas.id('f3')) $q$);
select pruebas.espera_valor('Q08 Restaurado: visible otra vez, sin datos de quitado',
  $q$ select la.oculto::text || '|' || coalesce(la.ocultado_por::text, 'sin') from public.lote_archivos la
      where la.lote_id = pruebas.id('L1') and la.archivo_id = pruebas.id('f3') $q$, 'false|sin');
-- Para la herencia: la foto queda quitada de L1 (no se hereda)
select pruebas.preparar('f3', $q$ select public.quitar_archivo_lote(pruebas.id('L1'), pruebas.id('f3')) $q$);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Herencia al dividir y al unir
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_operador');

select pruebas.guardar('op_div', $q$ select public.dividir_lote(pruebas.id('L1'), pruebas.d(5),
      jsonb_build_array(jsonb_build_object('nombre', 'D1', 'composicion', pruebas.comp('terneros', 4)))) $q$);
select pruebas.guardar('D1', $q$ select lote_id from public.operacion_lote_vinculos where operacion_id = pruebas.id('op_div') and rol = 'destino' $q$);
select pruebas.espera_valor('H01 Dividir: D1 hereda los 2 archivos visibles de L1 (no la foto quitada), con el lote de origen',
  $q$ select count(*) || '|' || bool_and(heredado_de_lote_id = pruebas.id('L1') and not oculto)
          || '|' || bool_and(archivo_id in (pruebas.id('f1'), pruebas.id('f2')))
      from public.lote_archivos where lote_id = pruebas.id('D1') $q$, '2|true|true');
select pruebas.espera_valor('H02 L1 conserva sus 3 vínculos (historial); los archivos no se duplican',
  $q$ select (select count(*) from public.lote_archivos where lote_id = pruebas.id('L1')) || '|'
          || (select count(*) from public.archivos where id in (pruebas.id('f1'), pruebas.id('f2'))) $q$, '3|2');

select pruebas.como('u_admin');
select pruebas.espera_ok('H03 Quitar la guía de D1',
  $q$ select public.quitar_archivo_lote(pruebas.id('D1'), pruebas.id('f1')) $q$);
select pruebas.espera_valor('H04 Quitarla de D1 no la quita de L1',
  $q$ select string_agg(case la.lote_id when pruebas.id('L1') then 'L1' else 'D1' end || ':' || la.oculto, ',' order by la.lote_id = pruebas.id('L1'))
      from public.lote_archivos la where la.archivo_id = pruebas.id('f1') $q$, 'D1:true,L1:false');

select pruebas.como('u_operador');
-- El mismo archivo (f4) en LA y LB, y f5 solo en LB
select pruebas.preparar('f4', $q$ select public.adjuntar_archivo_lote(pruebas.id('f4'), pruebas.id('LA'), 'planilla.xlsx', 'trazabilidad') $q$);
select pruebas.espera_ok('H05 El mismo archivo adjunto a otro lote (LB): solo se agrega el vínculo',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f4'), pruebas.id('LB'), 'planilla.xlsx', 'trazabilidad') $q$);
select pruebas.preparar('f5', $q$ select public.adjuntar_archivo_lote(pruebas.id('f5'), pruebas.id('LB'), 'foto.heic', 'otro') $q$);
select pruebas.guardar('op_union', $q$ select public.unir_lotes(array[pruebas.id('LA'), pruebas.id('LB')], pruebas.d(2), null,
      jsonb_build_object('nombre', 'LU')) $q$);
select pruebas.guardar('LU', $q$ select lote_id from public.operacion_lote_vinculos where operacion_id = pruebas.id('op_union') and rol = 'destino' $q$);
select pruebas.espera_valor('H06 Unir: LU recibe f4 una sola vez, f5 y el de 20 MB de LA, todos heredados; 1 de trazabilidad (f4)',
  $q$ select count(*) || '|' || count(distinct la.archivo_id) || '|' || bool_and(la.heredado_de_lote_id in (pruebas.id('LA'), pruebas.id('LB')))
          || '|' || count(*) filter (where a.tipo = 'trazabilidad')
      from public.lote_archivos la join public.archivos a on a.id = la.archivo_id where la.lote_id = pruebas.id('LU') $q$, '3|3|true|1');
select pruebas.espera_valor('H07 LA y LB conservan sus vínculos (y quedaron cerrados por la unión)',
  $q$ select (select count(*) from public.lote_archivos where lote_id = pruebas.id('LA')) || '|'
          || (select count(*) from public.lote_archivos where lote_id = pruebas.id('LB')) || '|'
          || (select string_agg(estado, ',') from public.lotes where id in (pruebas.id('LA'), pruebas.id('LB'))) $q$, '2|2|cerrado,cerrado');

select pruebas.como('u_admin');
select pruebas.espera_error('Q09 Quitar un archivo de un lote cerrado (solo lectura)',
  $q$ select public.quitar_archivo_lote(pruebas.id('LA'), pruebas.id('f4')) $q$, '22023');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Consulta, otro establecimiento y anon
-- ════════════════════════════════════════════════════════════════════════════

select pruebas.como('u_consulta');
select pruebas.espera_valor('C01 Consulta ve los archivos, los vínculos y los objetos de Storage de su establecimiento',
  $q$ select ((select count(*) from public.archivos where establecimiento_id = pruebas.id('est_a')) > 0
          and (select count(*) from public.lote_archivos where lote_id = pruebas.id('L1')) = 3
          and (select count(*) from storage.objects where bucket_id = 'lote-archivos' and name = pruebas.ruta('est_a', 'f1')) = 1)::text $q$, 'true');
select pruebas.espera_error('C02 Consulta no adjunta',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f2'), pruebas.id('LB'), 'Planilla.pdf') $q$, '42501');
select pruebas.espera_error('C03 Consulta no sube a Storage',
  $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_q'), 'application/pdf', 100) $q$, '42501');

select pruebas.como('u_ajeno');
select pruebas.guardar('LX', $q$ select public.crear_lote(pruebas.id('est_x'), pruebas.id('vacunos_x'), 'LX', pruebas.d(10), pruebas.comp('terneros_x', 3)) $q$);
select pruebas.preparar('f_x', $q$ select pruebas.subir(pruebas.ruta('est_x', 'f_x'), 'application/pdf', 100) $q$);
select pruebas.espera_valor('X01 Un miembro de otro establecimiento no ve nada de Santa Remigia (tablas ni Storage)',
  $q$ select ((select count(*) from public.archivos where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from public.lote_archivos where establecimiento_id = pruebas.id('est_a'))
            + (select count(*) from storage.objects where bucket_id = 'lote-archivos' and name like pruebas.id('est_a') || '/%'))::text $q$, '0');
select pruebas.espera_error('X02 Adjunta su archivo a un lote ajeno',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_x'), pruebas.id('L1'), 'mio.pdf') $q$, '42501');
select pruebas.espera_error('X03 Adjunta un archivo ajeno (de Santa Remigia) a su lote',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f1'), pruebas.id('LX'), 'ajeno.pdf') $q$, '42501');
select pruebas.espera_ok('X04 Adjunta su propio archivo a su propio lote',
  $q$ select public.adjuntar_archivo_lote(pruebas.id('f_x'), pruebas.id('LX'), 'mio.pdf') $q$);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pruebas.espera_error('N01 anon: adjuntar',  $q$ select public.adjuntar_archivo_lote(gen_random_uuid(), pruebas.id('L1'), 'x.pdf') $q$, '42501');
select pruebas.espera_error('N02 anon: quitar',    $q$ select public.quitar_archivo_lote(pruebas.id('L1'), pruebas.id('f1')) $q$, '42501');
select pruebas.espera_error('N03 anon: restaurar', $q$ select public.restaurar_archivo_lote(pruebas.id('L1'), pruebas.id('f1')) $q$, '42501');
select pruebas.espera_error('N04 anon: leer archivos', $q$ select count(*) from public.archivos $q$, '42501');
select pruebas.espera_valor('N05 anon: no ve objetos del bucket',
  $q$ select pruebas.contar($s$ select count(*) from storage.objects where bucket_id = 'lote-archivos' $s$)::text $q$, '0');
select pruebas.espera_error('N06 anon: no sube',
  $q$ select pruebas.subir(pruebas.ruta('est_a', 'f_q'), 'application/pdf', 100) $q$, '42501');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Base (postgres): bucket, políticas, inmutabilidad y permisos
-- ════════════════════════════════════════════════════════════════════════════

reset role;

select pruebas.espera_valor('B01 Bucket privado, 20 MB, con PDF y HEIC y sin SVG, HTML ni ejecutables',
  $q$ select (not public and file_size_limit = 20971520
              and 'application/pdf' = any (allowed_mime_types) and 'image/heic' = any (allowed_mime_types)
              and not ('image/svg+xml' = any (allowed_mime_types)) and not ('text/html' = any (allowed_mime_types))
              and not ('application/x-msdownload' = any (allowed_mime_types)))::text
      from storage.buckets where id = 'lote-archivos' $q$, 'true');
select pruebas.espera_valor('B02 Políticas de Storage del bucket: solo insert y select, solo para authenticated',
  $q$ select string_agg(cmd || ':' || array_to_string(roles, ','), ' ' order by cmd) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and (coalesce(qual, '') like '%lote-archivos%' or coalesce(with_check, '') like '%lote-archivos%') $q$,
  'INSERT:authenticated SELECT:authenticated');
select pruebas.espera_error('B03 Un archivo no se modifica, aun como postgres',
  $q$ update public.archivos set nombre = 'otro.pdf' where id = pruebas.id('f1') $q$, '42501');
select pruebas.espera_error('B04 Un vínculo no se borra, aun como postgres',
  $q$ delete from public.lote_archivos where archivo_id = pruebas.id('f1') $q$, '42501');
select pruebas.espera_error('B05 Del vínculo solo cambia si está quitado (no el lote de origen)',
  $q$ update public.lote_archivos set heredado_de_lote_id = null where lote_id = pruebas.id('D1') $q$, '42501');
select pruebas.espera_error('B06 Quitado a medias (sin quién ni cuándo): check de todo o nada',
  $q$ update public.lote_archivos set oculto = true where lote_id = pruebas.id('L1') and archivo_id = pruebas.id('f1') $q$, '23514');
select pruebas.espera_valor('B07 Funciones nuevas: search_path fijo, nada para anon; authenticated solo las tres de archivos',
  $q$ select (count(*) = 5 and bool_and(coalesce('search_path=""' = any (p.proconfig), false)
              and not has_function_privilege('anon', p.oid, 'execute')
              and has_function_privilege('authenticated', p.oid, 'execute') = (p.proname like '%\_archivo\_lote')
              and p.prosecdef = (p.proname like '%\_archivo\_lote')))::text
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('adjuntar_archivo_lote', 'quitar_archivo_lote', 'restaurar_archivo_lote', '_archivo_permitido', 'proteger_lote_archivo') $q$, 'true');
select pruebas.espera_valor('B08 Tablas nuevas: authenticated solo lee; anon nada',
  $q$ select bool_and(has_table_privilege('authenticated', t, 'select')
                      and not has_table_privilege('authenticated', t, 'insert')
                      and not has_table_privilege('authenticated', t, 'update')
                      and not has_table_privilege('authenticated', t, 'delete')
                      and not has_table_privilege('anon', t, 'select'))::text
      from unnest(array['public.archivos', 'public.lote_archivos']) t $q$, 'true');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Reporte (error a propósito: deshace todo)
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
  raise exception E'PRUEBAS ARCHIVOS DE LOTE: % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
    v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
end $$;
