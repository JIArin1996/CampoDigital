# Campo Digital - Documentación del Proyecto

Web app mobile-first de gestión, bitácora y calendario para establecimientos ganaderos administrados a distancia. Primer caso: Santa Remigia.

## Stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + shadcn/ui + Zod 4
- **Base de datos y auth**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **Control de versiones**: Git + GitHub

## Archivos de contexto

| Archivo | Contenido |
|---------|-----------|
| 00-ENFOQUE-V2.md | Enfoque del proyecto y decisiones tomadas, con el registro de cambios de decisión |
| MODELO-DE-DATOS-V2.md | Modelo de datos v2 (borrador): tablas, RLS, funciones y etapas de construcción |
| _archivo/ | Documentación obsoleta conservada como referencia (v1 con trazabilidad, borrador de Sheets) |

## Reglas de desarrollo

- TypeScript siempre
- Comentarios en español
- Mobile-first: uso a campo, desde el teléfono, con sol directo
- Nunca borrar registros: baja lógica con estado, y los eventos de stock se corrigen con eventos de ajuste
- shadcn/ui para componentes de UI
