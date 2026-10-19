# Campo Digital — Diseño de la base, Etapa 6b (resto de las actividades)

Estado: **aprobado** (2026-10-19), con la partición en 6b-1 y 6b-2. Incorpora las dos rondas de respuestas de Iñaki (secciones 9 y 10). Se implementa primero la **6b-1**. Base: `00-ENFOQUE-V2.md` (secciones 7 y 8), `MODELO-DE-DATOS-V2.md` (sección 6), `DISENO-BASE-ETAPA-5.md` (operaciones de lote) y `DISENO-BASE-ETAPA-6A.md`.

Marcas: **[Decidido]** sale de esos documentos o de las respuestas de Iñaki; **[Propuesta]** es diseño a validar.

Se mantiene todo lo de la 6a: tabla común `actividades`, un detalle por tipo, una función `registrar_*` por tipo con `p_id` idempotente, actividades inmutables que se corrigen anulando, escritura solo por funciones `security definer`, lectura para miembros (Consulta incluido), pruebas aprobadas solo con 0 FALLA, 0 OMITIDAS y 0 PREPARACIONES FALLIDAS.

---

## 1. Alcance y partición

| Tipo | Lotes | Mueve stock | Detalle |
|---|---|---|---|
| Sanidad | uno o más | no | uno o más productos |
| Servicio | uno | no | vacas entoradas, toros |
| Diagnóstico de gestación | uno | no | diagnosticadas, preñadas |
| Esquila | uno o más (ovinos) | no | kg de lana total |
| Personalizada | uno o más | no | nombre y campos libres |
| **Destete** | uno o más | **sí**: cada lote pasa entero a un lote nuevo | nombre y potrero de cada lote nuevo |

**Antiparasitario deja de ser un tipo propio** [Decidido]: es una categoría de producto dentro de sanidad. El valor `antiparasitario` queda en el check de `actividades.tipo` (no se migra el check), pero ninguna función lo escribe.

**Partición** [Decidido]: **6b-1** con todo lo que no mueve stock, y **6b-2** con el destete. Motivos:

1. **Riesgo distinto.** La 6b-1 solo agrega tablas y funciones nuevas, sin tocar el libro de stock. La 6b-2 cambia los checks de `lote_eventos` y `operaciones_lote` (tablas inmutables con datos reales), reemplaza `linaje_lote` y `anular_actividad`, y abre y cierra lotes.
2. **Pruebas más chicas y con causa clara.** Si algo falla en la 6b-2, se sabe que es el destete. Además, la 6b-2 obliga a volver a correr las pruebas de la Etapa 5 (linaje) y de la 6a (anulación); la 6b-1 no.
3. **Valor antes.** Sanidad es lo que más se va a cargar; con la 6b-1 aplicada ya se puede usar mientras se revisa el destete.
4. **Costo bajo.** Lo único que la 6b-1 tiene que prever para el destete es el rol de lote `origen` y `destino` en `actividad_lotes` (sección 2) y la columna `operaciones_lote.actividad_id` (sección 3.1, carencia), para no migrarlos después.

---

## 2. Varios lotes por actividad: `actividad_lotes` [Decidido]

Una tabla nueva, **para todos los tipos**, dice a qué lotes concierne cada actividad:

| Columna | Tipo | Nota |
|---|---|---|
| actividad_id | uuid | FK compuesta a `actividades` |
| lote_id | uuid | FK compuesta a `lotes` |
| establecimiento_id | uuid | |
| rol | text | `principal` (el lote sobre el que se hizo), `cria` (lote de cría de la parición), `origen` y `destino` (destete, 6b-2) |

PK `(actividad_id, lote_id, rol)`. Inmutable, como el resto de las tablas de actividades.

**Convivencia con `actividades.lote_id`:**
- **Tipos de un lote** (pesada, mortandad, compra, venta, parición, servicio, diagnóstico): `lote_id` sigue siendo el lote principal, como hoy. Además tienen su fila `principal` en `actividad_lotes`.
- **Tipos de varios lotes** (sanidad, esquila, personalizada, destete): `lote_id` queda en null; los lotes están solo en `actividad_lotes`.
- **Sin reescribir las funciones de la 6a**: dos triggers completan `actividad_lotes` solos. Uno, al insertar una actividad con `lote_id`, agrega su fila `principal`; otro, al insertar en `act_paricion`, agrega la fila `cria`. Las funciones de la 6a y sus pruebas quedan como están.
- **Funciones de trigger** [Decidido]: `security definer`, `search_path` fijo y sin `execute` para `authenticated` (ni `anon`). La prueba las ejercita con la sesión de un operador, no como `postgres`.
- **Datos existentes**: la migración carga las filas de las actividades ya registradas (`lote_id` como `principal` y el lote de cría de las pariciones como `cria`).

