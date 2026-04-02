# Campo Digital - Sistema de Gestión Rural

## Qué es

Sistema web liviano para gestionar establecimientos rurales (ganaderos, agrícolas o mixtos) de forma integral. Permite registrar información operativa desde cualquier dispositivo y deja los datos disponibles para análisis.

## Problema que resuelve

La información del establecimiento vive dispersa: cuadernos, planillas sueltas, la cabeza del encargado, WhatsApps perdidos. Cuando hay que tomar una decisión (vender, comprar, sembrar, presupuestar), no hay datos limpios ni accesibles. Este sistema centraliza todo en un lugar simple.

## Principios de diseño

- **Simplicidad ante todo** - formularios cortos, pocos campos obligatorios, cero fricción
- **Mobile-first** - pensado para usar desde el celular en el campo
- **Datos abiertos** - Google Sheets como base de datos, siempre accesible para análisis externo
- **Costo cero** - toda la infraestructura sobre servicios gratuitos de Google
- **Baja lógica, nunca borrar** - los registros se desactivan, nunca se eliminan. La historia se preserva siempre

## Arquitectura

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   Frontend (App)    │────>│  Google Apps Script   │────>│   Google Sheets     │
│   React / HTML      │<────│  (API intermedia)     │<────│   (Base de datos)   │
│   PWA mobile-first  │     │  Endpoints REST       │     │   1 spreadsheet     │
└─────────────────────┘     └──────────────────────┘     │   por establecim.   │
                                                          └─────────────────────┘
         │                                                          │
         v                                                          v
┌─────────────────────┐                               ┌─────────────────────┐
│   Dashboard         │                               │   Análisis externo  │
│   (dentro de la app)│                               │   Power BI / Python │
└─────────────────────┘                               └─────────────────────┘
```

### Componentes

- **Frontend**: React (o HTML simple). Responsive, mobile-first. Puede ser una PWA para instalar en el celular. Hosting gratuito en GitHub Pages o Vercel.
- **Backend**: Google Apps Script como API intermedia. Recibe datos del formulario via fetch/POST y escribe en Sheets. Cero costo de servidor.
- **Base de datos**: Google Sheets. Cada hoja es una tabla. Estructura normalizada con IDs para cruzar datos entre hojas.
- **Análisis**: Los datos en Sheets quedan disponibles para conectar con Power BI, Python (pandas/gspread) o análisis directo en Sheets.

## Módulos del sistema

### 1. Establecimiento (base)
Datos maestros del campo: nombre, superficie, ubicación, tipo, potreros.
Es la "ficha técnica" y el punto de partida para todos los demás módulos.

### 2. Stock ganadero
Existencias por categoría. Movimientos: compras, ventas, nacimientos, muertes, traslados entre potreros. Permite saber en todo momento cuántos animales hay, dónde están y cómo evolucionó el rodeo.

### 3. Agricultura
Lotes, cultivos, labores realizadas (siembra, fertilización, cosecha). Seguimiento por zafra. Registro de insumos y costos por labor.

### 4. Finanzas
Registro de ingresos y egresos. Clasificación por rubro y asociación al establecimiento. Permite ver el flujo de caja y la rentabilidad por actividad.

### 5. Dashboard
Resumen visual: stock actual, últimos movimientos, saldo financiero, indicadores clave por período. Vista automática, sin carga manual.

## Usuarios objetivo

- Productores rurales que manejan 1 a 5 establecimientos
- Encargados de campo que necesitan registrar información desde el terreno
- Asesores técnicos que necesitan datos consolidados para tomar decisiones
- Administradores de fideicomisos ganaderos

## País de referencia

Uruguay. Los parámetros (departamentos, categorías ganaderas, DICOSE) están pensados para el contexto uruguayo, pero la estructura es adaptable a cualquier país.
