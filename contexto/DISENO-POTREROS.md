# Campo Digital — Módulo Potreros

Estado: **implementado** (2026-10-23), en siete pasos aprobados uno por uno.

- Base: migración `20261024000100_potreros_estadias_y_forma`.
- Pruebas: `potreros_estadias.sql` (66), con todas las anteriores sin cambios en sus resultados y la auditoría con 88 funciones.
- App: Potreros en el menú para todos los roles, datos del establecimiento en el Inicio, cambio de potrero con historial, mapa con dibujo e importación.

## Objetivo
1. Potreros en el menú lateral para todos los roles (en el celular, dentro de "Más"). La ruta `/potreros` se mantiene.
2. Los datos del establecimiento pasan al Inicio: una fila compacta bajo el saludo (nombre, sistema productivo, superficie) que se expande con "Ver más". El botón Editar, solo para el administrador, va dentro de lo expandido.
3. Mapa interactivo con la forma, el área y el contenido de cada potrero.
4. Cambio de potrero de un lote con fecha de salida y de ingreso, con historial en el potrero y en el lote.

## Decisiones
- Un lote está en un solo potrero a la vez. Para mover una parte se usa Dividir.
- **Fuente de verdad: `lote_estadias`.** `lotes.potrero_id` es una copia que mantiene un trigger; el usuario no la puede editar.
- Fechas retroactivas permitidas, sin estadías superpuestas. Salir de un potrero y entrar a otro el mismo día no choca.
- Un lote puede quedar sin potrero (corral, camión, venta total).
- No se desactiva un potrero con lotes adentro. Los inactivos se ven con un filtro y se reactivan.
- Superficie: al dibujar o importar una forma se propone el área geodésica, editable, con aviso si difiere más de 10 % de la cargada. Los potreros sin forma quedan "sin dibujar".
- Carga animal: cabezas y cabezas por hectárea. UG/ha queda para después.
- Los cambios de potrero se muestran en el Historial existente del lote (intercalados con los eventos de stock), no en un historial aparte.
- **D1.** Las estadías que crea el alta de un lote (crear, dividir, unir, compra, parición o destete a un lote nuevo) llevan origen `alta`; las de los datos existentes, `migracion`. El detalle de cómo nació el lote está en el Linaje.
- **D2.** Reapertura manual (`reabrir_lote`): estadía **nueva** desde la fecha de reapertura, en el mismo potrero si sigue activo; la vieja queda cerrada (el período cerrado no cuenta como ocupación). Reapertura por una anulación (por ejemplo, anular un destete): se reabre **la misma** estadía, porque es deshacer.
- **D3.** Corrección: "Deshacer el último cambio" (anula la estadía nueva y reabre la anterior). Las estadías viejas no se editan.
- **D4.** Dos capas, siempre: **Satelital** (Esri World Imagery, por defecto) y **Mapa Base de la IDE** (rutas, caminos, vía férrea, arroyos y localidades). El satelital usa la clave de ArcGIS Location Platform si está configurada; si no, el servicio público de Esri (solo para uso privado: antes de un uso comercial hay que cargar la clave). Cambios a pedido de Iñaki (2026-10-23): la infrarroja y la ortofoto 2017-2018 de la IDE se sacaron.
- **D5.** Diálogo de cambio: una sola fecha (hoy por defecto) y la opción "Hubo días sin potrero" para cargar la salida y el ingreso por separado.

## Base de datos (`20261024000100`)
- Extensiones `postgis` y `btree_gist`, en el esquema `extensions`. Las funciones con `search_path = ''` las nombran con el esquema (`extensions.st_area`, `extensions.geometry`).
- `potreros.forma`: `geometry(MultiPolygon, 4326)` opcional, con índice GIST. Sin permiso de columna: se escribe solo con `guardar_forma_potrero`.
- `lote_estadias`: lote, potrero, ingreso, salida (vacía = adentro), origen (`alta`, `manual`, `reapertura`, `migracion`), motivo y motivo de salida, quién y cuándo, cerrada por (`cambio` o `cierre`), estadía anterior (para deshacer) y anulación.
  - Una sola abierta por lote (índice único parcial) y sin superposiciones (restricción con `btree_gist` sobre `daterange(ingreso, salida, '[)')`, sin las anuladas).
  - Una estadía de cero días solo existe si la cerró el cierre del lote (lote que se abre y se cierra el mismo día). Una cargada a mano dura al menos un día.
  - Se leen con `es_miembro`; nadie escribe directo (solo funciones y triggers). No se borran.
