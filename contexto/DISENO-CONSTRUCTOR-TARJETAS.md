# Campo Digital — Rediseño del constructor de tarjetas (usabilidad y visualización)

Estado: decidido el 11/11/2026 (versión A del lienzo "Rediseño del constructor de tarjetas"). Parte de
`DISENO-INDICADORES-TABLERO.md`. Antecedente: el documento "Constructor de tarjetas del tablero: cómo es hoy"
(problemas detectados).

**Qué NO cambia:** el catálogo de medidas, las combinaciones válidas (qué medida se separa por qué, en qué períodos,
con qué gráficos y filtros), las funciones de la base y cómo se guarda el tablero (`guardar_tablero`, la definición de
la tarjeta). Todo lo que se muestra sigue saliendo de la base con datos reales. Es solo la interfaz.

**Usuario:** productor o encargado, poco tiempo, poco vocabulario técnico. El constructor es solo para la computadora
(1024 px o más).

## 1. Diálogo con vista previa (versión A)

- "Nueva tarjeta" y el lápiz (o "Editar…" del menú de la tarjeta) abren un **diálogo de ~1100 px** en dos columnas:
  - Izquierda (~420 px, scroll propio): ¿Qué querés ver? · ¿Cómo lo querés ver? · aviso con Deshacer · Separar por
    y Período · tipo de gráfico · Más opciones (plegado).
  - Derecha: la **vista previa grande y fija** y, debajo, con qué se calcula ("Ejercicio 2025/26 · Solo Vacunos (de
    esta tarjeta) · filtros del tablero") y los avisos de la tarjeta.
- **Pie fijo:** Título, Cancelar y Agregar al tablero / Aplicar cambios.

## 2. Buscador de medidas

- Combobox con búsqueda (Command de shadcn, sobre `cmdk`), agrupado por fuente; arriba **"Usadas recientemente"**
  (las últimas 6 elegidas en esta computadora, guardadas en el navegador).
- Cada opción: nombre, **unidad en chip** y **una línea de descripción** en lenguaje simple.
- **Sinónimos** definidos en el catálogo de la app (`SINONIMOS`): "plata" → Resultado, Ingresos, Gastos…; "engorde" →
  Ganancia diaria; "animales" → Stock al cierre; "carga" → Carga promedio. La búsqueda no distingue mayúsculas ni
  tildes.
- **Glosario** (`GLOSARIO`): ⓘ junto a la medida que usa un término (UG, Ha SPG, presión acumulada…), con una
  explicación y un ejemplo concreto.
- Al final, "Crear un indicador calculado (A ÷ B, A × B…)".

## 3. "¿Cómo lo querés ver?"

Reemplaza los pasos "Abrir por / En el tiempo" y "Gráfico". Siete opciones con ícono; cada una fija **separar por +
período + gráfico** juntos (`components/tablero/vistas.ts`):

| Opción | Separar por | Período | Gráfico (y otros tipos posibles) | Necesita de la medida |
|---|---|---|---|---|
| Un número | sin separar | Todo junto | Número | que se pueda ver sin separar y todo junto |
| Evolución | el que tenía | Mes a mes (o el primero que no sea "Todo junto") | Líneas (Barras, Barras apiladas, Barras y línea) | algún período que no sea "Todo junto" |
| Comparar | el que tenía; si no, la primera opción de la medida | Todo junto | Barras (Barras apiladas) | que se separe por algo |
| Ranking | ídem | Todo junto | Ranking (barras de mayor a menor) | que se separe por algo |
| Composición | ídem | Todo junto | Torta | que se separe por algo |
| En el mapa | potrero | Todo junto | Mapa | que se separe por potrero |
| Tabla | el que tenía | el que tenía | Tabla | — |

