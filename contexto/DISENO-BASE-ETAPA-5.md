# Campo Digital — Diseño de la base, Etapa 5 (lotes y bitácora)

Estado: **aprobado el 2026-10-16**, con las respuestas y cambios de la sección 11. Base: `00-ENFOQUE-V2.md`, `MODELO-DE-DATOS-V2.md`, `DISENO-BASE-ETAPA-3.md` y `DISENO-USUARIOS.md`.

Marcas: **[Decidido]** sale de esos documentos o de decisiones ya tomadas; **[Propuesta]** es diseño a validar. Los fragmentos SQL son ilustrativos.

Se mantienen todos los criterios de la Etapa 3: `uuid` en todas las tablas, `created_by` sin clave foránea, claves foráneas compuestas con `establecimiento_id`, nada se borra, las escrituras de varias tablas van por funciones, y todo objeto nuevo nace sin permisos.

---

## 1. Alcance

| Parte | Qué entra |
|---|---|
| Operaciones de lote | `dividir_lote`, `unir_lotes`, `recategorizar_lote` y `linaje_lote`. Las tablas `operaciones_lote` y `operacion_lote_vinculos` ya existen desde la Etapa 3a |
| Stock a una fecha | `stock_al(establecimiento, fecha)` (por ejemplo, para la declaración jurada al 30 de junio) |
| Bitácora | tablas `bitacora_entradas` y `bitacora_lotes`, y sus funciones de escritura |
| Inicio básico | sin tablas nuevas: usa `v_stock_establecimiento` y las últimas entradas de la bitácora |

Queda **fuera**: parición (crea el lote "Terneros Nacidos <año>", Etapa 6a), compras, ventas y mortandad (Etapa 6a), y tareas (Etapa 8).

---

## 2. Reglas comunes de las operaciones de lote

Las tres operaciones siguen el mismo patrón que `registrar_ajuste` en la Etapa 3a:

1. **Permiso**: `puede_operar(establecimiento)` (administrador u operador). Si no, `42501`.
2. **Bloqueo**: bloquean **todas** las filas de lote involucradas con `select ... for update` **antes de leer el saldo**. Cuando hay varios lotes, los bloquean **ordenados por id**, para que dos operaciones simultáneas sobre los mismos lotes no se traben entre sí (deadlock).
3. **Validaciones**:
   - los lotes tienen que estar activos;
   - tienen que ser del mismo establecimiento y de la misma especie;
   - la fecha no puede ser futura (`fecha_hoy()`) ni anterior a la apertura de los lotes [Decidido];
   - las categorías tienen que ser de la especie;
   - las cabezas tienen que ser enteros mayores a cero.
4. **Registro**: una fila en `operaciones_lote` (tipo y fecha), los vínculos origen/destino en `operacion_lote_vinculos` y los eventos en `lote_eventos`, con `tipo` igual al de la operación y `operacion_lote_id`. Todas estas tablas son inmutables.
5. **Saldo**: después de insertar, `_validar_saldo` en cada lote y categoría tocados. **El saldo acumulado al cierre de cada día tiene que ser mayor o igual a cero, en todos los días**, no solo al final [Decidido].
   - Verificado (2026-10-16): `_validar_saldo` de la Etapa 3a ya lo hace. Suma los eventos por día, acumula en orden de fecha y rechaza el primer día con saldo negativo. Los días sin eventos tienen el saldo del día anterior, así que alcanza con revisar los días con eventos. `registrar_ajuste` usa la misma función.
   - Ejemplo: 10 cabezas el día 1, +40 el día 5. Dividir 30 con fecha del día 3 deja el día 3 en −20 y **falla**, aunque al final quedarían 20.
6. **Cierre automático**: un lote que queda con stock cero en todas sus categorías se cierra **igual que con `cerrar_lote`**: estado `cerrado`, `fecha_cierre` y un registro `cierre` en `lote_cambios_estado` con el motivo (por ejemplo, "Dividido en ..." o "Unido a ...") [Decidido].
   - **Fecha de cierre** = la mayor entre la fecha de la operación y la del último evento del lote [Decidido]. Con una operación retroactiva puede haber eventos posteriores.

Todo pasa en una sola transacción: si algo falla, no queda nada a medias.

---

## 3. dividir_lote

Separa animales de un lote en **lotes nuevos** [Decidido: "por cada destino crea el lote"].

```sql
dividir_lote(
  p_lote_id   uuid,
  p_fecha     date,
  p_destinos  jsonb,   -- ver abajo
  p_notas     text default null
) returns uuid         -- id de la operación
```

```json
[
  {
    "nombre": "Terneros pesados",
    "potrero_id": "<uuid o null>",
    "campana": "2026",
    "composicion": [ { "categoria_id": "<uuid>", "cabezas": 40 } ]
  }
]
```

