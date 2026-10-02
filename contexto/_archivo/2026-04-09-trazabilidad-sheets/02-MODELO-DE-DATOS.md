# Campo Digital - Modelo de Datos

## Estructura general en Google Sheets

Un spreadsheet por establecimiento. Cada hoja (tab) es una tabla. Las tablas se relacionan entre sí mediante IDs.

---

## Hoja: establecimientos

Datos maestros del campo. Cada establecimiento tiene un DICOSE Físico único que identifica su ubicación geográfica ante el MGAP.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (EST + correlativo) | EST-001 |
| nombre | texto | sí | Nombre del campo | La Esperanza |
| departamento | select | sí | Departamento (lista de 19) | Rivera |
| localidad | texto | no | Referencia geográfica | Minas de Corrales |
| superficie_total | número | sí | Hectáreas totales | 850 |
| tipo | select | sí | Ganadero / Agrícola / Mixto | Mixto |
| propietario | texto | no | Nombre del titular del predio | Juan Pérez |
| dicose_fisico | texto | sí | DICOSE Físico del predio (9 dígitos numéricos) | 123456789 |
| fecha_alta | fecha | sí | Fecha de registro | 2026-04-01 |
| estado | select | sí | activo / inactivo | activo |
| observaciones | texto | no | Notas libres | |

**Nota sobre DICOSE Físico**: identifica la ubicación geográfica del predio ante el MGAP. Es único por establecimiento. Formato: 9 dígitos numéricos (ej: 123456789).

---

## Hoja: dicose_propiedad

Un establecimiento puede tener uno o más DICOSE de Propiedad asociados. El DICOSE de Propiedad identifica al titular legal de los animales, que puede ser distinto del dueño del predio (casos de capitalización, pastoreo, fideicomisos).

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (DCP + correlativo) | DCP-001 |
| establecimiento_id | ref | sí | FK a establecimientos.id | EST-001 |
| codigo | texto | sí | Código DICOSE Propiedad (9 dígitos: numéricos o 2 letras + 7 números) | AB1234567 |
| titular | texto | sí | Nombre del titular propietario de los animales | Fideicomiso Ganadero Norte |
| tipo_titular | select | sí | Productor / Fideicomiso / Empresa / Otro | Fideicomiso |
| estado | select | sí | activo / inactivo | activo |
| observaciones | texto | no | Notas libres | |

**Nota sobre DICOSE Propiedad**: formato de 9 caracteres. Puede ser todo numérico (ej: 123456789) o comenzar con 2 letras seguidas de 7 dígitos (ej: AB1234567). Es frecuente que un mismo predio tenga varios propietarios de animales (pastoreo, capitalización, fideicomisos).

---

## Hoja: potreros

Subdivisiones del establecimiento. Cada potrero pertenece a un establecimiento.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (POT + correlativo) | POT-001 |
| establecimiento_id | ref | sí | FK a establecimientos.id | EST-001 |
| nombre | texto | sí | Nombre o identificación | Potrero 1 - Frente |
| superficie | número | sí | Hectáreas del potrero | 120 |
| uso_actual | select | sí | Ganadería / Agricultura / Reserva / Sin uso | Ganadería |
| tipo_pastura | select | no | Campo natural / Pradera / Verdeo / Rastrojo | Campo natural |
| aguada | select | no | Sí / No | Sí |
| estado | select | sí | activo / inactivo | activo |
| observaciones | texto | no | Notas libres | |

---

## Hoja: animales

Registro individual de cada animal identificado por su caravana SNIG. Es la tabla central de trazabilidad. Cada fila representa un animal único en el sistema.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (ANI + correlativo) | ANI-001 |
| caravana_snig | texto | sí | Número de caravana SNIG (15 dígitos, empieza por 8580000) | 858000012345678 |
| establecimiento_id | ref | sí | FK al establecimiento donde está actualmente | EST-001 |
| dicose_propiedad_id | ref | sí | FK a dicose_propiedad.id (titular legal del animal) | DCP-001 |
| potrero_id | ref | no | FK a potreros.id (ubicación actual dentro del establecimiento) | POT-002 |
| sexo | select | sí | Macho / Hembra | Macho |
| fecha_nacimiento | fecha | no | Fecha exacta de nacimiento (si se conoce) | 2024-08-15 |
| edad_meses_ingreso | número | sí | Edad en meses al momento del primer ingreso al sistema | 14 |
| fecha_ingreso | fecha | sí | Fecha en que el animal ingresó al sistema por primera vez | 2026-01-10 |
| es_toro | booleano | no | Marca manual para toros (solo machos). Sobreescribe categoría automática | false |
| categoria_actual | texto | calculado | Categoría calculada automáticamente según sexo y edad (ver reglas) | Novillo 1-2 |
| estado | select | sí | activo / egresado / muerto | activo |
| observaciones | texto | no | Notas libres | |

