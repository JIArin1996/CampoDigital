# Diseño: Editar y eliminar actividades; bitácora cerrada en el historial del lote

Estado: **implementado** (2026-11-04). Se hizo en los pasos de la sección 9, con parada y aprobación en cada uno. Las respuestas de la segunda revisión están en la sección 7.

| Paso | Migración y pruebas | Commit |
|---|---|---|
| 1. Eliminar, versiones y bitácora cerrada | `20261104000100_eliminar_actividades`, `tests/eliminar_actividades.sql` | `45e56ba` |
| 2a. Editar compra, venta y pesada | `20261104000200_editar_compra_venta_pesada`, `tests/editar_compra_venta_pesada.sql` | `60f0ec3` |
| 2b. Editar el resto de los tipos | `20261104000300_editar_resto_de_actividades`, `tests/editar_resto_de_actividades.sql` | `2552968` |
| 3. App: Editar y Eliminar; se borra el alias | `20261104000400_quitar_anular_actividad`, pruebas viejas al día | `d9881b3` |
| 4. App: bitácora del lote e historial | — | `a6d64ce` |

Cambia la regla de la Etapa 6a ("las actividades no se editan: si hay un error, se anula y se carga de nuevo", `DISENO-BASE-ETAPA-6A.md` §5). También cambia, solo para editar y eliminar actividades, la regla general "nunca borrar registros; los eventos de stock se corrigen con eventos de ajuste" (`contexto/README.md`). La sección 4.2 explica cómo se conserva el rastro.

## 1. Qué se pide

1. Las actividades **se editan y se eliminan**. Se saca la anulación.
2. En la ficha del lote, la bitácora asociada sigue apareciendo en su recuadro. Cuando una entrada **se cierra**, sale del recuadro y pasa al **historial del lote** como un punto más.

Decidido:

- **Eliminar:** la actividad desaparece de toda la app, pero en la base queda marcada y con su versión guardada.
- **Editar:** se puede cambiar todo menos el tipo: fecha, lote, categorías, cabezas, pesos, precio, detalle, notas y responsables.
- **Permisos:**
  - Editan el **Administrador y el Operador**.
  - Elimina **solo el Administrador**. El Operador no ve el botón y la función lo rechaza.
- **Qué se cierra:** las tareas **hechas** y **canceladas**, y las ideas **decididas** y **descartadas**.

## 2. Versiones anteriores (auditoría)

Tabla nueva **`actividad_versiones`**:

| Columna | Qué guarda |
|---|---|
| `id` | |
| `actividad_id` | |
| `version` | jsonb con la versión completa anterior: la fila de la actividad, las líneas, el detalle de su tipo, los lotes, los responsables, los eventos de stock y el movimiento económico asociado (con su reparto entre titulares) |
| `accion` | `edicion` o `eliminacion` |
| `hecha_por`, `hecha_en` | quién y cuándo |

- Se guarda **antes de cada edición y de cada eliminación**.
- **No se modifica ni se borra:** tiene un trigger que lo impide.
- **Sin pantalla por ahora.**
- **Permisos:** la lee solo el Administrador (`es_admin()`). Se escribe solo desde las funciones.

## 3. Eliminar

`eliminar_actividad(p_actividad_id)` reemplaza a `anular_actividad`. Es **solo para el Administrador** y no pide motivo.

1. Bloquea con `for update` la actividad y todos sus lotes, ordenados por id.
2. Guarda la versión en `actividad_versiones` (`accion = 'eliminacion'`).
3. **Borra sus eventos de stock**, con la misma excepción del trigger que la edición (sección 4.2). No inserta eventos inversos.
4. Valida el saldo día por día en los lotes y categorías que tenían esos eventos. Por ejemplo, no se elimina una compra si esos animales ya se vendieron: hay que eliminar primero la venta.
5. Como la anulación de hoy:
   - Anula el movimiento económico asociado (motivo "Actividad eliminada").
   - Revisa el cierre y la reapertura de **todos** sus lotes: reabre el que había cerrado una venta y cierra el que creó la actividad si queda vacío.
   - Mantiene las reglas del destete: no se elimina si los lotes de destino ya tuvieron otros movimientos o una pesada.
6. La marca como eliminada (quién y cuándo).

**Las eliminadas no se ven en ningún lado:** listas, línea de tiempo, historial del lote, indicadores y calendario.