- Para cada destino: crea el lote (misma especie, `fecha_apertura` = la fecha de la operación), suma `+n` en el destino y resta `-n` en el origen, por categoría.
- Vínculos: el origen con rol `origen` y cada lote nuevo con rol `destino`.
- **El origen se queda con lo que no se movió.** Si queda en cero, se cierra solo.
- **Fecha retroactiva** [Decidido]: se permite una fecha anterior al último movimiento del origen, siempre que el saldo acumulado no quede negativo ningún día desde esa fecha (lo controla `_validar_saldo`). No puede ser anterior a la apertura del origen ni futura.

**Mover animales a un lote que ya existe** no es dividir: es una unión parcial. Queda para más adelante [Decidido].

## 4. unir_lotes

Junta **todo** el stock de uno o más lotes en un lote destino, y cierra los lotes absorbidos [Decidido].

```sql
unir_lotes(
  p_lotes_origen uuid[],
  p_fecha        date,
  p_destino_id   uuid  default null,   -- lote existente, o null para crear uno nuevo
  p_nuevo        jsonb default null,   -- {"nombre", "potrero_id", "campana"} si se crea uno nuevo (desde 2026-10-20 la app no manda campana: el destino recibe la unión de los años de nacimiento)
  p_notas        text  default null
) returns uuid                          -- id de la operación
```

- **Destino existente**: alcanza con un lote de origen, que no puede ser el mismo destino. **Destino nuevo**: hacen falta al menos dos orígenes.
- Por cada origen y cada categoría con stock: `-n` en el origen y `+n` en el destino.
- Cada origen queda cerrado, con un registro `cierre` y el motivo "Unido a <destino>".
- **Fecha** [Decidido]: igual o posterior al último evento de **cada** origen y a la apertura del destino, si existe. Tampoco puede ser futura. Se mueve el stock completo, y con movimientos posteriores a la fecha el "todo" sería ambiguo.

## 5. recategorizar_lote

Pasa cabezas de una categoría a otra **dentro del mismo lote**, por ejemplo terneros que pasan a novillos [Decidido].

```sql
recategorizar_lote(
  p_lote_id uuid,
  p_fecha   date,
  p_cambios jsonb,   -- [{"desde_categoria_id", "hacia_categoria_id", "cabezas"}]
  p_notas   text default null
) returns uuid
```

- Por cada cambio: `-n` en la categoría de origen y `+n` en la de destino, las dos en el mismo lote.
- Las dos categorías tienen que ser distintas y de la especie del lote.
- **Fecha retroactiva** [Decidido]: igual que en dividir; se valida el saldo de las dos categorías, día por día.
- Vínculo: el lote con rol `origen` y con rol `destino` (la clave primaria lo permite). El linaje lo ignora, porque no cambia de qué lote vienen los animales.

## 6. linaje_lote

```sql
linaje_lote(p_lote_id uuid) returns table (
  lote_id uuid, nombre text, estado text,
  relacion text,          -- 'ancestro' o 'descendiente'
  nivel int,              -- 1 = directo, 2 = abuelo/nieto...
  operacion_id uuid, tipo text, fecha date
)
```

- Recorre `operacion_lote_vinculos` con una consulta recursiva, hacia atrás (de qué lotes viene) y hacia adelante (en qué lotes terminó). Ignora las recategorizaciones.
- **Corta ciclos** [Decidido]: cada camino lleva un arreglo con los lotes ya visitados y no vuelve a entrar a ninguno. Caso: dividir A en B y después unir B en A.
- **Sin duplicados** [Decidido]: dentro de cada relación (ancestro o descendiente), si a un lote se llega por más de un camino, aparece una sola vez, con el nivel más cercano. En un ciclo (A → B → A), B aparece una vez como ancestro y una vez como descendiente de A, porque lo es de las dos formas. El lote consultado nunca aparece en su propio linaje.
- Es `security invoker`: corre con los permisos de quien la llama, así que **el RLS aplica**. Solo devuelve lotes que el usuario puede ver.
- Tiene un tope de profundidad (20 niveles) como resguardo.

## 7. stock_al

```sql
stock_al(p_establecimiento_id uuid, p_fecha date)
  returns table (especie_id uuid, categoria_id uuid, cabezas int)
```

- Suma `lote_eventos` con `fecha <= p_fecha`, en **todos** los lotes, también los que hoy están cerrados: a esa fecha podían tener animales.
- Es `security invoker`, así que el RLS aplica. Usa el índice `lote_eventos (establecimiento_id, fecha)` de la Etapa 3a.

---

## 8. Bitácora

