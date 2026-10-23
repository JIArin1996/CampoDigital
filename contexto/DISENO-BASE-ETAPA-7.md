# Campo Digital — Diseño de la base, Etapa 7: indicadores, economía y panel de inicio

> **Implementada (2026-10-23).** 7a: migración `20261022000400_indicadores_reproductivos` (`etapa7a_indicadores.sql` 12 OK) y pantalla Indicadores. 7b: migración `20261022000500_economia` (`etapa7b_economia.sql` 43 OK, auditoría 75 funciones), pantallas Economía, Cargar ingreso o gasto, Cargar precio y Rubros. 7c: bloques del inicio (economía del ejercicio, carencias, indicadores y últimas actividades), sin cambios en la base.

Estado: **aprobado** (2026-10-22).

Base:
- `00-ENFOQUE-V2.md`: sección 8, indicadores, y sección 10, economía.
- `MODELO-DE-DATOS-V2.md`: secciones 7, 10 y 11.
- `DISENO-BASE-ETAPA-6A.md`: `movimientos_economicos`, que compra y venta completan solas.
- `DISENO-BASE-ETAPA-6B.md` y `DISENO-BASE-ETAPA-6B2-DESTETE.md`: servicio, diagnóstico, parición, destete y temporada.

Marcas:
- **[Decidido]** sale de esos documentos.
- **[Propuesta]** es diseño a validar.
- **[Abierta]** necesita una decisión antes de escribir la migración.

Se mantiene lo de siempre:
- Se escribe solo por funciones `security definer` con `p_id` idempotente.
- Los registros no se borran: se anulan con motivo.
- Leen los miembros, salvo lo que se decida en la sección 7.
- Se aprueba con 0 FALLA, 0 OMITIDAS y 0 PREPARACIONES FALLIDAS.

---

## 1. Alcance y partición [Propuesta]

| Parte | Qué | Cambia la base |
|---|---|---|
| **7a. Indicadores reproductivos** | % preñez, % parición y % destete por especie y temporada | Solo vistas de lectura, sin tablas nuevas |
| **7b. Economía** | Carga manual de ingresos y gastos, marcar pagado, anular, rubros y resultado por rubro | Funciones nuevas, una columna y una vista |
| **7c. Panel de inicio** | Resultado del período, indicadores de la última temporada, cuentas pendientes y carencias vigentes | No |

**Orden recomendado: 7a, 7b y 7c.** La 7a solo lee datos que ya existen, así que es la de menos riesgo y se puede usar enseguida. La 7c usa lo de las dos anteriores.

**Fuera de la etapa 7:**
- tareas, vencimientos, avisos y calendario (Etapa 8);
- ganancia de peso por lote (queda como propuesta del modelo, sin fecha).

---

## 2. 7a. Indicadores reproductivos

### 2.1 Fórmulas [Decidido]

Todos sobre **vacas entoradas** (ovejas en ovinos):

| Indicador | Fórmula |
|---|---|
| % preñez | preñadas / entoradas |
| % parición | crías nacidas / entoradas |
| % destete | crías destetadas / entoradas |

Pueden pasar de 100 % con mellizos. Se muestran igual.

### 2.2 Nivel y temporada

- **Nivel** [Decidido, destete A6]: **establecimiento, especie y temporada**. No hay reparto por lote de madres.
- **Temporada** [Decidido, destete A5]: de julio a junio, según la fecha del **servicio**. Por ejemplo, la temporada 2025/26 junta los servicios del 1/7/2025 al 30/6/2026.

### 2.3 Qué entra en cada temporada [Propuesta]

| Dato | De dónde sale | A qué temporada va |
|---|---|---|
| **Entoradas** | `act_servicio.vacas_entoradas` de los servicios no anulados | La de la fecha del servicio. Si un lote tiene varios servicios en la misma temporada (repaso), cuenta **el mayor** [Supuesto A5: subestima si el repaso incluye vacas distintas]. Se suma por lote |
| **Preñadas** | `act_diagnostico.vacas_prenadas` | La del **último servicio del mismo lote anterior al diagnóstico**, siguiendo el linaje hacia atrás si el lote se dividió o unió |
| **Nacidas** | Crías vivas de las pariciones no anuladas (`actividad_lineas`), en el lote de madres | La del último servicio del lote de madres anterior a la parición, con la misma regla |
| **Destetadas** | Cabezas que salieron de los orígenes en destetes no anulados | La de las pariciones que alimentaron cada origen (sección 5 del diseño del destete) |

