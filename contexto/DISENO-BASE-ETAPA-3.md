# Campo Digital — Diseño de la base, Etapa 3

Estado: **borrador para revisión**. No hay migraciones escritas. Base: `00-ENFOQUE-V2.md` y `MODELO-DE-DATOS-V2.md`.

Marcas: **[Decidido]** sale de esos documentos o de decisiones ya tomadas; **[Propuesta]** es diseño a validar. Los fragmentos SQL son ilustrativos: muestran la forma, no son la migración final.

---

## 1. Criterios generales

### 1.1 Tipo de id: `uuid` en todas las tablas [Propuesta]

Toda clave primaria es `id uuid primary key default gen_random_uuid()`, y toda clave foránea es `uuid`. No hay ningún `bigint` en el esquema.

Motivos:

- **Un solo tipo en todo el esquema.** Las referencias a usuarios (`created_by`, `membresias.user_id`, `personas.user_id`) tienen que ser `uuid` porque `auth.users.id` es `uuid`. Con `uuid` también en los ids propios, no hay mezcla.
- **Modo offline (pendiente).** Con `uuid`, el teléfono puede generar el id de un registro sin conexión y sincronizarlo después sin choques. Con `bigint` correlativo, eso obliga a rediseñar.
- **Ids no adivinables.** En la API y en las URL no se pueden recorrer los registros probando `1, 2, 3...`. El RLS igual protege, pero no se expone cuántos registros hay.

Costo: índices algo más grandes y URL más largas. Con el volumen de un establecimiento (miles de eventos, no millones), no se nota.

### 1.2 Columnas comunes [Decidido + Propuesta]

| Columna | Tipo | Dónde | Nota |
|---|---|---|---|
| id | uuid | todas | `default gen_random_uuid()` |
| establecimiento_id | uuid | todas menos `establecimientos` | base del RLS y de los índices |
| created_by | uuid | todas | `default auth.uid()`, `references auth.users on delete set null`. Solo auditoría [Decidido] |
| created_at | timestamptz | todas | `default now()` |
| updated_at | timestamptz | tablas editables | trigger `set_updated_at`. No existe en tablas inmutables |

### 1.3 Mismo establecimiento garantizado por la base [Propuesta]

Cada tabla padre tiene `unique (id, establecimiento_id)`, y las hijas la referencian con una **clave foránea compuesta**:

```sql
-- lotes no puede apuntar a una especie de otro establecimiento
foreign key (especie_id, establecimiento_id)
  references public.especies (id, establecimiento_id)
```

Así es imposible, aun llamando a la API a mano, que un lote de Santa Remigia use una categoría o un potrero de otro establecimiento.

### 1.4 Nada se borra [Decidido]

- Ninguna tabla tiene política de `delete`. Las bajas son lógicas: `activo = false` o `estado = 'inactivo'/'cerrado'`.
- Las tablas de eventos (`lote_eventos`, `operaciones_lote`, `operacion_lote_vinculos`) son **inmutables** (sección 5).

### 1.5 Escrituras de varias tablas: solo por funciones [Decidido]

Todo lo que escribe en más de una tabla, o que tiene que validar stock, se hace en una función de Postgres (RPC), en una transacción. El navegador nunca encadena varias escrituras.

---

## 2. Tablas de la Etapa 3

### 2.1 establecimientos

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| nombre | text | not null |
| departamento | text | not null (lista en `parametros`) |
| localidad | text | opcional |
| paraje | text | opcional |
| superficie_total | numeric(10,2) | opcional, `> 0` |
| sistema_productivo | text | opcional, texto libre, sin lógica [Decidido] |
| propietario | text | opcional |
| rut | text | opcional |
| dicose | text | opcional, texto libre, sin validación [Decidido] |
| fecha_alta | date | `default current_date` |
| estado | text | `activo` o `inactivo` |
| observaciones | text | |
| created_by, created_at, updated_at | | |

### 2.2 membresias

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| establecimiento_id | uuid | `references establecimientos on delete restrict` |
| user_id | uuid | `references auth.users on delete cascade` |
| rol | text | `check (rol in ('editor','lector'))` [Decidido] |
| created_by, created_at, updated_at | | |

Restricción única: `(user_id, establecimiento_id)`. En la Etapa 3 se escribe **solo por funciones** (sección 3). Agregar, cambiar o quitar miembros es Etapa 9.

