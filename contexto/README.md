# Campo Digital - Documentación del Proyecto

Sistema web de gestión integral para establecimientos rurales. Desarrollado para Uruguay, adaptable a cualquier país.

## Stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + shadcn/ui + Zod 4
- **Base de datos**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **Control de versiones**: Git + GitHub

## Archivos de contexto

| Archivo | Contenido |
|---------|-----------|
| 01-VISION-DEL-SISTEMA.md | Qué es, arquitectura, stack, módulos, roadmap futuro |
| 02-MODELO-DE-DATOS.md | Las 17 tablas, campos, relaciones, validaciones, triggers |
| 03-HOJA-DE-RUTA.md | Fases de desarrollo, tareas pendientes, estado actual |
| 04-ESPECIFICACIONES-TECNICAS.md | Estructura del proyecto, patrones de código, queries |
| 05-PROMPT-DE-INICIO.md | Prompts listos para trabajar con agentes de IA |

## Cómo usar con un agente de IA

1. Abrí Google Antigravity (o el agente que uses)
2. Asegurate de que tenga acceso a esta carpeta `contexto/`
3. Copiá el prompt correspondiente de `05-PROMPT-DE-INICIO.md`
4. Pegalo como primera instrucción

## Estado del proyecto

### Base de datos (Supabase) ✓
17 tablas creadas con todas las relaciones, constraints y triggers:
- establecimientos, potreros, parcelas
- animales, movimientos_ganado, pesajes, sanidad, reproduccion
- lotes_agricolas, labores_agricolas
- stock_insumos, movimientos_insumos
- stock_maquinaria, mantenimiento_maquinaria
- finanzas, personal, parametros

### Frontend (Next.js) - En progreso
- [ ] Setup inicial del proyecto
- [ ] Conexión con Supabase
- [ ] Módulo Establecimiento
- [ ] Módulo Animales + Stock Ganadero

## Jerarquía espacial

```
Establecimiento
  └── Potrero (alambrado fijo)
        └── Parcela (subdivisión eléctrica, opcional)
```

Los animales y lotes agrícolas se ubican en potrero O parcela (nunca los dos simultáneamente).

## Reglas de desarrollo

- TypeScript siempre
- Comentarios en español
- Mobile-first
- Nunca borrar registros (baja lógica con estado = inactivo)
- Todos los selects desde la tabla `parametros` de Supabase
- shadcn/ui para componentes de UI
