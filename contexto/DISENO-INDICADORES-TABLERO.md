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
- **Comparar períodos** (flecha ▲▼ contra las mismas fechas del año anterior) y **exportar** (PDF de la página y
  datos a Excel .xlsx).
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
- **Comparar**: la app llama a la misma función con las **mismas fechas un año antes** (29/2 pasa a 28/2). Para
  los períodos del selector (ejercicio, año, últimos 12 meses) eso es también el período anterior, así que hay una
  sola opción: "Comparar con: Ejercicio 2024/25 (mismas fechas)". La tarjeta de número muestra ▲▼ con la diferencia
  (en puntos si es %, si no en %) en verde si mejora y rojo si empeora; en las medidas donde bajar es bueno
  (mortandad, nacidos muertos, gastos, pendiente de pago) el color se invierte. Los días de ocupación y de descanso
  van **sin color** (subir o bajar no es bueno ni malo en sí). Los gráficos
  agregan una serie "(año anterior)" punteada o más clara, alineada por grupo o por posición en el tiempo; no se
  compara en la torta ni en los gráficos abiertos por una dimensión en el tiempo. La tabla agrega las columnas.
- **Exportar**: "PDF" usa la impresión del navegador (hoja A4 apaisada, sin menú ni controles, con los filtros en
  palabras arriba). "Excel" arma un .xlsx en el navegador (SheetJS, cargado solo al exportar): una hoja "Filtros" y
  una hoja por tarjeta con período, grupo, medida, valor, unidad, numerador y denominador (y las filas comparadas).

Fuentes: `tablero_stock` y `tablero_reproductivos` (etapa 1a); `tablero_pesadas` (producción y pesos);
`tablero_economia` y `tablero_potreros` (economía y potreros). Con el catálogo del productor
(`INDICADORES-CATALOGO.md`, etapas 5 a 8): `tablero_produccion` (kilos por inventario, lana, ventas en kg),
`tablero_gestion` (tareas, sanidad) y `tablero_combinada` (medidas propias, sección 11).

## 4. Medidas

Períodos: **ejercicio** de julio a junio (igual que Economía); **temporada** reproductiva de julio a junio según la
fecha del servicio (igual que hoy). **Mes** = mes calendario.

| Fuente | Medida | Fórmula | Unidad | Sale de | Tiempo |
|---|---|---|---|---|---|
| Stock | Stock al cierre | Σ `lote_eventos.cabezas` con fecha ≤ fin de cada período. **Semi-aditivo**: por mes es el stock al último día del mes, nunca la suma de los meses; el "total" de un período es el stock a su fin. | cabezas | `lote_eventos` (como `stock_al`) | total, mes, ejercicio |
| Stock | Altas / bajas por motivo | Σ de eventos del período por tipo: parición, compra, recategorización (+/−), división/unión (+/−), venta, mortandad, ajuste. | cabezas | `lote_eventos` | total, mes, ejercicio |
| Stock | Mortandad % | muertes del período / (stock al inicio + altas del período por parición y compra). Está en `tablero_stock` desde la etapa 1a. | % | `lote_eventos` | total, ejercicio |
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
    pesado con sus terneros). Si el evento es de una categoría que no se pesó (ej. una compra de terneros en un lote
    donde solo se pesan las vacas), el tramo vale.
  - **La parición corta el tramo de las madres** (decisión 9/11/2026), aunque las crías no se pesen: las hembras que
    parieron pierden el peso del ternero, la placenta y los líquidos. Corta el tramo del lote de las madres (el de la
    actividad de parición) en las categorías pesadas que no son crías al pie. Motivo `paricion_madres` (el de la cría
    que entra a una categoría pesada sigue siendo `paricion`).
  - **La esquila corta el tramo de los ovinos esquilados**: cualquier esquila del lote (o de sus ancestros) entre las
    dos pesadas. La esquila no dice qué categorías se esquilaron, así que corta todas las del lote. Motivo `esquila`.
  - **Pesada el mismo día que un evento**: el evento no se ignora. Se comparan las cabezas de la pesada (de las
    categorías que se pesaron) con el stock del lote en esas categorías **antes** y **después** del evento:
    - si coinciden con el stock **posterior**, la pesada se hizo después del evento: vale como **inicio** del tramo
      siguiente, y el tramo que termina en ella lo incluye (se descarta por ese evento);
    - si coinciden con el stock **anterior**, se hizo antes: vale como **final** del tramo previo, y el tramo que
      empieza en ella lo incluye;
    - si el evento no cambia las cabezas de las categorías pesadas, no corta; si no coincide con ninguno, se
      considera que lo incluye para los dos tramos (no se arriesga un dato falso).
  - Con filtro o apertura **por categoría**, también descarta la **recategorización** que entra o sale de esa
    categoría (ahí sí cambia quién está). Mirando el lote entero no la descarta: son los mismos animales.
  - **La mortandad no corta el tramo** (los kg producidos se calculan con las cabezas de la pesada final).
  - **Mínimo entre pesadas: 21 días** (parámetro `min_dias` de la tarjeta, por defecto 21): el ruido por llenado
    (3-5 % del peso vivo) supera la ganancia en tramos cortos. Un tramo más corto se descarta.
  - Los tramos se toman entre **pesadas consecutivas** de la línea: una pesada descartada como final de un tramo sigue
    siendo el inicio del siguiente.
  - La tarjeta muestra **cuántos tramos se descartaron y por qué** (aviso `tramos_descartados`, con los motivos
    `corto`, `division`, `union`, `compra`, `venta`, `destete`, `paricion`, `paricion_madres`, `esquila`, `ajuste`,
    `consumo` y `recategorizacion`).
  - Detalles (etapa 2, `tablero_pesadas`): los orígenes son los de **nivel 1** del linaje (los lotes de los que salió
    directamente); con varios, el tramo empieza en la más vieja de sus últimas pesadas. Con filtro o apertura por
    **categoría** se comparan solo las líneas de esa categoría. El tramo cuenta en el período de su pesada final.
- **Economía**: siempre en **USD**. Un movimiento en pesos se convierte con el tipo de cambio cargado en ese
  movimiento (`monto_usd` es una columna calculada de la base). **Repartos entre titulares** (por % o por monto) se
  respetan al abrir por titular: a cada titular le toca `monto_usd × monto del titular / monto original`, igual que en
  Resultado.
  - **Especie de un movimiento** (decisión 9/11/2026): la de su **lote**; sin lote, la especie cuyo **rubro** es el
    del movimiento (rubro Vacunos → Vacunos), si hay una sola; si no (rubros General, Forestación…), "Sin asignar".
  - **Con especie o lote**: los movimientos sin esa dimensión **no desaparecen en silencio**. Al **abrir** por especie
    o lote van a un grupo **"Sin asignar"**; al **filtrar** por especie o lote, la tarjeta muestra el monto que quedó
    afuera ("USD 8.000 sin especie asignada", aviso `usd_sin_especie` / `usd_sin_lote`).
