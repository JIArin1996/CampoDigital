# Campo Digital - Modelo de datos v2 (borrador)

Estado: borrador de diseño. No hay baseline del esquema viejo: public se borra y el esquema nuevo se crea desde cero con las migraciones de supabase/migrations/. Base: contexto/00-ENFOQUE-V2.md. Todo lo marcado como [Decidido] sale de ese documento o de las definiciones tomadas con Iñaki. Todo lo marcado como [Propuesta] es una sugerencia de diseño que hay que validar.

## 1. Principios

- [Decidido] Multi-establecimiento y multi-especie ganadera. La generalidad va en los datos (catálogos por establecimiento), no en el código.
- [Decidido] El stock se calcula siempre desde eventos. Nunca se guarda como número.
- [Decidido] Las operaciones sobre lotes (dividir, juntar, recategorizar) son atómicas y quedan registradas. El lote absorbido se cierra, no se borra.
- [Decidido] Roles: Administrador (del sistema), Operador (carga y edita) y Consulta (solo lectura, ve todo, incluida la economía). Ver DISENO-USUARIOS.md.
- [Decidido] Las actividades son registros estructurados aparte de la bitácora.
- [Decidido] Economía en dólares. Los gastos en pesos se convierten a USD.
- [Propuesta] Nada de borrado físico. Estado (activo/cerrado/anulado) y correcciones por eventos de ajuste.
- [Propuesta] Toda escritura que toca varias tablas se hace en una función de Postgres (RPC de Supabase), no desde el navegador en varios pasos.
- [Decidido] La trazabilidad SNIG/DICOSE se elimina. El esquema public se borra entero con una migración y se recrea con migraciones nuevas, por etapas. No se respalda el esquema viejo (2026-10-15).

## 2. Relación con lo que ya existe

| Existente | Qué pasa |
|---|---|
| establecimientos, potreros, parametros | Se recrean en el esquema nuevo con la misma idea. establecimientos: tipo pasa a sistema_productivo (texto libre opcional, sin lógica) y dicose_fisico pasa a dicose (texto libre opcional, sin validación) [Decidido] |
| parcelas | Se eliminan. Solo potreros [Decidido] |
| lotes_manejo, animales, movimientos_ganado, lotes_movimiento, dicose_propiedad, animal_lote_historial | Se eliminan (trazabilidad) [Decidido] |
| pesajes, sanidad, finanzas, reproduccion (según la doc vieja, sin verificar) | Se eliminan junto con todo public, si existen. Los reemplazan actividades y movimientos_economicos [Decidido] |
| Tablas de agricultura, maquinaria, insumos y personal (según la doc vieja, sin verificar) | Se eliminan [Decidido] |

## 3. Usuarios y permisos

Auth: Supabase Auth (email). Todas las tablas nuevas llevan created_by uuid default auth.uid() y created_at.

Responsables [Decidido]: en bitácora, tareas y actividades el responsable es siempre persona_id (catálogo personas). created_by es solo auditoría de quién cargó el registro.

### membresias

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| user_id | uuid | referencia a auth.users |
| establecimiento_id | bigint |  |
| rol | text | operador o consulta (el administrador es del sistema: perfiles.es_admin) |

Restricción única: (user_id, establecimiento_id)

### personas

Catálogo de responsables por establecimiento, para nombrar a quien no usa la app (por ejemplo, el capataz). Sin datos sensibles. [Decidido]

| Columna | Tipo | Nota |
|---|---|---|
| id | bigint pk |  |
| establecimiento_id | bigint |  |
| nombre | text |  |
| rol | text | texto libre (capataz, peón, veterinario, hermano, etc.) |
| user_id | uuid | opcional, vínculo a auth.users si la persona usa la app |
| activo | boolean |  |

### Funciones auxiliares [Propuesta]

- es_miembro(est_id): el usuario actual tiene membresía en ese establecimiento.
- es_admin(), puede_operar(est_id): reemplazan a es_editor desde la Etapa 3c (ver DISENO-USUARIOS.md).

### RLS (regla general para toda tabla con establecimiento_id)

- select: es_miembro(establecimiento_id).
- insert, update: puede_operar(establecimiento_id) para el día a día; es_admin() para configuración. Sin delete.
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
| persona_id | bigint | responsable (catálogo personas) [Decidido]. Quién cargó el registro queda en created_by |
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
| act_servicio | vacas_entoradas (base del % de parición; el lote va en actividades.lote_id) [Decidido], toros_usados (opcional), fecha_fin (opcional) |
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
| persona_id | bigint | responsable, etiqueta opcional (catálogo personas) |

### bitacora_lotes

Una entrada puede etiquetar varios lotes [Decidido]. Tabla puente [Propuesta].

| Columna | Tipo | Nota |
|---|---|---|
| entrada_id | bigint |  |
| lote_id | bigint |  |

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
| persona_id | bigint | responsable opcional (catálogo personas). Sin responsable, la tarea es de todos los operadores [Decidido] |
| lote_id | bigint | opcional |
| estado | text | pendiente, hecha, cancelada |
| recurrencia_dias | int | opcional, para repetir cada N días [Propuesta] |
| completada_at | timestamptz |  |

Avisos solo dentro de la app [Decidido]: al entrar se muestran contadores de vencidas y próximas, calculados con una consulta. No hace falta tabla de notificaciones en la etapa 1. [Propuesta]

Calendario, primera versión [Decidido]: lista de tareas próximas y vencidas con filtros, a partir de fecha_vencimiento y estado. La vista mensual se suma después sin tocar tablas.

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
| estado | text | pagado o pendiente. Sin "parcial" [Decidido] |
| fecha_pago | date | opcional [Decidido] |

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

## 12. Etapas de construcción [Decidido]

El esquema se migra por etapas: cada una agrega solo las tablas que usa.

1. Etapa 2: limpieza. Borrar el código de trazabilidad, agricultura, maquinaria, insumos, personal y parcelas, y la migración que borra public.
2. Etapa 3: base del esquema. Auth, membresias, RLS, helpers es_miembro y es_editor (es_admin y puede_operar desde la 3c), catálogos (especies, categorias_animales, rubros, personas), lotes y lote_eventos.
3. Etapa 4: navegación y estructura de la app.
4. Etapa 5: ficha de lote, operaciones de lote (dividir, juntar, recategorizar), bitacora_entradas y bitacora_lotes, stock por categoría y un panel de inicio básico.
5. Etapa 6a: actividades con registrar_actividad para las que alimentan stock (pesada, mortandad, compra, venta, parición), con el movimiento económico de compra y venta.
6. Etapa 6b: resto de las actividades (sanidad, antiparasitario, servicio, diagnóstico, destete, esquila, personalizada).
7. Etapa 7: indicadores reproductivos, carga de movimientos_economicos, resultado por rubro y panel de inicio completo.
8. Etapa 8: tareas, vencimientos, avisos y calendario en lista.
9. Etapa 9: gestión de usuarios (invitar y asignar rol).

## 13. Pendientes de definir

1. Corrección de errores: confirmar que los eventos de stock no se editan y que se corrigen con eventos de ajuste.
2. Modo offline y señal en el campo (etapa posterior).