- **Eventos de stock:** como se borran, no aparecen en el historial del lote ni en ninguna vista, sin filtros.
- **El resto de la actividad** (líneas, detalle, lotes y responsables) queda en la base, oculto, junto con la versión guardada.
- **Próximas dosis:** desaparecen solas del calendario (sección 6).
- **Las que hoy están anuladas** pasan a contar como eliminadas, así que dejan de verse. Se va el filtro "Ver anuladas".
  - La migración guarda la versión de cada una (`accion = 'eliminacion'`, con su motivo y la marca de que venía de una anulación).
  - Después borra sus eventos de stock: el original y el inverso. Como los dos tienen la misma fecha, el saldo de cada día no cambia. La migración lo verifica: si en alguna anulada los eventos no suman cero por lote, categoría y fecha, se detiene.
  - Los registros de reapertura y cierre de lotes que dejó la anulación quedan como están.

En la base, las columnas siguen llamándose `anulada_en`, `anulada_por` y `motivo_anulacion`, para no tocar todo lo que las usa. El motivo pasa a ser opcional: lo tienen las anuladas viejas y queda vacío en las eliminadas.

## 4. Editar

### 4.1 Cómo funciona

Hay una función por tipo, `editar_<tipo>(p_actividad_id, ...)`, con los mismos datos que su `registrar_<tipo>`. Todo pasa en una sola transacción: o se aplica la edición completa o no cambia nada.

1. **Bloquea** con `for update` la actividad y todos los lotes involucrados, los de la versión vieja y los de la nueva, ordenados por id.
2. Verifica el permiso de carga, que la actividad no esté eliminada, que el tipo coincida y las reglas de Economía (sección 5).
3. Guarda la versión anterior en `actividad_versiones` (`accion = 'edicion'`).
4. **Deshace** la versión vieja:
   - **Borra** sus eventos de stock, sus líneas, su detalle, sus lotes y sus responsables.
   - No inserta eventos inversos.
5. **Vuelve a cargar** con los datos nuevos:
   - Las funciones de registro se parten en dos: una crea la fila de la actividad y otra, compartida con la edición, carga lo demás.
   - La parte compartida recibe un parámetro para **saltear la validación de saldo**. Al registrar valida como hoy; al editar no.
   - Todas las demás validaciones son las mismas que al registrar.
6. **Valida el saldo una sola vez**, día por día, en todos los lotes y categorías tocados, los de antes y los de ahora, desde la fecha más vieja entre la original y la nueva.
   - Una compra de 10 que pasa a 12 se acepta aunque después se hayan vendido 8.
   - Una compra que baja de 10 a 5 se rechaza si ya se vendieron 8.
   - Un cambio de fecha que deja el stock negativo algún día se rechaza.
7. **Revisa el cierre y la reapertura** de todos los lotes involucrados, los viejos y los nuevos.
   - Ejemplo: una venta que pasa del lote A al lote B. A se reabre si había quedado cerrado por esa venta, y B se cierra si queda en cero.
   - Si un lote termina igual que antes, no se registra ni la reapertura ni el cierre.
8. Marca la actividad como editada (`editada_en` y `editada_por`). En el detalle se ve "Editada el ...".

La actividad **conserva su id**, así que se mantienen sus archivos, sus dosis dadas y sus vínculos con el calendario.

**Qué columnas de `actividades` se pueden cambiar** (trigger `proteger_actividad`):

| Columnas | Sin marca | Con la marca |
|---|---|---|
| `id`, `establecimiento_id`, `tipo`, `lote_creado_id`, `created_by`, `created_at` | no | **no, nunca** |
| `fecha`, `lote_id`, `notas`, `editada_en`, `editada_por` (edición) | no | sí |
| `anulada_en`, `anulada_por`, `motivo_anulacion` (eliminación) | no | sí, una sola vez y sin tocar los de la edición en el mismo cambio |
| Cualquiera, si la actividad ya está eliminada | no | no |

`lote_creado_id` no se cambia porque el destino de una compra o parición que creó un lote queda fijo (sección 4.3). Los responsables, las líneas y el detalle están en sus propias tablas: la edición los borra (con la marca) y los vuelve a cargar.

### 4.2 Borrar los eventos de stock: la excepción en los triggers

Lo revisé contra lo que ya existe:

- **Triggers:**
  - `lote_eventos` tiene el trigger `inmutable`, que rechaza todo `update` y `delete`.
  - Las líneas, los detalles, `actividad_lotes`, `actividad_responsables` y `act_sanidad_productos` tienen el mismo trigger.
  - `sanidad_dosis_dadas` tiene `sin_borrado`.
  - **Aprobado (P4):** esos triggers permiten borrar **solo** las filas de la actividad marcada.
    - La marca es local a la transacción: `set_config(..., is_local = true)`.
    - El trigger permite el `delete` solo si el `actividad_id` de la fila coincide con el de la marca.
    - Solo la ponen las funciones `editar_<tipo>` y `eliminar_actividad`.
    - Un `update` sigue rechazado siempre. La sanidad por id lo amplía en el paso 2b.
    - Desde la app nadie puede borrar de todos modos, porque esas tablas no dan permiso de `delete` a ningún usuario.
    - Pruebas: un `delete` sin marca, o con la marca de otra actividad, sigue rechazado.