- **Ninguna opción gris sin salida.** Si se puede habilitar ajustando lo demás, al tocarla lo ajusta y avisa (punto
  4). Si la medida no la admite, se ve deshabilitada con la razón en texto visible ("En el mapa: Stock al cierre no se
  puede ver por potrero"), nunca solo en `title`.
- Debajo quedan **Separar por** y **Período** para afinar, y el tipo exacto de gráfico como opción secundaria (chips).
- La opción elegida se deduce de la tarjeta (`vistaDe`): una tarjeta guardada se abre con su opción marcada sin
  cambiar nada.

## 4. Nada cambia en silencio

- Todo ajuste automático (al elegir opción, medida, separar por o período) muestra un **aviso breve con Deshacer**:
  qué cambió y por qué. Ej.: "Pasé el período a "Todo junto" y separé por potrero, porque el mapa muestra un valor por
  potrero." Deshacer vuelve exactamente al estado anterior.
- Las funciones de `vistas.ts` (`aplicarVista`, `cambiarMedida`, `cambiarSeparar`, `cambiarPeriodo`) devuelven la
  configuración nueva y el texto del aviso (o ninguno si no hubo ajuste). Siempre devuelven una combinación válida
  del catálogo.
- **Tarjeta nueva:** Stock al cierre, Un número, todo junto, sin separar (lo que habilita más opciones).
- **Título:** se sigue sugiriendo mientras sea igual a la última sugerencia; si el usuario lo cambió, aparece
  "↺ Volver al título automático".

## 5. Más opciones (plegado) y panel estable

- Sección plegada con subsecciones fijas, en este orden: **Mostrar solo** (especie, categoría, lote) · **Período de
  esta tarjeta** (el del tablero / últimos 3 o 5 ejercicios) · **Meta** · **Series y acumulado** · **Pesadas** (mínimo
  de días, con ayuda de una línea).
- Lo que no aplica a la medida queda visible pero deshabilitado, con la razón en texto; nada aparece ni desaparece
  moviendo el resto.
- El encabezado plegado resume lo que no está en su valor normal: "Más opciones · Meta 85 % · Solo Vacunos".

## 6. Vocabulario (en todo el módulo: tablero, ayudas, avisos)

| Antes | Ahora |
|---|---|
| Abrir por | Separar por |
| En el tiempo: Total del período / Por mes / Por ejercicio / Por temporada | Período: Todo junto / Mes a mes / Por ejercicio / Por temporada |
| Barras acostadas | Ranking |
| Filtro propio | Mostrar solo (y el período de la tarjeta, aparte) |
| Medida propia / Medidas propias | Indicador calculado / Indicadores calculados |
| Medidas de fábrica | Indicadores calculados de fábrica |

Los mensajes de error que vienen de la base (`guardar_medida`, `eliminar_medida`) siguen diciendo "medida propia":
la base no cambia en este rediseño.

## 7. Indicador calculado en su propio diálogo

- Se abre **encima** del constructor (no lo reemplaza).
- Fórmula en bloques: [Medida A] [÷ × + −] [Medida B o un número], con el mismo buscador del punto 2.
- **Resultado de ejemplo con datos reales:** "En 2025/26 da 37,55 USD/UG" (USD 8.000 ÷ 213,07 UG), más los avisos que
  ya existen (B del campo entero, conviene la versión promedio, sin tiempo en común, dividir por cero) y por qué se
  separa.
- Unidad (sugerida) y "Al comparar, es mejor que" suba / baje / da igual.
- Botón **Guardar indicador** y debajo "Queda disponible para todas las tarjetas del campo". Al guardar vuelve al
  constructor con el indicador elegido.
- **Borrar:** diálogo de confirmación propio (no `window.confirm`). Si lo usan tarjetas, dice cuáles y no deja.

## 8. Ajustes en el tablero

- **Tarjeta de número:** valor grande, comparación ▲▼, minilínea de los últimos 12 meses cuando la medida se ve mes a
  mes (el mes en curso punteado), y debajo el detalle con numerador y denominador ("468 de 520 vacas entoradas").
- **Avisos compactos:** ⚠ con el número de avisos, que abre un popover, en lugar del texto dentro de la tarjeta.
- **Período en curso parcial:** barra rayada o punto punteado.
- **Torta:** hasta 6 porciones, el resto en "Otros". **Ranking:** de mayor a menor.
- Números con formato uruguayo (1.234,5) y la unidad en ejes y tooltips.
- **Menú rápido** (⋯) en modo edición: ver como (cambia la opción del punto 3, con las mismas reglas), editar,
  duplicar, quitar.

## 9. Accesibilidad

- Todo usable con teclado: buscador (↑ ↓ Enter Esc), opciones visuales (botones), Más opciones (botón con
  `aria-expanded`), avisos (`role="status"`), diálogos con foco atrapado y Esc.
- Ninguna información solo en `title` o en hover.
- Contraste y foco visibles con los tokens de `06-SISTEMA-DE-DISENO.md`.

## 10. Partes y pruebas

- **R1:** este diseño; vocabulario nuevo; `vistas.ts` (opciones visuales, ajustes con aviso, validez, ida y vuelta de
  la definición); descripciones, sinónimos y glosario en el catálogo; Vitest (`npm test`).
- **R2:** el diálogo del constructor con buscador, opciones visuales, avisos con Deshacer y Más opciones.
- **R3:** el diálogo del indicador calculado y el de borrar.
- **R4:** las tarjetas del tablero (número, avisos, parcial, torta, ranking, menú rápido).

Pruebas (Vitest 4, `frontend/components/tablero/*.test.ts`; `npm test` en `frontend/`, desde PowerShell o cmd: en
Git Bash, Node ve la carpeta como `c:\…` en minúscula y Vitest falla con "Cannot read properties of undefined (reading
'config')"), recorriendo todo el catálogo:

1. Cada opción visual, sobre cada medida que la admite, da una combinación válida del catálogo; las que no la admiten
   dan la razón.
2. Cada ajuste automático (opción, medida, separar por, período) devuelve un aviso cuando cambia algo más que lo
   tocado, y Deshacer (el estado anterior) es válido y se restaura igual.
3. Una tarjeta existente (todas las de la plantilla y combinaciones válidas al azar) se abre y se guarda sin cambios:
   `definicion → estado → definicion` da lo mismo.
