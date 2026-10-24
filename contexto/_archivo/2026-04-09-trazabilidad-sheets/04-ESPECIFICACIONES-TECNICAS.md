# Campo Digital - Especificaciones Técnicas

## Supabase - API 

### Estructura del proyecto en Supabase

```
├── Code.gs              // Entry points: doGet(), doPost()
├── Establecimientos.gs  // CRUD establecimientos, dicose_propiedad, potreros
├── Animales.gs          // CRUD animales + lógica de categorización automática
├── Movimientos.gs       // CRUD lotes_movimiento + movimientos_ganado + carga masiva Excel
├── Stock.gs             // Consultas de stock derivadas de la tabla animales
├── Finanzas.gs          // Ingresos y egresos
├── Agricultura.gs       // Lotes agrícolas y labores
├── Parametros.gs        // Lectura de parámetros
├── Utils.gs             // Helpers: generación de IDs, validaciones, respuestas estándar
```

---

### Endpoints

Todos los endpoints pasan por `doGet()` y `doPost()`. Se usa un parámetro `action` para rutear.

#### doGet (lectura)

| action | Descripción | Parámetros |
|--------|-------------|------------|
| get_parametros | Lee todos los parámetros | - |
| get_establecimiento | Datos del establecimiento | establecimiento_id |
| get_dicose_propiedad | DICOSE Propiedad de un establecimiento | establecimiento_id |
| get_potreros | Potreros de un establecimiento | establecimiento_id |
| get_animales | Animales activos de un establecimiento | establecimiento_id, potrero_id, dicose_propiedad_id |
| get_animal | Ficha individual de un animal | animal_id o caravana_snig |
| get_stock | Stock actual por categoría | establecimiento_id |
| get_stock_potrero | Stock por potrero | establecimiento_id |
| get_stock_propiedad | Stock por DICOSE Propiedad | establecimiento_id |
| get_lotes_movimiento | Lotes de movimiento | establecimiento_id, tipo, limit |
| get_detalle_lote | Caravanas individuales de un lote | lote_movimiento_id |
| get_finanzas | Movimientos financieros | establecimiento_id, periodo, tipo |
| get_resumen_financiero | Totales por período | establecimiento_id, periodo |
| get_lotes_agricolas | Lotes agrícolas | establecimiento_id, zafra |
| get_labores | Labores de un lote agrícola | lote_id |
| get_dashboard | Datos consolidados para dashboard | establecimiento_id |

#### doPost (escritura)

| action | Descripción | Body (JSON) |
|--------|-------------|-------------|
| crear_establecimiento | Alta de establecimiento | {nombre, departamento, superficie_total, tipo, dicose_fisico, ...} |
| crear_dicose_propiedad | Alta de DICOSE Propiedad | {establecimiento_id, codigo, titular, tipo_titular} |
| crear_potrero | Alta de potrero | {establecimiento_id, nombre, superficie, uso_actual, ...} |
| crear_lote_movimiento | Crea el lote agrupador | {establecimiento_id, fecha, tipo_movimiento, subtipo, contraparte, origen_carga, ...} |
| crear_movimientos_lote | Crea N movimientos individuales | {lote_movimiento_id, animales: [{caravana_snig, sexo, edad_meses_ingreso, peso_kg, ...}]} |
| crear_finanza | Registro financiero | {establecimiento_id, fecha, tipo, rubro, concepto, monto, ...} |
| crear_lote_agricola | Alta de lote agrícola | {establecimiento_id, potrero_id, zafra, cultivo, ...} |
| crear_labor | Registro de labor | {lote_id, fecha, tipo_labor, ...} |
| editar_registro | Edición genérica | {hoja, id, campos: {campo: valor}} |
| desactivar_registro | Baja lógica | {hoja, id} |

#### Lógica de categorización en supabase

```javascript
// Animales.gs
function calcularCategoria(sexo, edad_meses_ingreso, fecha_ingreso, es_toro) {
  const mesesDesdeIngreso = calcularMesesTranscurridos(fecha_ingreso);
  const edadActual = edad_meses_ingreso + mesesDesdeIngreso;

  if (sexo === 'Macho') {
    if (es_toro) return edadActual >= 36 ? 'Toro' : 'Torito';
    if (edadActual < 12)  return 'Ternero';
    if (edadActual < 24)  return 'Novillo 1-2';
    if (edadActual < 36)  return 'Novillo 2-3';
    return 'Novillo +3';
  } else {
    if (edadActual < 12)  return 'Ternera';
    if (edadActual < 24)  return 'Vaquillona 1-2';
    if (edadActual < 36)  return 'Vaquillona +2';
    return 'Vaca de Invernada';
  }
}
```

---

### Formato de respuesta estándar

```json
{
  "success": true,
  "data": { ... },
  "message": "Registro creado correctamente",
  "id": "MOV-001"
}
```

```json
{
  "success": false,
  "error": "La caravana SNIG ya existe en el sistema",
  "field": "caravana_snig"
}
```