- **FKs:** ninguna tabla apunta a `lote_eventos`, así que no hay nada que impida borrar.
- **Vistas:** el stock y el historial suman los eventos que hay. Al borrar y volver a insertar, el stock da bien sin tocar las vistas.
- **`operaciones_lote`:** el destete crea operaciones de lote, que también son inmutables. Le toca en el paso 2b.

El rastro de lo borrado queda en `actividad_versiones`, que guarda los eventos viejos. Recuperar una actividad eliminada sería volver a insertar sus eventos desde la versión. No hay pantalla para eso: se hace a mano si hace falta.

### 4.3 Casos especiales

- **Compra o parición que creó un lote nuevo:** al editar, el destino queda fijo en ese lote. Ya no se ofrece "lote nuevo" ni elegir otro. El nombre, el potrero y los años se cambian desde la ficha del lote.
  - **Fecha (decidido en el paso 2a):** la nueva no puede ser anterior a la apertura del lote, que es la fecha original de esa compra o parición. Se puede atrasar, pero no adelantar. La apertura del lote no se mueve.
- **Lote que se vuelve a cerrar sin registro (paso 2a):** un lote que estaba cerrado y después de la edición sigue vacío se cierra otra vez sin dejar registro.
  - Si se había cerrado en su último movimiento, como al vender todo, la fecha de cierre pasa a ser la del último movimiento después de la edición.
  - Si se había cerrado a mano en otra fecha, la conserva.
  - El registro de cierre anterior queda con su fecha, porque esos registros no se modifican.
- **Sanidad, productos por id:**
  - `act_sanidad_productos` tiene hoy como clave `(actividad_id, orden)` y `sanidad_dosis_dadas` apunta a esa posición. Se les agrega un `id` a los productos, y la marca de dosis dada pasa a apuntar a ese `id`. La migración convierte las marcas que ya existen.
  - Al editar, cada producto existente viaja con su `id`: si trae `id` se actualiza, si no trae se crea, y si falta se borra junto con su marca de dosis dada.
  - El orden queda solo para mostrar. Reordenar no mueve ninguna marca.
- **Destete:** se edita con la misma condición que para eliminarlo: los lotes de destino no tuvieron otros movimientos ni una pesada. Si los tuvieron, la app avisa que primero hay que eliminar esos movimientos.
  - **Destinos fijos (decidido en el paso 2b):** los destinos son los mismos lotes que creó el destete. No se agregan ni se sacan; para eso, se elimina el destete y se carga de nuevo.
  - **Qué se puede cambiar:** la fecha (sin adelantarla antes de la apertura de los destinos), los orígenes, las cabezas que salen y entran, las notas y los responsables.
  - **Orígenes:** el que queda vacío se cierra ("Destetado"). El que vuelve a tener animales se reabre ("Edición de destete").
  - **Linaje:** se rehace con las operaciones nuevas.
  - **Archivos heredados:** los de un origen que se saca quedan en los destinos.
- **Tipo:** no se cambia. Una pesada no pasa a ser una venta: para eso se elimina y se carga la otra.

## 5. Economía (compra y venta)

Al editar, el precio modifica **el mismo movimiento económico**. Así no se pierde el pagador, la factura, el identificador, el comentario ni los archivos que se le cargaron en Economía.

- Si se quita el precio, el movimiento se anula.
- Si se agrega un precio, se crea el movimiento.
- **No se recalcula nada por atrás.**

**Bloqueos** (con un aviso claro, sin cambiar nada):

- **Reparto entre titulares (P1).** Hoy todo reparto es por monto: cada titular tiene un monto y la suma da el total. No hay reparto por porcentaje. Si cambia el total del movimiento:
  - **Un solo titular** cuyo monto es igual al total actual: su monto sigue al total nuevo.
  - **Un solo titular con otro monto, o dos o más titulares:** se bloquea con "Ajustá primero el reparto en Economía".
  - **Sin titulares:** no hay nada que ajustar.
- **Pagos que superan el precio nuevo (P2):** la regla se cae. La base no tiene pagos parciales: un movimiento está pagado o pendiente, con un solo "Pagado por" y su fecha.

