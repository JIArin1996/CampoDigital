"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { Plus, Trash2, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { createLoteMovimiento, createMovimientosBatch } from "@/lib/queries/movimientos"
import { getDicosePropiedad } from "@/lib/queries/dicose_propiedad"
import { getEstablecimientos } from "@/lib/queries/establecimientos"
import {
  createAnimalesBulk,
  getAnimalesPorCaravanas,
  updateAnimalesEstadoBatch,
  updateAnimalesPotrerosBatch,
  updateAnimalesDicosePropiedadBatch,
  updateAnimalesTrasladoBatch,
} from "@/lib/queries/animales"
import { calcularCategoriaPreview } from "@/lib/utils/categorias"
import { SUBTIPOS_POR_TIPO } from "@/types/database"
import type {
  TipoMovimiento, SubtipoMovimiento, Establecimiento, Potrero, MovimientoGanadoInsert, AnimalInsert,
} from "@/types/database"
import type { DicosePropiedad } from "@/lib/queries/dicose_propiedad"

// ── Constantes ────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<TipoMovimiento, string> = {
  Ingreso: "Ingreso", Egreso: "Egreso", Traslado: "Traslado", Afectacion: "Afectación",
}

const SUBTIPO_LABELS: Record<SubtipoMovimiento, string> = {
  Nacimiento: "Nacimiento",
  Compra: "Compra",
  "Venta a Productor": "Venta a Productor",
  "Venta a Frigorifico": "Venta a Frigorífico",
  "Venta en Consignacion": "Venta en Consignación",
  Muerte: "Muerte",
  "Traslado entre Establecimientos": "Traslado entre Establecimientos",
  "Cambio de Potrero": "Cambio de Potrero",
  "Afectacion a Fideicomiso": "Afectación a Fideicomiso",
  "Afectacion a Capitalizacion": "Afectación a Capitalización",
  "Afectacion a Consignacion sin Movimiento": "Afectación a Consignación sin Movimiento",
}

const RE_CARAVANA = /^8580000\d{8}$/
const RE_DICOSE_FISICO = /^\d{9}$/
const RE_DICOSE_PROPIEDAD = /^(\d{9}|[A-Za-z]{2}\d{7})$/

// Subtipos que requieren guía DGT + número de autorización
const REQUIERE_GUIA = new Set<SubtipoMovimiento>([
  "Compra", "Venta a Productor", "Venta a Frigorifico", "Venta en Consignacion",
  "Traslado entre Establecimientos",
  "Afectacion a Fideicomiso", "Afectacion a Capitalizacion", "Afectacion a Consignacion sin Movimiento",
])

const ES_VENTA = new Set<SubtipoMovimiento>([
  "Venta a Productor", "Venta a Frigorifico", "Venta en Consignacion",
])

const ES_AFECTACION = new Set<SubtipoMovimiento>([
  "Afectacion a Fideicomiso", "Afectacion a Capitalizacion", "Afectacion a Consignacion sin Movimiento",
])

// Subtipos donde las caravanas deben existir y estar activas en el establecimiento
const REQUIERE_CARAVANAS_ACTIVAS = new Set<SubtipoMovimiento>([
  "Venta a Productor", "Venta a Frigorifico", "Venta en Consignacion", "Muerte",
  "Traslado entre Establecimientos", "Cambio de Potrero",
  "Afectacion a Fideicomiso", "Afectacion a Capitalizacion", "Afectacion a Consignacion sin Movimiento",
])

// ── Schema Zod ────────────────────────────────────────────────────────────────