**Cómo se ve:**
- `v_actividades` suma la columna `lotes` (lista de ids, ordenada por nombre) para mostrar los nombres en el listado.
- El **historial y el filtro por lote** buscan en `actividad_lotes`: una sanidad a tres lotes aparece en la ficha de cada uno. Hoy el filtro mira `lote_id` y `lote_cria_id`; pasa a mirar `actividad_lotes`.
- La **ficha de la actividad** lista todos sus lotes con enlace.

**`lote_id` en null** (verificado el 2026-10-19 en la migración `20261016000400`):
- `actividades.lote_id` ya es nullable: no hay nada que relajar.
- `anular_actividad` lo tolera: lo une a los lotes de los eventos y descarta los null antes de armar la lista de lotes a bloquear, y la lista vacía pasa por `coalesce(..., '{}')` (el patrón que corrigió el bug de `unir_lotes`).
- `v_actividades` no hace join por `lote_id`; `proteger_actividad` lo compara con `is distinct from`. La vista nueva toma los lotes de `actividad_lotes` con left join.
- En la app, la ficha y la tarjeta ya contemplan `lote_id` vacío. El filtro por lote (`lote_id` o `lote_cria_id`) pasa a `actividad_lotes`.

**Validación de los lotes** (todas las funciones de varios lotes): sin repetidos, al menos uno, todos activos, del establecimiento y con permiso de carga. Se bloquean ordenados por id. La fecha no puede ser futura ni anterior a la apertura de ninguno.

---

## 3. 6b-1: tipos que no mueven stock

### 3.1 Sanidad [Decidido]

Una carga lleva **uno o más productos** y se entiende que fue **a todo el lote** (sin líneas ni cabezas).

`act_sanidad_productos`:

| Columna | Tipo | Nota |
|---|---|---|
| actividad_id | uuid | |
| orden | int | posición en la carga (PK `(actividad_id, orden)`) |
| producto | text | obligatorio |
| categoria | text | obligatoria; valor de `parametros`, clave `categorias_sanidad`: Vacunación, Antiparasitario, Tratamiento, Curación, Otro |
| dosis | text | opcional ("5 ml", "1 ml cada 10 kg") |
| via | text | opcional; `parametros`, clave `vias_aplicacion`: Inyectable, Oral, Pour-on, Otra |
| carencia_dias | int | opcional, ≥ 0 |
| fecha_proxima_dosis | date | opcional, **posterior** a la fecha de la actividad [Propuesta]. La usa el calendario de la Etapa 8 |

Hasta 20 productos por carga [Propuesta]. Sin inventario de insumos.

**Carencia:** `fin_carencia = fecha + carencia_dias` por producto (solo productos con carencia > 0). Una vista nueva, `v_carencias` (`security_invoker`), da por lote las carencias de sanidades no anuladas: lote, producto, categoría, fin de carencia, actividad y si es heredada. El formulario de venta la consulta y **avisa sin bloquear** si algún lote está en carencia ese día, con producto y fecha. La ficha del lote muestra "En carencia hasta el …".

**Propagación a los lotes descendientes** [Decidido]: si después de la sanidad el lote se divide, se une o se desteta, los animales tratados siguen en carencia en los lotes nuevos. La vista recorre `operacion_lote_vinculos` desde los lotes de la sanidad:
- Toma **todas las operaciones salvo la recategorización** (que no cambia de lote), para que el destete de la 6b-2 entre sin reemplazar la vista.
- Solo operaciones con fecha **igual o posterior** a la de la sanidad. Una operación del mismo día se toma como posterior (lo más prudente para una carencia).
- Excluye las operaciones de **actividades anuladas**. Para eso, `operaciones_lote` gana `actividad_id` (FK compuesta, nullable) **ya en la 6b-1**; la división, la unión y la recategorización lo dejan en null, y el destete de la 6b-2 lo completa.
- **Falso positivo conocido**: si al lote descendiente entran animales comprados después, la carencia se le marca a todo el lote. Es un aviso, no un bloqueo; se acepta.

### 3.2 Servicio [Decidido]

Un lote (`actividades.lote_id`) y una sola fecha (la de realización). `act_servicio`: `vacas_entoradas` (int > 0, **obligatorio**) y `toros` (int > 0 si viene, opcional).

