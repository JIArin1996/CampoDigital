# Campo Digital — Diseño de la base, Etapa 6b-2: destete

> **Decisiones cerradas (A1 a A11, 2026-10-22).** Se implementa en dos migraciones (sección 11): primero la parición al pie con las marcas de cría y sexo; después el destete.

Estado: **aprobado** (2026-10-22; A10 y A11 aceptadas como se recomendaron). Sin migraciones. Reemplaza la sección 4 de `DISENO-BASE-ETAPA-6B.md` (destete "cada lote pasa entero a un lote nuevo") y la sección 1 bis de `DISENO-LOTES-ANIOS-Y-ARCHIVOS.md` (destete como división).

Base: las respuestas de Iñaki del 2026-10-20 (dos rondas), `DISENO-BASE-ETAPA-5.md` (operaciones de lote y linaje), `DISENO-BASE-ETAPA-6A.md` (parición y anulación) y `DISENO-BASE-ETAPA-6B.md` (actividad_lotes, operaciones_lote.actividad_id, v_carencias).

Marcas:
- **[Decidido]** sale de las respuestas de Iñaki.
- **[Propuesta]** es diseño a validar.
- **[Abierta]** necesita una decisión antes de escribir la migración (sección 13).
- **[Supuesto]** es una simplificación aceptada, con su límite escrito.

Se mantiene lo de siempre:
- La actividad es inmutable y se corrige anulando.
- `p_id` es idempotente.
- Se escribe solo por funciones `security definer`, y leen los miembros.
- Se aprueba con 0 FALLA, 0 OMITIDAS y 0 PREPARACIONES FALLIDAS.

---

## 1. Qué es

Una sola operación [Decidido]: **mover cabezas de categorías de cría al pie** (terneros y terneras) **desde uno o más lotes de origen hacia uno o más lotes de destino nuevos**.

- **Nunca se mueven** vacas ni toros. Solo se mueven categorías marcadas como cría al pie (sección 3).
- **Destete parcial** [Decidido]:
  - Las cantidades se editan por categoría; por defecto se mueve todo lo que hay de cría al pie en cada origen.
  - Un origen que queda vacío se cierra solo, con el motivo "Destetado".
  - Si le quedan animales, por ejemplo las vacas, sigue abierto.
- **La categoría no cambia** [Decidido]: Terneros y Terneras siguen igual hasta que se recategoricen con `recategorizar_lote`.
  - **Única excepción:** asignar el sexo a las crías sin sexar (sección 2.2). Al terminar el destete no queda ninguna cría sin sexar en los destinos.
- **Sin peso:** el peso al destete se carga con una pesada. Al terminar, la app ofrece ir directo a cargarla (sección 10).

Casos que cubre:

| Situación en el campo | Origen | Qué queda |
|---|---|---|
| Terneros al pie, en el lote de las vacas | el lote de vacas de cría | el lote de vacas sigue abierto, sin terneros |
| Terneros en un lote propio ("Terneros Nacidos 2026") | el lote de cría | el lote de cría queda vacío y se cierra |
| Destete parcial (los más grandes primero) | cualquiera de los dos | el origen sigue abierto con los que quedan |
| Varios lotes a la vez | varios orígenes | cada uno según lo que le quede |

**Ovinos:** la marca "Cría al pie" es por categoría, así que el destete funciona igual con corderos y corderas, **sin cambios en la base ni en las funciones**. Solo hace falta marcar esas categorías. Se marcan desde el principio [Decidido, A10].

---

## 2. Cambios previos: parición y crías sin sexar

### 2.1 Crías al pie, en el mismo lote de las madres [Decidido]

Hoy `registrar_paricion` rechaza `lote_cria_id = lote_madres_id` ("El lote de cría no puede ser el de las madres"). Se permite:
- El lote de cría puede ser el mismo de las madres.
- Un lote de madres puede registrar varias pariciones.
- `actividad_lotes` ya lo admite: su clave incluye el rol, así que el mismo lote queda como `principal` y como `cria`.
- La anulación de la parición no cambia: resta las crías del lote donde entraron.
- En la app, la parición ofrece tres opciones:
  - **"Quedan con las madres"**, que es la opción por defecto [Decidido, A9];
  - un lote de cría existente;
  - un lote de cría nuevo.