const schema = z.object({
  fecha: z.string().min(1, "Requerido"),
  tipo_movimiento: z.enum(
    ["Ingreso", "Egreso", "Traslado", "Afectacion"] as [TipoMovimiento, ...TipoMovimiento[]],
    "Requerido"
  ),
  subtipo: z.string().min(1, "Requerido"),
  serie_guia: z.string().optional(),
  numero_autorizacion: z.string().optional(),
  numero_tropa: z.string().optional(),
  dicose_propiedad_id: z.number().int().positive().optional(),
  dicose_propiedad_origen: z.string().optional(),
  dicose_propiedad_destino_texto: z.string().optional(),
  dicose_propiedad_destino_id: z.number().int().positive().optional(),
  dicose_fisico_origen: z.string().optional(),
  dicose_fisico_destino: z.string().optional(),
  establecimiento_destino_id: z.number().int().positive().optional(),
  potrero_id: z.number().int().positive().optional(),
  peso_promedio: z.number().positive().optional(),
  precio_total: z.number().positive().optional(),
  fecha_nacimiento: z.string().optional(),
  observaciones: z.string().optional(),
}).superRefine((data, ctx) => {
  const sub = data.subtipo as SubtipoMovimiento

  if (REQUIERE_GUIA.has(sub)) {
    if (!data.serie_guia?.trim())
      ctx.addIssue({ code: "custom", path: ["serie_guia"], message: "Requerido" })
    if (!data.numero_autorizacion?.trim())
      ctx.addIssue({ code: "custom", path: ["numero_autorizacion"], message: "Requerido" })
  }

  if (sub === "Nacimiento") {
    if (!data.dicose_propiedad_id)
      ctx.addIssue({ code: "custom", path: ["dicose_propiedad_id"], message: "Seleccioná un DICOSE Propiedad" })
    if (!data.fecha_nacimiento?.trim())
      ctx.addIssue({ code: "custom", path: ["fecha_nacimiento"], message: "Requerido" })
  }

  if (sub === "Compra") {
    if (!data.dicose_propiedad_id)
      ctx.addIssue({ code: "custom", path: ["dicose_propiedad_id"], message: "Seleccioná un DICOSE Propiedad" })
    if (!data.dicose_propiedad_origen?.trim())
      ctx.addIssue({ code: "custom", path: ["dicose_propiedad_origen"], message: "Requerido" })
    else if (!RE_DICOSE_PROPIEDAD.test(data.dicose_propiedad_origen))
      ctx.addIssue({ code: "custom", path: ["dicose_propiedad_origen"], message: "9 dígitos o 2 letras + 7 dígitos" })
    if (!data.dicose_fisico_origen?.trim())
      ctx.addIssue({ code: "custom", path: ["dicose_fisico_origen"], message: "Requerido" })
    else if (!RE_DICOSE_FISICO.test(data.dicose_fisico_origen))
      ctx.addIssue({ code: "custom", path: ["dicose_fisico_origen"], message: "Debe ser 9 dígitos numéricos" })
  }

  if (ES_VENTA.has(sub)) {
    if (!data.dicose_propiedad_destino_texto?.trim())
      ctx.addIssue({ code: "custom", path: ["dicose_propiedad_destino_texto"], message: "Requerido" })
    else if (!RE_DICOSE_PROPIEDAD.test(data.dicose_propiedad_destino_texto))
      ctx.addIssue({ code: "custom", path: ["dicose_propiedad_destino_texto"], message: "9 dígitos o 2 letras + 7 dígitos" })
    if (!data.dicose_fisico_destino?.trim())
      ctx.addIssue({ code: "custom", path: ["dicose_fisico_destino"], message: "Requerido" })
    else if (!RE_DICOSE_FISICO.test(data.dicose_fisico_destino))
      ctx.addIssue({ code: "custom", path: ["dicose_fisico_destino"], message: "Debe ser 9 dígitos numéricos" })
    if (sub === "Venta a Frigorifico" && !data.numero_tropa?.trim())
      ctx.addIssue({ code: "custom", path: ["numero_tropa"], message: "Requerido para Frigorífico" })
  }

  if (sub === "Traslado entre Establecimientos") {
    if (!data.establecimiento_destino_id)
      ctx.addIssue({ code: "custom", path: ["establecimiento_destino_id"], message: "Seleccioná el establecimiento destino" })
    if (!data.dicose_propiedad_destino_id)
      ctx.addIssue({ code: "custom", path: ["dicose_propiedad_destino_id"], message: "Seleccioná un DICOSE Propiedad destino" })
  }

  if (sub === "Cambio de Potrero") {
    if (!data.potrero_id)
      ctx.addIssue({ code: "custom", path: ["potrero_id"], message: "Seleccioná el potrero destino" })
  }

  if (ES_AFECTACION.has(sub)) {
    if (!data.dicose_propiedad_destino_id)
      ctx.addIssue({ code: "custom", path: ["dicose_propiedad_destino_id"], message: "Seleccioná el nuevo titular" })
  }
})

type FormValues = z.infer<typeof schema>

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FilaCaravana {
  caravana_snig: string
  sexo?: "Macho" | "Hembra"
  edad_meses?: number
  valida: boolean
  error?: string
}

