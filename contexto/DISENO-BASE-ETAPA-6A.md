# Campo Digital — Diseño de la base, Etapa 6a (actividades que mueven stock)

Estado: **en revisión** (2026-10-16): incorpora la primera ronda de cambios (sección 9). Quedan abiertas las preguntas de la sección 8 y la parte de pesos (kg). No hay migraciones escritas. Base: `00-ENFOQUE-V2.md`, `MODELO-DE-DATOS-V2.md` (secciones 6 y 10), `DISENO-BASE-ETAPA-3.md` y `DISENO-BASE-ETAPA-5.md`.

Marcas: **[Decidido]** sale de esos documentos o de decisiones ya tomadas; **[Propuesta]** es diseño a validar.

Se mantienen los criterios de siempre: `uuid`, `created_by` sin FK, FKs compuestas con `establecimiento_id`, nada se borra, escrituras solo por funciones `security definer` que validan `puede_operar`, bloqueo del lote antes de leer el saldo, saldo acumulado ≥ 0 todos los días (`_validar_saldo`), y todo objeto nuevo nace sin permisos.

---

## 1. Alcance

| Entra en la 6a | Queda para después |
|---|---|
| **Pesada, mortandad, compra, venta y parición**: las que mueven stock o lo miden [Decidido, `MODELO` §12] | Sanidad, antiparasitario, servicio, diagnóstico, destete, esquila y personalizada (**6b**) |
| `movimientos_economicos`, que **compra y venta completan solas** [Decidido] | Carga manual de ingresos y gastos, resultado por rubro (**Etapa 7**) |
| Anular una actividad | Indicadores reproductivos (**Etapa 7**) |
| Pantallas: historial de actividades y formularios de las 5 | |

---

## 2. Tablas

### 2.1 actividades (registro común)

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| establecimiento_id | uuid | |
| tipo | text | 6a: `pesada`, `mortandad`, `compra`, `venta`, `paricion`. El `check` ya lista los 12 tipos del enfoque, para no migrarlo en la 6b [Propuesta] |
| fecha | date | no futura, no anterior a la apertura del lote |
| lote_id | uuid | el lote sobre el que se hizo. En una compra que crea lote, el lote nuevo [Decidido] |
| persona_id | uuid | responsable (catálogo personas) [Decidido] |
| notas | text | |
| anulada_en, anulada_por, motivo_anulacion | | igual que en la bitácora: los tres juntos [Propuesta] |
| created_by, created_at | | |

**Inmutable** salvo la anulación (ver sección 5): un trigger rechaza cualquier cambio que no sea completar los tres datos de anulación.

### 2.2 actividad_lineas (cabezas por categoría)

| Columna | Tipo | Nota |
|---|---|---|
| actividad_id | uuid | FK compuesta |
| establecimiento_id | uuid | |
| categoria_id | uuid | de la especie del lote |
| cabezas | int | `> 0` |
| peso_total_kg | numeric(10,1) | opcional; en la pesada, obligatorio |

PK `(actividad_id, categoria_id)`. El **peso promedio se calcula** (`peso_total_kg / cabezas`), no se guarda [Decidido]. Inmutable.

### 2.3 Detalles por tipo (uno a uno con la actividad; inmutables)

| Tabla | Columnas | |
|---|---|---|
| `act_compraventa` | `modalidad` (`productor`, `remate`, `frigorifico`, `otra`) [Decidido], `contraparte`, `kg_totales` (opcional) | compra y venta |
| `act_mortandad` | `causa` (valor de `parametros`, clave `causas_mortandad`), `observaciones` | [Decidido] |
| `act_paricion` | `lote_cria_id` (lote de crías, creado o existente) [Decidido], `nacidos_muertos` (int ≥ 0, default 0) [Decidido]. **Sin `servicio_id`**: se agrega en la 6b con su FK a `act_servicio` [Decidido] | el lote de madres es `actividades.lote_id` [Decidido] |

La **pesada** no tiene detalle: alcanza con las líneas.

### 2.4 lote_eventos: columna actividad_id

Se agrega `actividad_id` (FK compuesta a `actividades`) y la regla **en un solo sentido** [Decidido]: `check (tipo not in ('paricion','compra','venta','mortandad') or actividad_id is not null)`. Esos eventos siempre vienen de una actividad. **No se exige la inversa.**

`ALTER TABLE ... ADD COLUMN` no modifica filas existentes, así que no choca con el trigger de inmutabilidad. La regla se valida contra los datos actuales: ningún evento existente es de esos tipos.

**Signo de las cabezas** (verificado el 2026-10-16 en la migración `20261015000100`): `lote_eventos` **no tiene ningún check que ate el signo al tipo**; solo `cabezas <> 0`. Los eventos inversos de `anular_actividad` (mismo tipo, signo opuesto) entran sin cambios. No hay nada que relajar.

