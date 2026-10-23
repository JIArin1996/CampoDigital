# Campo Digital — Diseño de la base, Etapa 8: tareas (en la Bitácora), calendario y avisos

Estado: **implementado** (2026-10-23). Decisiones C1 a C6 cerradas como se recomendó.

- Base: `20261023000100_tareas.sql`; pruebas `etapa8_tareas.sql` (44), `etapa5_rls.sql` y auditoría (78 funciones).
- App: tareas en la Bitácora, pantalla Calendario, contador de vencidas en el menú y bloque "Tareas y vencimientos" en el inicio.
- Repetición: la siguiente vence N días después de `greatest(hoy, vencimiento)`, para no perder el ritmo si se hace antes.

**Decidido por Iñaki (2026-10-23):** la tarea es **un tipo más de nota de la Bitácora**, no una tabla aparte.

Base:
- `00-ENFOQUE-V2.md`, sección 11: tareas y calendario. Responsable opcional (sin responsable, la tarea es de todos los operadores). Calendario, primera versión, como lista de próximas y vencidas con filtros.
- `MODELO-DE-DATOS-V2.md`, sección 9, que proponía una tabla `tareas`: queda reemplazada por esta decisión.
- `DISENO-BASE-ETAPA-5.md`: la Bitácora (`bitacora_entradas`, `bitacora_lotes`, anular y restaurar).
- `DISENO-BASE-ETAPA-6B.md`: `act_sanidad_productos.fecha_proxima_dosis`.

Marcas:
- **[Decidido]** sale de esos documentos o de Iñaki.
- **[Propuesta]** es diseño a validar.
- **[Abierta]** necesita una decisión.

---

## 1. Qué es una tarea

Una nota de la Bitácora de tipo **Tarea**. Tiene todo lo de cualquier nota:
- fecha en que se anotó y texto;
- **responsable** (opcional: sin responsable, es de todos los operadores) [Decidido];
- uno o más **lotes** (opcional);
- se edita, se anula con motivo y se restaura; nunca se borra.

Además lleva:
- **vencimiento**: la fecha para la que hay que hacerla;
- **estado**: pendiente, hecha o cancelada, con quién y cuándo la marcó hecha.

Ejemplos: "Vacunar contra aftosa el lote Vacas de Cría" (vence el 15/11, responsable Juan); "Cobrar el arrendamiento forestal" (vence el 1/12, sin responsable).

---

## 2. Cambios en la base [Propuesta]

`bitacora_entradas`:

| Columna | Tipo | Regla |
|---|---|---|
| `tipo` (check) | | suma `tarea` |
| `vencimiento` | date | obligatorio en las tareas y vacío en las demás notas [Abierta C1] |
| `estado_tarea` | text | `pendiente`, `hecha` o `cancelada`; solo en las tareas (como `estado_idea` en las ideas) |
| `completada_en`, `completada_por` | timestamptz, uuid | solo con `hecha`; se borran si se vuelve a pendiente |
| `repetir_cada_dias` | int | opcional, solo en tareas (C3) |
| `entrada_origen_id` | uuid | opcional: la nota de la que salió la tarea (C4) |

Funciones:
- `crear_entrada_bitacora` y `editar_entrada_bitacora` suman `p_vencimiento` (y lo de C3 y C4). Cambia la firma: se borran y se vuelven a crear, con los mismos permisos.
- **`cambiar_estado_tarea(entrada, estado)`**, nueva, como `cambiar_estado_idea`. Al marcarla hecha guarda quién y cuándo. Una tarea anulada no cambia de estado.
- Quién carga, edita y cambia estados: quien puede cargar (administrador y operador), como el resto de la Bitácora. Consulta solo lee [Decidido: mismo criterio que la Bitácora].

---

## 3. Calendario [Decidido: primera versión en lista]

La pantalla Calendario pasa a ser una **lista con tres grupos**:
1. **Vencidas:** pendientes con vencimiento anterior a hoy, de la más vieja a la más nueva, resaltadas.
2. **Hoy y próximos 7 días.**
3. **Más adelante.**