### 8.1 bitacora_entradas

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| establecimiento_id | uuid | |
| fecha | date | `default fecha_hoy()`; no puede ser futura |
| tipo | text | `decision`, `idea`, `observacion`, `compra_venta_gasto` [Decidido] |
| texto | text | not null, texto libre [Decidido] |
| estado_idea | text | `abierta`, `decidida`, `descartada`; **solo** si `tipo = 'idea'` [Decidido] |
| persona_id | uuid | responsable opcional: FK compuesta a `personas` [Decidido] |
| editada_en | timestamptz | última edición del contenido; null si nunca se editó [Decidido] |
| editada_por | uuid | quién la editó por última vez (auditoría, sin FK) [Decidido] |
| anulada_en | timestamptz | null = vigente [Decidido] |
| anulada_por | uuid | quién la anuló (auditoría, sin FK) [Decidido] |
| motivo_anulacion | text | obligatorio al anular [Decidido] |
| created_by, created_at, updated_at | | `created_by` no cambia nunca. `updated_at` es técnico (cualquier cambio de fila); **no** se usa para mostrar "editada" [Decidido] |

Restricciones:

- `check ((tipo = 'idea') = (estado_idea is not null))`: toda idea tiene estado y nada que no sea idea lo tiene. Una idea nueva arranca `abierta`.
- Los tres datos de la anulación (`anulada_en`, `anulada_por`, `motivo_anulacion`) van juntos: los tres null o los tres completos.
- `editada_en` y `editada_por` van juntos.

### 8.2 bitacora_lotes

| Columna | Tipo | Nota |
|---|---|---|
| establecimiento_id | uuid | |
| entrada_id | uuid | FK compuesta a `bitacora_entradas` |
| lote_id | uuid | FK compuesta a `lotes` (mismo establecimiento) |

PK: `(entrada_id, lote_id)`. Una entrada puede etiquetar **varios lotes** [Decidido]. Índice `(lote_id)` para ver la bitácora desde la ficha de un lote.

### 8.3 Edición y anulación [Decidido]

La bitácora es un registro de conversaciones y decisiones, no un libro de stock. **Se puede editar y anular, pero no borrar.**

- **Editar** (texto, tipo, fecha, responsable y lotes) completa `editada_en` y `editada_por`. La app muestra "editada el ... por ...".
- **Cambiar el estado de una idea** (abierta, decidida, descartada) **no cuenta como edición**: no toca `editada_en` ni `editada_por`.
- **Anular** completa `anulada_en`, `anulada_por` y `motivo_anulacion` (obligatorio). Una entrada anulada queda en la base, oculta por defecto, con un filtro "Ver anuladas".
- **Una entrada anulada no se edita ni cambia de estado hasta restaurarla.** Restaurar limpia los tres datos de la anulación.
- No hay tabla de versiones: se guarda solo la última edición.

### 8.4 Escritura: solo por funciones

La entrada y sus lotes se escriben juntos, así que van por funciones atómicas (`security definer`, validan `puede_operar`):

| Función | Qué hace |
|---|---|
| `crear_entrada_bitacora(p_establecimiento_id, p_fecha, p_tipo, p_texto, p_lotes uuid[], p_persona_id)` | crea la entrada (una idea arranca `abierta`) y sus lotes |
| `editar_entrada_bitacora(p_entrada_id, p_fecha, p_tipo, p_texto, p_lotes uuid[], p_persona_id)` | actualiza la entrada, **reemplaza** sus lotes y completa `editada_en`/`editada_por`. Si deja de ser idea, se borra el estado; si pasa a ser idea, arranca `abierta`. Falla si está anulada |
| `cambiar_estado_idea(p_entrada_id, p_estado)` | abierta → decidida o descartada, y vuelta atrás. No cuenta como edición. Falla si está anulada o si no es una idea |
| `anular_entrada_bitacora(p_entrada_id, p_motivo)` | anula, con motivo obligatorio. Falla si ya está anulada |
| `restaurar_entrada_bitacora(p_entrada_id)` | deja la entrada vigente y limpia los datos de la anulación |

Todas bloquean la fila de la entrada (`for update`), para que dos ediciones simultáneas no se pisen.

**Quién edita** [Decidido]: cualquier administrador u operador del establecimiento, no solo el autor. `created_by` no cambia nunca. Consulta no edita.

### 8.5 RLS y permisos

- `select`: `es_miembro(establecimiento_id)` en las dos tablas (consulta incluido).
- Ningún `insert`, `update` ni `delete` directo para `authenticated`: todo por las funciones de 8.4.
- `bitacora_lotes` no tiene trigger de inmutabilidad. Sus filas solo cambian dentro de `editar_entrada_bitacora`, que las reemplaza; es una tabla de etiquetas, no un registro histórico.

### 8.6 Lectura