### 2.5 movimientos_economicos

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| establecimiento_id | uuid | |
| fecha | date | |
| sentido | text | `ingreso` o `egreso` |
| rubro_id | uuid | FK compuesta a `rubros` |
| concepto | text | |
| contraparte | text | opcional |
| monto_original | numeric(14,2) | `> 0` |
| moneda_original | text | `USD` o `UYU` [Decidido] |
| tipo_cambio | numeric(10,4) | pesos por dólar: **obligatorio con UYU, vacío con USD**, cargado a mano [Decidido] |
| monto_usd | numeric(14,2) | **columna calculada** (`generated always as ... stored`): `monto_original` si es USD; **`round(monto_original / tipo_cambio, 2)`** si es UYU [Decidido]. Nadie la escribe. Ejemplo: UYU 1000 con tipo de cambio 41,3333 → USD 24,19 |
| actividad_id | uuid | opcional; compra y venta lo completan solas [Decidido] |
| lote_id | uuid | opcional |
| estado | text | `pagado` o `pendiente` [Decidido] |
| fecha_pago | date | opcional [Decidido] |
| anulado_en, anulado_por, motivo_anulacion | | [Propuesta] |
| created_by, created_at, updated_at | | |

En la 6a **solo lo escriben `registrar_compra` y `registrar_venta`**. La carga manual, la edición (estado de pago) y el resultado por rubro son de la Etapa 7.

---

## 3. Funciones de registro

**Una función por tipo** [Decidido], en vez de una sola `registrar_actividad(tipo, datos jsonb)` como sugería el `MODELO`. Motivos: parámetros con tipo (los tipos generados los muestran en la app), validaciones claras por caso y pruebas más simples. Todas son atómicas y siguen el patrón de las operaciones de lote.

**Idempotencia** [Decidido]: cada `registrar_*` recibe `p_id uuid`, que la app genera al abrir el formulario y se usa como id de la actividad.

- Si llega un segundo intento con el mismo `p_id`, del **mismo establecimiento** y el **mismo `created_by`**, la función devuelve la actividad existente **sin duplicar** stock ni movimiento económico. Por ejemplo, un doble toque o un reintento con mala señal.
- Si ese `p_id` ya existe en **otro establecimiento** o lo cargó **otro usuario**: error `42501`.
- Dos intentos simultáneos con el mismo `p_id`: el segundo choca con la clave primaria (`unique_violation`), se captura y se aplica la misma regla.

| Función | Qué hace | Stock |
|---|---|---|
| `registrar_pesada(lote, fecha, lineas[{categoria, cabezas, peso_total_kg}], persona, notas)` | registra el peso por categoría | no cambia. **Valida que las cabezas pesadas no superen el stock de la categoría a esa fecha** [Propuesta] |
| `registrar_mortandad(lote, fecha, lineas[{categoria, cabezas}], causa, observaciones, persona, notas)` | baja por categoría | `-n` (tipo `mortandad`) |
| `registrar_compra(destino, fecha, lineas, compraventa{modalidad, contraparte, kg_totales}, precio{monto, moneda, tipo_cambio, estado, fecha_pago, rubro}, persona, notas)` | alta por categoría | `+n` (tipo `compra`). **Destino: un lote existente activo de la especie, o un lote nuevo** (nombre, especie, potrero, campaña) [Decidido] |
| `registrar_venta(lote, fecha, lineas[{categoria, cabezas, peso_total_kg}], compraventa, precio, persona, notas)` | baja por categoría | `-n` (tipo `venta`). Si el lote queda en cero, **se cierra solo** con el motivo "Vendido" [Propuesta] |
| `registrar_paricion(lote_madres, fecha, lineas[{categoria, cabezas}], nacidos_muertos, destino_cria, persona, notas)` | alta de crías vivas | `+n` (tipo `paricion`) **en el lote de cría**: uno existente o uno nuevo, por defecto "Terneros Nacidos <año>" (o "Corderos Nacidos <año>") [Decidido]. Los nacidos muertos **no** entran al stock |

**Precio** (compra y venta) [Propuesta]: **opcional**. Si viene, crea el movimiento económico (egreso en la compra, ingreso en la venta) con `actividad_id` y `lote_id`. El rubro se elige en la pantalla; por defecto es el que tiene el mismo nombre que la especie (Vacunos u Ovinos).

**Parición** [Decidido]:
- `actividades.lote_id` = **el lote de las madres**.
- Las crías vivas van al **lote de cría**, que se elige (uno existente) o se crea (no se adivina por el nombre).
- **Lote de cría existente: tiene que estar activo y ser de la misma especie que el de madres.** Las **categorías de las crías tienen que ser de esa especie**.
- **`nacidos_muertos`**: cantidad de crías nacidas muertas. Queda registrada para los indicadores y **no** suma stock.
- La señalada de ovinos se registra como parición [Propuesta].

---

## 4. Lectura