**Eliminar una compra o venta que ya tiene "Pagado por" o "Cobrado por":** pide una confirmación extra, porque cambian los saldos entre pagadores: "Este movimiento ya figura como pagado por X: al eliminarlo cambian los saldos entre pagadores".

## 6. Próximas dosis de sanidad

**Cómo está hoy:** las próximas dosis **no son tareas guardadas**.

- La vista `v_calendario` las calcula de `act_sanidad_productos.fecha_proxima_dosis`, solo para las actividades no anuladas.
- La marca de "dada" está en `sanidad_dosis_dadas`.
- No hay filas en `bitacora_entradas` que salgan de una dosis.

Por eso:

- **Al eliminar una sanidad,** sus próximas dosis desaparecen solas del calendario y del contador de vencidas. No hay nada que limpiar.
- **Al editar,** si cambia la fecha de la próxima dosis, el calendario la muestra en la fecha nueva. Si se quita la fecha o el producto, desaparece. No quedan huérfanas.
- **Marca "dada" (P3):**
  - Si la fecha de la próxima dosis no cambia, la marca se mantiene.
  - Si cambia, la marca se borra: una fecha nueva es una dosis que todavía no se dio.
  - Antes de guardar, el formulario de edición avisa: "Esta dosis figura como dada. Si cambiás la fecha, se desmarca".

## 7. Respuestas de la segunda revisión (2026-11-04)

- **P1. Un solo titular:** su monto sigue al total solo si hoy es igual al total del movimiento. Si no, o si hay dos o más titulares, se bloquea (sección 5).
- **P2. Pagos parciales:** la regla se cae. Queda la confirmación extra al eliminar una compra o venta con pagador.
- **P3. Dosis dada:** la marca se borra si cambia la fecha, con aviso en el formulario antes de guardar (sección 6).
- **P4. Excepción en los triggers:** aprobada, con las condiciones de la sección 4.2.
- **Eliminar también borra los eventos de stock,** en lugar de insertar inversos. Las anuladas que ya existen se convierten igual (sección 3).
  - **A favor:** editar y eliminar quedan con el mismo patrón y la misma excepción; no hay que filtrar eventos en las vistas; el saldo de cada día da igual.
  - **En contra:** `lote_eventos` deja de ser un libro al que solo se agrega, y el rastro queda solo en `actividad_versiones`.
- **Conversión de las marcas de dosis dada** a los ids de producto: tiene su propia prueba en el paso 2b.

## 8. Bitácora cerrada en el historial del lote

- **Columnas nuevas `cerrada_en` y `cerrada_por`** en `bitacora_entradas`: el momento en que una tarea pasa a hecha o cancelada, o una idea a decidida o descartada, y quién lo hizo.
  - Se borran si la entrada vuelve a pendiente o a abierta.
  - **Entradas que hoy ya están cerradas:**
    - Las tareas hechas toman `completada_en` y `completada_por`.
    - Las demás toman su última actualización, con `cerrada_por` vacío, porque hoy no se guarda quién las cerró.
- **Recuadro Bitácora del lote:** muestra las notas, las ideas abiertas y las tareas pendientes. Las cerradas no aparecen.
- **Historial del lote:** cada entrada cerrada que etiqueta al lote es un punto más, en la fecha en que se cerró. Muestra:
  - el tipo y el estado ("Tarea hecha", "Idea descartada", ...);
  - el texto y los responsables;
  - quién la cerró;
  - un enlace a la entrada.
- La pantalla **Bitácora** no cambia: ahí siguen todas.

## 9. Pasos (con parada y aprobación en cada uno)

- **1. Base, eliminar y bitácora:** `eliminar_actividad` (solo Administrador), `actividad_versiones`, el trigger, las vistas sin eliminadas, `editada_en` y `editada_por`, y `cerrada_en` y `cerrada_por`. Con pruebas.
   - Incluye la excepción de los triggers y la conversión de las anuladas que ya existen.
   - Las próximas dosis ya salen solas del calendario: alcanza con una prueba que lo verifique.
- **2a. Base, editar compra, venta y pesada:** con la partición de esas `registrar_<tipo>`. Pruebas:
   - Compra de 10 a 12 con 8 vendidas: se acepta.
   - Compra de 10 a 5 con 8 vendidas: se rechaza.
   - Cambio de fecha que rompe el saldo: se rechaza.
   - Venta que pasa del lote A al B: A se reabre y B se cierra si corresponde.
   - Precio: editar, quitar (se anula el movimiento) y agregar (se crea).
   - Bloqueos de Economía de la sección 5.
   - Compra con lote nuevo: el destino queda fijo.
   - Se guarda la versión anterior en `actividad_versiones`.
   - No quedan eventos de la versión vieja.

   **Parada para validar el patrón.**