### 3.3 Diagnóstico de gestación [Decidido]

Un lote. `act_diagnostico`: `vacas_diagnosticadas` (int > 0) y `vacas_prenadas` (int ≥ 0, ≤ diagnosticadas). Vacías = diagnosticadas − preñadas, calculado.

**Sin `servicio_id`** en diagnóstico, parición ni destete [Decidido]: los indicadores de la Etapa 7 los relacionan por lote. `registrar_paricion` no cambia.

### 3.4 Esquila [Decidido]

Uno o más lotes, **todos ovinos**: especie con `grupo = 'ovino'`. `especies` gana la columna `grupo` (`bovino`, `ovino`, `otro`), que carga el administrador; las existentes se clasifican por el nombre del catálogo base y `_cargar_catalogos_base` la completa en los establecimientos nuevos. Renombrar una especie no cambia su grupo. `act_esquila`: `kg_lana_total` (numeric(10,1), > 0, validado ya redondeado a 1 decimal), uno solo para toda la carga (para tener kg por lote, una carga por lote). Sin líneas. **Kg por cabeza, promedio aproximado** [Decidido]: kg de lana / stock total de esos lotes a la fecha (incluye todas las categorías, también las que no se esquilaron). La vista lo llama `kg_lana_cabeza_aprox` y la app lo rotula como aproximado.

### 3.5 Personalizada [Decidido]

Uno o más lotes, sin cabezas. `act_personalizada`: `nombre` (obligatorio) y `campos` (jsonb, lista de `{campo, valor}` de texto, hasta 20, sin campos vacíos ni repetidos).

### 3.6 Cabezas contra el stock: solo aviso [Decidido]

La base **no** compara contra el stock las entoradas ni las diagnosticadas; la app avisa si superan el stock del lote a esa fecha. Sí bloquea la coherencia interna: números > 0 donde corresponde y preñadas ≤ diagnosticadas.

### 3.7 Funciones de la 6b-1

| Función | Lotes |
|---|---|
| `registrar_sanidad(p_id, establecimiento, lotes[], fecha, productos jsonb, persona, notas)` | varios |
| `registrar_servicio(p_id, lote, fecha, vacas_entoradas, toros, persona, notas)` | uno |
| `registrar_diagnostico(p_id, lote, fecha, vacas_diagnosticadas, vacas_prenadas, persona, notas)` | uno |
| `registrar_esquila(p_id, establecimiento, lotes[], fecha, kg_lana_total, persona, notas)` | varios, ovinos |
| `registrar_personalizada(p_id, establecimiento, lotes[], fecha, nombre, campos jsonb, persona, notas)` | varios |

Las de varios lotes reciben el establecimiento explícito, como `registrar_compra`, para validar la idempotencia y el permiso antes de mirar los lotes.

**Anular** [Decidido]: estas cinco solo completan los datos de anulación. `anular_actividad` **se reemplaza** en la 6b-1: busca los lotes a bloquear en sus eventos y en `actividad_lotes` (antes usaba `actividades.lote_id`, vacío en los tipos de varios lotes), tolerando la lista vacía. El resto no cambia; la 6b-2 la vuelve a reemplazar para el destete.

**Parámetros nuevos**: `categorias_sanidad` y `vias_aplicacion`, con los valores de 3.1.

**Vista `v_actividades`**: se reemplaza para agregar `lotes`, la cantidad de productos y el primero (para el resumen), entoradas, toros, diagnosticadas, preñadas, kg de lana, kg por cabeza y el nombre de la personalizada.

---

## 4. 6b-2: destete (mueve stock) [Decidido]

**Qué hace:** por cada lote destetado, **todo su stock pasa a un lote nuevo propio** (sin mezclar con otros), con las mismas categorías, y el lote de origen se cierra. Sin líneas ni peso: el peso al destete se carga con una pesada.

**Datos por lote de origen:** nombre del lote nuevo (sugerido "Destetados <nombre del origen> <año>", editable) y potrero opcional.

**Se hace sobre el lote de cría** [Decidido]: no se prevé el lote con madres y crías juntas. La app avisa (sin bloquear) si el lote trae categorías de adultos.

