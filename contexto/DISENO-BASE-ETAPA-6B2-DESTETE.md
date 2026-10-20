# Campo Digital — Diseño de la base, Etapa 6b-2: destete

> **EN REVISIÓN — no implementar hasta cerrar las decisiones A1 a A9 (sección 13).**

Estado: **en revisión** (2026-10-20). Sin migraciones. Reemplaza la sección 4 de `DISENO-BASE-ETAPA-6B.md` (destete "cada lote pasa entero a un lote nuevo") y la sección 1 bis de `DISENO-LOTES-ANIOS-Y-ARCHIVOS.md` (destete como división).

Base: las respuestas de Iñaki del 2026-10-20, `DISENO-BASE-ETAPA-5.md` (operaciones de lote y linaje), `DISENO-BASE-ETAPA-6A.md` (parición y anulación) y `DISENO-BASE-ETAPA-6B.md` (actividad_lotes, operaciones_lote.actividad_id, v_carencias).

Marcas:
- **[Decidido]** sale de las respuestas de Iñaki.
- **[Propuesta]** es diseño a validar.
- **[Abierta]** necesita una decisión antes de escribir la migración. Están juntas en la sección 13.

Se mantiene lo de siempre:
- La actividad es inmutable y se corrige anulando.
- `p_id` es idempotente.
- Se escribe solo por funciones `security definer`, y leen los miembros.
- Se aprueba con 0 FALLA, 0 OMITIDAS y 0 PREPARACIONES FALLIDAS.

---

## 1. Qué es

Una sola operación [Decidido]: **mover cabezas de categorías de cría al pie** (terneros y terneras, corderos y corderas) **desde uno o más lotes de origen hacia uno o más lotes de destino**.

- **Nunca se mueven** vacas, ovejas, toros ni carneros. Solo se mueven categorías marcadas como cría al pie (sección 3).
- **Destete parcial:**
  - Las cantidades se editan por categoría; por defecto se mueve todo lo que hay de cría al pie en cada origen.
  - Un origen que queda vacío se cierra solo, con el motivo "Destetado".
  - Si le quedan animales, por ejemplo las vacas, sigue abierto.
- **La categoría no cambia** [Decidido]: los terneros siguen siendo Terneros hasta que se recategoricen con `recategorizar_lote`. La única excepción posible es el sexado de crías sin sexar (decisión abierta A1).
- **Sin peso:** el peso al destete se carga con una pesada. Al terminar, la app ofrece ir directo a cargarla (sección 10).

Casos que cubre:

| Situación en el campo | Origen | Qué queda |
|---|---|---|
| Terneros al pie, en el lote de las vacas | el lote de vacas de cría | el lote de vacas sigue abierto, sin terneros |
| Terneros en un lote propio ("Terneros Nacidos 2026") | el lote de cría | el lote de cría queda vacío y se cierra |
| Destete parcial (los más grandes primero) | cualquiera de los dos | el origen sigue abierto con los que quedan |
| Varios lotes a la vez | varios orígenes | cada uno según lo que le quede |

---

## 2. Cambios previos en la parición

Para que lo anterior funcione, la parición tiene que admitir lo que pasa en el campo.

### 2.1 Crías al pie, en el mismo lote de las madres [Decidido por la respuesta 1; cambio en la base]

Hoy `registrar_paricion` rechaza `lote_cria_id = lote_madres_id` ("El lote de cría no puede ser el de las madres"). Se permite:
- El lote de cría puede ser el mismo de las madres.
- `actividad_lotes` ya lo admite: su clave incluye el rol, así que el mismo lote queda como `principal` y como `cria`.
- La anulación de la parición no cambia: resta las crías del lote donde entraron.
- En la app, la parición ofrece tres opciones:
  - "Quedan con las madres", que es la opción por defecto [Propuesta];
  - un lote de cría existente;
  - un lote de cría nuevo.

### 2.2 Crías sin sexar [Abierta A1]

