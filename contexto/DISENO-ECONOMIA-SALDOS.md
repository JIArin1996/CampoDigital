# Campo Digital — Economía: quién pagó, saldos entre titulares, datos de factura, filtros y listado

Estado: **implementado** (2026-10-27). Decisiones E1 a E10 y permisos de Consulta cerrados por Iñaki (sección 9). Se implementó en los seis pasos de la sección 10, con una parada y aprobación en cada uno.

> **Cambio del 2026-10-27 (paso 2):** las razones sociales **no son un catálogo**. "Factura a nombre de" es un **texto** que se escribe en cada movimiento, con el RUT opcional (12 dígitos) y el número de comprobante; la app sugiere los nombres ya usados. Migración `20261027000200_factura_en_el_movimiento` (borra `razones_sociales` y `facturado_a_id`; suma `factura_nombre` y `factura_rut`). Las secciones de abajo ya lo reflejan.

> **Cambio del 2026-10-27 (paso 4):** cada movimiento tiene un **identificador** (el nombre propio, ej. "Venta terneras refugo"; hasta 120 caracteres) y un **comentario** (hasta 2000), los dos opcionales. El identificador es lo que más se destaca en el listado; el concepto del catálogo (ej. "Venta ganado") pasa a ser otra columna. Sin identificador se muestra el texto del movimiento ("Venta de 20 terneras" en una venta). El comentario se ve solo en el detalle. Migración `20261027000300_identificador_y_comentario`: `_guardar_pago_y_factura` lee `identificador` y `comentario` de `p_precio`, así que entran en todas las cargas y ediciones sin cambiar ninguna firma.

Base: `20261025000200` (conceptos y titulares), `20261025000300` (reparto entre titulares y edición), `20261025000400` (tipo de cambio del BCU).

---

## 1. Tres roles que no se mezclan

| Rol | Qué dice | Para qué se usa |
|---|---|---|
| **Titular** (reparto) | De quién es el ingreso o el gasto | Resultado económico de cada uno |
| **Pagado por / Cobrado por** (pagador) | De qué bolsillo salió la plata, o a cuál entró | Saldos: quién le debe a quién |
| **Factura a nombre de** (texto en el movimiento, con RUT opcional) | Dato del comprobante (fiscal o contable) | Nada más: ni saldos ni resultado |

Ejemplo:
- La veterinaria factura a nombre de Padre.
- La pagó Juan con su tarjeta.
- El gasto es de Hermanos.

Resultado: Hermanos le debe a Juan. Padre no entra en el saldo.

---

## 2. Lo que hay hoy (auditoría)

- **`pagado_por_titular_id` no existe**, ni en la base ni en las migraciones ni en el código (E1): no hay nada que reemplazar.
- El reparto está en `movimiento_titulares(movimiento_id, titular_id, monto)`:
  - Cada parte se guarda en la **moneda del movimiento** y la suma da el monto exacto.
  - La parte en dólares es `round(monto_usd × parte / monto_original, 2)`, como ya hace `v_resultado_detalle`.
- `registrar_movimiento`, `editar_movimiento`, `_registrar_movimiento` (compra y venta) y `cargar_precio_actividad` reciben el dinero en `p_precio jsonb`, que ya lleva `titulares`, `vencimiento` y `tipo_cambio_fecha`.
- `_fuente_tipo_cambio` decide si el tipo de cambio es del BCU o manual.
- **Catálogos actuales:**
  - **Rubros**, **Conceptos** y **Titulares** son tres entradas sueltas de Configuraciones.
  - Los edita el administrador y los leen los miembros.
  - Se borran solo si nadie los usa; si no, se dan de baja.
- **Consulta hoy no ve plata:** desde `20261022000500`, los movimientos, el reparto y la lista "sin precio" se leen con `puede_operar`. **Cambia en el paso 1** (sección 3.7).
- **No existe un componente "ResponsiveTable"** en el repo: hay que crearlo (sección 6).
- **Pruebas desactualizadas por las migraciones del 25/10:**
  - `etapa7b_economia.sql` todavía llama a `registrar_movimiento` con el concepto como texto, y la firma cambió a `p_concepto_id`.
  - La auditoría no suma las 8 funciones nuevas, los permisos de columna nuevos ni los de borrado de conceptos, grupos y titulares.
  - Se ponen al día en el paso 1.

