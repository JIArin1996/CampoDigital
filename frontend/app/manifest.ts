import type { MetadataRoute } from "next"

// Manifest para instalar la app en el teléfono ("Agregar a la pantalla de inicio")
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Campo Digital",
    short_name: "Campo Digital",
    description: "Gestión, bitácora y calendario de establecimientos ganaderos",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#196632",
    lang: "es-UY",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
