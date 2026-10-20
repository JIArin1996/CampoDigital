-- Campo Digital v2 — Auditoría de permisos del esquema public
--
-- Cuatro consultas de solo lectura: no modifican nada. Correrlas en el SQL Editor de
-- Supabase, una por vez, después de aplicar las migraciones (y después de cada etapa
-- que agregue tablas o funciones). Debajo de cada una está el resultado esperado.
--
--   1. RLS activado en todas las tablas y vistas con security_invoker
--   2. Políticas: ninguna de delete, ninguna para anon ni public
--   3. Permisos (GRANT) sobre tablas y columnas para anon, authenticated y public
--   4. Funciones: search_path fijo, security definer donde corresponde y permisos de execute


-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tablas sin RLS y vistas sin security_invoker
-- ════════════════════════════════════════════════════════════════════════════
-- ESPERADO: 0 filas.
-- Una fila acá significa una tabla expuesta sin filtro por establecimiento, o una
-- vista que se saltea el RLS de sus tablas.

select 'tabla sin RLS' as problema, c.relname as objeto
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
union all
select 'vista sin security_invoker', c.relname
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'v'
  and coalesce(array_to_string(c.reloptions, ','), '') !~ 'security_invoker=(true|on|1)'
union all
select 'vista materializada (no admite RLS)', c.relname
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'm'
order by 1, 2;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Políticas fuera de regla
-- ════════════════════════════════════════════════════════════════════════════
-- ESPERADO: 0 filas.
-- Regla: ninguna política de delete (ni "ALL", que incluye delete) y todas solo para
-- authenticated (ninguna para anon ni public).

select p.tablename, p.policyname, p.cmd, p.roles
from pg_policies p
where p.schemaname = 'public'
  and (p.cmd in ('DELETE', 'ALL') or p.roles <> array['authenticated']::name[])
order by 1, 2;

-- Para ver el listado completo de políticas (informativo, no tiene resultado "esperado"):
-- select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 3;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. Permisos sobre tablas y columnas
-- ════════════════════════════════════════════════════════════════════════════
-- Lista todo permiso de anon, authenticated o public que no sea "authenticated: select".
--
-- ESPERADO (después de especies con color): exactamente estas 13 filas, todas de authenticated y a nivel columna.
-- (La bitácora y las actividades no agregan permisos de escritura: se escribe solo por funciones. Especies suma las
-- columnas grupo (6b-1) y color, que siguen limitadas al administrador por las políticas.)
-- Cualquier fila "tabla" (por ejemplo un delete o un insert sobre toda la tabla) o
-- cualquier fila de anon o PUBLIC es un error.
--
--   nivel   | grantee       | tabla               | permiso | columnas
--   --------+---------------+---------------------+---------+------------------------------------------------
--   columna | authenticated | categorias_animales | INSERT  | activo, especie_id, establecimiento_id, nombre, orden
--   columna | authenticated | categorias_animales | UPDATE  | activo, nombre, orden
--   columna | authenticated | especies            | INSERT  | activo, color, establecimiento_id, grupo, nombre
--   columna | authenticated | especies            | UPDATE  | activo, color, grupo, nombre
--   columna | authenticated | establecimientos    | UPDATE  | departamento, dicose, estado, fecha_alta, localidad, nombre,
--           |               |                     |         | observaciones, paraje, propietario, rut, sistema_productivo, superficie_total
--   columna | authenticated | lotes               | UPDATE  | campana, nombre, notas, potrero_id
--   columna | authenticated | perfiles            | UPDATE  | apellido, celular, foto_path, nombre
--   columna | authenticated | personas            | INSERT  | activo, establecimiento_id, nombre, rol, user_id
--   columna | authenticated | personas            | UPDATE  | activo, nombre, rol, user_id
--   columna | authenticated | potreros            | INSERT  | aguada, establecimiento_id, estado, nombre, observaciones,
--           |               |                     |         | sombra, superficie, tipo_pastura, uso_actual
--   columna | authenticated | potreros            | UPDATE  | aguada, estado, nombre, observaciones, sombra, superficie,
--           |               |                     |         | tipo_pastura, uso_actual
--   columna | authenticated | rubros              | INSERT  | activo, establecimiento_id, nombre
--   columna | authenticated | rubros              | UPDATE  | activo, nombre

select 'tabla' as nivel, g.grantee, g.table_name as tabla, g.privilege_type as permiso, null as columnas
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.grantee in ('anon', 'authenticated', 'PUBLIC')
  and not (g.grantee = 'authenticated' and g.privilege_type = 'SELECT')
union all
select 'columna', cp.grantee, cp.table_name, cp.privilege_type,
       string_agg(cp.column_name, ', ' order by cp.column_name)
from information_schema.column_privileges cp
where cp.table_schema = 'public'
  and cp.grantee in ('anon', 'authenticated', 'PUBLIC')
  and not (cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT')
  -- los permisos de tabla también aparecen columna por columna; se muestran arriba como "tabla"
  and not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = cp.table_schema and g.table_name = cp.table_name
      and g.grantee = cp.grantee and g.privilege_type = cp.privilege_type
  )