- **2b. Base, editar los otros 8 tipos:** mortandad, parición, sanidad, servicio, diagnóstico, esquila, personalizada y destete. Incluye el `id` de los productos de sanidad. Pruebas por tipo, incluidas:
   - la sanidad por id: quitar un producto con la dosis dada, reordenar, y que las marcas de dosis dada que ya existían queden bien convertidas;
   - el destete con sus condiciones;
   - la parición con lote nuevo.
- **3. App, actividades:** Editar (`/actividades/[id]/editar`, el mismo formulario precargado), Eliminar (solo Administrador, con confirmación y el aviso extra si hay pagador), el aviso de la dosis dada y la limpieza de "anuladas" y del filtro "Ver anuladas".
- **4. App, ficha del lote:** el recuadro Bitácora sin las cerradas y los puntos nuevos en el historial.
- **5. Documentación:** este documento marcado como implementado, la nota en `DISENO-BASE-ETAPA-6A.md` §5 y en `00-ENFOQUE-V2.md`.

**Reglas:**

- Las migraciones las aplicás vos en Supabase.
- Las pruebas te las paso como SQL para pegar en el SQL Editor, con el resultado esperado.
- Antes de cada commit te muestro el diff. Rama `v2-gestion`.

## 10. Pruebas viejas que se espera que fallen (hasta el paso 3)

Desde la migración del paso 1, `anular_actividad` es un alias de `eliminar_actividad`: **solo la usa el Administrador** y **borra los eventos** en vez de insertar los inversos. Las pruebas de etapas anteriores que anulan actividades fallan por dos motivos:

- **(a) Anulan como Operador.** Ahora da `42501`.
- **(b) Verifican cómo quedaba una anulada:** eventos inversos, el motivo obligatorio, o la anulada visible en `v_actividades`.

Cuando la anulación falla, también fallan o quedan omitidas las verificaciones que dependen de ella.

| Archivo | Casos que fallan | Motivo |
|---|---|---|
| `etapa6a_rls.sql` | A01, A06, A08, A12, A14, A16, A19, A21 (anulan); A02, A07, A09, A10, A13, A15, A17, A18, A20 y A22 (dependen de esas anulaciones) | (a). Además, A07 y A18 esperan eventos inversos y A09 lee la anulada en `v_actividades`: fallarían igual como Administrador (b) |
| | A03, A04, A05, A11 | (a): esperaban `22023` o `23514` y ahora da `42501`. A04 ("sin motivo") fallaría igual como Administrador, porque el motivo ya no es obligatorio (b) |
| `etapa6b1_rls.sql` | A01 a A05, A08, A09 (anulan); A06, A10, K06, K08 (dependen) | (a) |
| `etapa6b2_rls.sql` | A01, A02 (esperaban `22023`), `anul_pe1` (preparación), A03 (anula el destete); A04 a A07 (dependen) | (a) |
| `cria_al_pie.sql` | P07 (anula); P08 (depende) | (a) |
| `etapa7a_indicadores.sql` | `anul_s_ls` (preparación); I07 (depende) | (a) |
| `etapa7b_economia.sql` | A05 (anula); A06, R01 (dependen: el resultado cuenta la compra que no se anuló) | (a) |
| `etapa8_tareas.sql` | `anular_san` (preparación); D08, D09 (dependen) | (a) |
| `lote_cerrado_no_se_edita.sql` | V03 (anula); V04, V05 (dependen) | (a) |
| `potreros_estadias.sql` | D02 (anula el destete); D03 (depende) | (a) |
| `responsables.sql` | C08 (anula la pesada) | (a) |

Siguen pasando las que esperan que Consulta, un usuario ajeno o anon **no** puedan anular, porque ahora también da `42501`: `etapa6a` Q07, X03 y N06, y `etapa6b1` Q07 y X06.

**Actualizadas en el paso 3** (migración `20261104000400`, que borra el alias):

- llaman a `eliminar_actividad` como Administrador;
- verifican que los eventos se borraron en lugar de buscar los inversos;
- sacan la prueba del motivo obligatorio.

Cada archivo tiene un ayudante `pruebas.eliminar(id)`, que elimina como Administrador y vuelve al usuario que estaba. Así las pruebas siguen en el mismo orden, con los mismos casos y la misma cantidad.

- `etapa6a` A04 ("anular sin motivo") pasa a ser "el Operador no elimina".
- En `eliminar_actividades`, E02 pasa a verificar que el alias ya no existe.