### 2.2 Crías sin sexar [Decidido, A1]

La parición puede cargar "20 Terneros/as" sin definir machos y hembras.
- Se agrega la categoría **"Terneros/as"** (sin sexar), con la marca "Cría al pie":
  - al catálogo base;
  - a los establecimientos existentes, por migración.
- **El sexo se asigna en el destete:**
  - las crías sin sexar que salen de un origen entran a los destinos como Terneros o Terneras;
  - **ningún destino puede recibir crías sin sexar**;
  - es el único cambio de categoría permitido en el destete.
- **También se puede asignar antes**, con `recategorizar_lote` (Terneros/as → Terneros o Terneras), sin cambios en esa función: ya permite cualquier categoría de la misma especie.
- Para saber qué categoría es macho, hembra o sin sexar, cada categoría de cría al pie lleva su sexo (sección 3).

---

## 3. Categorías de cría al pie

El destete tiene que saber qué categorías puede mover y de qué sexo son, sin depender del nombre: el administrador puede renombrar o crear categorías.

- [Propuesta] Columnas nuevas en `categorias_animales`:
  - `cria_al_pie boolean not null default false`;
  - `sexo text null check (sexo in ('macho', 'hembra'))` Solo tiene sentido con `cria_al_pie`; null con `cria_al_pie` significa "sin sexar".
- **La migración marca** [Decidido, A2]:
  - **Terneros** (macho) y **Terneras** (hembra), los que ya existen;
  - **Terneros/as** (sin sexar), que es nueva.
  - También Corderos (macho), Corderas (hembra) y **Corderos/as** (sin sexar, nueva) [Decidido, A10].
- **El administrador las edita** en Especies, con una casilla "Cría al pie" y el sexo en cada categoría.
- **El destete** rechaza mover cualquier categoría sin la marca (22023, "Solo se destetan categorías de cría al pie").
- **La parición** acepta **solo categorías de cría al pie** [Decidido, A2]: no puede sumar vacas por error.
- **Riesgo de destetar dos veces** [Decidido, A2]:
  - Como la categoría no cambia, los terneros destetados siguen siendo "cría al pie".
  - La pantalla **avisa, sin bloquear**, si un lote de origen ya fue destino de un destete no anulado: "Este lote ya viene de un destete (fecha). ¿Seguro que querés destetarlo otra vez?".

---

## 4. La carga

`registrar_destete(p_id, p_establecimiento_id, p_fecha, p_origenes jsonb, p_destinos jsonb, p_persona_id, p_notas)`

```
p_origenes: [{ "lote_id", "lineas": [{ "categoria_id", "cabezas" }] }]
p_destinos: [{ "nombre", "potrero_id"?, "anios_nacimiento": [..], "lineas": [{ "categoria_id", "cabezas" }] }]
```

**Reglas:**
- **Orígenes:**
  - Activos, del establecimiento, de la misma especie y sin repetir.
  - Se bloquean ordenados por id.
  - Cada línea es de una categoría de cría al pie, con cabezas mayores a 0 y no más que el stock del origen a esa fecha.
- **Destinos:** **solo lotes nuevos** [Decidido, A3].
  - Cada uno lleva nombre, potrero opcional y años de nacimiento, que valida el trigger de siempre.
  - Lleva al menos una línea, **solo de categorías de cría al pie con sexo**: nunca sin sexar.
- **Balance** [Decidido, A1]:
  - **En cabezas totales:** lo que sale de los orígenes es igual a lo que entra a los destinos.
  - **Por categoría con sexo:** lo que entra de cada una no es menos que lo que sale de ella. La diferencia sale de las sin sexar. Así, una ternera ya sexada no puede entrar como ternero.
  - Con lo anterior y ningún destino sin sexar, las sin sexar que salen quedan repartidas exactamente entre machos y hembras.
