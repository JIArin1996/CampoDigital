// Corre todas las pruebas SQL de supabase/tests contra la base y muestra el resultado de cada una.
//
// Uso (desde supabase/scripts, la primera vez: npm install):
//   PowerShell:  $env:SUPABASE_DB_URL = "postgresql://..."   (lo pegás vos; no se guarda en ningún archivo)
//                node correr-pruebas.mjs                      (todas)
//                node correr-pruebas.mjs etapa6b2 cria        (solo las que contengan esos textos)
//
// La URL es la de "Connect > Session pooler" del proyecto en Supabase, con la contraseña de la base.
// Cada prueba termina con un error a propósito que deshace todo: no deja datos. Cada archivo corre
// en su propia conexión, así un archivo no afecta al siguiente.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), "..", "tests")

// Archivo y cantidad de OK esperada (todas con 0 FALLA, 0 OMITIDAS y 0 PREPARACIONES FALLIDAS)
const PRUEBAS = [
  ["etapa3_rls.sql", 95],
  ["etapa5_rls.sql", 104],
  ["etapa6a_rls.sql", 146],
  ["etapa6b1_rls.sql", 129],
  ["etapa6b2_rls.sql", 34],
  ["especies_color_rls.sql", 16],
  ["lotes_anios_nacimiento.sql", 39],
  ["lote_archivos_rls.sql", 64],
  ["lote_cerrado_no_se_edita.sql", 41],
  ["campana_borrada.sql", 12],
  ["kilos_dos_decimales.sql", 14],
  ["cria_al_pie.sql", 22],
  ["mensaje_saldo.sql", 5],
  ["etapa7a_indicadores.sql", 12],
  ["etapa7b_economia.sql", 43],
  ["etapa8_tareas.sql", 44],
  ["potreros_estadias.sql", 66],
]
// Auditoría: funciones de public (todas con ok = true) y filas de permisos de columna
const AUDITORIA = { archivo: "auditoria_permisos.sql", funciones: 88, permisosColumna: 13 }

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Falta la variable SUPABASE_DB_URL. En PowerShell: $env:SUPABASE_DB_URL = "postgresql://..."')
  process.exit(1)
}
const filtros = process.argv.slice(2)
const elegida = (archivo) => filtros.length === 0 || filtros.some(f => archivo.includes(f))

const conectar = async () => {
  const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await cliente.connect()
  return cliente
}

// etapa3_rls.sql es anterior a las omitidas y las preparaciones: informa solo "N OK, N FALLA"
const RESUMEN = /(\d+) OK, (\d+) FALLA(?:, (\d+) OMITIDAS, (\d+) PREPARACIONES FALLIDAS)?/

async function correrPrueba(archivo, esperado) {
  const sql = readFileSync(join(CARPETA, archivo), "utf8")
  const cliente = await conectar()
  try {
    await cliente.query(sql)
    return { archivo, ok: false, texto: "terminó sin el error final: revisar el archivo" }
  } catch (err) {
    const m = RESUMEN.exec(err.message ?? "")
    if (!m) return { archivo, ok: false, texto: `error antes del reporte: ${err.code ?? ""} ${err.message}` }
    const [, oks, fallas, omitidas, preps] = m.map(x => Number(x ?? 0))
    const bien = oks === esperado && fallas === 0 && omitidas === 0 && preps === 0
    // Si algo no da, las líneas que no son OK
    const detalle = bien ? [] : (err.message.split("\n").filter(l => /^(FALLA|OMITIDA|PREP) /.test(l)))
    return { archivo, ok: bien, texto: `${oks} OK (esperado ${esperado}), ${fallas} FALLA, ${omitidas} OMITIDAS, ${preps} PREP`, detalle }
  } finally {
    await cliente.end().catch(() => {})
  }
}

async function correrAuditoria() {
  const sql = readFileSync(join(CARPETA, AUDITORIA.archivo), "utf8")
  const cliente = await conectar()
  try {
    const resultados = [].concat(await cliente.query(sql)).filter(r => r.command === "SELECT")
    const funciones = resultados.find(r => r.fields.some(f => f.name === "ok"))
    const permisos = resultados.find(r => r.fields.some(f => f.name === "nivel"))
    const sinRls = resultados.find(r => r.fields.some(f => f.name === "problema"))
    const malas = funciones ? funciones.rows.filter(r => !r.ok).map(r => r.funcion) : ["(no se encontró la consulta de funciones)"]
    const nFunciones = funciones?.rowCount ?? 0
    const nPermisos = permisos?.rowCount ?? 0
    const nSinRls = sinRls?.rowCount ?? 0
    const bien = malas.length === 0 && nFunciones === AUDITORIA.funciones && nPermisos === AUDITORIA.permisosColumna && nSinRls === 0
    return {
      archivo: AUDITORIA.archivo,
      ok: bien,
      texto: `${nFunciones} funciones (esperado ${AUDITORIA.funciones}), ${malas.length} con ok = false; `
        + `${nPermisos} filas de permisos (esperado ${AUDITORIA.permisosColumna}); ${nSinRls} tablas o vistas sin RLS`,
      detalle: malas.map(f => `funcion con ok = false: ${f}`),
    }
  } catch (err) {
    return { archivo: AUDITORIA.archivo, ok: false, texto: `error: ${err.code ?? ""} ${err.message}` }
  } finally {
    await cliente.end().catch(() => {})
  }
}

const resultados = []
for (const [archivo, esperado] of PRUEBAS.filter(([a]) => elegida(a))) {
  process.stdout.write(`Corriendo ${archivo}... `)
  const r = await correrPrueba(archivo, esperado)
  console.log(r.ok ? "bien" : "REVISAR")
  resultados.push(r)
}
if (elegida(AUDITORIA.archivo)) {
  process.stdout.write(`Corriendo ${AUDITORIA.archivo}... `)
  const r = await correrAuditoria()
  console.log(r.ok ? "bien" : "REVISAR")
  resultados.push(r)
}

console.log("\nResultado:")
for (const r of resultados) {
  console.log(`${r.ok ? "  bien   " : "  REVISAR"}  ${r.archivo.padEnd(32)} ${r.texto}`)
  for (const linea of r.detalle ?? []) console.log(`             ${linea}`)
}
const malos = resultados.filter(r => !r.ok).length
console.log(malos === 0 ? `\nTodo bien (${resultados.length} archivos).` : `\n${malos} de ${resultados.length} archivos para revisar.`)
process.exit(malos === 0 ? 0 : 1)