- Listado por establecimiento, del más nuevo al más viejo, con filtros por tipo, lote, responsable, estado de la idea y texto (`ilike`).
- Índices: `(establecimiento_id, fecha desc)` y `(establecimiento_id, tipo)`.
- Si el volumen crece, la búsqueda de texto pasa a `pg_trgm` o a búsqueda de texto completo, sin cambiar la tabla.

---

## 9. Inicio básico

Sin tablas nuevas:

- **Stock por especie y categoría**: `v_stock_establecimiento` (ya existe).
- **Últimas 5 entradas de la bitácora** no anuladas, con sus lotes.
- **Ideas abiertas**: el contador de entradas `tipo = 'idea'` y `estado_idea = 'abierta'`, **sin las anuladas** [Decidido].

Las últimas actividades, las tareas y el resultado por rubro se suman en las Etapas 6 a 8.

---

## 10. Pruebas

Nuevo `supabase/tests/etapa5_rls.sql`, con el mismo formato que `etapa3_rls.sql`: termina con un error a propósito que deshace todo y se espera 0 FALLA. Cubre:

- **Dividir**: el stock del origen y de los destinos, el cierre automático en cero, el error si se pide más de lo que hay, que no se puede dividir con categorías de otra especie, y los vínculos.
- **Unir**: a un destino existente y a uno nuevo, el cierre de los orígenes con su motivo, el error con especies distintas, y que el destino no puede ser un origen.
- **Recategorizar**: los saldos de las dos categorías, el error si `desde = hacia`, y el error con saldo insuficiente.
- **Linaje**: abuelo, padre e hijo después de dividir y unir. Un usuario de otro establecimiento no ve nada.
- **stock_al**: el stock a una fecha anterior a una división, igual al de antes.
- **Bitácora**:
  - crear, editar (reemplazando los lotes), cambiar el estado de una idea y anular;
  - la regla de `estado_idea`;
  - Consulta lee pero no escribe, ni siquiera por la API;
  - un usuario de otro establecimiento no ve ni etiqueta lotes ajenos;
  - no se puede etiquetar un lote de otro establecimiento (FK compuesta).
- **Permisos**: anon no ve nada; las funciones nuevas no se pueden ejecutar como anon.

Casos pedidos en la aprobación [Decidido]:

- 10 cabezas el día 1 y +40 el día 5; **dividir 30 con fecha del día 3 falla** (el día 3 quedaría en −20).
- **Dividir y volver a unir** (A → B → A): el linaje termina, sin ciclo y sin duplicados.
- Recategorizar con fecha hacia atrás.
- **Unir con fecha anterior al último movimiento de un origen falla.**
- **Dividir todo el lote**: el origen se cierra y queda el registro `cierre`, con la fecha correcta.
- `stock_al(hoy)` es igual a `v_stock_establecimiento`.
- Bitácora: Consulta lee y no escribe, tampoco por RPC; un usuario ajeno ve 0 filas; no hay forma de borrar una entrada; una idea no puede quedar sin estado; una entrada anulada no se edita.
- **Consulta y anon no pueden usar ninguna función de escritura nueva.** `linaje_lote` y `stock_al` son de lectura: Consulta sí las usa (ve todo) y anon no.

Se actualizan los resultados esperados de `auditoria_permisos.sql`: las tablas nuevas y la lista de funciones.

---

## 11. Decisiones de aprobación (2026-10-16)

1. **Bitácora editable y anulable, sin borrado**, con `editada_en`, `editada_por`, `anulada_en`, `anulada_por` y `motivo_anulacion`. `updated_at` no se usa para "editada". Cambiar el estado de una idea no es una edición. Una entrada anulada no se edita hasta restaurarla. Sin tabla de versiones por ahora.
2. **Unión parcial**: más adelante.
3. **Edita cualquier administrador u operador**; `created_by` no cambia; Consulta no edita.
4. **Fechas hacia atrás** en dividir y recategorizar: sí, validando el saldo acumulado al cierre de cada día (ya lo hace `_validar_saldo`). Ni anterior a la apertura ni futura. **Unir**: fecha igual o posterior al último evento de cada origen y a la apertura del destino.

Cambios al documento:

- a) Linaje con arreglo de visitados (corta ciclos), sin duplicados y con tope de profundidad (sección 6).
- b) Cierre automático con fecha = la mayor entre la operación y el último evento, registrado igual que `cerrar_lote` (sección 2).
- c) El contador de ideas abiertas excluye las anuladas (sección 9).
- d) Los `check` de `lote_eventos.tipo` y `operaciones_lote.tipo` ya aceptan `division`, `union` y `recategorizacion` desde la Etapa 3a: no hay que ampliarlos.
- e) Pruebas adicionales (sección 10).