### Reglas de categorización automática

La categoría se calcula a partir del sexo y la edad actual del animal. La edad actual se deriva de `edad_meses_ingreso` + meses transcurridos desde `fecha_ingreso`.

**Machos**:
- 0 a 11 meses → Ternero
- 12 a 23 meses → Novillo 1-2
- 24 a 35 meses → Novillo 2-3
- 36 meses o más → Novillo +3
- Marcado como `es_toro = true` → Toro (si ≥ 36 meses) o Torito (si < 36 meses)

**Hembras**:
- 0 a 11 meses → Ternera
- 12 a 23 meses → Vaquillona 1-2
- 24 a 35 meses → Vaquillona +2
- 36 meses o más → Vaca de Invernada

**Nota**: La categoría se recalcula dinámicamente. No se almacena como valor fijo, se deriva siempre del sexo y la edad al momento de la consulta. El campo `categoria_actual` en esta tabla es solo una referencia de conveniencia que se actualiza en cada movimiento.

---

## Hoja: movimientos_ganado

Registro de todos los movimientos del rodeo. Cada fila es un evento que afecta a UNA caravana individual. El stock se deriva de esta tabla.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (MOV + correlativo) | MOV-001 |
| lote_movimiento_id | ref | sí | FK a lotes_movimiento.id (agrupa movimientos del mismo evento) | LMV-001 |
| establecimiento_id | ref | sí | FK a establecimientos.id | EST-001 |
| animal_id | ref | sí | FK a animales.id (caravana individual) | ANI-047 |
| caravana_snig | texto | sí | Número de caravana SNIG (redundante para legibilidad) | 858000012345678 |
| fecha | fecha | sí | Fecha del movimiento | 2026-04-01 |
| tipo_movimiento | select | sí | Ver tipos abajo | Ingreso - Compra |
| subtipo | select | sí | Subtipo según tipo principal | Compra |
| dicose_propiedad_id | ref | sí | DICOSE Propiedad del animal en este movimiento | DCP-001 |
| potrero_id | ref | no | Potrero destino (en ingresos y traslados internos) | POT-002 |
| establecimiento_destino_id | ref | no | Para traslados entre establecimientos | EST-002 |
| peso_kg | número | no | Peso del animal en kg al momento del movimiento | 320 |
| precio_unitario | número | no | USD por cabeza o por kg (en compras/ventas) | 2.10 |
| precio_total | número | no | Monto total para este animal | 672 |
| contraparte | texto | no | Productor, frigorífico o consignatario de la operación | Frigorífico Norte |
| origen_excel | booleano | no | true si el registro vino de una carga masiva por Excel | false |
| observaciones | texto | no | Notas libres | |

### Tipos y subtipos de movimiento

| Tipo principal | Subtipo | Efecto en stock | Descripción |
|----------------|---------|-----------------|-------------|
| Ingreso | Nacimiento | + | Animal nacido en el establecimiento. Se crea la caravana en el sistema. |
| Ingreso | Compra | + | Animal adquirido de otro productor. Ingresa con edad declarada. |
| Egreso | Venta a Productor | - | Salida por venta a otro establecimiento ganadero. |
| Egreso | Venta a Frigorífico | - | Salida por faena. |
| Egreso | Venta en Consignación | - | Salida a remate o consignatario. |
| Egreso | Muerte | - | Baja por muerte. No implica venta. Se registra para cuadrar stock con DICOSE. |
| Traslado | Traslado entre Establecimientos | neutro* | El animal sale de un establecimiento y entra a otro. Genera 2 registros. |
| Afectación | Afectación a Fideicomiso | neutro | Cambio de DICOSE Propiedad sin cambio de ubicación física. |
| Reclasificación | Cambio de Categoría | neutro | Actualización manual de categoría (toro/torito). Sin efecto en cantidad. |

*El traslado entre establecimientos genera un egreso en el origen y un ingreso en el destino, cada uno con su propio registro en esta tabla.

---

## Hoja: lotes_movimiento

