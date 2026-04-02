# Campo Digital - Modelo de Datos

## Estructura general en Google Sheets

Un spreadsheet por establecimiento. Cada hoja (tab) es una tabla. Las tablas se relacionan entre sí mediante IDs.

---

## Hoja: establecimientos

Datos maestros del campo.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (EST + correlativo) | EST-001 |
| nombre | texto | sí | Nombre del campo | La Esperanza |
| departamento | select | sí | Departamento (lista de 19) | Rivera |
| localidad | texto | no | Referencia geográfica | Minas de Corrales |
| superficie_total | número | sí | Hectáreas totales | 850 |
| tipo | select | sí | Ganadero / Agrícola / Mixto | Mixto |
| propietario | texto | no | Nombre del titular | Juan Pérez |
| dicose | texto | no | Nro. DICOSE (formato XX.XXX.XXX) | 12.345.678 |
| fecha_alta | fecha | sí | Fecha de registro | 2026-04-01 |
| estado | select | sí | activo / inactivo | activo |
| observaciones | texto | no | Notas libres | |

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

## Hoja: movimientos_ganado

Registro de todos los movimientos del rodeo. Cada fila es un evento.

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|:-----------:|-------------|---------|
| id | texto | sí | Autogenerado (MOV + correlativo) | MOV-001 |
| establecimiento_id | ref | sí | FK a establecimientos.id | EST-001 |
| fecha | fecha | sí | Fecha del movimiento | 2026-04-01 |
| tipo_movimiento | select | sí | Compra / Venta / Nacimiento / Muerte / Traslado / Ajuste | Compra |
| categoria | select | sí | Categoría ganadera (ver parámetros) | Ternero |
| cantidad | número | sí | Cabezas | 50 |
| peso_promedio | número | no | Kg promedio por cabeza | 180 |
| potrero_origen | ref | no | FK a potreros.id (para traslados) | POT-001 |
| potrero_destino | ref | no | FK a potreros.id | POT-003 |
| precio_unitario | número | no | USD por cabeza o por kg | 2.10 |
| precio_total | número | no | Monto total de la operación | 18900 |
| comprador_vendedor | texto | no | Contraparte de la operación | Frigorífico Norte |
| observaciones | texto | no | Notas libres | Lote ingresado por ruta 5 |

**Nota**: El stock actual se calcula sumando/restando movimientos. No hay una hoja de "stock actual" porque se derivaría de esta tabla mediante fórmulas o consultas.

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
| asociado_a | texto | no | Ref. al movimiento o labor vinculado | MOV-001 |
| observaciones | texto | no | Notas libres | |

---

## Hoja: parametros

Listas de valores que alimentan los selects de la app. Se editan directamente en Sheets y la app los lee dinámicamente.

| Clave | Valores | Descripción |
|-------|---------|-------------|
| categorias_ganado | Ternero, Ternera, Novillo 1-2, Novillo +2, Vaquillona 1-2, Vaquillona +2, Vaca de cría, Vaca de invernada, Toro, Torito | Categorías ganaderas estándar Uruguay |
| departamentos | Artigas, Canelones, Cerro Largo, Colonia, Durazno, Flores, Florida, Lavalleja, Maldonado, Montevideo, Paysandú, Río Negro, Rivera, Rocha, Salto, San José, Soriano, Tacuarembó, Treinta y Tres | Los 19 departamentos |
| tipos_movimiento | Compra, Venta, Nacimiento, Muerte, Traslado, Ajuste | Tipos de movimiento ganadero |
| tipos_labor | Siembra, Fertilización, Herbicida, Insecticida, Fungicida, Cosecha, Laboreo, Otro | Tipos de labor agrícola |
| cultivos | Soja, Trigo, Cebada, Maíz, Sorgo, Arroz, Girasol, Pradera, Verdeo invierno, Verdeo verano, Otro | Cultivos principales Uruguay |
| rubros_ingreso | Venta de ganado, Venta de granos, Pastoreo, Arrendamiento, Otros ingresos | Rubros de ingreso |
| rubros_egreso | Compra de ganado, Insumos agrícolas, Veterinaria, Alimentación, Maquinaria, Personal, Fletes, Impuestos, Arrendamiento, Otros egresos | Rubros de egreso |
| tipos_pastura | Campo natural, Pradera, Verdeo, Rastrojo, Mejoramiento | Tipos de pastura |

---

## Relaciones entre tablas

```
establecimientos (1) ──> (N) potreros
establecimientos (1) ──> (N) movimientos_ganado
establecimientos (1) ──> (N) finanzas
potreros (1) ──> (N) lotes_agricolas
lotes_agricolas (1) ──> (N) labores
movimientos_ganado ──> potreros (origen/destino)
finanzas ──> movimientos_ganado / labores (asociado_a, opcional)
```

---

## Validaciones clave

| Regla | Tipo | Aplica a |
|-------|------|----------|
| Nombre único por establecimiento | bloquea | establecimientos |
| Superficie > 0 | bloquea | establecimientos, potreros |
| Suma potreros ≤ superficie total | advierte | potreros vs establecimiento |
| DICOSE formato XX.XXX.XXX | advierte | establecimientos |
| Al menos 1 potrero sugerido | sugiere | al crear establecimiento |
| Departamento válido (lista de 19) | bloquea | establecimientos |
| Fecha no futura (movimientos) | advierte | movimientos_ganado |
| Cantidad > 0 | bloquea | movimientos_ganado |
| Traslado requiere origen y destino | bloquea | movimientos_ganado |
| Monto > 0 | bloquea | finanzas |
| Superficie sembrada ≤ superficie potrero | advierte | lotes_agricolas |

---

## Convenciones de IDs

- Formato: PREFIJO-NNN (tres dígitos con ceros a la izquierda)
- Prefijos: EST (establecimiento), POT (potrero), MOV (movimiento), LOT (lote), LAB (labor), FIN (finanza)
- Se autogeneran en Apps Script al recibir un nuevo registro
- Nunca se reutilizan (monotónicamente crecientes)
