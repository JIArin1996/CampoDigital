"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { actualizarRubro, crearRubro, definirRubroEspecie, getRubrosTodos } from "@/lib/queries/economia"
import { getCatalogoEspecies } from "@/lib/queries/especies"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { BOTON, CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { Rubro } from "@/types/economia"
import type { Especie } from "@/types/lotes"

/**
 * Rubros de la economía (solo administrador): alta, nombre y baja, y el rubro por defecto de cada
 * especie (el que toman la compra y la venta). Un rubro dado de baja no se ofrece al cargar, pero
 * sus movimientos siguen contando.
 */
export default function RubrosPage() {
  const { establecimientoActivo, esAdmin, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id
  const [datos, setDatos] = useState<{ clave: string; rubros: Rubro[]; especies: Especie[] } | null>(null)
  const [version, setVersion] = useState(0)
  const [nuevo, setNuevo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const clave = `${estId}:${version}`
  useEffect(() => {
    if (!estId || !esAdmin) return
    let vigente = true
    Promise.all([getRubrosTodos(estId), getCatalogoEspecies(estId)])
      .then(([rubros, catalogo]) => {
        if (vigente) setDatos({ clave: `${estId}:${version}`, rubros, especies: catalogo.especies })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los rubros")) })
    return () => { vigente = false }
  }, [estId, esAdmin, version])

  if (cargando) return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!esAdmin) return <PageContainer><p className="text-muted-foreground">Los rubros los administra el administrador.</p></PageContainer>
  if (!establecimientoActivo) return <PageContainer><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>

  const listos = datos?.clave === clave ? datos : null

  const ejecutar = async (accion: () => Promise<unknown>, ok: string, despues?: () => void) => {
    setEnviando(true)
    setError(null)
    try {
      await accion()
      toast.success(ok)
      despues?.()
      setVersion(v => v + 1)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <PageContainer>
      <h1 className="text-2xl font-bold">Rubros</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Cada ingreso y gasto va a un rubro; el resultado económico se calcula por rubro.
      </p>

      {!listos ? <div className="h-64 rounded-lg border bg-muted/30 animate-pulse" /> : (
        <div className="space-y-6 max-w-xl">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <ul className="rounded-lg border divide-y">
                {listos.rubros.map(r => <FilaRubro key={r.id} rubro={r} enviando={enviando} ejecutar={ejecutar} />)}
              </ul>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input aria-label="Nuevo rubro" className={CAMPO} placeholder="Nuevo rubro" value={nuevo} onChange={e => setNuevo(e.target.value)} />
                <Button type="button" variant="outline" className={BOTON} disabled={enviando || !nuevo.trim()}
                  onClick={() => void ejecutar(() => crearRubro(estId!, nuevo.trim()), "Rubro agregado", () => setNuevo(""))}>
                  Agregar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-base">Rubro de cada especie</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Lo usan la compra y la venta cuando no se elige otro.</p>
              <ul className="divide-y">
                {listos.especies.map(e => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm">{e.nombre}</span>
                    <select aria-label={`Rubro de ${e.nombre}`} className={cn(SELECT_NATIVO, "w-48")} value={e.rubro_id ?? ""} disabled={enviando}
                      onChange={ev => void ejecutar(() => definirRubroEspecie(e.id, ev.target.value || null), "Rubro de la especie actualizado")}>
                      <option value="">Sin rubro</option>
                      {listos.rubros.filter(r => r.activo || r.id === e.rubro_id).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </PageContainer>
  )
}

function FilaRubro({ rubro, enviando, ejecutar }: {
  rubro: Rubro
  enviando: boolean
  ejecutar: (accion: () => Promise<unknown>, ok: string) => Promise<void>
}) {
  const [nombre, setNombre] = useState(rubro.nombre)
  const cambiado = nombre.trim() !== rubro.nombre
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <Input aria-label={`Nombre de ${rubro.nombre}`} className={cn(CAMPO, "flex-1 min-w-40", !rubro.activo && "text-muted-foreground line-through")}
        value={nombre} onChange={e => setNombre(e.target.value)} disabled={!rubro.activo} />
      {cambiado && (
        <Button type="button" size="sm" className="h-10 md:h-8" disabled={enviando || !nombre.trim()}
          onClick={() => void ejecutar(() => actualizarRubro(rubro.id, { nombre: nombre.trim() }), "Rubro renombrado")}>
          Guardar
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" className={cn("h-10 md:h-8", rubro.activo ? "text-muted-foreground" : "text-primary")} disabled={enviando}
        onClick={() => void ejecutar(() => actualizarRubro(rubro.id, { activo: !rubro.activo }), rubro.activo ? "Rubro dado de baja" : "Rubro reactivado")}>
        {rubro.activo ? "Dar de baja" : "Reactivar"}
      </Button>
    </li>
  )
}