### 2.3 personas

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| establecimiento_id | uuid | |
| nombre | text | not null |
| rol | text | texto libre (capataz, peón, veterinario, hermano...) |
| user_id | uuid | opcional, `references auth.users on delete set null` [Decidido] |
| activo | boolean | `default true` |
| created_by, created_at, updated_at | | |

Restricciones: `unique (establecimiento_id, user_id)` (una persona por usuario y establecimiento; los `null` no chocan) y `unique (id, establecimiento_id)`.

### 2.4 Catálogos: especies, categorias_animales, rubros

| Tabla | Columnas propias | Únicos |
|---|---|---|
| especies | nombre, activo | `(establecimiento_id, nombre)`, `(id, establecimiento_id)` |
| categorias_animales | especie_id, nombre, orden int, activo | `(especie_id, nombre)`, `(id, establecimiento_id)`, `(id, especie_id)` |
| rubros | nombre, activo | `(establecimiento_id, nombre)` |

`categorias_animales.especie_id` usa FK compuesta `(especie_id, establecimiento_id)`.

`rubros` entra ahora aunque no se use hasta la economía, porque es un catálogo y se carga junto con los demás [Propuesta].

### 2.5 potreros [Propuesta]

No estaba en la lista de la Etapa 3, pero **tiene que entrar**: el reseteo de `public` lo borra, `lotes.potrero_id` lo referencia y la pantalla actual lo usa.

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| establecimiento_id | uuid | |
| nombre | text | `unique (establecimiento_id, nombre)` |
| superficie | numeric(10,2) | `> 0` |
| uso_actual | text | ver pregunta abierta 3 |
| tipo_pastura | text | opcional (lista en `parametros`) |
| aguada, sombra | boolean | opcional |
| estado | text | `activo` o `inactivo` |
| observaciones | text | |
| created_by, created_at, updated_at | | |

El trigger viejo que "advertía" si la suma de potreros superaba la superficie no se recrea: su aviso (`raise notice`) nunca llegaba a la app. Esa validación pasa a la interfaz [Propuesta].

### 2.6 parametros [Propuesta]

Listas **globales** y simples, sin relaciones: departamentos, tipos de pastura y, más adelante, modalidades de venta o causas de mortandad.

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| clave | text | ej. `departamentos` |
| valor | text | |
| orden | int | |
| activo | boolean | |

`unique (clave, valor)`. Lo puede leer cualquier usuario autenticado; se escribe solo por migración. No lleva `establecimiento_id` porque es global (excepción explícita a 1.2).

### 2.7 lotes

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| establecimiento_id | uuid | |
| especie_id | uuid | FK compuesta a especies |
| nombre | text | ej. "Terneros Nacidos 2026" |
| campana | text | opcional [Propuesta] |
| estado | text | `activo` o `cerrado` |
| fecha_apertura | date | not null |
| fecha_cierre | date | null mientras está activo |
| potrero_id | uuid | opcional, FK compuesta a potreros, sin historial [Decidido] |
| notas | text | |
| created_by, created_at, updated_at | | |

Restricciones:

- `check ((estado = 'activo') = (fecha_cierre is null))`.
- `check (fecha_cierre is null or fecha_cierre >= fecha_apertura)`.
- `unique (id, establecimiento_id)` y `unique (id, especie_id)`.

### 2.8 lote_eventos (libro de stock, inmutable)

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| establecimiento_id | uuid | |
| lote_id | uuid | FK compuesta `(lote_id, establecimiento_id)` |
| especie_id | uuid | copia de la especie del lote, para la FK de abajo |
| categoria_id | uuid | FK compuesta `(categoria_id, especie_id)`: la categoría tiene que ser de la especie del lote |
| cabezas | int | con signo, `check (cabezas <> 0)` |
| fecha | date | not null |
| tipo | text | ver abajo |
| operacion_lote_id | uuid | opcional, FK a operaciones_lote |
| nota | text | |
| created_by, created_at | | sin `updated_at`: no se modifica |

`especie_id` además lleva FK compuesta `(lote_id, especie_id)` → `lotes (id, especie_id)`. Con eso la base garantiza que **la categoría es de la misma especie que el lote** (por ejemplo, que no se carguen "corderos" en un lote de vacunos).

`tipo`: `check (tipo in ('alta_inicial','paricion','compra','venta','mortandad','recategorizacion','division','union','ajuste'))`. Además:

- `check (tipo <> 'ajuste' or nota is not null)`: todo ajuste lleva su motivo.
- `check ((tipo in ('division','union','recategorizacion')) = (operacion_lote_id is not null))`.
- La columna `actividad_id` se agrega en la Etapa 6a, con su regla equivalente para `paricion`, `compra`, `venta` y `mortandad`.

