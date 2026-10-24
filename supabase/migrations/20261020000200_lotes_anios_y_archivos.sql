-- Campo Digital v2 — Lotes: año de nacimiento (reemplaza a campaña) y archivos del lote
--
-- 1. lotes.anios_nacimiento int[]: años de nacimiento de los animales del lote. Sin repetidos,
--    ordenados, cada uno entre 1990 y el año actual, hasta 10. Se cargan desde campaña (los años
--    de 4 dígitos que tenga el texto). campana NO se borra todavía (migración posterior); pierde el
--    permiso de UPDATE, que pasa a anios_nacimiento.
--    Herencia: crear_lote los recibe; dividir_lote los copia a cada lote nuevo, salvo que la
--    división indique otros para ese lote; unir_lotes junta los de todos los lotes unidos;
--    recategorizar_lote no los toca. registrar_compra acepta los años del lote nuevo que crea (sin
--    inferir nada). registrar_paricion NO cambia.
--
-- 2. Archivos del lote, con herencia por referencia (el archivo físico no se duplica):
--    archivos (uno por objeto de Storage) y lote_archivos (vínculo lote-archivo, que se oculta y
--    nunca se borra). Bucket privado lote-archivos, ruta {establecimiento_id}/{id del archivo}.
--    Formatos y tamaño (20 MB) validados en el bucket, en la función y en la app.
--    dividir_lote y unir_lotes copian los vínculos visibles al lote nuevo.
--
-- Criterios de siempre: search_path fijo en toda función, escritura solo por funciones
-- security definer, lectura para miembros por RLS, sin políticas de delete, nada para anon.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Año de nacimiento
-- ════════════════════════════════════════════════════════════════════════════

-- Años de 4 dígitos de un texto (los de campaña), sin repetir, ordenados y dentro del rango
-- válido (1990 al año actual). "2024 y 2025" → {2024,2025}; "2024/25" → {2024}; sin años → {}.
create function public._anios_de_texto(p_texto text) returns int[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct t.anio order by t.anio), '{}')
  from (
    select m[1]::int as anio
    from regexp_matches(coalesce(p_texto, ''), '(?<![0-9])([0-9]{4})(?![0-9])', 'g') m
  ) t
  where t.anio between 1990 and extract(year from public.fecha_hoy())::int;
$$;

revoke execute on function public._anios_de_texto(text) from public, anon, authenticated;

-- Años que manda la app en un jsonb ([2024, 2025]). Null si no vino (o vino null): quien llama
-- decide el valor por defecto. Respeta el orden recibido: la validación (sin repetir, ordenados,
-- rango) la hace el trigger, igual que siempre.
create function public._anios_de_jsonb(p_valor jsonb) returns int[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_anios int[] := '{}';
  v_item  jsonb;
  v_num   numeric;
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_valor) <> 'array' then
    raise exception 'Los años de nacimiento tienen que ser una lista' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(p_valor) e loop
    if jsonb_typeof(v_item) <> 'number' then
      raise exception 'Cada año de nacimiento tiene que ser un número' using errcode = '22023';
    end if;
    v_num := (v_item #>> '{}')::numeric;
    if v_num <> trunc(v_num) or v_num < 0 or v_num > 9999 then
      raise exception 'Cada año de nacimiento tiene que ser un año (número entero de hasta 4 cifras)' using errcode = '22023';
    end if;
    v_anios := array_append(v_anios, v_num::int);
  end loop;
  return v_anios;
end;
$$;

revoke execute on function public._anios_de_jsonb(jsonb) from public, anon, authenticated;

-- Validación (trigger: el tope es el año actual, que no puede ir en un check)
create function public.validar_anios_nacimiento() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tope int := extract(year from public.fecha_hoy())::int;
begin
  if cardinality(new.anios_nacimiento) > 10 then
    raise exception 'Hasta 10 años de nacimiento por lote' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.anios_nacimiento) x where x is null or x < 1990 or x > v_tope) then
    raise exception 'Cada año de nacimiento tiene que estar entre 1990 y %', v_tope using errcode = '23514';
  end if;
  if new.anios_nacimiento is distinct from
     (select coalesce(array_agg(distinct x order by x), '{}') from unnest(new.anios_nacimiento) x) then
    raise exception 'Los años de nacimiento van sin repetir y ordenados de menor a mayor' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.validar_anios_nacimiento() from public, anon, authenticated;

alter table public.lotes add column anios_nacimiento int[] not null default '{}';

create trigger validar_anios_nacimiento before insert or update of anios_nacimiento on public.lotes
  for each row execute function public.validar_anios_nacimiento();

-- Carga desde campaña. Sin tocar updated_at (no es un cambio del usuario).
alter table public.lotes disable trigger set_updated_at;
update public.lotes
set anios_nacimiento = public._anios_de_texto(campana)
where campana is not null and btrim(campana) <> '';
alter table public.lotes enable trigger set_updated_at;