- **Fecha:**
  - No futura.
  - No anterior a la apertura de ningún origen.
  - Si la fecha deja un origen vacío, no puede ser anterior a su último movimiento (como `unir_lotes`).
- **Saldo día por día** en cada origen, con `_validar_saldo`.
- Persona opcional, como en el resto.

---

## 5. Años de nacimiento sugeridos

Salen de las **fechas de las pariciones, no del destete** [Decidido]. Siempre se pueden editar.

- **Pariciones de un origen:** las no anuladas cuyas crías entraron a ese lote (`act_paricion.lote_cria_id`, que puede ser el mismo lote de las madres).
- **Desde cuándo:** cuentan las pariciones posteriores al último destete no anulado de ese origen. Si no hubo destete, desde la apertura del lote.
  - Así, en un lote de vacas con pariciones de varios años no se arrastran los años de los terneros ya destetados.
- **Años de un destino:** los años de esas fechas, de todos los orígenes que le aportan (sección 7).
- **Sin pariciones registradas**, por ejemplo terneros comprados: se sugieren los años del lote de origen y, si no tiene, se deja vacío.
- La sugerencia la calcula la app, leyendo `act_paricion` y `actividades` con RLS. La base guarda lo que llega, validado por `validar_anios_nacimiento`.

---

## 6. Destinos por defecto

[Decidido] Si hay machos y hembras (contando las sin sexar después de asignarles el sexo), la app sugiere **un destino por sexo**:
- "Terneros destetados <año>";
- "Terneras destetadas <año>".

Hay un botón **"Juntar todo en un lote"**. La lista de destinos se puede editar: agregar, quitar, renombrar, cambiar potrero, años y cantidades.

- `<año>` es el de la sugerencia de la sección 5; si son varios, el más reciente.
- Si hay crías sin sexar, la app pide primero cuántas son machos y cuántas hembras.
- La app muestra el balance ("Faltan asignar 3 cabezas", "Quedan 2 sin sexar") y no deja guardar hasta que cierre.

---

## 7. Stock, linaje, carencias y archivos

### 7.1 Cómo funciona hoy la carencia

Hoy la carencia **no se guarda en el lote**: la calcula la vista `v_carencias` cada vez que se consulta.
1. Parte de cada sanidad no anulada con algún producto de carencia mayor a 0, sobre su lote.
2. Recorre las operaciones de lote (`operaciones_lote` y `operacion_lote_vinculos`) en las que ese lote fue **origen**, con fecha igual o posterior a la sanidad:
   - incluye división y unión;
   - excluye la recategorización y las operaciones de actividades anuladas.
3. Pasa a **todos los destinos** de esas operaciones, y desde ellos sigue recorriendo (hasta 20 niveles, sin repetir lotes).
4. Devuelve una fila por lote, sanidad y producto, con `fin_carencia` y la marca `heredada`.

La app toma la **fecha de fin más lejana** de las filas de un lote ("En carencia hasta el …"). Eso ya es "la carencia más restrictiva".

`linaje_lote` funciona igual: solo lee operaciones y sus vínculos de origen y destino, nunca los movimientos de stock. Hoy todavía no excluye las operaciones de actividades anuladas.

### 7.2 Vínculos a nivel lote [Decidido, A7]

No se asigna animal por animal. Se registra **"el origen X aportó al destino Y"**.
- **Cuándo X aportó a Y:** X saca alguna categoría que Y recibe. Las sin sexar de X cuentan como aporte a cualquier destino que reciba machos o hembras.
  - **[Supuesto]** Es conservador: con dos orígenes que sacan Terneros y dos destinos que reciben Terneros, los dos orígenes quedan vinculados a los dos destinos, aunque en el campo cada destino haya recibido animales de uno solo.
  - Sobra en el aviso de carencia, nunca falta.
- **Cómo se guarda** [Propuesta]: una `operaciones_lote` de tipo `destete` **por cada par X → Y que aportó**, con su vínculo de origen, su vínculo de destino y su `actividad_id`.
  - **Esas operaciones no llevan movimientos de stock.** Los eventos del destete (`lote_eventos`, tipo `destete`) cuelgan de la actividad (`actividad_id`), no de una operación, como los de compra, venta o parición.
  - Así no hace falta repartir cantidades entre pares, y el stock queda exacto por lote y categoría.
