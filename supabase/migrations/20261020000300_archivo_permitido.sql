-- Campo Digital v2 — Corrección: _archivo_permitido (formatos de archivos del lote)
--
-- Bug de 20261020000200 (ya aplicada, no se edita): con un nombre sin extensión, la extensión
-- extraída era NULL, "NULL = any(...)" daba NULL y la función devolvía NULL en vez de false.
-- adjuntar_archivo_lote hace "if not _archivo_permitido(...)": con NULL no entra al raise, así que
-- un archivo sin extensión se aceptaba.
--
-- Ahora: la extensión es obligatoria y tiene que estar en la lista cerrada, y el tipo MIME tiene
-- que corresponder a esa extensión (.xlsx con application/pdf se rechaza). Excepciones por lo que
-- mandan los navegadores: .csv acepta también application/vnd.ms-excel y text/plain (Windows), y
-- .heic acepta image/heif. Cualquier caso no previsto da false (nunca NULL).
--
-- Misma firma: create or replace conserva los permisos (ninguno para authenticated ni anon).
-- adjuntar_archivo_lote no cambia: ya llama a esta función.

begin;

create or replace function public._archivo_permitido(p_nombre text, p_mime text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select lower(coalesce(p_mime, '')) = any (f.mimes)
    from (values
      ('pdf',  array['application/pdf']),
      ('doc',  array['application/msword']),
      ('docx', array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
      ('xls',  array['application/vnd.ms-excel']),
      ('xlsx', array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
      ('csv',  array['text/csv', 'application/vnd.ms-excel', 'text/plain']),
      ('txt',  array['text/plain']),
      ('ppt',  array['application/vnd.ms-powerpoint']),
      ('pptx', array['application/vnd.openxmlformats-officedocument.presentationml.presentation']),
      ('jpg',  array['image/jpeg']),
      ('jpeg', array['image/jpeg']),
      ('png',  array['image/png']),
      ('webp', array['image/webp']),
      ('heic', array['image/heic', 'image/heif'])
    ) as f(extension, mimes)
    where f.extension = lower(substring(p_nombre from '\.([A-Za-z0-9]+)$'))
  ), false);
$$;

revoke execute on function public._archivo_permitido(text, text) from public, anon, authenticated;

commit;
