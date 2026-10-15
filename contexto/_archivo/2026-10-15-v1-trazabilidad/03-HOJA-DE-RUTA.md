# Campo Digital - Hoja de Ruta de Desarrollo

## Visión general

Desarrollo incremental por fases. Cada fase entrega valor funcional completo. No se avanza a la siguiente hasta que la anterior esté estable y testeada.

---

## Estado actual

- [x] Modelo de datos definido (17 tablas)
- [x] Base de datos creada en Supabase (PostgreSQL)
- [x] Triggers y validaciones de integridad activos
- [x] Stack técnico definido: Next.js + Tailwind + shadcn/ui + Supabase
- [ ] Proyecto Next.js inicializado
- [ ] Conexión frontend ↔ Supabase

---

## Fase 1 - Fundación + Establecimiento + Stock Ganadero (MVP)

**Objetivo**: Poder registrar un establecimiento con su estructura y movimientos ganaderos desde el celular.

**Duración estimada**: 2 semanas

### 1.1 Setup del proyecto
- [ ] Inicializar proyecto Next.js con Tailwind CSS y shadcn/ui
- [ ] Configurar variables de entorno para Supabase
- [ ] Implementar cliente Supabase en el frontend
- [ ] Layout principal: navegación, sidebar, estructura responsive
- [ ] Deploy inicial en Vercel (vacío pero funcional)

### 1.2 Módulo Establecimiento
- [ ] Formulario de alta de establecimiento
- [ ] Vista de detalle del establecimiento
- [ ] Formulario de alta de potreros
- [ ] Formulario de alta de parcelas (dentro de un potrero)
- [ ] Vista de estructura: establecimiento → potreros → parcelas
- [ ] Validaciones: superficie, nombre único

### 1.3 Módulo Animales
- [ ] Formulario de alta de animal individual (caravana SNIG)
- [ ] Listado de animales con filtros (categoría, estado, potrero/parcela)
- [ ] Vista de ficha individual del animal
- [ ] Baja lógica de animal (vendido/muerto/transferido)

### 1.4 Módulo Stock Ganadero
- [ ] Formulario de registro de movimiento (compra, venta, nacimiento, muerte, traslado, ajuste)
- [ ] Listado de movimientos con filtros
- [ ] Vista de stock actual por categoría y por ubicación
- [ ] Historial de movimientos por animal individual

### 1.5 Parámetros
- [ ] Servicio para leer parámetros desde Supabase
- [ ] Cache en memoria para evitar consultas repetidas
- [ ] Todos los selects de la app alimentados desde parametros

### Entregable fase 1
App funcional donde se puede registrar un establecimiento con potreros/parcelas, dar de alta animales con SNIG y registrar movimientos ganaderos. Stock calculado en tiempo real desde los movimientos.

---

## Fase 2 - Sanidad, Pesajes y Reproducción

**Objetivo**: Gestión completa del rodeo más allá del stock.

**Duración estimada**: 1-2 semanas

### Tareas
- [ ] Formulario de registro de evento sanitario (individual y grupal)
- [ ] Historial sanitario por animal
- [ ] Alerta de días de carencia activos
- [ ] Formulario de pesaje (individual y por lote)
- [ ] Historial de pesos y curva de evolución
- [ ] Formulario de evento reproductivo
- [ ] Historial reproductivo por vaca
- [ ] Indicadores: % preñez, intervalo parto-concepción

### Entregable fase 2
Trazabilidad completa de cada animal: dónde está, cuánto pesa, qué vacunas tiene, si está preñada.

---

## Fase 3 - Finanzas

**Objetivo**: Registrar todos los ingresos y egresos y ver el flujo de caja.

**Duración estimada**: 1 semana

### Tareas
- [ ] Formulario de ingreso/egreso
- [ ] Listado de movimientos financieros con filtros (tipo, rubro, período)
- [ ] Vista de resumen: total ingresos, total egresos, saldo
- [ ] Soporte USD y UYU con tipo de cambio
- [ ] Vinculación de registros financieros a movimientos ganaderos

### Entregable fase 3
Registro completo de la actividad financiera del campo con vista de saldo.

---

## Fase 4 - Agricultura

**Objetivo**: Gestionar lotes agrícolas y labores por zafra.

**Duración estimada**: 1-2 semanas

### Tareas
- [ ] Formulario de alta de lote agrícola (potrero/parcela, zafra, cultivo)
- [ ] Formulario de registro de labor (tipo, insumo, dosis, costo)
- [ ] Listado de lotes por zafra con estado
- [ ] Historial de labores por lote
- [ ] Costo total por hectárea por lote

### Entregable fase 4
Registro completo de la actividad agrícola: qué se sembró, qué se hizo, cuánto costó.

---

## Fase 5 - Insumos y Maquinaria

**Objetivo**: Inventario y trazabilidad de insumos y maquinaria.

**Duración estimada**: 1 semana

### Tareas
- [ ] ABM de insumos con stock calculado desde movimientos
- [ ] Registro de entradas y salidas de insumos
- [ ] Alerta de stock mínimo
- [ ] ABM de maquinaria
- [ ] Registro de mantenimientos
- [ ] Alerta de próximo service por horas

### Entregable fase 5
Inventario completo de insumos y maquinaria con trazabilidad de uso.

---

## Fase 6 - Dashboard

**Objetivo**: Vista consolidada con indicadores clave al abrir la app.

**Duración estimada**: 1 semana

### Tareas
- [ ] Stock actual total y por categoría
- [ ] Últimos 5 movimientos ganaderos
- [ ] Saldo financiero del mes
- [ ] Superficie sembrada zafra actual
- [ ] Insumos bajo stock mínimo
- [ ] Maquinaria fuera de servicio
- [ ] Accesos directos a carga rápida

### Entregable fase 6
Al abrir la app, el usuario ve de un vistazo cómo está su campo.

---

## Fase 7 - Módulos avanzados (post-MVP)

- [ ] Gestión de usuarios y roles (Supabase Auth + RLS)
- [ ] Multi-establecimiento real con selector
- [ ] Módulo de reportes con gráficos (Recharts / Tremor)
- [ ] Calendario con notificaciones automáticas (FullCalendar + Edge Functions)
- [ ] Exportación a PDF
- [ ] Agente IA con contexto de la base de datos
- [ ] Chatbot WhatsApp (Twilio o Meta Cloud API)
- [ ] Integración GIS para geolocalización de potreros
- [ ] Modo offline con sincronización posterior

---

## Criterios de "terminado" por fase

Una fase se considera terminada cuando:
1. Todos los formularios funcionan y guardan datos en Supabase correctamente
2. Las validaciones impiden datos inválidos (tanto en frontend como en BD)
3. Se puede usar desde el celular sin problemas
4. Se hizo al menos un test end-to-end real
5. El código está commiteado en GitHub
