# Campo Digital — Enfoque v2

Este documento registra el cambio de enfoque del proyecto y las decisiones tomadas.

---

## 1. Cambio de enfoque

Campo Digital pasa de ser una app de trazabilidad a una herramienta de **gestión y coordinación para establecimientos ganaderos administrados a distancia**.

- Primer caso: **Santa Remigia**, cría y recría de terneros machos hasta 250-300 kg, más ovinos.
- La trazabilidad SNIG/DICOSE **se elimina**: no queda como módulo extra ni escondida, y no se diseña pensando en ella. El código queda en el tag git `pre-v2-trazabilidad`; si en el futuro se quiere, se recupera desde ahí (ver sección 15).

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
- **Se eliminan**: agricultura, maquinaria, inventario de insumos y personal (empleados con datos laborales).
- **Establecimiento**: "sistema productivo" como texto libre opcional, sin lógica, y número DICOSE como texto libre opcional, sin validación.
- **Espacio**: solo potreros. Las parcelas se eliminan.
- **La generalidad va en los datos, no en el código**: categorías, especies, tipos de actividad y rubros son catálogos configurables por establecimiento.
- **No se construye un constructor de formularios.**

---

## 4. Usuarios y roles

Tres roles (detalle en `DISENO-USUARIOS.md`):

| Rol | Alcance | Permisos |
|---|---|---|
| Administrador | Todo el sistema | Todo, en todos los establecimientos. Exclusivo: crear y editar establecimientos, catálogos y usuarios. Al arrancar es uno solo (el dueño del proyecto) |
| Operador | Por establecimiento | Carga y edita el día a día (potreros, lotes, actividades, bitácora, economía, tareas) |
| Consulta | Por establecimiento | Ve todo, incluidos los números económicos. Solo lectura |

**Usuarios**: la gestión es toda desde la app (alta con contraseña provisoria, datos, celular como contacto, foto, cambio y reseteo de contraseña, desactivar en vez de borrar). Sin dominio propio no hay mail: una contraseña olvidada la resetea el administrador.

**Personas**: catálogo simple por establecimiento (nombre y rol, sin datos sensibles), con vínculo opcional a un usuario. Sirve para nombrar responsables que no usan la app, como el capataz.

**Responsables**: en bitácora, tareas y actividades el responsable es siempre una **persona** del catálogo. Quién cargó cada registro queda aparte, como auditoría.

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
- Servicio / entore: registra el **lote y la cantidad de vacas entoradas**, que es la base del % de parición
- Diagnóstico de gestación
- Parición / señalada
- Destete
- Esquila: solo **kg totales de lana por esquila**, sin precio
- Mortandad
- Compra / venta, con modalidad elegible (productor, remate, frigorífico), porque varía según el año
- Actividad personalizada con campos libres

**Cambios de potrero**: se registran con fecha de salida y de ingreso (estadías), con historial en el lote y en el potrero (ver `DISENO-POTREROS.md`, 2026-10-23). No son una actividad.

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
- Una entrada puede etiquetar **varios lotes**.
- Tipos: **decisión, idea sin definir, observación, compra/venta/gasto**.
- Las ideas tienen estado: **abierta, decidida, descartada**.
- **Las actividades NO van en la bitácora**: son registros estructurados aparte.

---

## 10. Economía

Ingresos y egresos con dimensión de **rubro**: vacunos, ovinos, forestación tercerizada, general.

- **Moneda**: todo en **dólares**. Los gastos en pesos se convierten con un **tipo de cambio cargado a mano en cada operación**.
- **Forestación tercerizada**: ingreso por **arrendamiento periódico**, con rubro propio.
- **Estado**: simple, **pagado o pendiente**, con fecha de pago opcional. No hay estado "parcial".

---

## 11. Tareas y calendario

- **Responsable opcional**: una persona del catálogo. Sin responsable, la tarea es de **todos los operadores** (antes: "ambos editores").
- **Calendario, primera versión**: lista de tareas **próximas y vencidas, con filtros**. El modelo guarda fecha y estado, para sumar después la vista mensual sin tocar tablas.

---

## 12. Etapa 1

- Web app **mobile-first**.
- Integraciones (WhatsApp, mail) quedan para más adelante.
- Avisos **solo dentro de la app**.

---

## 13. Base de datos

- Hoy solo hay datos de prueba: **no hay datos que conservar**.
- El esquema `public` **se borra entero** con una migración y se recrea con **migraciones nuevas**, versionadas en `supabase/migrations/`. No se respalda el esquema viejo.
- El esquema nuevo se arma **por etapas**: cada etapa migra solo las tablas que usa.
- **Auth y RLS** (roles editor y lector) entran desde la primera migración del esquema nuevo, no al final.

---

## 14. Pendientes de definir

- Modo offline y señal en el campo (etapa posterior).

---

## 15. Registro de cambios de decisión

| Fecha | Antes | Ahora |
|---|---|---|
| 2026-10-15 | Trazabilidad SNIG/DICOSE como módulo extra opcional, con sus tablas intactas (`animales`, `movimientos_ganado`, `lotes_movimiento`, `dicose_propiedad`, `animal_lote_historial`) | **Se elimina** el código y las tablas. Respaldo del código: tags `pre-v2-trazabilidad` (rama de trabajo) y `pre-v2-main-abril` (`origin/main` con los cambios del 26 de abril) |
| 2026-10-15 | Agricultura, maquinaria, insumos y personal en el menú: pendiente, con la propuesta de esconder sin borrar | **Se eliminan** |
| 2026-10-15 | Potreros y parcelas | **Solo potreros** |
| 2026-10-15 | Roles y RLS al final del desarrollo | **Desde la primera migración del esquema nuevo** |
| 2026-10-15 | Responsable de actividades: pendiente (usuario o persona). Responsable de bitácora y tareas: usuario | **persona_id en bitácora, tareas y actividades**. `created_by` queda solo como auditoría de quién cargó |
| 2026-10-16 | Dos roles por establecimiento: editor y lector | **Tres roles**: Administrador (del sistema), Operador y Consulta (por establecimiento) |
| 2026-10-16 | Gestión de usuarios en la Etapa 9 | **Etapa 3c**, desde la app: perfiles, contraseña provisoria, reseteo por el administrador, desactivar en vez de borrar |
| 2026-10-23 | Cambios de potrero fuera de esta etapa; potrero del lote como dato simple, sin historial; Potreros dentro de Configuraciones para el administrador | **Estadías de lotes en potreros** con historial, mapa con dibujo e importación de formas, y Potreros en el menú para todos los roles (`DISENO-POTREROS.md`) |
