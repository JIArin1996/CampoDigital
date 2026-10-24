import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ETIQUETA_ACTIVIDAD, ETIQUETA_MODALIDAD, kg, porcentaje, usd } from "@/components/actividades/formato"
import { fechaCorta } from "@/components/lotes/formato"
import { cn } from "@/lib/utils"
import type { ActividadResumen } from "@/types/actividades"

// Resumen de una línea: lo más útil de cada tipo
function detalle(a: ActividadResumen): string {
  const partes: (string | null)[] = []
  if (a.cabezas) partes.push(`${a.cabezas} ${a.tipo === "paricion" ? (a.cabezas === 1 ? "cría" : "crías") : "cab."}`)
  if (a.peso_promedio_kg) partes.push(`${kg(a.peso_promedio_kg)} prom.`)
  if (a.tipo === "venta" && a.rendimiento_pct) partes.push(`rinde ${porcentaje(a.rendimiento_pct)}`)
  if (a.modalidad) partes.push(ETIQUETA_MODALIDAD[a.modalidad])
  if (a.tipo === "mortandad" && a.causa) partes.push(a.causa)
  if (a.tipo === "paricion" && a.nacidos_muertos) partes.push(`${a.nacidos_muertos} nacidos muertos`)
  if (a.monto_usd) partes.push(usd(a.monto_usd))
  // 6b-1
  if (a.tipo === "sanidad" && a.producto) partes.push(a.productos && a.productos > 1 ? `${a.producto} y ${a.productos - 1} más` : a.producto)
  if (a.tipo === "servicio" && a.vacas_entoradas) partes.push(`${a.vacas_entoradas} entoradas${a.toros ? ` · ${a.toros} toros` : ""}`)
  if (a.tipo === "diagnostico_gestacion" && a.vacas_diagnosticadas) {
    partes.push(`${a.vacas_prenadas} preñadas de ${a.vacas_diagnosticadas} (${porcentaje(((a.vacas_prenadas ?? 0) / a.vacas_diagnosticadas) * 100)})`)
  }
  if (a.tipo === "esquila" && a.kg_lana_total) {
    partes.push(`${kg(a.kg_lana_total)} de lana${a.kg_lana_cabeza_aprox ? ` · ≈ ${kg(a.kg_lana_cabeza_aprox)} por cabeza` : ""}`)
  }
  if (a.tipo === "personalizada" && a.campos?.length) partes.push(a.campos.map(c => `${c.campo}: ${c.valor}`).join(", "))
  return partes.filter(Boolean).join(" · ")
}

export function TarjetaActividad({ actividad, nombresLote }: { actividad: ActividadResumen; nombresLote: Map<string, string> }) {
  const a = actividad
  const anulada = !!a.anulada_en
  const cria = a.tipo === "paricion" && a.lote_cria_id ? nombresLote.get(a.lote_cria_id) : null
  // Lote principal; en las de varios lotes (lote_id vacío), todos los de la actividad
  const lote = a.lote_id
    ? nombresLote.get(a.lote_id)
    : (a.lotes ?? []).map(id => nombresLote.get(id)).filter(Boolean).join(", ") || null
  const titulo = a.tipo === "personalizada" && a.personalizada ? a.personalizada : ETIQUETA_ACTIVIDAD[a.tipo]

  return (
    <Link href={`/actividades/${a.id}`}
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("font-semibold", anulada && "line-through text-muted-foreground")}>{titulo}</span>
          {anulada && <Badge variant="secondary">anulada</Badge>}
          <span className="text-sm text-muted-foreground">{fechaCorta(a.fecha)}</span>
        </div>
        {(lote || cria) && (
          <p className="text-sm truncate">{[lote, cria ? `crías a ${cria}` : null].filter(Boolean).join(" · ")}</p>
        )}
        <p className="text-sm text-muted-foreground truncate">{detalle(a)}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  )
}
