# Campo Digital — Requerimientos Funcionales: Módulo Movimientos

---

## Consideraciones generales

- El módulo Movimientos es el único punto de ingreso de caravanas SNIG al sistema. El módulo Animales no se usa para ingresar animales, solo para consultar y gestionar los ya existentes.
- Una caravana SNIG tiene 15 dígitos y los primeros 8 deben ser "8580000".
- El sexo se muestra y guarda siempre como **H** (hembra) o **M** (macho). El Excel también acepta "Hembra" y "Macho" como entrada, pero el sistema convierte y guarda siempre H o M.
- Todo DICOSE (Físico o de Propiedad) tiene asociado una Razón Social y un Domicilio o Paraje.
- El DICOSE Físico del establecimiento se trae automáticamente del vinculado al establecimiento donde se está operando. No se ingresa manualmente.
- Todos los modales excepto Nacimiento y Cambio de Potrero requieren obligatoriamente:
  - Serie y Número de Guía
  - Número de Autorización

---

## Tipos de Movimientos

---

### 1. INGRESOS
Caravanas SNIG que entran al stock ganadero del establecimiento.

---

#### 1.1 Nacimiento
Animales nacidos en el establecimiento.

**Campos del modal:**
| Campo | Obligatorio | Notas |
|-------|:-----------:|-------|
| Fecha de Nacimiento | sí | Misma para todos los animales del lote |
| Fecha de Registro | sí | Fecha en que se carga el movimiento |
| DICOSE Propiedad | sí | Se selecciona de los cargados en el establecimiento. Queda asociado a cada caravana hasta que sufra un cambio. |
| DICOSE Físico del Establecimiento | automático | Solo lectura. Se trae del establecimiento activo. |

**Carga de animales:** manual (una caravana por vez) o masiva por Excel.

**Formato del Excel:**
| Columna | Campo | Obligatorio | Validación |
|---------|-------|:-----------:|------------|
| A | Caravana SNIG | sí | 15 dígitos, empieza por 8580000 |
| B | Sexo | sí | H / M o Hembra / Macho. Se guarda siempre como H o M. |

**Lógica al guardar:**
- Se crea un registro en `animales` por cada caravana.
- La edad se calcula como los meses transcurridos desde la Fecha de Nacimiento hasta la Fecha de Registro.
- La categoría se calcula automáticamente según sexo y edad.
- El DICOSE Físico y DICOSE Propiedad quedan asociados a cada caravana.

---

#### 1.2 Compra
Animales adquiridos de otro productor o empresa.

**Campos del modal:**
| Campo | Obligatorio | Notas |
|-------|:-----------:|-------|
| Fecha de Compra | sí | |
| Serie y Número de Guía | sí | |
| Número de Autorización | sí | |
| DICOSE Propiedad Vendedor | sí | No requiere estar cargado previamente. Solo se valida el formato. |
| DICOSE Propiedad del Establecimiento | sí | Se selecciona de los cargados en el establecimiento. |
| DICOSE Físico Vendedor | sí | No requiere estar cargado previamente. Solo se valida formato (9 dígitos numéricos). |
| DICOSE Físico del Establecimiento | automático | Solo lectura. Se trae del establecimiento activo. |
| Peso promedio por animal (kg) | no | El sistema calcula automáticamente el peso total. |
| Peso total del lote (kg) | calculado | Automático: peso promedio × cantidad de animales del Excel. |
| Valor total de la compra (USD) | no | Monto total del lote. |
| Comentario | no | |

**Carga de animales:** masiva por Excel (obligatorio).

**Formato del Excel:**
| Columna | Campo | Obligatorio | Validación |
|---------|-------|:-----------:|------------|
| A | Caravana SNIG | sí | 15 dígitos, empieza por 8580000 |
| B | Sexo | sí | H / M o Hembra / Macho. Se guarda siempre como H o M. |
| C | Edad en meses | sí | Número entero ≥ 0 |

