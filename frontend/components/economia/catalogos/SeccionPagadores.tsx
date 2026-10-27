"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { actualizarPagador, borrarDeCatalogo, crearPagador, getPagadores, getTitulares } from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FilaCatalogo } from "@/components/economia/FilaCatalogo"
import { BOTON, CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { Pagador, Titular } from "@/types/economia"

/**
 * Pagadores (Configuraciones > Economía): de qué bolsillo sale o a cuál entra la plata ("Pagado por" y
 * "Cobrado por"). Un pagador puede ser de un titular: para los saldos cuenta como ese titular, así que
 * pagar con su propio bolsillo no genera deuda. Uno con movimientos no se borra: se da de baja.
 */
export function SeccionPagadores({ estId }: { estId: string }) {
  const [datos, setDatos] = useState<{ clave: string; pagadores: Pagador[]; titulares: Titular[] } | null>(null)
  const [version, setVersion] = useState(0)
  const [nuevo, setNuevo] = useState({ nombre: "", titularId: "" })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const clave = `${estId}:${version}`
  useEffect(() => {
    let vigente = true
    Promise.all([getPagadores(estId), getTitulares(estId)])
      .then(([pagadores, titulares]) => { if (vigente) setDatos({ clave: `${estId}:${version}`, pagadores, titulares }) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los pagadores")) })
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
      toast.error(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  // Titulares que se ofrecen: los activos, y el que ya tiene puesto (aunque esté de baja)
  const opcionesTitular = (actual: string | null) =>
    (listos?.titulares ?? []).filter(t => t.activo || t.id === actual)

  return (
    <section>
      <h2 className="text-lg font-semibold">Pagadores</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        De qué bolsillo salió o a cuál entró la plata (no a nombre de quién está la factura). Si es de un titular,
        indicalo: pagar con su propio bolsillo no genera deuda en los saldos.
      </p>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}
      {!listos ? error ? null : <div className="h-40 rounded-lg border bg-muted/30 animate-pulse" /> : (
        <Card className="max-w-2xl">
          <CardContent className="space-y-3 pt-4">
            {listos.pagadores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay pagadores.</p>
            ) : (
              <ul className="rounded-lg border divide-y">
                {listos.pagadores.map(p => (
                  <FilaCatalogo key={`${p.id}:${p.nombre}`} etiqueta="pagador" nombre={p.nombre} activo={p.activo} enviando={enviando}
                    onRenombrar={nombre => void ejecutar(() => actualizarPagador(p.id, { nombre }), "Pagador renombrado")}
                    onActivo={activo => void ejecutar(() => actualizarPagador(p.id, { activo }), activo ? "Pagador reactivado" : "Pagador dado de baja")}
                    onBorrar={() => void ejecutar(
                      () => borrarDeCatalogo("pagadores", p.id, "El pagador tiene movimientos o liquidaciones: no se borra, dalo de baja"), "Pagador borrado")}
                    extra={
                      <select aria-label={`Titular de ${p.nombre}`} className={cn(SELECT_NATIVO, "w-full sm:w-44")} value={p.titular_id ?? ""}
                        disabled={enviando || !p.activo}
                        onChange={e => void ejecutar(() => actualizarPagador(p.id, { titular_id: e.target.value || null }),
                          e.target.value ? "Pagador vinculado al titular" : "Pagador sin titular")}>
                        <option value="">No es de un titular</option>
                        {opcionesTitular(p.titular_id).map(t => <option key={t.id} value={t.id}>Es de {t.nombre}</option>)}
                      </select>
                    } />
                ))}
              </ul>
            )}
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input aria-label="Nuevo pagador" className={CAMPO} placeholder="Nuevo pagador (ej: Juan tarjeta)" value={nuevo.nombre}
                onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} />
              <select aria-label="Titular del nuevo pagador" className={SELECT_NATIVO} value={nuevo.titularId}
                onChange={e => setNuevo(n => ({ ...n, titularId: e.target.value }))}>
                <option value="">No es de un titular</option>
                {opcionesTitular(null).map(t => <option key={t.id} value={t.id}>Es de {t.nombre}</option>)}
              </select>
              <Button type="button" variant="outline" className={BOTON} disabled={enviando || !nuevo.nombre.trim()}
                onClick={() => void ejecutar(() => crearPagador(estId, nuevo.nombre.trim(), nuevo.titularId || null), "Pagador agregado",
                  () => setNuevo({ nombre: "", titularId: "" }))}>
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