- **Carga (UG)**:
  - **Por potrero**: UG de los lotes que están en el potrero / ha del potrero.
  - **Global**: UG de **todos** los animales del establecimiento / superficie de pastoreo total (la suma de los
    potreros activos; la superficie de cada uno sale de su dibujo). Si hay potreros activos **sin dibujar** (sin
    superficie), la tarjeta avisa cuántos (`potreros_sin_dibujar`), porque la carga queda sobreestimada.
  - **UG por categoría** (decisión 9/11/2026): columna `categorias_animales.ug`, editable por el Administrador en
    Especies. Se cargó con la tabla que usaba la app y las categorías nuevas la toman por nombre al crearse; sin UG,
    la categoría no suma y la tarjeta lo avisa (`categorias_sin_ug`). La pantalla Potreros usa la misma columna y la
    misma carga global (todos los animales sobre la superficie dibujada).

### Medidas nuevas (catálogo del productor, etapas 5 a 8)

Salen de `INDICADORES-CATALOGO.md`. "Dato" dice si hoy existe lo necesario (ver sección 12). Las de una fuente que ya
existe se agregan a esa función; las nuevas fuentes son `tablero_produccion` y `tablero_gestion`.

| Fuente | Medida | Fórmula | Unidad | Tiempo | Dato |
|---|---|---|---|---|---|
| Stock | UG al cierre | Σ cabezas × UG de la categoría, al cierre (semi-aditivo) | UG | total, mes, ejercicio | existe |
| Stock | **UG promedio** | Σ (cabezas × UG × días) / días del período: promedio ponderado por días. `numerador` = UG-día, `denominador` = días | UG | total, mes, ejercicio | existe |
| Stock | **Stock promedio** | igual, con cabezas | cab | total, mes, ejercicio | existe |
| Stock | Tasa de extracción | cabezas vendidas (y faenadas para consumo) en el período / stock al inicio | % | total, ejercicio | existe (consumo: falta) |
| Stock | % vacas de cría | stock de la categoría de cría / stock de su especie, al cierre | % | total, mes, ejercicio | falta marcar la categoría de cría |
| Stock | Relación lanar/vacuno | stock ovino / stock vacuno al cierre; y en UG | — | total, mes, ejercicio | existe |
| Reproductivos | Pérdidas preñez → destete | (preñadas − destetados) / preñadas | % | temporada | existe |
| Reproductivos | Kg destetados por vaca entorada | Σ kg destetados / entoradas | kg/vaca | temporada | **falta** el peso en el destete |
| Reproductivos | Peso promedio al destete | Σ kg destetados / destetados con peso | kg | temporada | **falta** el peso en el destete |
| Reproductivos | % preñez por categoría de entore | preñez abierta por la categoría del lote servido (sección "Reglas") | % | temporada | existe si cada lote servido es de una categoría |
| Reproductivos | Reposición | entoradas de la categoría de reposición (Vaquillonas) / entoradas | % | temporada | ídem |
| Producción | **Kg en stock** | por lote abierto: cabezas × peso promedio de la pesada **más cercana, anterior o posterior, dentro de 60 días**; si no hay, cabezas × **peso de referencia** de la categoría (semi-aditivo, al cierre) | kg | total, mes, ejercicio | **falta** el peso de referencia |
| Producción | **Producción de carne** (inventario) | kg vendidos − kg comprados + (kg en stock al cierre − kg en stock al inicio) + kg faenados para consumo | kg | total, ejercicio | **falta** peso de referencia; kg de compra y venta son opcionales |
| Producción | Kg vendidos / comprados | Σ peso vivo de las líneas de venta / compra | kg | total, mes, ejercicio | existe (opcional al cargar) |
| Producción | Peso promedio de venta | kg vendidos / cabezas vendidas **con peso** | kg | total, mes, ejercicio | existe |
| Producción | Lana total / por animal | Σ kg de lana de las esquilas; kg / cabezas esquiladas | kg, kg/cab | total, ejercicio | existe (`act_esquila`) |
| Producción | Carne equivalente | carne vacuna + carne ovina + kg de lana × factor (parámetro, 2,48) | kg | total, ejercicio | ídem producción de carne |
| Economía | **Gastos operativos** | gastos sin las compras de hacienda (movimientos de una actividad de compra) | USD | total, mes, ejercicio | existe |
| Economía | Precio promedio de venta | USD de ventas / kg vendidos (solo ventas con kg) | USD/kg | total, ejercicio | existe |
| Economía | **Flujo de caja** | Σ cobrado − Σ pagado por `fecha_pago` (lo pendiente no entra) | USD | mes, ejercicio | existe |
| Economía | % del gasto | gasto del grupo / gasto total (abierto por concepto) | % | total, ejercicio | existe |
| Economía | Saldos entre pagadores | quién le debe a quién (como `v_saldos`), sin tiempo | USD | total | existe |
| Potreros | **Carga promedio** | UG-día del período / días / ha efectiva (por potrero o global) | UG/ha | total, mes, ejercicio | existe |
| Potreros | Presión acumulada | Σ UG-día del período / ha efectiva del potrero | UG-día/ha | total, mes, ejercicio | existe |
| Potreros | **Ha SPG** | Σ superficie efectiva de los potreros activos de uso Ganadería (o sin uso cargado) | ha | total | existe (falta filtrar por uso) |
| Potreros | Ha forestadas | Σ superficie de potreros de uso Forestación + zonas de tipo "Forestación" dentro de los demás | ha | total | existe |
| Potreros | Días desde la última salida | fin del período − fecha de salida del último lote (si hoy no tiene animales) | días | total | existe |
| Potreros | Potreros sin animales | cantidad y ha de los potreros de pastoreo sin lote al cierre | n, ha | total | existe |
| Gestión | Tareas vencidas / próximas 15 días | tareas pendientes con vencimiento < fin del período / dentro de 15 días | n | total | existe |
| Gestión | Lotes con carencia | lotes y cabezas con carencia activa al cierre (`v_carencias`) | n, cab | total | existe |
| Gestión | Próximas dosis | dosis con `fecha_proxima_dosis` en los 15 días siguientes y no dadas | n | total | existe |

Reglas de las medidas nuevas:

- **Semi-aditivas, dos versiones**: stock, UG y kg en stock se ofrecen **al cierre** y **promedio** (ponderado por
  días). El constructor las muestra separadas ("UG al cierre", "UG promedio"); las combinadas (sección 11) proponen
  la promedio. El promedio devuelve `numerador` = Σ cantidad × días y `denominador` = días, así el total de un
  período sale de Σ/Σ y nunca de promediar meses.
- **Kg en stock** (decisión 9/11/2026): se usa la pesada **más cercana a la fecha, anterior o posterior, a 60 días
  o menos**; si empatan, la anterior.
  - La **anterior** puede ser del lote o de sus ancestros (`linaje_lote`).
  - La **posterior** tiene que ser del mismo lote y vale solo si entre la fecha y la pesada no hubo división, unión,
    compra, venta, destete, parición, ajuste ni consumo de esas categorías. Motivo: el promedio de después tiene
    que ser de los mismos animales.
  - Cabezas a la fecha × promedio de esa pesada, por categoría si la pesada la tiene.
  - Sin pesada que sirva: peso de referencia de la categoría. La tarjeta avisa cuántas cabezas se valuaron con
    referencia (`cab_con_peso_referencia`) y cuántas sin peso (categoría sin peso de referencia: `cab_sin_peso`,
    no suman).
- **Ventas y compras sin kg**: no se inventan. La producción de carne avisa `cab_vendidas_sin_kg` /
  `cab_compradas_sin_kg` y las valúa con el peso de referencia, con aviso.
- **Mortandad** no entra en la fórmula: los kg de los animales muertos ya faltan en el stock al cierre.
- **Ha SPG y Ha forestadas** son las superficies **actuales** (no hay historial, sección 13 punto 1); la tarjeta lo
  avisa cuando el período es anterior al año en curso (`superficie_actual`).
- **Carga**: la de hoy (al cierre) se mantiene; se agrega la **promedio**. La global y la Ha SPG pasan a contar
  solo potreros de pastoreo (hoy cuenta todos los activos, sección 13 punto 2).
