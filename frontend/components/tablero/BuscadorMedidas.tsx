"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Info, Plus, Search } from "lucide-react"

import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { NOMBRE_FUENTE, esFabrica, medidaDe } from "@/components/tablero/catalogo"
import { buscarMedidas, descripcionDe, terminosDe, type Resultado } from "@/components/tablero/ayudas"
import { cn } from "@/lib/utils"
import type { Fuente } from "@/types/tablero"

// Las últimas medidas elegidas en esta computadora (comodidad: si el navegador no guarda, no pasa nada)
const CLAVE_RECIENTES = "tablero.medidasRecientes"
function leerRecientes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? "[]")
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}
function guardarReciente(clave: string) {
  try {
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify([clave, ...leerRecientes().filter(x => x !== clave)].slice(0, 6)))
  } catch { /* sin almacenamiento: solo no se recuerda */ }
}

const claveDe = (r: { fuente: Fuente; medida: string }) => `${r.fuente}:${r.medida}`
const separar = (clave: string): [Fuente, string] => {
  const i = clave.indexOf(":")
  return [clave.slice(0, i) as Fuente, clave.slice(i + 1)]
}
// El grupo de una medida en la lista: su fuente; los indicadores calculados, de fábrica o del campo
const grupoDe = (r: Resultado) =>
  r.fuente === "combinada" ? (esFabrica(r.medida) ? "Indicadores calculados de fábrica" : "Indicadores calculados del campo") : NOMBRE_FUENTE[r.fuente]

/**
 * ¿Qué querés ver? (contexto/DISENO-CONSTRUCTOR-TARJETAS.md, sección 2): un buscador de medidas con nombre, unidad y
 * una línea de descripción, sinónimos ("plata" → Resultado), "Usadas recientemente" arriba y, al costado, el glosario
 * de la medida resaltada (se lee también con el teclado). Al final, crear un indicador calculado.
 */