Iñaki: "se registra, por ejemplo, 20 terneros/as hasta la fecha X; no hay por qué definir aún cuántos son machos y cuántas hembras". Hoy el catálogo no tiene una categoría para eso: solo Terneros y Terneras (Corderos y Corderas en ovinos).

Dos caminos:

| | A1-a: categoría "Terneros/as" (sin sexar) y se sexa en el destete | A1-b: se sexa antes, con `recategorizar_lote` |
|---|---|---|
| Parición | se carga "20 Terneros/as" | igual |
| Destete | al mover las sin sexar, se elige a qué destino van como Terneros y como Terneras (la suma tiene que dar) | solo mueve categorías sexadas; si hay sin sexar, la app pide recategorizar primero |
| La categoría cambia en el destete | sí, solo de sin sexar a sexado | nunca |
| Pasos en el campo | uno | dos (recategorizar y después destetar) |

**Recomendación: A1-a.** En el destete se cuentan machos y hembras de todos modos, y con un solo paso se cargan los dos. Respeta la respuesta 3: Terneros y Terneras no cambian; lo único que se asigna es el sexo a las sin sexar.

Para las dos opciones se agrega al catálogo base "Terneros/as" (vacunos) y "Corderos/as" (ovinos), y en los establecimientos existentes se agregan por migración.

---

## 3. Categorías de cría al pie

El destete tiene que saber qué categorías puede mover, sin depender del nombre (el administrador puede renombrar o crear categorías).

- [Propuesta] `categorias_animales.cria_al_pie boolean not null default false`.
  - El catálogo base la marca en Terneros, Terneras y Terneros/as, y en Corderos, Corderas y Corderos/as.
  - La migración la marca por nombre en los establecimientos existentes.
- La edita el administrador en Especies, con una casilla "Cría al pie" en cada categoría.
- `registrar_destete` rechaza mover cualquier categoría que no la tenga (22023, "Solo se destetan categorías de cría al pie").
- La parición sigue aceptando cualquier categoría de la especie, como hoy. **[Abierta A2]**: ¿se limita también a categorías de cría al pie? Recomendación: sí, para que una parición no pueda sumar vacas por error.

---

## 4. La carga

`registrar_destete(p_id, p_establecimiento_id, p_fecha, p_origenes jsonb, p_destinos jsonb, p_persona_id, p_notas)`

```
p_origenes: [{ "lote_id", "lineas": [{ "categoria_id", "cabezas" }] }]
p_destinos: [{ "nombre", "potrero_id"?, "anios_nacimiento": [..], "lineas": [{ "categoria_id", "cabezas" }] }]
```

Con crías sin sexar (A1-a), una línea de destino puede llevar `"desde_categoria_id"`, que es la categoría sin sexar de la que sale. Por ejemplo: 12 Terneros que salen de "Terneros/as".

**Reglas:**
- **Orígenes:**
  - Activos, del establecimiento, de la misma especie y sin repetir.
  - Se bloquean ordenados por id.
  - Cada línea es de una categoría de cría al pie, con cabezas mayores a 0 y no más que el stock del origen a esa fecha.
- **Destinos:** lotes **nuevos** [Propuesta; Abierta A3: ¿también lotes existentes?].
  - Cada uno lleva nombre y potrero opcional.
  - Lleva sus años de nacimiento, que valida el trigger de siempre.
  - Lleva al menos una línea.
- **Balance por categoría:** lo que sale de los orígenes es exactamente lo que entra a los destinos. Con A1-a, las sin sexar que salen son igual a lo que entra como Terneros más Terneras con `desde` esa categoría.
- **Fecha:**
  - No futura.
  - No anterior a la apertura de ningún origen.
  - Si la fecha deja un origen vacío, no puede ser anterior a su último movimiento (como `unir_lotes`: no hay movimientos después de que el lote se vació).
- **Saldo día por día** en cada origen, con `_validar_saldo`.
- Persona opcional, como en el resto.

---

## 5. Años de nacimiento sugeridos

