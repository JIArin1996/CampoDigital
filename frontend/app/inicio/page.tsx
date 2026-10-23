"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CalendarClock, ChevronRight, Lightbulb, NotebookPen, Plus } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { contarIdeasAbiertas, getEntradas, getPersonas } from "@/lib/queries/bitacora"
import { getCategorias, getEspecies, getLotes, getStockAl, getStockEstablecimiento } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Proximamente } from "@/components/layout/Proximamente"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { StockPorCategoria } from "@/components/lotes/StockPorCategoria"
import { TarjetaEntrada } from "@/components/bitacora/TarjetaEntrada"
import { BloqueActividades, BloqueCarencias, BloqueEconomia, BloqueIndicadores } from "@/components/inicio/BloquesInicio"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import { ETIQUETA_ROL } from "@/components/usuarios/roles"
import { CAMPO } from "@/components/shared/estilos"
import type { EntradaConLotes } from "@/types/bitacora"
import type { CategoriaAnimal, Especie } from "@/types/lotes"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]
type FilaStock = { especie_id: string; categoria_id: string; cabezas: number }

interface Datos {
  estId: string
  especies: Especie[]
  categorias: CategoriaAnimal[]
  entradas: EntradaConLotes[]
  personas: Persona[]
  nombresLote: Map<string, string>
  activos: { id: string; nombre: string }[]
  ideasAbiertas: number
}

