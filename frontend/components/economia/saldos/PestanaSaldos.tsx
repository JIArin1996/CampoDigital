"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRightLeft, Pencil, X } from "lucide-react"
import { toast } from "sonner"

import {
  anularLiquidacion, getAportesSaldos, getIdentificadores, getLiquidaciones, getPagadores, getPendientesSaldos, getSaldos,
} from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO } from "@/components/shared/estilos"
import { montoOriginal, usd } from "@/components/economia/formato"
import { fechaCorta } from "@/components/lotes/formato"
import { claveParte, DialogoLiquidacion, type Parte } from "@/components/economia/saldos/DialogoLiquidacion"
import { cn } from "@/lib/utils"
import type { AporteSaldo, Liquidacion, Pagador, PendienteSaldo, Saldo, Titular } from "@/types/economia"

interface Datos {
  clave: string
  saldos: Saldo[]
  aportes: AporteSaldo[]
  pendientes: PendienteSaldo[]
  liquidaciones: Liquidacion[]
  pagadores: Pagador[]
  identificadores: Map<string, string>
}

const clavePar = (s: Saldo) => `${claveParte(s.deudor_tipo, s.deudor_id)}|${claveParte(s.acreedor_tipo, s.acreedor_id)}`

/**
 * Saldos entre titulares, en dólares: "Hermanos le debe USD 1.240 a Juan", de mayor a menor. Tocando uno se ve
 * de dónde sale (los movimientos pagados y las liquidaciones de ese par). El administrador y el operador
 * registran y anulan liquidaciones; Consulta solo lo ve. Abajo, lo que no entra en los saldos y las liquidaciones.
 * En el celular el detalle sube desde abajo; en la computadora va a la derecha.
 */