Para carga masiva desde Excel, el response incluye un resumen:

```json
{
  "success": true,
  "data": {
    "lote_id": "LMV-001",
    "procesados": 50,
    "errores": [
      { "fila": 12, "caravana": "858000099999999", "error": "Caravana duplicada" }
    ]
  }
}
```

### CORS

t requiere configuración especial para CORS. El deploy como web app con acceso "Anyone" evita la mayoría de problemas. Se usa `ContentService.createTextOutput()` con `setMimeType(ContentService.MimeType.JSON)`.

---

## Frontend - Estructura de componentes

```
src/
├── index.html
├── app.js                          // Router principal
├── services/
│   └── api.js                      // Wrapper fetch para Apps Script
├── components/
│   ├── Layout.js                   // Navbar inferior mobile-first, container
│   ├── Dashboard.js                // Vista principal con indicadores
│   ├── establecimiento/
│   │   ├── EstablecimientoForm.js  // Alta de establecimiento con dicose_fisico
│   │   ├── EstablecimientoView.js  // Vista del establecimiento
│   │   ├── DicosePropiedadForm.js  // Alta y listado de DICOSE Propiedad
│   │   └── PotreroForm.js          // Alta de potreros
│   ├── movimientos/
│   │   ├── MovimientoForm.js       // Formulario principal de lote de movimiento
│   │   ├── CaravanaForm.js         // Subformulario para ingresar caravanas individuales
│   │   ├── ExcelUpload.js          // Carga masiva de caravanas desde Excel
│   │   ├── MovimientoList.js       // Listado de lotes de movimiento
│   │   └── MovimientoDetalle.js    // Detalle de un lote: caravanas individuales
│   ├── stock/
│   │   └── StockView.js            // Stock por categoría, potrero y DICOSE Propiedad
│   ├── finanzas/
│   │   ├── FinanzaForm.js
│   │   └── FinanzaList.js
│   ├── agricultura/
│   │   ├── LoteForm.js
│   │   └── LaborForm.js
│   └── shared/
│       ├── Select.js               // Select dinámico desde parámetros
│       ├── SubtipoSelect.js        // Select de subtipo que reacciona al tipo elegido
│       ├── DatePicker.js
│       ├── NumberInput.js
│       ├── Toast.js                // Notificaciones
│       └── LoadingSpinner.js
├── utils/
│   ├── validators.js               // Validaciones: SNIG, DICOSE, superficie, etc.
│   ├── categorias.js               // Lógica de categorización automática (espejo del backend)
│   └── formatters.js               // Formato de números, fechas, moneda
└── styles/
    └── main.css
```

### Conexión con Apps Script

```javascript
// services/api.js
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/DEPLOY_ID/exec';

async function apiGet(action, params = {}) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  return res.json();
}

async function apiPost(action, data) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // Apps Script quirk: no acepta application/json
    body: JSON.stringify({ action, ...data })
  });
  return res.json();
}
```

**Nota importante**: Google Apps Script no soporta `Content-Type: application/json` en POST desde clientes web. Siempre se envía como `text/plain` y se parsea en el servidor con `JSON.parse(e.postData.contents)`. Esto no debe cambiarse.

### Validaciones en frontend (validators.js)

```javascript
// Caravana SNIG: 15 dígitos, empieza por 8580000
function validarCaravanaSNIG(valor) {
  return /^8580000\d{8}$/.test(valor);
}

// DICOSE Físico: exactamente 9 dígitos numéricos
function validarDicoseFisico(valor) {
  return /^\d{9}$/.test(valor);
}

// DICOSE Propiedad: 9 numéricos o 2 letras + 7 numéricos
function validarDicosePropiedad(valor) {
  return /^\d{9}$/.test(valor) || /^[A-Za-z]{2}\d{7}$/.test(valor);
}
```

### Formato del Excel para carga masiva de caravanas

El archivo Excel que sube el usuario debe tener estas columnas en orden:

| Columna | Tipo | Obligatorio | Descripción |
|---------|------|:-----------:|-------------|
| caravana_snig | texto | sí | 15 dígitos, empieza por 8580000 |
| sexo | texto | sí | Macho / Hembra |
| edad_meses | número | sí | Edad en meses a la fecha del movimiento |
| peso_kg | número | no | Peso en kg |

El frontend valida cada fila antes de enviar al backend. Las filas con errores se muestran al usuario para corrección antes de procesar.

---

## PWA - Configuración mínima

```json
{
  "name": "Campo Digital",
  "short_name": "CampoD",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a7f4b",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## Consideraciones de performance

- Apps Script tiene un tiempo de cold start de ~2-5 segundos en la primera request
- Cachear los parámetros en localStorage para evitar pedirlos en cada carga
- En carga masiva de Excel, enviar todas las caravanas del lote en un solo POST (no una request por animal)
- Limitar las consultas de movimientos a los últimos 50 lotes por defecto
- El stock se calcula filtrando animales activos en Sheets; si el volumen crece se puede agregar una hoja auxiliar de stock cacheado
