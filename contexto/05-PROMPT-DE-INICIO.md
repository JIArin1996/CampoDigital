# Campo Digital - Prompts de Desarrollo

## Cómo usar estos prompts

Copiá el contenido del bloque correspondiente y pegalo como primera instrucción en Google Antigravity (u otro agente). Asegurate de que los archivos de la carpeta `contexto/` estén disponibles para que el agente los lea.

---

## Prompt principal - Arrancar desde cero

```
Sos un desarrollador senior trabajando en "Campo Digital", un sistema web de gestión rural.

ANTES DE ESCRIBIR CÓDIGO, leé todos los archivos en la carpeta contexto/:
- 01-VISION-DEL-SISTEMA.md - Qué es, arquitectura, stack técnico, módulos
- 02-MODELO-DE-DATOS.md - Las 17 tablas, campos, relaciones y validaciones
- 03-HOJA-DE-RUTA.md - Fases de desarrollo y estado actual
- 04-ESPECIFICACIONES-TECNICAS.md - Estructura del proyecto, queries, patrones

CONTEXTO RÁPIDO:
- App web mobile-first para gestionar establecimientos rurales (ganadería, agricultura, finanzas)
- Base de datos: Supabase (PostgreSQL) - ya creada con 17 tablas
- Frontend: Next.js 14 + Tailwind CSS + shadcn/ui
- Hosting: Vercel
- País: Uruguay (categorías ganaderas, departamentos, DICOSE, moneda USD/UYU)
- Un solo usuario por ahora, con user_id en tablas para futuro multi-usuario

JERARQUÍA ESPACIAL:
Establecimiento → Potrero → Parcela (opcional)
- Los animales se ubican en potrero O parcela (nunca los dos)
- Los lotes agrícolas también pueden estar en potrero o parcela

FASE ACTUAL: Fase 1 - Setup + Establecimiento + Stock Ganadero

PRÓXIMAS TAREAS:
1. Inicializar proyecto Next.js con Tailwind y shadcn/ui
2. Configurar cliente Supabase
3. Módulo Establecimiento (formulario, listado, potreros, parcelas)
4. Módulo Animales (alta individual con SNIG, listado, ficha)
5. Módulo Stock Ganadero (movimientos, stock actual por categoría)

REGLAS:
- Código en TypeScript siempre
- Comentarios en español
- Mobile-first siempre
- Nunca borrar registros, solo baja lógica
- Todos los selects desde la tabla parametros de Supabase
- Validaciones tanto en frontend como en base de datos
- shadcn/ui para todos los componentes de UI
- Seguir la estructura de carpetas definida en 04-ESPECIFICACIONES-TECNICAS.md

Empezá por leer los archivos de contexto y después inicializá el proyecto.
Después de cada paso mostrme qué hiciste y preguntame antes de avanzar.
```

---

## Prompt para retomar desarrollo

```
Estoy trabajando en "Campo Digital", un sistema web de gestión rural.

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

Seguí los patrones de código definidos en 04-ESPECIFICACIONES-TECNICAS.md.
Usá shadcn/ui para todos los componentes.
Empezá por el query a Supabase antes de tocar el componente.
```

---

## Prompt para consultas sobre el modelo de datos

```
Estoy trabajando en "Campo Digital".

Tengo una duda sobre el modelo de datos. Leé 02-MODELO-DE-DATOS.md y respondeme:

[PREGUNTA AQUÍ]

Si la respuesta implica un cambio en la base de datos, indicame el SQL necesario
y el impacto en el código existente antes de hacer cualquier cambio.
```
