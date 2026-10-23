"use client"

import { useEffect, useState } from "react"
import { List, Map as IconoMapa, Plus } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getCategorias, getEspecies, getLotes, getStockLotes } from "@/lib/queries/lotes"
import {
  desactivarPotrero, getEstadiasAbiertas, getFormasPotreros, getPotreros, reactivarPotrero, type FormaPotrero,
} from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PotreroForm } from "@/components/forms/PotreroForm"
import { ListaPotreros } from "@/components/potreros/ListaPotreros"
import { VistaMapa } from "@/components/potreros/VistaMapa"
import { CambiarPotreroDialog } from "@/components/potreros/CambiarPotreroDialog"
import { HistorialPotrero } from "@/components/potreros/HistorialPotrero"
import { armarOcupacion, numero, type AccionesPotrero, type LoteEnPotrero } from "@/components/potreros/ocupacion"
import { cn } from "@/lib/utils"
import type { Estadia, Potrero } from "@/types/database"
import type { Lote } from "@/types/lotes"

type Vista = "mapa" | "lista"
const CLAVE_VISTA = "potreros.vista"

interface Datos {
  estId: string
  potreros: Potrero[]                          // activos e inactivos
  lotes: Lote[]                                // activos
  estadias: Map<string, Estadia>
  ocupacion: Map<string, LoteEnPotrero[]>
  formas: Map<string, FormaPotrero>
}

function vistaGuardada(): Vista | null {
  try {
    const v = localStorage.getItem(CLAVE_VISTA)
    return v === "mapa" || v === "lista" ? v : null
  } catch {
    return null
  }
}

