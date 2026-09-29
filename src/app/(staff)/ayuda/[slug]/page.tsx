import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { articulosDelNegocio } from "@/lib/ayuda";
import { ArticuloAyuda } from "@/components/ayuda/articulo-ayuda";
import { Button } from "@/components/ui/button";

// Un artículo, dentro de la app: solo si es de un módulo activo del negocio.
export default async function ArticuloEnApp({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ desde?: string }> }) {
  const { slug } = await params;
  const { desde } = await searchParams;
  const sesion = await obtenerSesionConRol();
  const a = articulosDelNegocio(sesion?.modulos ?? []).find((x) => x.slug === slug);
  if (!a) notFound();
  const pantalla = desde && desde.startsWith("/") ? desde : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        {pantalla && (
          <Link href={pantalla} className="text-morado hover:underline">
            ← Regresar a donde estabas
          </Link>
        )}
        <Link href="/ayuda" className="text-morado hover:underline">
          Todos los artículos
        </Link>
      </div>
      <ArticuloAyuda articulo={a} />
      {sesion?.rol === "recepcion" && !a.roles.includes("recepcion") && (
        <p className="max-w-3xl text-sm text-n-600">Esto lo hace el admin del negocio.</p>
      )}
      <div className="flex max-w-3xl flex-wrap items-center gap-3 border-t border-n-200 pt-4">
        <span className="text-n-700">¿No se resolvió?</span>
        <Link href={`/ayuda${pantalla ? `?desde=${encodeURIComponent(pantalla)}` : ""}`}>
          <Button type="button" variante="secundario">Pregúntale al asistente</Button>
        </Link>
        <Link href={`/ayuda/tickets/nuevo?${new URLSearchParams({ ...(pantalla ? { desde: pantalla } : {}), asunto: a.titulo }).toString()}`}>
          <Button type="button" variante="secundario">Crear ticket</Button>
        </Link>
      </div>
    </div>
  );
}
