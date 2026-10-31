"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  actualizarConcepto, actualizarGrupoConcepto, borrarDeCatalogo, crearConcepto, crearGrupoConcepto, getConceptos, getGruposConcepto,
} from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FilaCatalogo } from "@/components/economia/FilaCatalogo"
import { BOTON, CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { Concepto, GrupoConcepto, Sentido } from "@/types/economia"

/**
 * Conceptos de la economía (Configuraciones > Economía, solo administrador): cada ingreso o gasto se carga con un concepto, que
 * puede ir en un grupo (Costos directos, Estructura...). El resultado se ve por concepto y por grupo.
 * Un concepto con movimientos no se borra: se da de baja (no se ofrece al cargar, pero sigue contando).
 */
export function SeccionConceptos({ estId }: { estId: string }) {
  const [datos, setDatos] = useState<{ clave: string; conceptos: Concepto[]; grupos: GrupoConcepto[] } | null>(null)
  const [version, setVersion] = useState(0)
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: Sentido; grupoId: string }>({ nombre: "", tipo: "egreso", grupoId: "" })
  const [nuevoGrupo, setNuevoGrupo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const clave = `${estId}:${version}`
  useEffect(() => {
    let vigente = true
    Promise.all([getConceptos(estId), getGruposConcepto(estId)])
      .then(([conceptos, grupos]) => { if (vigente) setDatos({ clave: `${estId}:${version}`, conceptos, grupos }) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los conceptos")) })
    return () => { vigente = false }
  }, [estId, version])


  const listos = datos?.clave === clave ? datos : null

  const ejecutar = async (accion: () => Promise<unknown>, ok: string, despues?: () => void) => {
    setEnviando(true)
    try {
      await accion()
      toast.success(ok)
      despues?.()
      setVersion(v => v + 1)
    } catch (err) {
      toast.error(mensajeDeError(err))   // la página es larga: el aviso se ve esté donde esté
    } finally {
      setEnviando(false)
    }
  }

  const chip = (activo: boolean) => cn("min-h-10 md:min-h-9 rounded-full border px-4 text-sm font-medium transition-colors",
    activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")

  const filaConcepto = (c: Concepto, grupos: GrupoConcepto[]) => (
    <FilaCatalogo key={`${c.id}:${c.nombre}`} etiqueta="concepto" nombre={c.nombre} activo={c.activo} enviando={enviando}
      onRenombrar={nombre => void ejecutar(() => actualizarConcepto(c.id, { nombre }), "Concepto renombrado")}
      onActivo={activo => void ejecutar(() => actualizarConcepto(c.id, { activo }), activo ? "Concepto reactivado" : "Concepto dado de baja")}
      onBorrar={() => void ejecutar(
        () => borrarDeCatalogo("conceptos", c.id, "El concepto tiene movimientos: no se borra, dalo de baja"), "Concepto borrado")}
      extra={
        <select aria-label={`Grupo de ${c.nombre}`} className={cn(SELECT_NATIVO, "w-44")} value={c.grupo_id ?? ""} disabled={enviando || !c.activo}
          onChange={e => void ejecutar(() => actualizarConcepto(c.id, { grupo_id: e.target.value || null }), "Grupo actualizado")}>
          <option value="">Sin grupo</option>
          {grupos.filter(g => g.activo || g.id === c.grupo_id).map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
      } />
  )

  const seccion = (titulo: string, lista: Concepto[], grupos: GrupoConcepto[]) => lista.length > 0 && (
    <div key={titulo} className="space-y-1.5">
      <h3 className="text-sm font-semibold text-muted-foreground">{titulo}</h3>
      <ul className="rounded-lg border divide-y">{lista.map(c => filaConcepto(c, grupos))}</ul>
    </div>
  )

  return (
    <section>
      <h2 className="text-lg font-semibold">Conceptos</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Cada ingreso y gasto se carga con un concepto; el resultado se puede ver por concepto y por grupo.
      </p>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}
      {!listos ? error ? null : <div className="h-64 rounded-lg border bg-muted/30 animate-pulse" /> : (() => {
        const ingresos = listos.conceptos.filter(c => c.tipo === "ingreso")
        const gastos = listos.conceptos.filter(c => c.tipo === "egreso")
        return (
          <div className="space-y-6 max-w-2xl">
            {/* Alta */}
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-base">Nuevo concepto</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2" role="group" aria-label="Ingreso o gasto">
                  <button type="button" aria-pressed={nuevo.tipo === "egreso"} className={chip(nuevo.tipo === "egreso")}
                    onClick={() => setNuevo({ ...nuevo, tipo: "egreso" })}>Gasto</button>
                  <button type="button" aria-pressed={nuevo.tipo === "ingreso"} className={chip(nuevo.tipo === "ingreso")}
                    onClick={() => setNuevo({ ...nuevo, tipo: "ingreso" })}>Ingreso</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                  <Input aria-label="Nombre del concepto" className={CAMPO} placeholder="Nombre" value={nuevo.nombre}
                    onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
                  <select aria-label="Grupo" className={SELECT_NATIVO} value={nuevo.grupoId} onChange={e => setNuevo({ ...nuevo, grupoId: e.target.value })}>
                    <option value="">Sin grupo</option>
                    {listos.grupos.filter(g => g.activo).map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                  </select>
                  <Button type="button" variant="outline" className={BOTON} disabled={enviando || !nuevo.nombre.trim()}
                    onClick={() => void ejecutar(
                      () => crearConcepto({ establecimiento_id: estId, nombre: nuevo.nombre.trim(), tipo: nuevo.tipo, grupo_id: nuevo.grupoId || null }),
                      "Concepto agregado", () => setNuevo({ ...nuevo, nombre: "" }))}>
                    Agregar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Conceptos: ingresos y gastos por grupo */}
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-base">Ingresos</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {ingresos.length === 0
                  ? <p className="text-sm text-muted-foreground">Sin conceptos de ingreso.</p>
                  : <ul className="rounded-lg border divide-y">{ingresos.map(c => filaConcepto(c, listos.grupos))}</ul>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-base">Gastos</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {gastos.length === 0 && <p className="text-sm text-muted-foreground">Sin conceptos de gasto.</p>}
                {listos.grupos.map(g => seccion(g.nombre, gastos.filter(c => c.grupo_id === g.id), listos.grupos))}
                {seccion("Sin grupo", gastos.filter(c => !c.grupo_id), listos.grupos)}
              </CardContent>
            </Card>

            {/* Grupos */}
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-base">Grupos</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Un grupo con conceptos no se borra: se da de baja.</p>
                {listos.grupos.length > 0 && (
                  <ul className="rounded-lg border divide-y">
                    {listos.grupos.map(g => (
                      <FilaCatalogo key={`${g.id}:${g.nombre}`} etiqueta="grupo" nombre={g.nombre} activo={g.activo} enviando={enviando}
                        onRenombrar={nombre => void ejecutar(() => actualizarGrupoConcepto(g.id, { nombre }), "Grupo renombrado")}
                        onActivo={activo => void ejecutar(() => actualizarGrupoConcepto(g.id, { activo }), activo ? "Grupo reactivado" : "Grupo dado de baja")}
                        onBorrar={() => void ejecutar(
                          () => borrarDeCatalogo("concepto_grupos", g.id, "El grupo tiene conceptos: no se borra, dalo de baja"), "Grupo borrado")} />
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input aria-label="Nuevo grupo" className={CAMPO} placeholder="Nuevo grupo" value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)} />
                  <Button type="button" variant="outline" className={BOTON} disabled={enviando || !nuevoGrupo.trim()}
                    onClick={() => void ejecutar(
                      () => crearGrupoConcepto(estId, nuevoGrupo.trim(), Math.max(0, ...listos.grupos.map(g => g.orden)) + 1),
                      "Grupo agregado", () => setNuevoGrupo(""))}>
                    Agregar
                  </Button>
                </div>
              </CardContent>
            </Card>

          </div>
        )
      })()}
    </section>
  )
}
