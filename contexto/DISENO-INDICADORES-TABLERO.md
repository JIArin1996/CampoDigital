# Diseño — Indicadores como tablero interactivo y personalizable

Rama: `v2-Indicadores` (sale de `v2-gestion` en `bfd512c`). Diseño visual elegido: **versión A** (tablero clásico)
del artefacto "Indicadores: 3 versiones".

## 1. Qué es

El módulo Indicadores pasa de una pantalla fija (reproductivos por temporada) a un **tablero** al estilo Power BI:

- **Páginas con nombre** (pestañas: "Resumen", "Reproductivo", "Producción", "Económico"…), que se crean, renombran
  y ordenan.
- En cada página, **tarjetas** en una grilla de 12 columnas: se arrastran y se les cambia el tamaño.
- Cada tarjeta se arma con el **constructor libre**: qué medir (medida) → cómo abrirlo (dimensión y tiempo) → tipo de
  gráfico (número, barras, líneas, torta, tabla), con **filtro propio** opcional.
- **Filtros generales** arriba: período, especie, lote y "comparar con".
- **Filtrado cruzado**: tocar una barra o porción (ej. "Novillos") filtra las demás tarjetas por esa categoría.
- **Comparar períodos** (flecha ↑↓ contra el período anterior o el mismo del año pasado) y **exportar** (imagen/PDF
  y datos a Excel).
- **Detalle**: tocar un dato abre de dónde sale y de ahí se va al lote o a la actividad.

### Quién

- **Uno por establecimiento.** Lo ven todos los miembros (Administrador, Operador, Consulta).
- **Solo el Administrador lo modifica** (páginas, tarjetas, posición, tamaño). Operador y Consulta usan los filtros
  (generales y cruzados) pero no guardan nada: los filtros no se guardan en la base (sí en la URL, para compartir).

### Celular

- Las tarjetas van **en una columna**, en el orden de la grilla (de arriba a abajo y de izquierda a derecha).
- Los filtros se abren en un **panel desde abajo** (botón "Filtros · N").
- **Editar el tablero es solo en pantalla grande** (≥ 1024 px). En el celular, solo ver y filtrar.

## 2. Diseño visual (versión A)

- **Escritorio:** título "Indicadores" con Exportar y "Editar tablero" (solo Administrador); pestañas de páginas
  subrayadas; barra de filtros (Período, Especie, Lote, Comparar con) y a la derecha los filtros cruzados como chips
  verdes con ×; grilla de tarjetas blancas con borde.
- **Tarjeta con un filtro que no aplica:** borde punteado ámbar y etiqueta "Filtro de categoría no aplica" (nunca se
  ignora en silencio).
- **Celular:** pestañas como píldoras con scroll horizontal, una línea con el resumen de filtros activos, panel de
  filtros desde abajo con desplegables y los filtros cruzados con ×.
- **Modo edición:** la grilla muestra manijas (⠿) para arrastrar y una esquina para cambiar el tamaño; "Descartar"
  y "Guardar tablero". El constructor es un **panel lateral** a la derecha (título, 1 · Qué medir, 2 · Abrir por,
  3 · Gráfico, filtro propio, período, vista previa con datos reales, "Agregar al tablero").

## 3. Cálculo: en la base, no en el navegador

### Por qué no PostgREST directo

Los agregados de PostgREST (`select=especie_id,cabezas.sum()`) vienen **apagados** en Supabase
(`db_aggregates_enabled`). Aunque se prendan, no alcanzan: el stock es semi-aditivo (al cierre del período, no la
suma), la ganancia diaria sigue la línea del lote y los reproductivos cruzan actividades de distintos lotes.

### Enfoque: una función RPC por fuente

Cada fuente de datos ("hecho") es una función de la base que recibe los filtros y devuelve **filas ya agregadas**:

