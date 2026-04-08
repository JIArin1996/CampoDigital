"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { getAnimales } from "@/lib/queries/animales"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SelectParametro } from "@/components/shared/SelectParametro"
import { Input } from "@/components/ui/input"
import { buttonVariants, Button } from "@/components/ui/button"
import { Plus, Upload } from "lucide-react"
import { ExcelImportModal } from "@/components/animales/ExcelImportModal"

export function AnimalesClientWrapper() {
  const { establecimientoActivo } = useEstablecimiento()
  const establecimientoId = establecimientoActivo?.id || 0
  const [modalImportacionAbierto, setModalImportacionAbierto] = useState(false)
  
  const [animales, setAnimales] = useState<any[]>([])
  const [cargando, setCargando] = useState(false)
  
  // Filtros
  const [filtroSnig, setFiltroSnig] = useState("")
  const [filtroCategoria, setFiltroCategoria] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("activo")

  useEffect(() => {
    if (establecimientoId > 0) {
      setCargando(true)
      getAnimales(establecimientoId, {
        categoria: filtroCategoria || undefined,
        estado: filtroEstado || undefined
      }).then(data => {
        setAnimales(data)
        setCargando(false)
      }).catch(() => {
        setAnimales([])
        setCargando(false)
      })
    } else {
      setAnimales([])
    }
  }, [establecimientoId, filtroCategoria, filtroEstado])

  // Filtrado final en cliente para el input de texto (SNIG)
  const animalesMostrados = animales.filter(a => {
    if (filtroSnig && !a.caravana_snig.includes(filtroSnig) && !a.caravana_propia?.includes(filtroSnig)) return false
    return true
  })

  return (
    <div className="space-y-4">
      {/* Botones de Acción Superiores */}
      <div className="flex justify-end gap-2 w-full sm:w-auto flex-wrap mb-2">
        <Button variant="outline" onClick={() => setModalImportacionAbierto(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Importar Excel
        </Button>
        <Link href="/animales/nuevo" className={buttonVariants({ variant: "default" })}>
          <Plus className="h-4 w-4 mr-2" />
          Ingresar Animal
        </Link>
      </div>
      <ExcelImportModal open={modalImportacionAbierto} onOpenChange={(v) => {
         setModalImportacionAbierto(v);
         if (!v && establecimientoId > 0) {
            // Re-trigger useEffect trick or rely on router.refresh() inside modal
         }
      }} />

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 border rounded-lg bg-card">
        <div className="space-y-1.5 hidden md:block">
           <label className="text-xs font-medium text-muted-foreground opacity-0">Espacio</label>
           <div className="text-sm font-medium pt-2 px-1 opacity-70">
              {establecimientoActivo ? establecimientoActivo.nombre : "Cargando..."}
           </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Buscar SNIG / Propia</label>
          <Input 
            placeholder="Nº caravana..." 
            value={filtroSnig}
            onChange={e => setFiltroSnig(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Categoría</label>
          <SelectParametro
            clave="categorias_ganado"
            value={filtroCategoria}
            onChange={setFiltroCategoria}
            placeholder="Todas"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Estado</label>
          <Select value={filtroEstado} onValueChange={v => v !== null && setFiltroEstado(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="vendido">Vendidos</SelectItem>
              <SelectItem value="muerto">Muertos</SelectItem>
              <SelectItem value="transferido">Transferidos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla de Resultados */}
      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Caravana SNIG</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Sexo / Raza</th>
              <th className="px-4 py-3 font-medium">Ubicación Actual</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cargando ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Cargando animales...</td>
              </tr>
            ) : animalesMostrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No se encontraron animales que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              animalesMostrados.map(animal => (
                <tr key={animal.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-primary">{animal.caravana_snig}</div>
                    {animal.caravana_propia && <div className="text-xs text-muted-foreground">Propia: {animal.caravana_propia}</div>}
                  </td>
                  <td className="px-4 py-3">{animal.categoria}</td>
                  <td className="px-4 py-3">
                    <div>{animal.sexo}</div>
                    {animal.raza && <div className="text-xs text-muted-foreground">{animal.raza}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {animal.parcela ? (
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                        {animal.parcela.nombre} (P)
                      </span>
                    ) : animal.potrero ? (
                      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        {animal.potrero.nombre}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">Sin ubicar</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      animal.estado === 'activo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {animal.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/animales/${animal.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      Ver Ficha
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
