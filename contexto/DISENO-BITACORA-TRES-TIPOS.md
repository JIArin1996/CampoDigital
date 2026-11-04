# Bitácora con tres tipos: tarea, decisión e idea

Estado: **aprobado** (2026-11-04). Migración `20261104000600_bitacora_tres_tipos`, pruebas `tests/bitacora_tres_tipos.sql`.

## 1. Pedido

La bitácora queda con tres tipos: **Tarea**, **Decisión** e **Idea**. Los otros se eliminan. Las tres se editan y se eliminan.
Cada una tiene sus estados:

| Tipo | Estados | Cerrada (sale del recuadro del lote y pasa al historial) |
|---|---|---|
| Tarea | Pendiente, Realizada | Realizada |
| Decisión | Pendiente, Realizada | Realizada |
| Idea | Abierta, Decidida, Descartada | Decidida o Descartada |

## 2. Decisiones (respuestas del 2026-11-04)

1. **Observaciones y compras/ventas/gastos que ya existían: se eliminan.** Quedan ocultas, igual que una eliminada a mano.
2. **Tareas canceladas que ya existían: se eliminan.** Las hechas pasan a Realizada y conservan cuándo y quién. Sin Cancelar, una
   tarea que se repite se corta al editarla, sacándole la repetición, o al eliminarla.
3. **Decisiones que ya existían: quedan Pendientes.** Las nuevas también arrancan pendientes.
4. **Eliminar, como en las actividades:** lo hace solo el Administrador. La entrada desaparece de la app pero queda un rastro
   oculto en la base: `anulada_en` y `anulada_por`, que ahora significan "eliminada". Reemplaza a Anular y Restaurar, y las
   anuladas que había pasan a eliminadas.

## 3. Cómo queda

- **Editar**: Administrador y Operador, como hasta ahora. Se puede cambiar de tipo entre los tres. Si el tipo no cambia, se
  conserva el estado; si cambia, arranca con el estado inicial del tipo nuevo (tarea y decisión pendientes, idea abierta).
- **Cambiar el estado**: Administrador y Operador. La función nueva es `cambiar_estado_decision`. `cambiar_estado_tarea`
  acepta pendiente o realizada; la tarea que se repite sigue anotando la siguiente al marcarse realizada.
- **Reabrir una tarea repetida** que ya generó la siguiente: primero hay que eliminar la siguiente, así que lo hace el
  Administrador.
- **Eliminar** (`eliminar_entrada_bitacora`): no pide motivo. Los lotes y responsables de la entrada no se tocan. Una tarea que
  salió de una decisión o idea eliminada sigue existiendo; solo se deja de ver el vínculo.
- **RLS**: la política de lectura deja afuera a las eliminadas, para todos los roles.
- **Calendario**: la próxima dosis dada figura como `realizada`, igual que las tareas.
- En la base, los tipos y el estado "cancelada" que ya no existen solo se aceptan en entradas eliminadas.

## 4. Pruebas viejas puestas al día

`etapa5_rls`, `etapa8_tareas`, `responsables`, `eliminar_actividades`, `editar_resto_de_actividades` y `auditoria_permisos`
(siguen siendo 146 funciones: entran dos y salen dos). Las cantidades esperadas no cambian.
