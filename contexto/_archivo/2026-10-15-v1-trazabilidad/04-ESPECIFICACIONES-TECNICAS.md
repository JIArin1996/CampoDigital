# Campo Digital - Especificaciones Técnicas

## Stack

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | Next.js | 16 (App Router) |
| UI runtime | React | 19 |
| Estilos | Tailwind CSS | 4 |
| Validación | Zod + react-hook-form | 4 / 7 |
| Componentes UI | shadcn/ui | latest |
| Base de datos | Supabase (PostgreSQL) | - |
| SDK cliente | @supabase/supabase-js | 2+ |
| Hosting | Vercel | - |
| Control de versiones | Git + GitHub | - |

---

## Estructura del proyecto Next.js

```
campo-digital/
├── app/
│   ├── layout.tsx               // Layout raíz
│   ├── page.tsx                 // Dashboard (página principal)
│   ├── establecimientos/
│   │   ├── page.tsx             // Listado
│   │   ├── nuevo/page.tsx       // Formulario alta
│   │   └── [id]/page.tsx        // Detalle + potreros
│   ├── animales/
│   │   ├── page.tsx
│   │   ├── nuevo/page.tsx
│   │   └── [id]/page.tsx
│   ├── movimientos/
│   │   ├── page.tsx
│   │   └── nuevo/page.tsx
│   ├── sanidad/
│   ├── pesajes/
│   ├── reproduccion/
│   ├── agricultura/
│   ├── insumos/
│   ├── maquinaria/
│   ├── finanzas/
│   └── personal/
├── components/
│   ├── ui/                      // shadcn/ui components
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Navbar.tsx
│   │   └── PageContainer.tsx
│   ├── forms/
│   │   ├── EstablecimientoForm.tsx
│   │   ├── PotreroForm.tsx
│   │   ├── ParcelaForm.tsx
│   │   ├── AnimalForm.tsx
│   │   ├── MovimientoForm.tsx
│   │   └── ...
│   └── shared/
│       ├── DataTable.tsx        // Tabla reutilizable
│       ├── SelectParametro.tsx  // Select dinámico desde parametros
│       ├── StockBadge.tsx
│       └── EmptyState.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts            // Cliente Supabase browser
│   │   └── server.ts            // Cliente Supabase server
│   ├── queries/
│   │   ├── establecimientos.ts
│   │   ├── animales.ts
│   │   ├── movimientos.ts
│   │   ├── stock.ts             // Cálculo de stock actual
│   │   └── parametros.ts
│   └── utils/
│       ├── formatters.ts        // Fechas, moneda, números
│       └── validators.ts
├── types/
│   └── database.ts              // Tipos TypeScript generados desde Supabase
├── public/
│   ├── manifest.json            // PWA
│   └── icons/
├── .env.local                   // Variables de entorno (no commitear)
└── .env.example                 // Plantilla de variables (sí commitear)
```

---

## Conexión con Supabase

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )
}
```

---

## Variables de entorno

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxxxxx
```

---

## Patrón de queries

```typescript
// lib/queries/establecimientos.ts
import { createClient } from '@/lib/supabase/client'

export async function getEstablecimientos() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .select('*')
    .eq('estado', 'activo')
    .order('nombre')
  
  if (error) throw error
  return data
}

export async function createEstablecimiento(values: EstablecimientoInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .insert(values)
    .select()
    .single()
  
  if (error) throw error
  return data
}
```

---

## Cálculo de stock actual

El stock no se guarda como número fijo. Se calcula siempre desde los movimientos:

```typescript
// lib/queries/stock.ts
export async function getStockActual(
  establecimiento_id: number,
  ubicacion_tipo?: string,
  ubicacion_id?: number
) {
  const supabase = createClient()
  
  // Se puede implementar como vista en Supabase o query directa
  const { data, error } = await supabase
    .from('movimientos_ganado')
    .select('tipo_movimiento, categoria, cantidad, origen_tipo, origen_id, destino_tipo, destino_id')
    .eq('establecimiento_id', establecimiento_id)
  
  if (error) throw error
  
  // Agrupar y sumar/restar por categoría y ubicación
  const stock: Record<string, number> = {}
  
  for (const mov of data) {
    const key = mov.categoria
    if (!stock[key]) stock[key] = 0
    
    const esEntrada = ['Compra', 'Nacimiento'].includes(mov.tipo_movimiento) ||
      (mov.tipo_movimiento === 'Traslado' && mov.destino_tipo === ubicacion_tipo && mov.destino_id === ubicacion_id)
    
    const esSalida = ['Venta', 'Muerte'].includes(mov.tipo_movimiento) ||
      (mov.tipo_movimiento === 'Traslado' && mov.origen_tipo === ubicacion_tipo && mov.origen_id === ubicacion_id)
    
    if (esEntrada) stock[key] += mov.cantidad
    if (esSalida) stock[key] -= mov.cantidad
  }
  
  return stock
}
```

---

## Parámetros dinámicos

```typescript
// lib/queries/parametros.ts
let cache: Record<string, string[]> = {}

export async function getParametros(clave: string): Promise<string[]> {
  if (cache[clave]) return cache[clave]
  
  const supabase = createClient()
  const { data, error } = await supabase
    .from('parametros')
    .select('valor')
    .eq('clave', clave)
    .eq('activo', true)
    .order('orden')
  
  if (error) throw error
  
  const valores = data.map(d => d.valor)
  cache[clave] = valores
  return valores
}

// Componente SelectParametro
// components/shared/SelectParametro.tsx
export function SelectParametro({ clave, value, onChange, placeholder }) {
  const [opciones, setOpciones] = useState<string[]>([])
  
  useEffect(() => {
    getParametros(clave).then(setOpciones)
  }, [clave])
  
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opciones.map(op => (
          <SelectItem key={op} value={op}>{op}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

---

## PWA - Configuración mínima

```json
// public/manifest.json
{
  "name": "Campo Digital",
  "short_name": "CampoD",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#166534",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## Tipos TypeScript desde Supabase

Supabase puede generar los tipos automáticamente desde la base de datos:

```bash
npx supabase gen types typescript --project-id TU_PROJECT_ID > types/database.ts
```

Esto genera tipos para todas las tablas que se usan en los queries con type safety completo.

---

## Consideraciones de performance

- Cachear parámetros en memoria al inicio (no cambian frecuentemente)
- Limitar queries de movimientos a los últimos 100 por defecto, paginar el resto
- El cálculo de stock se puede materializar como vista en Supabase si el volumen crece
- Usar Server Components de Next.js para queries iniciales (más rápido en mobile)
- Imágenes y assets en Vercel CDN
