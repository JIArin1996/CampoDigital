# Campo Digital — Sistema de diseño

Estado: vigente desde la Etapa 4 (2026-10-16). Fuente de verdad del código: `frontend/app/globals.css` (colores), `frontend/components/ui/*` (componentes base), `frontend/components/shared/estilos.ts` (clases de tamaño) y `frontend/components/layout/*` (navegación).

## 1. Principios

- **Se usa a campo, con el teléfono y al sol.** Todo se decide primero para el celular, con una mano.
- **Alto contraste.** Ningún texto por debajo de 6:1 sobre su fondo (WCAG AA pide 4,5:1).
- **Objetivos táctiles de 44 px** en el celular (botones, campos, ítems de lista). En escritorio (`md:`, 768 px o más) se compactan a 36 px.
- **Solo tema claro.** Un único tema, sin modo oscuro [Decidido].
- **Lo que no se puede hacer no se muestra.** Los botones de carga y edición aparecen solo para el rol que los puede usar; la base igual lo valida (RLS).

## 2. Color — "verde campo"

| Token | Valor | Uso | Contraste sobre blanco |
|---|---|---|---|
| `--background` / `--card` | `#ffffff` | fondo, tarjetas | — |
| `--foreground` | `#101911` | texto principal | 18:1 |
| `--muted-foreground` | `#4b564d` | texto secundario, ayudas | 7,7:1 |
| `--primary` | `#196632` | botón principal, pestaña activa, botón "+" | 7,1:1 (texto blanco encima: 6,9:1) |
| `--secondary` / `--accent` | `#e3f4e6` / `#d6f0da` | fondos suaves, ícono activo, chips | texto verde oscuro encima: 11:1 |
| `--muted` | `#f0f5f1` | fondos neutros, esqueletos de carga | — |
| `--destructive` | `#c2181d` | errores, bajas, cabezas negativas | 6,1:1 |
| `--input` | gris verdoso medio | borde de campos de formulario | 3,6:1 (WCAG pide 3:1 para controles) |
| `--border` | gris verdoso claro | separadores de tarjetas y listas | decorativo |
| `--etiqueta-idea`, `--etiqueta-observacion`, `--etiqueta-compra` (+ `-texto`) | ámbar, celeste y violeta suaves | chips de tipo de la bitácora (la decisión usa `--accent`) | texto sobre su fondo: 8,8 a 9,7:1 |
| Color de especie (`especies.color`, `#rrggbb`) | lo elige el administrador en Especies; vacío = el de su grupo: bovino `#196632` (el verde de la marca), ovino `#c5770f`, otro `#667383` | pantalla Lotes (franja de la tarjeta, punto del encabezado, franja del cuadro de stock) y tarjeta de la especie. Helper `colorDeEspecie` en `components/lotes/agrupacion.ts`; el tono suave se deriva con `color-mix` (no se guarda) y el texto encima lo elige `textoSobre` (blanco o casi negro, el de mayor contraste) | gráfico; el texto encima se calcula |

Los valores se definen en `oklch` en `globals.css`; los hex son de referencia. No se usan colores sueltos de Tailwind (`green-100`, etc.) para estados: siempre los tokens.

## 3. Tipografía

- Fuente: Geist (sans), cargada por Next.
- En el celular los campos usan `text-base` (16 px): con menos, el iPhone hace zoom al tocar el campo.
- Números de stock y cabezas: `tabular-nums` y peso semibold o bold, para leerlos rápido.
- Títulos de página: `text-2xl font-bold`. Títulos de tarjeta: `text-base`.

## 4. Tamaños táctiles

Ya vienen en los componentes base:

| Componente | Celular | Escritorio |
|---|---|---|
| `Button` (default) | 44 px (`h-11`) | 36 px (`h-9`) |
| `Button` `sm` | 40 px | 32 px |
| `Button` `icon` | 44 × 44 | 36 × 36 |
| `Input`, `SelectTrigger` | 44 px | 36 px |
| Ítems de lista navegables | 56 px (`h-14`) o tarjeta con `py-3`/`py-4` | igual |

Para selects y campos sueltos se usan las clases de `components/shared/estilos.ts` (`CAMPO`, `SELECT_NATIVO`, `BOTON`, `TEXTAREA`). Los selects son **nativos** (`<select>`): en el celular abren el selector del sistema, que es el más cómodo.

## 5. Navegación

