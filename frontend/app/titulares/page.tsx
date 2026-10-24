"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { actualizarTitular, borrarDeCatalogo, crearTitular, getTitulares } from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FilaCatalogo } from "@/components/economia/FilaCatalogo"
import { BOTON, CAMPO } from "@/components/shared/estilos"
import type { Titular } from "@/types/economia"

/**
 * Titulares (solo administrador): a nombre de quién va cada ingreso o gasto. Arrancan vacíos.
 * Un titular con movimientos no se borra: se da de baja.
 */
export default function TitularesPage() {
  const { establecimientoActivo, esAdmin, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id
  const [datos, setDatos] = useState<{ clave: string; titulares: Titular[] } | null>(null)
  const [version, setVersion] = useState(0)
  const [nuevo, setNuevo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const clave = `${estId}:${version}`
  useEffect(() => {
    if (!estId || !esAdmin) return
    let vigente = true
    getTitulares(estId)
      .then(titulares => { if (vigente) setDatos({ clave: `${estId}:${version}`, titulares }) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los titulares")) })
    return () => { vigente = false }
  }, [estId, esAdmin, version])

  if (cargando) return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!esAdmin) return <PageContainer><p className="text-muted-foreground">Los titulares los administra el administrador.</p></PageContainer>
  if (!establecimientoActivo) return <PageContainer><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>

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

  return (
    <PageContainer>
      <h1 className="text-2xl font-bold">Titulares</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        A nombre de quién va cada ingreso o gasto (opcional al cargar). El resultado se puede ver por titular.
      </p>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}
      {!listos ? error ? null : <div className="h-40 rounded-lg border bg-muted/30 animate-pulse" /> : (
        <Card className="max-w-xl">
          <CardContent className="space-y-3 pt-4">
            {listos.titulares.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay titulares.</p>
            ) : (
              <ul className="rounded-lg border divide-y">
                {listos.titulares.map(t => (
                  <FilaCatalogo key={`${t.id}:${t.nombre}`} etiqueta="titular" nombre={t.nombre} activo={t.activo} enviando={enviando}
                    onRenombrar={nombre => void ejecutar(() => actualizarTitular(t.id, { nombre }), "Titular renombrado")}
                    onActivo={activo => void ejecutar(() => actualizarTitular(t.id, { activo }), activo ? "Titular reactivado" : "Titular dado de baja")}
                    onBorrar={() => void ejecutar(
                      () => borrarDeCatalogo("titulares", t.id, "El titular tiene movimientos: no se borra, dalo de baja"), "Titular borrado")} />
                ))}
              </ul>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input aria-label="Nuevo titular" className={CAMPO} placeholder="Nuevo titular" value={nuevo} onChange={e => setNuevo(e.target.value)} />
              <Button type="button" variant="outline" className={BOTON} disabled={enviando || !nuevo.trim()}
                onClick={() => void ejecutar(() => crearTitular(estId!, nuevo.trim()), "Titular agregado", () => setNuevo(""))}>
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  )
}