Agrupa los movimientos individuales que forman parte de un mismo evento (ej: una compra de 50 animales es 1 lote con 50 filas en movimientos_ganado). Permite ver el evento consolidado y cargar datos comunes una sola vez.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (LMV + correlativo) | LMV-001 |
| establecimiento_id | ref | sí | FK a establecimientos.id | EST-001 |
| fecha | fecha | sí | Fecha del evento | 2026-04-01 |
| tipo_movimiento | select | sí | Tipo principal del evento | Ingreso |
| subtipo | select | sí | Subtipo del evento | Compra |
| cantidad_animales | número | calculado | Total de caravanas en el lote | 50 |
| contraparte | texto | no | Contraparte común del lote | Establecimiento El Toro |
| precio_total_lote | número | no | Monto total de la operación | 45000 |
| origen_carga | select | sí | Manual / Excel | Excel |
| observaciones | texto | no | Notas del lote | Lote ingresado por ruta 5 |

**Nota**: La carga masiva desde Excel genera un `lote_movimiento` y N registros en `movimientos_ganado`, uno por caravana. La carga manual también genera ambos registros, pero de a un animal por vez o en lote con datos comunes.

---

## Hoja: lotes_agricolas

Registro de cultivos por lote y zafra.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (LOT + correlativo) | LOT-001 |
| establecimiento_id | ref | sí | FK a establecimientos.id | EST-001 |
| potrero_id | ref | sí | FK a potreros.id | POT-002 |
| zafra | texto | sí | Identificación de la zafra | 2025/2026 |
| cultivo | select | sí | Tipo de cultivo (ver parámetros) | Soja |
| superficie_sembrada | número | sí | Hectáreas sembradas | 150 |
| fecha_siembra | fecha | no | Fecha de siembra | 2025-10-15 |
| fecha_cosecha | fecha | no | Fecha de cosecha | 2026-04-20 |
| rendimiento | número | no | Kg/ha obtenidos | 2800 |
| estado | select | sí | En curso / Cosechado / Perdido | En curso |
| observaciones | texto | no | Notas libres | |

---

## Hoja: labores

Registro de labores agrícolas realizadas sobre los lotes.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (LAB + correlativo) | LAB-001 |
| lote_id | ref | sí | FK a lotes_agricolas.id | LOT-001 |
| fecha | fecha | sí | Fecha de la labor | 2025-10-15 |
| tipo_labor | select | sí | Siembra / Fertilización / Herbicida / Insecticida / Cosecha / Otro | Fertilización |
| insumo | texto | no | Producto utilizado | Urea granulada |
| dosis | texto | no | Dosis aplicada | 100 kg/ha |
| costo_total | número | no | Costo total de la labor en USD | 3500 |
| proveedor | texto | no | Quién realizó o proveyó | Cooperativa Agraria |
| observaciones | texto | no | Notas libres | |

---

## Hoja: finanzas

Registro de ingresos y egresos del establecimiento.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (FIN + correlativo) | FIN-001 |
| establecimiento_id | ref | sí | FK a establecimientos.id | EST-001 |
| fecha | fecha | sí | Fecha de la operación | 2026-04-01 |
| tipo | select | sí | Ingreso / Egreso | Ingreso |
| rubro | select | sí | Clasificación (ver parámetros) | Venta de ganado |
| concepto | texto | sí | Descripción breve | Venta 50 novillos a frigorífico |
| monto | número | sí | Monto en USD | 18900 |
| forma_pago | select | no | Efectivo / Transferencia / Cheque / Crédito | Transferencia |
| asociado_a | texto | no | Ref. al lote de movimiento vinculado | LMV-001 |
| observaciones | texto | no | Notas libres | |

---

## Hoja: parametros

Listas de valores que alimentan los selects de la app. Se editan directamente en Sheets y la app los lee dinámicamente.