-- Informe: lotes con campaña cuyo texto no dio ningún año, o tenía años fuera de rango que se descartaron
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select l.nombre, l.campana, l.anios_nacimiento
    from public.lotes l
    where l.campana is not null and btrim(l.campana) <> ''
      and (cardinality(l.anios_nacimiento) = 0
           or cardinality(l.anios_nacimiento) < (select count(distinct m[1]) from regexp_matches(l.campana, '(?<![0-9])([0-9]{4})(?![0-9])', 'g') m))
    order by l.nombre
  loop
    n := n + 1;
    raise notice 'Campaña sin año reconocible o con años descartados: lote "%", campaña "%", años cargados %', r.nombre, r.campana, r.anios_nacimiento;
  end loop;
  raise notice 'Lotes para revisar por la campaña: %', n;
end $$;

-- Permisos: campaña ya no se edita; los años sí (la política de lotes ya exige puede_operar)
revoke update (campana) on public.lotes from authenticated;
grant  update (anios_nacimiento) on public.lotes to authenticated;

-- crear_lote recibe los años (parámetro nuevo al final, con valor por defecto). Cambia la firma:
-- se borra la anterior y se crea de nuevo, con los mismos permisos.
drop function public.crear_lote(uuid, uuid, text, date, jsonb, uuid, text, text);

create function public.crear_lote(
  p_establecimiento_id uuid,
  p_especie_id         uuid,
  p_nombre             text,
  p_fecha_apertura     date,
  p_composicion        jsonb,
  p_potrero_id         uuid  default null,
  p_campana            text  default null,   -- se deja de usar; se borra con la columna
  p_notas              text  default null,
  p_anios_nacimiento   int[] default '{}'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  uuid;
  v_item  jsonb;
  v_cat   uuid;
  v_cab   int;
begin
  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de edición en este establecimiento' using errcode = '42501';
  end if;

  if p_fecha_apertura is null or p_fecha_apertura > public.fecha_hoy() then
    raise exception 'La fecha de apertura no puede estar vacía ni ser futura' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.especies s
    where s.id = p_especie_id and s.establecimiento_id = p_establecimiento_id and s.activo
  ) then
    raise exception 'Especie inexistente o inactiva en este establecimiento' using errcode = '22023';
  end if;

  if p_composicion is null or jsonb_typeof(p_composicion) <> 'array' or jsonb_array_length(p_composicion) = 0 then
    raise exception 'La composición inicial tiene que tener al menos una categoría' using errcode = '22023';
  end if;

  if (select count(distinct x ->> 'categoria_id') from jsonb_array_elements(p_composicion) x)
     <> jsonb_array_length(p_composicion) then
    raise exception 'Hay categorías repetidas en la composición inicial' using errcode = '22023';
  end if;

  -- Los años los valida el trigger validar_anios_nacimiento
  insert into public.lotes (establecimiento_id, especie_id, nombre, campana, fecha_apertura, potrero_id, notas, anios_nacimiento)
  values (p_establecimiento_id, p_especie_id, p_nombre, p_campana, p_fecha_apertura, p_potrero_id, p_notas,
          coalesce(p_anios_nacimiento, '{}'))
  returning id into v_lote;

  for v_item in select * from jsonb_array_elements(p_composicion) loop
    v_cat := nullif(v_item ->> 'categoria_id', '')::uuid;
    v_cab := (v_item ->> 'cabezas')::int;

    if v_cab is null or v_cab <= 0 then
      raise exception 'Las cabezas del alta inicial tienen que ser mayores a cero' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.categorias_animales c
      where c.id = v_cat and c.especie_id = p_especie_id and c.activo
    ) then
      raise exception 'Categoría inexistente, inactiva o de otra especie' using errcode = '22023';
    end if;

    insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo)
    values (p_establecimiento_id, v_lote, p_especie_id, v_cat, v_cab, p_fecha_apertura, 'alta_inicial');
  end loop;

  return v_lote;
end;
$$;

revoke execute on function public.crear_lote(uuid, uuid, text, date, jsonb, uuid, text, text, int[]) from public, anon;
grant  execute on function public.crear_lote(uuid, uuid, text, date, jsonb, uuid, text, text, int[]) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Archivos del lote: tablas
-- ════════════════════════════════════════════════════════════════════════════

-- Un archivo = un objeto de Storage (bucket lote-archivos). El tipo es del archivo.
create table public.archivos (
  id                 uuid primary key,   -- lo genera la app; también es el nombre del objeto en Storage
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  ruta               text not null unique,
  nombre             text not null check (btrim(nombre) <> '' and char_length(nombre) <= 255),   -- nombre original
  tipo_mime          text not null,
  tamano_bytes       bigint not null check (tamano_bytes > 0 and tamano_bytes <= 20971520),       -- 20 MB
  tipo               text not null check (tipo in ('trazabilidad', 'otro')),
  created_by         uuid default auth.uid(),   -- quién lo subió (auditoría, sin FK)
  created_at         timestamptz not null default now(),
  check (ruta = establecimiento_id::text || '/' || id::text),
  unique (id, establecimiento_id)
);

