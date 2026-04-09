"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Tag, MapPin, Scale, Info, Edit, Trash2, Layers, History } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { darBajaAnimal } from "@/lib/queries/animales"
import {
  getLotesManejo,
  asignarAnimalALote,
  quitarAnimalDeLote,
  getHistorialLoteAnimal,
  type LoteManejo,
} from "@/lib/queries/lotes_manejo"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

export function AnimalDetalle({ animal: initialAnimal }: { animal: any }) {
  const router = useRouter()
  const [animal, setAnimal] = useState(initialAnimal)
  const [modalBaja, setModalBaja] = useState(false)
  const [estadoBaja, setEstadoBaja] = useState("vendido")
  const [fechaBaja, setFechaBaja] = useState(() => new Date().toISOString().split("T")[0])
  const [enviando, setEnviando] = useState(false)

  // Lote state
  const [lotes, setLotes] = useState<LoteManejo[]>([])
  const [historialLote, setHistorialLote] = useState<any[]>([])
  const [modalLote, setModalLote] = useState(false)
  const [loteSeleccionado, setLoteSeleccionado] = useState("")
  const [fechaLote, setFechaLote] = useState(() => new Date().toISOString().split("T")[0])
  const [procesandoLote, setProcesandoLote] = useState(false)

  useEffect(() => {
    if (animal.establecimiento_id) {
      getLotesManejo(animal.establecimiento_id).then(setLotes).catch(() => {})
    }
    getHistorialLoteAnimal(animal.id).then(setHistorialLote).catch(() => {})
  }, [animal.id, animal.establecimiento_id])

  const handleAsignarLote = async () => {
    if (!loteSeleccionado) { toast.error("Seleccioná un lote"); return }
    setProcesandoLote(true)
    try {
      await asignarAnimalALote(animal.id, Number(loteSeleccionado), fechaLote)
      const loteObj = lotes.find(l => l.id === Number(loteSeleccionado))
      setAnimal((prev: any) => ({ ...prev, lote_actual: Number(loteSeleccionado), lote: loteObj ? { id: loteObj.id, nombre: loteObj.nombre } : null }))
      setHistorialLote(await getHistorialLoteAnimal(animal.id))
      toast.success("Animal asignado al lote")
      setModalLote(false)
      setLoteSeleccionado("")
    } catch (e: any) {
      toast.error(e.message || "Error al asignar lote")
    } finally {
      setProcesandoLote(false)
    }
  }

  const handleQuitarLote = async () => {
    if (!window.confirm("¿Quitar al animal de su lote actual?")) return
    setProcesandoLote(true)
    try {
      await quitarAnimalDeLote(animal.id, new Date().toISOString().split("T")[0])
      setAnimal((prev: any) => ({ ...prev, lote_actual: null, lote: null }))
      setHistorialLote(await getHistorialLoteAnimal(animal.id))
      toast.success("Animal quitado del lote")
    } catch (e: any) {
      toast.error(e.message || "Error al quitar del lote")
    } finally {
      setProcesandoLote(false)
    }
  }

  const handleBaja = async () => {
    setEnviando(true)
    try {
      await darBajaAnimal(animal.id, estadoBaja, fechaBaja)
      toast.success("Baja registrada correctamente")
      setModalBaja(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error al procesar la baja")
    } finally {
      setEnviando(false)
    }
  }

  const isActivo = animal.estado === 'activo'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-5 border rounded-lg">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-primary/10 text-primary flex items-center justify-center rounded-full">
            <Tag className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{animal.caravana_snig}</h1>
            <p className="text-muted-foreground font-medium">
              SNIG • {animal.categoria} • {animal.sexo}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
           <Badge variant={isActivo ? "default" : "secondary"} className="text-sm px-3 py-1 uppercase tracking-wider">
             {animal.estado}
           </Badge>
           <Link href={`/animales/${animal.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
             <Edit className="h-4 w-4 mr-2" />
             Editar Datos
           </Link>
           {isActivo && (
             <Button variant="destructive" size="sm" onClick={() => setModalBaja(true)}>
               <Trash2 className="h-4 w-4 mr-2" />
               Dar de Baja
             </Button>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* IDENTIFICACIÓN */}
        <Card>
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-base flex items-center text-muted-foreground"><Info className="h-4 w-4 mr-2 text-primary" /> Identificación</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-sm">
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-muted-foreground">Caravana Propia</span>
              <span className="font-medium">{animal.caravana_propia || "No especificada"}</span>
            </div>
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-muted-foreground">Raza</span>
              <span className="font-medium">{animal.raza || "Cruza genérica"}</span>
            </div>
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-muted-foreground">Establecimiento</span>
              <span className="font-medium">{animal.establecimiento?.nombre || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">F. Nacimiento</span>
              <span className="font-medium">{animal.fecha_nacimiento ? new Date(animal.fecha_nacimiento + 'T00:00:00').toLocaleDateString() : "Desconocida"}</span>
            </div>
          </CardContent>
        </Card>

        {/* UBICACIÓN ACTUAL */}
        <Card>
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-base flex items-center text-muted-foreground"><MapPin className="h-4 w-4 mr-2 text-primary" /> Ubicación</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-sm">
            {!isActivo ? (
              <div className="py-4 text-center text-muted-foreground italic">
                El animal ya no se encuentra en el establecimiento. Fue {animal.estado} el {animal.fecha_baja ? new Date(animal.fecha_baja + 'T00:00:00').toLocaleDateString() : 'fecha desconocida'}.
              </div>
            ) : animal.parcela ? (
              <>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Tipo de espacio</span>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">Parcela</Badge>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Nombre</span>
                  <Link href={`/establecimientos/${animal.establecimiento_id}`} className="font-medium hover:underline text-primary">
                    {animal.parcela.nombre}
                  </Link>
                </div>
              </>
            ) : animal.potrero ? (
              <>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Tipo de espacio</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700">Potrero</Badge>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Nombre</span>
                  <Link href={`/establecimientos/${animal.establecimiento_id}`} className="font-medium hover:underline text-primary">
                    {animal.potrero.nombre}
                  </Link>
                </div>
              </>
            ) : (
               <div className="py-4 text-center text-muted-foreground italic">
                 Animal sin ubicar o en tránsito
               </div>
            )}
          </CardContent>
        </Card>

        {/* INGRESO Y ORIGEN */}
        <Card>
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-base flex items-center text-muted-foreground"><Scale className="h-4 w-4 mr-2 text-primary" /> Ingreso / Origen</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-sm">
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-muted-foreground">Origen</span>
              <span className="font-medium">{animal.origen || "No especificado"}</span>
            </div>
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-muted-foreground">Peso Entrada</span>
              <span className="font-medium">{animal.peso_entrada ? `${animal.peso_entrada} kg` : "N/A"}</span>
            </div>
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-muted-foreground">Fecha Peso</span>
              <span className="font-medium">{animal.fecha_peso_entrada ? new Date(animal.fecha_peso_entrada + 'T00:00:00').toLocaleDateString() : "N/A"}</span>
            </div>
            <div className="flex justify-between">
               <span className="text-muted-foreground">Registro de Alta</span>
               <span className="font-medium text-xs text-muted-foreground">{new Date(animal.created_at).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* LOTE DE MANEJO */}
      {isActivo && (
        <Card>
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center text-muted-foreground">
                <Layers className="h-4 w-4 mr-2 text-primary" /> Lote de Manejo
              </CardTitle>
              <div className="flex gap-2">
                {animal.lote ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setModalLote(true)} disabled={procesandoLote}>
                      Cambiar lote
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={handleQuitarLote} disabled={procesandoLote}>
                      Quitar del lote
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setModalLote(true)} disabled={procesandoLote || lotes.length === 0}>
                    Asignar a lote
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 text-sm">
            {animal.lote ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  {animal.lote.nombre}
                </span>
                <span className="text-xs text-muted-foreground">lote actual</span>
              </div>
            ) : (
              <p className="text-muted-foreground italic text-sm">
                {lotes.length === 0
                  ? "No hay lotes creados. Creá uno en el módulo de Animales → Lotes."
                  : "Sin lote asignado"}
              </p>
            )}

            {/* Historial */}
            {historialLote.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" /> Historial
                </p>
                <ul className="space-y-1.5">
                  {historialLote.map((h: any) => (
                    <li key={h.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{h.lote?.nombre ?? "Lote eliminado"}</span>
                      <span>
                        {new Date(h.fecha_entrada + "T00:00:00").toLocaleDateString("es-UY")}
                        {h.fecha_salida
                          ? ` → ${new Date(h.fecha_salida + "T00:00:00").toLocaleDateString("es-UY")}`
                          : " → actual"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

       {/* OBSERVACIONES */}
       {animal.observaciones && (
         <Card>
           <CardHeader className="pb-2">
             <CardTitle className="text-sm text-muted-foreground">Observaciones</CardTitle>
           </CardHeader>
           <CardContent>
             <p className="text-sm bg-muted/30 p-3 rounded">{animal.observaciones}</p>
           </CardContent>
         </Card>
       )}

      {/* Modal Asignar / Cambiar Lote */}
      <Dialog open={modalLote} onOpenChange={open => { setModalLote(open); if (!open) setLoteSeleccionado("") }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{animal.lote ? "Cambiar Lote" : "Asignar a Lote"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Lote de Manejo <span className="text-destructive">*</span></Label>
              <Select value={loteSeleccionado} onValueChange={v => v !== null && setLoteSeleccionado(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(val: string | null) =>
                      val
                        ? (lotes.find(l => l.id.toString() === val)?.nombre ?? val)
                        : <span className="text-muted-foreground">Seleccionar lote...</span>
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {lotes.map(l => (
                    <SelectItem key={l.id} value={l.id.toString()}>{l.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de Entrada</Label>
              <Input type="date" value={fechaLote} onChange={e => setFechaLote(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setModalLote(false)} disabled={procesandoLote}>Cancelar</Button>
            <Button onClick={handleAsignarLote} disabled={procesandoLote || !loteSeleccionado}>
              {procesandoLote ? "Procesando..." : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Dar de Baja */}
      <Dialog open={modalBaja} onOpenChange={setModalBaja}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar de Baja Animal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-1.5">
               <Label>Motivo de Baja</Label>
               <Select value={estadoBaja} onValueChange={v => v !== null && setEstadoBaja(v)}>
                 <SelectTrigger>
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="vendido">Vendido</SelectItem>
                   <SelectItem value="muerto">Muerto</SelectItem>
                   <SelectItem value="transferido">Transferido a otro titular</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             
             <div className="space-y-1.5">
                <Label>Fecha <span className="text-destructive">*</span></Label>
                <Input type="date" value={fechaBaja} onChange={e => setFechaBaja(e.target.value)} required />
             </div>

             <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-md mt-4">
               <strong>Atención:</strong> Esta acción removerá al animal del stock y limpiará su ubicación espacial actual. Sin embargo, no se borrará su historial anterior ni los registros sanitarios.
             </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-4">
             <Button variant="outline" onClick={() => setModalBaja(false)} disabled={enviando}>Cancelar</Button>
             <Button variant="destructive" onClick={handleBaja} disabled={enviando}>{enviando ? "Procesando..." : "Confirmar Baja"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
