"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download, Upload, AlertCircle, FileSpreadsheet } from "lucide-react"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { createAnimalesBulk } from "@/lib/queries/animales"
import { toast } from "sonner"
import type { AnimalInsert, SexoAnimal, OrigenAnimal } from "@/types/database"

interface ExcelImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExcelImportModal({ open, onOpenChange }: ExcelImportModalProps) {
  const router = useRouter()
  const { establecimientoActivo } = useEstablecimiento()
  
  const [file, setFile] = useState<File | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [errors, setErrors] = useState<{ fila: number; mensaje: string }[]>([])
  
  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        caravana_snig: "12345678",
        caravana_propia: "A1",
        categoria: "Vaca de Invernada",
        sexo: "Hembra",
        raza: "Angus",
        fecha_nacimiento: "2020-05-15",
        peso_entrada: 350,
        origen: "Comprado",
        observaciones: "Alimentación inicial"
      }
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Animales")
    XLSX.writeFile(wb, "plantilla_importacion_animales.xlsx")
  }

  const handleProcessFile = async () => {
    if (!file) return
    if (!establecimientoActivo) {
      toast.error("Seleccione un establecimiento contexto")
      return
    }

    setProcesando(true)
    setErrors([])

    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any>(ws)

      if (rows.length === 0) {
        setErrors([{ fila: 0, mensaje: "El archivo está vacío." }])
        setProcesando(false)
        return
      }

      const newErrores: { fila: number; mensaje: string }[] = []
      const insertData: AnimalInsert[] = []

      rows.forEach((row, index) => {
        const rowNum = index + 2 // Fila 1 is header

        if (!row.caravana_snig) {
          newErrores.push({ fila: rowNum, mensaje: "caravana_snig es requerida." })
          return
        }
        if (!row.categoria) {
          newErrores.push({ fila: rowNum, mensaje: "categoria es requerida." })
          return
        }
        
        let sexoRaw = String(row.sexo || "").trim()
        if (sexoRaw !== "Macho" && sexoRaw !== "Hembra") {
          newErrores.push({ fila: rowNum, mensaje: "sexo debe ser Macho o Hembra." })
          return
        }

        let origenVal: OrigenAnimal | null = null
        if (row.origen) {
           const o = String(row.origen).trim()
           if (o === "Propio" || o === "Comprado" || o === "Nacido en campo") {
             origenVal = o as OrigenAnimal
           } else {
             newErrores.push({ fila: rowNum, mensaje: "origen inválido." })
             return
           }
        }

        insertData.push({
          establecimiento_id: establecimientoActivo.id,
          caravana_snig: String(row.caravana_snig).trim(),
          caravana_propia: row.caravana_propia ? String(row.caravana_propia).trim() : null,
          categoria: String(row.categoria).trim(),
          sexo: sexoRaw as SexoAnimal,
          raza: row.raza ? String(row.raza).trim() : null,
          fecha_nacimiento: row.fecha_nacimiento ? String(row.fecha_nacimiento).trim() : null,
          peso_entrada: row.peso_entrada ? Number(row.peso_entrada) : null,
          fecha_peso_entrada: row.peso_entrada && !row.fecha_peso_entrada ? new Date().toISOString().split('T')[0] : (row.fecha_peso_entrada ? String(row.fecha_peso_entrada).trim() : null),
          origen: origenVal,
          observaciones: row.observaciones ? String(row.observaciones) : null,
          estado: 'activo',
          fecha_baja: null,
          madre_id: null,
          movimiento_origen_id: null,
          potrero_actual: null,
          parcela_actual: null,
          user_id: null
        })
      })

      if (newErrores.length > 0) {
        setErrors(newErrores)
        setProcesando(false)
        return
      }

      await createAnimalesBulk(insertData)
      toast.success(`${insertData.length} animales registrados correctamente.`)
      
      setFile(null)
      onOpenChange(false)
      router.refresh()
      
    } catch (err: any) {
      if (err.message && err.message.includes("unique")) {
        setErrors([{ fila: 0, mensaje: "Hay caravanas SNIG en este Excel que ya existen en su base de datos o están duplicadas en el archivo." }])
      } else {
        setErrors([{ fila: 0, mensaje: err.message || "Error desconocido al procesar" }])
      }
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val && procesando) return
      if (!val) { setFile(null); setErrors([]) }
      onOpenChange(val)
    }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Importar Masiva desde Excel
          </DialogTitle>
          <DialogDescription>
            Carga múltiples animales directamente usando nuestra plantilla.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex bg-muted/40 p-4 rounded-lg flex-col items-center justify-center border border-dashed hover:bg-muted/60 transition-colors">
            {file ? (
              <div className="text-center">
                <FileSpreadsheet className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)} className="h-6 mt-2 text-xs">Cambiar</Button>
              </div>
            ) : (
              <label htmlFor="excel-upload" className="cursor-pointer text-center w-full">
                <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium">Arrastra o haz click para subir</p>
                <p className="text-xs text-muted-foreground mt-1">Formatos soportados: .xlsx, .csv</p>
                <input 
                  id="excel-upload" 
                  type="file" 
                  className="hidden" 
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0])
                      setErrors([])
                    }
                  }}
                />
              </label>
            )}
          </div>

          <div className="flex items-center justify-between bg-primary/5 p-3 rounded border border-primary/20">
            <div className="text-sm">
              <p className="font-semibold text-primary">¿No tienes la plantilla?</p>
              <p className="text-xs text-muted-foreground">Descarga el archivo base para asegurar el formato correcto.</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate} type="button">
              <Download className="w-4 h-4 mr-1.5" /> Plantilla
            </Button>
          </div>

          {errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg p-3 max-h-40 overflow-y-auto mt-2">
              <p className="font-semibold flex items-center mb-1"><AlertCircle className="w-4 h-4 mr-1"/> Errores de validación:</p>
              <ul className="list-disc pl-5 space-y-1">
                {errors.map((e, idx) => (
                  <li key={idx}>
                    {e.fila > 0 ? <span>Fila {e.fila}: </span> : null}
                    {e.mensaje}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={procesando}>
            Cancerlar
          </Button>
          <Button onClick={handleProcessFile} disabled={!file || procesando}>
            {procesando ? "Procesando Lote..." : "Cargar y Validar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
