import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/layout/Sidebar"
import { Toaster } from "@/components/ui/sonner"
import { EstablecimientoProvider } from "@/lib/context/EstablecimientoContext"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Campo Digital",
    template: "%s | Campo Digital",
  },
  description: "Sistema de gestión para establecimientos rurales",
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  themeColor: "#166534",
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
          {/* Toaster global para notificaciones */}
          <Toaster position="top-right" richColors />
        </EstablecimientoProvider>
      </body>
    </html>
  )
}