```
tablero_<fuente>(
  p_establecimiento_id uuid,
  p_medida     text,     -- de una lista fija por fuente
  p_abrir_por  text,     -- null (un número) o una dimensión de la lista fija de esa fuente
  p_tiempo     text,     -- 'total' | 'mes' | 'ejercicio' | 'temporada' (las que admita la medida)
  p_desde      date,
  p_hasta      date,
  p_filtros    jsonb,    -- {"especie_ids": [...], "categoria_ids": [...], "lote_ids": [...], ...}
  p_opciones   jsonb default '{}'   -- parámetros de la medida (ej. {"min_dias": 21} en pesadas)
) returns table (periodo text, clave text, etiqueta text, valor numeric, numerador numeric, denominador numeric,
                 avisos jsonb)
```

- `avisos`: lo que la tarjeta tiene que mostrar además del número (nunca se esconde nada en silencio), por ejemplo
  `{"tramos_descartados": {"venta": 1, "menos_de_21_dias": 1}}`, `{"usd_sin_especie": 8000}` o
  `{"potreros_sin_dibujar": 1}`. Va en cada fila (el mismo para todas las de una llamada).

- `language sql`/`plpgsql`, `stable`, **security invoker** (sin `security definer`): corre con los permisos de quien
  consulta, así que respeta el RLS. `set search_path = ''`. Solo `authenticated`.
- **Lista fija**: medida, dimensión y tiempo se validan contra una lista; cualquier otro valor da error `22023`.
  Sin SQL dinámico armado con texto del usuario (si hace falta, `format('%I')` sobre un valor ya validado).
- **Porcentajes y promedios** devuelven `numerador` y `denominador` además de `valor`, para que el total de una
  tarjeta y la comparación entre períodos se calculen bien (nunca promediar porcentajes).
- **Filtros que no aplican**: el catálogo (sección 5) dice qué dimensiones tiene cada fuente. La función ignora los
  filtros de dimensiones que no tiene, y la app marca la tarjeta. El catálogo vive en la app y la base lo hace
  cumplir: si la app pide abrir por una dimensión que la fuente no tiene, error.
- **Comparar**: la app llama a la misma función con el período desplazado (anterior o mismo del año pasado).

Fuentes: `tablero_stock` y `tablero_reproductivos` (etapa 1a); `tablero_pesadas` (producción y pesos);
`tablero_economia` y `tablero_potreros` (economía y potreros).

## 4. Medidas

Períodos: **ejercicio** de julio a junio (igual que Economía); **temporada** reproductiva de julio a junio según la
fecha del servicio (igual que hoy). **Mes** = mes calendario.

| Fuente | Medida | Fórmula | Unidad | Sale de | Tiempo |
|---|---|---|---|---|---|
| Stock | Stock al cierre | Σ `lote_eventos.cabezas` con fecha ≤ fin de cada período. **Semi-aditivo**: por mes es el stock al último día del mes, nunca la suma de los meses; el "total" de un período es el stock a su fin. | cabezas | `lote_eventos` (como `stock_al`) | total, mes, ejercicio |
| Stock | Altas / bajas por motivo | Σ de eventos del período por tipo: parición, compra, recategorización (+/−), división/unión (+/−), venta, mortandad, ajuste. | cabezas | `lote_eventos` | total, mes, ejercicio |
| Stock | Mortandad % | muertes del período / (stock al inicio + altas del período por parición y compra). | % | `lote_eventos` | total, ejercicio |
| Reproductivos | % preñez | vacas preñadas / vacas entoradas | % | `v_indicadores_aportes` | temporada |
| Reproductivos | % parición | terneros/as nacidos **vivos** / vacas entoradas | % | `v_indicadores_aportes` | temporada |
| Reproductivos | % parición total | terneros/as nacidos (vivos + muertos) / vacas entoradas, para distinguir los muertos | % | `v_indicadores_aportes` | temporada |
| Reproductivos | % destete | animales destetados / vacas entoradas | % | `v_indicadores_aportes` | temporada |
| Reproductivos | Entoradas, preñadas, nacidos vivos, nacidos muertos, destetados | conteos de la temporada | cabezas | `v_indicadores_aportes` | temporada |
| Pesadas | Peso promedio | Σ peso vivo total / Σ cabezas de la última pesada (en el período) de cada lote **abierto al cierre del período** | kg | `actividad_lineas` de pesadas | total, mes |
| Pesadas | Ganancia diaria | por tramo válido (ver abajo): (peso prom. final − peso prom. inicial) / días. Al juntar tramos: Σ kg producidos / Σ (cabezas × días), ponderado por cabeza-día | kg/día | pesadas + `linaje_lote` + `lote_eventos` | total, mes |
| Pesadas | Kg producidos | Σ, por tramo válido que termina en el período, (peso prom. final − peso prom. inicial) × cabezas de la pesada final | kg | pesadas + `linaje_lote` + `lote_eventos` | total, mes, ejercicio |
| Economía | Ingresos, gastos, resultado | Σ `monto_usd` por sentido; resultado = ingresos − gastos | USD | `movimientos_economicos` (como `v_resultado_detalle`) | total, mes, ejercicio |
| Economía | Pendiente de cobro / pago | Σ `monto_usd` de lo no pagado | USD | `v_movimientos_pendientes` | total |
| Potreros | Carga por potrero | UG de los lotes del potrero / ha del potrero | UG/ha | `lote_estadias`, `potreros`, UG por categoría | total, mes |
| Potreros | Carga global | UG **totales** del establecimiento (todos los animales, estén o no en un potrero) / superficie de pastoreo total (suma de los potreros activos) | UG/ha | `lote_eventos`, `potreros`, UG por categoría | total, mes |
| Potreros | Días de ocupación / descanso | días con y sin animales por potrero en el período | días | `lote_estadias` | total |

