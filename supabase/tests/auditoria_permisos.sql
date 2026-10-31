-- Campo Digital v2 — Auditoría de permisos del esquema public
--
-- Cinco consultas de solo lectura: no modifican nada. Correrlas en el SQL Editor de
-- Supabase, una por vez, después de aplicar las migraciones (y después de cada etapa
-- que agregue tablas o funciones). Debajo de cada una está el resultado esperado.
--
--   1. RLS activado en todas las tablas y vistas con security_invoker
--   2. Políticas: ninguna de delete, ninguna para anon ni public
--   3. Permisos (GRANT) sobre tablas y columnas para anon, authenticated y public
--   4. Funciones: search_path fijo, security definer donde corresponde y permisos de execute
--   5. Políticas de Storage del bucket lote-archivos


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
-- ESPERADO (desde 20261025000200 y 20261027000100): exactamente estas 4 filas, las políticas de borrado de los
-- catálogos de economía, solo para el administrador y solo si nadie los usa (las FK con restrict lo impiden):
--
--   tablename        | policyname              | cmd    | roles
--   -----------------+-------------------------+--------+-----------------
--   concepto_grupos  | concepto_grupos_delete  | DELETE | {authenticated}
--   conceptos        | conceptos_delete        | DELETE | {authenticated}
--   pagadores        | pagadores_delete        | DELETE | {authenticated}
--   titulares        | titulares_delete        | DELETE | {authenticated}
--
-- Regla: ninguna otra política de delete (ni "ALL", que incluye delete) y todas solo para
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
-- ESPERADO (después de 20261027000200): exactamente estas 25 filas, todas de authenticated: 21 a nivel columna y 4 de
-- tabla (el DELETE de los catálogos de economía, que las políticas limitan al administrador).
-- (La bitácora y las actividades no agregan permisos de escritura: se escribe solo por funciones. Especies suma las
-- columnas grupo (6b-1) y color, que siguen limitadas al administrador por las políticas. En lotes, campana
-- dejó de ser editable y su lugar lo toma anios_nacimiento (la columna se borró en 20261020000500). archivos y lote_archivos: solo lectura.
-- Desde 20261024000100, lotes.potrero_id tampoco: lo mantienen las estadías (lote_estadias, solo lectura), y
-- potreros.forma se escribe solo con guardar_forma_potrero. Economía: concepto_grupos, conceptos y titulares (20261025000200)
-- y pagadores (20261027000100) se editan directo, filtrados por las políticas (razones_sociales se borró en 20261027000200:
-- la factura se escribe en cada movimiento); movimientos, reparto,
-- liquidaciones y preferencias_economia, solo por funciones.)
-- Cualquier otra fila "tabla" (por ejemplo un insert sobre toda la tabla) o cualquier fila de anon o PUBLIC es un error.
--
--   nivel   | grantee       | tabla               | permiso | columnas
--   --------+---------------+---------------------+---------+------------------------------------------------
--   tabla   | authenticated | concepto_grupos     | DELETE  |
--   tabla   | authenticated | conceptos           | DELETE  |
--   tabla   | authenticated | pagadores           | DELETE  |
--   tabla   | authenticated | titulares           | DELETE  |
--   columna | authenticated | concepto_grupos     | INSERT  | activo, establecimiento_id, nombre, orden
--   columna | authenticated | concepto_grupos     | UPDATE  | activo, nombre, orden
--   columna | authenticated | conceptos           | INSERT  | activo, establecimiento_id, grupo_id, nombre, tipo
--   columna | authenticated | conceptos           | UPDATE  | activo, grupo_id, nombre
--   columna | authenticated | pagadores           | INSERT  | activo, establecimiento_id, nombre, titular_id
--   columna | authenticated | pagadores           | UPDATE  | activo, nombre, titular_id
--   columna | authenticated | titulares           | INSERT  | activo, establecimiento_id, nombre
--   columna | authenticated | titulares           | UPDATE  | activo, nombre
--   (y las 13 de antes:)
--
--   nivel   | grantee       | tabla               | permiso | columnas
--   --------+---------------+---------------------+---------+------------------------------------------------
--   columna | authenticated | categorias_animales | INSERT  | activo, cria_al_pie, especie_id, establecimiento_id, nombre, orden, sexo
--   columna | authenticated | categorias_animales | UPDATE  | activo, cria_al_pie, nombre, orden, sexo
--   columna | authenticated | especies            | INSERT  | activo, color, establecimiento_id, grupo, nombre, rubro_id
--   columna | authenticated | especies            | UPDATE  | activo, color, grupo, nombre, rubro_id
--   columna | authenticated | establecimientos    | UPDATE  | departamento, dicose, estado, fecha_alta, localidad, nombre,
--           |               |                     |         | observaciones, paraje, propietario, rut, sistema_productivo, superficie_total
--   columna | authenticated | lotes               | UPDATE  | anios_nacimiento, nombre, notas
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
-- ESPERADO (después de 20261028000200, nombre de usuarios): 105 filas, todas con ok = true.
-- (+8 de 20261025000100 a 20261025000400, +4 de 20261027000100 y +3 de 20261028000100: entran _fichas_de_admins,
-- _guardar_responsables_actividad, _guardar_responsables_entrada y _validar_responsables, sale _exigir_persona;
-- +2 de 20261028000200: los triggers proteger_nombre_persona y sincronizar_nombre_persona.)
--
--   funcion                     | security_definer | authenticated | anon  | public
--   ----------------------------+------------------+---------------+-------+-------
--   _actividad_ya_registrada    | false            | false         | false | false
--   _anios_de_jsonb             | false            | false         | false | false
--   _anios_de_texto             | false            | false         | false | false
--   _archivo_permitido          | false            | false         | false | false
--   _bloquear_entrada_bitacora  | false            | false         | false | false
--   _bloquear_lote_editable     | false            | false         | false | false
--   _bloquear_lotes_actividad   | false            | false         | false | false
--   _cabezas                    | false            | false         | false | false
--   _cargar_conceptos_base      | false            | false         | false | false
--   _cargar_catalogos_base      | false            | false         | false | false
--   _cerrar_si_vacio            | false            | false         | false | false
--   _concepto_por_defecto       | false            | false         | false | false
--   _entero_jsonb               | false            | false         | false | false
--   _exigir_categoria           | false            | false         | false | false
--   _fichas_de_admins           | false            | false         | false | false
--   _fuente_tipo_cambio         | false            | false         | false | false
--   _guardar_pago_y_factura     | false            | false         | false | false
--   _guardar_lotes_bitacora     | false            | false         | false | false
--   _guardar_responsables_actividad | false            | false         | false | false
--   _guardar_responsables_entrada | false            | false         | false | false
--   _guardar_titulares          | false            | false         | false | false
--   _insertar_lineas            | false            | false         | false | false
--   _parte_de_saldo             | false            | false         | false | false
--   _precio_valido              | false            | false         | false | false
--   _registrar_movimiento       | false            | false         | false | false
--   _sincronizar_potrero_lote   | false            | false         | false | false
--   _rubro_de_especie           | false            | false         | false | false
--   _stock_categoria_al         | false            | false         | false | false
--   _validar_datos_tarea        | false            | false         | false | false
--   _validar_entrada_bitacora   | false            | false         | false | false
--   _validar_fecha_operacion    | false            | false         | false | false
--   _validar_responsables       | false            | false         | false | false
--   _validar_saldo              | false            | false         | false | false
--   actividad_lotes_desde_actividad | true             | false         | false | false
--   actividad_lotes_desde_paricion | true             | false         | false | false
--   adjuntar_archivo_lote       | true             | true          | false | false
--   adjuntar_archivo_movimiento | true             | true          | false | false
--   anular_actividad            | true             | true          | false | false
--   anular_entrada_bitacora     | true             | true          | false | false
--   anular_liquidacion          | true             | true          | false | false
--   anular_movimiento           | true             | true          | false | false
--   asignar_rol                 | true             | true          | false | false
--   bloquear_borrado            | false            | false         | false | false
--   bloquear_modificacion       | false            | false         | false | false
--   cambiar_estado_idea         | true             | true          | false | false
--   cambiar_estado_tarea        | true             | true          | false | false
--   cambiar_potrero_lote        | true             | true          | false | false
--   cargar_precio_actividad     | true             | true          | false | false
--   cerrar_lote                 | true             | true          | false | false
--   crear_entrada_bitacora      | true             | true          | false | false
--   crear_establecimiento       | true             | true          | false | false
--   crear_lote                  | true             | true          | false | false
--   definir_activo              | true             | true          | false | false
--   definir_admin               | true             | true          | false | false
--   deshacer_cambio_potrero     | true             | true          | false | false
--   dividir_lote                | true             | true          | false | false
--   editar_movimiento           | true             | true          | false | false
--   editar_entrada_bitacora     | true             | true          | false | false
--   es_admin                    | true             | true          | false | false
--   es_miembro                  | true             | true          | false | false
--   estadia_alta_lote           | true             | false         | false | false
--   estadia_cambio_estado_lote  | true             | false         | false | false
--   fecha_hoy                   | false            | true          | false | false
--   guardar_forma_potrero       | true             | true          | false | false
--   linaje_lote                 | false            | true          | false | false
--   marcar_dosis_dada           | true             | true          | false | false
--   marcar_pagado               | true             | true          | false | false
--   mi_rol                      | true             | true          | false | false
--   potreros_superpuestos       | false            | true          | false | false
--   proteger_actividad          | false            | false         | false | false
--   proteger_lote_archivo       | false            | false         | false | false
--   proteger_movimiento_archivo | false            | false         | false | false
--   proteger_nombre_persona     | false            | false         | false | false
--   proteger_potrero_ocupado    | false            | false         | false | false
--   proteger_ultimo_admin       | false            | false         | false | false
--   puede_operar                | true             | true          | false | false
--   quitar_acceso               | true             | true          | false | false
--   quitar_archivo_lote         | true             | true          | false | false
--   quitar_archivo_movimiento   | true             | true          | false | false
--   reabrir_lote                | true             | true          | false | false
--   recategorizar_lote          | true             | true          | false | false
--   registrar_ajuste            | true             | true          | false | false
--   registrar_compra            | true             | true          | false | false
--   registrar_destete           | true             | true          | false | false
--   registrar_diagnostico       | true             | true          | false | false
--   registrar_esquila           | true             | true          | false | false
--   registrar_liquidacion       | true             | true          | false | false
--   registrar_mortandad         | true             | true          | false | false
--   registrar_movimiento        | true             | true          | false | false
--   registrar_paricion          | true             | true          | false | false
--   registrar_personalizada     | true             | true          | false | false
--   registrar_pesada            | true             | true          | false | false
--   registrar_sanidad           | true             | true          | false | false
--   registrar_servicio          | true             | true          | false | false
--   registrar_venta             | true             | true          | false | false
--   restaurar_archivo_lote      | true             | true          | false | false
--   restaurar_entrada_bitacora  | true             | true          | false | false
--   set_updated_at              | false            | false         | false | false
--   sincronizar_nombre_persona  | true             | false         | false | false
--   sincronizar_potrero_lote    | true             | false         | false | false
--   stock_al                    | false            | true          | false | false
--   unir_lotes                  | true             | true          | false | false
--   validar_anios_nacimiento    | false            | false         | false | false
--   validar_baja_categoria      | true             | false         | false | false
--   validar_estadia             | false            | false         | false | false
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
                                                                           'actividad_lotes_desde_paricion', 'validar_baja_categoria',
                                                                           'validar_anios_nacimiento', 'proteger_lote_archivo',
                                                                           'validar_estadia', 'sincronizar_potrero_lote', 'estadia_alta_lote',
                                                                           'estadia_cambio_estado_lote', 'proteger_potrero_ocupado',
                                                                           'proteger_movimiento_archivo', 'proteger_nombre_persona',
                                                                           'sincronizar_nombre_persona'))
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
                                            'registrar_esquila', 'registrar_personalizada', 'registrar_destete',
                                            'registrar_movimiento', 'cargar_precio_actividad', 'marcar_pagado', 'anular_movimiento',
                                            'cambiar_estado_tarea', 'marcar_dosis_dada',
                                            'actividad_lotes_desde_actividad', 'actividad_lotes_desde_paricion',
                                            'validar_baja_categoria',
                                            'adjuntar_archivo_lote', 'quitar_archivo_lote', 'restaurar_archivo_lote',
                                            'cambiar_potrero_lote', 'deshacer_cambio_potrero', 'guardar_forma_potrero',
                                            'sincronizar_potrero_lote', 'estadia_alta_lote', 'estadia_cambio_estado_lote',
                                            'adjuntar_archivo_movimiento', 'quitar_archivo_movimiento', 'editar_movimiento',
                                            'registrar_liquidacion', 'anular_liquidacion', 'sincronizar_nombre_persona'))
  ) as ok
from f
order by f.funcion;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. Políticas de Storage del bucket lote-archivos
-- ════════════════════════════════════════════════════════════════════════════
-- ESPERADO: exactamente 2 filas, las dos solo para authenticated:
--
--   policyname           | cmd    | roles
--   ---------------------+--------+-----------------
--   lote_archivos_insert | INSERT | {authenticated}
--   lote_archivos_select | SELECT | {authenticated}
--
-- Ninguna de update ni delete (un archivo subido no se reemplaza ni se borra) y ninguna para anon ni public.
-- Además, el bucket tiene que ser privado (public = false) con límite de 20 MB.

select p.policyname, p.cmd, p.roles
from pg_policies p
where p.schemaname = 'storage' and p.tablename = 'objects'
  and (coalesce(p.qual, '') like '%lote-archivos%' or coalesce(p.with_check, '') like '%lote-archivos%')
order by p.policyname;

select id, public, file_size_limit, array_length(allowed_mime_types, 1) as tipos_permitidos
from storage.buckets where id = 'lote-archivos';
-- ESPERADO: lote-archivos | false | 20971520 | 14
