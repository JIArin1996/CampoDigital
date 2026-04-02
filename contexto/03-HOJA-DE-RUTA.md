# Campo Digital - Hoja de Ruta de Desarrollo

## Visión general del roadmap

El desarrollo sigue un enfoque incremental por fases. Cada fase entrega valor funcional completo (se puede usar desde el día 1 de cada fase). No se avanza a la siguiente fase hasta que la anterior esté estable.

---

## Fase 1 - Fundación + Stock Ganadero (MVP)

**Objetivo**: Tener la estructura base y poder registrar movimientos ganaderos desde el celular.

**Duración estimada**: 1-2 semanas

### Tareas

#### 1.1 Infraestructura base
- [ ] Crear spreadsheet en Google Sheets con las hojas: establecimientos, potreros, movimientos_ganado, parametros
- [ ] Poblar hoja de parámetros con valores iniciales (categorías, departamentos, tipos de movimiento, etc.)
- [ ] Crear proyecto en Google Apps Script vinculado al spreadsheet
- [ ] Implementar endpoint `doPost()` en Apps Script para recibir datos vía fetch
- [ ] Implementar endpoint `doGet()` para leer datos (parámetros, stock actual, últimos movimientos)
- [ ] Testear endpoints con Postman o curl

#### 1.2 Frontend - Estructura base
- [ ] Inicializar proyecto React (o HTML + vanilla JS)
- [ ] Definir layout principal: navegación, módulos, estado de conexión
- [ ] Implementar servicio de conexión con Apps Script (fetch wrapper)
- [ ] Diseño mobile-first, responsive
- [ ] Configurar como PWA (manifest.json, service worker básico)

#### 1.3 Módulo Establecimiento
- [ ] Formulario de alta de establecimiento (nombre, departamento, superficie, tipo)
- [ ] Listado de establecimientos (solo 1 por ahora, pero la estructura soporta N)
- [ ] Formulario de alta de potreros vinculados al establecimiento
- [ ] Validaciones: nombre único, superficie > 0, suma potreros ≤ total
- [ ] Visualización de datos del establecimiento y sus potreros

#### 1.4 Módulo Stock Ganadero
- [ ] Formulario de registro de movimientos (tipo, categoría, cantidad, peso, potrero, precio)
- [ ] Validaciones: campos obligatorios, cantidad > 0, traslado con origen/destino
- [ ] Listado de últimos movimientos (últimos 20, con filtros por tipo y categoría)
- [ ] Cálculo de stock actual por categoría (suma de movimientos)
- [ ] Vista de stock por potrero

#### 1.5 Deploy
- [ ] Publicar Apps Script como web app
- [ ] Deploy frontend en GitHub Pages o Vercel
- [ ] Test end-to-end: cargar datos desde celular, verificar en Sheets

### Entregable
App funcional donde se puede dar de alta un establecimiento con potreros y registrar movimientos ganaderos. Los datos se ven en Google Sheets en tiempo real.

---

## Fase 2 - Finanzas

**Objetivo**: Registrar ingresos y egresos, ver flujo de caja básico.

**Duración estimada**: 1 semana

### Tareas

#### 2.1 Backend
- [ ] Agregar hoja "finanzas" al spreadsheet
- [ ] Crear endpoints en Apps Script para CRUD de finanzas
- [ ] Endpoint para resumen financiero (total ingresos, total egresos, saldo por período)

#### 2.2 Frontend
- [ ] Formulario de registro de ingreso/egreso (fecha, tipo, rubro, concepto, monto)
- [ ] Listado de movimientos financieros con filtros (tipo, rubro, período)
- [ ] Vista de resumen: total ingresos, total egresos, saldo
- [ ] Opción de vincular un registro financiero a un movimiento ganadero existente

### Entregable
Se pueden registrar todas las operaciones financieras del campo y ver un resumen de caja.

---

## Fase 3 - Agricultura

**Objetivo**: Gestionar lotes agrícolas y registrar labores por zafra.

**Duración estimada**: 1 semana

### Tareas

#### 3.1 Backend
- [ ] Agregar hojas "lotes_agricolas" y "labores" al spreadsheet
- [ ] Endpoints para CRUD de lotes y labores
- [ ] Endpoint para resumen por zafra (superficie, cultivos, costos)

#### 3.2 Frontend
- [ ] Formulario de alta de lote agrícola (potrero, zafra, cultivo, superficie)
- [ ] Formulario de registro de labores (tipo, insumo, dosis, costo)
- [ ] Listado de lotes por zafra con estado
- [ ] Historial de labores por lote
- [ ] Filtro de potreros por uso "Agricultura" al crear lotes

### Entregable
Se puede registrar la actividad agrícola completa: qué se sembró, qué se hizo, cuánto costó.

---

## Fase 4 - Dashboard

**Objetivo**: Tener una vista consolidada del establecimiento con indicadores clave.

**Duración estimada**: 1 semana

### Tareas

#### 4.1 Indicadores ganaderos
- [ ] Stock actual total y por categoría
- [ ] Últimos 5 movimientos
- [ ] Carga animal (cabezas/ha)
- [ ] Variación de stock último mes

#### 4.2 Indicadores financieros
- [ ] Saldo del mes actual
- [ ] Ingresos vs egresos (último trimestre)
- [ ] Top 3 rubros de egreso
- [ ] Gráfico simple de evolución mensual

#### 4.3 Indicadores agrícolas
- [ ] Superficie sembrada zafra actual
- [ ] Lotes en curso vs cosechados
- [ ] Costo total por hectárea

#### 4.4 UX del dashboard
- [ ] Vista principal al abrir la app
- [ ] Accesos directos a carga rápida desde el dashboard
- [ ] Refresh manual y auto-refresh cada 5 minutos

### Entregable
Al abrir la app, el usuario ve de un vistazo cómo está su campo.

---

## Fase 5 - Mejoras y escalado (post-MVP)

Ideas para iterar después del MVP funcional:

- Soporte multi-establecimiento real (selector de campo)
- Exportación a PDF de reportes básicos
- Notificaciones (vacunas pendientes, vencimientos)
- Integración con GIS (geolocalización de potreros)
- Conexión con Power BI para dashboards avanzados
- Sistema de usuarios y permisos (si se comparte con encargados)
- Modo offline con sincronización posterior
- API para integración con otros sistemas (SNIG, DICOSE)

---

## Stack técnico confirmado

| Componente | Tecnología | Costo |
|-----------|-----------|-------|
| Frontend | React + Tailwind (o HTML/CSS/JS vanilla) | Gratis |
| Backend/API | Google Apps Script | Gratis |
| Base de datos | Google Sheets | Gratis |
| Hosting frontend | GitHub Pages o Vercel | Gratis |
| IDE de desarrollo | Google Antigravity | Gratis (preview) |
| Control de versiones | Git + GitHub | Gratis |

---

## Criterios de "terminado" por fase

Una fase se considera terminada cuando:
1. Todos los formularios funcionan y guardan datos en Sheets correctamente
2. Las validaciones impiden datos inválidos
3. Se puede usar desde el celular sin problemas
4. Los datos en Sheets están limpios y son analizables
5. Se hizo al menos un test end-to-end real (no solo en desarrollo)