### Reglas de cada medida

- **Reproductivos**: siempre sobre las vacas entoradas del mismo servicio (temporada), como hoy.
  - **Arreglo necesario (migración en 1a):** hoy el destete encuentra la parición solo si sale *exactamente* del lote
    donde entraron las crías (`lote_cria_id`). Si ese lote se dividió o se unió antes del destete, el destete queda
    "sin servicio registrado". Se arregla buscando también en los **ancestros** del lote de origen (`linaje_lote`),
    igual que ya hacen el diagnóstico y la parición.
  - **Ovinos**: los mismos tres % que vacunos (ovejas encarneradas). **Señalada** (corderos señalados / ovejas
    encarneradas) queda **para más adelante**: necesita una actividad nueva "Señalada", que hoy no existe.
- **Ganancia diaria y kg producidos — tramos entre pesadas**: se compara el **peso promedio del lote**
  (Σ peso / Σ cabezas, todas sus categorías) entre una pesada y la anterior **de su línea**:
  - La anterior es la última pesada del mismo lote; si no tiene, la última de sus **ancestros** (`linaje_lote`).
  - **El tramo se descarta** si entre las dos pesadas cambió **quién está en las categorías pesadas**: una
    **división, unión, compra, venta, destete, parición o ajuste** de alguna de las categorías que se pesaron en el
    tramo, en el lote o en sus ancestros, **salvo que haya una pesada en la fecha de ese evento** (los días de las dos
    pesadas no cuentan). Motivo: cambia la composición y el promedio se mueve sin que nadie haya ganado o perdido kilos
    (vender los más pesados daría una ganancia negativa falsa; destetar los terneros subiría el promedio de un lote
    pesado con sus terneros). Si el evento es de una categoría que no se pesó (ej. la parición suma terneros y solo se
    pesan las vacas), el tramo vale.
  - Con filtro o apertura **por categoría**, también descarta la **recategorización** que entra o sale de esa
    categoría (ahí sí cambia quién está). Mirando el lote entero no la descarta: son los mismos animales.
  - **La mortandad no corta el tramo** (los kg producidos se calculan con las cabezas de la pesada final).
  - **Mínimo entre pesadas: 21 días** (parámetro `min_dias` de la tarjeta, por defecto 21): el ruido por llenado
    (3-5 % del peso vivo) supera la ganancia en tramos cortos. Un tramo más corto se descarta.
  - Los tramos se toman entre **pesadas consecutivas** de la línea: una pesada descartada como final de un tramo sigue
    siendo el inicio del siguiente.
  - La tarjeta muestra **cuántos tramos se descartaron y por qué** (aviso `tramos_descartados`, con los motivos
    `corto`, `division`, `union`, `compra`, `venta`, `destete`, `paricion`, `ajuste` y `recategorizacion`).
  - Detalles (etapa 2, `tablero_pesadas`): los orígenes son los de **nivel 1** del linaje (los lotes de los que salió
    directamente); con varios, el tramo empieza en la más vieja de sus últimas pesadas. Con filtro o apertura por
    **categoría** se comparan solo las líneas de esa categoría. El tramo cuenta en el período de su pesada final.
