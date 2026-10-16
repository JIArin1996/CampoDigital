# Campo Digital — Diseño de usuarios y roles (Etapa 3c)

Estado: **aprobado el 2026-10-16**. Migración: `supabase/migrations/20261016000100_etapa3c_usuarios_y_roles.sql`. Pruebas: `supabase/tests/etapa3_rls.sql` (cubre 3a y 3c).

Reemplaza los roles editor y lector de `DISENO-BASE-ETAPA-3.md`. Lo demás de ese documento sigue vigente.

---

## 1. Roles [Decidido]

| Rol | Alcance | Qué puede hacer |
|---|---|---|
| **Administrador** | Todo el sistema (`perfiles.es_admin`) | Todo, en todos los establecimientos, sin estar asignado. Exclusivo: crear y editar establecimientos, catálogos (especies, categorías, rubros, personas) y usuarios |
| **Operador** | Por establecimiento (`membresias.rol`) | Carga y edita el día a día: potreros, lotes y stock (más adelante actividades, bitácora, economía y tareas) |
| **Consulta** | Por establecimiento (`membresias.rol`) | Ve todo, incluida la economía. No edita nada |

- Al arrancar hay **un solo administrador** (el dueño del proyecto). Después se agregan usuarios y roles desde la app.
- **Nunca puede quedar el sistema sin un administrador activo**: un trigger lo impide (sección 3).

## 2. Helpers de permisos

| Helper | Verdadero si | Se usa para |
|---|---|---|
| `es_admin()` | el usuario es administrador y está activo | configuración y usuarios |
| `es_miembro(est)` | es administrador, o está asignado al establecimiento con cualquier rol, y está activo | ver (todas las políticas de select) |
| `puede_operar(est)` | es administrador, o es operador del establecimiento, y está activo | cargar y editar el día a día |
| `mi_rol(est)` | devuelve `administrador`, `operador`, `consulta` o `null` | la interfaz |

Todos son `security definer` con `search_path` fijo, como en la Etapa 3a. **Todos exigen perfil activo**: desactivar a un usuario le corta el acceso en el momento, aunque su sesión siga abierta.

## 3. Tabla perfiles

Un registro por usuario de Supabase Auth: email (copia que mantiene el sistema), nombre, apellido, celular (dato de contacto), ruta de la foto, `es_admin` y `activo`.

- Cada usuario ve y edita **su** perfil (nombre, apellido, celular, foto). El administrador ve y edita **todos**.
- `es_admin`, `activo` y `email` no se editan directo: van por las funciones de la sección 4 o por el servidor.
- Trigger `proteger_ultimo_admin`: rechaza cualquier cambio que deje el sistema sin administradores activos.
- `membresias.user_id` referencia a `perfiles`: toda membresía es de un usuario con perfil.

## 4. Gestión de usuarios

**En la base** (funciones `security definer`, exigen `es_admin()`):

| Función | Qué hace |
|---|---|
| `asignar_rol(usuario, establecimiento, rol)` | asigna o cambia el rol (operador o consulta). **Crea o reactiva la ficha del usuario en `personas`**, así aparece como responsable [Decidido] |
| `quitar_acceso(usuario, establecimiento)` | borra la membresía; la ficha en `personas` queda, inactiva |
| `definir_admin(usuario, sí/no)` | da o saca el rol de administrador |
| `definir_activo(usuario, sí/no)` | activa o desactiva al usuario en la base |

**En el servidor de la app** (server actions con la clave `service_role`, que primero verifican que quien llama sea administrador):

| Acción | Qué hace en Supabase Auth |
|---|---|
| Crear usuario | crea el usuario con email y **contraseña provisoria** (ya confirmado), su perfil y sus asignaciones. Cambiar la contraseña después es **opcional** [Decidido] |
| Resetear contraseña | pone una contraseña nueva que el administrador le pasa al usuario [Decidido]: es la forma de recuperar una contraseña olvidada mientras no haya SMTP propio |
| Cambiar email | cambia el email de acceso sin pedir confirmación por mail |
| Desactivar / reactivar | bloquea o desbloquea al usuario en Auth y lo marca inactivo. **No se borra**: su nombre sigue en lo que cargó [Decidido] |

La clave `service_role` va solo en `frontend/.env.local` y en Vercel como `SUPABASE_SERVICE_ROLE_KEY` (sin `NEXT_PUBLIC_`). Nunca llega al navegador ni al repo.

## 5. Fotos de perfil

Bucket privado `avatares` en Supabase Storage (máximo 1 MB; webp, jpeg o png). Cada usuario sube solo a su carpeta (`<user_id>/...`); cualquier usuario con sesión puede ver las fotos con URL firmada. La app achica la foto a 256 px en el teléfono antes de subirla.

## 6. Mail

No hay dominio propio todavía, así que no hay SMTP: no hay invitaciones ni "Olvidé mi contraseña" por mail. Cuando haya dominio, se configura SMTP (por ejemplo Resend) y se suma la recuperación por mail sin cambiar lo demás.

## 7. Arranque

1. El administrador crea su usuario en el panel de Supabase (Authentication → Users → Add user, con "Auto Confirm User").
2. Aplica la migración: le crea el perfil a todo usuario existente.
3. Se marca como administrador, una sola vez:
   ```sql
   update public.perfiles set es_admin = true where email = '<tu email>';
   ```
4. Desactiva el registro abierto (Authentication → Sign In / Providers). Desde ahí, todos los usuarios se crean desde la app.

## 8. Pantallas

- **Mi perfil** (todos): nombre, apellido, celular, foto, cambiar contraseña (pide la actual) y mis establecimientos con su rol.
- **Usuarios** (solo administrador): listado con foto, nombre, email, celular, estado y asignaciones; alta; edición de datos y email; reseteo de contraseña; asignar y quitar establecimientos y roles; hacer o dejar de ser administrador; desactivar y reactivar.
- **Login**: "Si te olvidaste la contraseña, pedile al administrador que la resetee".
