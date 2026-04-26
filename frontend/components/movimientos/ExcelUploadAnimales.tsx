"use client"

import { useRef, useState } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Upload, X, AlertCircle, CheckCircle } from "lucide-react"
import { validarSNIG, normalizarSexo } from "@/lib/utils/snig"

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface FilaIngreso {
  fila: number
  caravana: string
  sexo: 'Macho' | 'Hembra'
  edadMeses?: number
  error?: string
}

export interface FilaEgreso {
  fila: number
  caravana: string
  error?: string
}

type Modo = 'ingreso_completo' | 'ingreso_simple' | 'egreso'

interface Props {
  modo: Modo
  onChange: (filas: FilaIngreso[] | FilaEgreso[]) => void
  caravanasActivas?: string[]  // para validar egresos
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsearFilasIngreso(rows: string[][], completo: boolean): FilaIngreso[] {
  return rows
    .map((row, i) => {
      const fila = i + 2
      const caravana = (row[0] ?? '').toString().trim()
      const sexoRaw = (row[1] ?? '').toString().trim()
      const edadRaw = completo ? (row[2] ?? '').toString().trim() : undefined

      const errores: string[] = []

      if (!validarSNIG(caravana)) {
        errores.push(`Caravana inválida: "${caravana}" (debe ser 15 dígitos empezando por 8580000)`)
      }

      const sexo = normalizarSexo(sexoRaw)
      if (!sexo) {
        errores.push(`Sexo inválido: "${sexoRaw}" (debe ser H, M, Hembra o Macho)`)
      }

      let edadMeses: number | undefined
      if (completo) {
        const edad = parseInt(edadRaw ?? '', 10)
        if (isNaN(edad) || edad < 0) {
          errores.push(`Edad inválida: "${edadRaw}" (debe ser número entero ≥ 0)`)
        } else {
          edadMeses = edad
        }
      }

      return {
        fila,
        caravana,
        sexo: sexo ?? 'Macho',
        edadMeses,
        error: errores.length > 0 ? errores.join('. ') : undefined,
      }
    })
    .filter(r => r.caravana !== '')
}

function parsearFilasEgreso(rows: string[][], activas: string[]): FilaEgreso[] {
  const activasSet = new Set(activas.map(c => c.trim()))
  return rows
    .map((row, i) => {
      const fila = i + 2
      const caravana = (row[0] ?? '').toString().trim()

      const errores: string[] = []
      if (!validarSNIG(caravana)) {
        errores.push(`Caravana inválida: "${caravana}"`)
      } else if (activas.length > 0 && !activasSet.has(caravana)) {
        errores.push('No está activa en este establecimiento')
      }

      return {
        fila,
        caravana,
        error: errores.length > 0 ? errores.join('. ') : undefined,
      }
    })
    .filter(r => r.caravana !== '')
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ExcelUploadAnimales({ modo, onChange, caravanasActivas = [] }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [filas, setFilas] = useState<(FilaIngreso | FilaEgreso)[]>([])

  const limpiar = () => {
    setNombreArchivo(null)
    setFilas([])
    onChange([])
    if (inputRef.current) inputRef.current.value = ''
  }

  const procesarArchivo = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
        const dataRows = raw.slice(1).filter(row => row.some(cell => cell !== '')) as string[][]

        let resultado: (FilaIngreso | FilaEgreso)[]

        if (modo === 'egreso') {
          resultado = parsearFilasEgreso(dataRows, caravanasActivas)
        } else {
          resultado = parsearFilasIngreso(dataRows, modo === 'ingreso_completo')
        }

        setNombreArchivo(file.name)
        setFilas(resultado)
        onChange(resultado as any)
      } catch {
        alert('Error al leer el archivo Excel. Verificá el formato.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
  }

  const hayErrores = filas.some(f => f.error)
  const totalOk = filas.filter(f => !f.error).length

  return (
    <div className="space-y-3">
      {/* Formato esperado */}
      <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Formato Excel esperado:</p>
        {modo === 'egreso' && <p>Columna A: Caravana SNIG (15 dígitos, empieza por 8580000)</p>}
        {modo === 'ingreso_simple' && (
          <>
            <p>Columna A: Caravana SNIG | Columna B: Sexo (H/M o Hembra/Macho)</p>
          </>
        )}
        {modo === 'ingreso_completo' && (
          <>
            <p>Columna A: Caravana SNIG | Columna B: Sexo (H/M) | Columna C: Edad en meses</p>
          </>
        )}
        <p className="text-xs">La primera fila se ignora (encabezado).</p>
      </div>

      {/* Botón de carga */}
      {!nombreArchivo ? (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Hacer clic para seleccionar archivo Excel</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleChange}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header del resultado */}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              {hayErrores ? (
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              )}
              <span className="text-sm font-medium">{nombreArchivo}</span>
              <span className="text-xs text-muted-foreground">
                {totalOk} de {filas.length} animales válidos
              </span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={limpiar}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tabla de preview */}
          <div className="max-h-40 overflow-y-auto rounded-md border text-xs">
            <table className="w-full">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2">Fila</th>
                  <th className="text-left p-2">Caravana SNIG</th>
                  {modo !== 'egreso' && <th className="text-left p-2">Sexo</th>}
                  {modo === 'ingreso_completo' && <th className="text-left p-2">Edad</th>}
                  <th className="text-left p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.fila} className={f.error ? 'bg-red-50' : ''}>
                    <td className="p-2 text-muted-foreground">{f.fila}</td>
                    <td className="p-2 font-mono">{f.caravana}</td>
                    {modo !== 'egreso' && (
                      <td className="p-2">{(f as FilaIngreso).sexo === 'Hembra' ? 'H' : 'M'}</td>
                    )}
                    {modo === 'ingreso_completo' && (
                      <td className="p-2">{(f as FilaIngreso).edadMeses ?? '—'} m</td>
                    )}
                    <td className="p-2">
                      {f.error ? (
                        <span className="text-destructive">{f.error}</span>
                      ) : (
                        <span className="text-green-600">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hayErrores && (
            <p className="text-xs text-destructive">
              Corregí los errores en el Excel y volvé a cargar el archivo.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