-- Vínculo lote-archivo. Se oculta (quitar) y se vuelve a mostrar (restaurar); nunca se borra.
create table public.lote_archivos (
  lote_id             uuid not null,
  archivo_id          uuid not null,
  establecimiento_id  uuid not null references public.establecimientos (id) on delete restrict,
  oculto              boolean not null default false,
  ocultado_por        uuid,   -- auditoría, sin FK
  ocultado_en         timestamptz,
  heredado_de_lote_id uuid,   -- lote del que se copió al dividir o unir (null si se adjuntó directo)
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  primary key (lote_id, archivo_id),
  foreign key (lote_id, establecimiento_id)             references public.lotes (id, establecimiento_id) on delete restrict,
  foreign key (archivo_id, establecimiento_id)          references public.archivos (id, establecimiento_id) on delete restrict,
  foreign key (heredado_de_lote_id, establecimiento_id) references public.lotes (id, establecimiento_id) on delete restrict,
  check (oculto = (ocultado_en is not null) and (ocultado_en is null) = (ocultado_por is null))
);

create index lote_archivos_archivo_idx on public.lote_archivos (archivo_id);

-- archivos: inmutable
create trigger inmutable before update or delete on public.archivos for each row execute function public.bloquear_modificacion();
create trigger sin_truncate before truncate on public.archivos for each statement execute function public.bloquear_modificacion();

-- lote_archivos: solo cambian los datos de ocultar; no se borra
create function public.proteger_lote_archivo() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'Los archivos de un lote no se borran: se quitan (se ocultan)' using errcode = '42501';
  end if;
  if (new.lote_id, new.archivo_id, new.establecimiento_id, new.heredado_de_lote_id, new.created_by, new.created_at)
     is distinct from
     (old.lote_id, old.archivo_id, old.establecimiento_id, old.heredado_de_lote_id, old.created_by, old.created_at) then
    raise exception 'Del vínculo de un archivo solo se cambia si está quitado o no' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_lote_archivo() from public, anon, authenticated;

create trigger proteger before update or delete on public.lote_archivos
  for each row execute function public.proteger_lote_archivo();
create trigger sin_truncate before truncate on public.lote_archivos
  for each statement execute function public.bloquear_modificacion();

-- RLS: leen los miembros (consulta incluido); nadie escribe directo
alter table public.archivos      enable row level security;
alter table public.lote_archivos enable row level security;

create policy archivos_select      on public.archivos      for select to authenticated using (public.es_miembro(establecimiento_id));
create policy lote_archivos_select on public.lote_archivos for select to authenticated using (public.es_miembro(establecimiento_id));

revoke all on public.archivos, public.lote_archivos from anon, authenticated;
grant select on public.archivos, public.lote_archivos to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Storage: bucket privado lote-archivos
-- ════════════════════════════════════════════════════════════════════════════
-- Formatos (lista cerrada): pdf, doc, docx, xls, xlsx, csv, txt, ppt, pptx, jpg, jpeg, png, webp, heic.
-- Nada de ejecutables, scripts, html ni svg. Hasta 20 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lote-archivos', 'lote-archivos', false, 20971520, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Subir: ruta {establecimiento_id}/{uuid} (una sola carpeta), donde el usuario puede cargar.
-- El case garantiza que el texto se convierte a uuid solo si tiene forma de uuid.
create policy lote_archivos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lote-archivos'
    and case
          when array_length(storage.foldername(name), 1) = 1
               and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.puede_operar(((storage.foldername(name))[1])::uuid)
          else false
        end
  );

-- Leer (y firmar URLs de descarga): miembros del establecimiento de la carpeta
create policy lote_archivos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lote-archivos'
    and case
          when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.es_miembro(((storage.foldername(name))[1])::uuid)
          else false
        end
  );
-- Sin update ni delete: un archivo subido no se reemplaza ni se borra.

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Funciones de archivos
-- ════════════════════════════════════════════════════════════════════════════