- Un diagnóstico, una parición o un destete sin servicio previo se cuenta aparte, como **"sin servicio registrado"**, para que se vea que falta cargar el servicio.
- Se calcula con una vista (`v_indicadores_reproductivos`), sin columnas nuevas. Por eso cada número se puede rastrear hasta las actividades que lo forman.
- **Origen con crías de dos temporadas** [Decidido, B1]: sus destetados van a la temporada de la **parición más antigua** de ese origen desde su último destete. La pantalla marca ese origen como **"caso mixto"**, para que se entienda por qué el % puede pasar de 100 en una temporada y quedar bajo en la otra.
- **[Supuesto]** Un diagnóstico o una parición se asigna al último servicio anterior **de hasta 450 días antes**; si el último es más viejo, cuenta como "sin servicio registrado". Con varios diagnósticos de un lote en la misma temporada cuenta **el último** (como el repaso: no se suman dos veces las mismas vacas).
- **% parición** [Decidido, B6]: con las crías vivas; las muertas se muestran al lado como dato.

### 2.4 Pantalla

**Indicadores**, desde Más:
- una tabla por especie con las temporadas: entoradas, preñadas, nacidas, destetadas y los tres porcentajes;
- un enlace "ver detalle" por temporada, con las actividades que suman en cada columna;
- los datos "sin servicio registrado" van en una fila aparte.

---

## 3. 7b. Economía

### 3.1 Lo que ya existe [Decidido]

- La tabla `movimientos_economicos` tiene: fecha, sentido (ingreso o egreso), rubro, concepto, contraparte, monto, moneda (USD o UYU con tipo de cambio cargado a mano), `monto_usd` calculado, actividad y lote opcionales, estado (pagado o pendiente), fecha de pago y anulación.
- Hoy solo la escriben la compra y la venta, cuando se carga el precio. Se anulan junto con su actividad.

### 3.2 Funciones nuevas [Propuesta]

| Función | Qué hace |
|---|---|
| `registrar_movimiento(p_id, establecimiento, fecha, sentido, rubro, concepto, contraparte, precio jsonb, actividad_id?, lote_id?)` | Carga manual de un ingreso o gasto: arrendamiento forestal, sueldos, insumos, impuestos, etc. Valida lo mismo que hoy valida la compra y la venta: monto, moneda, tipo de cambio y estado |
| `cargar_precio_actividad(p_id, actividad_id, precio jsonb)` | El precio que faltó en una compra o venta [Decidido en 6a]. El sentido sale de la actividad (compra: egreso; venta: ingreso). Solo si la actividad no está anulada y no tiene un movimiento vigente |
| `marcar_pagado(movimiento_id, fecha_pago)` | Pasa de pendiente a pagado. Es el único cambio que admite un movimiento |
| `anular_movimiento(movimiento_id, motivo)` | Solo los cargados a mano. Los de una actividad se anulan anulando la actividad |

- Para distinguir los cargados a mano se agrega la columna `origen` (`actividad` o `manual`). Los movimientos existentes quedan como `actividad`.
- Un movimiento no se edita. Si está mal, se anula y se carga de nuevo, igual que las actividades.

### 3.3 Rubros [Propuesta]

- Hoy la compra y la venta eligen el rubro buscando uno que se llame igual que la especie. Si se renombra, se rompe. Está anotado en la 6b.
- **Propuesta:** `especies.rubro_id`, que es el rubro por defecto de la especie y elige el administrador en Especies. La migración lo completa con la regla actual (mismo nombre).
- **Pantalla de rubros** (solo administrador): alta, renombrar y dar de baja si no tiene movimientos vigentes. Los cuatro de siempre ya existen: Vacunos, Ovinos, Forestación tercerizada y General.

### 3.4 Resultado por rubro

- Vista `v_resultado_rubro`: ingresos, egresos y resultado en USD, por rubro y mes, sin anulados. La app suma los meses del período elegido.
- **Período** [Decidido, B2]: ejercicio de julio a junio por defecto, con opción de año calendario.
- **Fecha que cuenta** [Decidido, B3]: **devengado** (fecha del movimiento): una venta de octubre cuenta en octubre aunque se cobre en diciembre. Aparte, una vista de **pendientes** (por cobrar y por pagar).
- **Compras y ventas sin precio** [Decidido]: lista visible en Economía y en el inicio, para que el resultado no subestime ingresos o gastos sin que se note.
- **Un solo movimiento vigente por actividad** [Decidido]: además de la validación en la función, un índice único parcial (`actividad_id` donde no está anulado).
- Todas las vistas de plata (`v_resultado_rubro`, pendientes, sin precio) con `security_invoker = true`, para que respeten la política de lectura.

