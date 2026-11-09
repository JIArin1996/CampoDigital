# Diseño — Área efectiva de los potreros (zonas no aprovechables)

Rama: `v2-gestion`. Sigue a "la superficie sale del dibujo" (20261106000100). Después se lleva a `v2-Indicadores`
(la carga del tablero pasa a usar el área efectiva).

## 1. Qué es

Dentro de un potrero hay partes que no sirven para pastoreo (monte, bañado, cañada, casco…). Se **dibujan** en el
mapa como **zonas no aprovechables**, y el **área efectiva** del potrero es su superficie menos esas zonas. La
**carga** (UG/ha) se calcula siempre sobre el área efectiva.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Zonas | Una o varias por potrero. Cada una con un **tipo** y, opcional, una nota. |
| Tipos | **Catálogo editable** por establecimiento. Arranca con Monte, Bañado, Cañada o agua, Casco o instalaciones, Otra (cada uno con su color). Lo edita el **Administrador** en Configuraciones: agregar, renombrar, color, orden y dar de baja (un tipo en uso no se borra, se da de baja). |
| Quién dibuja | **Administrador y Operador** (igual que la forma del potrero). Consulta solo ve. |
| Borde | Una zona que pasa el borde del potrero se **recorta** al potrero: solo cuenta lo de adentro. |
| Superposición | Si dos zonas del mismo potrero se pisan, la parte en común se resta **una sola vez**. |
| Qué se muestra | **Las dos**: superficie total y efectiva ("103 ha · 88 efectivas"), en el potrero y en el establecimiento. |
| Carga | Siempre sobre el área **efectiva**: en Potreros (panel, lista y resumen) y en Indicadores. |
| Sin dibujar | Un potrero sin dibujar no tiene superficie ni área efectiva (sus zonas, si las tuviera, no cuentan). |

## 3. Cálculo

- Cada zona se guarda **como se dibujó** (no recortada). El recorte se calcula: si después se redibuja el potrero,
  el área efectiva se acomoda sola.
- **Superficie no aprovechable** del potrero = área geodésica de (unión de sus zonas ∩ forma del potrero).
- **Área efectiva** = superficie del potrero − superficie no aprovechable (en ha, con dos decimales). Sin forma: null.
- Se guarda en `potreros.superficie_efectiva` y la recalcula la base: el trigger que ya calcula la superficie del
  potrero (`calcular_superficie_potrero`) calcula también la efectiva, y cada alta, cambio o baja de una zona vuelve
  a calcular la de su potrero.
- **Establecimiento**: la superficie total sigue siendo la suma de los potreros activos (`superficie_total`); se
  agrega la efectiva (`superficie_efectiva_total`, la suma de las efectivas).

## 4. Datos

- `zona_tipos (id, establecimiento_id, nombre, color, orden, activo, …)`: el catálogo. Se carga con los 5 tipos al
  crear el establecimiento (y en los que ya existen). Escriben solo administradores (políticas), como los otros
  catálogos.
- `potrero_zonas (id, establecimiento_id, potrero_id, tipo_id, forma MultiPolygon 4326, nota, creado por y cuándo)`:
  las zonas. Authenticated solo lee; se escriben con funciones (como la forma del potrero):
  - `guardar_zona_potrero(p_id, p_potrero_id, p_tipo_id, p_forma, p_nota)`: alta o cambio (Administrador u
    Operador del establecimiento). Valida el GeoJSON como `guardar_forma_potrero`, que el potrero esté dibujado y que
    la zona **toque** el potrero (si queda vacía al recortarla, error).
  - `borrar_zona_potrero(p_id)`: baja (borrado real: es un dibujo, no un dato con historia).
- `v_potreros_mapa` suma `superficie_efectiva` y las zonas de cada potrero (GeoJSON recortado al potrero, tipo y
  color) para dibujarlas.

## 5. Pantallas

- **Mapa**: las zonas se ven dentro del potrero con el **color de su tipo y trama rayada**; en la leyenda, los tipos.
- **Detalle del potrero** (panel): "Superficie 103 ha · 88 efectivas" y la lista **Zonas no aprovechables** (tipo,
  ha, nota) con **Agregar zona** → elegir tipo → dibujar (como el potrero: se pega a los bordes) → guardar; en cada
  zona, editar el dibujo, cambiar el tipo o la nota y borrar. En el celular, a pantalla completa (como el dibujo del
  potrero).
- **Lista de potreros**: "103 ha · 88 efectivas"; la carga (cab/ha) sobre la efectiva.
- **Resumen del establecimiento**: superficie total y efectiva; carga global sobre la efectiva.
- **Configuraciones → Potreros** (nuevo, solo Administrador): el catálogo de tipos de zona.

## 6. Etapas

- **D1 — Base**: migración (`zona_tipos`, `potrero_zonas`, `potreros.superficie_efectiva`, funciones, trigger,
  vista, `superficie_efectiva_total`, catálogo base) y pruebas SQL con resultados conocidos.
- **D2 — App**: Configuraciones (tipos), mapa, panel (zonas), lista y resumen con la efectiva y la carga.
- **D3 — Indicadores** (en `v2-Indicadores`): `tablero_potreros` con el área efectiva (carga global y por potrero,
  superficie efectiva como medida).

## 7. Pruebas (D1), con resultados conocidos

Potrero P de 0,01° × 0,01° (≈ 103 ha). Las áreas se comparan contra el cálculo geodésico de la misma figura.

- Una zona Monte de un cuarto del potrero (la mitad de ancho y de alto): efectiva = superficie − área de la zona.
- Una segunda zona que pisa la mitad de la primera: se resta la unión, no la suma.
- Una zona que se sale del potrero: solo cuenta lo de adentro.
- Una zona afuera del todo: error.
- Redibujar el potrero más chico: la efectiva se recalcula sola.
- Borrar una zona: la efectiva sube.
- Borrar el dibujo del potrero: superficie y efectiva null.
- Permisos: Operador dibuja zonas; Consulta no; nadie escribe directo en `potrero_zonas`; solo el Administrador
  edita tipos; un tipo en uso no se borra.
