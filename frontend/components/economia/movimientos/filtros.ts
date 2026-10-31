// Filtros del listado de movimientos: se guardan en la URL (para recargar o compartir sin perderlos).
//
//   ?pestana=movimientos&tipo=egreso&tit=<id>&tit=<id>&pag=<id>&rub=<id>&con=<id>&fac=<nombre>&estado=pendiente
//    &anulados=1&periodo=mes&mes=2026-10 | periodo=anio&anio=2026 | periodo=rango&desde=…&hasta=…&orden=monto
//
// Regla del titular: con titulares elegidos, cada movimiento cuenta solo con la parte de esos titulares
// (según el reparto), y los totales también. Con un pagador elegido se usa el monto entero.

import type { Movimiento, MovimientoTitular, Sentido } from "@/types/economia"

export type TipoFiltro = "" | Sentido
export type PeriodoMov = { tipo: "mes"; mes: string } | { tipo: "anio"; anio: number } | { tipo: "rango"; desde: string; hasta: string }
export type Orden = "fecha" | "monto"

export interface FiltrosMov {
  tipo: TipoFiltro
  titulares: string[]
  pagadores: string[]
  rubros: string[]
  conceptos: string[]
  facturas: string[]
  estado: "" | "pagado" | "pendiente"
  anulados: boolean
  periodo: PeriodoMov
  orden: Orden
}

const mesActual = () => new Date().toLocaleDateString("en-CA").slice(0, 7)
const esFecha = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function leerFiltros(p: URLSearchParams): FiltrosMov {
  const tipo = p.get("tipo")
  const estado = p.get("estado")
  let periodo: PeriodoMov = { tipo: "mes", mes: mesActual() }
  const mes = p.get("mes"), anio = Number(p.get("anio")), desde = p.get("desde"), hasta = p.get("hasta")
  if (p.get("periodo") === "anio" && anio > 2000) periodo = { tipo: "anio", anio }
  else if (p.get("periodo") === "rango" && esFecha(desde) && esFecha(hasta)) periodo = { tipo: "rango", desde, hasta }
  else if (mes && /^\d{4}-\d{2}$/.test(mes)) periodo = { tipo: "mes", mes }
  return {
    tipo: tipo === "ingreso" || tipo === "egreso" ? tipo : "",
    titulares: p.getAll("tit"),
    pagadores: p.getAll("pag"),
    rubros: p.getAll("rub"),
    conceptos: p.getAll("con"),
    facturas: p.getAll("fac"),
    estado: estado === "pagado" || estado === "pendiente" ? estado : "",
    anulados: p.get("anulados") === "1",
    periodo,
    orden: p.get("orden") === "monto" ? "monto" : "fecha",
  }
}

// La URL de unos filtros (conserva los demás parámetros, como la pestaña)
export function escribirFiltros(base: URLSearchParams, f: FiltrosMov): string {
  const p = new URLSearchParams(base)
  for (const k of ["tipo", "tit", "pag", "rub", "con", "fac", "estado", "anulados", "periodo", "mes", "anio", "desde", "hasta", "orden"]) p.delete(k)
  if (f.tipo) p.set("tipo", f.tipo)
  f.titulares.forEach(v => p.append("tit", v))
  f.pagadores.forEach(v => p.append("pag", v))
  f.rubros.forEach(v => p.append("rub", v))
  f.conceptos.forEach(v => p.append("con", v))
  f.facturas.forEach(v => p.append("fac", v))
  if (f.estado) p.set("estado", f.estado)
  if (f.anulados) p.set("anulados", "1")
  p.set("periodo", f.periodo.tipo)
  if (f.periodo.tipo === "mes") p.set("mes", f.periodo.mes)
  if (f.periodo.tipo === "anio") p.set("anio", String(f.periodo.anio))
  if (f.periodo.tipo === "rango") { p.set("desde", f.periodo.desde); p.set("hasta", f.periodo.hasta) }
  if (f.orden === "monto") p.set("orden", "monto")
  return p.toString()
}

// Fechas del período (inclusive)
export function rangoDe(periodo: PeriodoMov): { desde: string; hasta: string } {
  if (periodo.tipo === "rango") return { desde: periodo.desde, hasta: periodo.hasta }
  if (periodo.tipo === "anio") return { desde: `${periodo.anio}-01-01`, hasta: `${periodo.anio}-12-31` }
  const [a, m] = periodo.mes.split("-").map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { desde: `${periodo.mes}-01`, hasta: `${periodo.mes}-${String(ultimo).padStart(2, "0")}` }
}

// Cuántos filtros de la hoja "Filtros" están puestos (el tipo y el período se ven siempre)
export const cantidadFiltros = (f: FiltrosMov) =>
  f.titulares.length + f.pagadores.length + f.rubros.length + f.conceptos.length + f.facturas.length + (f.estado ? 1 : 0) + (f.anulados ? 1 : 0)

// Parte en dólares de unos titulares en un movimiento (proporcional, como la base)
export function parteUsd(m: Movimiento, partes: MovimientoTitular[], titulares: string[]): number {
  const enMoneda = partes.filter(p => titulares.includes(p.titular_id)).reduce((s, p) => s + Number(p.monto), 0)
  return Math.round(Number(m.monto_usd) * enMoneda / Number(m.monto_original) * 100) / 100
}

export interface FilaMov {
  m: Movimiento
  partes: MovimientoTitular[]     // su reparto
  usd: number                     // lo que cuenta: el monto entero, o la parte de los titulares elegidos
  esParte: boolean
}

// Aplica los filtros (salvo el período, que ya filtró la consulta) y ordena
export function filtrar(movimientos: Movimiento[], reparto: MovimientoTitular[], f: FiltrosMov): FilaMov[] {
  const porMov = new Map<string, MovimientoTitular[]>()
  for (const r of reparto) porMov.set(r.movimiento_id, [...(porMov.get(r.movimiento_id) ?? []), r])
  const filas = movimientos
    .filter(m =>
      (!f.tipo || m.sentido === f.tipo)
      && (f.anulados || !m.anulado_en)
      && (!f.estado || m.estado === f.estado)
      && (f.pagadores.length === 0 || (!!m.pagador_id && f.pagadores.includes(m.pagador_id)))
      && (f.rubros.length === 0 || f.rubros.includes(m.rubro_id))
      && (f.conceptos.length === 0 || (!!m.concepto_id && f.conceptos.includes(m.concepto_id)))
      && (f.facturas.length === 0 || (!!m.factura_nombre && f.facturas.includes(m.factura_nombre)))
      && (f.titulares.length === 0 || (porMov.get(m.id) ?? []).some(p => f.titulares.includes(p.titular_id))))
    .map(m => {
      const partes = porMov.get(m.id) ?? []
      const esParte = f.titulares.length > 0
      const usd = esParte ? parteUsd(m, partes, f.titulares) : Number(m.monto_usd)
      return { m, partes, usd, esParte: esParte && Math.abs(usd - Number(m.monto_usd)) >= 0.005 }
    })
  return f.orden === "monto"
    ? filas.sort((a, b) => b.usd - a.usd)
    : filas   // ya vienen por fecha, del más nuevo al más viejo
}

// Totales de lo filtrado (sin los anulados)
export function totales(filas: FilaMov[]) {
  let ingresos = 0, egresos = 0
  for (const f of filas) {
    if (f.m.anulado_en) continue
    if (f.m.sentido === "ingreso") ingresos += f.usd
    else egresos += f.usd
  }
  return { ingresos, egresos, neto: ingresos - egresos }
}