- **Carencia:** con eso, `v_carencias` hereda a cada destino las carencias de **todos los orígenes que le aportaron**, sin cambiar la vista. El comentario de la vista ya preveía el destete. La app sigue mostrando la más restrictiva.
- **Linaje:** `linaje_lote` muestra en cada destino **todos los orígenes que le aportaron**, sin cambiar su lógica. Se reemplaza solo para excluir las operaciones de actividades anuladas.

### 7.3 Lo demás

- **Eventos:**
  - negativos en los orígenes y positivos en los destinos, todos con `actividad_id`;
  - un origen con crías sin sexar tiene su evento negativo en "Terneros/as", y el destino, sus positivos en Terneros y Terneras.
- **Archivos** [Decidido, A8]: cada destino recibe los archivos visibles de **todos** los orígenes, por referencia y sin duplicar, como `unir_lotes`.
- **`actividad_lotes`:** los orígenes con rol `origen` y los destinos con rol `destino` (los roles ya existen desde la 6b-1). `actividades.lote_id` queda en null, como en los tipos de varios lotes.
- **`actividad_lineas`:** el total que entra por categoría, ya con el sexo asignado, para que `v_actividades` muestre las cabezas como en el resto de los tipos.

---

## 8. Anulación (definida desde el principio)

**Se puede anular solo si ningún destino tuvo movimientos posteriores** [Decidido]. Para cada lote de destino:
- **Ningún evento de stock** (`lote_eventos`) que no sea del propio destete, **cualquiera sea su fecha**. Esto cubre venta, mortandad, ajuste, compra, parición, división, unión, recategorización y un movimiento cargado después con fecha anterior.
- **Ninguna pesada no anulada** [Decidido, A4]. Es viable: la pesada queda en `actividad_lotes` con el destino como lote principal, y alcanza con buscarla. Hay que anular primero la pesada y volver a cargarla después.
- **Sigue abierto.**

**Qué no bloquea** [Decidido, A4]: la sanidad y las otras actividades sin stock (esquila, servicio, diagnóstico, personalizada). Quedan en el historial de un lote que se cierra, y su carencia sigue visible en ese lote.

**Qué hace:**
- Eventos inversos con la fecha original.
- Reabre los orígenes que el destete cerró, con registro de reapertura.
- Los destinos quedan vacíos y se cierran, con el motivo "Anulación de destete".
- Las operaciones de los pares dejan de contar: `v_carencias` ya ignora las de actividades anuladas, y `linaje_lote` se reemplaza para ignorarlas también.
- Las crías sin sexar vuelven al origen como sin sexar, porque el evento inverso usa la categoría original.

Si no se puede anular, el error dice el motivo: 22023, "El lote X ya tuvo movimientos o una pesada después del destete: anulalos primero".

---

## 9. Porcentaje de destete (definido desde el principio; se calcula en la Etapa 7)

**% de destete = terneros destetados / vacas entoradas** [Decidido], acumulado sobre las pariciones (los destetes parciales suman).

- **Nivel** [Decidido, A6]: **establecimiento y temporada**. El reparto por lote de madres no se resuelve ahora; queda para cuando se necesite.
- **Numerador:** las cabezas que salieron de los orígenes en destetes no anulados de esa temporada, sumando machos, hembras y sin sexar.
- **Denominador:** las vacas entoradas (`act_servicio.vacas_entoradas`) de los servicios no anulados de esa temporada, sumadas por lote.
- **Temporada** [Decidido, A5]: de julio a junio. Por ejemplo, la temporada 2025/26 junta los servicios del 1/7/2025 al 30/6/2026.
- **[Supuesto, A5] Repaso:**
  - Si un lote tiene más de un servicio en la misma temporada, se toma el **mayor** número de vacas entoradas y no la suma, para no contar dos veces las mismas vacas.
  - **Límite:** subestima el denominador, y sobreestima el %, si el repaso incluye vacas distintas de las del primer servicio.
