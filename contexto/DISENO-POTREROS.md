# Campo Digital — Rediseño del módulo Potreros

Estado: **en construcción** (2026-10-23). Paso 1 (auditoría y diseño) aprobado; paso 2 (migración `20261024000100_potreros_estadias_y_forma`) en revisión.

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
- **D4.** Imagen satelital: Esri World Imagery por defecto si hay clave configurada; si no, ortofotos de la IDE Uruguay. Selector de capa, con la infrarroja de la IDE incluida.
- **D5.** Diálogo de cambio: una sola fecha (hoy por defecto) y la opción "Hubo días sin potrero" para cargar la salida y el ingreso por separado.

## Imagen satelital: licencias (CONFIRMAR ANTES DE UN USO COMERCIAL)
- **Esri World Imagery** (ArcGIS Location Platform): se usa con una clave en `.env.local`. Según Esri, la suscripción permite apps comerciales; exige mostrar la atribución y prohíbe descargar, guardar o redistribuir los mosaicos (choca con un futuro modo sin señal). **Restringir la clave por dominio en el panel de Esri.**
- **IDE Uruguay** (`mapas.ide.uy`, WMTS de ortofotos, mosaico nacional 2017-2018 e infrarrojo): publicado como datos abiertos y sin restricciones de acceso declaradas en el servicio. Falta confirmar el texto de la licencia para uso comercial.
- **MapTiler**: el plan gratis es solo para uso no comercial. Descartado.

## Librería de mapas
Leaflet 1.9 con Geoman (versión gratuita, MIT) y Turf para el área, cargados solo en `/potreros` y solo en el navegador.
