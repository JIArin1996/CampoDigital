# Campo Digital — Diseño de la base, Etapa 3

Estado: **aprobado el 2026-10-15**, con las decisiones y agregados de la sección 9. Migraciones en `supabase/migrations/20261015000100_*` a `20261015000300_*`; pruebas de RLS en `supabase/tests/etapa3_rls.sql`. Base: `00-ENFOQUE-V2.md` y `MODELO-DE-DATOS-V2.md`.

Marcas: **[Decidido]** sale de esos documentos o de decisiones ya tomadas; **[Propuesta]** es diseño a validar. Los fragmentos SQL son ilustrativos: muestran la forma, no son la migración final.

---

## 1. Criterios generales

### 1.1 Tipo de id: `uuid` en todas las tablas [Decidido]

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
| created_by | uuid | todas | `default auth.uid()`. Solo auditoría [Decidido]. **Sin clave foránea** a `auth.users` (ver abajo) |
| created_at | timestamptz | todas | `default now()` |
| updated_at | timestamptz | tablas editables | trigger `set_updated_at`. No existe en tablas inmutables |

**Por qué `created_by` no tiene clave foránea.** Con `references auth.users on delete set null`, borrar un usuario haría un `update` sobre sus filas. En las tablas inmutables, ese `update` lo frena el trigger de la sección 5, así que el usuario no se podría borrar nunca. Y en las editables se perdería el dato de quién cargó. Sin clave foránea, `created_by` guarda el id aunque el usuario ya no exista, que es lo que se quiere de una auditoría.

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
| uso_actual | text | opcional. Valores de catálogo en `parametros` (clave `uso_potrero`): Ganadería, Forestación, Reserva, Sin uso. Sin `check` ni enum, para poder sumar valores sin migrar [Decidido] |
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

Valores iniciales [Decidido]:

| Clave | Valores |
|---|---|
| `departamentos` | los 19 departamentos de Uruguay |
| `tipos_pastura` | Campo natural, Campo natural mejorado, Pradera, Verdeo de invierno, Verdeo de verano |
| `uso_potrero` | Ganadería, Forestación, Reserva, Sin uso |

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

### 2.9 bis lote_cambios_estado (inmutable) [Propuesta]

Registro de cierres y reaperturas, para que `reabrir_lote` "deje evento" [Decidido]. No puede ir en `lote_eventos`, porque esa tabla registra cabezas por categoría (`cabezas <> 0`) y un cierre o una reapertura no mueve cabezas.

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| establecimiento_id | uuid | |
| lote_id | uuid | FK compuesta a lotes |
| tipo | text | `cierre` o `reapertura` |
| fecha | date | |
| motivo | text | opcional |
| created_by, created_at | | |

La escriben `cerrar_lote` y `reabrir_lote`, y en la Etapa 5 `unir_lotes` cuando cierra el lote absorbido.

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
                  ├─< operaciones_lote ──< operacion_lote_vinculos >── lotes
                  │                 └──< lote_eventos (operacion_lote_id)
                  └─< lote_cambios_estado >── lotes
