# Campo Digital - Visión del Sistema

## Qué es

Sistema web de gestión integral para establecimientos rurales (ganaderos, agrícolas o mixtos). Permite registrar y consultar toda la información operativa desde cualquier dispositivo y en cualquier lugar, dejando los datos disponibles para análisis externo.

## Problema que resuelve

La información del establecimiento vive dispersa: cuadernos, planillas sueltas, la cabeza del encargado, WhatsApps perdidos. Cuando hay que tomar una decisión (vender, comprar, sembrar, presupuestar), no hay datos limpios ni accesibles. Este sistema centraliza todo en un lugar simple, moderno y accesible desde el celular.

## Principios de diseño

- **Simplicidad ante todo** - formularios cortos, pocos campos obligatorios, cero fricción
- **Mobile-first** - pensado para usar desde el celular en el campo
- **Datos íntegros** - validaciones en base de datos, nunca stock negativo, nunca datos huérfanos
- **Nunca borrar** - los registros se desactivan, nunca se eliminan. La historia se preserva siempre
- **Escalable** - construido para crecer a multi-usuario, reportes avanzados e integraciones

## Arquitectura

```
Usuario (celular / PC / tablet)
  └── Next.js app (Vercel)
        ├── Supabase JS SDK → PostgreSQL (datos)
        ├── Supabase Auth → sesiones y usuarios (fase futura)
        └── Supabase Storage → archivos (fase futura)
```

### Componentes

- **Frontend**: Next.js + Tailwind CSS + shadcn/ui. Responsive, mobile-first. Hosting gratuito en Vercel.
- **Base de datos**: Supabase (PostgreSQL). 17 tablas normalizadas con FK, constraints y triggers.
- **Auth**: Supabase Auth (fase futura - actualmente un solo usuario).
- **Análisis externo**: Los datos en Supabase se pueden conectar con Power BI via PostgreSQL connector o con Python via psycopg2/sqlalchemy.

## Stack técnico

| Componente | Tecnología | Costo |
|-----------|-----------|-------|
| Frontend | Next.js + Tailwind CSS + shadcn/ui | Gratis |
| Base de datos | Supabase (PostgreSQL) | Gratis (hasta 500MB) |
| Hosting frontend | Vercel | Gratis |
| Control de versiones | Git + GitHub | Gratis |
| IDE de desarrollo | Google Antigravity | Gratis (preview) |

## Jerarquía espacial

```
Establecimiento
  └── Potrero (división permanente, alambrado fijo)
        └── Parcela (subdivisión temporal, ej: eléctrico) - opcional
```

- Un potrero puede no tener parcelas.
- Animales y lotes agrícolas se ubican en el nivel más fino disponible (potrero o parcela).
- Cuando un potrero tiene parcelas activas, los animales se asignan a nivel parcela.

## Módulos del sistema

### 1. Establecimiento
Datos maestros del campo y su estructura espacial: potreros y parcelas.

### 2. Stock Ganadero
Registro individual de animales con caravana SNIG. Movimientos (compra, venta, nacimiento, muerte, traslado, ajuste). El stock se calcula siempre desde los movimientos — nunca se guarda como número fijo.

### 3. Pesajes
Historial de pesajes individuales o por lote. Base para seguimiento de ganancia de peso.

### 4. Sanidad
Registro de vacunaciones, tratamientos y diagnósticos. Trazabilidad de productos con días de carencia.

### 5. Reproducción
Servicios, diagnósticos de preñez, partos, destetes. Registro individual o grupal.

### 6. Agricultura
Lotes agrícolas por zafra. Labores realizadas (siembra, fertilización, cosecha, etc.) con costos asociados.

### 7. Insumos
Inventario de insumos con trazabilidad de entradas y salidas. Alertas de stock mínimo.

### 8. Maquinaria
Inventario de maquinaria e implementos con historial de mantenimientos.

### 9. Finanzas
Ingresos y egresos con clasificación por rubro. Soporte USD y UYU.

### 10. Personal
Registro de empleados y contratistas del establecimiento.

### 11. Dashboard (fase futura)
Vista consolidada con indicadores clave: stock actual, saldo financiero, superficie sembrada, últimos eventos.

## Roadmap de módulos futuros

| Módulo | Tecnología prevista |
|--------|-------------------|
| Reportes y gráficos | Recharts o Tremor |
| Calendario + notificaciones | FullCalendar + Supabase Edge Functions |
| Gestión de usuarios y roles | Supabase Auth + RLS |
| Agente IA | Anthropic API con contexto de la BD |
| Chatbot WhatsApp | Twilio o Meta Cloud API + webhook Next.js |

## País de referencia

Uruguay. Parámetros pensados para el contexto uruguayo: departamentos, categorías ganaderas DICOSE, moneda USD/UYU. La estructura es adaptable a cualquier país.
