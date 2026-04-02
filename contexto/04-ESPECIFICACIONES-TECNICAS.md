# Campo Digital - Especificaciones Técnicas

## Google Apps Script - API Design

### Estructura del proyecto en Apps Script

```
├── Code.gs              // Entry points: doGet(), doPost()
├── Establecimientos.gs  // CRUD establecimientos y potreros
├── Stock.gs             // Movimientos ganaderos + cálculo de stock
├── Finanzas.gs          // Ingresos y egresos
├── Agricultura.gs       // Lotes y labores
├── Parametros.gs        // Lectura de parámetros
├── Utils.gs             // Helpers: generación de IDs, validaciones, respuestas
```

### Endpoints

Todos los endpoints pasan por `doGet()` y `doPost()`. Se usa un parámetro `action` para rutear.

#### doGet (lectura)

| action | Descripción | Parámetros opcionales |
|--------|-------------|----------------------|
| get_parametros | Lee todos los parámetros | - |
| get_establecimiento | Datos del establecimiento | establecimiento_id |
| get_potreros | Potreros de un establecimiento | establecimiento_id |
| get_movimientos | Últimos N movimientos | establecimiento_id, limit, tipo, categoria |
| get_stock | Stock actual por categoría | establecimiento_id |
| get_finanzas | Movimientos financieros | establecimiento_id, periodo, tipo |
| get_resumen_financiero | Totales por período | establecimiento_id, periodo |
| get_lotes | Lotes agrícolas | establecimiento_id, zafra |
| get_labores | Labores de un lote | lote_id |
| get_dashboard | Datos consolidados para dashboard | establecimiento_id |

#### doPost (escritura)

| action | Descripción | Body (JSON) |
|--------|-------------|-------------|
| crear_establecimiento | Alta de establecimiento | {nombre, departamento, superficie_total, tipo, ...} |
| crear_potrero | Alta de potrero | {establecimiento_id, nombre, superficie, uso_actual, ...} |
| crear_movimiento | Registro de movimiento ganadero | {establecimiento_id, fecha, tipo_movimiento, categoria, cantidad, ...} |
| crear_finanza | Registro financiero | {establecimiento_id, fecha, tipo, rubro, concepto, monto, ...} |
| crear_lote | Alta de lote agrícola | {establecimiento_id, potrero_id, zafra, cultivo, ...} |
| crear_labor | Registro de labor | {lote_id, fecha, tipo_labor, ...} |
| editar_registro | Edición genérica | {hoja, id, campos: {campo: valor}} |
| desactivar_registro | Baja lógica | {hoja, id} |

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
  "error": "El nombre del establecimiento ya existe",
  "field": "nombre"
}
```

### CORS

Apps Script requiere configuración especial para CORS. El deploy como web app con acceso "Anyone" evita la mayoría de problemas. Se usa `ContentService.createTextOutput()` con `setMimeType(ContentService.MimeType.JSON)`.

---

## Frontend - Estructura de componentes

```
src/
├── index.html
├── app.js                    // Router principal
├── services/
│   └── api.js                // Wrapper fetch para Apps Script
├── components/
│   ├── Layout.js             // Navbar, sidebar, container
│   ├── Dashboard.js          // Vista principal
│   ├── EstablecimientoForm.js
│   ├── EstablecimientoView.js
│   ├── PotreroForm.js
│   ├── MovimientoForm.js
│   ├── MovimientoList.js
│   ├── StockView.js
│   ├── FinanzaForm.js
│   ├── FinanzaList.js
│   ├── LoteForm.js
│   ├── LaborForm.js
│   └── shared/
│       ├── Select.js         // Select dinámico desde parámetros
│       ├── DatePicker.js
│       ├── NumberInput.js
│       ├── Toast.js          // Notificaciones
│       └── LoadingSpinner.js
├── utils/
│   ├── validators.js         // Validaciones de formulario
│   └── formatters.js         // Formato de números, fechas, moneda
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
    headers: { 'Content-Type': 'text/plain' }, // Apps Script quirk
    body: JSON.stringify({ action, ...data })
  });
  return res.json();
}
```

**Nota importante**: Google Apps Script no soporta `Content-Type: application/json` en POST desde clientes web. Se envía como `text/plain` y se parsea en el servidor con `JSON.parse(e.postData.contents)`.

---

## PWA - Configuración mínima

```json
// manifest.json
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
- Limitar las consultas de movimientos a los últimos 50 por defecto
- El cálculo de stock actual se puede cachear en una hoja auxiliar si el volumen de movimientos crece mucho