- **UG sin potrero**: la carga global usa todos los animales, la de cada potrero solo los que están en él. Por eso
  no coinciden cuando hay lotes sin potrero asignado. La carga global avisa `ug_sin_potrero` ("X UG sin potrero
  asignado"): al cierre; con varios períodos (por mes), el mayor de ellos; en la carga promedio, las UG promedio del
  período.
- **Fila Total al abrir**: en una tabla abierta por un grupo (categoría, lote…), la fila **Total** la calcula la
  función (otra llamada sin abrir), no la suma de las filas. Con una nota debajo de la tabla: "El total lo calcula la
  base: no siempre es la suma de las filas" (stock al cierre, porcentajes, promedios, UG sin categoría).
- **% preñez por categoría de entore**: la categoría es la del lote servido al día del servicio. Si el lote tenía
  más de una categoría hembra adulta, va al grupo **"Mixto"** (no se reparte: el diagnóstico es un solo número).

## 5. Dimensiones por fuente (catálogo)

| Dimensión | Stock | Reproductivos | Pesadas | Economía | Potreros | Producción | Gestión |
|---|---|---|---|---|---|---|---|
| Especie | ✓ | ✓ | ✓ | ✓ (si el movimiento la tiene) | ✓ | ✓ | ✓ (lote) |
| Categoría | ✓ | ✓ (categoría de entore, nueva) | ✓ | — | ✓ | ✓ | — |
| Lote | ✓ | ✓ | ✓ | ✓ (si el movimiento lo tiene) | ✓ | ✓ | ✓ |
| Potrero | — | — | — | — | ✓ | — | — |
| Uso del potrero (nueva) | — | — | — | — | ✓ | — | — |
| Rubro / concepto / grupo | — | — | — | ✓ | — | — | — |
| Titular | — | — | — | ✓ | — | — | — |
| Pagador (nueva, saldos y flujo) | — | — | — | ✓ | — | — | — |
| Mes / ejercicio | ✓ | — (temporada) | ✓ | ✓ | ✓ | ✓ | — (a la fecha) |

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
- **2 — Producción y pesos**: `tablero_pesadas` (peso promedio, ganancia diaria, kg producidos), con su detalle. (La
  mortandad % quedó en `tablero_stock`, etapa 1a.)
- **3 — Economía y potreros**: `tablero_economia` y `tablero_potreros` (UG en la base), con su detalle.
- **4 — Comparar períodos y exportar**: "Comparar con" en los filtros generales (en la URL), PDF e Excel.
- **5 — Datos base del catálogo y arreglos** (migración y pantallas):
  - Datos: peso de referencia por categoría (columna como `ug`, en Especies), peso opcional en el destete,
    categoría de cría y de reposición marcadas por especie, baja por consumo. Ver sección 12.
  - Arreglos de lo hecho: carga global y superficie solo de potreros de pastoreo, con el aviso de UG sin potrero;
    tramos de pesadas con la parición de las madres, la esquila, el consumo y la pesada del mismo día que un
    evento; fila Total de la tabla calculada por la base; días de ocupación y descanso sin color al comparar.
- **6 — Medidas nuevas de las fuentes**: las de la tabla "Medidas nuevas" (sección 4), `tablero_produccion` y
  `tablero_gestion`, con sus pruebas (sección 10, "Medidas nuevas"). En cuatro partes:
  - **6a** (hecho): stock (UG al cierre, stock y UG promedio, extracción, % vacas de cría, lanar/vacuno) y
    reproductivos (pérdidas, reposición, kg destetados, kg por vaca, peso al destete, categoría de entore).
    Reglas fijadas al hacerla:
    - **Categoría de entore**: las categorías **con rol** (cría o reposición) que tenía el lote servido el día del
      servicio; con más de una, "Mixto"; con ninguna, "Sin categoría". Diagnóstico, parición y destete van a la
      categoría de su servicio. Una categoría propia (ej. "Vacas de 2º entore") necesita su rol para contar.
    - **Relación lanar/vacuno**: por el grupo de la especie (ovino / bovino); no se abre y el filtro de especie no
      le aplica.
    - **% vacas de cría** sin abrir por especie y con más de una especie: aviso `varias_especies`.
    - **Peso al destete**: solo los orígenes con peso (aviso `destetados_sin_peso`).
  - **6b** (hecho): `tablero_produccion`, fuente "Kilos y lana" (kg en stock al cierre, producción de carne, kg
    vendidos y comprados, peso de venta, lana total y por animal, carne equivalente). Reglas fijadas al hacerla:
    - **Pesada posterior**: además de lo de la sección 4, la cortan la recategorización y la parición del lote; un
      evento el mismo día de la pesada no la corta si la pesada tiene las cabezas de la fecha.
    - **Pesada anterior de los ancestros**: si hay varias el mismo día (ej. los dos lotes de una unión), se ponderan
      por cabezas.
    - **Altas iniciales del período**: se restan en la producción de carne, valuadas a su fecha como el stock (si no,
      cargar un lote nuevo contaría como kilos producidos).
    - **Producción y carne equivalente** se abren y filtran solo por especie: abiertas por lote o categoría, los kg
      que pasan de un lote o categoría a otro (unión, destete, recategorización) parecerían producción de uno y
      pérdida del otro.
    - **Lana**: por especie o lote; una esquila de varios lotes se reparte por las cabezas de cada uno ese día. Lana
      por animal = lana / cabezas de los lotes esquilados ese día.
    - **Carne equivalente**: producción de carne de las especies de grupo bovino y ovino + lana × factor (opción
      `factor_lana`, 2,48).
    - **Avisos** (`cab_con_peso_referencia`, `cab_sin_peso`, `cab_vendidas_sin_kg`, `cab_compradas_sin_kg`,
      `cab_consumidas_sin_kg`): los del último período; las cabezas una vez por lote y categoría.
    - **Kg en stock promedio** (sección 4, "Semi-aditivas, dos versiones"): queda afuera (decisión del 10/11/2026).
      Valuar cada día con la regla de las pesadas es pesado y ninguna medida combinada lo usa; hay kg al cierre.
  - **6c** (hecho): economía (gastos operativos, precio de venta, flujo de caja, % del gasto, saldos) y potreros
    (carga promedio, presión, Ha SPG, ha forestadas, sin animales, días desde la última salida). Reglas fijadas al
    hacerla:
    - **Compras de hacienda** = movimientos de una actividad de compra (gastos operativos = gastos sin ellas).
    - **Precio de venta**: solo ventas con kg en todas sus líneas (aviso `usd_ventas_sin_kg`); se abre por especie o
      lote.
    - **Flujo de caja**: por la fecha de pago; un movimiento pagado sin fecha de pago va por su fecha.
    - **% del gasto**: siempre abierto (por concepto, grupo, rubro, especie, lote, titular o pagador).
    - **Saldos**: lo pagado y las liquidaciones hasta el fin del período, una fila por deudor y acreedor (dimensión
      nueva "deudor y acreedor"); los filtros no aplican. La economía también se abre por **pagador**.
    - **Carga promedio y presión por potrero**: UG-día de los lotes en sus estadías [ingreso, salida). La global
      avisa `ug_sin_potrero` con las UG promedio que no estuvieron en ningún potrero.
    - **Ha forestadas**: no hay un tipo de zona "Forestación" de base; el administrador lo crea en los tipos de zona
      (se reconoce por el nombre, sin mayúsculas ni tildes).
    - **Días desde la última salida**: solo los potreros sin animales al cierre que alguna vez tuvieron.
    - **Aviso `superficie_actual`**: en las medidas nuevas con superficie, cuando el período termina antes del 1 de
      enero del año en curso.
  - **6d** (hecho): `tablero_gestion`, fuente "Gestión" (tareas vencidas y que vencen en 15 días, lotes y cabezas con
    carencia, próximas dosis en 15 días). Reglas fijadas al hacerla:
    - **Todo a la fecha de cierre** del período (tiempo "total"), así comparar con el año anterior mira el mismo día.
    - **Tarea pendiente al cierre**: cargada hasta ese día y no realizada, o realizada después (si se marca hoy, al
      cierre de junio seguía pendiente). Vencida: vencimiento antes del cierre; próxima: del cierre a 15 días después.
    - **Carencia activa**: el fin de la carencia es posterior al cierre, y el lote tiene animales ese día.
    - **Próxima dosis**: entre el cierre y 15 días después, no dada al cierre.
    - **Por lote**: una tarea con varios lotes cuenta en cada uno; sin lote, "Sin lote". Con filtro de especie o
      lote, lo que no tiene lote queda afuera.
- **7 — Medidas combinadas y metas** (sección 11): `tablero_medidas`, `guardar_medida`, `tablero_combinada`, el
  paso "Nueva medida" del constructor y la meta de cada tarjeta. En dos partes:
  - **7a** (hecho): medidas propias (`tablero_medidas`, `guardar_medida`, `eliminar_medida`, `tablero_combinada`,
    fuente "Medidas propias" en las tarjetas y "+ Nueva medida" en el constructor). Reglas fijadas al hacerla:
    - **B del establecimiento entero**: Ha SPG, ha forestadas y una constante. Se piden sin abrir y en el total, y
      valen lo mismo en todos los grupos y períodos (aviso `b_total` si la tarjeta está abierta y B no es constante).
    - **Otra B se abre como A**: la medida propia admite los tiempos, aperturas y filtros que tienen A y B (con B del
      establecimiento entero, los de A). El constructor solo ofrece eso; la base da error si se pide otra cosa.
    - **Sin valor**: A o B sin fila en ese período o grupo, o B = 0 al dividir (avisos `a_sin_datos` y
      `b_sin_datos`). La constante es solo B y no puede ser 0 si se divide.
    - **Hasta 2 niveles y sin ciclos**: una propia que se usa adentro de otra no puede usar otra propia; si una propia
      ya la usa otra, no puede pasar a usar una propia.
    - **Borrar**: solo si no la usa ninguna tarjeta (guardada o en edición) ni otra medida propia.
    - **Mejor si sube, baja o sin color**: lo elige el administrador en cada medida propia (propone el de A), para la
      flecha de la comparación con el año anterior.
    - **Unidad libre** (20 letras): se propone sola y se puede cambiar. Nombre único en el establecimiento.
    - La medida se guarda en el momento (no con el tablero), así queda para otras tarjetas.
  - **7b** (hecho): la meta de cada tarjeta (sin cambios en la base: va en la definición de la tarjeta). Reglas
    fijadas al hacerla:
    - **Cumple si**: "llega o pasa la meta" (`sube`, valor ≥ meta) o "queda en la meta o abajo" (`baja`). Por
      defecto, lo de la medida (`MEJOR_SI_BAJA`, o lo que eligió el administrador en una medida propia); en las sin
      color (días de ocupación y descanso) propone "llega o pasa" y pide elegir.
    - **Número**: el valor en verde si cumple y en ámbar si no, con "Meta 85 % · cumple / no llega / se pasa".
    - **Barras y líneas**: línea punteada en la meta (vertical en las barras acostadas); el eje se agranda si la meta
      queda afuera. Torta y tabla: sin meta (el constructor no la ofrece).
    - **Excel**: una fila "Meta" en la hoja de la tarjeta.
- **8 — Tableros por defecto**: las cuatro páginas (Resumen, Economía, Producción, Potreros) en la plantilla; la
  tarjeta de mapa (gráfico nuevo, solo potreros abierto por potrero). Una tarjeta cuya medida todavía no exista se
  muestra con "Disponible en la etapa X".
- **Más adelante**: actividad "Señalada" y su indicador para ovinos; superficies con historial; precio de
  referencia por categoría y producto bruto; **diagnóstico con preñadas por categoría** (opcional), para no perder
  la preñez de las vaquillonas cuando se entoran junto con las vacas.

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
| L-Cría 15/8 → 25/9/2026 | 41 | Descartado: parición el 15/9 (las vacas pesadas parieron) |
| L-Cría (25/9) → L-Cría-B 5/10/2026 | 10 | Descartado: menos de 21 días |
| L-Cría-B 5/10 → 5/11/2026 | 31 | Descartado: destete el 1/11 (salen terneros pesados) |

Resultados esperados (ejercicio 2026/27): **kg producidos 2.691**; **ganancia diaria** 2.691 / (138 × 92) =
2.691 / 12.696 = **0,212 kg/día**; **4 tramos descartados** (corto 1, destete 1, ajuste 1, parición de las madres 1).
**Por categoría**: Novillos **2.691**; Vacas de cría **250** (las vacas de L-Cría-B del 5/10 al 5/11: mirando solo
las vacas, el destete de los terneros no cambia quién está; el tramo de L-Cría lo corta la parición).

**Casos aparte** (lotes nuevos que se cargan después de las pruebas de 2026/27; cada prueba filtra por su lote):

- **Esquila**: L-Ovejas, 200 ovejas de cría desde el 1/7/2026; pesadas el 15/9 (9.000 kg) y el 15/10/2026
  (8.800 kg); esquila el 1/10. El tramo se descarta: **0 kg**, descartados: **esquila 1**.
- **Pesada el mismo día que un evento**: L-VarA y L-VarB, 100 novillos desde el 1/7/2026, pesados ese día (30.000 kg,
  300,0); compra de 20 novillos el 1/8 y pesada ese mismo día a 320,0; pesada el 1/9 de los 120 a 340,0 (40.800 kg).

| Lote | Pesada del 1/8 | Tramos | Resultado |
|---|---|---|---|
| L-VarA | 100 novillos, 32.000 kg: coincide con el stock **anterior** a la compra (se pesó antes) | 1/7 → 1/8 **válido**: +20 × 100 = **2.000 kg**; 1/8 → 1/9 descartado (compra) | **2.000 kg**; descartados: compra 1 |
| L-VarB | 120 novillos, 38.400 kg: coincide con el stock **posterior** (se pesó después) | 1/7 → 1/8 descartado (compra); 1/8 → 1/9 **válido**: +20 × 120 = **2.400 kg** | **2.400 kg**; descartados: compra 1 |

El caso se arma con una compra porque una pesada no puede tener más cabezas que el stock de ese día: con una baja
(venta, ajuste, consumo) el mismo día, solo se puede cargar la pesada con las cabezas de después.

### Economía (con titulares A y B)

| Fecha | Movimiento | USD | Especie / lote | Titulares |
|---|---|---|---|---|
| 1/10/2025 | Venta de los 30 novillos (ingreso) | 27.000 | Vacunos / L-Nov1 | A 60 % (16.200), B 40 % (10.800) |
| 15/10/2025 | Compra de los 20 novillos (gasto), en pesos: UYU 720.000 a 40 | 18.000 | Vacunos / L-Nov2 | A |
| 1/11/2025 | Sanidad (gasto, rubro General) | 2.000 | sin especie ni lote | A |
| 1/12/2025 | Sueldos y cargas sociales (gasto, rubro General), **pendiente** | 6.000 | sin especie ni lote | A 4.000, B 2.000 (por monto) |

Resultados esperados (ejercicio 2025/26):

- **Ingresos 27.000; gastos 26.000; resultado 1.000.**
- **Por titular**: A 16.200 − 18.000 − 2.000 − 4.000 = **−7.800**; B 10.800 − 2.000 = **8.800** (suman 1.000).
- **Abierto por especie**: Vacunos **9.000**; **Sin asignar −8.000**.
- **Filtrado por Vacunos**: **9.000**, con el aviso "USD 8.000 sin especie asignada".
- **Abierto por lote**: L-Nov1 **27.000**; L-Nov2 **−18.000**; Sin asignar **−8.000**.
- **Por mes**: oct 2025 **9.000**; nov **−2.000**; dic **−6.000**.
- **Por rubro**: Vacunos **9.000** (venta y compra); General **−8.000**.
- **Pendiente de pago**: **6.000** (los sueldos); de cobro **0**.

### Carga (al 30/6/2026)

- P1 dibujado, con L-Nov3: 138 × 0,8 = **110,4 UG**. P2 dibujado, con L-Cría: 100 × 1 = **100 UG**. P3 activo, sin
  dibujar y sin animales.
- **Carga por potrero**: P1 = 110,4 / superficie de P1; P2 = 100 / superficie de P2 (las superficies salen del
  dibujo de la prueba; la prueba compara contra la superficie guardada).
- **Carga global**: 210,4 / (superficie de P1 + P2), con el aviso **1 potrero sin dibujar**.
- **Días de ocupación** en el ejercicio 2025/26 (estadías [ingreso, salida)): P2 **365** (L-Cría desde el alta), P1
  **150** (L-Nov3 desde el 1/2/2026), P3 **0**. **Días de descanso**: P3 **365**, P1 **215**, P2 **0**.
- **UG sin potrero**: L-Nov1 y L-Nov2 no tienen potrero hasta la unión del 1/2/2026. Al cierre de octubre de 2025:
  140 novillos × 0,8 = **112 UG sin potrero**; la carga global de ese mes las cuenta y avisa "112 UG sin potrero
  asignado". Al 30/6/2026: **0** (sin aviso). Por mes en el ejercicio, el aviso dice el mayor: **120** (jul a set,
  150 novillos).