export default function PotrerosPage() {
  const { establecimientoActivo, puedeOperar, cargando: cargandoCtx } = useEstablecimiento()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [vista, setVista] = useState<Vista | null>(null)   // null: todavía no se eligió (depende de si hay dibujados)

  // Diálogos
  const [formAbierto, setFormAbierto] = useState(false)
  const [aEditar, setAEditar] = useState<Potrero | null>(null)
  const [ingresarA, setIngresarA] = useState<Potrero | null>(null)
  const [historialDe, setHistorialDe] = useState<Potrero | null>(null)

  const estId = establecimientoActivo?.id

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([
      getPotreros(estId, { incluirInactivos: true }),
      getLotes(estId, "activo"),
      getStockLotes(estId),
      getEstadiasAbiertas(estId),
      getEspecies(estId),
      getCategorias(estId, { incluirInactivas: true }),
      getFormasPotreros(estId),
    ])
      .then(([potreros, lotes, stock, abiertas, especies, categorias, formas]) => {
        if (!vigente) return
        const estadias = new Map(abiertas.map(e => [e.lote_id, e]))
        setDatos({
          estId, potreros, lotes, estadias,
          ocupacion: armarOcupacion(lotes, stock, estadias, especies, categorias),
          formas: new Map(formas.map(f => [f.id, f])),
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los potreros")) })
    return () => { vigente = false }
  }, [estId, version])

  const recargar = () => setVersion(v => v + 1)
  const listos = datos?.estId === estId ? datos : null

  const acciones: AccionesPotrero = {
    editar: p => { setAEditar(p); setFormAbierto(true) },
    ingresar: p => setIngresarA(p),
    historial: p => setHistorialDe(p),
    // Con lotes adentro no se puede (la base también lo impide): primero se mueven
    desactivar: async p => {
      const adentro = listos?.ocupacion.get(p.id) ?? []
      if (adentro.length > 0) {
        toast.error(`${p.nombre} tiene lotes adentro (${adentro.map(x => x.lote.nombre).join(", ")}): primero movelos a otro potrero`)
        return
      }
      if (!window.confirm(`¿Desactivar el potrero "${p.nombre}"? Se puede reactivar después.`)) return
      try {
        await desactivarPotrero(p.id)
        toast.success("Potrero desactivado")
        recargar()
      } catch (err) {
        toast.error(mensajeDeError(err, "Error al desactivar el potrero"))
      }
    },
    reactivar: async p => {
      try {
        await reactivarPotrero(p.id)
        toast.success(`${p.nombre} reactivado`)
        recargar()
      } catch (err) {
        toast.error(mensajeDeError(err, "Error al reactivar el potrero"))
      }
    },
  }

  const skeleton = <div className="h-96 rounded-lg border bg-muted/30 animate-pulse" />

  if (cargandoCtx) return <PageContainer>{skeleton}</PageContainer>

  if (!establecimientoActivo) {
    return (
      <PageContainer>
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground text-sm">
          Seleccioná un establecimiento para ver los potreros.
        </div>
      </PageContainer>
    )
  }

  if (!listos) return <PageContainer>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : skeleton}</PageContainer>

  const activos = listos.potreros.filter(p => p.estado === "activo")
  const superficie = activos.reduce((s, p) => s + Number(p.superficie), 0)
  // Vista: la elegida (o la guardada); si no, el mapa cuando hay algo dibujado
  const vistaActual: Vista = vista ?? vistaGuardada() ?? (listos.formas.size > 0 ? "mapa" : "lista")
  const elegirVista = (v: Vista) => {
    setVista(v)
    try { localStorage.setItem(CLAVE_VISTA, v) } catch { /* se recuerda solo en esta visita */ }
  }
  const pestaña = (v: Vista, label: string, Icono: typeof List) => (
    <button type="button" role="tab" aria-selected={vistaActual === v} onClick={() => elegirVista(v)}
      className={cn("flex flex-1 min-h-11 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors",
        vistaActual === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      <Icono className="h-4 w-4" /> {label}
    </button>
  )

  return (
    <PageContainer ancho={vistaActual === "mapa"}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-bold">Potreros</h1>
          {activos.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {numero(superficie)} ha
              {establecimientoActivo.superficie_total ? ` de ${numero(establecimientoActivo.superficie_total)} ha totales` : " en total"}
            </p>
          )}
        </div>
        {puedeOperar && (
          <Button className="h-11 md:h-8" size="sm" onClick={() => { setAEditar(null); setFormAbierto(true) }}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1 mb-4 md:max-w-xs">
        {pestaña("mapa", "Mapa", IconoMapa)}
        {pestaña("lista", "Lista", List)}
      </div>

      {vistaActual === "mapa" ? (
        <VistaMapa potreros={activos} formas={listos.formas} ocupacion={listos.ocupacion} puedeOperar={puedeOperar} acciones={acciones} />
      ) : (
        <ListaPotreros potreros={listos.potreros} ocupacion={listos.ocupacion} puedeOperar={puedeOperar} acciones={acciones} />
      )}

      {/* Alta y edición de potrero */}
      <Dialog open={formAbierto} onOpenChange={o => { if (!o) { setFormAbierto(false); setAEditar(null) } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{aEditar ? "Editar potrero" : "Nuevo potrero"}</DialogTitle>
          </DialogHeader>
          <PotreroForm
            key={aEditar?.id ?? "nuevo"}
            establecimiento_id={establecimientoActivo.id}
            initialData={aEditar ?? undefined}
            onSuccess={() => { setFormAbierto(false); setAEditar(null); recargar() }}
            onCancel={() => { setFormAbierto(false); setAEditar(null) }}
          />
        </DialogContent>
      </Dialog>

      {/* Ingresar un lote al potrero: los lotes activos que no están en él */}
      {ingresarA && (
        <CambiarPotreroDialog key={ingresarA.id} abierto potreroDestino={ingresarA.id}
          onCerrar={() => setIngresarA(null)}
          onHecho={() => { setIngresarA(null); recargar() }}
          lotes={listos.lotes.filter(l => listos.estadias.get(l.id)?.potrero_id !== ingresarA.id)}
          potreros={activos} estadias={listos.estadias} />
      )}

      {historialDe && <HistorialPotrero potrero={historialDe} onCerrar={() => setHistorialDe(null)} />}
    </PageContainer>
  )
}