- **De qué temporada es un destete:** la Etapa 7 lo define con los datos que ya se guardan, siguiendo las pariciones del origen (sección 5) y el servicio anterior de su lote de madres. La 6b-2 no agrega columnas para el indicador.
- El porcentaje puede superar 100 % con mellizos. Se muestra igual.

---

## 10. Pantallas

### 10.1 Destete

**Nueva actividad → Destete**, y también un botón **Destete** en la ficha de un lote que tenga cría al pie, que precarga ese origen.

1. **Orígenes:**
   - Lotes activos de una especie con stock de cría al pie.
   - Por cada uno se ven sus categorías de cría con el stock actual y una cantidad editable, que por defecto es todo. Las vacas y los toros no aparecen.
   - Aviso si el lote ya viene de un destete (sección 3).
2. **Sexo de las sin sexar**, si hay: cuántas son machos y cuántas hembras.
3. **Destinos:** sugeridos según la sección 6, con "Juntar todo en un lote". Cada destino lleva nombre, potrero, años (sugeridos y editables, con el selector de años) y cantidades por categoría, y la pantalla muestra el balance.
4. Fecha, responsable y notas.
5. **Al guardar:** se muestra una confirmación con los lotes nuevos y, por cada uno, el botón **"Cargar pesada"**. Lleva a `/actividades/nueva?tipo=pesada&lote=<destino>`; esa pantalla ya lee `tipo` y `lote` de la dirección.

El detalle de la actividad muestra orígenes, destinos (con sus orígenes aportantes) y cabezas por categoría. Desde ahí se anula, con el motivo si no se puede.

### 10.2 Parición

- La opción **"Quedan con las madres"** está marcada por defecto (A9).
- Las categorías ofrecidas son solo las de cría al pie, incluida "Terneros/as".

### 10.3 Tarjeta y clase del lote [Decidido, A9]

- **Tarjeta:**
  - Si el lote tiene crías al pie **y** otras categorías, las muestra por separado: "100 vacas + 20 crías al pie".
  - Si solo tiene crías al pie, por ejemplo un lote de destetados o de cría propio, muestra el total como hoy: "40 terneros".
- **`agrupacion.ts`:**
  - Mapea las categorías nuevas: "Terneros/as" y "Corderos/as".
  - Pasa a usar la marca `cria_al_pie` en lugar del nombre para separar las crías.
- **Clase predominante del lote:**
  - **Las crías al pie no cuentan** cuando el lote tiene otras categorías: 100 vacas y 80 terneros al pie es un lote de **cría**.
  - Si el lote solo tiene crías al pie, la clase sale de ellas, como hoy: **recría**.

---

## 11. Cambios en el esquema

| Objeto | Hoy | Cambio |
|---|---|---|
| `categorias_animales` | sin marca | `cria_al_pie boolean not null default false` y `sexo` (macho, hembra o null); se marcan Terneros, Terneras y Terneros/as |
| Catálogo base (`_cargar_catalogos_base`) | sin crías sin sexar | agrega "Terneros/as" y "Corderos/as", con la marca |
| Establecimientos existentes | sin crías sin sexar | la migración agrega "Terneros/as" en cada especie bovina y "Corderos/as" en cada ovina |
| `registrar_paricion` | rechaza cría = madres; acepta cualquier categoría | permite cría = madres; solo categorías de cría al pie |
| `lote_eventos.tipo` (check) | sin `destete` | agregar `destete` |
| `lote_eventos`, regla de operación | division, union, recategorizacion | **sin cambio**: los eventos del destete no llevan operación (7.2) |
| `lote_eventos`, regla de actividad | paricion, compra, venta, mortandad | sumar `destete` |
| `operaciones_lote.tipo` (check) | division, union, recategorizacion | agregar `destete` (operaciones sin eventos, una por par) |
| `actividades.tipo` | ya acepta `destete` (los 12 tipos) | sin cambios |
| `registrar_destete` | no existe | nueva (sección 4) |
| `anular_actividad` | sin destete | se reemplaza (sección 8) |
| `linaje_lote` | toma también las operaciones de actividades anuladas | se reemplaza para excluirlas |
| `v_carencias` | ya prevé el destete | sin cambios |
| `v_actividades` | sin destete | agrega orígenes y destinos, o los toma de `actividad_lotes` |

