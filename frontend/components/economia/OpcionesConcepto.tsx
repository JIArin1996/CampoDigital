import type { Concepto, GrupoConcepto, Sentido } from "@/types/economia"

/**
 * Opciones de un <select> de conceptos, solo los del tipo (ingreso o gasto): primero los sin grupo y
 * después uno por grupo, en el orden de los grupos. Recibe los conceptos que se pueden elegir (activos).
 */
export function OpcionesConcepto({ conceptos, grupos, tipo }: { conceptos: Concepto[]; grupos: GrupoConcepto[]; tipo: Sentido }) {
  const delTipo = conceptos.filter(c => c.tipo === tipo)
  const opcion = (c: Concepto) => <option key={c.id} value={c.id}>{c.nombre}</option>
  return (
    <>
      {delTipo.filter(c => !c.grupo_id || !grupos.some(g => g.id === c.grupo_id)).map(opcion)}
      {grupos.map(g => {
        const delGrupo = delTipo.filter(c => c.grupo_id === g.id)
        return delGrupo.length > 0 && <optgroup key={g.id} label={g.nombre}>{delGrupo.map(opcion)}</optgroup>
      })}
    </>
  )
}
