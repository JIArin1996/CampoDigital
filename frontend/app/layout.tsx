import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/layout/Sidebar"
import { Toaster } from "@/components/ui/sonner"
import { EstablecimientoProvider } from "@/lib/context/EstablecimientoContext"
import { BotonCargaRapida } from "@/components/layout/BotonCargaRapida"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Campo Digital",
    template: "%s | Campo Digital",
  },
  description: "Gestión, bitácora y calendario de establecimientos ganaderos",
  appleWebApp: { capable: true, title: "Campo Digital", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  themeColor: "#196632",
  // Que el contenido respete la barra de gestos del teléfono (barra inferior y botón +)
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <EstablecimientoProvider>
          <Sidebar />
          {children}
          <BotonCargaRapida />
          {/* Toaster global para notificaciones */}
          <Toaster position="top-right" richColors />
        </EstablecimientoProvider>
      </body>
    </html>
  )
}
