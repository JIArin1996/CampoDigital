# Campo Digital — Lotes: año de nacimiento y archivos

Estado: **aplicado y verificado** (2026-10-20; migraciones `20261020000200` y `20261020000300`). La app de años de nacimiento (C1) dejó de mandar `campana`. Migración: `supabase/migrations/20261020000200_lotes_anios_y_archivos.sql`; pruebas: `supabase/tests/lotes_anios_nacimiento.sql` y `supabase/tests/lote_archivos_rls.sql`.

## 1. Año de nacimiento (reemplaza a campaña)

- `lotes.anios_nacimiento int[]`, por defecto vacío. Sin repetidos, ordenados de menor a mayor, cada año entre 1990 y el año actual, hasta 10. Lo valida un trigger (el tope es el año actual, que no puede ir en un check).
- Se cargó desde `campana`: todos los años de 4 dígitos del texto ("2024 y 2025" → {2024, 2025}). Un texto sin años queda vacío; la migración avisa qué lotes revisar.
- `campana` sigue en la tabla hasta una migración posterior, pero ya no se edita: el permiso de UPDATE pasó a `anios_nacimiento`. La app ya no la manda (crear, dividir, unir, comprar) y en todas las pantallas dice "Año de nacimiento".
- **Edición del lote**: pantalla propia (nombre, notas y años), solo para lotes abiertos y quien puede cargar. La base hoy **no** impide editar un lote cerrado: la política `lotes_update` solo exige `puede_operar` (y `_bloquear_lote_editable` tampoco mira el estado). Si se quiere que la base lo haga cumplir, va en una migración aparte.
- **Herencia**:
  - `crear_lote` los recibe.
  - `dividir_lote`: cada lote nuevo puede traer sus años (`anios_nacimiento` en el destino); si no vienen, hereda los del origen. La pantalla de dividir los precarga con los del origen y se pueden cambiar antes de confirmar.
  - `unir_lotes`: el destino queda con la unión de los años de todos los lotes (también los del destino si ya existía).
  - `recategorizar_lote` no los toca.
- **Compra**: con lote nuevo, el formulario puede indicar los años (`anios_nacimiento` en el lote nuevo); sin años, queda vacío. No se infiere nada. Con lote existente no cambia nada: sus años se editan en el lote.
- **Parición**: no modifica los años [Decidido].

## 1 bis. Destete como acción propia [Pendiente, no implementado]

Idea a desarrollar (reemplazaría la 6b-2 tal como estaba diseñada): el destete como una **división de las categorías de terneros** (terneros, terneras; corderos, corderas) hacia un lote nuevo, con los **años de nacimiento sugeridos desde las pariciones del lote** (los años de las pariciones registradas en ese lote de cría) y editables antes de confirmar. Usaría `dividir_lote` con años propios por lote nuevo, que ya existe. Queda pendiente de diseño: cómo se eligen las categorías, si el lote de origen se cierra y qué indicadores (% destete) lo toman.

## 2. Archivos del lote

- **Herencia por referencia**: el archivo físico se sube una vez. `archivos` tiene un registro por objeto de Storage; `lote_archivos` vincula archivos con lotes. Al dividir, cada lote nuevo recibe los vínculos visibles del origen; al unir, el destino recibe los de todos los orígenes sin duplicar. Los lotes de origen conservan los suyos (historial). `heredado_de_lote_id` dice de qué lote vino.
- **Quitar es ocultar**: quitar un archivo de un lote marca el vínculo como oculto (quién y cuándo). Nada se borra: ni el registro, ni el vínculo, ni el objeto en Storage. Ocultarlo en un lote no lo oculta en los demás. Quitar y restaurar son del administrador; adjuntar, de quien puede cargar. En la app el texto es "Quitar", nunca "Eliminar".
- **Tipo**: trazabilidad u otro. Un lote puede tener varios de trazabilidad (por ejemplo, después de unir). Es opcional y no se avisa si falta.
- **Formatos** (lista cerrada): pdf, doc, docx, xls, xlsx, csv, txt, ppt, pptx, jpg, jpeg, png, webp, heic. Nada de ejecutables, scripts, html ni svg. Hasta **20 MB**. Se valida en tres lugares: el bucket (tipos MIME y tamaño), la función `adjuntar_archivo_lote` (extensión del nombre y tipo MIME y tamaño leídos del objeto en Storage, no de lo que diga la app) y la app. La extensión es obligatoria y el tipo MIME tiene que corresponder a ella (`.xlsx` con `application/pdf` se rechaza); excepciones: `.csv` acepta también `application/vnd.ms-excel` y `text/plain` (Windows) y `.heic` acepta `image/heif` (migración `20261020000300`).
- **Storage**: bucket privado `lote-archivos`, ruta `{establecimiento_id}/{id del archivo}` (el nombre original va en la tabla, nunca en la ruta). Subir: solo en la carpeta de un establecimiento donde el usuario puede cargar. Leer: miembros. Sin update ni delete. Descarga con URL firmada de vida corta; nunca URLs públicas.
- **Lotes cerrados**: sus archivos se ven, pero no se adjunta, quita ni restaura.
- **Orden de subida en la app**: primero el objeto a Storage (con el id generado por la app), después `adjuntar_archivo_lote`. Si la subida falla, el lote queda creado y se reintenta desde la ficha.
