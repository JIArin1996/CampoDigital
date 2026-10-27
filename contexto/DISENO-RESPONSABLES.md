# Diseño: Responsables

Estado: **aprobado** (2026-10-27). Se implementa en pasos (sección 6), con una parada y aprobación en cada uno.

## 1. Qué se pide

1. Poder cargar responsables que no son usuarios: un peón, el veterinario, un contratista.
2. Que aparezcan también los administradores, no solo los operadores.
3. Poder asignar más de un responsable.

Lo decidido: **solo el administrador** crea responsables, y se pueden asignar varios en **notas, tareas y actividades**.

## 2. Cómo está hoy

- **Catálogo `personas`** (por establecimiento): nombre, rol (texto libre), `user_id` (opcional) y activo.
  - **Personas que no son usuarios:** la base ya las acepta, pero no hay pantalla para cargarlas.
  - **Usuarios:** la ficha se crea sola con `asignar_rol` (operador o consulta).
  - **Administradores:** no tienen ficha, porque no tienen membresía. Por eso no aparecen.
- **Un solo responsable:** se guarda en la columna `persona_id` de `bitacora_entradas` (notas y tareas) y de `actividades`.
- **Qué lo usa:**
  - **Funciones de carga:**
    - Bitácora: `crear_entrada_bitacora`, `editar_entrada_bitacora` y `cambiar_estado_tarea`, que al repetir una tarea copia el responsable.
    - Actividades: las 11 `registrar_*` (sanidad, pesada, compra, venta, destete, parición, servicio, diagnóstico, esquila, mortandad y personalizada).
  - **Vistas:** `v_actividades` y `v_calendario`.
  - **Contador de vencidas:** te tocan las tuyas y las sin responsable.
- **Permisos:** `personas` se lee con `es_miembro`, y solo el administrador inserta y actualiza.

## 3. Decisiones (para aprobar)

- **R1. Los responsables son las personas del catálogo `personas`**, sean usuarios o no. En la app se llaman "Responsables".
- **R2. Solo el administrador las carga**, en **Configuraciones > Personas**.
  - **Lista:** las activas primero. Las que son usuarios llevan una marca "Usuario".
  - **Alta y edición:** nombre (obligatorio, hasta 80 caracteres) y rol (opcional, texto libre, hasta 60, por ejemplo "Peón", "Veterinario").
  - **Desactivar y reactivar:** una persona inactiva no se ofrece en los formularios, pero sigue apareciendo en lo que ya tiene asignado. No se borra nada.
  - **Personas que son usuarios:** desactivarlas acá no les quita el acceso. Eso se hace en Usuarios.
  - **Nombre de los usuarios** (agregado en el paso 3, migración `20261028000200`): es siempre el de Usuarios y se actualiza solo cuando cambia ahí o en Mi perfil. En Personas no se edita: solo su rol y la baja.
  - **Dos grupos en Configuraciones > Personas:** Usuarios y Personas (las que no son usuarios). Al asignar responsables no se distinguen: van todos juntos, por nombre.
  - **Nombres repetidos:** no se permiten en el mismo establecimiento entre activos, sin importar mayúsculas.
- **R3. Los administradores tienen ficha en cada establecimiento**, igual que los operadores.
  - **Ahora:** la migración crea la ficha de los administradores actuales en todos los establecimientos.
  - **Después:**
    - `definir_admin` (al dar el rol) la crea o reactiva en todos los establecimientos.
    - Crear un establecimiento la crea para todos los administradores.
    - Al sacarle el rol de administrador, sus fichas quedan inactivas en los establecimientos donde no tiene membresía.
- **R4. Varios responsables** en notas, tareas y actividades, con dos tablas nuevas:
  - `bitacora_responsables (entrada_id, persona_id, establecimiento_id)`;
  - `actividad_responsables (actividad_id, persona_id, establecimiento_id)`.

  Sin repetidos (clave primaria por par). Las claves foráneas compuestas con `establecimiento_id` impiden mezclar establecimientos. Se escriben solo desde las funciones (RLS: lectura con `es_miembro`, sin escritura directa).
- **R5. La columna `persona_id` desaparece**, para no tener dos lugares con el mismo dato.
  - **Datos actuales:** en la misma migración se copian a las tablas nuevas.
  - **Funciones:** cambian el parámetro `p_persona_id uuid` por `p_responsables uuid[]` (lista vacía o null: sin responsables).
  - **Vistas:** `v_actividades` y `v_calendario` exponen `responsables uuid[]`.
- **R6. Validación en la base:**
  - hasta 10 responsables por registro;
  - todos del mismo establecimiento;
  - activos, salvo los que el registro ya tenía, que en una edición se pueden dejar;
  - los repetidos se ignoran.
- **R7. Tareas:**
  - **Vencidas:** te tocan las tareas sin responsables y las que te incluyen.
  - **Al repetir:** la tarea nueva copia todos los responsables.
  - **Filtro por responsable** (Bitácora y Calendario): muestra lo que incluye a esa persona.
- **R8. En pantalla:**
  - **Formularios:** el selector es una lista de chips para tocar (44 px, varios a la vez) con los activos, ordenados por nombre. Arriba van los que ya tiene el registro, aunque estén inactivos.
  - **Tarjetas, calendario y detalle de actividad:** "Responsables: Juan, Pedro". Si son más de 3: "Juan, Pedro y 2 más", y la lista completa en el detalle.

## 4. Fuera de alcance

- Que el operador cree personas en el momento (decidido: solo el administrador).
- Avisos o notificaciones a los responsables.
- "Quién cargó o editó" sigue siendo el usuario (`created_by`). No cambia.

## 5. Riesgos

- **Migración grande:** se redefinen unas 18 funciones y 2 vistas:
  - las 11 de actividades, las 2 de bitácora y `cambiar_estado_tarea`;
  - las validaciones `_validar_entrada_bitacora` y `_exigir_persona`;
  - `definir_admin` y `crear_establecimiento`. Es mecánico: se copia cada cuerpo actual y solo cambia lo del responsable. Las pruebas existentes de actividades, bitácora y tareas se actualizan y tienen que seguir pasando.
- **Orden de aplicación:** la migración va en una sola transacción. Hasta regenerar los tipos y desplegar el frontend nuevo, la app vieja falla al cargar con responsable. Conviene aplicar la migración y probar el frontend en la misma sesión.

## 6. Pasos

1. **Diseño:** este documento, aprobado.
2. **Base:**
   - Migración `20261028000100_responsables`, con las tablas, la copia de datos, las fichas de administradores, las funciones nuevas y las vistas.
   - Pruebas nuevas en `supabase/tests/responsables.sql` y actualización de las existentes.
   - Te paso el SQL, lo aplicás vos y regeneramos los tipos.
3. **Configuraciones > Personas:** alta, edición, desactivar y reactivar (solo administrador).
4. **Bitácora y tareas:** formulario con varios responsables, tarjeta, filtro, calendario y vencidas.
5. **Actividades:** formularios (nueva, destete, sin stock) y detalle.
6. **Cierre:** probar con los tres roles y en el celular, documentación y commit.
