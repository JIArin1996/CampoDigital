# Campo Digital - Hoja de Ruta de Desarrollo

## Visión general del roadmap

El desarrollo sigue un enfoque incremental por fases. Cada fase entrega valor funcional completo (se puede usar desde el día 1 de cada fase). No se avanza a la siguiente fase hasta que la anterior esté estable.

---

## Fase 1 - Fundación + Stock Ganadero (MVP)

**Objetivo**: Tener la estructura base y poder registrar movimientos ganaderos por caravana individual desde el celular.

**Duración estimada**: 2-3 semanas

### Tareas

#### 1.1 Infraestructura base (Google Sheets + Apps Script)
- [ ] Crear spreadsheet en Google Sheets con todas las hojas del modelo: establecimientos, dicose_propiedad, potreros, animales, movimientos_ganado, lotes_movimiento, parametros
- [ ] Poblar hoja de parámetros con valores iniciales (ver 02-MODELO-DE-DATOS.md): categorias_ganado, departamentos, tipos_movimiento, subtipos, tipos_titular, tipos_pastura, etc.
- [ ] Crear proyecto en Google Apps Script vinculado al spreadsheet
- [ ] Implementar endpoint `doGet()` para lectura (parámetros, establecimiento, potreros, animales, stock, movimientos)
- [ ] Implementar endpoint `doPost()` para escritura (crear establecimiento, dicose_propiedad, potrero, animal, movimiento, lote_movimiento)
- [ ] Implementar lógica de categorización automática en Apps Script (función que recibe sexo + edad_meses_ingreso + fecha_ingreso y devuelve categoría)
- [ ] Testear endpoints con Postman o curl

#### 1.2 Frontend - Estructura base
- [ ] Inicializar proyecto React + Tailwind CSS
- [ ] Definir layout principal: navegación inferior mobile-first, módulos, estado de conexión
- [ ] Implementar servicio de conexión con Apps Script (fetch wrapper en api.js)
- [ ] Cachear parámetros en localStorage al primer uso
- [ ] Configurar como PWA (manifest.json, service worker básico)

#### 1.3 Módulo Establecimiento
- [ ] Formulario de alta de establecimiento (nombre, departamento, superficie, tipo, dicose_fisico)
- [ ] Validación de DICOSE Físico: exactamente 9 dígitos numéricos
- [ ] Formulario de alta de DICOSE Propiedad vinculado al establecimiento (código, titular, tipo_titular)
- [ ] Validación de DICOSE Propiedad: 9 caracteres numéricos o 2 letras + 7 números
- [ ] Soporte para múltiples DICOSE Propiedad por establecimiento
- [ ] Formulario de alta de potreros vinculados al establecimiento
- [ ] Validaciones: nombre único, superficie > 0, suma potreros ≤ total
- [ ] Vista del establecimiento: datos maestros, DICOSE Propiedad asociados, potreros

#### 1.4 Módulo Movimientos Ganaderos
- [ ] Formulario de registro de lote de movimiento (fecha, tipo, subtipo, contraparte, potrero destino, dicose_propiedad)
- [ ] Subformulario para ingresar caravanas individuales dentro del lote (caravana_snig, sexo, edad_meses_ingreso, peso)
- [ ] Validación de caravana SNIG: 15 dígitos, empieza por 8580000, única en el sistema
- [ ] Carga masiva de caravanas desde archivo Excel dentro del formulario de movimiento
  - [ ] Definir formato de columnas esperado en el Excel (caravana_snig, sexo, edad_meses, peso)
  - [ ] Parsear el Excel en el frontend y validar cada fila antes de enviar
  - [ ] Mostrar errores por fila si hay caravanas inválidas o duplicadas
- [ ] Categoría calculada automáticamente y mostrada al ingresar cada animal (no editable, salvo marca de toro/torito)
- [ ] Tipos de movimiento con subtipos dinámicos:
  - Ingreso: Nacimiento / Compra
  - Egreso: Venta a Productor / Venta a Frigorífico / Venta en Consignación / Muerte
  - Traslado: Traslado entre Establecimientos
  - Afectación: Afectación a Fideicomiso
- [ ] Listado de lotes de movimiento con resumen (fecha, tipo, cantidad de animales, contraparte)
- [ ] Detalle de un lote: lista de caravanas individuales con categoría y peso

#### 1.5 Vista de Stock
- [ ] Stock actual por categoría (derivado de animales con estado = activo)
- [ ] Stock por potrero
- [ ] Stock por DICOSE Propiedad
- [ ] Filtros: por categoría, por potrero, por DICOSE Propiedad

#### 1.6 Deploy
- [ ] Publicar Apps Script como web app
- [ ] Deploy frontend en GitHub Pages o Vercel
- [ ] Test end-to-end: cargar datos desde celular, verificar en Sheets

### Entregable
App funcional donde se puede configurar un establecimiento con sus DICOSE y potreros, registrar movimientos ganaderos por caravana individual (manual o desde Excel), y ver el stock actual desglosado por categoría, potrero y propietario.

---

## Fase 2 - Finanzas

**Objetivo**: Registrar ingresos y egresos, ver flujo de caja básico.

**Duración estimada**: 1 semana

### Tareas

#### 2.1 Backend
- [ ] Agregar hoja "finanzas" al spreadsheet
- [ ] Endpoints en Apps Script para CRUD de finanzas
- [ ] Endpoint para resumen financiero (total ingresos, total egresos, saldo por período)

#### 2.2 Frontend
- [ ] Formulario de registro de ingreso/egreso (fecha, tipo, rubro, concepto, monto, forma_pago)
- [ ] Opción de vincular el registro financiero a un lote de movimiento existente
- [ ] Listado de movimientos financieros con filtros (tipo, rubro, período)
- [ ] Vista de resumen: total ingresos, total egresos, saldo

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
- [ ] Últimos 5 lotes de movimiento
- [ ] Carga animal (cabezas/ha)
- [ ] Stock por DICOSE Propiedad (útil para fideicomisos)

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
- Recalculo masivo de categorías por lote (para cuando cambia la fecha y hay que actualizar el rodeo)
- Notificaciones (vacunas pendientes, declaración DICOSE anual)
- Integración con GIS (geolocalización de potreros)
- Conexión con Power BI para dashboards avanzados
- Sistema de usuarios y permisos (si se comparte con encargados)
- Modo offline con sincronización posterior
- Importación directa desde SNIG o DICOSE

---

## Stack técnico confirmado

| Componente | Tecnología | Costo |
|-----------|-----------|-------|
| Frontend | React + Tailwind CSS | Gratis |
| Backend / API | Google Apps Script | Gratis |
| Base de datos | Google Sheets | Gratis |
| Hosting frontend | GitHub Pages o Vercel | Gratis |
| IDE de desarrollo | Google Antigravity | Gratis (preview) |
| Control de versiones | Git + GitHub | Gratis |

---

## Criterios de "terminado" por fase

Una fase se considera terminada cuando:
1. Todos los formularios funcionan y guardan datos en Sheets correctamente
2. Las validaciones impiden datos inválidos (caravana SNIG, DICOSE, superficie, etc.)
3. Se puede usar desde el celular sin problemas
4. Los datos en Sheets están limpios y son analizables
5. Se hizo al menos un test end-to-end real (no solo en desarrollo)