### Impacto de mover Rubros a Configuraciones > Economía
- **Es solo navegación.** Los datos, las funciones y los permisos no cambian.
- La pantalla de Rubros también define **el rubro por defecto de cada especie** (`especies.rubro_id`), que toman la compra y la venta. Esa parte va dentro de la sección Rubros.
- **La usan otros módulos:**
  - Actividades: la compra y la venta eligen el rubro.
  - Economía: carga, filtros y resultado.
  - El alta de un establecimiento crea los rubros base.

  Ninguno enlaza a la pantalla `/rubros`, así que nada se rompe.
- **Las rutas viejas** `/rubros`, `/conceptos` y `/titulares` redirigen a la sección correspondiente.
- **Hallazgo al pasar:** al cargar una compra o una venta, la app propone el rubro buscando uno **con el mismo nombre que la especie**, en lugar de usar `especies.rubro_id`, que es lo que usa la base. Si se renombra un rubro, la propuesta de la pantalla y lo que guarda la base no coinciden. Se corrige en el paso 3.

---

## 3. Esquema

### 3.1 Pagadores
Tabla `pagadores`:
- **Columnas:** nombre, `titular_id` opcional ("es el titular X"), activo y auditoría. El nombre no se repite dentro del establecimiento.
- **Varios pagadores pueden ser del mismo titular**, por ejemplo "Juan efectivo" y "Juan tarjeta".
- **Sin datos semilla.**
- **Permisos (E4):**
  - Leen los miembros.
  - **Crean el administrador y el operador.**
  - **Editan, dan de baja o borran solo el administrador.** Se borra solo si nadie lo usa; si no, se da de baja.

### 3.2 Factura a nombre de (sin catálogo)
- Es un **texto** del movimiento (`factura_nombre`, hasta 120 caracteres), con el **RUT** opcional (`factura_rut`, 12 dígitos; E8) y el número de comprobante.
- No hay catálogo de razones sociales: se escribe al cargar cada ingreso o gasto, y la app sugiere los nombres ya usados.

### 3.3 Movimientos
- **Columnas nuevas en `movimientos_economicos`:** `pagador_id`, `factura_nombre`, `factura_rut`, `numero_comprobante` (texto de hasta 50 caracteres, sin blancos sueltos), `identificador` (hasta 120) y `comentario` (hasta 2000). Todas opcionales.
- **Sin cambiar la firma de ninguna función.** `registrar_movimiento`, `editar_movimiento`, `_registrar_movimiento` y `cargar_precio_actividad` leen claves nuevas de `p_precio`: `pagador_id`, `factura_nombre`, `factura_rut`, `numero_comprobante`, `identificador` y `comentario`. Se usa `create or replace`, que conserva los permisos.
- **Validación:** el pagador tiene que ser del establecimiento y estar activo, salvo que ya esté puesto en ese movimiento (al editar). El RUT se acepta con espacios, puntos o guiones y se guarda solo con dígitos.

### 3.4 Liquidaciones
Una liquidación "de A a B" significa **A le pasó plata a B**. Achica lo que A le debe a B, o agranda lo que B le debe a A. No es ingreso ni gasto: no entra en el resultado.

- **"De" y "a":** dos columnas por lado (`de_titular_id`/`de_pagador_id` y `a_titular_id`/`a_pagador_id`), exactamente una con valor, con clave foránea real a cada catálogo.
- **Plata:** moneda, monto y tipo de cambio con fuente y fecha (BCU o manual), con las mismas reglas que los movimientos. El monto en dólares se calcula solo.
- **Observación** opcional, y anulación con motivo. No se borran.
- **Permisos:** las leen los miembros, Consulta incluido. Nadie escribe directo.
- **Funciones:**
  - `registrar_liquidacion(p_id, p_establecimiento_id, p_fecha, p_de_tipo, p_de_id, p_a_tipo, p_a_id, p_precio, p_observacion)`:
    - idempotente por `p_id`;
    - el tipo de cambio se decide con `_fuente_tipo_cambio`;
    - "de" y "a" no pueden ser la misma parte (un pagador vinculado al titular X es X).
  - `anular_liquidacion(p_id, p_motivo)`. No se editan: se anulan y se cargan de nuevo (E5).

### 3.5 Saldos (vistas, en dólares)
**Partes.** Una parte es un titular, o un pagador **sin** titular vinculado. Un pagador vinculado al titular X **cuenta como X** (E3).

