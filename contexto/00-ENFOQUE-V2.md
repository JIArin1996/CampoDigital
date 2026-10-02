# Campo Digital — Enfoque v2

Este documento registra el cambio de enfoque del proyecto y las decisiones tomadas.

---

## 1. Cambio de enfoque

Campo Digital pasa de ser una app de trazabilidad a una herramienta de **gestión y coordinación para establecimientos ganaderos administrados a distancia**.

- Primer caso: **Santa Remigia**, cría y recría de terneros machos hasta 250-300 kg, más ovinos.
- La trazabilidad SNIG/DICOSE queda como **módulo extra opcional**, sin borrar nada de lo construido.

---

## 2. Prioridades

1. Números claros del campo.
2. Saber qué se hizo y cuándo.
3. Registrar lo que se habla y decide (bitácora).
4. Tareas y vencimientos con avisos dentro de la app.

---

## 3. Alcance

- **Multi-establecimiento y multi-especie ganadera**: además de Santa Remigia, otras ganaderías (invernada, ciclo completo, otras especies).
- **Fuera del modelo por ahora**: agricultura y forestación propia.
- **La generalidad va en los datos, no en el código**: categorías, especies, tipos de actividad y rubros son catálogos configurables por establecimiento.
- **No se construye un constructor de formularios.**

---

## 4. Usuarios y roles

Los roles son **por establecimiento**.

| Rol | Quiénes | Permisos |
|---|---|---|
| Editor | Los dos hermanos | Cargan y editan |
| Lector | Otros familiares y socios | Ven todo, incluidos los números económicos. Solo lectura |

---

## 5. Lote

El lote es una **ficha trazable**: un grupo de animales que se maneja junto.

- **Composición por categoría cargada a mano.** No hay cálculo automático de categoría por edad.
- **Todo lo asociado cuelga del lote**: actividades, pesadas, sanidad, bitácora, tareas y economía.
- **Operaciones**: los lotes se pueden **dividir, juntar y recategorizar**.
  - Cada operación queda registrada con fecha, lotes de origen y destino, y cabezas por categoría.
  - Cada operación es **atómica**.
  - El lote absorbido queda **cerrado, no se borra**.
  - El **linaje** de un lote se reconstruye recorriendo esas operaciones.
- **Parición**: crea un lote tipo "Terneros Nacidos <año>", o suma a uno que ya exista.
- **Stock**: se calcula **siempre desde eventos**. Nunca se guarda como número.

---

## 6. Categorías iniciales de Santa Remigia

Son **datos de catálogo, no código**.

| Especie | Categorías |
|---|---|
| Vacunos | Terneros/as, vaquillonas, novillos, vacas de cría, vacas de invernada o descarte, toros |
| Ovinos | Corderos/as, borregos/as, ovejas de cría, ovejas de descarte, carneros |

---

## 7. Actividades estructuradas

- Pesada
- Vacunación y sanidad
- Dosificación antiparasitaria
- Servicio / entore
- Diagnóstico de gestación
- Parición / señalada
- Destete
- Esquila
- Mortandad
- Compra / venta, con modalidad elegible (productor, remate, frigorífico), porque varía según el año
- Actividad personalizada con campos libres

**Fuera de esta etapa**: cambios de potrero.

---

## 8. Indicadores reproductivos

Todos se calculan **sobre vacas entoradas**.

| Indicador | Fórmula |
|---|---|
| % preñez | preñadas / entoradas |
| % parición | terneros nacidos / entoradas |
| % destete | terneros destetados / entoradas |

---

## 9. Bitácora

- Texto libre con etiquetas: **lote, tipo, responsable**.
- Tipos: **decisión, idea sin definir, observación, compra/venta/gasto**.
- Las ideas tienen estado: **abierta, decidida, descartada**.
- **Las actividades NO van en la bitácora**: son registros estructurados aparte.

---

## 10. Economía

Ingresos y egresos con dimensión de **rubro**: vacunos, ovinos, forestación tercerizada, general.

---

## 11. Etapa 1

- Web app **mobile-first**.
- Integraciones (WhatsApp, mail) quedan para más adelante.
- Avisos **solo dentro de la app**.

---

## 12. Base de datos

- Hoy solo hay datos de prueba: **no hay datos que conservar**.
- El núcleo nuevo se arma con **tablas nuevas y migraciones limpias**.
- Las tablas SNIG quedan **intactas como módulo extra**: `animales`, `movimientos_ganado`, `lotes_movimiento`, `dicose_propiedad`, `animal_lote_historial`.

---

## 13. Pendientes de definir

- Modo offline y señal en el campo.
- Fórmulas de lana.
- Moneda y tipo de cambio.
- Cómo se registra la forestación tercerizada.
- Qué hacer con agricultura, maquinaria, insumos y personal en el menú (propuesta: esconder, no borrar).
