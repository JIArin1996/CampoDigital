# Campo Digital - Modelo de datos v2 (borrador)

Estado: borrador de diseño. Se ajusta contra supabase/migrations/0000_baseline.sql cuando exista el volcado real del esquema. Base: contexto/00-ENFOQUE-V2.md. Todo lo marcado como [Decidido] sale de ese documento o de las definiciones tomadas con Iñaki. Todo lo marcado como [Propuesta] es una sugerencia de diseño que hay que validar.

## 1. Principios

- [Decidido] Multi-establecimiento y multi-especie ganadera. La generalidad va en los datos (catálogos por establecimiento), no en el código.
- [Decidido] El stock se calcula siempre desde eventos. Nunca se guarda como número.
- [Decidido] Las operaciones sobre lotes (dividir, juntar, recategorizar) son atómicas y quedan registradas. El lote absorbido se cierra, no se borra.
- [Decidido] Roles por establecimiento: editor (carga y edita) y lector (solo lectura, ve todo, incluida la economía).
- [Decidido] Las actividades son registros estructurados aparte de la bitácora.
- [Decidido] Economía en dólares. Los gastos en pesos se convierten a USD.
- [Propuesta] Nada de borrado físico. Estado (activo/cerrado/anulado) y correcciones por eventos de ajuste.
- [Propuesta] Toda escritura que toca varias tablas se hace en una función de Postgres (RPC de Supabase), no desde el navegador en varios pasos.
- [Decidido] Las tablas SNIG existentes quedan intactas como módulo extra: animales, movimientos_ganado, lotes_movimiento, dicose_propiedad, animal_lote_historial.

## 2. Relación con lo que ya existe

| Existente | Qué pasa |
|---|---|
| establecimientos, potreros, parcelas, parametros | Se reutilizan. establecimientos suma un flag modulo_trazabilidad (boolean) [Propuesta] |
| lotes_manejo (legado, cuelga de animales individuales) | Queda como legado del módulo de trazabilidad. El lote nuevo se llama lotes para no mezclar conceptos |
| animales, movimientos_ganado, lotes_movimiento, dicose_propiedad, animal_lote_historial | Intactas, módulo extra |
| pesajes, sanidad, finanzas, reproduccion (según la doc vieja, sin verificar) | No se usan. Se confirma contra el baseline si existen o si se descartan |

Ruta de integración futura [Propuesta]: una columna opcional animales.lote_id hacia lotes, para que una caravana sea un detalle dentro de un lote.

## 3. Usuarios y permisos

Auth: Supabase Auth (email). Todas las tablas nuevas llevan created_by uuid default auth.uid() y created_at.

### membresias

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| user_id | uuid | referencia a auth.users |
| establecimiento_id | bigint |  |
| rol | text | editor o lector |

Restricción única: (user_id, establecimiento_id)

### Funciones auxiliares [Propuesta]

- es_miembro(est_id): el usuario actual tiene membresía en ese establecimiento.
- es_editor(est_id): el usuario actual es editor en ese establecimiento.

### RLS (regla general para toda tabla con establecimiento_id)

- select: es_miembro(establecimiento_id).
- insert, update, delete: es_editor(establecimiento_id).
- Tablas hijas (detalle de actividades, líneas, vínculos) heredan el permiso a través de su padre.

## 4. Catálogos (por establecimiento)

### especies

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| establecimiento_id | bigint |  |
| nombre | text | Vacunos, Ovinos |
| activo | boolean |  |

### categorias_animales

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| establecimiento_id | bigint |  |
| especie_id | bigint |  |
| nombre | text |  |
| orden | int |  |
| activo | boolean |  |

Set inicial de Santa Remigia [Decidido]:

- Vacunos: terneros/as, vaquillonas, novillos, vacas de cría, vacas de invernada o descarte, toros.
- Ovinos: corderos/as, borregos/as, ovejas de cría, ovejas de descarte, carneros.

### rubros

Vacunos, ovinos, forestación tercerizada, general [Decidido]. Misma estructura que los catálogos anteriores (establecimiento_id, nombre, activo).

### parametros

Se sigue usando para listas simples sin relaciones (modalidades de venta, causas de mortandad, tipos de sanidad, etc.).

## 5. Lotes

### lotes

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| establecimiento_id | bigint |  |
| especie_id | bigint |  |
| nombre | text | Ej: "Terneros Nacidos 2026" |
| campana | text | Ej: "2026". Opcional [Propuesta] |
| estado | text | activo o cerrado |
| fecha_apertura | date |  |
| fecha_cierre | date | null mientras esté activo |
| potrero_id | bigint | opcional, dato simple sin historial (los cambios de potrero quedan fuera de esta etapa) [Decidido] |
| notas | text |  |

### lote_eventos (libro de stock, inmutable)

