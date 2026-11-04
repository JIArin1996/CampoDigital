import { getNombresPersonalizadas, getRubros } from "@/lib/queries/actividades"
import { getPersonas } from "@/lib/queries/bitacora"
import { getCategorias, getEspecies, getLotes, getLotesPorIds, getStockLotes } from "@/lib/queries/lotes"
import { getParametros } from "@/lib/queries/parametros"
import { getPotreros } from "@/lib/queries/potreros"
import type { Potrero } from "@/types/database"
import type { CategoriaAnimal, Especie, Lote, StockLote } from "@/types/lotes"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]
type Rubro = Awaited<ReturnType<typeof getRubros>>[number]

// Lo que usan los formularios de carga y de edición de actividades
export interface DatosCarga {
  estId: string
  lotes: Lote[]
  especies: Especie[]
  categorias: CategoriaAnimal[]
  stock: StockLote[]
  potreros: Potrero[]
  personas: Persona[]
  rubros: Rubro[]
  causas: string[]
  categoriasSanidad: string[]
  vias: string[]
  nombresPersonalizadas: string[]
}

// Lotes activos y catálogos. Al editar, lotesDeLaActividad suma los lotes de la actividad aunque estén
// cerrados (por ejemplo, el de una venta que lo dejó en cero), para que se puedan volver a elegir.
export async function cargarDatosCarga(estId: string, lotesDeLaActividad: string[] = []): Promise<DatosCarga> {
  const [activos, especies, categorias, stock, potreros, personas, rubros, causas, categoriasSanidad, vias, nombresPersonalizadas] =
    await Promise.all([
      getLotes(estId, "activo"), getEspecies(estId), getCategorias(estId), getStockLotes(estId),
      getPotreros(estId), getPersonas(estId), getRubros(estId), getParametros("causas_mortandad"),
      getParametros("categorias_sanidad"), getParametros("vias_aplicacion"), getNombresPersonalizadas(estId),
    ])
  const faltan = lotesDeLaActividad.filter(id => !activos.some(l => l.id === id))
  const lotes = faltan.length > 0 ? [...activos, ...(await getLotesPorIds(faltan))] : activos
  return { estId, lotes, especies, categorias, stock, potreros, personas, rubros, causas, categoriasSanidad, vias, nombresPersonalizadas }
}