### 3.5 Pantallas

- **Economía**, desde Más:
  - lista de movimientos con filtros por período, rubro, sentido y estado;
  - botón "Cargar ingreso o gasto";
  - en cada movimiento pendiente, "Marcar pagado".
- **Resultado:** la tabla por rubro del período (ingresos, egresos, resultado) y un total.
- **Pendientes:** por cobrar y por pagar, del más viejo al más nuevo.
- **Compra o venta sin precio:** el detalle de la actividad ofrece "Cargar precio".

---

## 4. 7c. Panel de inicio [Propuesta]

Lo que hoy tiene se mantiene: stock (hoy o a una fecha), ideas abiertas y últimas notas. Se suma:

1. **Resultado del período** (ejercicio en curso): ingresos, egresos y resultado, con enlace a Economía.
2. **Pendientes:** total por cobrar y por pagar, con enlace.
3. **Indicadores de la última temporada** con datos: preñez, parición y destete.
4. **Carencias vigentes:** lotes en carencia hoy y hasta cuándo, como aviso para no vender.
5. **Últimas actividades:** las 5 más recientes.

Los bloques de economía se muestran solo a quien puede ver la economía [Decidido, B4]. La lista de compras y ventas sin precio también va en el inicio.

---

## 5. Permisos

**Quién ve y quién carga la economía** [Decidido, B5: opción b]. Hoy cualquier miembro, incluso Consulta, puede **leer** los movimientos. Opciones que se evaluaron:

| | Ver | Cargar, marcar pagado y anular |
|---|---|---|
| **a)** Como el resto | todos los miembros | administrador y operador |
| **b)** Más reservado | administrador y operador | administrador y operador |
| **c)** Solo administrador | administrador | administrador |

Se eligió **b)**: el operador carga gastos del día a día y Consulta no ve plata.
- La política de lectura de `movimientos_economicos` pasa a `puede_operar`.
- Verificado en la base: `act_compraventa` no tiene columnas de dinero (solo modalidad, contraparte y kg al gancho). Todo el dinero vive en `movimientos_economicos`, así que no hace falta ocultar columnas.
- Los movimientos copian la contraparte de la actividad al crearse y no se editan por separado.
- Consulta sigue viendo que hubo una venta, los kilos y la contraparte, pero no el precio.

Los indicadores reproductivos los ven todos los miembros, como el resto de los datos productivos.

---

## 6. Pruebas

- **`etapa7a_indicadores.sql`:**
  - con servicios, diagnósticos, pariciones y destetes de dos temporadas, comprueba los totales y porcentajes de cada una;
  - casos: repaso (cuenta el mayor), lote dividido entre el servicio y la parición (sigue el linaje), parición sin servicio (va a "sin servicio registrado"), actividades anuladas (no cuentan);
  - permisos de lectura.
- **`etapa7b_economia.sql`:**
  - movimiento manual en USD y en UYU, con validaciones;
  - precio cargado después a una compra y a una venta; rechazo si ya tiene precio o está anulada;
  - marcar pagado; anular uno manual; rechazo al anular uno de actividad;
  - rubro por defecto desde la especie;
  - resultado por rubro sin anulados, y pendientes;
  - venta de 15.000 crea un ingreso vigente de 15.000; compra de 20.000, un egreso vigente de 20.000; en USD y en UYU (`monto_usd` según el tipo de cambio);
  - precio cargado dos veces: rechazado (función e índice único);
  - anular la actividad anula su movimiento y deja de contar en el resultado;
  - Consulta lee `movimientos_economicos` y cada vista de plata: vacío o error.
- Se vuelven a correr todas, con el script `supabase/scripts/correr-pruebas.mjs`, y la auditoría, que suma las funciones nuevas.

---

## 7. Decisiones (cerradas el 2026-10-22)

| # | Pregunta | Decisión |
|---|---|---|
| B1 | Destetados de un origen con pariciones de dos temporadas | A la temporada de la parición más antigua desde su último destete; la pantalla lo marca como "caso mixto" |
| B2 | Período del resultado | Ejercicio de julio a junio por defecto, con opción de año calendario |
| B3 | Fecha que cuenta para el resultado | Devengado, con una vista aparte de pendientes |
| B4 | Bloques de economía en el inicio | Solo para quien puede ver la economía |
| B5 | Quién ve y quién carga la economía | b) Administrador y operador ven y cargan; Consulta no ve plata |
| B6 | % parición | Crías vivas; las muertas al lado como dato |
| B7 | Orden | 7a, 7b y 7c |