1. **`v_saldos_aportes`**: una fila por cada deuda, con fecha, origen (movimiento o liquidación), deudor, acreedor y monto en dólares.
   - **Movimientos que cuentan:** los **pagados** (E2), no anulados, con pagador y con reparto. Para cada titular del reparto distinto del pagador:
     - **Gasto:** el titular le debe al pagador su parte.
     - **Ingreso:** el pagador le debe al titular su parte.
   - **Liquidación de A a B:** genera "B le debe a A" por el monto. Al compensar, eso descuenta lo que A le debía a B.
2. **`v_saldos`**: compensa **cada par** con `sum(A→B) − sum(B→A)` y deja una fila por par con saldo distinto de cero. No simplifica cadenas como "A→B→C".
3. **`v_saldos_pendientes`**: **todos** los movimientos pagados y no anulados sin reparto o sin pagador (E9).

### 3.6 Último "Pagado por" de cada usuario (E6)
- **Tabla `preferencias_economia`**: usuario, establecimiento, último pagador y fecha.
- **Se escribe sola:** al cargar o editar un movimiento con pagador, la función guarda ese pagador para el usuario que cargó.
- **Permisos:** cada uno lee solo la suya. Nadie escribe directo.

### 3.7 Consulta lee la plata (opción A)
Era la decisión original y quedó mal implementada: **Consulta ve, en modo lectura, Movimientos, Resultado y Saldos.**
- **Pasan a la lectura de los miembros (`es_miembro`):**
  - movimientos y reparto;
  - liquidaciones;
  - las vistas de resultado, pendientes, sin precio y saldos;
  - y, por consecuencia, el precio en `v_actividades`.
- **Consulta no escribe nada:** todas las funciones de escritura siguen exigiendo poder cargar.
- **En la app** se ocultan los botones de carga y edición para Consulta (pasos 3 a 5).
- **Archivos de los movimientos:** siguen solo para quien carga, como hoy, porque no estaban en el pedido. Si se quieren abrir a Consulta, es un cambio chico aparte.

---

## 4. Ejemplo numérico

**Catálogos:**
- Titulares: **Hermanos**, **Madre** y **Juan**.
- Pagador **"Juan"**, vinculado al titular Juan.
- Factura a nombre de **Padre** (texto en el movimiento).

| # | Movimiento | Reparto (USD) | Pagó o cobró | Deudas que genera |
|---|---|---|---|---|
| 1 | Gasto veterinaria USD 1.500 (factura a nombre de Padre) | Hermanos 1.000 · Madre 500 | Pagó Juan | Hermanos → Juan 1.000; Madre → Juan 500 |
| 2 | Ingreso venta UYU 400.000 a 40,00 = USD 10.000 | Hermanos 6.700 · Madre 3.300 | Cobró Juan | Juan → Hermanos 6.700; Juan → Madre 3.300 |
| 3 | Gasto USD 300 | Juan 300 | Pagó Juan | ninguna (es su propio bolsillo) |
| 4 | Liquidación: Juan le pasa USD 2.000 a Madre | — | — | Madre → Juan 2.000 (descuenta lo que Juan le debe a Madre) |

**Compensación por par:**
- **Hermanos y Juan:** Hermanos le debe 1.000 y Juan le debe 6.700. **"Juan le debe USD 5.700 a Hermanos."**
- **Madre y Juan:** Juan le debe 3.300; en sentido contrario van 500 del gasto más 2.000 de la liquidación. 3.300 − 2.500 da **"Juan le debe USD 800 a Madre"**.
- **Padre** no aparece: es solo el dato de la factura.

**Resultado** (no cambia: lo da el reparto):
- Hermanos: +6.700 − 1.000 = **+5.700**
- Madre: +3.300 − 500 = **+2.800**
- Juan: **−300**

La liquidación no toca el resultado.

---

## 5. Configuraciones > Economía
- **Una sola entrada "Economía"** dentro de Configuraciones, en la ruta `/configuraciones/economia?seccion=…`. Tiene cuatro secciones: **Rubros**, **Conceptos**, **Titulares** y **Pagadores** (las razones sociales no tienen catálogo).
- **En el celular** son pestañas con desplazamiento horizontal; en la computadora, pestañas arriba.
- **Las rutas viejas** `/rubros`, `/conceptos` y `/titulares` redirigen a su sección.
- **Pagadores:** nombre, "Es el titular…" (opcional), activo.
- El operador puede **crear** pagadores (desde el formulario de carga). Editar, dar de baja o borrar lo hace solo el administrador.

