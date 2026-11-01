import { notFound } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { articulosDelNegocio } from "@/lib/ayuda";
import { ArticuloAyuda } from "@/components/ayuda/articulo-ayuda";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarTutorialesVisibles } from "@/lib/tutoriales";
import { videosParaArticulo } from "@/components/ayuda/videos-del-articulo";
import { Enlace } from "@/components/ui/enlace";

// Un artículo, dentro de la app: solo si es de un módulo activo del negocio.
export default async function ArticuloEnApp({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ desde?: string }> }) {
  const { slug } = await params;
  const { desde } = await searchParams;
  const sesion = await obtenerSesionConRol();
  const a = articulosDelNegocio(sesion?.modulos ?? []).find((x) => x.slug === slug);
  if (!a) notFound();
  // Los videos del artículo que este negocio y esta persona pueden ver (módulos activos, permisos).
  const supabase = await createSupabaseServerClient();
  const videos = videosParaArticulo(slug, await cargarTutorialesVisibles(supabase, { rol: sesion?.rol ?? "", permisos: sesion?.permisos ?? [], modulos: sesion?.modulos ?? [] }));
  const pantalla = desde && desde.startsWith("/") ? desde : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        {pantalla && (
          <Enlace href={pantalla}>
            ← Regresar a donde estabas
          </Enlace>
        )}
        <Enlace href="/ayuda">
          Todos los artículos
        </Enlace>
      </div>
      <ArticuloAyuda articulo={a} videos={videos} />
      {sesion?.rol === "recepcion" && !a.roles.includes("recepcion") && (
        <p className="max-w-3xl text-sm text-n-600">Esto lo hace el admin del negocio.</p>
      )}
      <div className="flex max-w-3xl flex-wrap items-center gap-3 border-t border-n-200 pt-4">
        <span className="text-n-700">¿No se resolvió?</span>
        <Enlace href={`/ayuda${pantalla ? `?desde=${encodeURIComponent(pantalla)}` : ""}`}>Pregúntale al asistente</Enlace>
        <Enlace href={`/ayuda/tickets/nuevo?${new URLSearchParams({ ...(pantalla ? { desde: pantalla } : {}), asunto: a.titulo }).toString()}`}>Crear ticket</Enlace>
      </div>
    </div>
  );
}
