-- Campo Digital v2 — Archivos de las actividades (empieza por la pesada)
--
-- Pedido del 2026-10-30: poder cargar archivos asociados a una pesada (planilla de la balanza,
-- fotos). Se arma para cualquier actividad; la app lo ofrece por ahora en la pesada.
--
-- Mismo esquema que los archivos del lote (20261020000200), reutilizando lo que ya existe:
--   * public.archivos (un registro por objeto de Storage) y el bucket privado lote-archivos, con
--     sus formatos (pdf, office, csv, txt, imágenes) y 20 MB. Ruta {establecimiento_id}/{id}.
--   * actividad_archivos: el vínculo actividad-archivo. Se quita ocultándolo; nunca se borra.
--   * Lectura: los miembros (Consulta incluido), como las actividades. Escritura solo por funciones.
--   * adjuntar_archivo_actividad: quien puede cargar, con la actividad no anulada. Idempotente.
--   * quitar_archivo_actividad: solo el administrador (igual que en los lotes).
--
-- Auditoría: +3 funciones (proteger_actividad_archivo, adjuntar_archivo_actividad, quitar_archivo_actividad).

begin;

create table public.actividad_archivos (
  actividad_id       uuid not null,
  archivo_id         uuid not null,
  establecimiento_id uuid not null references public.establecimientos (id) on delete restrict,
  oculto             boolean not null default false,
  ocultado_por       uuid,   -- auditoría, sin FK
  ocultado_en        timestamptz,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  primary key (actividad_id, archivo_id),
  foreign key (actividad_id, establecimiento_id) references public.actividades (id, establecimiento_id) on delete restrict,
  foreign key (archivo_id, establecimiento_id)   references public.archivos (id, establecimiento_id) on delete restrict,
  check (oculto = (ocultado_en is not null) and (ocultado_en is null) = (ocultado_por is null))
);

create index actividad_archivos_archivo_idx on public.actividad_archivos (archivo_id);

-- Solo cambian los datos de quitar; no se borra
create function public.proteger_actividad_archivo() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'Los archivos de una actividad no se borran: se quitan (se ocultan)' using errcode = '42501';
  end if;
  if (new.actividad_id, new.archivo_id, new.establecimiento_id, new.created_by, new.created_at)
     is distinct from
     (old.actividad_id, old.archivo_id, old.establecimiento_id, old.created_by, old.created_at) then
    raise exception 'Del vínculo de un archivo solo se cambia si está quitado o no' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_actividad_archivo() from public, anon, authenticated;

create trigger proteger before update or delete on public.actividad_archivos
  for each row execute function public.proteger_actividad_archivo();
create trigger sin_truncate before truncate on public.actividad_archivos
  for each statement execute function public.bloquear_modificacion();

alter table public.actividad_archivos enable row level security;
create policy actividad_archivos_select on public.actividad_archivos
  for select to authenticated using (public.es_miembro(establecimiento_id));
revoke all on public.actividad_archivos from anon, authenticated;
grant select on public.actividad_archivos to authenticated;

-- Adjuntar un archivo ya subido al bucket lote-archivos ({establecimiento_id}/{p_archivo_id}) a una
-- actividad no anulada. Tamaño y tipo salen del objeto en Storage. Idempotente: si el archivo ya está
-- registrado (reintento), solo agrega el vínculo.
create function public.adjuntar_archivo_actividad(
  p_archivo_id   uuid,
  p_actividad_id uuid,
  p_nombre       text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act     public.actividades;
  v_archivo public.archivos;
  v_ruta    text;
  v_meta    jsonb;
  v_tamano  bigint;
  v_mime    text;
begin
  if p_archivo_id is null then
    raise exception 'Falta el identificador del archivo' using errcode = '22023';
  end if;
  select * into v_act from public.actividades where id = p_actividad_id for update;
  if not found or not public.puede_operar(v_act.establecimiento_id) then
    raise exception 'Actividad inexistente o sin permiso de carga' using errcode = '42501';
  end if;
  if v_act.anulada_en is not null then
    raise exception 'La actividad está anulada: no se le agregan archivos' using errcode = '22023';
  end if;

  select * into v_archivo from public.archivos where id = p_archivo_id;
  if found then
    if v_archivo.establecimiento_id <> v_act.establecimiento_id then
      raise exception 'Archivo inexistente o de otro establecimiento' using errcode = '42501';
    end if;
  else
    if btrim(coalesce(p_nombre, '')) = '' or char_length(p_nombre) > 255 then
      raise exception 'El archivo necesita un nombre (hasta 255 caracteres)' using errcode = '22023';
    end if;

    v_ruta := v_act.establecimiento_id::text || '/' || p_archivo_id::text;
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
    values (p_archivo_id, v_act.establecimiento_id, v_ruta, btrim(p_nombre), v_mime, v_tamano, 'otro');
  end if;

  insert into public.actividad_archivos (actividad_id, archivo_id, establecimiento_id)
  values (v_act.id, p_archivo_id, v_act.establecimiento_id)
  on conflict (actividad_id, archivo_id) do nothing;

  return p_archivo_id;
end;
$$;

-- Quitar (ocultar) un archivo de una actividad: solo el administrador; el archivo queda en Storage
create function public.quitar_archivo_actividad(p_actividad_id uuid, p_archivo_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo public.actividad_archivos;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador quita archivos' using errcode = '42501';
  end if;
  select * into v_vinculo from public.actividad_archivos
  where actividad_id = p_actividad_id and archivo_id = p_archivo_id for update;
  if not found then
    raise exception 'El archivo no está en esta actividad' using errcode = '22023';
  end if;
  if v_vinculo.oculto then
    raise exception 'El archivo ya está quitado' using errcode = '22023';
  end if;
  update public.actividad_archivos
  set oculto = true, ocultado_por = auth.uid(), ocultado_en = now()
  where actividad_id = p_actividad_id and archivo_id = p_archivo_id;
end;
$$;

revoke execute on function public.adjuntar_archivo_actividad(uuid, uuid, text) from public, anon;
revoke execute on function public.quitar_archivo_actividad(uuid, uuid)        from public, anon;
grant  execute on function public.adjuntar_archivo_actividad(uuid, uuid, text) to authenticated;
grant  execute on function public.quitar_archivo_actividad(uuid, uuid)        to authenticated;

commit;