---

## 6. Movimientos: filtros y listado

### Filtros (en la URL)
`?pestana=movimientos&tipo=egreso&tit=<id>&tit=<id>&pag=<id>&rub=<id>&con=<id>&fac=<nombre>&estado=pendiente|pagado&anulados=1`
`&periodo=mes&mes=2026-10 | periodo=anio&anio=2026 | periodo=rango&desde=…&hasta=…&orden=monto`

(Los de selección múltiple se repiten; sin `orden`, por fecha. La lógica está en `components/economia/movimientos/filtros.ts`.)

- **Tipo:** un selector segmentado siempre visible, Todos / Ingresos / Egresos.
- **Titulares, Pagador, Rubro, Concepto y Factura a nombre de** (entre los nombres usados en el período): selección múltiple. Además, Estado (pagados o pendientes) y Ver anulados (los anulados no suman).
  - **En el celular:** un botón **"Filtros (N)"** abre una hoja desde abajo, y los filtros activos se ven como chips con ✕.
  - **En la computadora:** los mismos selectores en una fila.
- **Período:** mes actual (por defecto), año o rango. Es **independiente** del ejercicio de Resultado (E7).
- **Totales arriba del listado:** ingresos, egresos y neto en dólares de lo filtrado.
- **Regla del titular:** al filtrar por titulares, los montos y los totales usan **solo la parte de los titulares elegidos**, y la fila muestra "USD 3.300 de 10.000".
- **Por pagador**, en cambio, se usa el **monto entero** (E10).

### Listado
- **Computadora**, en columnas: **Fecha | Identificador | Concepto | Rubro | Titular(es) | Pagado por | Monto USD**. El identificador va destacado.
  - Los montos van alineados a la derecha, con los ingresos en verde y los egresos en rojo, usando los colores del sistema de diseño.
  - Si el movimiento es en pesos, debajo del monto y en chico: "UYU 600.000 a 40,078 · BCU 23/10".
  - Titulares: hasta 2 con su porcentaje ("Hermanos 67 % · Madre 33 %"); si son más, "3 titulares", con el detalle al tocar.
  - Se ordena por fecha, de lo más nuevo a lo más viejo, y se puede ordenar por monto.
- **Celular:** una tarjeta de dos renglones.
  - Arriba: fecha e identificador a la izquierda, monto a la derecha.
  - Abajo, en chico: "Concepto · Rubro · Titular(es) · Pagó X" (el concepto no se repite si es igual al identificador).
  - Toques de 44 px.
- **Detalle del movimiento** (al tocar): todo, más el concepto, a nombre de quién es la factura, el RUT, el número de comprobante, el comentario y los archivos. El administrador y el operador marcan pagado, editan o anulan desde ahí.
- **Componente nuevo `TablaResponsiva`** (`components/shared`): tabla en la computadora y tarjetas en el celular. Lo usa Movimientos; Saldos es una lista de frases y no lo necesitó.
- **Archivos para Consulta:** no los ve (la base se los muestra solo a quien carga, como estaba).

---

## 7. Formulario de carga
1. **Orden de los campos:** tipo, fecha, identificador (opcional), concepto, rubro, monto y moneda (con el tipo de cambio del BCU), titulares y reparto, **Pagado por** (en los gastos) o **Cobrado por** (en los ingresos). El campo lleva la ayuda "De qué bolsillo salió la plata (no a nombre de quién está la factura)"; en los ingresos dice "entró".
2. **Al final, plegado en "Datos de factura":** a nombre de quién (texto, con los nombres ya usados como sugerencia), RUT opcional y número de comprobante. Después de los archivos, **Comentarios** (opcional).
3. **Por defecto, el último "Pagado por" de ese usuario** en ese establecimiento, guardado en la base (E6): se mantiene entre dispositivos.
4. **Lo mismo en el precio de la compra y la venta** de Actividades (`CamposPrecio` y `CargarPrecio`), que manda las claves en `p_precio`, con identificador y comentario.

---