export function BuscadorMedidas({ fuente, medida, onElegir, onNuevoIndicador, permitir, nombreCampo = "Qué medir" }: {
  fuente: Fuente
  medida: string
  onElegir: (fuente: Fuente, medida: string) => void
  onNuevoIndicador?: () => void               // sin esto, no ofrece crear un indicador (dentro del indicador calculado)
  permitir?: (fuente: Fuente, medida: string) => boolean // qué medidas se ofrecen (por defecto, todas)
  nombreCampo?: string                        // para el lector de pantalla: "Qué medir", "Medida A"...
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState("")
  const [resaltada, setResaltada] = useState("")
  const [recientes, setRecientes] = useState<string[]>([])

  const info = medidaDe(fuente, medida)
  const resultados = useMemo(() => buscarMedidas(texto).filter(r => !permitir || permitir(r.fuente, r.medida)), [texto, permitir])
  // Sin texto: las recientes arriba y todas agrupadas por fuente; con texto: las coincidencias, en su orden
  const grupos = useMemo(() => {
    const porGrupo = new Map<string, Resultado[]>()
    for (const r of resultados) {
      const g = texto.trim() ? "Resultados" : grupoDe(r)
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), r])
    }
    return [...porGrupo.entries()]
  }, [resultados, texto])
  const recientesValidas = texto.trim() ? [] : recientes.filter(k => { const [f, m] = separar(k); return !!medidaDe(f, m) && (!permitir || permitir(f, m)) })

  const elegir = (clave: string) => {
    const [f, m] = separar(clave)
    guardarReciente(clave)
    onElegir(f, m)
    setAbierto(false)
  }
  const [fr, mr] = resaltada.includes(":") ? separar(resaltada) : [fuente, medida]
  const terminos = terminosDe(fr, mr)

  const item = (r: { fuente: Fuente; medida: string; etiqueta: string; motivo?: string | null }, prefijo: string) => {
    const clave = claveDe(r)
    const m = medidaDe(r.fuente, r.medida)
    return (
      <CommandItem key={`${prefijo}${clave}`} value={`${prefijo}${clave}`} onSelect={() => elegir(clave)} className="flex-col gap-0.5">
        <span className="flex w-full items-center gap-2">
          <span className="font-semibold">{r.etiqueta}</span>
          {m?.unidad && <span className="rounded-full bg-secondary px-2 py-px text-[11px] font-semibold text-secondary-foreground">{m.unidad}</span>}
          {terminosDe(r.fuente, r.medida).length > 0 && <Info className="h-3.5 w-3.5 text-primary" aria-label="tiene glosario" />}
          {r.motivo && <span className="ml-auto text-[11px] text-muted-foreground">{r.motivo}</span>}
        </span>
        <span className="text-xs text-muted-foreground">{descripcionDe(r.fuente, r.medida)}</span>
      </CommandItem>
    )
  }

  return (
    <Popover open={abierto} onOpenChange={a => { setAbierto(a); if (a) { setTexto(""); setRecientes(leerRecientes()) } }}>
      <PopoverTrigger
        render={<button type="button" aria-label={`${nombreCampo}: ${info?.etiqueta ?? medida}. Cambiar`} />}
        className="flex w-full items-center gap-2.5 rounded-lg border border-input bg-background px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <span className="truncate">{info?.etiqueta ?? "Elegí una medida"}</span>
            {info?.unidad && <span className="shrink-0 rounded-full bg-secondary px-2 py-px text-[11px] font-semibold text-secondary-foreground">{info.unidad}</span>}
          </span>
          <span className="truncate text-xs text-muted-foreground">{descripcionDe(fuente, medida)}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[680px] max-w-[calc(100vw-2rem)] gap-0 p-0">
        <Command shouldFilter={false} value={resaltada} onValueChange={setResaltada} loop>
          <div className="relative">
            <CommandInput autoFocus value={texto} onValueChange={setTexto} aria-label="Buscar medida"
              placeholder="Buscá lo que querés ver: plata, engorde, animales, carga…" />
            {texto.trim() && (
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                {resultados.length} {resultados.length === 1 ? "resultado" : "resultados"}
              </span>
            )}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_230px]">
            <CommandList className="max-h-[420px]">
              {resultados.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No hay medidas con &quot;{texto}&quot;. Probá con otra palabra.</p>}
              {recientesValidas.length > 0 && (
                <>
                  <CommandGroup heading="Usadas recientemente">
                    {recientesValidas.map(k => { const [f, m] = separar(k); return item({ fuente: f, medida: m, etiqueta: medidaDe(f, m)!.etiqueta }, "r:") })}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              {grupos.map(([g, lista]) => (
                <CommandGroup key={g} heading={g}>{lista.map(r => item(r, ""))}</CommandGroup>
              ))}
              {onNuevoIndicador && <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value="nuevo-indicador" onSelect={() => { setAbierto(false); onNuevoIndicador() }} className="font-semibold text-primary">
                    <Plus className="h-4 w-4" aria-hidden /> Crear un indicador calculado (A ÷ B, A × B…)
                  </CommandItem>
                </CommandGroup>
              </>}
            </CommandList>
            <aside aria-live="polite" className="border-l bg-muted/40 p-3 text-sm">
              {terminos.length > 0 ? terminos.map(t => (
                <div key={t.titulo} className="mb-3 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Glosario</p>
                  <p className="font-semibold">{t.titulo}</p>
                  <p className="leading-snug">{t.texto}</p>
                  <p className={cn("rounded-md bg-background px-2 py-1.5 leading-snug")}><strong>Ejemplo:</strong> {t.ejemplo}</p>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground">Moviéndote por la lista, acá aparece qué significa cada término técnico (UG, Ha SPG, presión acumulada…) con un ejemplo.</p>
              )}
            </aside>
          </div>
          <p className="border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">↑ ↓ para moverse · Enter elige · Esc cierra</p>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
