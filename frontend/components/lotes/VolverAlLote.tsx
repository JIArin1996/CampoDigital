import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export function VolverAlLote({ href, texto = "Volver al lote" }: { href: string; texto?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 h-10 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="h-4 w-4" /> {texto}
    </Link>
  )
}