**Lógica al guardar:**
- Se crea un registro en `animales` por cada caravana.
- La edad ingresada en el Excel es la edad al momento de la compra. A partir de ahí el sistema la hace crecer con el tiempo.
- La categoría se calcula automáticamente según sexo y edad.
- El DICOSE Propiedad del establecimiento queda asociado a cada caravana.

---

### 2. EGRESOS
Caravanas SNIG que salen del stock ganadero.

**Validación previa:** el sistema debe verificar que cada caravana del Excel esté activa en el stock antes de procesar el egreso. Si alguna no existe o ya egresó, se muestra error por fila antes de guardar.

Los tres subtipos tienen los mismos campos. La diferencia es el tipo de contraparte. Venta a Frigorífico agrega el campo Número de Tropa.

---

#### 2.1 Venta a Productor
#### 2.2 Venta a Frigorífico
#### 2.3 Venta en Consignación

**Campos del modal:**
| Campo | Obligatorio | Aplica a | Notas |
|-------|:-----------:|----------|-------|
| Fecha de Venta | sí | todos | |
| Serie y Número de Guía | sí | todos | |
| Número de Autorización | sí | todos | |
| DICOSE Propiedad de los animales vendidos | automático | todos | Se trae de las caravanas del Excel. Solo lectura. |
| DICOSE Propiedad del Comprador | sí | todos | No requiere estar cargado previamente. Solo se valida el formato. |
| DICOSE Físico del Establecimiento | automático | todos | Solo lectura. Se trae del establecimiento activo. |
| DICOSE Físico del Comprador | sí | todos | No requiere estar cargado previamente. Solo se valida el formato. |
| Peso promedio por animal (kg) | no | todos | El sistema calcula automáticamente el peso total. |
| Peso total del lote (kg) | calculado | todos | Automático: peso promedio × cantidad de animales. |
| Precio total de venta (USD) | no | todos | Monto total del lote. |
| Número de Tropa | sí | solo Frigorífico | Número de tropa asignado por el frigorífico. |
| Comentario | no | todos | |

**Carga de animales:** masiva por Excel (obligatorio).

**Formato del Excel:**
| Columna | Campo | Obligatorio | Validación |
|---------|-------|:-----------:|------------|
| A | Caravana SNIG | sí | Debe estar activa en el stock del establecimiento |

**Lógica al guardar:**
- El estado de cada caravana en `animales` pasa a `egresado`.
- Se registra el movimiento con todos los datos del modal.

---

### 3. TRASLADOS

---

#### 3.1 Traslado entre Establecimientos
Animales que se mueven físicamente de un establecimiento a otro. Ambos establecimientos deben estar previamente cargados en el sistema.

**Campos del modal:**
| Campo | Obligatorio | Notas |
|-------|:-----------:|-------|
| Fecha de Traslado | sí | |
| Serie y Número de Guía | sí | |
| Número de Autorización | sí | |
| DICOSE Físico Origen | automático | Solo lectura. Se trae del establecimiento activo. |
| Establecimiento Destino | sí | Se selecciona de los establecimientos cargados en el sistema. |
| DICOSE Físico Destino | automático | Se trae automáticamente del establecimiento destino seleccionado. Solo lectura. |
| DICOSE Propiedad Destino | sí | Se selecciona de los DICOSE Propiedad del establecimiento destino. |
| Comentario | no | |

**Carga de animales:** masiva por Excel (obligatorio).

**Formato del Excel:**
| Columna | Campo | Obligatorio | Validación |
|---------|-------|:-----------:|------------|
| A | Caravana SNIG | sí | Debe estar activa en el stock del establecimiento origen |

**Lógica al guardar:**
- El `establecimiento_id` de cada caravana en `animales` se actualiza al establecimiento destino.
- El DICOSE Físico asociado a cada caravana se actualiza al del establecimiento destino.
- El DICOSE Propiedad se actualiza al seleccionado para el destino.
- Se registra el movimiento con origen y destino.

---

#### 3.2 Cambio de Potrero
Animales que se mueven dentro del mismo establecimiento. Solo cambia el potrero asignado.