interface MovimientoFormProps {
  establecimiento_id: number
  establecimiento: Establecimiento
  dicoseList: DicosePropiedad[]
  potreros: Potrero[]
  onSuccess: () => void
  onCancel: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizarSexo(raw: string): "Macho" | "Hembra" | null {
  const v = raw.trim().toLowerCase()
  if (v === "m" || v === "macho") return "Macho"
  if (v === "h" || v === "hembra") return "Hembra"
  return null
}

type ColumnaExcel = "solo-caravana" | "caravana+sexo" | "caravana+sexo+edad"

function getColumnaExcel(subtipo: SubtipoMovimiento): ColumnaExcel {
  if (subtipo === "Nacimiento") return "caravana+sexo"
  if (subtipo === "Compra") return "caravana+sexo+edad"
  return "solo-caravana"
}

async function parsearExcel(file: File, columnas: ColumnaExcel): Promise<FilaCaravana[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" })

  // Omitir fila de encabezado y filas vacías
  return rows
    .slice(1)
    .filter(row => (row as unknown[]).some(c => String(c).trim() !== ""))
    .map(row => {
      const r = row as unknown[]
      const caravana = String(r[0] ?? "").trim()

      if (!caravana)
        return { caravana_snig: "", valida: false, error: "Caravana vacía" }
      if (!RE_CARAVANA.test(caravana))
        return { caravana_snig: caravana, valida: false, error: "Formato inválido (15 dígitos, empieza por 8580000)" }

      if (columnas === "solo-caravana")
        return { caravana_snig: caravana, valida: true }

      const sexoNorm = normalizarSexo(String(r[1] ?? ""))
      if (!sexoNorm)
        return { caravana_snig: caravana, valida: false, error: `Sexo inválido: "${r[1]}". Usá Macho, Hembra, M o H` }

      if (columnas === "caravana+sexo")
        return { caravana_snig: caravana, sexo: sexoNorm, valida: true }

      // caravana+sexo+edad
      const edadNum = Number(r[2])
      if (r[2] === "" || isNaN(edadNum) || edadNum < 0 || !Number.isInteger(edadNum))
        return { caravana_snig: caravana, sexo: sexoNorm, valida: false, error: "Edad debe ser entero ≥ 0" }

      return { caravana_snig: caravana, sexo: sexoNorm, edad_meses: edadNum, valida: true }
    })
}

// ── Sub-componente: tabla de preview de caravanas ─────────────────────────────

function FilasPreview({
  filas,
  onEliminar,
  mostrarSexo,
  mostrarEdad,
}: {
  filas: FilaCaravana[]
  onEliminar: (idx: number) => void
  mostrarSexo: boolean
  mostrarEdad: boolean
}) {
  const validas = filas.filter(f => f.valida).length
  const errores = filas.length - validas

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-green-700 font-medium">{validas} válidas</span>
        {errores > 0 && <span className="text-destructive font-medium">{errores} con error</span>}
      </div>
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto max-h-52 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Caravana SNIG</th>
                {mostrarSexo && <th className="text-left px-3 py-2 font-medium">Sexo</th>}
                {mostrarEdad && <th className="text-left px-3 py-2 font-medium">Edad (m)</th>}
                <th className="text-left px-3 py-2 font-medium">Estado</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, idx) => (
                <tr key={idx} className={fila.valida ? "border-t" : "border-t bg-destructive/5"}>
                  <td className="px-3 py-1.5 font-mono">{fila.caravana_snig || "—"}</td>
                  {mostrarSexo && <td className="px-3 py-1.5">{fila.sexo ?? "—"}</td>}
                  {mostrarEdad && <td className="px-3 py-1.5">{fila.edad_meses ?? "—"}</td>}
                  <td className="px-3 py-1.5">
                    {fila.valida
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      : <span className="text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {fila.error}
                        </span>
                    }
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onEliminar(idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MovimientoForm({
  establecimiento_id,
  establecimiento,
  dicoseList,
  potreros,
  onSuccess,
  onCancel,
}: MovimientoFormProps) {
  const [filas, setFilas] = useState<FilaCaravana[]>([])
  const [modoNacimiento, setModoNacimiento] = useState<"manual" | "excel">("manual")
  const [manualCaravana, setManualCaravana] = useState("")
  const [manualSexo, setManualSexo] = useState<"" | "Macho" | "Hembra">("")
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([])
  const [cargandoEst, setCargandoEst] = useState(false)
  const [estDestino, setEstDestino] = useState<Establecimiento | null>(null)
  const [dicoseDestino, setDicoseDestino] = useState<DicosePropiedad[]>([])
  const [cargandoDestino, setCargandoDestino] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const {
    register, handleSubmit, setValue, watch, formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fecha: new Date().toISOString().split("T")[0] },
  })

  const tipo = watch("tipo_movimiento")
  const subtipo = watch("subtipo") as SubtipoMovimiento | ""
  const pesoProm = watch("peso_promedio")
  const estDestinoId = watch("establecimiento_destino_id")
  const dicosePropDestinoId = watch("dicose_propiedad_destino_id")

  const subtiposDisponibles = tipo ? SUBTIPOS_POR_TIPO[tipo] : []
  const filasValidas = filas.filter(f => f.valida)
  const pesoTotal = pesoProm && filasValidas.length > 0 ? pesoProm * filasValidas.length : null
  const mostrarSexo = subtipo === "Nacimiento" || subtipo === "Compra"
  const mostrarEdad = subtipo === "Compra"

  // Al cambiar tipo: limpiar subtipo y filas
  useEffect(() => {
    setValue("subtipo", "")
    setFilas([])
  }, [tipo, setValue])

  // Al cambiar subtipo: limpiar filas y cargar establecimientos si aplica
  useEffect(() => {
    setFilas([])
    setManualCaravana("")
    setManualSexo("")
    if (subtipo === "Traslado entre Establecimientos" && establecimientos.length === 0) {
      cargarEstablecimientos()
    }
  }, [subtipo]) // eslint-disable-line react-hooks/exhaustive-deps

  const cargarEstablecimientos = async () => {
    setCargandoEst(true)
    try {
      const data = await getEstablecimientos()
      setEstablecimientos((data as Establecimiento[]).filter(e => e.id !== establecimiento_id))
    } catch {
      toast.error("Error cargando establecimientos")
    } finally {
      setCargandoEst(false)
    }
  }

  // Al seleccionar establecimiento destino: cargar sus DICOSE Propiedad
  const handleEstDestinoChange = async (id: number) => {
    setValue("establecimiento_destino_id", id, { shouldValidate: true })
    setValue("dicose_propiedad_destino_id", undefined)
    const est = establecimientos.find(e => e.id === id) || null
    setEstDestino(est)
    setDicoseDestino([])
    if (!est) return
    setCargandoDestino(true)
    try {
      setDicoseDestino(await getDicosePropiedad(id))
    } catch {
      toast.error("Error cargando DICOSE del destino")
    } finally {
      setCargandoDestino(false)
    }
  }

  // Entrada manual de caravana (solo Nacimiento)
  const handleAgregarManual = () => {
    const caravana = manualCaravana.trim()
    if (!caravana) return
    if (!manualSexo) { toast.error("Seleccioná el sexo"); return }
    if (filas.some(f => f.caravana_snig === caravana)) { toast.error("Caravana ya agregada"); return }
    const fila: FilaCaravana = RE_CARAVANA.test(caravana)
      ? { caravana_snig: caravana, sexo: manualSexo, valida: true }
      : { caravana_snig: caravana, sexo: manualSexo, valida: false, error: "Formato inválido (15 dígitos, empieza por 8580000)" }
    setFilas(prev => [...prev, fila])
    setManualCaravana("")
    setManualSexo("")
  }

  // Carga de Excel
  const handleExcel = async (file: File) => {
    if (!subtipo) return
    try {
      setFilas(await parsearExcel(file, getColumnaExcel(subtipo)))
    } catch {
      toast.error("Error al leer el Excel")
    }
  }

  // Generar y descargar plantilla Excel
  const descargarPlantilla = () => {
    if (!subtipo) return
    const cols = getColumnaExcel(subtipo)
    let example: Record<string, unknown>
    if (cols === "caravana+sexo+edad")
      example = { "Caravana SNIG": "858000012345678", Sexo: "Macho", "Edad en meses": 14 }
    else if (cols === "caravana+sexo")
      example = { "Caravana SNIG": "858000012345678", Sexo: "Hembra" }
    else
      example = { "Caravana SNIG": "858000012345678" }
    const ws = XLSX.utils.json_to_sheet([example])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Caravanas")
    XLSX.writeFile(wb, `plantilla_${subtipo.replace(/ /g, "_")}.xlsx`)
  }

  // Guardar
  const onSubmit = async (values: FormValues) => {
    if (filas.length === 0) { toast.error("Cargá al menos una caravana"); return }
    if (filas.some(f => !f.valida)) { toast.error("Hay filas con errores. Corregí antes de guardar."); return }

    const sub = values.subtipo as SubtipoMovimiento
    const hoy = new Date().toISOString().split("T")[0]
    setEnviando(true)

    // Declaradas fuera del try para que el catch pueda inspeccionarlas
    let _animalesCreados: { id: number; caravana_snig: string }[] | null = null
    let _loteCreado: { id: number } | null = null

    try {
      // ── Paso 1: validar caravanas contra DB (solo para subtipos que requieren stock activo) ──
      let animalesEncontrados: Awaited<ReturnType<typeof getAnimalesPorCaravanas>> = []
      if (REQUIERE_CARAVANAS_ACTIVAS.has(sub)) {
        const caravanas = filasValidas.map(f => f.caravana_snig)
        console.log("paso 1 — getAnimalesPorCaravanas", { establecimiento_id, caravanas })
        animalesEncontrados = await getAnimalesPorCaravanas(establecimiento_id, caravanas)

        const encontradasSet = new Set(animalesEncontrados.map(a => a.caravana_snig))
        const erroresPrevio: Record<string, string> = {}

        caravanas.forEach(c => {
          if (!encontradasSet.has(c)) {
            erroresPrevio[c] = "No existe en el stock de este establecimiento"
          }
        })
        animalesEncontrados.forEach(a => {
          if (a.estado !== "activo") {
            erroresPrevio[a.caravana_snig ?? ""] = `Ya fue egresada (estado: ${a.estado})`
          }
        })

        if (Object.keys(erroresPrevio).length > 0) {
          // Marcar filas con error para que el preview las muestre
          setFilas(prev => prev.map(f =>
            erroresPrevio[f.caravana_snig]
              ? { ...f, valida: false, error: erroresPrevio[f.caravana_snig] }
              : f
          ))
          toast.error("Algunas caravanas tienen errores. Revisá el listado.")
          return
        }
      }

      // ── Paso 2: crear animales (Nacimiento y Compra) ──
      let animalesCreados: { id: number; caravana_snig: string }[] = []
      if (sub === "Nacimiento" || sub === "Compra") {
        const fechaNacimiento = sub === "Nacimiento" ? (values.fecha_nacimiento || hoy) : null

        const insertsAnimales: AnimalInsert[] = filasValidas.map(fila => {
          // Nacimiento: edad = meses entre fecha_nacimiento y fecha del movimiento
          let edadMeses = 0
          if (sub === "Nacimiento" && fechaNacimiento) {
            const nac = new Date(fechaNacimiento + "T12:00:00")
            const reg = new Date(values.fecha + "T12:00:00")
            const diffMs = reg.getTime() - nac.getTime()
            edadMeses = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44)))
          } else if (sub === "Compra") {
            edadMeses = fila.edad_meses ?? 0
          }

          const categoriaActual = calcularCategoriaPreview(fila.sexo ?? "Macho", edadMeses, false)

          return {
            establecimiento_id,
            dicose_propiedad_id: values.dicose_propiedad_id || null,
            caravana_snig: fila.caravana_snig,
            caravana_propia: null,
            sexo: fila.sexo ?? "Macho",
            edad_meses_ingreso: edadMeses,
            fecha_ingreso: values.fecha,
            es_toro: false,
            categoria: categoriaActual,       // columna real en Supabase
            categoria_actual: categoriaActual, // columna nueva si ya fue migrada
            fecha_nacimiento: fechaNacimiento,
            raza: null,
            peso_entrada: null,
            fecha_peso_entrada: null,
            madre_id: null,
            potrero_actual: null,
            parcela_actual: null,
            lote_actual: null,
            estado: "activo",
            fecha_baja: null,
            observaciones: null,
            user_id: null,
          }
        })

        console.log("paso 2 — createAnimalesBulk", { cantidad: insertsAnimales.length, sub })
        const creados = await createAnimalesBulk(insertsAnimales)
        animalesCreados = (creados ?? []).map(a => ({ id: a.id, caravana_snig: a.caravana_snig }))
        _animalesCreados = animalesCreados
      }

