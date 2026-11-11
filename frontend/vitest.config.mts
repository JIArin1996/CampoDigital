import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Pruebas de la lógica de la app (sin navegador): npm test, desde PowerShell o cmd. En Git Bash, Node ve la carpeta
// como "c:\…" (minúscula) y Vitest falla con "Cannot read properties of undefined (reading 'config')".
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
})