export function PestanaSaldos({ establecimientoId, puedeOperar, titulares, version, onCambio }: {
  establecimientoId: string
  puedeOperar: boolean
  titulares: Titular[]
  version: number
  onCambio: () => void
}) {
  const clave = `${establecimientoId}:${version}`
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elegido, setElegido] = useState<string | null>(null)
  // Formulario de liquidación: null = cerrado; la clave lo arma de nuevo (con id nuevo) cada vez que se abre
  const [liquidar, setLiquidar] = useState<{ n: number; inicial: { de: string; a: string; montoUsd: number } | null } | null>(null)
  const [aAnular, setAAnular] = useState<{ id: string; texto: string } | null>(null)

  useEffect(() => {
    let vigente = true
    Promise.all([
      getSaldos(establecimientoId), getAportesSaldos(establecimientoId), getPendientesSaldos(establecimientoId),
      getLiquidaciones(establecimientoId), getPagadores(establecimientoId),
    ])
      .then(async ([saldos, aportes, pendientes, liquidaciones, pagadores]) => {
        const ids = [...new Set(aportes.filter(a => a.origen === "movimiento").map(a => a.origen_id).concat(pendientes.map(p => p.id)))]
        const identificadores = await getIdentificadores(ids)
        if (vigente) {
          setError(null)
          setDatos({ clave: `${establecimientoId}:${version}`, saldos, aportes, pendientes, liquidaciones, pagadores, identificadores })
        }
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los saldos")) })
    return () => { vigente = false }
  }, [establecimientoId, version])

  const listos = datos?.clave === clave ? datos : null
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!listos) return <div className="h-64 rounded-lg border bg-muted/30 animate-pulse" />

  // Las partes: los titulares y los pagadores que no son de un titular (los dados de baja, solo para nombrarlos)
  const nombre = (tipo: string, id: string) =>
    (tipo === "titular" ? titulares.find(t => t.id === id)?.nombre : listos.pagadores.find(p => p.id === id)?.nombre) ?? "—"
  const partes: Parte[] = [
    ...titulares.filter(t => t.activo).map(t => ({ clave: claveParte("titular", t.id), tipo: "titular" as const, id: t.id, nombre: t.nombre })),
    ...listos.pagadores.filter(p => p.activo && !p.titular_id)
      .map(p => ({ clave: claveParte("pagador", p.id), tipo: "pagador" as const, id: p.id, nombre: p.nombre })),
  ]
  // Una liquidación con un pagador de un titular: se nombra al pagador (es lo que se eligió)
  const ladoLiq = (titularId: string | null, pagadorId: string | null) =>
    titularId ? nombre("titular", titularId) : pagadorId ? nombre("pagador", pagadorId) : "—"

  const saldo = listos.saldos.find(s => clavePar(s) === elegido) ?? null
  const abrirLiquidacion = (inicial: { de: string; a: string; montoUsd: number } | null) =>
    setLiquidar(l => ({ n: (l?.n ?? 0) + 1, inicial }))
  const hecho = () => { setLiquidar(null); setAAnular(null); onCambio() }

  const detalle = saldo && (
    <DetallePar saldo={saldo} aportes={listos.aportes} identificadores={listos.identificadores} nombre={nombre} puedeOperar={puedeOperar}
      onLiquidar={() => abrirLiquidacion({
        de: claveParte(saldo.deudor_tipo, saldo.deudor_id), a: claveParte(saldo.acreedor_tipo, saldo.acreedor_id), montoUsd: Number(saldo.monto_usd),
      })}
      onAnular={a => setAAnular({ id: a.origen_id, texto: a.descripcion })} />
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          En dólares, con los movimientos pagados o cobrados que tienen quién pagó y reparto, y las liquidaciones.
        </p>
        {puedeOperar && (
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => abrirLiquidacion(null)}>
            <ArrowRightLeft className="h-4 w-4 mr-1" /> Registrar liquidación
          </Button>
        )}
      </div>

      {/* Saldos y, en la computadora, el detalle a la derecha */}
      <div className="grid gap-4 md:grid-cols-2">
        {listos.saldos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nadie le debe nada a nadie.</p>
        ) : (
          <ul className="h-fit divide-y rounded-lg border bg-card">
            {listos.saldos.map(s => (
              <li key={clavePar(s)}>
                <button type="button" aria-pressed={elegido === clavePar(s)} onClick={() => setElegido(clavePar(s))}
                  className={cn("flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40",
                    elegido === clavePar(s) && "bg-muted/60")}>
                  <span className="text-sm">
                    <span className="font-semibold">{s.deudor}</span> le debe <span className="font-semibold">{s.acreedor}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{usd(Number(s.monto_usd))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="hidden md:block">
          {detalle ?? (listos.saldos.length > 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Tocá un saldo para ver de dónde sale.</p>
          ))}
        </div>
      </div>

      {/* Celular: el detalle sube desde abajo */}
      {saldo && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => setElegido(null)}>
          <div role="dialog" aria-label="Detalle del saldo" onClick={e => e.stopPropagation()}
            className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-1 flex justify-end">
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Cerrar" onClick={() => setElegido(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            {detalle}
          </div>
        </div>
      )}

      <FueraDelSaldo pendientes={listos.pendientes} identificadores={listos.identificadores} puedeOperar={puedeOperar} />

      {/* Liquidaciones registradas (también las que dejaron un saldo en cero, para poder anularlas) */}
      {listos.liquidaciones.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Liquidaciones</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {listos.liquidaciones.map(l => {
              const anulada = !!l.anulado_en
              const texto = `${ladoLiq(l.de_titular_id, l.de_pagador_id)} le pasó ${usd(Number(l.monto_usd))} a ${ladoLiq(l.a_titular_id, l.a_pagador_id)}`
              return (
                <li key={l.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-4 py-3", anulada && "opacity-60")}>
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", anulada && "line-through")}>{texto}</p>
                    <p className="text-xs text-muted-foreground">
                      {[fechaCorta(l.fecha), l.moneda_original === "UYU" && montoOriginal(Number(l.monto_original), l.moneda_original, l.tipo_cambio), l.observacion]
                        .filter(Boolean).join(" · ")}
                    </p>
                    {anulada && <p className="text-xs text-muted-foreground">Anulada: {l.motivo_anulacion}</p>}
                  </div>
                  {anulada
                    ? <Badge variant="secondary">Anulada</Badge>
                    : puedeOperar && (
                      <Button type="button" variant="ghost" size="sm" className="h-9 md:h-8 text-muted-foreground"
                        onClick={() => setAAnular({ id: l.id, texto })}>Anular</Button>
                    )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {liquidar && (
        <DialogoLiquidacion key={liquidar.n} abierto establecimientoId={establecimientoId} partes={partes} inicial={liquidar.inicial}
          onCerrar={() => setLiquidar(null)} onHecho={hecho} />
      )}
      <DialogoAnularLiquidacion key={aAnular?.id ?? "anular"} liquidacion={aAnular} onCerrar={() => setAAnular(null)} onHecho={hecho} />
    </div>
  )
}

// De dónde sale el saldo de un par: cada parte de un movimiento y cada liquidación, con para qué lado suma
function DetallePar({ saldo, aportes, identificadores, nombre, puedeOperar, onLiquidar, onAnular }: {
  saldo: Saldo
  aportes: AporteSaldo[]
  identificadores: Map<string, string>
  nombre: (tipo: string, id: string) => string
  puedeOperar: boolean
  onLiquidar: () => void
  onAnular: (a: AporteSaldo) => void
}) {
  const deudor = claveParte(saldo.deudor_tipo, saldo.deudor_id)
  const acreedor = claveParte(saldo.acreedor_tipo, saldo.acreedor_id)
  const delPar = aportes.filter(a => {
    const d = claveParte(a.deudor_tipo, a.deudor_id), c = claveParte(a.acreedor_tipo, a.acreedor_id)
    return (d === deudor && c === acreedor) || (d === acreedor && c === deudor)
  })

  const explicacion = (a: AporteSaldo) => {
    const d = nombre(a.deudor_tipo, a.deudor_id), c = nombre(a.acreedor_tipo, a.acreedor_id)
    if (a.origen === "liquidacion") return `${c} le pasó plata a ${d}`
    return a.sentido === "egreso" ? `${c} pagó la parte de ${d}` : `${d} cobró la parte de ${c}`
  }

  return (
    <div className="space-y-3 md:rounded-lg md:border md:bg-card md:p-4">
      <div>
        <p className="text-sm text-muted-foreground">{saldo.deudor} le debe a {saldo.acreedor}</p>
        <p className="text-2xl font-bold tabular-nums">{usd(Number(saldo.monto_usd))}</p>
      </div>
      {puedeOperar && (
        <Button type="button" className="h-11 w-full md:h-9 md:w-auto" onClick={onLiquidar}>
          <ArrowRightLeft className="h-4 w-4 mr-1" /> Registrar liquidación
        </Button>
      )}
      <ul className="divide-y border-y">
        {delPar.map((a, i) => {
          const suma = claveParte(a.deudor_tipo, a.deudor_id) === deudor
          return (
            <li key={`${a.origen_id}:${i}`} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {a.origen === "liquidacion" ? `Liquidación${a.descripcion !== "Liquidación" ? `: ${a.descripcion}` : ""}` : identificadores.get(a.origen_id) ?? a.descripcion}
                </p>
                <p className="text-xs text-muted-foreground">{fechaCorta(a.fecha)} · {explicacion(a)}</p>
                {a.origen === "liquidacion" && puedeOperar && (
                  <button type="button" className="mt-1 min-h-9 text-xs text-muted-foreground underline" onClick={() => onAnular(a)}>Anular</button>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{suma ? "+" : "−"} {usd(Number(a.monto_usd))}</p>
                <p className="text-xs text-muted-foreground">{suma ? "suma a la deuda" : "la achica"}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Movimientos pagados o cobrados que no entran en los saldos: falta quién pagó o cobró, o el reparto
function FueraDelSaldo({ pendientes, identificadores, puedeOperar }: {
  pendientes: PendienteSaldo[]
  identificadores: Map<string, string>
  puedeOperar: boolean
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">No entran en los saldos{pendientes.length > 0 ? ` (${pendientes.length})` : ""}</h2>
      {pendientes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todos los movimientos pagados o cobrados tienen quién pagó y reparto.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Pagados o cobrados, de cualquier fecha, sin quién pagó o cobró o sin reparto entre titulares.</p>
          <ul className="divide-y rounded-lg border bg-card">
            {pendientes.map(p => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{identificadores.get(p.id) ?? p.concepto}</p>
                  <p className="text-xs text-muted-foreground">
                    {fechaCorta(p.fecha)} · {p.sentido === "ingreso" ? "Ingreso" : "Egreso"} {usd(Number(p.monto_usd))}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.falta_pagador && <Badge variant="outline">Falta {p.sentido === "ingreso" ? "quién cobró" : "quién pagó"}</Badge>}
                    {p.falta_reparto && <Badge variant="outline">Falta el reparto</Badge>}
                  </div>
                </div>
                {puedeOperar && (
                  <Link href={`/economia/${p.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 md:h-8" })}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Completar
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// Anular una liquidación, con motivo. No se borra: queda anulada y deja de contar en los saldos.
function DialogoAnularLiquidacion({ liquidacion, onCerrar, onHecho }: {
  liquidacion: { id: string; texto: string } | null
  onCerrar: () => void
  onHecho: () => void
}) {
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const confirmar = async () => {
    if (!liquidacion) return
    if (!motivo.trim()) return setError("Indicá el motivo")
    setEnviando(true)
    setError(null)
    try {
      await anularLiquidacion(liquidacion.id, motivo.trim())
      toast.success("Liquidación anulada")
      onHecho()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={liquidacion !== null} onOpenChange={abre => { if (!abre) onCerrar() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular liquidación</DialogTitle>
          <DialogDescription>
            {liquidacion?.texto}. No se borra: queda anulada, con el motivo, y deja de contar en los saldos. Si estaba mal, se carga de nuevo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="anular-liq-motivo">Motivo</Label>
          <Input id="anular-liq-motivo" className={CAMPO} placeholder="Ej: el monto estaba mal" value={motivo} onChange={e => setMotivo(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="destructive" className={BOTON} disabled={enviando} onClick={() => void confirmar()}>Anular</Button>
          <Button type="button" variant="outline" className={BOTON} onClick={onCerrar}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