**Campos del modal:**
| Campo | Obligatorio | Notas |
|-------|:-----------:|-------|
| Fecha | sí | |
| Potrero Destino | sí | Se selecciona de los potreros activos del establecimiento. |
| Comentario | no | |

**Carga de animales:** masiva por Excel (obligatorio).

**Formato del Excel:**
| Columna | Campo | Obligatorio | Validación |
|---------|-------|:-----------:|------------|
| A | Caravana SNIG | sí | Debe estar activa en el stock del establecimiento |

**Lógica al guardar:**
- El `potrero_actual` de cada caravana en `animales` se actualiza al potrero destino.
- No cambia DICOSE Físico ni DICOSE Propiedad.

---

### 4. AFECTACIONES
Cambio de titularidad legal de los animales sin movimiento físico. El animal permanece en el mismo establecimiento y potrero. Solo cambia el DICOSE Propiedad asociado a cada caravana.

Los tres subtipos funcionan de la misma manera. La diferencia es solo el motivo de la afectación.

---

#### 4.1 Afectación a Fideicomiso
#### 4.2 Afectación a Capitalización
#### 4.3 Afectación a Consignación sin Movimiento

**Campos del modal:**
| Campo | Obligatorio | Notas |
|-------|:-----------:|-------|
| Fecha | sí | |
| Serie y Número de Guía | sí | |
| Número de Autorización | sí | |
| DICOSE Propiedad Actual | automático | Solo lectura. Se trae de las caravanas del Excel. |
| DICOSE Propiedad Nuevo Titular | sí | Debe estar previamente cargado en el establecimiento. |
| Comentario | no | |

**Carga de animales:** masiva por Excel (obligatorio).

**Formato del Excel:**
| Columna | Campo | Obligatorio | Validación |
|---------|-------|:-----------:|------------|
| A | Caravana SNIG | sí | Debe estar activa en el stock del establecimiento |

**Lógica al guardar:**
- El `dicose_propiedad_id` de cada caravana en `animales` se actualiza al nuevo titular.
- No cambia establecimiento ni potrero.
- Se registra el movimiento con el DICOSE Propiedad anterior y el nuevo.

---

## Resumen de campos por tipo de movimiento

| Campo | Nacimiento | Compra | Ventas | Traslado Est. | Cambio Potrero | Afectaciones |
|-------|:----------:|:------:|:------:|:-------------:|:--------------:|:------------:|
| Fecha | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Serie y Nro. Guía | — | ✅ | ✅ | ✅ | — | ✅ |
| Nro. Autorización | — | ✅ | ✅ | ✅ | — | ✅ |
| DICOSE Físico Establecimiento | auto | auto | auto | auto | — | — |
| DICOSE Físico externo | — | ✅ vendedor | ✅ comprador | auto destino | — | — |
| DICOSE Propiedad Establecimiento | ✅ | ✅ | auto | — | — | auto actual |
| DICOSE Propiedad externo | — | ✅ vendedor | ✅ comprador | — | — | — |
| DICOSE Propiedad nuevo titular | — | — | — | ✅ destino | — | ✅ |
| Potrero destino | — | — | — | — | ✅ | — |
| Peso promedio | — | ✅ | ✅ | — | — | — |
| Peso total (calculado) | — | ✅ auto | ✅ auto | — | — | — |
| Valor / Precio total | — | ✅ | ✅ | — | — | — |
| Nro. Tropa | — | — | solo Frigorífico | — | — | — |
| Comentario | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Excel de caravanas | ✅ o manual | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Formato estándar de validaciones DICOSE

| Tipo | Formato | Regex |
|------|---------|-------|
| DICOSE Físico | 9 dígitos numéricos | `/^\d{9}$/` |
| DICOSE Propiedad | 9 numéricos o 2 letras + 7 números | `/^\d{9}$/` o `/^[A-Za-z]{2}\d{7}$/` |
| Caravana SNIG | 15 dígitos, empieza por 8580000 | `/^8580000\d{8}$/` |
