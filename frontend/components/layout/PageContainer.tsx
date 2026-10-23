import { cn } from "@/lib/utils"

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  // Título opcional que se muestra en la parte superior de la página
  title?: string
  // Más ancho en la computadora (pantallas con mapa)
  ancho?: boolean
}

/**
 * Contenedor estándar para todas las páginas.
 * Deja lugar para la navegación fija:
 *  - celular: encabezado arriba (h-14), barra inferior (h-16) y el botón "+" encima de ella;
 *  - escritorio: menú lateral (w-56).
 */
export function PageContainer({ children, className, title, ancho = false }: PageContainerProps) {
  return (
    <main
      className={cn(
        "min-h-screen pt-14 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-12 md:ml-56",
        className
      )}
    >
      <div className={cn("mx-auto px-4 py-6", ancho ? "max-w-7xl" : "max-w-4xl")}>
        {title && (
          <h1 className="text-2xl font-bold text-foreground mb-6">{title}</h1>
        )}
        {children}
      </div>
    </main>
  )
}