```

### 2.10 bis Bajas y borrados: ninguna cascada hacia los eventos [Decidido]

- **Ninguna clave foránea tiene `on delete cascade` hacia `lote_eventos`**, ni hacia `operaciones_lote`, `operacion_lote_vinculos` o `lote_cambios_estado`. Todas son `on delete restrict` (o la acción por defecto, `no action`, que también impide borrar). Lo mismo valdrá para `actividades` en la Etapa 6a.
- **`establecimientos` y `lotes` se dan de baja de forma lógica**: `estado = 'inactivo'` y `estado = 'cerrado'`. No tienen política de `delete` y `authenticated` no tiene permiso de `delete` sobre ninguna tabla.
- La única cascada del esquema es `membresias.user_id → auth.users on delete cascade`: si se borra un usuario de Supabase, se borran sus membresías. No toca datos del campo.
- `personas.user_id → auth.users` es `on delete set null`: la persona queda, sin vínculo a un usuario.

| Desde | Hacia | Al borrar el padre |
|---|---|---|
| todas las tablas (`establecimiento_id`) | establecimientos | restrict |
| membresias.user_id | auth.users | cascade |
| personas.user_id | auth.users | set null |
| categorias_animales, lotes (especie) | especies | restrict |
| lotes.potrero_id | potreros | restrict |
| lote_eventos, operacion_lote_vinculos, lote_cambios_estado (lote) | lotes | restrict |
| lote_eventos.categoria_id | categorias_animales | restrict |
| lote_eventos, operacion_lote_vinculos (operación) | operaciones_lote | restrict |

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

En la migración, la función suma parámetros opcionales para todos los datos descriptivos (localidad, superficie, sistema productivo, DICOSE, etc.), así la app crea el establecimiento completo en una sola llamada. Después se edita con un `update` normal, que pasa por RLS como editor.

`_cargar_catalogos_base` carga el set de Santa Remigia, que es el set inicial documentado: especies Vacunos y Ovinos, sus categorías, y los rubros vacunos, ovinos, forestación tercerizada y general. Después cada establecimiento lo ajusta [Propuesta].

Los nombres compuestos del documento ("terneros/as", "corderos/as", "borregos/as") se cargan como **dos categorías separadas** (Terneros y Terneras, etc.) [Propuesta]. Motivo: la parición da de alta "terneros y terneras" por separado (`MODELO-DE-DATOS-V2.md`, sección 6), y en una cría los machos y las hembras siguen caminos distintos. Quedan 7 categorías vacunas (Terneros, Terneras, Vaquillonas, Novillos, Vacas de cría, Vacas de invernada o descarte, Toros) y 7 ovinas (Corderos, Corderas, Borregos, Borregas, Ovejas de cría, Ovejas de descarte, Carneros).

**Quién puede crear establecimientos.** Cualquier usuario con sesión, y solo ve los suyos. **El registro abierto en Supabase Auth está desactivado**: los usuarios los crea a mano el administrador desde el panel de Supabase [Decidido].

**Primer uso real.** Creás tu usuario en el panel, entrás a la app y creás Santa Remigia, que llama a `crear_establecimiento`. Para tu hermano: se crea su usuario en el panel y se carga su membresía con un script de una vez, hasta que exista la pantalla de la Etapa 9.

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

Lo mismo se aplica a `operaciones_lote`, `operacion_lote_vinculos` y `lote_cambios_estado`.

**Cómo se escribe, entonces.** Solo con funciones `security definer` que:

1. verifican `es_editor(establecimiento_id)` y, si no, cortan con `42501`;
2. bloquean la fila del lote (`select ... from public.lotes where id = ... for update`) **antes de leer el saldo** [Decidido]. Hay dos editores: si los dos registran una baja de la misma categoría al mismo tiempo, el segundo espera a que termine el primero y valida con el saldo ya actualizado. Sin el bloqueo, los dos podrían ver 10 cabezas, sacar 8 cada uno y dejar el saldo en -6;
3. validan que el lote esté activo, que la fecha no sea futura ni anterior a la apertura, y que la categoría sea de la especie del lote;
4. insertan los eventos;
5. verifican que el **saldo por categoría nunca quede negativo**, en ninguna fecha [Propuesta]. Se suman los eventos por día y se acumulan en orden de fecha: el saldo al final de cada día tiene que ser mayor o igual a cero. Se compara por día y no evento por evento, porque los eventos de una misma operación tienen la misma fecha y hora de carga.

Funciones de la Etapa 3:

| Función | Qué hace |
|---|---|
| `crear_lote(p_establecimiento_id, p_especie_id, p_nombre, p_fecha_apertura, p_composicion jsonb, p_potrero_id, p_campana, p_notas)` | crea el lote y un evento `alta_inicial` por categoría, por ejemplo `[{"categoria_id": "...", "cabezas": 120}]` |
| `registrar_ajuste(p_lote_id, p_categoria_id, p_cabezas, p_fecha, p_nota)` | corrección con signo; la nota es obligatoria |
| `cerrar_lote(p_lote_id, p_fecha, p_motivo)` | cierra el lote **solo si el stock de todas sus categorías es cero** [Decidido]; deja un registro `cierre` |
| `reabrir_lote(p_lote_id, p_fecha, p_motivo)` | vuelve a abrir un lote cerrado [Decidido]; deja un registro `reapertura` |

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

- **`security_invoker = true` es obligatorio.** Sin eso, la vista corre con los permisos de su dueño y **se saltea el RLS**: cualquier usuario vería el stock de todos los establecimientos. Requiere **Postgres 15 o superior**: la versión se verifica antes de correr las migraciones [Decidido]. En una versión anterior, la opción da error al crear la vista, así que la migración falla en vez de dejar una vista insegura.
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

### 7.5 Permisos (GRANT) [Decidido]

El RLS decide **qué filas**. Los permisos deciden **qué operaciones** se pueden intentar. Van las dos capas:

- **Todo objeto nuevo nace sin permisos**: la migración base saca los permisos por defecto que el reseteo dejaba para `anon` y `authenticated`. Cada migración otorga explícitamente lo que hace falta, así nada queda abierto por olvido en las etapas siguientes.
- **`anon` no tiene ningún permiso** sobre tablas, vistas ni funciones de `public`. Sin sesión, cualquier llamada da `42501`.
- **`authenticated`** tiene:
  - `select` en todas las tablas y vistas (el RLS filtra las filas);
  - `insert` y `update` solo en `personas`, `especies`, `categorias_animales`, `rubros` y `potreros`, y **por columna**: nunca `id`, `created_by`, `created_at` ni `updated_at` (la auditoría no se puede falsear), y `establecimiento_id` (y `especie_id` en categorías) solo al dar de alta, no al editar;
  - en `establecimientos`, `update` solo de los datos descriptivos y `estado`;
  - en `lotes`, **sin `update` sobre la tabla**: solo por columna (`nombre`, `campana`, `potrero_id`, `notas`);
  - ningún `delete` ni `truncate` en ninguna tabla.
- **Funciones `security definer`**: todas llevan `set search_path = ''`, `revoke execute ... from public, anon` y `grant execute ... to authenticated`. Las que escriben validan `es_editor` adentro antes de hacer nada.
- **Funciones internas** (con `_` adelante, como `_cargar_catalogos_base` y `_validar_saldo`) y **funciones de trigger**: `revoke execute` también a `authenticated`. No se pueden llamar por la API.

**Detalle de Supabase.** El reseteo de la Etapa 2 deja, por defecto, permisos para `anon` sobre todo lo nuevo de `public`. La migración base saca esos permisos por defecto y revoca explícitamente sobre cada objeto. Además, Postgres da `execute` a `public` sobre toda función nueva, y eso no se puede sacar por esquema: por eso el `revoke` va función por función.

---

## 8. Esquema incremental: qué entra en cada etapa

| Etapa | Tablas | Funciones y vistas |
|---|---|---|
| **3** | establecimientos, membresias, personas, especies, categorias_animales, rubros, potreros, parametros, lotes, lote_eventos, operaciones_lote, operacion_lote_vinculos, lote_cambios_estado | es_miembro, es_editor, mi_rol, crear_establecimiento, _cargar_catalogos_base, crear_lote, registrar_ajuste, cerrar_lote, reabrir_lote, _validar_saldo, set_updated_at, bloquear_modificacion; v_stock_lote, v_stock_establecimiento. En la app: login mínimo y adaptación de establecimientos y potreros (Etapa 3b) |
| 5 | bitacora_entradas, bitacora_lotes | dividir_lote, unir_lotes, recategorizar_lote, linaje_lote, stock_al |
| 6a | actividades, actividad_lineas, act_compraventa, act_mortandad, act_paricion, movimientos_economicos; se agrega `lote_eventos.actividad_id` | registrar_actividad (pesada, mortandad, compra, venta, parición, con el movimiento económico de compra y venta) |
| 6b | act_sanidad, act_servicio, act_diagnostico, act_destete, act_esquila, act_personalizada | registrar_actividad se extiende |
| 7 | (ninguna) | v_indicadores_reproductivos, v_resultado_rubro, ganancia de peso por lote |
| 8 | tareas | contadores de vencidas y próximas |
| 9 | (ninguna; quizás invitaciones pendientes) | invitar_miembro, cambiar_rol, quitar_miembro, con regla de "no se puede quitar al último editor" |

---

## 9. Decisiones de aprobación (2026-10-15)

1. **`uuid`** en todas las tablas.
2. **La Etapa 3 incluye** un login mínimo (email y contraseña, `proxy.ts`, cierre de sesión) y la adaptación de establecimientos y potreros a `uuid` y a `crear_establecimiento()`. La navegación y el diseño siguen en la Etapa 4.
3. **`uso_actual`**: Ganadería, Forestación, Reserva y Sin uso, como valores de catálogo en `parametros`, no como enum.
4. **`cerrar_lote`** solo con stock en cero. Se agrega **`reabrir_lote`**, que deja registro.
5. **`parametros` iniciales**: los 19 departamentos y las pasturas campo natural, campo natural mejorado, pradera, verdeo de invierno y verdeo de verano.
6. **Registro abierto desactivado**: los usuarios los crea el administrador desde el panel de Supabase.

Agregados al diseño:

- a) Permisos: sección 7.5.
- b) Bloqueo de la fila del lote antes de leer el saldo: sección 5.
- c) Ninguna cascada hacia los eventos y bajas lógicas: sección 2.10 bis.
- d) Verificación de la versión de Postgres antes de migrar: sección 6.

Antes de correr las migraciones (Etapa 3b), el administrador verifica:

- `select version();` → Postgres 15 o superior;
- que no haya triggers sobre `auth.users` que dependan de `public` (el reseteo los borraría con `cascade`).

Etapa 3 en dos tandas:

- **3a**: este documento, las migraciones y el script de pruebas de RLS. No se corre nada contra Supabase.
- **3b**: correr el reseteo y las migraciones, correr las pruebas, y hacer el login mínimo y la adaptación de establecimientos y potreros.
