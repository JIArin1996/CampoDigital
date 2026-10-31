// Copia el worker de pdf.js (el visor de PDF de VisorArchivo) a public/, para servirlo como archivo
// estático en /pdfjs/pdf.worker.min.mjs. Corre solo después de cada `npm install` (postinstall), así
// el worker siempre es de la misma versión que pdfjs-dist (si no coinciden, pdf.js no abre el PDF).
// El archivo copiado no se versiona (está en .gitignore).

import { copyFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..")
const origen = join(raiz, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs")
const destino = join(raiz, "public", "pdfjs", "pdf.worker.min.mjs")

mkdirSync(dirname(destino), { recursive: true })
copyFileSync(origen, destino)
console.log("pdf.js: worker copiado a public/pdfjs/")