## 8. Pantalla Saldos
- **Pestaña nueva "Saldos"** en Economía. La ven los tres roles; Consulta, sin botones.
- **Lista de frases**, de mayor a menor: "Hermanos le debe USD 1.240 a Juan".
- **Al tocar una frase**, se abre el detalle de ese par: los movimientos y liquidaciones que componen el saldo, con fecha, concepto, la parte en dólares y para qué lado suma.
- **"Registrar liquidación"** (Administrador y Operador), desde el detalle o arriba de la lista. Pide:
  - fecha, de (parte), a (parte), monto, moneda (con el tipo de cambio del BCU) y observación;
  - desde el detalle de un par, viene precargada con ese par y el monto del saldo.
- **"No entran en los saldos":** **todos** los movimientos pagados sin reparto o sin pagador (E9), con qué les falta y el botón "Completar" (editar). En la app se llama así para no confundirlo con la pestaña Pendientes (por cobrar y por pagar).
- **Lista "Liquidaciones"** (agregada al implementar): todas, con las anuladas tachadas y su motivo, y "Anular" para el administrador y el operador. Hace falta porque una liquidación que deja un par en cero desaparece de los saldos y no se podría anular desde el detalle.
- **En el celular** se ve como lista de tarjetas y el detalle se abre desde abajo; **en la computadora**, lista a la izquierda y detalle a la derecha.

---

## 9. Decisiones (cerradas el 2026-10-27)
| # | Pregunta | Decisión |
|---|---|---|
| **E1** | ¿Existe `pagado_por_titular_id`? | **No** (la consulta no devuelve filas): la migración no la borra |
| **E2** | ¿Cuentan los pendientes de pago o cobro en los saldos? | **No:** solo los pagados |
| **E3** | ¿El pagador vinculado cuenta como su titular? | **Sí** |
| **E4** | ¿Quién administra pagadores? | **Crean** administrador y operador. **Editan, dan de baja o borran** solo el administrador. (Las razones sociales no tienen catálogo: cambio del paso 2) |
| **E5** | ¿Las liquidaciones se editan? | **No:** se anulan y se cargan de nuevo |
| **E6** | ¿Dónde se recuerda el último "Pagado por"? | **Por usuario en la base** (`preferencias_economia`), no por dispositivo |
| **E7** | ¿Período de Movimientos independiente del ejercicio? | **Sí** |
| **E8** | ¿Validar el RUT? | **Sí**, 12 dígitos, opcional (se escribe en cada movimiento) |
| **E9** | ¿Filtro para las compras y ventas viejas en Pendientes? | **No:** Pendientes muestra todos |
| **E10** | ¿Al filtrar por pagador se usa la parte? | **No:** el monto entero |
| **Consulta** | ¿Ve la plata? | **Sí, en modo lectura** (opción A): Movimientos, Resultado y Saldos, sin ningún permiso de escritura. En la app, sin botones de carga ni edición |

---

## 10. Orden de implementación (una parada entre cada paso)
1. **Base** (`20261027000100_economia_saldos`):
   - pagadores, razones sociales y las columnas nuevas de movimientos;
   - las funciones de carga y edición leyendo las claves nuevas de `p_precio` y recordando el último pagador;
   - liquidaciones con sus dos funciones, y las tres vistas de saldos;
   - la lectura para Consulta.
   - **Pruebas:**
     - `economia_saldos.sql`: el ejemplo de la sección 4 con sus números exactos, los permisos de los tres roles, de otro establecimiento y sin sesión, las validaciones, y que una liquidación no cambia el resultado.
     - Se ponen al día `etapa7b_economia.sql` (firmas del 25/10 y lectura de Consulta) y `etapa6a_rls.sql` (Consulta ve los movimientos).
     - **Auditoría:** las funciones y los permisos del 25/10 y de este paso.
   - Vos aplicás y corrés; después, los tipos.
2. **Configuraciones > Economía:** las cuatro secciones, con Pagadores nuevo, y los redireccionamientos. Más la migración `20261027000200`: la factura pasa a ser texto en el movimiento.
3. **Formulario de carga:** el orden nuevo, Pagado por o Cobrado por, Datos de factura y el último pagador. Lo mismo en la compra y la venta, más la corrección del rubro por defecto. Sin botones de carga para Consulta.
4. **Movimientos:** `TablaResponsiva`, filtros en la URL, totales con la parte de cada titular, el detalle con factura y comprobante, y la lectura para Consulta. Más la migración `20261027000300`: identificador y comentario (pruebas: 57).
5. **Saldos:** frases, detalle por par, registrar y anular liquidaciones, y Pendientes.
6. **Cierre:** prueba de los tres roles, revisión en el celular, documentación y commit.