- **Historial de actividades** del establecimiento y del lote: tipo, fecha, lote, responsable, líneas (cabezas y peso promedio), detalle y, en compra y venta, el monto en USD.
- Vista `v_actividades` (`security_invoker`) con el total de cabezas y de kg por actividad, para listar sin cargar todas las líneas [Propuesta].

---

## 5. Anular una actividad [Decidido]

Las actividades **no se editan**: un error se corrige **anulando y volviendo a cargar**.

`anular_actividad(actividad, motivo)`:

1. Bloquea los lotes afectados (ordenados por id).
2. Por cada evento de stock de la actividad, inserta el **evento inverso**, con el mismo tipo, cabezas con el signo opuesto y el mismo `actividad_id`. El libro de stock queda completo y el saldo neto vuelve a cero.
3. Valida el saldo. Ejemplo: no se puede anular una compra si esos animales ya se vendieron, porque el stock quedaría negativo. Hay que anular primero la venta.
4. Anula el movimiento económico asociado, si existe.
5. Si la venta había cerrado el lote, **lo reabre** (registro `reapertura` con el motivo).
   - Al revés, si la anulación deja un lote en cero, **lo cierra** igual que `cerrar_lote`. Caso: una parición que creó su propio lote de cría; al anularla, ese lote queda vacío y cerrado.
   - **Una pesada** no tiene eventos de stock: anularla solo completa los datos de anulación.
6. Completa `anulada_en`, `anulada_por` y `motivo_anulacion`.

Una actividad anulada se ve en el historial, tachada, con su motivo. No se puede "restaurar": se carga de nuevo.

---

## 6. Permisos

- `select` para miembros (Consulta incluido; ve también los montos [Decidido]).
- Escritura **solo por las funciones** de las secciones 3 y 5 (administrador u operador).
- Tablas inmutables con trigger, como `lote_eventos`, salvo los datos de anulación.

---

## 7. Pruebas

`supabase/tests/etapa6a_rls.sql`, con el arnés de la Etapa 5 (OK, FALLA, OMITIDA y PREP). Cubre cada registro (stock, líneas, detalle, movimiento económico y su `monto_usd`), los casos de error (fecha, categoría de otra especie, cabezas, saldo negativo día por día, moneda sin tipo de cambio), la anulación (eventos inversos, saldo, movimiento anulado, reapertura del lote vendido), Consulta y usuario ajeno sin escritura, y anon sin acceso. Se actualiza `auditoria_permisos.sql`.

Casos pedidos en la revisión [Decidido]:

- **Anular cada uno de los 4 tipos que mueven stock** (compra, venta, mortandad, parición): eventos inversos y stock de vuelta al de antes.
- **Doble llamada con el mismo `p_id`**: una sola actividad, un solo evento de stock por línea y un solo movimiento económico.
- **`p_id` ajeno** (de otro establecimiento o de otro usuario): `42501`.
- **`monto_usd` con UYU 1000 y tipo de cambio 41,3333** = 24,19.
- **Anular una pesada** (sin eventos de stock).
- **Anular una parición cuyo lote de cría lo creó esa misma actividad**: el lote de cría queda en cero y cerrado.
- Parición con lote de cría de otra especie o cerrado: error. Categorías de crías de otra especie: error.

---

## 8. Preguntas abiertas

Resueltas por la revisión del 2026-10-16 (sección 9): **1** (una función por tipo), **2** (anular en lugar de editar) y **7** (el lote de cría se elige o se crea).

Siguen abiertas:

3. **Precio opcional en compra y venta**, con el movimiento económico creado solo si se carga. ¿O tiene que ser obligatorio?
4. **Venta que deja el lote en cero**: ¿se cierra sola (propuesta) o queda abierto hasta cerrarlo a mano?
5. **Pesos (kg)**: pendiente de la respuesta del usuario. Incluye si la pesada valida que no se pesen más cabezas de las que hay, y cómo se cargan los kg en pesada y venta.
6. **Causas de mortandad** para `parametros`: propongo Enfermedad, Accidente, Parto, Depredación, Clima o temporal, Desconocida y Otra.

## 9. Cambios de la revisión (2026-10-16)

1. Signo de las cabezas: verificado que `lote_eventos` no tiene check de signo por tipo; los eventos inversos no requieren cambios (sección 2.4).
2. `act_paricion` sin `servicio_id`: se agrega en la 6b con su FK.
3. `monto_usd = round(monto_original / tipo_cambio, 2)`, explícito.
4. Idempotencia con `p_id` en cada `registrar_*` (sección 3).
5. Regla de `actividad_id` en `lote_eventos` en un solo sentido (sección 2.4).
6. Parición: lote de cría existente activo y de la misma especie; categorías de crías de esa especie; `nacidos_muertos`; lote de madres en `actividades.lote_id`.
7. Pruebas adicionales (sección 7).