**Celular:**

```
┌─ Santa Remigia ▾ ─────────── (foto) ┐  encabezado fijo (h-14): establecimiento y perfil
│                                     │
│        contenido de la página       │
│                               [ + ] │  botón de carga rápida
├───────┬───────┬───────┬───────┬─────┤
│Inicio │ Lotes │Bitác. │Calend.│ Más │  barra inferior fija (h-16)
└───────┴───────┴───────┴───────┴─────┘
```

- **Barra inferior** [Decidido]: Inicio, Lotes, Bitácora, Calendario y Más. Son las cuatro prioridades del enfoque a un toque.
- **Más**: atajos a lo que no entra en la barra (Economía, Actividades, Indicadores y Potreros, según el rol), el botón **⚙ Configuraciones** (solo administrador), Mi perfil y Salir.
- **Configuraciones** (solo administrador): pantalla aparte con Especies, Rubros, Establecimientos y Usuarios. Potreros salió de acá (2026-10-23): está en el menú para todos los roles.
- **Botón "+"** [Decidido]: carga rápida desde cualquier pantalla (nota de bitácora, actividad, nuevo lote, tarea). Solo para administrador u operador; no aparece dentro de formularios. Las opciones de etapas futuras se muestran como "Próximamente".
- Respeta la barra de gestos del teléfono (`env(safe-area-inset-bottom)`).

**Escritorio:** menú lateral fijo (`w-56`) con selector de establecimiento, secciones diarias (Inicio, Lotes, Economía, Actividades, Bitácora, Calendario, Indicadores y Potreros), el botón **⚙ Configuraciones** al fondo del menú (solo administrador) y, abajo, Mi perfil y Salir.

`PageContainer` deja el espacio de la navegación fija; toda página lo usa.

## 6. Patrones

- **Listas**: tarjetas con borde (`rounded-lg border bg-card`), toda la tarjeta es tocable cuando lleva a una ficha, con `ChevronRight` al final.
- **Vacío**: borde punteado, ícono, una frase y, si corresponde, la acción para empezar.
- **Cargando**: bloques `bg-muted animate-pulse` del tamaño aproximado del contenido.
- **Próximamente**: componente `Proximamente` con la etapa en que llega.
- **Errores**: debajo del formulario, en rojo, con `role="alert"`. Los de la base se traducen con `mensajeDeError`.
- **Confirmaciones**: `window.confirm` para acciones que cambian el acceso o el estado (desactivar, quitar rol).
- **Avisos breves**: `toast` (sonner) arriba a la derecha.
- **Rol**: chip con `ETIQUETA_ROL`; Consulta en gris (`secondary`), Administrador y Operador en verde.
- **Cabezas**: los números negativos (bajas) en rojo, con signo.
- **Lotes** (pantalla Lotes): primero los lotes activos, agrupados por especie en orden Bovinos, Ovinos, Otros (por `especies.grupo`), con encabezado "especie · cabezas · lotes"; dentro, por clase de lote (cría, recría, engorde, toros, otras) y de mayor a menor cabezas. La clase se deriva de la categoría predominante del lote (`components/lotes/agrupacion.ts`). Debajo, "Stock por especie": un cuadro por especie, uno al lado del otro (en el celular se deslizan de costado), con las columnas Categoría, Cantidad y Potrero, una fila por categoría y potrero, y el total.

## 7. App instalable

- `app/manifest.ts`: nombre, colores e íconos para "Agregar a la pantalla de inicio".
- **Logo** (2026-10-16): cuadros verdes en diagonal con un circuito que crece como planta, y el nombre "CAMPO DIGITAL". Verde del logo: `#2b7d31` (el `--primary` de la app, `#196632`, es un poco más oscuro para el contraste del texto).
  - `public/logo-campo-digital.webp`: logo completo con fondo transparente (login).
  - `public/isotipo.png`: solo la marca, sin el nombre, con fondo transparente (menú y encabezado).
  - Íconos de la app, con el isotipo sobre blanco: `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` (la marca dentro de la zona segura del 80 % central), `app/apple-icon.png` y `app/favicon.ico`.
  - Las imágenes se generan desde los originales con PIL: el logo y el isotipo desde el PNG sin fondo; los íconos desde la versión de mayor resolución, sobre blanco (iOS no admite transparencia en el ícono). Los originales no se versionan.
- Abre en `/inicio`, sin barra del navegador.