- **P4**, uso Forestación, dibujado: no cambia la carga global ni la superficie efectiva sin abrir; abierto por
  potrero aparece (sin animales).

### Medidas nuevas (etapas 5 a 7)

Se agrega al set de arriba, sin cambiar ningún resultado anterior:

- **Pesos de referencia**: Vacas de cría **450 kg**, Novillos **380 kg**, Terneros/as **180 kg**. UG: Vacas de cría
  1,0; Novillos 0,8 (las del set de carga).
- **Kg en la compra y la venta** (opcionales, no cambian el stock): venta del 1/10/2025, 30 novillos, **10.500 kg**;
  compra del 15/10/2025, 20 novillos, **6.000 kg**.
- **Kg en el destete** (dato nuevo): 38 terneros de L-Cría **6.840 kg**; 37 de L-Cría-B **6.475 kg**.
- **Potreros**: superficies efectivas P1 **120 ha** y P2 **180 ha**, uso Ganadería (la prueba dibuja polígonos de
  esa superficie; si el dibujo da otra, compara contra la guardada); P3 Ganadería sin dibujar; **P4 uso
  Forestación, 200 ha**.
- **Pagos**: la venta cobrada el 1/10/2025 por el pagador "Cuenta A" (de A); la compra pagada el 15/10/2025 y la
  sanidad el 1/11/2025, por "Cuenta A"; los sueldos, pendientes.