- **Economía**: siempre en **USD**. Un movimiento en pesos se convierte con el tipo de cambio cargado en ese
  movimiento (`monto_usd` es una columna calculada de la base). **Repartos entre titulares** (por % o por monto) se
  respetan al abrir por titular: a cada titular le toca `monto_usd × monto del titular / monto original`, igual que en
  Resultado.
  - **Con especie o lote**: los movimientos sin esa dimensión **no desaparecen en silencio**. Al **abrir** por especie
    o lote van a un grupo **"Sin asignar"**; al **filtrar** por especie o lote, la tarjeta muestra el monto que quedó
    afuera ("USD 8.000 sin especie asignada", aviso `usd_sin_especie` / `usd_sin_lote`).
- **Carga (UG)**:
  - **Por potrero**: UG de los lotes que están en el potrero / ha del potrero.
  - **Global**: UG de **todos** los animales del establecimiento / superficie de pastoreo total (la suma de los
    potreros activos; la superficie de cada uno sale de su dibujo). Si hay potreros activos **sin dibujar** (sin
    superficie), la tarjeta avisa cuántos (`potreros_sin_dibujar`), porque la carga queda sobreestimada.
  - Hoy las equivalencias UG por categoría están en la app (`components/potreros/ug.ts`). Para calcular la carga en la
    base hay que llevarlas a la base (tabla o columna en `categorias_animales`) en la etapa de potreros. En esa
    etapa también se alinea el resumen de la pantalla Potreros con esta definición de carga global.

## 5. Dimensiones por fuente (catálogo)

| Dimensión | Stock | Reproductivos | Pesadas | Economía | Potreros |
|---|---|---|---|---|---|
| Especie | ✓ | ✓ | ✓ | ✓ (si el movimiento la tiene) | ✓ |
| Categoría | ✓ | — | ✓ | — | ✓ |
| Lote | ✓ | ✓ | ✓ | ✓ (si el movimiento lo tiene) | ✓ |
| Potrero | — | — | — | — | ✓ |
| Rubro / concepto / grupo | — | — | — | ✓ | — |
| Titular | — | — | — | ✓ | — |
| Mes / ejercicio | ✓ | — (temporada) | ✓ | ✓ | ✓ |

"—" = el filtro de esa dimensión **no aplica**: la tarjeta lo muestra con la marca ámbar.

## 6. Filtros

- **Generales** (arriba): período, especie, categoría, lote y (etapa 4) comparar con. Aplican a todas las tarjetas
  de la página.
- **Cruzados**: tocar un elemento de un gráfico (una categoría, un lote, un mes) agrega un filtro por esa dimensión y
  valor; se ve como chip con × junto a los generales. Tocar otro elemento de la misma dimensión lo reemplaza; tocar el
  mismo lo saca. La tarjeta de origen **resalta** el elemento elegido (no se filtra a sí misma).
- **Propio de la tarjeta**: lo fija el Administrador en el constructor (ej. "Especie = Vacunos").
- **Prioridad**: **propio > cruzado > general**. Si un general o cruzado choca con el propio (ej. arriba eligen
  Ovinos y la tarjeta está fija en Vacunos), manda el propio y la tarjeta lo marca ("Especie fija: Vacunos").
- **No aplica**: si un filtro general o cruzado es de una dimensión que la fuente no tiene, la tarjeta muestra
  "Filtro de <dimensión> no aplica" y calcula sin él.

## 7. Datos guardados

Dos tablas nuevas (migración), por establecimiento:

- `tablero_paginas (id, establecimiento_id, nombre, orden, created_at, updated_at)`
- `tablero_tarjetas (id, establecimiento_id, pagina_id, titulo, definicion jsonb, x, y, w, h, created_at, updated_at)`
  - `definicion`: `{fuente, medidas: [...], abrir_por, tiempo, grafico, filtros: {...}, periodo: "tablero" | {"ejercicios": n}}`.
    `medidas` es una lista: con más de una (de la misma unidad) cada una es una serie del gráfico (ej. % preñez,
    parición y destete por temporada).
  - Se guarda entero con `guardar_tablero(establecimiento, páginas)` (security definer, solo administradores): las
    tablas no tienen permisos de escritura para nadie.
  - `x, y, w, h`: posición en la grilla de 12 columnas (react-grid-layout).
- RLS: leen los miembros; escribe **solo el administrador**, a través de `guardar_tablero` (ver arriba).
- **Plantilla por defecto**: si el establecimiento no tiene páginas guardadas, la app muestra la página **"Resumen"**
  definida en el código (stock y reproductivos). Al primer "Guardar tablero" del Administrador se guarda en la base.

## 8. Librerías

- **react-grid-layout**: grilla con arrastrar y cambiar tamaño (dnd-kit no resuelve el cambio de tamaño).
- **Recharts**: gráficos (barras, líneas, torta). Número y tabla, con componentes propios.

## 9. Etapas

- **1a — Base que ya sirve para usar**
  - Migración: `tablero_paginas`, `tablero_tarjetas` (RLS, permisos), `tablero_stock`, `tablero_reproductivos` y el
    arreglo del destete por linaje. Pruebas SQL con el set de la sección 10 (stock y reproductivos).
  - App: grilla (react-grid-layout) y celular en una columna; página "Resumen" precargada con tarjetas fijas de
    stock (stock al cierre, evolución por mes, stock por categoría) y reproductivos (% preñez, parición y destete por
    temporada); filtros generales (período, especie, lote); filtros que no aplican marcados. El Administrador puede
    mover, cambiar el tamaño, sacar tarjetas, y crear/renombrar/ordenar páginas.
- **1b — Constructor libre y filtrado cruzado**: panel lateral del constructor (medida, abrir por, tiempo, gráfico,
  filtro propio, vista previa) y filtrado cruzado entre tarjetas.
- **2 — Producción y pesos**: `tablero_pesadas` (peso promedio, ganancia diaria, kg producidos) y mortandad, con su
  detalle.
- **3 — Economía y potreros**: `tablero_economia` y `tablero_potreros` (UG en la base), con su detalle.
- **4 — Comparar períodos y exportar**.
- **Más adelante**: actividad "Señalada" y su indicador para ovinos.

El detalle (ir al lote o a la actividad) entra junto con cada fuente.

## 10. Datos de prueba con resultados conocidos

Un set chico, el mismo para las pruebas SQL de todas las funciones (cada etapa usa la parte que le toca). Las pruebas
tienen que devolver **exactamente** estos números. Especie Vacunos; categorías Vacas de cría, Terneros/as y Novillos.
Ejercicio 2025/26 = 1/7/2025 a 30/6/2026.

### Lotes, stock y eventos

| Fecha | Qué | Efecto |
|---|---|---|
| 30/6/2025 | Alta de L-Cría (100 vacas de cría), L-Nov1 (100 novillos) y L-Nov2 (50 novillos) | Stock al inicio del ejercicio: **250** |
| 1/10/2025 | Venta de 30 novillos de L-Nov1 | L-Nov1: 70 |
| 15/10/2025 | Compra de 20 novillos a L-Nov2 | L-Nov2: 70 |
| 1/2/2026 | Unión de L-Nov1 y L-Nov2 en un lote nuevo, L-Nov3 | L-Nov3: 140 (L-Nov1 y L-Nov2 cerrados) |
| 15/4/2026 | Mortandad de 2 novillos de L-Nov3 | L-Nov3: 138 |

Resultados esperados (ejercicio 2025/26):

- **Stock al cierre** (30/6/2026): **238** (100 vacas de cría + 138 novillos; terneros 0).
- **Stock de novillos al cierre de cada mes**: jul, ago, set **150**; oct a mar **140**; abr, may, jun **138**.
- **Altas y bajas**: compra **+20**, venta **−30**, mortandad **−2**, unión **+140 / −140** (neto 0).
- **Mortandad %**: 2 / (250 + 0 pariciones + 20 compras) = 2 / 270 = **0,74 %**.