**Reglas:**
- Lotes de origen activos, con stock, sin repetidos; bloqueo ordenado por id.
- Fecha igual o posterior al último evento de cada origen, como `unir_lotes` (no puede haber movimientos después de que el lote se vació).
- Eventos con saldo validado día por día; cierre del origen con registro en `lote_cambios_estado` (motivo "Destetado").
- Linaje: una `operaciones_lote` de tipo `destete` **por cada par origen → destino**, con sus `operacion_lote_vinculos` y su `actividad_id`. Si fuera una sola operación para toda la carga, el linaje cruzaría todos los orígenes con todos los destinos.
- `linaje_lote` se reemplaza para **excluir las operaciones de actividades anuladas** [Decidido].
- Los eventos llevan `actividad_id` y `operacion_lote_id`.

**Cambios en el esquema que exige** (verificado en la migración `20261015000100`):

| Objeto | Hoy | Cambio |
|---|---|---|
| `lote_eventos.tipo` (check) | no acepta `destete` | agregar `destete` |
| `lote_eventos`, regla de operación | `(tipo in ('division','union','recategorizacion')) = (operacion_lote_id is not null)` | sumar `destete` a la lista |
| `lote_eventos`, regla de actividad (6a) | paricion, compra, venta, mortandad exigen `actividad_id` | sumar `destete` |
| `operaciones_lote.tipo` (check) | division, union, recategorizacion | agregar `destete` |
| `linaje_lote` | toma todo menos recategorización | se reemplaza para excluir operaciones de actividades anuladas |
| `operaciones_lote.actividad_id` | no existe | **se agrega en la 6b-1** (carencia); el destete lo completa |

Los checks se reemplazan con `drop constraint` + `add constraint`. Los de `lote_eventos` y el de `operaciones_lote` se crearon sin nombre, así que la migración tiene que buscar el nombre real en `pg_constraint` (por la definición) antes de borrarlo. Agregar un check revalida las filas existentes, que lo cumplen.

**Anular un destete:** eventos inversos con la fecha original; reabre los orígenes (registro de reapertura) y cierra los destinos que quedan vacíos. **Regla estricta** [Decidido]: el lote destino no puede tener **ningún evento que no pertenezca al propio destete**, cualquiera sea su fecha (cubre eventos cargados después con fecha anterior). Si los tiene, primero se anulan esos. Reemplaza `anular_actividad`.

**Función:** `registrar_destete(p_id, establecimiento, fecha, destetes jsonb [{lote_id, nombre, potrero_id}], persona, notas)`.

---

## 5. Pantallas

- **Nueva actividad** suma sanidad, servicio, diagnóstico, esquila y personalizada (6b-1) y destete (6b-2). Antiparasitario no aparece como tipo: es una categoría de producto en sanidad.
- **Selector de lotes** en sanidad, esquila, personalizada y destete: lista de lotes activos con casillas (en esquila, solo ovinos).
- **Sanidad:** filas de producto (producto, categoría, dosis, vía, carencia, próxima dosis), con "Agregar otro producto".
- **Servicio y diagnóstico:** avisan (sin bloquear) si las cabezas superan el stock del lote a esa fecha.
- **Esquila:** kg por cabeza rotulado como promedio aproximado.
- **Destete:** aviso (sin bloquear) si el lote trae categorías de adultos.
- **Venta:** aviso de carencia, con producto y fecha.
- **Ficha del lote:** "En carencia hasta el …" y las actividades de varios lotes en su historial.
- **Listado y ficha de la actividad:** los lotes de la actividad y el resumen de cada tipo.

---

## 6. Permisos

Iguales a la 6a: `select` para miembros por RLS; escritura solo por funciones (administrador u operador); tablas de detalle y `actividad_lotes` inmutables con trigger; funciones internas y de trigger sin `execute` para `authenticated`; nada para `anon`.

---

## 7. Pruebas

**6b-1** (`supabase/tests/etapa6b1_rls.sql`):
- Cada tipo: detalle guardado, sin eventos de stock, fecha, lote cerrado, idempotencia, anulación y lotes de otro establecimiento.
- Sanidad con varios lotes y varios productos; sin productos; producto sin nombre o con categoría o vía que no están en `parametros`; próxima dosis anterior o igual a la fecha; carencia negativa. `v_carencias` con una sanidad vigente, una vencida y una anulada.
- Esquila con un lote vacuno entre los lotes: error. Kg por cabeza con el stock a la fecha.
- Diagnóstico con preñadas > diagnosticadas: error. Entoradas mayores que el stock: **se guardan** (solo aviso).
- Personalizada sin nombre, con campos vacíos, repetidos o más de 20: error.
- `actividad_lotes`: filas cargadas para las actividades de la 6a por la carga inicial, y **creadas por los triggers con la sesión de un operador** (una pesada y una parición de la 6a, y un servicio de la 6b-1).
- **Anular cada tipo de varios lotes** (sanidad, esquila, personalizada): solo se marcan.
- **Listado y filtro por lote**: una sanidad de varios lotes aparece en el filtro de cada uno.
- **Carencia**: una sanidad cuyo lote se divide después aparece en `v_carencias` también para los lotes nuevos (heredada); una sanidad anulada no aparece; un producto sin carencia no aparece.
- Consulta, usuario ajeno y anon. Se actualiza `auditoria_permisos.sql`.