Cada fila es un movimiento de cabezas de una categoría en un lote.

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| lote_id | bigint |  |
| categoria_id | bigint |  |
| cabezas | int | con signo: positivo suma, negativo resta. Nunca cero |
| fecha | date |  |
| tipo | text | alta_inicial, paricion, compra, venta, mortandad, recategorizacion, division, union, ajuste |
| actividad_id | bigint | opcional, si lo generó una actividad |
| operacion_lote_id | bigint | opcional, si lo generó una operación de lotes |
| nota | text |  |

Stock = suma de cabezas por lote y categoría. [Decidido] Las filas no se editan ni se borran. Una corrección es un evento ajuste con nota. [Propuesta] Regla: el stock de una categoría en un lote no puede quedar negativo (lo valida la función que escribe los eventos). [Propuesta]

### operaciones_lote

Registro de dividir, juntar y recategorizar.

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| establecimiento_id | bigint |  |
| tipo | text | division, union, recategorizacion |
| fecha | date |  |
| notas | text |  |

### operacion_lote_vinculos

| Columna | Tipo | Nota |
|---|---|---|
| operacion_id | bigint |  |
| lote_id | bigint |  |
| rol | text | origen o destino |

Linaje de un lote: se reconstruye recorriendo operacion_lote_vinculos hacia atrás (consulta recursiva). [Decidido]

### Funciones atómicas (RPC) [Propuesta]

- dividir_lote(lote_origen, fecha, destinos jsonb): por cada destino crea el lote, resta del origen y suma en el destino, todo en una transacción. Si el origen queda en cero, se cierra.
- unir_lotes(lotes_origen[], lote_destino o datos del nuevo, fecha): suma al destino, cierra los lotes absorbidos.
- recategorizar_lote(lote, fecha, cambios jsonb): resta en una categoría y suma en otra dentro del mismo lote.

## 6. Actividades

Registro común más detalle tipado según el tipo. [Decidido]

### actividades

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| establecimiento_id | bigint |  |
| tipo | text | ver lista abajo |
| fecha | date |  |
| lote_id | bigint | el lote sobre el que se hizo (puede ser null en compras que crean lote) |
| responsable_id | uuid | usuario que la hizo o la responsable |
| notas | text |  |
| estado | text | registrada o anulada [Propuesta] |

Tipos [Decidido]: pesada, sanidad, antiparasitario, servicio, diagnostico_gestacion, paricion, destete, esquila, mortandad, compra, venta, personalizada. Fuera de esta etapa: cambios de potrero.

### actividad_lineas (cabezas por categoría) [Propuesta]

Para las actividades que involucran categorías: pesada, compra, venta, mortandad, parición, destete.

| Columna | Tipo | Nota |
|---|---|---|
| actividad_id | bigint |  |
| categoria_id | bigint |  |
| cabezas | int |  |
| peso_total_kg | numeric | opcional, para pesadas, ventas y destete |

El peso promedio se calcula (peso_total / cabezas). No se guarda.

### Detalle tipado por actividad [Propuesta]

| Tabla | Campos propios |
|---|---|
| act_sanidad (sanidad y antiparasitario) | producto, tipo (vacuna / tratamiento / antiparasitario), dosis, carencia_dias, cabezas tratadas |
| act_servicio | vacas_entoradas, toros_usados (opcional), fecha_fin (opcional) |
| act_diagnostico | servicio_id, vacas_diagnosticadas, vacas_prenadas |
| act_paricion | servicio_id, lote_cria_id (lote de terneros, creado o existente) |
| act_destete | servicio_id (opcional), lote_cria_id |
| act_esquila | kg_lana_total, cabezas esquiladas (sin precio) [Decidido] |
| act_mortandad | causa (parámetro), observaciones |
| act_compraventa | modalidad (productor, remate, frigorífico, otra), contraparte, kg totales (opcional) |
| act_personalizada | nombre del tipo, campos libres en jsonb |

### Efectos sobre el stock [Propuesta]

| Actividad | Genera eventos en lote_eventos |
|---|---|
| compra | alta de cabezas por categoría (crea el lote si hace falta) |
| venta | baja por categoría |
| mortandad | baja por categoría |
| parición | alta de terneros y terneras en el lote de cría (crea "Terneros Nacidos <año>" o suma al existente) |
| pesada, sanidad, antiparasitario, servicio, diagnóstico, destete, esquila | ninguno (no cambian cabezas) |

La función registrar_actividad(tipo, datos jsonb) escribe actividad, líneas, detalle, eventos y, para compra/venta, el movimiento económico, todo en una transacción. [Propuesta]

## 7. Indicadores reproductivos

Todos sobre vacas entoradas [Decidido]:

