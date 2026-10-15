# Campo Digital

Web app mobile-first para la gestión y coordinación de **Santa Remigia**, un establecimiento familiar de ganadería de carne, ovinos y forestación tercerizada, administrado a distancia por dos hermanos.

El foco es saber qué pasa en el campo: stock por lote y categoría, actividades realizadas, bitácora de decisiones y tareas con avisos dentro de la app. La trazabilidad SNIG/DICOSE por caravana individual se eliminó; su código queda en el tag git `pre-v2-trazabilidad`.

> El cambio de enfoque se documenta en `contexto/00-ENFOQUE-V2.md`.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, shadcn/ui (Base UI), lucide-react |
| Formularios y validación | react-hook-form 7 + Zod 4 |
| Base de datos y auth | Supabase (PostgreSQL, `@supabase/ssr` + `@supabase/supabase-js` 2) |
| Hosting | Vercel |
| Lenguaje | TypeScript (strict) |

> Next.js 16 tiene cambios incompatibles con versiones anteriores. Antes de escribir código, consultá la guía en `frontend/node_modules/next/dist/docs/` (ver `frontend/AGENTS.md`).

---

## Estructura

```
CampoDigital/
├── contexto/              # Documentación funcional y técnica
│   └── _archivo/          # Borradores obsoletos conservados como referencia
├── supabase/
│   └── migrations/        # Esquema de la base versionado (migraciones por etapa)
└── frontend/              # App Next.js
    ├── app/               # Rutas (App Router)
    ├── components/        # Componentes por módulo + ui/ (shadcn)
    ├── lib/
    │   ├── queries/       # Acceso a Supabase por tabla
    │   ├── supabase/      # Clientes browser y server
    │   ├── context/       # Contexto del establecimiento activo
    │   └── utils.ts       # Utilidades generales (cn)
    └── types/             # Tipos TypeScript de las tablas
```

---

## Desarrollo local

Requisitos: Node.js 20 o superior y npm.

```powershell
cd frontend
npm install
# Crear frontend\.env.local con:
#   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
npm run dev
```

La app queda en http://localhost:3000.

Otros scripts (desde `frontend/`):

| Comando | Qué hace |
|---|---|
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run lint` | ESLint |

Los archivos `.env*` están ignorados por git y nunca se commitean.

---

## Base de datos

- El esquema vive en Supabase y se versiona en `supabase/migrations/`. La primera migración borra el esquema `public` entero; el esquema nuevo se agrega por etapas.
- No se ejecuta `supabase db push` ni `migration repair` contra producción sin una decisión explícita.

---

## Estado actual

| Módulo | Estado |
|---|---|
| Establecimientos y potreros | Funcional sobre el esquema viejo; se recrea en el esquema nuevo (Etapa 3) |
| Autenticación, roles (editor / lector) y RLS | Por construir (Etapa 3) |
| Lotes, bitácora, actividades, economía por rubro, tareas | Por construir (Etapas 5 a 8) |

---

## Convenciones

- TypeScript siempre; comentarios en español.
- Mobile-first.
- Baja lógica (`estado`) en lugar de borrar registros.
- Las listas simples de los selects salen de la tabla `parametros`; lo que tiene relaciones (especies, categorías, rubros, personas) va en catálogos por establecimiento.
- Componentes de UI con shadcn/ui.