- **Ejercicio 2026/27**: renta forestal (ingreso, rubro Forestación tercerizada) **20.000** el 1/8/2026. Ovinos:
  L-Ovejas, alta de **200 Ovejas de cría** el 1/7/2026; esquila el 1/10/2026, **900 kg** de lana.
- **Gestión** (al 30/6/2026): tarea pendiente con vencimiento 1/6/2026 (vencida) y otra con vencimiento 10/7/2026
  (próxima); sanidad en L-Nov3 el 20/6/2026 con carencia de 30 días y próxima dosis el 5/7/2026.

Días del ejercicio 2025/26: 365. Novillos: 150 cabezas del 1/7 al 30/9/2025 (92 días), 120 del 1/10 al 14/10
(14), 140 del 15/10/2025 al 14/4/2026 (182) y 138 del 15/4 al 30/6/2026 (77): **51.586 cabezas-día**.

Resultados esperados (ejercicio 2025/26, salvo que diga otro):

| Medida | Cálculo | Resultado |
|---|---|---|
| Stock promedio | 100 + 51.586 / 365 | **241,33 cab** |
| UG promedio | 100 × 1,0 + 51.586 × 0,8 / 365 = 100 + 113,07 | **213,07 UG** |
| UG al cierre | 100 + 138 × 0,8 | **210,40 UG** |
| Tasa de extracción | 30 / 250 | **12,0 %** |
| % vacas de cría (cierre) | 100 / 238 | **42,0 %** |
| Kg en stock al inicio (30/6/2025) | L-Nov1 100 × 300,0 (pesada **posterior** del 1/7, 1 día, sin eventos en el medio) + L-Nov2 50 × 380 (su pesada del 1/9 está a **63 días**: referencia) + L-Cría 100 × 450 (sin pesadas cerca: referencia) | **94.000 kg** (aviso: 150 cab con referencia) |
| Kg en stock al 31/1/2026 | L-Nov1 70 × 396,6 + L-Nov2 70 × 350,0 (pesadas del 1/1, 30 días antes; no hay posteriores del mismo lote) + 100 × 450 | **97.262 kg** (100 cab con referencia) |
| Kg en stock al cierre (30/6/2026) | L-Nov3 138 × 430,0 (la del 1/8/2026, **32 días después**, es más cercana que la del 1/5, 60 días antes; sin eventos en el medio: el ajuste es del 15/8) + L-Cría 100 × 450,0 (pesada del 15/8/2026, 46 días después; la parición es del 15/9) | **104.340 kg** (sin referencia) |
| Producción de carne | 10.500 − 6.000 + (104.340 − 94.000) + 0 | **14.840 kg** |
| Peso promedio de venta (novillos) | 10.500 / 30 | **350,0 kg** |
| Pérdidas preñez → destete (temporada 2025/26) | (90 − 75) / 90 | **16,7 %** |
| Kg destetados por vaca entorada | (6.840 + 6.475) / 100 | **133,2 kg/vaca** |
| Peso promedio al destete | 13.315 / 75 | **177,5 kg** |
| % preñez por categoría de entore | L-Cría es solo Vacas de cría | Vacas de cría **90,0 %** |
| Reposición | 0 vaquillonas / 100 entoradas | **0,0 %** |
| Gastos operativos | 26.000 − 18.000 (compra de hacienda) | **8.000 USD** |
| Precio promedio de venta | 27.000 / 10.500 | **2,57 USD/kg** |
| Flujo de caja | oct 27.000 − 18.000; nov −2.000; dic 0 (pendiente) | oct **9.000**, nov **−2.000**, dic **0**; ejercicio **7.000** |
| % del gasto por concepto | sobre 26.000 | compra **69,2 %**, sueldos **23,1 %**, sanidad **7,7 %** |
| Saldos entre pagadores | "Cuenta A" cobró la parte de B de la venta | **A le debe 10.800 a B** |
| Ha SPG | P1 + P2 (P3 sin dibujar, P4 forestación) | **300 ha** (aviso: 1 potrero sin dibujar) |
| Ha forestadas | P4 | **200 ha** |
| Carga promedio P1 | L-Nov3 desde el 1/2: (140 × 73 + 138 × 77) × 0,8 = 16.676,8 UG-día / 365 / 120 | **0,381 UG/ha** |
| Carga promedio P2 | 100 UG todo el año / 180 | **0,556 UG/ha** |
| Carga global promedio | 213,07 / 300 | **0,710 UG/ha** (aviso: 67,38 UG promedio sin potrero = (150 × 92 + 120 × 14 + 140 × 109) × 0,8 / 365, los novillos hasta el 31/1/2026) |
| Presión acumulada | P1 16.676,8 / 120; P2 36.500 / 180 | P1 **138,97**, P2 **202,78 UG-día/ha** |
| Potreros sin animales (cierre) | P3 (P4 no es de pastoreo) | **1**, sin superficie (aviso: sin dibujar) |
| Tareas (al 30/6/2026) | | vencidas **1**, próximas 15 días **1** |
| Carencias y dosis (al 30/6/2026) | L-Nov3 hasta el 20/7/2026; dosis del 5/7 | **1 lote, 138 cab**; próximas dosis **1** |
| Lana (2026/27) | 900 / 200 | **900 kg**, **4,5 kg/cab** |
| Carne equivalente, parte de la lana (2026/27) | 900 × 2,48 | **2.232 kg** |
| Relación lanar/vacuno (31/7/2026) | 200 / 238 | **0,84** |
| Renta forestal (2026/27) | ingreso del rubro Forestación tercerizada | **20.000 USD** |

Medidas combinadas (sección 11), ejercicio 2025/26:

| Medida combinada | A op B | Resultado |
|---|---|---|
| **Carga UG/ha por mes** | UG promedio ÷ Ha SPG | jul 2025 220 / 300 = **0,733**; oct 2025 (120 × 14 + 140 × 17) × 0,8 / 31 + 100 = 204,77 / 300 = **0,683**; abr 2026 (140 × 14 + 138 × 16) × 0,8 / 30 + 100 = 211,15 / 300 = **0,704**; ejercicio **0,710** (Σ UG-día / días / 300, **no** el promedio de los 12 meses) |
| **Resultado por ha SPG** | Resultado ÷ Ha SPG | 1.000 / 300 = **3,33 USD/ha**; abierto por rubro: Vacunos 9.000 / 300 = **30,00**, General −8.000 / 300 = **−26,67** (aviso: "Ha SPG: total del establecimiento") |
| **Costo por kg producido** | Gastos operativos ÷ Producción de carne | 8.000 / 14.840 = **0,54 USD/kg** |
| Margen por kg (combinada de combinadas, 2 niveles) | Precio promedio de venta − Costo por kg producido | 2,571 − 0,539 = **2,03 USD/kg** |
| Gasto por UG | Gastos operativos ÷ UG promedio | 8.000 / 213,07 = **37,55 USD/UG** |
| Producción de carne por ha | Producción de carne ÷ Ha SPG | 14.840 / 300 = **49,47 kg/ha** |
| Renta forestal por ha (2026/27) | Ingresos (rubro Forestación) ÷ Ha forestadas | 20.000 / 200 = **100,00 USD/ha** |
| División por cero | Gastos operativos ÷ Lana (2025/26: sin esquilas) | **sin valor** y aviso "Lana: sin datos" (nunca 0 ni infinito) |
| Constante | % preñez − 85 (distancia a la meta) | 90,0 − 85 = **5,0** |
| Ciclo | M1 = M2 ÷ Ha SPG y M2 = M1 × 2 | `guardar_medida` da error (sin ciclos) |

## 11. Medidas combinadas y metas (etapa 7)

### Dónde se cruzan: en la base

Propuesta: **en la base**, con una función `tablero_combinada`, por cuatro razones:

1. La regla del tablero es que los cálculos estén en la base y se prueben con SQL; una combinada es un cálculo más.
2. **Σ A / Σ B** necesita los totales de A y B para el mismo período y filtros, y en las semi-aditivas Σ UG-día /
   Σ días: eso ya lo devuelve cada fuente en `numerador`/`denominador`. Cruzar en la base usa esas mismas filas.
3. Pantalla, Excel y PDF leen lo mismo: el Excel exporta las filas que devolvió la función (como hoy), así que da
   el mismo número sin cálculo propio en la app.
4. Una combinada de combinadas (2 niveles) se resuelve llamando a la misma función, con un límite de nivel.

Cómo:

- Tabla `tablero_medidas (id, establecimiento_id, nombre, unidad, definicion jsonb, …)`. La escribe solo
  `guardar_medida` (security definer, administrador), que valida la definición:
  `{"a": {"fuente", "medida"} | {"propia": id}, "op": "div" | "mul" | "sum" | "res", "b": {…} | {"constante": n}}`,
  con fuentes y medidas de la lista fija, constantes numéricas, sin ciclos y hasta 2 niveles. No hay texto libre ni
  SQL armado con lo que escribe el usuario.
- `tablero_combinada(p_establecimiento_id, p_medida /* id de la propia */, p_abrir_por, p_tiempo, p_desde, p_hasta,
  p_filtros, p_opciones)`, security invoker, misma salida que las fuentes. Llama a A y a B con los mismos
  parámetros mediante un `case` sobre la fuente (lista fija: `tablero_stock`, …), y las cruza por (periodo, clave).
- **Valor de cada fila**: `A.valor op B.valor`. Para ÷: `numerador` = A.valor, `denominador` = B.valor, así el
  total de una tarjeta y la comparación con el año anterior son Σ A / Σ B. El "total" no se arma sumando filas: es
  otra llamada con tiempo `total`, donde cada fuente ya calcula su total como corresponde (Σ para las aditivas,
  promedio por días para las semi-aditivas).
- **B sin la dimensión de la apertura**: se usa el total de B en todos los grupos **solo si B es del
  establecimiento entero** (superficies o una constante). Con otra B (ej. gastos por especie ÷ UG sin abrir) la
  tarjeta marca "B no se abre por especie" y no calcula: dividir cada especie por las UG de todas da un número
  engañoso (sección 13, punto 9).
- **Sin valor**: B nula o 0 en ÷ → fila con `valor` nulo y aviso `sin_denominador`; A o B sin datos → nulo y aviso.
- **Unidad**: se propone sola (USD ÷ ha → USD/ha, kg ÷ kg → sin unidad) y el administrador la puede cambiar.
- **Filtros que no aplican**: los de A y B; si un filtro no aplica a una de las dos, la tarjeta lo marca igual que
  hoy.

### Metas

- En la definición de la tarjeta: `"meta": {"valor": 85, "mejor": "sube" | "baja"}` (por defecto según la medida:
  "baja" para las de `MEJOR_SI_BAJA`; en las sin color, como los días de ocupación, el administrador elige).
- Tarjeta de número: verde si cumple, ámbar si no; texto "Meta 85 %". Gráficos de barras y líneas: línea punteada
  horizontal con la meta. Torta y tabla: sin meta.
- Sin cálculo en la base: es una comparación del valor que ya se muestra.

## 12. Qué datos del catálogo existen y cuáles faltan

