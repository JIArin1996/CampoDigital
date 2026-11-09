# Indicadores: catálogo del productor, medidas combinadas y tableros por defecto

Complementa `DISENO-INDICADORES-TABLERO.md`. Escrito desde el punto de vista del productor: qué necesita mirar para
manejar el establecimiento (cría y recría vacuna, ovinos, forestación arrendada), no desde lo que hoy ya calcula la
base. Donde falta un dato para calcular algo, está marcado como **[dato nuevo]**.

## 1. Superficies (la base de todo lo "por hectárea")

Sin superficies bien definidas, ningún indicador por ha sirve. Se necesita una tabla de superficies del
establecimiento **con historial** (arriendos que entran y salen, forestación que se planta o se cosecha):

| Superficie | Qué es | Se usa para |
|---|---|---|
| Ha totales | todo el establecimiento | referencia |
| **Ha SPG** (superficie de pastoreo ganadero) = **ha efectiva** | ha totales menos forestación, montes, bajos, cascos, caminos | carga, kg de carne/ha, resultado ganadero/ha |
| Ha forestadas | arrendadas a la forestal | renta USD/ha forestada |
| Ha por potrero | sale del dibujo | carga por potrero |

- **[dato nuevo]** `superficies` (establecimiento, tipo, ha, desde, hasta). Si no hay carga manual, Ha SPG = suma de
  potreros activos de pastoreo.
- Avisar si Ha SPG cargada y suma de potreros difieren más de 5 %.

## 2. Catálogo de indicadores

### 2.1 Stock y estructura

| Indicador | Fórmula | Unidad |
|---|---|---|
| Stock por categoría y especie | cabezas al cierre (semi-aditivo) | cab |
| UG totales | Σ cabezas × UG de la categoría; en un período, promedio ponderado por días | UG |
| Relación lanar/vacuno | ovinos / vacunos (cabezas) y UG ovinas / UG vacunas | - |
| % vacas de cría en el stock | vacas de cría / stock vacuno | % |
| Tasa de extracción | cabezas vendidas en el ejercicio / stock al inicio | % |
| Reposición | vaquillonas que entran al entore / vacas entoradas | % |

### 2.2 Reproducción (por temporada, sobre entoradas del mismo servicio)

| Indicador | Fórmula | Unidad |
|---|---|---|
| % preñez | preñadas / entoradas, **abierto por categoría** (vaquillonas de 1er entore, vacas de 2º entore, vacas adultas) | % |
| % parición | nacidos vivos / entoradas | % |
| % destete | destetados / entoradas | % |
| Pérdidas preñez → destete | (preñadas − destetados) / preñadas | % |
| Kg destetados por vaca entorada | Σ kg de terneros destetados / entoradas | kg/vaca |
| Peso promedio al destete | Σ kg destetados / destetados | kg |
| % señalada (ovinos) | corderos señalados / ovejas encarneradas **[actividad Señalada]** | % |

### 2.3 Producción

| Indicador | Fórmula | Unidad |
|---|---|---|
| Ganancia diaria | por tramos válidos (ya definido) | kg/día |
| Kg producidos por pesadas | por tramos válidos (ya definido) | kg |
| **Producción de carne (método inventario)** | kg vendidos − kg comprados + (kg en stock al cierre − kg en stock al inicio) + kg consumo | kg |
| **Producción de carne por ha** | producción de carne / Ha SPG | kg/ha |
| Lana total y por animal | kg de lana de la esquila; kg / ovinos esquilados | kg, kg/cab |
| **Carne equivalente por ha** | (carne vacuna + carne ovina + kg lana × factor) / Ha SPG. Factor parámetro, por defecto **2,48** | kg/ha |
| Peso promedio de venta por categoría | kg vendidos / cabezas vendidas | kg |
| Mortandad % | ya definido, abierto por categoría y especie | % |

- **[dato nuevo]** kg en compras y ventas (verificar si ya se cargan).
- **[dato nuevo]** **peso de referencia por categoría** (editable por el Administrador), para valuar en kg el stock
  cuando un lote no tiene pesada reciente. Regla: usar la última pesada del lote si tiene menos de 60 días, si no el
  peso de referencia. La tarjeta avisa cuántas cabezas se valuaron con peso de referencia.