Salen de las **fechas de las pariciones, no del destete** [Decidido]. Siempre se pueden editar.

- **Pariciones de un origen:** las no anuladas cuyas crías entraron a ese lote (`act_paricion.lote_cria_id`, que puede ser el mismo lote de las madres; sección 2.1).
- **Desde cuándo:** cuentan las pariciones posteriores al último destete no anulado de ese origen. Si no hubo destete, desde la apertura del lote.
  - Así, en un lote de vacas con pariciones de varios años no se arrastran los años de los terneros ya destetados.
- **Años de un destino:** los años de esas fechas, de todos los orígenes que le aportan.
- **Sin pariciones registradas**, por ejemplo terneros comprados: se sugieren los años del lote de origen y, si no tiene, se deja vacío.
- La sugerencia la calcula la app, leyendo `act_paricion` y `actividades` con RLS. La base solo guarda lo que llega, validado por el trigger `validar_anios_nacimiento`.

---

## 6. Destinos por defecto

[Decidido] Si en los orígenes hay machos y hembras, la app sugiere **un destino por categoría**:
- "Terneros destetados <año>" con todos los Terneros;
- "Terneras destetadas <año>" con todas las Terneras.

Hay un botón **"Juntar todo en un lote"**. La lista de destinos se puede editar: agregar, quitar, renombrar, cambiar potrero, años y cantidades.

- `<año>` es el de la sugerencia de la sección 5; si son varios, el más reciente.
- Con crías sin sexar (A1-a), la app pide cuántas son machos y cuántas hembras antes de sugerir los destinos.
- La app muestra el balance por categoría ("Faltan asignar 3 Terneras") y no deja guardar hasta que cierre.

---

## 7. Stock, linaje y carencias

**Eventos** (`lote_eventos`, tipo `destete`):
- negativos en los orígenes y positivos en los destinos;
- cada uno con `actividad_id` y `operacion_lote_id`.

**Linaje: una `operaciones_lote` de tipo `destete` por cada par origen → destino** [Decidido en la 6b], solo para los pares que efectivamente comparten animales.
- **Asignación** [Propuesta]: dentro de cada categoría, los orígenes llenan los destinos en el orden de las listas. Por ejemplo, 30 Terneros de A y 20 de B hacia D1 (40) y D2 (10) dan A→D1 30, B→D1 10 y B→D2 10.
  - Determinista y sin que el usuario cargue una matriz.
  - Solo afecta el linaje y la herencia de carencias, nunca el stock.
- **Carencias:** `v_carencias` ya recorre las operaciones de lote salvo la recategorización. Agregar `destete` al check alcanza para que una sanidad del origen se herede al destino del par.
- **Archivos** [Propuesta]: cada destino hereda los archivos visibles de los orígenes que le aportan, por referencia y sin duplicar, como `unir_lotes`.
- **`actividad_lotes`:** los orígenes con rol `origen` y los destinos con rol `destino` (los roles ya existen desde la 6b-1). `actividades.lote_id` queda en null, como en los tipos de varios lotes.
- **`actividad_lineas`:** el total movido por categoría, para que `v_actividades` muestre las cabezas como en el resto de los tipos.

---

## 8. Anulación (definida desde el principio)

**Se puede anular solo si ningún destino tuvo movimientos posteriores** [Decidido]. Concretamente, para cada lote de destino:
- **No tiene ningún evento de stock** (`lote_eventos`) que no sea del propio destete, **cualquiera sea su fecha**. Esto cubre venta, mortandad, ajuste, compra, parición, división, unión y recategorización, y también un movimiento cargado después con fecha anterior.
- **Sigue abierto.**

Lo que **no** bloquea, como propuesta [Abierta A4]: las actividades que no mueven stock (pesada, sanidad, esquila, personalizada) hechas sobre los destinos. Quedan en el historial de un lote que se cierra.
- Recomendación: que no bloqueen, porque la pesada al destete es lo primero que se carga después.
- Lo que no deja de estar: una sanidad del destino queda registrada sobre un lote cerrado.