export default function InicioPage() {
  const { perfil, establecimientoActivo, rolActivo, puedeOperar, esAdmin, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  const [datos, setDatos] = useState<Datos | null>(null)
  const [version, setVersion] = useState(0)
  const [fechaStock, setFechaStock] = useState(hoyLocal())
  const [stock, setStock] = useState<{ clave: string; filas: FilaStock[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Catálogos, bitácora e ideas abiertas
  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([
      getEspecies(estId),
      getCategorias(estId),
      getEntradas(estId, { limite: 5 }),
      getPersonas(estId),
      getLotes(estId, "activo"),
      getLotes(estId, "cerrado"),
      contarIdeasAbiertas(estId),
    ])
      .then(([especies, categorias, entradas, personas, activos, cerrados, ideasAbiertas]) => {
        if (!vigente) return
        setDatos({
          estId, especies, categorias, entradas, personas, ideasAbiertas,
          nombresLote: new Map([...activos, ...cerrados].map(l => [l.id, l.nombre])),
          activos: activos.map(l => ({ id: l.id, nombre: l.nombre })),
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el inicio")) })
    return () => { vigente = false }
  }, [estId, version])

  // Stock: hoy desde la vista (lotes activos); otra fecha con stock_al (incluye lotes hoy cerrados)
  const claveStock = `${estId}:${fechaStock}`
  useEffect(() => {
    if (!estId || !fechaStock) return
    let vigente = true
    const consulta = fechaStock === hoyLocal() ? getStockEstablecimiento(estId) : getStockAl(estId, fechaStock)
    consulta
      .then(filas => { if (vigente) setStock({ clave: `${estId}:${fechaStock}`, filas }) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el stock")) })
    return () => { vigente = false }
  }, [estId, fechaStock])

  if (cargando) {
    return <PageContainer><div className="h-64 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }

  const listos = datos && datos.estId === estId ? datos : null
  const filasStock = stock?.clave === claveStock ? stock.filas : null
  const esHoy = fechaStock === hoyLocal()
  const totalCabezas = (filasStock ?? []).reduce((s, f) => s + f.cabezas, 0)

  return (
    <PageContainer>
      {/* Saludo y establecimiento */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Hola{perfil ? `, ${perfil.nombre}` : ""}</h1>
        {establecimientoActivo ? (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-muted-foreground">{establecimientoActivo.nombre}</p>
            {rolActivo && <Badge variant={rolActivo === "consulta" ? "secondary" : "default"}>{ETIQUETA_ROL[rolActivo]}</Badge>}
          </div>
        ) : (
          <p className="text-muted-foreground mt-1">
            {esAdmin
              ? "Todavía no hay establecimientos. Creá el primero desde Configuraciones → Establecimientos."
              : "Todavía no tenés establecimientos asignados. Pedile acceso al administrador."}
          </p>
        )}
      </div>

      {establecimientoActivo && (
        <div className="space-y-6">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          {/* Accesos rápidos de carga */}
          {puedeOperar && (
            <div className="grid grid-cols-2 gap-2">
              <Link href="/bitacora/nueva" className={buttonVariants({ variant: "outline", className: "h-auto flex-col gap-1 py-3" })}>
                <NotebookPen className="h-5 w-5" /> Nota de bitácora
              </Link>
              <Link href="/lotes/nuevo" className={buttonVariants({ variant: "outline", className: "h-auto flex-col gap-1 py-3" })}>
                <Plus className="h-5 w-5" /> Nuevo lote
              </Link>
            </div>
          )}

          {/* Economía del ejercicio: solo quien puede ver la plata */}
          {puedeOperar && estId && <BloqueEconomia estId={estId} />}

          {/* Stock del establecimiento */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Stock</CardTitle>
                <Link href="/lotes" className="inline-flex items-center gap-1 text-sm font-medium text-primary min-h-11">
                  Lotes <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="inicio-fecha-stock" className="text-sm text-muted-foreground shrink-0">Al</label>
                <Input id="inicio-fecha-stock" type="date" max={hoyLocal()} className={`${CAMPO} w-auto`}
                  value={fechaStock} onChange={e => setFechaStock(e.target.value || hoyLocal())} />
                {!esHoy && (
                  <button type="button" className="text-sm font-medium text-primary min-h-11 px-2" onClick={() => setFechaStock(hoyLocal())}>
                    Hoy
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!filasStock || !listos ? (
                <div className="h-24 rounded bg-muted animate-pulse" />
              ) : filasStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {esHoy ? "Todavía no hay animales cargados." : `Sin animales al ${fechaCorta(fechaStock)}.`}
                </p>
              ) : (
                <>
                  <p className="text-3xl font-bold tabular-nums">
                    {totalCabezas} <span className="text-base font-medium text-muted-foreground">cabezas{esHoy ? "" : ` al ${fechaCorta(fechaStock)}`}</span>
                  </p>
                  {listos.especies.map(especie => {
                    const filas = filasStock.filter(f => f.especie_id === especie.id)
                    if (filas.length === 0) return null
                    return (
                      <div key={especie.id}>
                        <p className="text-sm font-semibold mb-1">{especie.nombre}</p>
                        <StockPorCategoria filas={filas} categorias={listos.categorias.filter(c => c.especie_id === especie.id)} />
                      </div>
                    )
                  })}
                </>
              )}
            </CardContent>
          </Card>

          {/* Lotes en carencia e indicadores de la última temporada */}
          {listos && <BloqueCarencias lotes={listos.activos} />}
          {listos && estId && <BloqueIndicadores estId={estId} especies={listos.especies} />}

          {/* Ideas abiertas */}
          {listos && (
            <Link href="/bitacora?tipo=idea&estado=abierta"
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-4 hover:bg-muted/50 active:bg-muted transition-colors">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-(--etiqueta-idea) text-(--etiqueta-idea-texto)">
                <Lightbulb className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block text-2xl font-bold tabular-nums leading-none">{listos.ideasAbiertas}</span>
                <span className="block text-sm text-muted-foreground">
                  {listos.ideasAbiertas === 1 ? "idea abierta" : "ideas abiertas"} para decidir
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          )}

          {/* Últimas actividades */}
          {listos && estId && <BloqueActividades estId={estId} nombresLote={listos.nombresLote} />}

          {/* Últimas notas de la bitácora */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Últimas notas</h2>
              <Link href="/bitacora" className="inline-flex items-center gap-1 text-sm font-medium text-primary min-h-11">
                Bitácora <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {!listos ? (
              <div className="h-28 rounded-lg border bg-muted/30 animate-pulse" />
            ) : listos.entradas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay notas.</p>
            ) : (
              <ul className="space-y-2">
                {listos.entradas.map(e => (
                  <li key={e.id}>
                    <TarjetaEntrada entrada={e} nombresLote={listos.nombresLote} personas={listos.personas}
                      puedeOperar={puedeOperar} compacta onCambio={() => setVersion(v => v + 1)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Lo que llega en las próximas etapas */}
          <Proximamente
            icon={CalendarClock}
            titulo="Tareas y vencimientos"
            descripcion="Tareas vencidas y próximas, próximas dosis de sanidad y avisos."
            etapa="Etapa 8"
          />
        </div>
      )}
    </PageContainer>
  )
}
