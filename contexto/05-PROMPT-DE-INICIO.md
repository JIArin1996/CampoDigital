# Campo Digital - Prompt de Inicio para Desarrollo

## Cómo usar este prompt

Copiá el contenido del bloque de abajo y pegalo como primera instrucción en Google Antigravity (o el agente de IA que uses). Asegurate de que los archivos de la carpeta `Contexto/` estén en el repositorio para que el agente pueda leerlos.

---

## Prompt

```
Sos un desarrollador senior trabajando en "Campo Digital", un sistema web de gestión rural.

ANTES DE ESCRIBIR CÓDIGO, leé todos los archivos en la carpeta Contexto/:
- 01-VISION-DEL-SISTEMA.md - Qué es el sistema y cómo funciona
- 02-MODELO-DE-DATOS.md - Estructura de todas las tablas, campos y validaciones
- 03-HOJA-DE-RUTA.md - Fases de desarrollo y tareas pendientes
- 04-ESPECIFICACIONES-TECNICAS.md - Arquitectura, endpoints, estructura de componentes

CONTEXTO RÁPIDO:
- Es una app web mobile-first para gestionar establecimientos rurales (ganadería, agricultura, finanzas)
- Los datos se almacenan en Google Sheets vía Google Apps Script como API intermedia
- El frontend es React (o HTML/JS vanilla), hosteado gratis en GitHub Pages o Vercel
- Pensado para Uruguay: categorías ganaderas, departamentos, DICOSE

FASE ACTUAL: Fase 1 - Fundación + Stock Ganadero (MVP)

TAREAS DE ESTA FASE:
1. Crear la estructura del spreadsheet en Google Sheets (hojas: establecimientos, potreros, movimientos_ganado, parametros)
2. Poblar la hoja de parámetros con los valores definidos en 02-MODELO-DE-DATOS.md
3. Crear el backend en Google Apps Script:
   - doGet() para lectura de datos (parámetros, establecimiento, potreros, movimientos, stock)
   - doPost() para escritura (crear establecimiento, potrero, movimiento)
   - Generación automática de IDs (EST-001, POT-001, MOV-001)
   - Validaciones del lado del servidor
   - Respuestas JSON estandarizadas
4. Crear el frontend mobile-first:
   - Formulario de alta de establecimiento
   - Formulario de alta de potreros
   - Formulario de registro de movimientos ganaderos
   - Vista de stock actual por categoría
   - Lista de últimos movimientos
   - Conexión con Apps Script via fetch
5. Configurar como PWA básica
6. Deploy

REGLAS:
- Código limpio, comentado en español
- Mobile-first siempre
- Validaciones tanto en frontend como en backend
- No borrar datos nunca, solo baja lógica (estado = inactivo)
- IDs autogenerados, nunca manuales
- Los selects se alimentan dinámicamente de la hoja de parámetros
- Formato de respuesta: { success: true/false, data: {}, message: "", error: "" }

Empezá por crear la estructura del proyecto y el backend en Apps Script.
Después de cada paso, mostrame qué hiciste y preguntame antes de avanzar al siguiente.
```

---

## Variante: Prompt para retomar desarrollo

Si ya tenés parte del código y querés continuar:

```
Estoy trabajando en "Campo Digital", un sistema web de gestión rural.

Leé los archivos en Contexto/ para entender el proyecto completo.
Después revisá el código existente en el repositorio.

Decime:
1. Qué tareas de la hoja de ruta ya están completadas (basándote en el código que ves)
2. Qué tareas faltan
3. Cuál es el siguiente paso lógico

No escribas código todavía. Primero dame tu diagnóstico.
```

---

## Variante: Prompt para resolver un bug o agregar feature

```
Estoy trabajando en "Campo Digital" (leé Contexto/ para contexto completo).

[DESCRIBÍ EL PROBLEMA O FEATURE]

Antes de tocar código:
1. Identificá qué archivos están involucrados
2. Explicame qué vas a cambiar y por qué
3. Esperá mi OK para implementar
```