| Dato | Estado | Propuesta |
|---|---|---|
| Superficie por potrero | **Existe**: sale del dibujo; la efectiva descuenta las zonas no aprovechables | — |
| Ha SPG | **Existe a medias**: hoy la carga global divide por todos los potreros activos, también los de uso Forestación o Reserva | Ha SPG = Σ efectiva de los potreros activos de uso Ganadería (o sin uso cargado) |
| Ha forestadas | **Existe**: uso del potrero (`uso_actual` = Forestación) y zonas no aprovechables | Σ potreros de uso Forestación + zonas de un tipo "Forestación" |
| Superficies con historial | **Falta**: los potreros no guardan fecha de alta, baja ni cambio de uso o dibujo | Más adelante (sección 13, punto 1); mientras tanto, superficies actuales con aviso |
| UG por categoría | **Existe** (`categorias_animales.ug`) | — |
| Peso de referencia por categoría | **Hecho (5b)** | Columna `categorias_animales.peso_referencia_kg`, editable en Especies, como la UG. Sin valor por defecto (no se inventa): sin peso, la categoría no suma kilos y se avisa |
| Kg en compras y ventas | **Existe, opcional** (`actividad_lineas.peso_vivo_total_kg`); kg de gancho en ventas a frigorífico | Avisar las ventas y compras sin kg |
| Kg en el destete | **Hecho (5b)** | Peso vivo total opcional de las crías que salen de cada lote de origen (`actividad_lotes.peso_vivo_total_kg`, fila del origen): así cada destete se asigna a la temporada de su origen |
| Kg de lana | **Existe** (`act_esquila.kg_lana_total`, uno por esquila) | — |
| Consumo (faena propia) | **Hecho (5c)** | Actividad nueva "Consumo" (lote, categorías, cabezas y peso vivo total opcional; evento de lote `consumo`): cuenta en extracción y producción, no en mortandad; corta el tramo de pesadas |
| Categoría de cría y de reposición | **Hecho (5b)** | `categorias_animales.rol` (cría: Vacas de cría, Ovejas de cría, Yeguas; reposición: Vaquillonas, Borregas), cargado por nombre con el mismo trigger de la UG y editable en Especies |
| Preñez por categoría de entore | **Existe a medias**: el servicio y el diagnóstico son un número por lote | Por la categoría del lote servido; lote mixto → "Mixto" |
| Fecha de pago y estado | **Existe** (`fecha_pago`, `estado`) | — |
| Pagadores y saldos | **Existe** (`pagadores`, `v_saldos`) | — |
| Tareas, próximas dosis, carencias | **Existe** (bitácora con vencimiento, `act_sanidad_productos`, `v_carencias`) | — |
| Precio de referencia por categoría | **Falta (opcional)** | Más adelante, junto con el producto bruto |
| Señalada (ovinos) | **Falta** | Actividad nueva, más adelante (ya decidido) |

## 13. Observaciones al catálogo

**Decisiones del 9/11/2026**: puntos 1 a 5 y 7 a 13, como se proponen; punto 3 con la pesada anterior o posterior
(sección 4, "Kg en stock"); punto 6: gastos ganaderos = rubros de especies + General (los gastos propios de la
forestación se cargan en el rubro Forestación tercerizada; va en la ayuda de la medida).

1. **Superficies: no una tabla aparte.** El catálogo propone `superficies (tipo, ha, desde, hasta)` cargada a mano.
   Ya tenemos las superficies del dibujo y la efectiva (zonas). Una tabla manual duplicaría el dato y se
   desincronizaría. Propuesta: Ha SPG y forestadas se **calculan** de los potreros (uso y zonas). El historial
   (arriendos que entran y salen) se resuelve más adelante con fechas de alta y baja de cada potrero. Mientras
   tanto, se usan las superficies actuales con aviso. Con eso el aviso de "Ha SPG cargada vs suma de potreros
   (5 %)" no hace falta.
2. **La carga global de hoy cuenta potreros que no son de pastoreo.** `tablero_potreros` divide por todos los
   potreros activos, también los de uso Forestación o Reserva. Hay que filtrar por uso: es un arreglo de lo ya
   hecho, no algo nuevo.
3. **"Menos de 60 días" en el peso.** Mirando solo hacia atrás, al cierre la pesada de L-Nov3 (1/5/2026) tenía
   **60 días justos**: con "menos de 60" se valuaba a 380 kg (referencia) en vez de 410,5 y la producción de carne
   daba **−60 kg**. Y al inicio L-Nov1 se valuaba a 380 kg aunque se pesó a 300 kg al día siguiente (8.000 kg de
   más). Decidido: **60 días o menos**, con la pesada **más cercana, anterior o posterior** (sección 4). Con el set,
   la producción de carne pasa a **14.840 kg**.
4. **Kg de consumo.** No hay cómo cargarlo: hoy sería una mortandad (y entraría en el % de mortandad) o un ajuste.
   Propuesta: motivo de baja **"Consumo"**, con peso opcional, que no cuenta como mortandad y sí en extracción y
   producción.
5. **Costo por kg producido con las compras adentro está mal.** Si "gastos ganaderos" incluye las compras de
   hacienda, se cuentan dos veces: el método de inventario ya resta los kg comprados. Con el set: 26.000 / 14.840 =
   1,75 USD/kg en vez de **0,54**. Propuesta: usar **gastos operativos** (gastos sin compras de hacienda). Lo mismo
   para gasto por ha y por UG.
6. **"Gastos ganaderos" y "general ganadero"** no están definidos. Hoy los rubros son Vacunos, Ovinos, Forestación
   tercerizada y General. Propuesta: ganadero = rubros de especies + General. Si General también paga cosas de la
   forestación, haría falta marcar rubros o conceptos como "no ganadero" (dato nuevo). Decidido: rubros de especies +
   General; lo de la forestación va en su rubro.
7. **Resultado ganadero por ha** usa el resultado devengado, que incluye ventas y compras de hacienda pero no la
   variación de inventario. Un año que retiene animales da un resultado bajo aunque haya producido. Es correcto como
   "plata", pero no mide la producción: para eso está el producto bruto (más adelante, con precios de referencia).
   Va así, con esa aclaración en la ayuda de la medida.
8. **Semi-aditivas "cuando están en el denominador".** La regla del catálogo hace que "UG" valga distinto según de
   qué lado de la operación esté. Propuesta: dos medidas explícitas, **al cierre** y **promedio**. El administrador
   elige, y la combinada propone la promedio.
9. **"B sin la apertura → total para todos los grupos"** sirve para superficies y constantes. Con cualquier otra B
   da números engañosos: gastos de Vacunos ÷ UG de **todas** las especies baja el gasto por UG de cada especie.
   Propuesta: solo para B del establecimiento entero; si no, la tarjeta lo marca y no calcula.
10. **Margen por kg** resta un precio de **venta** (kg vivos vendidos, de una categoría) y un costo por kg
    **producido** (todo el campo). Es una aproximación válida mirando el campo entero; abierto por categoría no tiene
    sentido (el costo no se reparte por categoría). Propuesta: solo sin abrir.
11. **% preñez por categoría de entore** (vaquillonas de 1er entore, 2º entore, adultas): esas categorías no existen.
    Hoy hay Vaquillonas y Vacas de cría, y el diagnóstico es un número por lote. Sale bien si cada categoría se
    sirve en su propio lote, que es lo habitual. Las de 2º entore necesitan una categoría propia que el
    administrador puede crear.
12. **Tarjeta de mapa** (página Potreros): es un tipo de gráfico nuevo, más pesado que los otros (reusa el mapa de
    Potreros). Va en la etapa 8.
13. **Carne equivalente**: la parte ovina sale del mismo método de inventario por especie, así que necesita pesos de
    referencia de las categorías ovinas y pesadas o kg en compraventas de ovinos. Sin eso, la carne ovina da 0 con
    aviso.