### 2.9 operaciones_lote y operacion_lote_vinculos (inmutables)

**operaciones_lote**: `id`, `establecimiento_id`, `tipo` (`division`, `union`, `recategorizacion`), `fecha`, `notas`, `created_by`, `created_at`. Único: `(id, establecimiento_id)`.

**operacion_lote_vinculos**:

| Columna | Tipo | Nota |
|---|---|---|
| establecimiento_id | uuid | |
| operacion_id | uuid | FK compuesta a operaciones_lote |
| lote_id | uuid | FK compuesta a lotes |
| rol | text | `origen` o `destino` |

PK: `(operacion_id, lote_id, rol)`. Las tablas entran en la Etapa 3. Las funciones que las escriben (dividir, juntar y recategorizar) son de la Etapa 5.

### 2.10 Relaciones

```
auth.users ─┬─< membresias >── establecimientos
            ├─< personas (user_id opcional)
            └─< created_by (todas las tablas, auditoría)

establecimientos ─┬─< personas
                  ├─< potreros
                  ├─< especies ──< categorias_animales
                  ├─< rubros
                  ├─< lotes >── especies, potreros (opcional)
                  │     └─< lote_eventos >── categorias_animales
                  └─< operaciones_lote ──< operacion_lote_vinculos >── lotes
                                    └──< lote_eventos (operacion_lote_id)
```

### 2.11 Índices [Propuesta]

Postgres no crea índices solos para las claves foráneas. Los necesarios:

| Tabla | Índice | Para qué |
|---|---|---|
| membresias | `unique (user_id, establecimiento_id)` | lo usan `es_miembro` y `es_editor` en cada consulta |
| membresias | `(establecimiento_id)` | listar miembros |
| personas, especies, rubros, potreros | `(establecimiento_id)` | RLS y listados (algunos ya los cubre su `unique`) |
| categorias_animales | `(establecimiento_id, especie_id, orden)` | listados ordenados |
| lotes | `(establecimiento_id, estado)` | lotes activos del establecimiento |
| lote_eventos | `(lote_id, categoria_id, fecha)` | stock por lote y validación de saldo |
| lote_eventos | `(establecimiento_id, fecha)` | stock del establecimiento y stock a una fecha |
| lote_eventos | `(operacion_lote_id)` | ver qué movió una operación |
| operacion_lote_vinculos | `(lote_id)` | linaje de un lote |

---

## 3. Alta del primer establecimiento (sin el problema del huevo y la gallina)

**Problema.** Para insertar en `establecimientos` haría falta ser editor, y para ser editor haría falta una membresía en un establecimiento que todavía no existe.

**Solución [Propuesta].** `establecimientos` y `membresias` **no tienen política de insert**: nadie puede insertar directo, ni siquiera un editor. Todo pasa por una función atómica:

```sql
create function public.crear_establecimiento(
  p_nombre text,
  p_departamento text,
  p_cargar_catalogos_base boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_est  uuid;
begin
  if v_user is null then
    raise exception 'Hay que iniciar sesión' using errcode = '42501';
  end if;

  insert into public.establecimientos (nombre, departamento, created_by)
  values (p_nombre, p_departamento, v_user)
  returning id into v_est;

  insert into public.membresias (establecimiento_id, user_id, rol, created_by)
  values (v_est, v_user, 'editor', v_user);

  if p_cargar_catalogos_base then
    perform public._cargar_catalogos_base(v_est);  -- especies, categorías y rubros iniciales
  end if;

  return v_est;  -- todo en una transacción: o se crean las dos filas, o ninguna
end;
$$;
```

El resto de los campos del establecimiento se completa después con un `update` normal, que ya pasa por RLS como editor.

`_cargar_catalogos_base` carga el set de Santa Remigia, que es el set inicial documentado: especies Vacunos y Ovinos, sus categorías, y los rubros vacunos, ovinos, forestación tercerizada y general. Después cada establecimiento lo ajusta [Propuesta].

**Quién puede crear establecimientos.** Cualquier usuario con sesión, y solo ve los suyos. Para que no entre cualquiera, se recomienda **desactivar el registro abierto** en Supabase Auth: los usuarios se invitan por mail desde el panel hasta la Etapa 9 [Propuesta].

