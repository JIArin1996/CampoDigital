-- Campo Digital v2 — Reseteo del esquema public
--
-- Borra TODO el esquema public (tablas, vistas, funciones, triggers y datos) y lo
-- recrea vacío, con los permisos estándar de Supabase. Los datos actuales son solo
-- de prueba y la trazabilidad (SNIG/DICOSE) se elimina a propósito: ver
-- contexto/00-ENFOQUE-V2.md, sección "Registro de cambios de decisión".
--
-- El código de la versión con trazabilidad queda en el tag git pre-v2-trazabilidad.
-- No hay respaldo del esquema viejo (decisión del 2026-10-15).
--
-- No toca los esquemas de Supabase (auth, storage, extensions, etc.).
-- Si algún objeto de otro esquema depende de public (por ejemplo, un trigger en
-- auth.users que llame a una función de public), CASCADE también lo borra.
--
-- El esquema nuevo se crea en la migración siguiente (Etapa 3).

begin;

drop schema if exists public cascade;

create schema public;

comment on schema public is 'standard public schema';

-- Permisos estándar de Supabase sobre el esquema
grant usage on schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

commit;