**Qué hace:**
- Eventos inversos con la fecha original.
- Reabre los orígenes que el destete cerró, con registro de reapertura.
- Los destinos quedan vacíos y se cierran, con el motivo "Anulación de destete".
- Las operaciones de linaje dejan de contar: `v_carencias` ya ignora las de actividades anuladas (6b-1), y `linaje_lote` **se reemplaza** en esta etapa para ignorarlas también (estaba previsto en la 6b).

Si no se puede anular, el error dice cuál destino tiene movimientos: 22023, "El lote X ya tuvo movimientos después del destete: anulalos primero".

---

## 9. Porcentaje de destete (definido desde el principio; se calcula en la Etapa 7)

**% de destete = terneros destetados / vacas entoradas** [Decidido], acumulado sobre las pariciones (los destetes parciales suman).

- **Numerador:** las cabezas de cría al pie que salieron de los orígenes en destetes no anulados, atribuidas a una temporada de servicio.
  - Se cuentan todas: machos, hembras y sin sexar.
  - Un ternero se cuenta una sola vez: se mide lo que sale de un origen y un destetado que vuelve a moverse ya no está en un lote con pariciones.
- **Denominador:** `act_servicio.vacas_entoradas` de los servicios del lote de madres en esa temporada.
- **Atribución:** destete → pariciones → servicio.
  1. Destete → pariciones: las pariciones del origen de la sección 5, es decir, posteriores al destete anterior.
     - Si un origen recibió crías de pariciones de varios lotes de madres, sus destetados se reparten **en proporción a los nacidos vivos** de cada uno [Propuesta].
  2. Parición → servicio: el último servicio del lote de madres anterior a la parición. Si el lote de madres cambió entre el servicio y la parición (división o unión), se sigue `linaje_lote` hacia atrás, como ya estaba previsto para la Etapa 7.
- **[Abierta A5] Temporada y repaso.**
  - **Temporada:** propuesta de julio a junio. Por ejemplo, la temporada 2025/26 junta los servicios del 1/7/2025 al 30/6/2026.
  - **Repaso:** si un lote tiene más de un servicio en la misma temporada, el denominador toma el **mayor** número de vacas entoradas y no la suma, para no contar dos veces las mismas vacas.
- **Lo que la 6b-2 tiene que guardar:** con eventos por par, `act_paricion` (lote de madres y de cría) y `act_servicio` alcanza. No se agregan columnas para el indicador. La Etapa 7 lo resuelve con una vista.
- El porcentaje puede superar 100 % con mellizos. Se muestra igual.

---

## 10. Pantalla

**Nueva actividad → Destete**, y también un botón **Destete** en la ficha de un lote que tenga cría al pie, que precarga ese origen.

1. **Orígenes:** lotes activos de una especie con stock de cría al pie. Por cada uno se ven sus categorías de cría con el stock actual y una cantidad editable, que por defecto es todo. Las vacas y los toros no aparecen.
2. **Sexado**, solo con A1-a y si hay sin sexar: cuántas son machos y cuántas hembras.
3. **Destinos:** sugeridos según la sección 6, con "Juntar todo en un lote". Cada destino lleva nombre, potrero, años (sugeridos y editables, con el selector de años) y cantidades por categoría, y la pantalla muestra el balance.
4. Fecha, responsable y notas.
5. **Al guardar:** se muestra una confirmación con los lotes nuevos y, por cada uno, el botón **"Cargar pesada"**. Lleva a `/actividades/nueva?tipo=pesada&lote=<destino>`; esa pantalla ya lee `tipo` y `lote` de la dirección.

El detalle de la actividad muestra orígenes, destinos y cabezas por categoría. Desde ahí se anula, con un aviso si un destino ya tuvo movimientos.

---

## 11. Cambios en el esquema