**Primer uso real.** Vos creás tu usuario, entrás y ejecutás `crear_establecimiento('Santa Remigia', ...)`, o lo hace la app. Para tu hermano: se lo invita y se carga su membresía con un script de una vez hasta que exista la pantalla de la Etapa 9.

---

## 4. Helpers es_miembro y es_editor

```sql
create function public.es_miembro(p_est uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membresias m
    where m.establecimiento_id = p_est
      and m.user_id = (select auth.uid())
  );
$$;

create function public.es_editor(p_est uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membresias m
    where m.establecimiento_id = p_est
      and m.user_id = (select auth.uid())
      and m.rol = 'editor'
  );
$$;

revoke execute on function public.es_miembro(uuid), public.es_editor(uuid) from public, anon;
grant  execute on function public.es_miembro(uuid), public.es_editor(uuid) to authenticated;
```

Se suma `mi_rol(p_est) returns text` (`'editor'`, `'lector'` o `null`) para que la interfaz sepa qué mostrar. Mostrar u ocultar botones es solo comodidad: **la seguridad la pone la base**.

**Por qué `security definer`: la recursión.** La política de `select` de `membresias` es "ves las membresías de los establecimientos donde sos miembro", o sea `using (es_miembro(establecimiento_id))`. Para responder, `es_miembro` lee `membresias`, y esa lectura vuelve a disparar la misma política, que vuelve a llamar a `es_miembro`, y así sin fin. Postgres lo corta con `infinite recursion detected in policy for relation "membresias"`.

Con `security definer`, la función corre con los permisos de su dueño (`postgres`, dueño de las tablas). Su consulta interna a `membresias` **no pasa por RLS**, y la cadena se corta. Las demás tablas no tienen ese problema, pero usan los mismos helpers para que la regla esté en un solo lugar.

**Por qué `search_path` fijo (`set search_path = ''`).** Una función `security definer` corre con privilegios altos. Si dejara el `search_path` de quien la llama, alguien podría crear en otro esquema una tabla o función con el mismo nombre (por ejemplo, una `membresias` falsa) y engañarla. Con `search_path` vacío y **todos los nombres calificados** (`public.membresias`, `auth.uid()`), la función solo ve los objetos que tiene que ver.

**Qué expone.** Las dos funciones solo responden sobre el **usuario actual**. Llamarlas por la API con cualquier id dice, como mucho, "no sos miembro", que no revela nada.

**Rendimiento.** `(select auth.uid())` se evalúa una vez por consulta y no una vez por fila. El `unique (user_id, establecimiento_id)` de `membresias` responde cada llamada con un índice.

---

## 5. Inmutabilidad de lote_eventos

La base lo garantiza con **tres capas**: si falla una, quedan las otras.

**Capa 1: permisos (GRANT).** Los usuarios de la app no tienen permiso de escritura sobre la tabla:

```sql
revoke insert, update, delete, truncate on public.lote_eventos from anon, authenticated;
grant select on public.lote_eventos to authenticated;
```

**Capa 2: RLS.** Solo hay política de `select`. No hay política de `insert`, `update` ni `delete`, y en RLS **lo que no tiene política está prohibido**:

```sql
alter table public.lote_eventos enable row level security;

create policy lote_eventos_select on public.lote_eventos
  for select to authenticated
  using (public.es_miembro(establecimiento_id));
```

**Capa 3: trigger que bloquea cambios.** Frena incluso a `service_role` o a alguien en el SQL Editor:

```sql
create function public.bloquear_modificacion() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% es inmutable: los errores se corrigen con un evento de ajuste', tg_table_name
    using errcode = '42501';
end;
$$;

create trigger lote_eventos_inmutable
  before update or delete on public.lote_eventos
  for each row execute function public.bloquear_modificacion();

create trigger lote_eventos_sin_truncate
  before truncate on public.lote_eventos
  for each statement execute function public.bloquear_modificacion();
```

Lo mismo se aplica a `operaciones_lote` y `operacion_lote_vinculos`.

**Cómo se escribe, entonces.** Solo con funciones `security definer` que:

1. verifican `es_editor(establecimiento_id)` y, si no, cortan con `42501`;
2. bloquean el lote (`select ... from public.lotes where id = ... for update`) para que dos cargas simultáneas no se pisen;
3. validan que el lote esté activo, que la fecha no sea futura ni anterior a la apertura, y que la categoría sea de la especie del lote;
4. insertan los eventos;
5. verifican que el **saldo por categoría nunca quede negativo**, en ninguna fecha, recorriendo los eventos en orden de fecha [Propuesta].