### Reproductivos (temporada 2025/26)

| Fecha | Qué |
|---|---|
| 1/12/2025 | Servicio en L-Cría: 100 vacas entoradas |
| 1/3/2026 | Diagnóstico en L-Cría: 100 diagnosticadas, 90 preñadas |
| 15/9/2026 | Parición en L-Cría: 80 vivos y 3 muertos, crías al pie en L-Cría |
| 1/10/2026 | División de L-Cría: lote nuevo L-Cría-B con 50 vacas y 40 terneros |
| 1/11/2026 | Destete: 38 terneros de L-Cría y 37 de L-Cría-B, a un lote nuevo |

Resultados esperados: entoradas **100**; preñez **90 / 100 = 90,0 %**; parición **80 / 100 = 80,0 %**; nacidos
muertos **3**; parición total **83 / 100 = 83,0 %**; destete **75 / 100 = 75,0 %**. (Sin el arreglo del destete por
linaje daría 38 / 100 = 38,0 % y 37 destetados "sin servicio registrado": esa prueba confirma el arreglo.)

### Pesadas (tramos válidos y descartados)

| Lote | Fecha | Cabezas | Peso total | Promedio |
|---|---|---|---|---|
| L-Nov1 | 1/7/2025 | 100 | 30.000 kg | 300,0 |
| L-Nov1 | 31/8/2025 | 100 | 33.660 kg | 336,6 |
| L-Nov1 | 10/9/2025 | 100 | 33.800 kg | 338,0 |
| L-Nov1 | 1/11/2025 | 70 | 25.200 kg | 360,0 |
| L-Nov1 | 1/1/2026 | 70 | 27.762 kg | 396,6 |
| L-Nov2 | 1/9/2025 | 50 | 16.000 kg | 320,0 |
| L-Nov2 | 1/1/2026 | 70 | 24.500 kg | 350,0 |
| L-Nov3 | 1/3/2026 | 140 | 53.200 kg | 380,0 |
| L-Nov3 | 1/5/2026 | 138 | 56.649 kg | 410,5 |

| Tramo | Días | Resultado |
|---|---|---|
| L-Nov1 1/7 → 31/8/2025 | 61 | **Válido**: +36,6 kg/cab, 0,600 kg/día, **3.660 kg** (36,6 × 100) |
| L-Nov1 31/8 → 10/9/2025 | 10 | Descartado: menos de 21 días |
| L-Nov1 10/9 → 1/11/2025 | 52 | Descartado: venta el 1/10 sin pesada ese día |
| L-Nov1 1/11/2025 → 1/1/2026 | 61 | **Válido**: +36,6 kg/cab, 0,600 kg/día, **2.562 kg** (36,6 × 70) |
| L-Nov2 1/9/2025 → 1/1/2026 | 122 | Descartado: compra el 15/10 sin pesada ese día |
| L-Nov1 y L-Nov2 (1/1) → L-Nov3 1/3/2026 | 59 | Descartado: unión el 1/2 sin pesada ese día |
| L-Nov3 1/3 → 1/5/2026 | 61 | **Válido** (la mortandad del 15/4 no corta): +30,5 kg/cab, 0,500 kg/día, **4.209 kg** (30,5 × 138) |

Resultados esperados (ejercicio 2025/26, mínimo 21 días):

- **Kg producidos**: 3.660 + 2.562 + 4.209 = **10.431 kg**. Por mes (el del final del tramo): ago 2025 **3.660**,
  ene 2026 **2.562**, may 2026 **4.209**.
- **Ganancia diaria**: 10.431 / (100 × 61 + 70 × 61 + 138 × 61) = 10.431 / 18.788 = **0,555 kg/día**.
- **Tramos descartados**: **4** (menos de 21 días 1, venta 1, compra 1, unión 1).
- **Peso promedio** (lotes abiertos al 30/6/2026, su última pesada): L-Nov3, 56.649 / 138 = **410,5 kg**.