**6b-2** (`supabase/tests/etapa6b2_rls.sql`): destete de uno y de varios lotes (stock, cierre, linaje por par), fecha anterior al último evento, lote vacío, anulación (stock, reapertura, cierre del destino), anulación con los animales ya movidos (error). Se vuelven a correr `etapa5_rls.sql` y `etapa6a_rls.sql`.

---

## 8. Lo que no cambia de la 6a

`registrar_pesada`, `registrar_mortandad`, `registrar_compra`, `registrar_venta` y `registrar_paricion` quedan como están (los triggers de la sección 2 completan `actividad_lotes`). `anular_actividad` cambia en la 6b-1 (lotes desde `actividad_lotes`) y otra vez en la 6b-2 (destete).

---

## 9. Respuestas de la segunda revisión (2026-10-19)

1. Servicio: `vacas_entoradas` obligatorio (> 0); `toros` opcional (> 0 si viene).
2. Diagnóstico: diagnosticadas > 0; preñadas ≥ 0 y ≤ diagnosticadas.
3. Anular destete con regla estricta: el destino no puede tener ningún evento ajeno al destete.
4. `operaciones_lote` gana `actividad_id` (en la 6b-1, por la carencia); `linaje_lote` excluye las operaciones anuladas (6b-2).
5. Triggers para `actividad_lotes`: sí, `security definer`, `search_path` fijo, sin `execute` para `authenticated`; probados con un operador.
6. Destete sobre el lote de cría; la app avisa si hay categorías de adultos.
7. Especies mezcladas permitidas, salvo en la esquila.
8. Etapa 7: relacionar servicio, diagnóstico y parición siguiendo `linaje_lote`.
9. Partición aprobada; se empieza por la 6b-1.

Ajustes: carencia propagada a los descendientes (3.1), verificación de `lote_id` en null (sección 2), triggers `security definer` (sección 2) y kg de lana por cabeza como promedio aproximado (3.4).

## 9 bis. Pendientes anotados (2026-10-19)

- **Redondeo en la 6a** [Decidido: no va en la 6b-1]: `_insertar_lineas` (peso vivo) y `registrar_compra`/`registrar_venta` (kg al gancho) validan `> 0` antes de redondear a 1 decimal, así que 0,04 kg cae en el check de la tabla (23514) en vez de 22023. Se corrige en la **próxima migración que toque** `_insertar_lineas`, `registrar_compra` o `registrar_venta`, validando el valor ya redondeado como la esquila. Mientras tanto, el formulario de la app exige **mínimo 0,1 kg**.
- **App: campo "grupo"** (bovino, ovino, otro) en la pantalla de especies, para el administrador.
- **Etapa 7: rubro por defecto de compra y venta por `grupo`** de la especie, en lugar de buscar un rubro con el mismo nombre que la especie (hoy `_registrar_movimiento` compara nombres).

## 10. Cambios por las respuestas de Iñaki (2026-10-19)

1. Cabezas contra el stock: solo aviso en la app (servicio y diagnóstico); la base bloquea solo la coherencia interna.
2. Sanidad: un solo tipo, uno o más productos (`act_sanidad_productos`), sin líneas; antiparasitario pasa a ser una categoría de producto.
3. Varios lotes en sanidad, esquila, destete y personalizada: `actividad_lotes` (sección 2).
4. Esquila: sin líneas, un kg total por carga, todos los lotes ovinos, kg por cabeza calculado.
5. Servicio con una sola fecha, sin `fecha_fin`. Sin `servicio_id` en diagnóstico, parición ni destete; `registrar_paricion` no cambia. Se descarta bloquear la anulación de un servicio con vinculados.
6. Destete mueve stock: cada lote pasa entero a un lote nuevo, con linaje y cierre del origen (sección 4).
7. Personalizada: varios lotes, sin cabezas.
8. Carencia por producto, aviso en la venta; próxima dosis por producto para el calendario de la Etapa 8.
9. Anulación: solo marca, salvo el destete, que revierte el stock.
10. Partición en 6b-1 y 6b-2 (recomendada).
