"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Ban } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { anularActividad, getActividad, getRubros } from "@/lib/queries/actividades"
import { getPersonas } from "@/lib/queries/bitacora"
import { getCategorias, getLote, getLotesPorIds } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { ETIQUETA_ACTIVIDAD, ETIQUETA_MODALIDAD, kg, porcentaje, usd } from "@/components/actividades/formato"
import { fechaCorta } from "@/components/lotes/formato"
import { BOTON, TEXTAREA } from "@/components/shared/estilos"
import type { CategoriaAnimal, Lote } from "@/types/lotes"

type Detalle = NonNullable<Awaited<ReturnType<typeof getActividad>>>

interface Ficha extends Detalle {
  clave: string
  lote: Lote | null
  loteCria: Lote | null
  lotesActividad: Lote[]     // todos los lotes de la actividad (actividad_lotes)
  categorias: CategoriaAnimal[]
  personas: Awaited<ReturnType<typeof getPersonas>>
  rubros: Awaited<ReturnType<typeof getRubros>>
}

export default function ActividadPage() {
  const { id } = useParams<{ id: string }>()
  const { puedeOperarEn, cargando: cargandoCtx } = useEstablecimiento()
  const [ficha, setFicha] = useState<Ficha | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [errorAnular, setErrorAnular] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    const clave = `${id}:${version}`
    getActividad(id)
      .then(async detalle => {
        if (!detalle) return null
        const a = detalle.actividad
        const [lote, loteCria, lotesActividad, categorias, personas, rubros] = await Promise.all([
          a.lote_id ? getLote(a.lote_id) : null,
          a.lote_cria_id ? getLote(a.lote_cria_id) : null,
          getLotesPorIds(a.lotes ?? []),
          getCategorias(a.establecimiento_id, { incluirInactivas: true }),   // el historial muestra también las dadas de baja
          getPersonas(a.establecimiento_id),
          getRubros(a.establecimiento_id),
        ])
        return { ...detalle, clave, lote, loteCria, lotesActividad, categorias, personas, rubros }
      })
      .then(f => { if (vigente) setFicha(f) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar la actividad")) })
    return () => { vigente = false }
  }, [id, version])

  const volver = <VolverAlLote href="/actividades" texto="Volver a actividades" />

  if (error && !ficha) return <PageContainer>{volver}<p role="alert" className="text-sm text-destructive">{error}</p></PageContainer>
  if (ficha === undefined || cargandoCtx) {
    return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }
  if (!ficha) return <PageContainer>{volver}<p className="text-muted-foreground">No se encontró la actividad.</p></PageContainer>

  const { actividad: a, lineas, productos, movimientos, lote, loteCria, lotesActividad } = ficha
  const titulo = a.tipo === "personalizada" && a.personalizada ? a.personalizada : ETIQUETA_ACTIVIDAD[a.tipo]
  const anulada = !!a.anulada_en
  const puedeAnular = puedeOperarEn(a.establecimiento_id) && !anulada
  const nombreCategoria = (catId: string) => ficha.categorias.find(c => c.id === catId)?.nombre ?? "—"
  const persona = ficha.personas.find(p => p.id === a.persona_id)
  const rubro = (rubroId: string) => ficha.rubros.find(r => r.id === rubroId)?.nombre ?? "—"
  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm text-right">{valor}</dd>
    </div>
  )

  const confirmarAnulacion = async () => {
    if (!motivo.trim()) return setErrorAnular("Indicá el motivo de la anulación")
    setEnviando(true)
    setErrorAnular(null)
    try {
      await anularActividad(a.id, motivo.trim())
      toast.success("Actividad anulada")
      setAnulando(false)
      setMotivo("")
      setVersion(v => v + 1)
    } catch (err) {
      setErrorAnular(mensajeDeError(err, "No se pudo anular"))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <PageContainer>
      {volver}

      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className={`text-2xl font-bold ${anulada ? "line-through text-muted-foreground" : ""}`}>{titulo}</h1>
          {anulada && <Badge variant="secondary">anulada</Badge>}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{fechaCorta(a.fecha)}{persona ? ` · ${persona.nombre}` : ""}</p>
        {anulada && a.motivo_anulacion && (
          <p className="text-sm mt-2">Motivo de la anulación: {a.motivo_anulacion}</p>
        )}
      </div>

      <div className="space-y-6 max-w-xl">
        <Card>
          <CardContent className="pt-4">
            <dl className="divide-y">
              {lote && fila(a.tipo === "paricion" ? "Lote de madres" : "Lote", <Link href={`/lotes/${lote.id}`} className="font-medium text-primary">{lote.nombre}</Link>)}
              {loteCria && fila("Lote de cría", <Link href={`/lotes/${loteCria.id}`} className="font-medium text-primary">{loteCria.nombre}</Link>)}
              {!a.lote_id && lotesActividad.length > 0 && fila(lotesActividad.length === 1 ? "Lote" : "Lotes", (
                <span className="flex flex-wrap justify-end gap-x-2">
                  {lotesActividad.map(l => <Link key={l.id} href={`/lotes/${l.id}`} className="font-medium text-primary">{l.nombre}</Link>)}
                </span>
              ))}
              {a.vacas_entoradas != null && fila("Vacas entoradas", a.vacas_entoradas)}
              {a.toros != null && fila("Toros", a.toros)}
              {a.vacas_diagnosticadas != null && fila("Diagnosticadas", a.vacas_diagnosticadas)}
              {a.vacas_prenadas != null && fila("Preñadas", a.vacas_prenadas)}
              {a.vacas_vacias != null && fila("Vacías", a.vacas_vacias)}
              {a.vacas_diagnosticadas != null && a.vacas_prenadas != null &&
                fila("Preñez", porcentaje((a.vacas_prenadas / a.vacas_diagnosticadas) * 100))}
              {a.kg_lana_total != null && fila("Lana", kg(a.kg_lana_total))}
              {a.kg_lana_cabeza_aprox != null && fila("Por cabeza (aproximado)", kg(a.kg_lana_cabeza_aprox))}
              {(a.campos ?? []).map(c => <div key={c.campo}>{fila(c.campo, c.valor)}</div>)}
              {a.lote_creado_id && fila("Lote nuevo", "creado por esta actividad")}
              {a.modalidad && fila("Modalidad", ETIQUETA_MODALIDAD[a.modalidad])}
              {a.contraparte && fila(a.tipo === "compra" ? "Vendedor" : "Comprador", a.contraparte)}
              {a.causa && fila("Causa", a.causa)}
              {a.observaciones && fila("Observaciones", a.observaciones)}
              {a.tipo === "paricion" && fila("Nacidos muertos", a.nacidos_muertos ?? 0)}
              {a.peso_vivo_total_kg != null && fila("Peso vivo total", kg(a.peso_vivo_total_kg))}
              {a.peso_promedio_kg != null && fila("Peso promedio", kg(a.peso_promedio_kg))}
              {a.kg_gancho != null && fila("Kg al gancho", kg(a.kg_gancho))}
              {a.rendimiento_pct != null && fila("Rendimiento", porcentaje(a.rendimiento_pct))}
              {a.notas && fila("Notas", a.notas)}
            </dl>
          </CardContent>
        </Card>

        {productos.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">{productos.length === 1 ? "Producto" : "Productos"}</h2>
            <ul className="rounded-lg border divide-y bg-card">
              {productos.map(p => (
                <li key={p.orden} className="px-4 py-3 space-y-0.5">
                  <p className="text-sm font-medium">{p.producto} <span className="font-normal text-muted-foreground">· {p.categoria}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      p.dosis,
                      p.via,
                      p.carencia_dias ? `carencia ${p.carencia_dias} días (hasta el ${fechaCorta(sumarDias(a.fecha, p.carencia_dias))})` : null,
                      p.fecha_proxima_dosis ? `próxima dosis ${fechaCorta(p.fecha_proxima_dosis)}` : null,
                    ].filter(Boolean).join(" · ") || "Sin más datos"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {lineas.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">{a.tipo === "paricion" ? "Crías vivas" : "Por categoría"}</h2>
          <ul className="rounded-lg border divide-y bg-card">
            {lineas.map(l => (
              <li key={l.categoria_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{nombreCategoria(l.categoria_id)}</span>
                <span className="text-sm tabular-nums text-right">
                  {l.cabezas} cab.
                  {l.peso_vivo_total_kg != null && (
                    <span className="block text-xs text-muted-foreground">
                      {kg(l.peso_vivo_total_kg)} · {kg(Math.round((l.peso_vivo_total_kg / l.cabezas) * 10) / 10)} prom.
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
        )}

        {(a.tipo === "compra" || a.tipo === "venta") && (
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-base">Precio</CardTitle></CardHeader>
            <CardContent>
              {movimientos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin precio cargado. Se podrá agregar como movimiento manual en la Etapa 7.</p>
              ) : (
                movimientos.map(m => (
                  <dl key={m.id} className={`divide-y ${m.anulado_en ? "opacity-60" : ""}`}>
                    {fila("Monto", `${m.moneda_original} ${m.monto_original.toLocaleString("es-UY", { minimumFractionDigits: 2 })}`)}
                    {m.tipo_cambio != null && fila("Tipo de cambio", m.tipo_cambio.toLocaleString("es-UY"))}
                    {fila("En dólares", usd(m.monto_usd ?? 0))}
                    {fila("Estado", m.anulado_en ? "anulado" : m.estado === "pagado" ? (a.tipo === "venta" ? "cobrado" : "pagado") : "pendiente")}
                    {m.fecha_pago && fila(a.tipo === "venta" ? "Fecha de cobro" : "Fecha de pago", fechaCorta(m.fecha_pago))}
                    {fila("Rubro", rubro(m.rubro_id))}
                  </dl>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {puedeAnular && (
          <div>
            <Button variant="outline" className={`${BOTON} text-destructive`} onClick={() => { setErrorAnular(null); setAnulando(true) }}>
              <Ban className="h-4 w-4 mr-1" /> Anular
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Las actividades no se editan: si hay un error, se anula y se carga de nuevo.</p>
          </div>
        )}
      </div>

      <Dialog open={anulando} onOpenChange={setAnulando}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anular {titulo.toLowerCase()}</DialogTitle>
            <DialogDescription>
              {!["compra", "venta", "mortandad", "paricion"].includes(a.tipo)
                ? "Queda tachada en el historial, con su motivo. No cambia el stock."
                : "El stock vuelve a como estaba (con la fecha de la actividad) y el precio, si había, se anula. No se puede deshacer."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="anular-motivo">Motivo</Label>
            <textarea id="anular-motivo" rows={3} className={TEXTAREA} value={motivo} onChange={e => setMotivo(e.target.value)} />
          </div>
          {errorAnular && <p role="alert" className="text-sm text-destructive">{errorAnular}</p>}
          <div className="flex gap-3">
            <Button variant="destructive" className={BOTON} disabled={enviando} onClick={confirmarAnulacion}>
              {enviando ? "Anulando..." : "Anular"}
            </Button>
            <Button variant="outline" className={BOTON} disabled={enviando} onClick={() => setAnulando(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}

// Fecha ISO + n días
function sumarDias(iso: string, dias: number) {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString("en-CA")
}