#### Ejercicio 2026/27: destete, parición y ajuste

| Lote | Fecha | Pesada | Promedio |
|---|---|---|---|
| L-Cría | 15/8/2026 | 100 vacas, 45.000 kg | 450,0 |
| L-Cría | 25/9/2026 | 100 vacas, 45.500 kg | 455,0 |
| L-Cría-B | 5/10/2026 | 50 vacas 22.500 kg + 40 terneros 4.000 kg | 294,4 |
| L-Cría-B | 5/11/2026 | 50 vacas 22.750 kg + 3 terneros 330 kg | 435,5 |
| L-Nov3 | 1/8/2026 | 138 novillos, 59.340 kg | 430,0 |
| L-Nov3 | 15/9/2026 | 137 novillos, 61.650 kg (ajuste de −1 el 15/8) | 450,0 |

| Tramo | Días | Resultado |
|---|---|---|
| L-Nov3 1/5 → 1/8/2026 | 92 | **Válido**: +19,5 kg/cab, **2.691 kg** (19,5 × 138) |
| L-Nov3 1/8 → 15/9/2026 | 45 | Descartado: ajuste el 15/8 |
| L-Cría 15/8 → 25/9/2026 | 41 | **Válido** (la parición del 15/9 suma terneros, que no se pesan): **500 kg** (5 × 100) |
| L-Cría (25/9) → L-Cría-B 5/10/2026 | 10 | Descartado: menos de 21 días |
| L-Cría-B 5/10 → 5/11/2026 | 31 | Descartado: destete el 1/11 (salen terneros pesados) |

Resultados esperados (ejercicio 2026/27): **kg producidos 3.191**; **ganancia diaria** 3.191 / (138 × 92 + 100 × 41)
= 3.191 / 16.796 = **0,19 kg/día**; **3 tramos descartados** (corto, destete, ajuste). **Por categoría**: Novillos
**2.691**; Vacas de cría **750** (500 de L-Cría + 250 de las vacas de L-Cría-B: mirando solo las vacas, el destete de
terneros no cambia quién está).

### Economía (con titulares A y B)

| Fecha | Movimiento | USD | Especie / lote | Titulares |
|---|---|---|---|---|
| 1/10/2025 | Venta de los 30 novillos (ingreso) | 27.000 | Vacunos / L-Nov1 | A 60 % (16.200), B 40 % (10.800) |
| 15/10/2025 | Compra de los 20 novillos (gasto), en pesos: UYU 720.000 a 40 | 18.000 | Vacunos / L-Nov2 | A |
| 1/11/2025 | Sanidad (gasto) | 2.000 | sin especie ni lote | A |
| 1/12/2025 | Personal (gasto) | 6.000 | sin especie ni lote | A 4.000, B 2.000 (por monto) |

Resultados esperados (ejercicio 2025/26):

- **Ingresos 27.000; gastos 26.000; resultado 1.000.**
- **Por titular**: A 16.200 − 18.000 − 2.000 − 4.000 = **−7.800**; B 10.800 − 2.000 = **8.800** (suman 1.000).
- **Abierto por especie**: Vacunos **9.000**; **Sin asignar −8.000**.
- **Filtrado por Vacunos**: **9.000**, con el aviso "USD 8.000 sin especie asignada".
- **Abierto por lote**: L-Nov1 **27.000**; L-Nov2 **−18.000**; Sin asignar **−8.000**.
- **Por mes**: oct 2025 **9.000**; nov **−2.000**; dic **−6.000**.

### Carga (al 30/6/2026)

- P1 dibujado, con L-Nov3: 138 × 0,8 = **110,4 UG**. P2 dibujado, con L-Cría: 100 × 1 = **100 UG**. P3 activo, sin
  dibujar y sin animales.
- **Carga por potrero**: P1 = 110,4 / superficie de P1; P2 = 100 / superficie de P2 (las superficies salen del
  dibujo de la prueba; la prueba compara contra la superficie guardada).
- **Carga global**: 210,4 / (superficie de P1 + P2), con el aviso **1 potrero sin dibujar**.