Funciones de la Etapa 3:

| Función | Qué hace |
|---|---|
| `crear_lote(p_est, p_especie, p_nombre, p_fecha, p_composicion jsonb, p_potrero, p_campana, p_notas)` | crea el lote y un evento `alta_inicial` por categoría, por ejemplo `[{"categoria_id": "...", "cabezas": 120}]` |
| `registrar_ajuste(p_lote, p_categoria, p_cabezas, p_fecha, p_nota)` | corrección con signo; la nota es obligatoria |
| `cerrar_lote(p_lote, p_fecha)` | cierra un lote; ver pregunta abierta 4 |

**Corrección de un error.** Si se cargaron 120 terneros y eran 112, no se edita la fila: se registra `registrar_ajuste(lote, terneros, -8, fecha, 'Error de conteo en el alta')`. El stock queda en 112 y el historial muestra qué pasó.

---

## 6. Stock por categoría

**Propuesta: vistas comunes, no materializadas.**

```sql
create view public.v_stock_lote
with (security_invoker = true) as
select e.establecimiento_id, e.lote_id, e.categoria_id,
       sum(e.cabezas)::int as cabezas
from public.lote_eventos e
group by e.establecimiento_id, e.lote_id, e.categoria_id
having sum(e.cabezas) <> 0;

create view public.v_stock_establecimiento
with (security_invoker = true) as
select s.establecimiento_id, c.especie_id, s.categoria_id,
       sum(s.cabezas)::int as cabezas
from public.v_stock_lote s
join public.categorias_animales c on c.id = s.categoria_id
group by s.establecimiento_id, c.especie_id, s.categoria_id;
```

- **`security_invoker = true` es obligatorio.** Sin eso, la vista corre con los permisos de su dueño y **se saltea el RLS**: cualquier usuario vería el stock de todos los establecimientos. Requiere Postgres 15 o superior [sin verificar: hay que confirmar la versión del proyecto de Supabase].
- **Por qué no materializada.** Una vista materializada **no admite RLS**: expondría todo a cualquiera que pueda leerla. Además hay que refrescarla a mano después de cada carga. Con el volumen esperado, sumar en el momento con el índice `(lote_id, categoria_id, fecha)` es instantáneo. Si algún día hace falta, se cambia por una tabla de saldos mantenida por las mismas funciones, sin tocar la interfaz.
- **Stock a una fecha** (por ejemplo, al 30 de junio para la declaración jurada): función `stock_al(p_est, p_fecha)` con el mismo cálculo filtrando `fecha <= p_fecha`. La implementación es de la Etapa 5.

---

## 7. Rol lector: tres tablas de ejemplo

### 7.1 lotes

```sql
alter table public.lotes enable row level security;

create policy lotes_select on public.lotes for select to authenticated
  using (public.es_miembro(establecimiento_id));

create policy lotes_update on public.lotes for update to authenticated
  using (public.es_editor(establecimiento_id))
  with check (public.es_editor(establecimiento_id));

-- Sin política de insert: los lotes se crean con crear_lote(), que también carga el alta inicial.
-- Sin política de delete: los lotes se cierran, no se borran.

-- Solo se pueden editar a mano estas columnas; estado y fechas de cierre van por funciones:
revoke update on public.lotes from authenticated;
grant update (nombre, campana, potrero_id, notas) on public.lotes to authenticated;
```

### 7.2 personas

```sql
create policy personas_select on public.personas for select to authenticated
  using (public.es_miembro(establecimiento_id));

create policy personas_insert on public.personas for insert to authenticated
  with check (public.es_editor(establecimiento_id));

create policy personas_update on public.personas for update to authenticated
  using (public.es_editor(establecimiento_id))
  with check (public.es_editor(establecimiento_id));
-- Sin delete: se desactiva con activo = false.
```

Lo mismo vale para `especies`, `categorias_animales`, `rubros` y `potreros`.

### 7.3 lote_eventos

Solo `select` para miembros (sección 5). La escritura no depende del rol, porque ningún usuario puede escribir directo; las funciones verifican `es_editor`.

### 7.4 Qué pasa si un lector llama a la API directamente

La anon key es pública y un lector tiene un token válido, así que puede llamar a la API de Supabase sin pasar por la app. Resultado, caso por caso:

| Intento del lector | Respuesta de la base |
|---|---|
| `GET /rest/v1/lotes` | Ve los lotes de **sus** establecimientos. Nada de otros |
| `POST /rest/v1/personas` | **Error 42501** (HTTP 403): `new row violates row-level security policy` |
| `PATCH /rest/v1/lotes?id=eq.X` | **No modifica nada.** Ojo: no da error, responde 200 con **0 filas** porque la política filtra la fila. La app tiene que tratar "0 filas" como "sin permiso" |
| `PATCH` de `estado` en un lote, aun siendo editor | **Error 42501** por permisos de columna |
| `POST /rest/v1/lote_eventos` | **Error 42501**: no tiene permiso de insert, sea lector o editor |
| `POST /rest/v1/rpc/registrar_ajuste` | **Error 42501** que lanza la función al verificar `es_editor` |
| `POST /rest/v1/rpc/crear_establecimiento` | **Funciona**: crea un establecimiento nuevo **propio**, donde queda como editor. No le da acceso a ninguno ajeno (por eso conviene cerrar el registro abierto, sección 3) |
| Cualquier llamada **sin sesión** (solo anon key) | No ve nada: todas las políticas son `to authenticated` y las funciones no se pueden ejecutar como `anon` |

**Detalle de Supabase.** El reseteo de la Etapa 2 da por defecto `execute` sobre las funciones nuevas a `anon`. Cada función lleva `revoke execute ... from public, anon` explícito, y las internas (con `_` adelante, como `_cargar_catalogos_base`) no se dan a nadie.

---

## 8. Esquema incremental: qué entra en cada etapa

| Etapa | Tablas | Funciones y vistas |
|---|---|---|
| **3** | establecimientos, membresias, personas, especies, categorias_animales, rubros, potreros, parametros, lotes, lote_eventos, operaciones_lote, operacion_lote_vinculos | es_miembro, es_editor, mi_rol, crear_establecimiento, _cargar_catalogos_base, crear_lote, registrar_ajuste, cerrar_lote, set_updated_at, bloquear_modificacion; v_stock_lote, v_stock_establecimiento |
| 5 | bitacora_entradas, bitacora_lotes | dividir_lote, unir_lotes, recategorizar_lote, linaje_lote, stock_al |
| 6a | actividades, actividad_lineas, act_compraventa, act_mortandad, act_paricion, movimientos_economicos; se agrega `lote_eventos.actividad_id` | registrar_actividad (pesada, mortandad, compra, venta, parición, con el movimiento económico de compra y venta) |
| 6b | act_sanidad, act_servicio, act_diagnostico, act_destete, act_esquila, act_personalizada | registrar_actividad se extiende |
| 7 | (ninguna) | v_indicadores_reproductivos, v_resultado_rubro, ganancia de peso por lote |
| 8 | tareas | contadores de vencidas y próximas |
| 9 | (ninguna; quizás invitaciones pendientes) | invitar_miembro, cambiar_rol, quitar_miembro, con regla de "no se puede quitar al último editor" |

---

## 9. Preguntas abiertas para aprobar el diseño

1. **Tipo de id:** ¿aprobás `uuid` en todas las tablas (sección 1.1)?
2. **App entre la Etapa 3 y la 4:** cuando corra el reseteo y se active el RLS, la app actual deja de funcionar: no hay login, así que el usuario anónimo no ve nada, y además las páginas asumen ids numéricos. Hay dos opciones:
   - (a) la Etapa 3 incluye una página de login mínima, los tipos generados y la adaptación de establecimientos y potreros, para probar el RLS de punta a punta;
   - (b) la app queda sin funcionar hasta la Etapa 4.

   Recomiendo (a).
3. **potreros.uso_actual** sin agricultura: propongo `Ganadería`, `Forestación`, `Reserva` y `Sin uso`. Forestación porque la tercerizada ocupa campo. Hoy además existe `Mixto`, que mezclaba ganadería con agricultura y deja de tener sentido.
4. **cerrar_lote:** ¿solo se puede cerrar con stock en cero, o al cerrar se exige registrar antes la salida de lo que queda? Propongo **solo con stock en cero**. Las operaciones de juntar ya cierran el lote absorbido por su cuenta.
5. **Valores de `parametros`:** el reseteo borra los que existen hoy y no los tengo [sin verificar]. Propongo cargar los 19 departamentos de Uruguay. Para tipos de pastura necesito tu lista, o arranco con campo natural, mejorado, pradera y verdeo.
6. **Registro abierto en Supabase Auth:** ¿lo desactivamos e invitamos usuarios por mail (sección 3)?