- % preñez = vacas preñadas / vacas entoradas
- % parición = terneros nacidos / vacas entoradas
- % destete = terneros destetados / vacas entoradas

Vista v_indicadores_reproductivos [Propuesta]: agrupa por act_servicio (campaña de servicio). Diagnóstico, parición y destete se vinculan al servicio con servicio_id.

Ejemplo: 100 entoradas, 85 preñadas, 78 terneros nacidos: preñez 85%, parición 78%.

Ganancia de peso del lote [Propuesta]: vista que toma las pesadas del lote en orden y calcula (peso promedio actual - anterior) / días entre pesadas.

## 8. Bitácora

### bitacora_entradas

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| establecimiento_id | bigint |  |
| fecha | date |  |
| tipo | text | decision, idea, observacion, compra_venta_gasto [Decidido] |
| texto | text | texto libre |
| estado_idea | text | abierta, decidida, descartada. Solo si tipo = idea [Decidido] |
| lote_id | bigint | etiqueta opcional |
| responsable_id | uuid | etiqueta opcional |

Las actividades no se cargan acá. Una entrada de bitácora puede mencionar una actividad en texto libre, pero el dato estructurado vive en actividades. [Decidido]

## 9. Tareas y avisos

### tareas

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| establecimiento_id | bigint |  |
| titulo | text |  |
| descripcion | text |  |
| fecha_vencimiento | date |  |
| responsable_id | uuid | opcional (ver pendientes) |
| lote_id | bigint | opcional |
| estado | text | pendiente, hecha, cancelada |
| recurrencia_dias | int | opcional, para repetir cada N días [Propuesta] |
| completada_at | timestamptz |  |

Avisos solo dentro de la app [Decidido]: al entrar se muestran contadores de vencidas y próximas, calculados con una consulta. No hace falta tabla de notificaciones en la etapa 1. [Propuesta]

## 10. Economía

### movimientos_economicos

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| establecimiento_id | bigint |  |
| fecha | date |  |
| sentido | text | ingreso o egreso |
| rubro_id | bigint | vacunos, ovinos, forestación tercerizada, general |
| concepto | text |  |
| contraparte | text | opcional |
| monto_original | numeric |  |
| moneda_original | text | USD o UYU |
| tipo_cambio | numeric | pesos por dólar, obligatorio si la moneda es UYU [Decidido: se carga a mano en cada operación] |
| monto_usd | numeric | monto_original si es USD, monto_original / tipo_cambio si es UYU |
| actividad_id | bigint | opcional (compra/venta lo completa solo) |
| lote_id | bigint | opcional |

- Moneda base: dólares. [Decidido]
- El resultado por rubro es la suma de ingresos menos egresos en monto_usd, agrupada por rubro y período (vista v_resultado_rubro). [Propuesta]
- Forestación tercerizada: se registra como ingreso por arrendamiento periódico con rubro forestación [Decidido]. Para no olvidar el cobro se puede usar una tarea recurrente. [Propuesta]
- La lana (solo kg, sin precio) vive en act_esquila. Si algún día se vende, entra como ingreso del rubro ovinos.

## 11. Panel de inicio [Propuesta]

- Stock por especie y categoría (suma de lote_eventos).
- Últimas actividades.
- Tareas vencidas y próximas.
- Resultado por rubro del período.
- Indicadores reproductivos de la última campaña.

## 12. Etapas de construcción [Propuesta]

1. Auth, membresias, RLS, helpers es_miembro y es_editor. Rehacer el menú y ocultar trazabilidad.
2. Catálogos, lotes, lote_eventos, operaciones de lote (dividir, juntar, recategorizar) y ficha de lote.
3. actividades con registrar_actividad: primero pesada, mortandad, compra y venta (alimentan stock), después sanidad y reproducción.
4. bitacora_entradas y tareas con contadores.
5. movimientos_economicos, vistas de resultado e indicadores, y panel de inicio.

## 13. Pendientes de definir

1. Tareas: ¿se asignan a un hermano en particular o son compartidas?
2. Bitácora: ¿una entrada puede etiquetar más de un lote?
3. Vínculo servicio-lote: cuando el lote de vacas entoradas se divide o se une después, ¿cómo se sigue calculando el indicador? (propuesta inicial: el servicio guarda las cabezas entoradas como dato propio, sin depender del lote)
4. Economía: ¿hace falta estado pagado/pendiente en los movimientos?
5. Corrección de errores: confirmar que los eventos de stock no se editan y que se corrigen con eventos de ajuste.
6. Modo offline y señal en el campo (etapa posterior).
7. Qué hacer con agricultura, maquinaria, insumos y personal en el menú (propuesta: esconder, no borrar).
8. Contraste con el esquema real: tablas pesajes, sanidad, finanzas y reproduccion que la doc vieja decía que existían.