| Objeto | Hoy | Cambio |
|---|---|---|
| `categorias_animales` | sin marca | `cria_al_pie boolean not null default false`; catálogo base y datos existentes |
| Catálogo base | sin crías sin sexar | "Terneros/as" y "Corderos/as" (A1); también en los establecimientos existentes |
| `registrar_paricion` | rechaza cría = madres | lo permite (2.1); con A2, solo categorías de cría al pie |
| `lote_eventos.tipo` (check) | sin `destete` | agregar `destete` |
| `lote_eventos`, regla de operación | division, union, recategorizacion | sumar `destete` |
| `lote_eventos`, regla de actividad | paricion, compra, venta, mortandad | sumar `destete` |
| `operaciones_lote.tipo` (check) | division, union, recategorizacion | agregar `destete` |
| `actividades.tipo` | ya acepta `destete` (los 12 tipos) | sin cambios |
| `registrar_destete` | no existe | nueva (sección 4) |
| `anular_actividad` | sin destete | se reemplaza para el destete (sección 8) |
| `linaje_lote` | toma también las operaciones de actividades anuladas | se reemplaza para excluirlas |
| `v_actividades` | sin destete | agrega orígenes y destinos, o los toma de `actividad_lotes` |

Los checks de `lote_eventos` y `operaciones_lote` se crearon sin nombre: la migración busca el nombre real en `pg_constraint` antes de borrarlos, como ya estaba previsto.

Partición propuesta de la migración:
1. Parición al pie, `cria_al_pie` y categorías sin sexar. Es chica y se puede usar sola: permite cargar las pariciones como pasan en el campo.
2. El destete.

---

## 12. Pruebas

Archivo nuevo `etapa6b2_rls.sql`:
- parición al pie;
- destete total y parcial, de uno y de varios orígenes, a uno y a varios destinos;
- balance que no cierra;
- categoría que no es cría al pie (vacas): rechazada;
- fecha anterior al último movimiento con origen vacío;
- origen cerrado;
- años sugeridos guardados;
- linaje por par con la asignación en orden;
- carencia heredada por el destino;
- archivos heredados;
- anulación con y sin movimientos posteriores en los destinos, y con un movimiento cargado después con fecha anterior;
- reapertura de los orígenes;
- idempotencia con `p_id`;
- permisos: consulta, otro establecimiento y anon.

Se vuelven a correr `etapa5`, `etapa6a`, `etapa6b1`, `lotes_anios_nacimiento`, `lote_archivos_rls`, `lote_cerrado_no_se_edita` y la auditoría, que suma `registrar_destete`.

---

## 13. Decisiones abiertas

| # | Pregunta | Recomendación |
|---|---|---|
| **A1** | Crías sin sexar: ¿se sexan en el destete (A1-a) o antes, recategorizando (A1-b)? | **A1-a**: un solo paso en el campo; solo se asigna el sexo a las sin sexar |
| **A2** | ¿La parición acepta solo categorías de cría al pie? | **Sí**, para no sumar vacas por error |
| **A3** | ¿Un destino puede ser un lote existente (por ejemplo, juntar un segundo destete parcial con el primero)? | **No por ahora**: solo lotes nuevos, y después se unen con Unir. La anulación y los años quedan simples |
| **A4** | Para anular, ¿bloquean las actividades sin stock (pesada, sanidad) hechas en los destinos? | **No bloquean**: solo los movimientos de stock |
| **A5** | Temporada del indicador y repaso | Temporada **julio a junio**; con varios servicios del mismo lote en una temporada, el **mayor** número de vacas entoradas |
| **A6** | Origen alimentado por pariciones de varios lotes de madres: ¿cómo se atribuyen los destetados? | **Proporcional a los nacidos vivos** de cada uno |
| **A7** | Asignación origen → destino para el linaje cuando hay varios de cada lado | **En orden de las listas**, sin matriz para el usuario |
| **A8** | ¿Los destinos heredan los archivos de los orígenes? | **Sí**, por referencia, como Unir |
| **A9** | ¿En la parición, "quedan con las madres" es la opción por defecto? | **Sí** |