### 2.4 Economía (USD)

| Indicador | Fórmula | Unidad |
|---|---|---|
| Ingresos, gastos, resultado | ya definido (devengado) | USD |
| Resultado por rubro | vacunos, ovinos, forestación, general | USD |
| **Resultado ganadero por ha** | (resultado vacunos + ovinos + general ganadero) / Ha SPG | USD/ha |
| Renta forestal por ha | ingresos forestación / ha forestadas | USD/ha |
| Gasto por concepto y su % del total | | USD, % |
| Gasto por ha y por UG | gastos / Ha SPG; gastos / UG promedio | USD/ha, USD/UG |
| **Costo por kg producido** | gastos ganaderos / producción de carne (método inventario) | USD/kg |
| Precio promedio de venta | USD de ventas / kg vendidos, por categoría | USD/kg |
| Margen por kg | precio promedio de venta − costo por kg producido | USD/kg |
| Flujo mensual y acumulado | ingresos − egresos **por fecha de pago** (caja, no devengado) | USD |
| Pendientes de cobro y pago | ya definido | USD |
| Resultado por titular | ya definido | USD |
| Saldos entre pagadores | quién le debe a quién | USD |
| Producto bruto ganadero (opcional) | ventas − compras + variación de inventario valuada | USD |

- **[dato nuevo, opcional]** precio de referencia por categoría (USD/kg) para valuar la variación de inventario.
  Sin esos precios, el producto bruto no se muestra (no se inventa).

### 2.5 Potreros

| Indicador | Fórmula | Unidad |
|---|---|---|
| Carga por potrero | UG-día / días / ha del potrero (promedio del período) | UG/ha |
| Carga global | UG promedio / Ha SPG | UG/ha |
| Presión acumulada | Σ UG-día / ha del potrero en el período | UG-día/ha |
| Días de ocupación y descanso | ya definido | días |
| Días desde la última salida | hoy − fecha de salida del último lote | días |
| Potreros sin animales | cantidad y ha | cab, ha |

### 2.6 Gestión

| Indicador | Fórmula |
|---|---|
| Tareas vencidas y próximas 15 días | del calendario |
| Sanidad: próximas dosis y carencias activas | lotes que hoy no se pueden vender |
| Costo sanitario por cabeza | gastos concepto sanidad / cabezas promedio |

## 3. Medidas combinadas (mezclar variables)

El Administrador puede crear **medidas propias** combinando dos medidas del catálogo o una medida y una constante,
sin escribir fórmulas a mano.

### 3.1 Cómo se arman

En el constructor, "Nueva medida":

1. **Medida A** (de cualquier fuente).
2. **Operación**: ÷ , × , + , − .
3. **Medida B** (de cualquier fuente) **o una constante** (ej. 100, 2,48).
4. Nombre y unidad (la unidad se propone sola: USD ÷ ha → USD/ha).
5. Se guarda y queda disponible en todas las tarjetas del establecimiento.

Ejemplos que tienen que salir:

| Medida | A | Op | B |
|---|---|---|---|
| Carga UG/ha por mes | UG (promedio) | ÷ | Ha SPG |
| Resultado por ha efectiva por mes | Resultado | ÷ | Ha SPG |
| Gasto por UG | Gastos | ÷ | UG (promedio) |
| Costo por kg producido | Gastos ganaderos | ÷ | Producción de carne |
| Kg carne por ha | Producción de carne | ÷ | Ha SPG |
| Vacunos por ha | Stock vacuno | ÷ | Ha SPG |
| Renta forestal por ha | Ingresos forestación | ÷ | Ha forestadas |
| Kg lana por ha | Lana | ÷ | Ha SPG |
| USD de sanidad por cabeza | Gastos concepto Sanidad | ÷ | Stock promedio |

### 3.2 Reglas

- **Mismos filtros, período y apertura** para A y B. Se cruzan por (período, grupo).
- **Si B no tiene la dimensión de la apertura**, se usa su total para todos los grupos (ej. resultado por especie ÷
  Ha SPG: las ha no se abren por especie, se divide cada grupo por el total). La tarjeta lo dice: "Ha SPG: total
  del establecimiento".
- **Totales y comparaciones**: Σ A / Σ B, nunca promedio de cocientes (por eso cada medida trae numerador y
  denominador).