Los checks de `lote_eventos` y `operaciones_lote` se crearon sin nombre: la migración busca el nombre real en `pg_constraint` antes de borrarlos, como ya estaba previsto.

**Partición propuesta de la migración:**
1. Parición al pie, marcas de cría al pie y sexo, y categoría sin sexar. Se puede usar sola.
2. El destete.

---

## 12. Pruebas

Archivo nuevo `etapa6b2_rls.sql`:
- **Parición:** al pie (cría = madres), varias pariciones en el mismo lote, y una parición con una categoría que no es cría al pie, que se rechaza.
- **Destete, casos válidos:**
  - total y parcial;
  - de uno y de varios orígenes, a uno y a varios destinos;
  - con sin sexar repartidas entre machos y hembras.
- **Destete, rechazos:**
  - un destino con sin sexar;
  - una ternera sexada que entra como ternero;
  - totales que no cierran;
  - vacas;
  - fecha anterior al último movimiento con origen vacío;
  - origen cerrado.
- **Efectos:**
  - años guardados;
  - un par por cada X → Y que aportó (supuesto conservador);
  - carencia de todos los orígenes heredada por cada destino;
  - linaje con todos los orígenes;
  - archivos de todos los orígenes;
  - asignar el sexo antes con `recategorizar_lote`.
- **Anulación:**
  - sin movimientos (se anula);
  - con venta en un destino (bloquea);
  - con un movimiento cargado después con fecha anterior (bloquea);
  - con pesada (bloquea);
  - con sanidad (no bloquea);
  - reapertura de los orígenes;
  - las sin sexar vuelven sin sexar;
  - el linaje y la carencia dejan de contar.
- **Generales:** idempotencia con `p_id`; permisos de consulta, de otro establecimiento y de anon.

Se vuelven a correr `etapa5`, `etapa6a`, `etapa6b1`, `lotes_anios_nacimiento`, `lote_archivos_rls`, `lote_cerrado_no_se_edita` y la auditoría, que suma `registrar_destete`.

---

## 13. Decisiones

| # | Pregunta | Decisión |
|---|---|---|
| A1 | Crías sin sexar | **Cerrada.** El sexo se asigna en el destete; ningún destino queda con sin sexar; balance en cabezas totales; también se puede asignar antes con `recategorizar_lote` |
| A2 | Parición solo con cría al pie | **Cerrada.** Sí. La migración marca Terneros y Terneras existentes. La pantalla avisa si el origen ya fue destino de un destete |
| A3 | Destino existente | **Cerrada.** Solo lotes nuevos |
| A4 | Qué bloquea la anulación | **Cerrada.** Los movimientos de stock y la pesada bloquean; la sanidad no |
| A5 | Temporada y repaso | **Cerrada.** De julio a junio; con repaso, el mayor número de vacas entoradas (supuesto: subestima si el repaso incluye vacas distintas) |
| A6 | Reparto por lote de madres | **Cerrada (postergada).** La Etapa 7 calcula por establecimiento y temporada |
| A7 | Asignación origen → destino | **Cerrada.** Vínculos a nivel lote (X aportó a Y); carencia más restrictiva de todos los aportantes; linaje con todos |
| A8 | Archivos | **Cerrada.** Cada destino recibe los visibles de todos los orígenes, por referencia |
| A9 | Parición por defecto y tarjeta | **Cerrada.** "Quedan con las madres" por defecto; tarjeta "100 vacas + 20 crías al pie"; las crías no cuentan para la clase si hay otras categorías |
| A10 | Ovinos | **Cerrada.** La migración marca también Corderos (macho), Corderas (hembra) y la nueva Corderos/as (sin sexar) como cría al pie |
| A11 | Sexo de la categoría | **Cerrada.** Columna `sexo` (macho, hembra o null) junto a `cria_al_pie` |
