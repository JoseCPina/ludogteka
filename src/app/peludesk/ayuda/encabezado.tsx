import Link from "next/link";
import { LogoPeluDesk } from "@/components/marca/peludesk";
import { urlDemo } from "@/lib/peludesk/landing";

// El encabezado del centro de ayuda público (peludesk.mx/ayuda).
export function EncabezadoAyuda() {
  return (
    <header className="border-b border-n-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label="PeluDesk, inicio">
          <LogoPeluDesk tamano={32} />
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <Link href="/ayuda" className="text-n-700 hover:underline">Ayuda</Link>
          <a href={`${urlDemo()}/demo`} className="text-n-700 hover:underline">Ve el demo</a>
          <Link href="/registro" className="rounded-md bg-morado px-4 py-2 text-white hover:opacity-90">Pruébalo 15 días gratis</Link>
        </nav>
      </div>
    </header>
  );
}