- Triggers:
  - `validar_estadia`: fechas dentro de la vida del lote y no futuras; potrero activo al entrar o al reabrir.
  - `sincronizar_potrero_lote`: copia en `lotes.potrero_id` el potrero de la estadía abierta (o, en un lote cerrado, el de la estadía que cerró el cierre).
  - `estadia_alta_lote`: abre la estadía al crear un lote con potrero (cubre las seis funciones que crean lotes, sin tocarlas).
  - `estadia_cambio_estado_lote`: el cierre cierra la estadía; la reapertura por anulación reabre la misma. `reabrir_lote` marca la transacción (`campo.reapertura_manual`) para que el trigger no la reabra y abre una nueva.
  - `proteger_potrero_ocupado`: no se desactiva un potrero con lotes adentro.
- Funciones de la API (administrador y operador): `cambiar_potrero_lote(lote, potrero o null, salida, ingreso, motivo)`, `deshacer_cambio_potrero(lote, motivo)`, `guardar_forma_potrero(potrero, geojson o null, actualizar_superficie)`.
- Lectura: vista `v_potreros_mapa` (forma como GeoJSON, área geodésica en hectáreas y un punto interior para la etiqueta) y `potreros_superpuestos(establecimiento)` (pares que se pisan más de 100 m²; compartir un alambrado no cuenta).

## App
- **Lotes:** la tarjeta dice "Potrero 3 desde <ingreso>" y tiene un botón para cambiar de potrero. La ficha tiene la sección Potrero (con días adentro, Cambiar y Deshacer) y el Historial con las entradas y salidas de potrero intercaladas.
- **Potreros** (`/potreros`), con pestañas **Mapa** y **Lista**:
  - **Lista:** cada potrero con sus datos, lotes adentro, cabezas y cabezas por hectárea; Ingresar lote, Editar, Historial, Desactivar (solo vacíos) y, con "Incluir inactivos", Reactivar.
  - **Mapa** (Leaflet 1.9): potreros dibujados sobre el satelital o el mapa de rutas. Colores, en este orden: **Ocupación** (por defecto), **Potrero** (uno por potrero, distinto de sus vecinos), **Pastura** (en tres familias) y **Uso**, con leyenda. Etiqueta con el nombre y, según el modo, hectáreas, uso, pastura o animales por categoría; las etiquetas no se superponen (de lejos se ve la del más grande; las demás aparecen al acercarse). Pantalla completa y Encuadrar.
  - **Panel del potrero:** al costado en la computadora; en el celular sube desde abajo, resumido, con "Ver detalle".
  - **Dibujar y editar** (Geoman, MIT): tocando las esquinas, con los bordes pegados a los vecinos; área en vivo, superficie propuesta y aviso de diferencia; Borrar forma.
  - **Importar formas:** KML (Google Earth), GeoJSON o shapefile en zip (se pasa a grados con su `.prj`). Cada polígono va a un potrero existente (se sugiere el de igual nombre), a uno nuevo o a ninguno. Aviso si quedan superpuestos.
- Consulta ve todo (mapa, panel, historiales) y no ve ningún botón de carga.

## Imagen satelital: licencias (CONFIRMAR ANTES DE UN USO COMERCIAL)
- **Esri World Imagery** (ArcGIS Location Platform): con una clave en `.env.local` (`NEXT_PUBLIC_ESRI_API_KEY`). Mientras no haya clave se usa el servicio público `server.arcgisonline.com`: **solo para uso privado; para uso comercial, cargar la clave**. Según Esri, la suscripción permite apps comerciales; exige mostrar la atribución y prohíbe descargar, guardar o redistribuir los mosaicos (choca con un futuro modo sin señal). **Restringir la clave por dominio en el panel de Esri.**
- **IDE Uruguay** (`mapas.ide.uy`, WMTS del Mapa Base, capa `capa_base_ideuy_ideuy`): publicado como datos abiertos y sin restricciones de acceso declaradas en el servicio. Falta confirmar el texto de la licencia para uso comercial.
- **MapTiler**: el plan gratis es solo para uso no comercial. Descartado.

## Librerías
Leaflet 1.9.4, Geoman 2.18 (versión gratuita, MIT), `@turf/area` (área en vivo), `@tmcw/togeojson` (KML) y `shpjs` (shapefile). Se cargan solo en `/potreros`; las de importación, recién al elegir un archivo.

## Pendientes
- KMZ (hoy se pide guardarlo como KML desde Google Earth).
- UG/ha (unidades ganaderas por hectárea).
- Confirmar las licencias antes de un uso comercial y cargar la clave de Esri.
