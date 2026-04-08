"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Calendar, Tag, MapPin, Scale, Info, Edit, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { darBajaAnimal } from "@/lib/queries/animales"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

export function AnimalDetalle({ animal }: { animal: any }) {
  const router = useRouter()
  const [modalBaja, setModalBaja] = useState(false)
  const [estadoBaja, setEstadoBaja] = useState("vendido")
  const [fechaBaja, setFechaBaja] = useState(() => new Date().toISOString().split("T")[0])
  const [enviando, setEnviando] = useState(false)

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