      // ── Paso 3: resolver DICOSE Físico origen/destino ──
      let dicoseFisicoOrigen: string | null = null
      let dicoseFisicoDestino: string | null = null
      if (sub === "Compra") {
        dicoseFisicoOrigen = values.dicose_fisico_origen || null
        dicoseFisicoDestino = establecimiento.dicose_fisico || null
      } else if (ES_VENTA.has(sub)) {
        dicoseFisicoOrigen = establecimiento.dicose_fisico || null
        dicoseFisicoDestino = values.dicose_fisico_destino || null
      } else if (sub === "Traslado entre Establecimientos") {
        dicoseFisicoOrigen = establecimiento.dicose_fisico || null
        dicoseFisicoDestino = estDestino?.dicose_fisico || null
      }

      // DICOSE Propiedad destino como texto (código) para guardar en el movimiento
      const dicosePropDestinoCodigo: string | null =
        values.dicose_propiedad_destino_texto ||
        (values.dicose_propiedad_destino_id
          ? (dicoseDestino.find(d => d.id === values.dicose_propiedad_destino_id)?.codigo ||
             dicoseList.find(d => d.id === values.dicose_propiedad_destino_id)?.codigo || null)
          : null)

      const esManual = subtipo === "Nacimiento" && modoNacimiento === "manual"