| Clave | Valores | Descripción |
|-------|---------|-------------|
| categorias_ganado | Ternero, Ternera, Novillo 1-2, Novillo 2-3, Novillo +3, Vaquillona 1-2, Vaquillona +2, Vaca de Invernada, Toro, Torito | Categorías ganaderas. Se calculan automáticamente; esta lista se usa solo para filtros y reportes. |
| departamentos | Artigas, Canelones, Cerro Largo, Colonia, Durazno, Flores, Florida, Lavalleja, Maldonado, Montevideo, Paysandú, Río Negro, Rivera, Rocha, Salto, San José, Soriano, Tacuarembó, Treinta y Tres | Los 19 departamentos |
| tipos_movimiento | Ingreso, Egreso, Traslado, Afectación, Reclasificación | Tipos principales de movimiento ganadero |
| subtipos_ingreso | Nacimiento, Compra | Subtipos de ingreso al stock |
| subtipos_egreso | Venta a Productor, Venta a Frigorífico, Venta en Consignación, Muerte | Subtipos de egreso del stock |
| subtipos_traslado | Traslado entre Establecimientos | Subtipos de traslado |
| subtipos_afectacion | Afectación a Fideicomiso | Subtipos de afectación |
| tipos_labor | Siembra, Fertilización, Herbicida, Insecticida, Fungicida, Cosecha, Laboreo, Otro | Tipos de labor agrícola |
| cultivos | Soja, Trigo, Cebada, Maíz, Sorgo, Arroz, Girasol, Pradera, Verdeo invierno, Verdeo verano, Otro | Cultivos principales Uruguay |
| rubros_ingreso | Venta de ganado, Venta de granos, Pastoreo, Arrendamiento, Otros ingresos | Rubros de ingreso |
| rubros_egreso | Compra de ganado, Insumos agrícolas, Veterinaria, Alimentación, Maquinaria, Personal, Fletes, Impuestos, Arrendamiento, Otros egresos | Rubros de egreso |
| tipos_pastura | Campo natural, Pradera, Verdeo, Rastrojo, Mejoramiento | Tipos de pastura |
| tipos_titular | Productor, Fideicomiso, Empresa, Otro | Tipos de titular de DICOSE Propiedad |

---

## Relaciones entre tablas

```
establecimientos (1) ──> (N) dicose_propiedad
establecimientos (1) ──> (N) potreros
establecimientos (1) ──> (N) animales           (ubicación actual)
establecimientos (1) ──> (N) lotes_movimiento
establecimientos (1) ──> (N) finanzas
dicose_propiedad (1) ──> (N) animales           (titularidad legal)
potreros (1) ──> (N) animales                   (ubicación dentro del establecimiento)
potreros (1) ──> (N) lotes_agricolas
lotes_agricolas (1) ──> (N) labores
lotes_movimiento (1) ──> (N) movimientos_ganado
animales (1) ──> (N) movimientos_ganado
finanzas ──> lotes_movimiento                   (asociado_a, opcional)
```

---

## Validaciones clave

| Regla | Tipo | Aplica a |
|-------|------|----------|
| Nombre único por establecimiento | bloquea | establecimientos |
| Superficie > 0 | bloquea | establecimientos, potreros |
| Suma potreros ≤ superficie total | advierte | potreros vs establecimiento |
| DICOSE Físico: 9 dígitos numéricos | bloquea | establecimientos |
| DICOSE Propiedad: 9 caracteres (numérico o 2 letras + 7 números) | bloquea | dicose_propiedad |
| Caravana SNIG: 15 dígitos, empieza por 8580000 | bloquea | animales |
| Caravana SNIG única en todo el sistema | bloquea | animales |
| Al menos 1 DICOSE Propiedad por establecimiento | sugiere | al crear establecimiento |
| Al menos 1 potrero sugerido | sugiere | al crear establecimiento |
| Departamento válido (lista de 19) | bloquea | establecimientos |
| Fecha no futura (movimientos) | advierte | movimientos_ganado |
| Traslado entre establecimientos requiere establecimiento destino | bloquea | movimientos_ganado |
| Monto > 0 | bloquea | finanzas |
| Superficie sembrada ≤ superficie potrero | advierte | lotes_agricolas |
| es_toro solo aplica a machos | bloquea | animales |
| edad_meses_ingreso ≥ 0 | bloquea | animales |

---

## Convenciones de IDs

- Formato: PREFIJO-NNN (tres dígitos con ceros a la izquierda)
- Prefijos: EST (establecimiento), DCP (DICOSE propiedad), POT (potrero), ANI (animal), LMV (lote de movimiento), MOV (movimiento individual), LOT (lote agrícola), LAB (labor), FIN (finanza)
- Se autogeneran en supabase al recibir un nuevo registro
- Nunca se reutilizan (monotónicamente crecientes)

---

## Notas sobre el cálculo de stock

El stock actual no se almacena como tabla separada. Se calcula dinámicamente a partir de `movimientos_ganado`:

- **Stock por categoría**: contar animales con `estado = activo` en la tabla `animales`, agrupando por `categoria_actual`
- **Categoría actual**: se calcula en tiempo real según `sexo`, `edad_meses_ingreso` y meses transcurridos desde `fecha_ingreso`
- **Stock por potrero**: contar animales activos filtrando por `potrero_id`
- **Stock por DICOSE Propiedad**: contar animales activos filtrando por `dicose_propiedad_id`