- **Semi-aditivas** (stock, UG, superficie): en un período se usa el promedio ponderado por días, no el cierre,
  cuando están en el denominador.
- **División por cero o B vacío**: sin valor y aviso, nunca 0 ni infinito.
- **Una medida propia puede usar otra medida propia**, hasta 2 niveles, sin ciclos.
- **Sin texto libre ni SQL armado por el usuario**: la definición es JSON estructurado y validado
  (`{a: {fuente, medida}, op, b: {fuente, medida} | {constante}}`).
- Proponer si el cruce se hace en la base (función que llama a las dos fuentes) o en la app sobre filas ya
  agregadas. Requisito: el Excel exportado y la pantalla dan el mismo número.

### 3.3 Metas

Cada tarjeta puede tener una **meta** opcional (ej. preñez 85 %, carga 0,8 UG/ha): línea punteada en los gráficos
y color en la tarjeta de número (verde si la cumple, ámbar si no).

## 4. Tableros por defecto

Cuatro páginas precargadas (plantilla en el código, se guardan al primer "Guardar tablero", como el Resumen actual).
Por defecto, período = ejercicio en curso (julio a junio) y comparar con el ejercicio anterior.

### Resumen (la foto del campo en 10 segundos)

| Tarjeta | Gráfico |
|---|---|
| Stock total vacunos y ovinos, y UG | número |
| Carga global UG/ha SPG | número con meta |
| Resultado del ejercicio y USD/ha SPG | número |
| Producción de carne kg/ha (acumulado del ejercicio) | número |
| % preñez, parición y destete de la última temporada | número (3) |
| Mortandad % del ejercicio | número |
| Pendientes de cobro y pago | número |
| Tareas vencidas y próximas 15 días | tabla |
| Resultado mensual acumulado vs ejercicio anterior | líneas |

### Economía

| Tarjeta | Gráfico |
|---|---|
| Resultado por rubro | barras |
| Ingresos y gastos por mes | barras + línea de resultado acumulado |
| Gastos por concepto | barras horizontales con % |
| Resultado ganadero USD/ha SPG y renta forestal USD/ha | número |
| Costo por kg producido, precio promedio de venta y margen por kg | número |
| Gasto por UG | número |
| Flujo de caja mensual (por fecha de pago) | líneas |
| Resultado por titular | barras |
| Saldos entre pagadores | tabla |
| Pendientes de cobro y pago | tabla |

### Producción

| Tarjeta | Gráfico |
|---|---|
| Stock por categoría, evolución mensual | barras apiladas |
| UG por mes | líneas |
| Reproductivos por temporada (preñez, parición, destete) vacunos | barras agrupadas con meta |
| % preñez por categoría de entore | barras |
| Kg destetados por vaca entorada y peso al destete | número |
| Reproductivos ovinos (preñez, parición, señalada) | barras |
| Ganancia diaria por lote | barras con tramos descartados |
| Kg producidos por mes | barras |
| Producción de carne y carne equivalente kg/ha | número |
| Lana total y kg por animal por esquila | barras |
| Mortandad por categoría | barras |
| Tasa de extracción | número |

### Potreros

| Tarjeta | Gráfico |
|---|---|
| Mapa de potreros coloreado por carga actual | mapa |
| Carga por potrero (UG/ha) | barras con meta |
| Carga global UG/ha por mes | líneas con meta |
| Días de ocupación y descanso por potrero | barras apiladas |
| Días desde la última salida | tabla ordenada |
| Presión acumulada UG-día/ha | barras |
| Potreros sin animales | número |

## 5. Etapas sugeridas

1. **Datos base**: superficies con historial, peso de referencia por categoría, kg en compras y ventas (verificar),
   precio de referencia opcional.
2. **Medidas combinadas y metas** (después del constructor libre, 1b).
3. **Nuevas medidas del catálogo** por fuente, junto con la etapa que ya toca esa fuente.
4. **Tableros por defecto** de las cuatro páginas; cada tarjeta que dependa de una medida todavía no hecha se
   muestra con "Disponible en la etapa X" (no se oculta).
5. Para cada medida nueva: fórmula en la tabla de medidas y caso en el set de prueba con resultado conocido.