-- Formato permitido: extensión del nombre y tipo MIME, los dos en la lista cerrada
create function public._archivo_permitido(p_nombre text, p_mime text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(substring(p_nombre from '\.([A-Za-z0-9]+)$')) = any (array[
           'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp', 'heic'])
     and lower(coalesce(p_mime, '')) = any (array[
           'application/pdf', 'application/msword',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/vnd.ms-excel',
           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
           'text/csv', 'text/plain', 'application/vnd.ms-powerpoint',
           'application/vnd.openxmlformats-officedocument.presentationml.presentation',
           'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
$$;

revoke execute on function public._archivo_permitido(text, text) from public, anon, authenticated;

-- Adjuntar un archivo ya subido a Storage ({establecimiento_id}/{p_archivo_id}) a un lote activo.
-- Tamaño y tipo MIME salen del objeto en Storage (no de lo que diga la app).
-- Idempotente: si el archivo ya está registrado (reintento, o el mismo archivo a otro lote), solo
-- agrega el vínculo.
create function public.adjuntar_archivo_lote(
  p_archivo_id uuid,
  p_lote_id    uuid,
  p_nombre     text,
  p_tipo       text default 'otro'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote    public.lotes;
  v_archivo public.archivos;
  v_ruta    text;
  v_meta    jsonb;
  v_tamano  bigint;
  v_mime    text;
begin
  if p_archivo_id is null then
    raise exception 'Falta el identificador del archivo' using errcode = '22023';
  end if;

  v_lote := public._bloquear_lote_editable(p_lote_id);   -- 42501 sin permiso de carga
  if v_lote.estado <> 'activo' then
    raise exception 'El lote está cerrado: sus archivos son de solo lectura' using errcode = '22023';
  end if;

  select * into v_archivo from public.archivos where id = p_archivo_id;
  if found then
    if v_archivo.establecimiento_id <> v_lote.establecimiento_id then
      raise exception 'Archivo inexistente o de otro establecimiento' using errcode = '42501';
    end if;
  else
    if p_tipo is null or p_tipo not in ('trazabilidad', 'otro') then
      raise exception 'El tipo de archivo es trazabilidad u otro' using errcode = '22023';
    end if;
    if btrim(coalesce(p_nombre, '')) = '' or char_length(p_nombre) > 255 then
      raise exception 'El archivo necesita un nombre (hasta 255 caracteres)' using errcode = '22023';
    end if;

    v_ruta := v_lote.establecimiento_id::text || '/' || p_archivo_id::text;
    select o.metadata into v_meta
    from storage.objects o
    where o.bucket_id = 'lote-archivos' and o.name = v_ruta;
    if not found then
      raise exception 'El archivo no está subido (o la subida no terminó)' using errcode = '22023';
    end if;

    v_tamano := nullif(v_meta ->> 'size', '')::bigint;
    v_mime := lower(coalesce(v_meta ->> 'mimetype', ''));
    if v_tamano is null or v_tamano <= 0 then
      raise exception 'El archivo está vacío' using errcode = '22023';
    end if;
    if v_tamano > 20971520 then
      raise exception 'El archivo supera los 20 MB' using errcode = '22023';
    end if;
    if not public._archivo_permitido(p_nombre, v_mime) then
      raise exception 'Formato no permitido: PDF, Word, Excel, CSV, texto, PowerPoint o imágenes (JPG, PNG, WEBP, HEIC)'
        using errcode = '22023';
    end if;

    insert into public.archivos (id, establecimiento_id, ruta, nombre, tipo_mime, tamano_bytes, tipo)
    values (p_archivo_id, v_lote.establecimiento_id, v_ruta, btrim(p_nombre), v_mime, v_tamano, p_tipo);
  end if;

  insert into public.lote_archivos (lote_id, archivo_id, establecimiento_id)
  values (v_lote.id, p_archivo_id, v_lote.establecimiento_id)
  on conflict (lote_id, archivo_id) do nothing;

  return p_archivo_id;
end;
$$;

-- Quitar (ocultar) un archivo de un lote: solo el administrador; no toca los otros lotes ni Storage
create function public.quitar_archivo_lote(p_lote_id uuid, p_archivo_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo public.lote_archivos;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador quita archivos' using errcode = '42501';
  end if;
  select * into v_vinculo from public.lote_archivos where lote_id = p_lote_id and archivo_id = p_archivo_id for update;
  if not found then
    raise exception 'El archivo no está en este lote' using errcode = '22023';
  end if;
  if (select l.estado from public.lotes l where l.id = p_lote_id) <> 'activo' then
    raise exception 'El lote está cerrado: sus archivos son de solo lectura' using errcode = '22023';
  end if;
  if v_vinculo.oculto then
    raise exception 'El archivo ya está quitado de este lote' using errcode = '22023';
  end if;
  update public.lote_archivos
  set oculto = true, ocultado_por = auth.uid(), ocultado_en = now()
  where lote_id = p_lote_id and archivo_id = p_archivo_id;
end;
$$;

-- Restaurar un archivo quitado: solo el administrador
create function public.restaurar_archivo_lote(p_lote_id uuid, p_archivo_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo public.lote_archivos;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador restaura archivos' using errcode = '42501';
  end if;
  select * into v_vinculo from public.lote_archivos where lote_id = p_lote_id and archivo_id = p_archivo_id for update;
  if not found then
    raise exception 'El archivo no está en este lote' using errcode = '22023';
  end if;
  if (select l.estado from public.lotes l where l.id = p_lote_id) <> 'activo' then
    raise exception 'El lote está cerrado: sus archivos son de solo lectura' using errcode = '22023';
  end if;
  if not v_vinculo.oculto then
    raise exception 'El archivo no está quitado' using errcode = '22023';
  end if;
  update public.lote_archivos
  set oculto = false, ocultado_por = null, ocultado_en = null
  where lote_id = p_lote_id and archivo_id = p_archivo_id;
end;
$$;

revoke execute on function public.adjuntar_archivo_lote(uuid, uuid, text, text) from public, anon;
revoke execute on function public.quitar_archivo_lote(uuid, uuid)              from public, anon;
revoke execute on function public.restaurar_archivo_lote(uuid, uuid)           from public, anon;
grant  execute on function public.adjuntar_archivo_lote(uuid, uuid, text, text) to authenticated;
grant  execute on function public.quitar_archivo_lote(uuid, uuid)              to authenticated;
grant  execute on function public.restaurar_archivo_lote(uuid, uuid)           to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. dividir_lote: los lotes nuevos heredan los años y los archivos visibles del origen
-- ════════════════════════════════════════════════════════════════════════════
-- Misma firma (create or replace conserva los permisos). Cambios: años de nacimiento (cada destino
-- puede traer "anios_nacimiento"; si no viene, hereda los del origen) y copia de los vínculos de
-- archivos (los quitados no se copian). El resto es igual.
-- p_destinos: [{"nombre", "potrero_id", "campana", "anios_nacimiento"?, "composicion": [...]}]

create or replace function public.dividir_lote(
  p_lote_id  uuid,
  p_fecha    date,
  p_destinos jsonb,
  p_notas    text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen  public.lotes;
  v_op      uuid;
  v_destino jsonb;
  v_item    jsonb;
  v_nuevo   uuid;
  v_nombre  text;
  v_cat     uuid;
  v_cab     int;
  v_cats    uuid[] := '{}';
  v_nombres text[] := '{}';
begin
  -- 1. Bloqueo y permiso (antes de leer el saldo)
  v_origen := public._bloquear_lote_editable(p_lote_id);

  -- 2. Validaciones
  if v_origen.estado <> 'activo' then
    raise exception 'El lote está cerrado' using errcode = '22023';
  end if;
  perform public._validar_fecha_operacion(p_fecha, v_origen.fecha_apertura);

  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Indicá al menos un lote nuevo' using errcode = '22023';
  end if;

  -- 3. Operación y vínculo del origen
  insert into public.operaciones_lote (establecimiento_id, tipo, fecha, notas)
  values (v_origen.establecimiento_id, 'division', p_fecha, p_notas)
  returning id into v_op;

  insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
  values (v_origen.establecimiento_id, v_op, v_origen.id, 'origen');

  -- 4. Cada destino: lote nuevo y eventos -n en el origen, +n en el destino
  for v_destino in select * from jsonb_array_elements(p_destinos) loop
    v_nombre := btrim(coalesce(v_destino ->> 'nombre', ''));
    if v_nombre = '' then
      raise exception 'Cada lote nuevo necesita un nombre' using errcode = '22023';
    end if;

    if jsonb_typeof(v_destino -> 'composicion') is distinct from 'array'
       or jsonb_array_length(v_destino -> 'composicion') = 0 then
      raise exception 'El lote "%" no tiene animales', v_nombre using errcode = '22023';
    end if;

    if (select count(distinct x ->> 'categoria_id') from jsonb_array_elements(v_destino -> 'composicion') x)
       <> jsonb_array_length(v_destino -> 'composicion') then
      raise exception 'Hay categorías repetidas en el lote "%"', v_nombre using errcode = '22023';
    end if;

    -- Años: los que indique la división para este lote o, si no vienen, los del origen
    insert into public.lotes (establecimiento_id, especie_id, nombre, campana, fecha_apertura, potrero_id, anios_nacimiento)
    values (
      v_origen.establecimiento_id, v_origen.especie_id, v_nombre,
      nullif(btrim(coalesce(v_destino ->> 'campana', '')), ''),
      p_fecha,
      nullif(v_destino ->> 'potrero_id', '')::uuid,
      coalesce(public._anios_de_jsonb(v_destino -> 'anios_nacimiento'), v_origen.anios_nacimiento)
    )
    returning id into v_nuevo;

    insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
    values (v_origen.establecimiento_id, v_op, v_nuevo, 'destino');

    -- Hereda los archivos visibles del origen (por referencia: el archivo no se duplica)
    insert into public.lote_archivos (lote_id, archivo_id, establecimiento_id, heredado_de_lote_id)
    select v_nuevo, la.archivo_id, v_origen.establecimiento_id, v_origen.id
    from public.lote_archivos la
    where la.lote_id = v_origen.id and not la.oculto
    on conflict (lote_id, archivo_id) do nothing;

    for v_item in select * from jsonb_array_elements(v_destino -> 'composicion') loop
      v_cat := nullif(v_item ->> 'categoria_id', '')::uuid;
      perform public._exigir_categoria(v_cat, v_origen.especie_id);
      v_cab := public._cabezas(v_item -> 'cabezas');

      insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, operacion_lote_id)
      values
        (v_origen.establecimiento_id, v_origen.id, v_origen.especie_id, v_cat, -v_cab, p_fecha, 'division', v_op),
        (v_origen.establecimiento_id, v_nuevo,     v_origen.especie_id, v_cat,  v_cab, p_fecha, 'division', v_op);

      v_cats := array_append(v_cats, v_cat);
    end loop;

    v_nombres := array_append(v_nombres, v_nombre);
  end loop;

  -- 5. Saldo del origen: acumulado de cada día >= 0, también con fecha hacia atrás
  foreach v_cat in array (select array_agg(distinct c) from unnest(v_cats) c) loop
    perform public._validar_saldo(v_origen.id, v_cat);
  end loop;

  -- 6. Si el origen quedó vacío, se cierra
  perform public._cerrar_si_vacio(v_origen.id, p_fecha, 'Dividido en ' || array_to_string(v_nombres, ', '));

  return v_op;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. unir_lotes: el destino recibe la unión de los años y los archivos visibles de los orígenes
-- ════════════════════════════════════════════════════════════════════════════
-- Misma firma. Cambios: años del destino = unión (sin repetir, ordenados) de los orígenes y,
-- si el destino ya existía, también los suyos; copia de los vínculos de archivos sin duplicar.

create or replace function public.unir_lotes(
  p_lotes_origen uuid[],
  p_fecha        date,
  p_destino_id   uuid  default null,
  p_nuevo        jsonb default null,
  p_notas        text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_ids      uuid[];
  v_lote     public.lotes;
  v_primero  public.lotes;
  v_destino  uuid;
  v_nombre_destino text;
  v_op       uuid;
  v_ultimo   date;
  v_anios    int[];
  r          record;
begin
  -- 1. Validaciones de los parámetros
  if p_lotes_origen is null or cardinality(p_lotes_origen) = 0 then
    raise exception 'Indicá al menos un lote para unir' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_lotes_origen) x) <> cardinality(p_lotes_origen)
     or array_position(p_lotes_origen, null) is not null then
    raise exception 'Hay lotes repetidos o vacíos en la lista' using errcode = '22023';
  end if;
  if p_destino_id is not null and p_destino_id = any(p_lotes_origen) then
    raise exception 'El lote destino no puede ser también un lote de origen' using errcode = '22023';
  end if;
  if p_destino_id is null then
    if cardinality(p_lotes_origen) < 2 then
      raise exception 'Para crear un lote nuevo hacen falta al menos dos lotes de origen' using errcode = '22023';
    end if;
    if btrim(coalesce(p_nuevo ->> 'nombre', '')) = '' then
      raise exception 'El lote nuevo necesita un nombre' using errcode = '22023';
    end if;
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;

  -- 2. Bloqueo de todos los lotes, ordenados por id (evita bloqueos cruzados) y permiso en cada uno.
  -- El destino se agrega solo si existe (corrección 0300).
  v_ids := array(
    select distinct x
    from unnest(
      p_lotes_origen || case when p_destino_id is not null then array[p_destino_id] else '{}'::uuid[] end
    ) x
    order by x
  );
  foreach v_id in array v_ids loop
    v_lote := public._bloquear_lote_editable(v_id);
    if v_primero.id is null then
      v_primero := v_lote;
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote "%" está cerrado', v_lote.nombre using errcode = '22023';
    end if;
    if v_lote.establecimiento_id <> v_primero.establecimiento_id or v_lote.especie_id <> v_primero.especie_id then
      raise exception 'Solo se pueden unir lotes del mismo establecimiento y la misma especie' using errcode = '22023';
    end if;

    if v_id = any(p_lotes_origen) then
      -- Origen: la fecha no puede ser anterior a su último evento ni a su apertura
      select max(e.fecha) into v_ultimo from public.lote_eventos e where e.lote_id = v_id;
      if p_fecha < greatest(v_lote.fecha_apertura, coalesce(v_ultimo, v_lote.fecha_apertura)) then
        raise exception 'La fecha tiene que ser igual o posterior al último movimiento del lote "%" (%)',
          v_lote.nombre, to_char(greatest(v_lote.fecha_apertura, coalesce(v_ultimo, v_lote.fecha_apertura)), 'DD/MM/YYYY')
          using errcode = '22023';
      end if;
    else
      -- Destino existente: la fecha no puede ser anterior a su apertura
      if p_fecha < v_lote.fecha_apertura then
        raise exception 'La fecha no puede ser anterior a la apertura del lote destino (%)',
          to_char(v_lote.fecha_apertura, 'DD/MM/YYYY') using errcode = '22023';
      end if;
      v_nombre_destino := v_lote.nombre;
    end if;
  end loop;

  -- Años del destino: unión de los de todos los lotes (orígenes y, si existe, el destino)
  select coalesce(array_agg(distinct a order by a), '{}') into v_anios
  from public.lotes l, unnest(l.anios_nacimiento) a
  where l.id = any(v_ids);

  -- 3. Destino nuevo, o actualizar los años del existente
  if p_destino_id is null then
    v_nombre_destino := btrim(p_nuevo ->> 'nombre');
    insert into public.lotes (establecimiento_id, especie_id, nombre, campana, fecha_apertura, potrero_id, anios_nacimiento)
    values (
      v_primero.establecimiento_id, v_primero.especie_id, v_nombre_destino,
      nullif(btrim(coalesce(p_nuevo ->> 'campana', '')), ''),
      p_fecha,
      nullif(p_nuevo ->> 'potrero_id', '')::uuid,
      v_anios
    )
    returning id into v_destino;
  else
    v_destino := p_destino_id;
    update public.lotes set anios_nacimiento = v_anios where id = v_destino and anios_nacimiento is distinct from v_anios;
  end if;

  -- 4. Operación y vínculos
  insert into public.operaciones_lote (establecimiento_id, tipo, fecha, notas)
  values (v_primero.establecimiento_id, 'union', p_fecha, p_notas)
  returning id into v_op;

  insert into public.operacion_lote_vinculos (establecimiento_id, operacion_id, lote_id, rol)
  select v_primero.establecimiento_id, v_op, x, 'origen' from unnest(p_lotes_origen) x
  union all
  select v_primero.establecimiento_id, v_op, v_destino, 'destino';

  -- Archivos visibles de los orígenes al destino, sin duplicar (si el mismo archivo estaba en dos
  -- orígenes, o ya en el destino, queda una sola vez). Los orígenes conservan los suyos.
  insert into public.lote_archivos (lote_id, archivo_id, establecimiento_id, heredado_de_lote_id)
  select distinct on (la.archivo_id) v_destino, la.archivo_id, v_primero.establecimiento_id, la.lote_id
  from public.lote_archivos la
  where la.lote_id = any(p_lotes_origen) and not la.oculto
  order by la.archivo_id, la.lote_id
  on conflict (lote_id, archivo_id) do nothing;

  -- 5. Todo el stock de cada origen pasa al destino, por categoría
  for r in
    select e.lote_id, e.categoria_id, sum(e.cabezas)::int as saldo
    from public.lote_eventos e
    where e.lote_id = any(p_lotes_origen)
    group by e.lote_id, e.categoria_id
    having sum(e.cabezas) <> 0
  loop
    insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, operacion_lote_id)
    values
      (v_primero.establecimiento_id, r.lote_id,  v_primero.especie_id, r.categoria_id, -r.saldo, p_fecha, 'union', v_op),
      (v_primero.establecimiento_id, v_destino,  v_primero.especie_id, r.categoria_id,  r.saldo, p_fecha, 'union', v_op);

    perform public._validar_saldo(r.lote_id, r.categoria_id);
  end loop;

  -- 6. Cada origen queda cerrado
  foreach v_id in array p_lotes_origen loop
    if not public._cerrar_si_vacio(v_id, p_fecha, 'Unido a ' || v_nombre_destino) then
      raise exception 'No se pudo cerrar un lote de origen: quedó con stock' using errcode = '23514';
    end if;
  end loop;

  return v_op;
end;
$$;

-- create or replace conserva los permisos; se reafirman
revoke execute on function public.dividir_lote(uuid, date, jsonb, text)        from public, anon;
revoke execute on function public.unir_lotes(uuid[], date, uuid, jsonb, text)  from public, anon;
grant  execute on function public.dividir_lote(uuid, date, jsonb, text)        to authenticated;
grant  execute on function public.unir_lotes(uuid[], date, uuid, jsonb, text)  to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. registrar_compra: el lote nuevo puede traer sus años de nacimiento
-- ════════════════════════════════════════════════════════════════════════════
-- Misma firma. Único cambio: con lote nuevo, p_lote_nuevo puede traer "anios_nacimiento" (se guardan
-- tal cual y los valida el trigger; sin años, queda vacío). Con lote existente no cambia nada: sus
-- años se editan en el lote. No infiere años.

create or replace function public.registrar_compra(
  p_id                 uuid,
  p_establecimiento_id uuid,
  p_fecha              date,
  p_lineas             jsonb,                  -- [{"categoria_id", "cabezas", "peso_vivo_total_kg"?}]
  p_modalidad          text,                   -- productor, remate, frigorifico, otra
  p_lote_id            uuid  default null,     -- destino existente...
  p_lote_nuevo         jsonb default null,     -- ...o nuevo: {"nombre", "especie_id", "potrero_id", "campana", "anios_nacimiento"?}
  p_contraparte        text  default null,
  p_kg_gancho          numeric default null,
  p_precio             jsonb default null,     -- ver _registrar_movimiento; sin precio no hay movimiento
  p_persona_id         uuid  default null,
  p_notas              text  default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote    public.lotes;
  v_especie uuid;
  v_nuevo   uuid;
  v_total   int;
begin
  if public._actividad_ya_registrada(p_id, p_establecimiento_id, 'compra') then
    return p_id;
  end if;

  if not public.puede_operar(p_establecimiento_id) then
    raise exception 'Sin permiso de carga en este establecimiento' using errcode = '42501';
  end if;
  if (p_lote_id is null) = (p_lote_nuevo is null) then
    raise exception 'Indicá el lote destino: uno existente o uno nuevo' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > public.fecha_hoy() then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;
  if p_kg_gancho is not null and p_kg_gancho <= 0 then
    raise exception 'Los kg al gancho tienen que ser mayores a cero' using errcode = '22023';
  end if;
  perform public._exigir_persona(p_persona_id, p_establecimiento_id);

  if p_lote_id is not null then
    v_lote := public._bloquear_lote_editable(p_lote_id);
    if v_lote.establecimiento_id <> p_establecimiento_id then
      raise exception 'Lote inexistente o sin permiso de edición' using errcode = '42501';
    end if;
    if v_lote.estado <> 'activo' then
      raise exception 'El lote está cerrado' using errcode = '22023';
    end if;
    perform public._validar_fecha_operacion(p_fecha, v_lote.fecha_apertura);
  else
    v_especie := nullif(p_lote_nuevo ->> 'especie_id', '')::uuid;
    if btrim(coalesce(p_lote_nuevo ->> 'nombre', '')) = '' then
      raise exception 'El lote nuevo necesita un nombre' using errcode = '22023';
    end if;
    if not exists (select 1 from public.especies s where s.id = v_especie and s.establecimiento_id = p_establecimiento_id and s.activo) then
      raise exception 'Especie inexistente o inactiva en este establecimiento' using errcode = '22023';
    end if;
    insert into public.lotes (establecimiento_id, especie_id, nombre, campana, fecha_apertura, potrero_id, anios_nacimiento)
    values (
      p_establecimiento_id, v_especie, btrim(p_lote_nuevo ->> 'nombre'),
      nullif(btrim(coalesce(p_lote_nuevo ->> 'campana', '')), ''), p_fecha,
      nullif(p_lote_nuevo ->> 'potrero_id', '')::uuid,
      coalesce(public._anios_de_jsonb(p_lote_nuevo -> 'anios_nacimiento'), '{}')   -- los que indique; sin inferir
    )
    returning id into v_nuevo;
    select * into v_lote from public.lotes where id = v_nuevo;
  end if;

  insert into public.actividades (id, establecimiento_id, tipo, fecha, lote_id, lote_creado_id, persona_id, notas)
  values (p_id, p_establecimiento_id, 'compra', p_fecha, v_lote.id, v_nuevo, p_persona_id, p_notas);

  insert into public.act_compraventa (actividad_id, establecimiento_id, modalidad, contraparte, kg_gancho)
  values (p_id, p_establecimiento_id, p_modalidad, nullif(btrim(coalesce(p_contraparte, '')), ''), round(p_kg_gancho, 1));

  perform public._insertar_lineas(p_id, p_establecimiento_id, v_lote.especie_id, p_lineas, 'opcional');

  insert into public.lote_eventos (establecimiento_id, lote_id, especie_id, categoria_id, cabezas, fecha, tipo, actividad_id)
  select p_establecimiento_id, v_lote.id, v_lote.especie_id, l.categoria_id, l.cabezas, p_fecha, 'compra', p_id
  from public.actividad_lineas l where l.actividad_id = p_id;

  if p_precio is not null then
    select sum(l.cabezas) into v_total from public.actividad_lineas l where l.actividad_id = p_id;
    perform public._registrar_movimiento(
      p_establecimiento_id, p_id, v_lote.id, v_lote.especie_id, p_fecha, 'egreso',
      'Compra de ' || v_total || ' cabezas (' || v_lote.nombre || ')', p_contraparte, p_precio);
  end if;

  return p_id;
end;
$$;


revoke execute on function public.registrar_compra(uuid, uuid, date, jsonb, text, uuid, jsonb, text, numeric, jsonb, uuid, text) from public, anon;
grant  execute on function public.registrar_compra(uuid, uuid, date, jsonb, text, uuid, jsonb, text, numeric, jsonb, uuid, text) to authenticated;

commit;