      // ── Paso 4: crear lote agrupador ──
      console.log("paso 4 — createLoteMovimiento", { establecimiento_id, sub, cantidad: filasValidas.length })
      const lote = await createLoteMovimiento({
        establecimiento_id,
        fecha: values.fecha,
        tipo_movimiento: values.tipo_movimiento,
        subtipo: sub,
        cantidad_animales: filasValidas.length,
        contraparte: null,
        precio_total_lote: values.precio_total || null,
        origen_carga: esManual ? "Manual" : "Excel",
        observaciones: values.observaciones || null,
        user_id: null,
      })
      _loteCreado = { id: lote.id }

      // ── Paso 5: actualizar animales existentes según subtipo ──
      if (animalesEncontrados.length > 0) {
        const ids = animalesEncontrados.filter(a => a.estado === "activo").map(a => a.id)
        console.log("paso 5 — actualizar animales", { sub, ids })

        if (ES_VENTA.has(sub) || sub === "Muerte") {
          const estadoBaja = sub === "Muerte" ? "muerto" : "egresado"
          await updateAnimalesEstadoBatch(ids, estadoBaja as any, values.fecha)
        } else if (sub === "Traslado entre Establecimientos" && values.establecimiento_destino_id && values.dicose_propiedad_destino_id) {
          await updateAnimalesTrasladoBatch(ids, values.establecimiento_destino_id, values.dicose_propiedad_destino_id)
        } else if (sub === "Cambio de Potrero" && values.potrero_id) {
          await updateAnimalesPotrerosBatch(ids, values.potrero_id)
        } else if (ES_AFECTACION.has(sub) && values.dicose_propiedad_destino_id) {
          await updateAnimalesDicosePropiedadBatch(ids, values.dicose_propiedad_destino_id)
        }
      }

      // ── Paso 6: construir y guardar N registros de movimiento (uno por caravana) ──
      // Para Nacimiento/Compra, vincular animal_id desde los animales recién creados
      const creados = new Map(animalesCreados.map(a => [a.caravana_snig, a.id]))
      // Para egreso/traslado/afectación, vincular desde los animales encontrados en DB
      const encontrados = new Map(animalesEncontrados.map(a => [a.caravana_snig ?? "", a.id]))

      const movRows: MovimientoGanadoInsert[] = filasValidas.map(fila => ({
        establecimiento_id,
        lote_movimiento_id: lote.id,
        animal_id: creados.get(fila.caravana_snig) ?? encontrados.get(fila.caravana_snig) ?? null,
        caravana_snig: fila.caravana_snig,
        fecha: values.fecha,
        tipo_movimiento: values.tipo_movimiento,
        subtipo: sub,
        user_id: null,
        dicose_propiedad_id: values.dicose_propiedad_id || null,
        dicose_propiedad_origen: values.dicose_propiedad_origen || null,
        dicose_propiedad_destino: dicosePropDestinoCodigo,
        dicose_fisico_origen: dicoseFisicoOrigen,
        dicose_fisico_destino: dicoseFisicoDestino,
        potrero_id: values.potrero_id || null,
        establecimiento_destino_id: values.establecimiento_destino_id || null,
        serie_guia: values.serie_guia || null,
        numero_autorizacion: values.numero_autorizacion || null,
        numero_tropa: values.numero_tropa || null,
        cantidad: filasValidas.length,
        peso_promedio: values.peso_promedio || null,
        peso_total: pesoTotal,
        precio_unitario: null,
        precio_total: values.precio_total || null,
        contraparte: null,
        observaciones: values.observaciones || null,
      }))