group by cp.grantee, cp.table_name, cp.privilege_type
order by 1 desc, 2, 3, 4;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. Funciones de public
-- ════════════════════════════════════════════════════════════════════════════
-- ESPERADO (después de especies con color): 60 filas, todas con ok = true.
--
--   funcion                     | security_definer | authenticated | anon  | public
--   ----------------------------+------------------+---------------+-------+-------
--   _actividad_ya_registrada    | false            | false         | false | false
--   _bloquear_entrada_bitacora  | false            | false         | false | false
--   _bloquear_lote_editable     | false            | false         | false | false
--   _bloquear_lotes_actividad   | false            | false         | false | false
--   _cabezas                    | false            | false         | false | false
--   _cargar_catalogos_base      | false            | false         | false | false
--   _cerrar_si_vacio            | false            | false         | false | false
--   _entero_jsonb               | false            | false         | false | false
--   _exigir_categoria           | false            | false         | false | false
--   _exigir_persona             | false            | false         | false | false
--   _guardar_lotes_bitacora     | false            | false         | false | false
--   _insertar_lineas            | false            | false         | false | false
--   _registrar_movimiento       | false            | false         | false | false
--   _stock_categoria_al         | false            | false         | false | false
--   _validar_entrada_bitacora   | false            | false         | false | false
--   _validar_fecha_operacion    | false            | false         | false | false
--   _validar_saldo              | false            | false         | false | false
--   actividad_lotes_desde_actividad | true             | false         | false | false
--   actividad_lotes_desde_paricion | true             | false         | false | false
--   anular_actividad            | true             | true          | false | false
--   anular_entrada_bitacora     | true             | true          | false | false
--   asignar_rol                 | true             | true          | false | false
--   bloquear_borrado            | false            | false         | false | false
--   bloquear_modificacion       | false            | false         | false | false
--   cambiar_estado_idea         | true             | true          | false | false
--   cerrar_lote                 | true             | true          | false | false
--   crear_entrada_bitacora      | true             | true          | false | false
--   crear_establecimiento       | true             | true          | false | false
--   crear_lote                  | true             | true          | false | false
--   definir_activo              | true             | true          | false | false
--   definir_admin               | true             | true          | false | false
--   dividir_lote                | true             | true          | false | false
--   editar_entrada_bitacora     | true             | true          | false | false
--   es_admin                    | true             | true          | false | false
--   es_miembro                  | true             | true          | false | false
--   fecha_hoy                   | false            | true          | false | false
--   linaje_lote                 | false            | true          | false | false
--   mi_rol                      | true             | true          | false | false
--   proteger_actividad          | false            | false         | false | false
--   proteger_ultimo_admin       | false            | false         | false | false
--   puede_operar                | true             | true          | false | false
--   quitar_acceso               | true             | true          | false | false
--   reabrir_lote                | true             | true          | false | false
--   recategorizar_lote          | true             | true          | false | false
--   registrar_ajuste            | true             | true          | false | false
--   registrar_compra            | true             | true          | false | false
--   registrar_diagnostico       | true             | true          | false | false
--   registrar_esquila           | true             | true          | false | false
--   registrar_mortandad         | true             | true          | false | false
--   registrar_paricion          | true             | true          | false | false
--   registrar_personalizada     | true             | true          | false | false
--   registrar_pesada            | true             | true          | false | false
--   registrar_sanidad           | true             | true          | false | false
--   registrar_servicio          | true             | true          | false | false
--   registrar_venta             | true             | true          | false | false
--   restaurar_entrada_bitacora  | true             | true          | false | false
--   set_updated_at              | false            | false         | false | false
--   stock_al                    | false            | true          | false | false
--   unir_lotes                  | true             | true          | false | false
--   validar_baja_categoria      | true             | false         | false | false
--
-- Además, todas con search_path_fijo = true.

with f as (
  select
    p.proname as funcion,
    p.prosecdef as security_definer,
    coalesce('search_path=""' = any (p.proconfig), false) as search_path_fijo,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
    has_function_privilege('anon', p.oid, 'execute') as anon,
    exists (
      select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) as public
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
)
select
  f.*,
  (
    f.search_path_fijo
    and not f.anon
    and not f.public
    -- internas y de trigger: nadie las ejecuta por la API
    and f.authenticated = not (f.funcion like '\_%' or f.funcion in ('set_updated_at', 'bloquear_modificacion', 'proteger_ultimo_admin', 'bloquear_borrado',
                                                                           'proteger_actividad', 'actividad_lotes_desde_actividad',
                                                                           'actividad_lotes_desde_paricion', 'validar_baja_categoria'))
    -- security definer solo en helpers y funciones de escritura
    and f.security_definer = (f.funcion in ('es_admin', 'es_miembro', 'puede_operar', 'mi_rol',
                                            'crear_establecimiento', 'crear_lote', 'registrar_ajuste',
                                            'cerrar_lote', 'reabrir_lote',
                                            'asignar_rol', 'quitar_acceso', 'definir_admin', 'definir_activo',
                                            'dividir_lote', 'unir_lotes', 'recategorizar_lote',
                                            'crear_entrada_bitacora', 'editar_entrada_bitacora', 'cambiar_estado_idea',
                                            'anular_entrada_bitacora', 'restaurar_entrada_bitacora',
                                            'registrar_pesada', 'registrar_mortandad', 'registrar_compra',
                                            'registrar_venta', 'registrar_paricion', 'anular_actividad',
                                            'registrar_sanidad', 'registrar_servicio', 'registrar_diagnostico',
                                            'registrar_esquila', 'registrar_personalizada',
                                            'actividad_lotes_desde_actividad', 'actividad_lotes_desde_paricion',
                                            'validar_baja_categoria'))
  ) as ok
from f
order by f.funcion;