Se puede filtrar por **responsable** ("mías", una persona o sin responsable), por **lote** y por **tipo**: tareas, próximas dosis (C2) o todo.

Cada tarea tiene **Hecha** y **Cancelar**; las hechas y canceladas se ven con un "Ver terminadas".

La vista mensual queda para después: el modelo ya guarda la fecha y el estado, así que se suma sin tocar tablas [Decidido].

---

## 4. Próximas dosis de sanidad [Abierta C2]

La sanidad ya guarda la fecha de la próxima dosis por producto. Dos caminos:

| | C2-a: se muestran solas en el calendario | C2-b: se crea una tarea automática |
|---|---|---|
| Cómo | El calendario lee `fecha_proxima_dosis` de las sanidades no anuladas, como un vencimiento más | Al registrar la sanidad se crea una nota de tipo Tarea "Segunda dosis de …" |
| Marcarla hecha | Cargando la sanidad siguiente, o con "Hecha" (queda una marca) | Como cualquier tarea |
| Si se anula la sanidad | Desaparece sola | Hay que anular también la tarea |
| Bitácora | No se llena de tareas automáticas | Aparecen como notas |

**Recomendación: C2-a.** No duplica datos, y si la sanidad se anula, el aviso desaparece solo. Para marcarla hecha sin cargar otra sanidad hace falta una tabla chica de "dosis ya dadas", que la anota al tocar "Hecha".

---

## 5. Avisos dentro de la app [Decidido: solo dentro de la app]

- **Contador** en el menú, en Calendario (escritorio) y en la barra de abajo (celular), con la cantidad de **vencidas** de quien está usando la app: las suyas y las sin responsable.
- **Inicio:** el bloque "Tareas y vencimientos" reemplaza al "próximamente", con las vencidas y las de los próximos 7 días y un acceso al Calendario.
- Sin notificaciones push ni correo en esta etapa.

---

## 6. Bitácora

- "Tarea" aparece como un tipo más en el alta, el filtro y la tarjeta.
- La tarjeta de una tarea muestra el vencimiento, el estado y el responsable, con los botones Hecha, Cancelar o Reabrir.
- Desde una **idea decidida**, un botón **"Crear tarea"** precarga el texto y los lotes (C4).

---

## 7. Pruebas

`etapa8_tareas.sql`:
- crear, editar y anular una tarea;
- vencimiento obligatorio;
- estados: hecha (con quién y cuándo), reabrir y cancelada;
- una tarea anulada no cambia de estado;
- una nota que no es tarea no tiene vencimiento ni estado;
- repetición (si C3);
- permisos: Consulta solo lee, otro establecimiento y anon.

Si se elige C2-a, también las próximas dosis en la vista del calendario y la marca de "hecha".

Se vuelven a correr `etapa5` (la Bitácora) y la auditoría, que suma funciones.

---

## 8. Decisiones (cerradas: todas como se recomendó)

| # | Pregunta | Recomendación |
|---|---|---|
| **C1** | ¿Una tarea puede no tener vencimiento ("algún día")? | **No**: sin fecha no entra en el calendario ni en los avisos; para "algún día" está la idea |
| **C2** | Próximas dosis de sanidad: ¿se muestran solas en el calendario (a) o se crea una tarea automática (b)? | **a)**, con la marca de "dosis dada" |
| **C3** | ¿Tareas que se repiten (por ejemplo, revisar aguadas cada 15 días)? Al marcar hecha, se crea la siguiente | **Sí**, con "repetir cada N días" opcional |
| **C4** | ¿"Crear tarea" desde una idea o una nota, quedando vinculadas? | **Sí**, y en la nota de origen se ve la tarea y su estado |
| **C5** | ¿Quién marca hecha una tarea con responsable? ¿Solo el responsable, o cualquier operador? | **Cualquier operador** (queda registrado quién la marcó) |
| **C6** | El contador de vencidas: ¿las de todos, o las mías más las sin responsable? | **Las mías y las sin responsable**; en el Calendario se ven todas |
