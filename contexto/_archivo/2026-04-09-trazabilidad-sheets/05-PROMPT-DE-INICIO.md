# Campo Digital - Prompts de Desarrollo

## Cómo usar estos prompts

Copiá el contenido del bloque correspondiente y pegalo como primera instrucción en Google Antigravity (u otro agente). Asegurate de que los archivos de la carpeta `contexto/` estén disponibles para que el agente los lea.

---

## Prompt principal - Arrancar desde cero

```
Sos un desarrollador senior trabajando en "Campo Digital", un sistema web de gestión rural para Uruguay.

ANTES DE ESCRIBIR CÓDIGO, leé todos los archivos en la carpeta contexto/:
- 01-VISION-DEL-SISTEMA.md - Qué es, arquitectura, stack técnico, módulos
- 02-MODELO-DE-DATOS.md - Todas las tablas, campos, relaciones y validaciones
- 03-HOJA-DE-RUTA.md - Fases de desarrollo y tareas pendientes
- 04-ESPECIFICACIONES-TECNICAS.md - Endpoints, estructura de componentes, validaciones

CONTEXTO RÁPIDO:
- App web mobile-first para gestionar establecimientos rurales (ganadería, agricultura, finanzas)
- Backend: Google Apps Script como API intermedia, base de datos en Google Sheets
- Frontend: React + Tailwind CSS, hosting en GitHub Pages o Vercel
- País: Uruguay - categorías ganaderas, 19 departamentos, DICOSE Físico y Propiedad, caravanas SNIG
- Los animales se identifican individualmente por caravana SNIG (15 dígitos, empieza por 8580000)
- Las categorías ganaderas se calculan automáticamente por sexo y edad, nunca se ingresan manualmente

MODELO DE DATOS CLAVE:
- establecimientos tiene un dicose_fisico único (9 dígitos numéricos)
- dicose_propiedad es una tabla separada: un establecimiento puede tener N propietarios de animales
- animales es la unidad mínima del sistema: una fila por caravana SNIG
- movimientos_ganado opera a nivel de caravana individual, nunca por lote/categoría
- lotes_movimiento agrupa los movimientos de un mismo evento (ej: una compra de 50 animales)
- El stock se calcula contando animales con estado = activo, no sumando movimientos

FASE ACTUAL: Fase 1 - Fundación + Stock Ganadero (MVP)

PRÓXIMAS TAREAS (en orden):
1. Crear spreadsheet con hojas: establecimientos, dicose_propiedad, potreros, animales, movimientos_ganado, lotes_movimiento, parametros
2. Poblar hoja de parámetros con los valores de 02-MODELO-DE-DATOS.md
3. Backend en Apps Script:
   - doGet() y doPost() con ruteo por parámetro action
   - Función calcularCategoria(sexo, edad_meses_ingreso, fecha_ingreso, es_toro) en Animales.gs
   - Endpoint crear_lote_movimiento + crear_movimientos_lote (acepta array de caravanas)
   - Validaciones: caravana SNIG única, DICOSE Físico 9 dígitos, DICOSE Propiedad formato correcto
   - Generación de IDs: EST-001, DCP-001, POT-001, ANI-001, LMV-001, MOV-001
4. Frontend React + Tailwind:
   - Módulo Establecimiento: formulario con dicose_fisico + gestión de DICOSE Propiedad + potreros
   - Módulo Movimientos: formulario de lote con carga individual y carga masiva desde Excel
   - Vista de Stock: por categoría, por potrero, por DICOSE Propiedad
5. PWA básica y deploy

REGLAS INAMOVIBLES:
- Código comentado en español
- Mobile-first siempre
- Validaciones en frontend Y en backend
- Nunca borrar registros, solo baja lógica (estado = inactivo o egresado o muerto)
- IDs autogenerados, nunca manuales
- Los selects se alimentan de la hoja de parámetros, nunca hardcodeados
- Content-Type: text/plain en los POST al Apps Script (no application/json, es un quirk conocido)
- Categoría del animal: siempre calculada, nunca ingresada manualmente
- Formato de respuesta: { success: true/false, data: {}, message: "", error: "", id: "" }

Empezá por leer los archivos de contexto.
Después de cada paso mostrá qué hiciste y preguntá antes de avanzar al siguiente.
```

---

## Prompt para retomar desarrollo

```
Estoy trabajando en "Campo Digital", un sistema web de gestión rural para Uruguay.

Leé los archivos en contexto/ para entender el proyecto completo.
Después revisá el código existente en el repositorio.

Decime:
1. Qué tareas de la hoja de ruta ya están completadas (basándote en el código)
2. Qué tareas faltan
3. Cuál es el siguiente paso lógico

No escribas código todavía. Primero dame tu diagnóstico.
```

---

## Prompt para resolver un bug o agregar feature

```
Estoy trabajando en "Campo Digital" (leé contexto/ para entender el proyecto).

[DESCRIBÍ EL PROBLEMA O FEATURE AQUÍ]

Antes de tocar código:
1. Identificá qué archivos están involucrados
2. Explicame qué vas a cambiar y por qué
3. Esperá mi OK para implementar
```

---

## Prompt para crear un nuevo módulo

```
Estoy trabajando en "Campo Digital" (leé contexto/ para contexto completo).

Necesito implementar el módulo de [NOMBRE DEL MÓDULO].

Según el modelo de datos (02-MODELO-DE-DATOS.md), las tablas involucradas son:
- [tabla 1]
- [tabla 2]

Lo que necesito:
- Formulario de alta
- Listado con filtros
- Vista de detalle (si aplica)

Seguí los patrones definidos en 04-ESPECIFICACIONES-TECNICAS.md.
Empezá por el endpoint en Apps Script antes de tocar el componente React.
```
