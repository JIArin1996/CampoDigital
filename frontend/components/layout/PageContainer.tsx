import { cn } from "@/lib/utils"

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  // Título opcional que se muestra en la parte superior de la página
  title?: string
}

/**
 * Contenedor estándar para todas las páginas.
 * Agrega el padding necesario para no quedar tapado por el sidebar (desktop)
 * ni por la barra inferior (mobile).
 */
export function PageContainer({ children, className, title }: PageContainerProps) {
  return (
    <main
      className={cn(
        // En mobile: padding bottom para la barra de navegación inferior
        // En desktop: margin left para el sidebar fijo
        "min-h-screen pb-20 md:pb-0 md:ml-56",
        className
      )}
    >
      <div className="max-w-4xl mx-auto px-4 py-6">
        {title && (
          <h1 className="text-2xl font-bold text-foreground mb-6">{title}</h1>
        )}
        {children}
      </div>
    </main>
  )
}
