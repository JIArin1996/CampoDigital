export const SNIG_REGEX = /^8580000\d{8}$/
export const DICOSE_FISICO_REGEX = /^\d{9}$/
export const DICOSE_PROPIEDAD_REGEX = /^(\d{9}|[A-Za-z]{2}\d{7})$/

export function validarSNIG(caravana: string): boolean {
  return SNIG_REGEX.test(caravana.trim())
}

export function validarDicoseFisico(dicose: string): boolean {
  return DICOSE_FISICO_REGEX.test(dicose.trim())
}

export function validarDicosePropiedad(dicose: string): boolean {
  return DICOSE_PROPIEDAD_REGEX.test(dicose.trim())
}

export function normalizarSexo(raw: string): 'Macho' | 'Hembra' | null {
  const v = raw.trim().toUpperCase()
  if (v === 'H' || v === 'HEMBRA') return 'Hembra'
  if (v === 'M' || v === 'MACHO') return 'Macho'
  return null
}

export function sexoADisplay(sexo: 'Macho' | 'Hembra'): string {
  return sexo === 'Hembra' ? 'H' : 'M'
}

export function calcularCategoria(sexo: 'Macho' | 'Hembra', edadMeses: number): string {
  if (sexo === 'Macho') {
    if (edadMeses < 12) return 'Ternero'
    if (edadMeses < 36) return 'Novillo'
    return 'Toro'
  } else {
    if (edadMeses < 12) return 'Ternera'
    if (edadMeses < 24) return 'Vaquillona'
    return 'Vaca'
  }
}

export function calcularEdadMeses(fechaNac: Date, fechaRef: Date): number {
  const diffMs = fechaRef.getTime() - fechaNac.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44)))
}