      console.log("paso 6 — createMovimientosBatch", { cantidad: movRows.length })
      await createMovimientosBatch(movRows)
      toast.success(`Movimiento registrado: ${filasValidas.length} caravana${filasValidas.length !== 1 ? "s" : ""}`)
      onSuccess()
    } catch (err: unknown) {
      console.error("Error en onSubmit — paso actual:", {
        error: JSON.stringify(err, null, 2),
        animalesCreados: _animalesCreados?.map(a => a.id) ?? null,
        loteCreado: _loteCreado?.id ?? null,
      })
      toast.error(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setEnviando(false)
    }
  }

  // ── Helpers de render ────────────────────────────────────────────────────────

  const renderDicoseSelect = (
    fieldName: "dicose_propiedad_id" | "dicose_propiedad_destino_id",
    lista: DicosePropiedad[],
    label: string,
    loading = false,
    placeholder = "Seleccionar..."
  ) => {
    const val = watch(fieldName)
    return (
      <div className="space-y-1.5">
        <Label>{label} <span className="text-destructive">*</span></Label>
        <Select
          value={val?.toString() ?? ""}
          disabled={loading}
          onValueChange={v => v && setValue(fieldName, Number(v), { shouldValidate: true })}
        >
          <SelectTrigger aria-invalid={!!errors[fieldName]}>
            <SelectValue>
              {(v: string | null) => {
                if (!v) return <span className="text-muted-foreground">{loading ? "Cargando..." : placeholder}</span>
                const d = lista.find(d => d.id.toString() === v)
                return d ? `${d.codigo} — ${d.titular}` : v
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {lista.length === 0
              ? <div className="px-3 py-2 text-sm text-muted-foreground">Sin registros</div>
              : lista.map(d => (
                  <SelectItem key={d.id} value={d.id.toString()}>
                    {d.codigo} — {d.titular}
                  </SelectItem>
                ))
            }
          </SelectContent>
        </Select>
        {errors[fieldName] && <p className="text-sm text-destructive">{errors[fieldName]?.message}</p>}
      </div>
    )
  }

  const renderDicoseFisicoReadonly = (label: string, valor: string | null | undefined) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground font-mono">
        {valor || <span className="italic">No configurado</span>}
      </div>
    </div>
  )

  const renderGuia = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="serie_guia">Serie y Nro. de Guía <span className="text-destructive">*</span></Label>
        <Input id="serie_guia" placeholder="Ej: A 000123" aria-invalid={!!errors.serie_guia} {...register("serie_guia")} />
        {errors.serie_guia && <p className="text-sm text-destructive">{errors.serie_guia.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="numero_autorizacion">Nro. de Autorización <span className="text-destructive">*</span></Label>
        <Input id="numero_autorizacion" placeholder="Ej: 987654" aria-invalid={!!errors.numero_autorizacion} {...register("numero_autorizacion")} />
        {errors.numero_autorizacion && <p className="text-sm text-destructive">{errors.numero_autorizacion.message}</p>}
      </div>
    </div>
  )

  const renderPeso = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="peso_promedio">Peso promedio por animal (kg)</Label>
        <Input
          id="peso_promedio" type="number" step="0.1" min="0"
          placeholder="Ej: 320"
          {...register("peso_promedio", { valueAsNumber: true })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Peso total del lote (kg)</Label>
        <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm font-mono text-muted-foreground">
          {pesoTotal != null ? pesoTotal.toLocaleString("es-UY") : "—"}
        </div>
        <p className="text-xs text-muted-foreground">Calculado automáticamente</p>
      </div>
    </div>
  )

  const renderPrecio = () => (
    <div className="space-y-1.5">
      <Label htmlFor="precio_total">Valor total (USD)</Label>
      <Input
        id="precio_total" type="number" step="0.01" min="0"
        placeholder="Ej: 15000"
        {...register("precio_total", { valueAsNumber: true })}
      />
    </div>
  )

  const renderComentario = () => (
    <div className="space-y-1.5">
      <Label htmlFor="mov-obs">Comentario</Label>
      <textarea
        id="mov-obs" rows={2}
        placeholder="Notas adicionales..."
        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
        {...register("observaciones")}
      />
    </div>
  )

  const renderSeccionCaravanas = () => {
    const mostrarToggle = subtipo === "Nacimiento"

    return (
      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Caravanas SNIG</p>
          <div className="flex items-center gap-2">
            {mostrarToggle && (
              <div className="flex rounded-md border overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setModoNacimiento("manual")}
                  className={`px-3 py-1.5 ${modoNacimiento === "manual" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setModoNacimiento("excel")}
                  className={`px-3 py-1.5 ${modoNacimiento === "excel" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  Excel
                </button>
              </div>
            )}
            {(!mostrarToggle || modoNacimiento === "excel") && (
              <Button type="button" variant="outline" size="sm" onClick={descargarPlantilla}>
                Plantilla
              </Button>
            )}
          </div>
        </div>

        {/* Entrada manual (solo Nacimiento en modo manual) */}
        {mostrarToggle && modoNacimiento === "manual" && (
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <Input
              value={manualCaravana}
              onChange={e => setManualCaravana(e.target.value.trim())}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAgregarManual())}
              placeholder="858000012345678"
              maxLength={15}
              className="font-mono text-sm"
            />
            <Select
              value={manualSexo}
              onValueChange={v => setManualSexo(v as "Macho" | "Hembra")}
            >
              <SelectTrigger className="w-32 shrink-0">
                <SelectValue>
                  {(v: string | null) => v || <span className="text-muted-foreground">Sexo</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Macho">Macho</SelectItem>
                <SelectItem value="Hembra">Hembra</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={handleAgregarManual} className="shrink-0">
              <Plus className="h-4 w-4 mr-1" /> Agregar
            </Button>
          </div>
        )}

        {/* Carga Excel */}
        {(!mostrarToggle || modoNacimiento === "excel") && (
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 cursor-pointer hover:bg-muted/40 transition-colors">
            <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Arrastrá o hacé click para subir el Excel
            </p>
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleExcel(file)
                e.target.value = ""
              }}
            />
          </label>
        )}

        {/* Tabla de preview */}
        {filas.length > 0 && (
          <FilasPreview
            filas={filas}
            onEliminar={i => setFilas(prev => prev.filter((_, idx) => idx !== i))}
            mostrarSexo={mostrarSexo}
            mostrarEdad={mostrarEdad}
          />
        )}
        {filas.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">Sin caravanas cargadas</p>
        )}
      </div>
    )
  }

  // ── JSX principal ─────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* PASO 1: Fecha + Tipo + Subtipo */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="mov-fecha">Fecha <span className="text-destructive">*</span></Label>
          <Input id="mov-fecha" type="date" aria-invalid={!!errors.fecha} {...register("fecha")} />
          {errors.fecha && <p className="text-sm text-destructive">{errors.fecha.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo <span className="text-destructive">*</span></Label>
            <Select
              value={tipo ?? ""}
              onValueChange={v => v && setValue("tipo_movimiento", v as TipoMovimiento, { shouldValidate: true })}
            >
              <SelectTrigger aria-invalid={!!errors.tipo_movimiento}>
                <SelectValue>
                  {(v: string | null) => v ? TIPO_LABELS[v as TipoMovimiento] : <span className="text-muted-foreground">Seleccionar...</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SUBTIPOS_POR_TIPO) as TipoMovimiento[]).map(t => (
                  <SelectItem key={t} value={t}>{TIPO_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tipo_movimiento && <p className="text-sm text-destructive">{errors.tipo_movimiento.message}</p>}
          </div>

          {/* Subtipo */}
          <div className="space-y-1.5">
            <Label>Subtipo <span className="text-destructive">*</span></Label>
            <Select
              value={subtipo ?? ""}
              disabled={!tipo}
              onValueChange={v => v && setValue("subtipo", v, { shouldValidate: true })}
            >
              <SelectTrigger aria-invalid={!!errors.subtipo}>
                <SelectValue>
                  {(v: string | null) => v
                    ? SUBTIPO_LABELS[v as SubtipoMovimiento]
                    : <span className="text-muted-foreground">{tipo ? "Seleccionar..." : "Elegí un tipo primero"}</span>
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {subtiposDisponibles.map(s => (
                  <SelectItem key={s} value={s}>{SUBTIPO_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.subtipo && <p className="text-sm text-destructive">{errors.subtipo.message}</p>}
          </div>
        </div>
      </div>

      {/* PASO 2: Campos dinámicos según subtipo */}
      {subtipo && (
        <>
          <hr className="border-border" />

          {/* Documentación: guía + autorización */}
          {REQUIERE_GUIA.has(subtipo) && renderGuia()}

          {/* ── NACIMIENTO ── */}
          {subtipo === "Nacimiento" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fecha_nacimiento">Fecha de Nacimiento <span className="text-destructive">*</span></Label>
                  <Input
                    id="fecha_nacimiento" type="date"
                    aria-invalid={!!errors.fecha_nacimiento}
                    {...register("fecha_nacimiento")}
                  />
                  {errors.fecha_nacimiento && <p className="text-sm text-destructive">{errors.fecha_nacimiento.message}</p>}
                </div>
                {renderDicoseFisicoReadonly("DICOSE Físico del Establecimiento", establecimiento.dicose_fisico)}
              </div>
              {renderDicoseSelect("dicose_propiedad_id", dicoseList, "DICOSE Propiedad")}
            </>
          )}

          {/* ── COMPRA ── */}
          {subtipo === "Compra" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dp-origen">DICOSE Propiedad Vendedor <span className="text-destructive">*</span></Label>
                  <Input
                    id="dp-origen" placeholder="Ej: AB1234567" maxLength={9}
                    aria-invalid={!!errors.dicose_propiedad_origen}
                    {...register("dicose_propiedad_origen")}
                  />
                  {errors.dicose_propiedad_origen
                    ? <p className="text-sm text-destructive">{errors.dicose_propiedad_origen.message}</p>
                    : <p className="text-xs text-muted-foreground">9 num. o 2 letras + 7 num.</p>
                  }
                </div>
                {renderDicoseSelect("dicose_propiedad_id", dicoseList, "DICOSE Propiedad del Establecimiento")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="df-origen">DICOSE Físico Vendedor <span className="text-destructive">*</span></Label>
                  <Input
                    id="df-origen" placeholder="Ej: 123456789" maxLength={9}
                    aria-invalid={!!errors.dicose_fisico_origen}
                    {...register("dicose_fisico_origen")}
                  />
                  {errors.dicose_fisico_origen
                    ? <p className="text-sm text-destructive">{errors.dicose_fisico_origen.message}</p>
                    : <p className="text-xs text-muted-foreground">9 dígitos numéricos</p>
                  }
                </div>
                {renderDicoseFisicoReadonly("DICOSE Físico del Establecimiento", establecimiento.dicose_fisico)}
              </div>
              {renderPeso()}
              {renderPrecio()}
            </>
          )}

          {/* ── VENTAS ── */}
          {ES_VENTA.has(subtipo) && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dp-destino">DICOSE Propiedad Comprador <span className="text-destructive">*</span></Label>
                  <Input
                    id="dp-destino" placeholder="Ej: AB1234567" maxLength={9}
                    aria-invalid={!!errors.dicose_propiedad_destino_texto}
                    {...register("dicose_propiedad_destino_texto")}
                  />
                  {errors.dicose_propiedad_destino_texto
                    ? <p className="text-sm text-destructive">{errors.dicose_propiedad_destino_texto.message}</p>
                    : <p className="text-xs text-muted-foreground">9 num. o 2 letras + 7 num.</p>
                  }
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="df-destino">DICOSE Físico Comprador <span className="text-destructive">*</span></Label>
                  <Input
                    id="df-destino" placeholder="Ej: 123456789" maxLength={9}
                    aria-invalid={!!errors.dicose_fisico_destino}
                    {...register("dicose_fisico_destino")}
                  />
                  {errors.dicose_fisico_destino
                    ? <p className="text-sm text-destructive">{errors.dicose_fisico_destino.message}</p>
                    : <p className="text-xs text-muted-foreground">9 dígitos numéricos</p>
                  }
                </div>
              </div>
              {renderDicoseFisicoReadonly("DICOSE Físico del Establecimiento", establecimiento.dicose_fisico)}
              {subtipo === "Venta a Frigorifico" && (
                <div className="space-y-1.5">
                  <Label htmlFor="num-tropa">Número de Tropa <span className="text-destructive">*</span></Label>
                  <Input
                    id="num-tropa" placeholder="Ej: 4521"
                    aria-invalid={!!errors.numero_tropa}
                    {...register("numero_tropa")}
                  />
                  {errors.numero_tropa && <p className="text-sm text-destructive">{errors.numero_tropa.message}</p>}
                </div>
              )}
              {renderPeso()}
              {renderPrecio()}
            </>
          )}

          {/* ── TRASLADO ENTRE ESTABLECIMIENTOS ── */}
          {subtipo === "Traslado entre Establecimientos" && (
            <>
              {renderDicoseFisicoReadonly("DICOSE Físico Origen (este establecimiento)", establecimiento.dicose_fisico)}
              <div className="space-y-1.5">
                <Label>Establecimiento Destino <span className="text-destructive">*</span></Label>
                <Select
                  value={estDestinoId?.toString() ?? ""}
                  disabled={cargandoEst}
                  onValueChange={v => v && handleEstDestinoChange(Number(v))}
                >
                  <SelectTrigger aria-invalid={!!errors.establecimiento_destino_id}>
                    <SelectValue>
                      {(v: string | null) => {
                        if (!v) return <span className="text-muted-foreground">{cargandoEst ? "Cargando..." : "Seleccionar..."}</span>
                        return establecimientos.find(e => e.id.toString() === v)?.nombre ?? v
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {establecimientos.map(e => (
                      <SelectItem key={e.id} value={e.id.toString()}>{e.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.establecimiento_destino_id && (
                  <p className="text-sm text-destructive">{errors.establecimiento_destino_id.message}</p>
                )}
              </div>
              {renderDicoseFisicoReadonly("DICOSE Físico Destino (automático)", estDestino?.dicose_fisico)}
              {renderDicoseSelect(
                "dicose_propiedad_destino_id", dicoseDestino,
                "DICOSE Propiedad Destino", cargandoDestino,
                estDestinoId ? "Seleccionar..." : "Seleccioná el establecimiento primero"
              )}
            </>
          )}

          {/* ── CAMBIO DE POTRERO ── */}
          {subtipo === "Cambio de Potrero" && (
            <div className="space-y-1.5">
              <Label>Potrero Destino <span className="text-destructive">*</span></Label>
              <Select
                value={watch("potrero_id")?.toString() ?? ""}
                onValueChange={v => v && setValue("potrero_id", Number(v), { shouldValidate: true })}
              >
                <SelectTrigger aria-invalid={!!errors.potrero_id}>
                  <SelectValue>
                    {(v: string | null) => v
                      ? (potreros.find(p => p.id.toString() === v)?.nombre ?? v)
                      : <span className="text-muted-foreground">Seleccionar potrero...</span>
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {potreros.length === 0
                    ? <div className="px-3 py-2 text-sm text-muted-foreground">Sin potreros activos</div>
                    : potreros.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>)
                  }
                </SelectContent>
              </Select>
              {errors.potrero_id && <p className="text-sm text-destructive">{errors.potrero_id.message}</p>}
            </div>
          )}

          {/* ── AFECTACIONES ── */}
          {ES_AFECTACION.has(subtipo) && (
            renderDicoseSelect("dicose_propiedad_destino_id", dicoseList, "DICOSE Propiedad Nuevo Titular")
          )}

          {/* Comentario (siempre visible cuando hay subtipo) */}
          {renderComentario()}

          {/* Sección caravanas */}
          {renderSeccionCaravanas()}
        </>
      )}

      {/* Botones */}
      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={enviando || (!!subtipo && filas.some(f => !f.valida))}>
          {enviando ? "Registrando..." : "Registrar"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={enviando}>
          Cancelar
        </Button>
      </div>

    </form>
  )
}
