import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { paginaDeError } from "@/lib/http/pagina-de-error";
import { archivoDeFactura } from "@/lib/cfdi/servicio";
import { resolverEnlaceFactura } from "@/components/cfdi/enlace";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; formato: string }> }) {
  const { token, formato } = await params;
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const r = formato === "pdf" || formato === "xml" ? await resolverEnlaceFactura(admin, negocio.id, token) : null;
  if (!r || r.estado !== "ok") {
    return paginaDeError({
      titulo: r?.estado === "vencido" ? "Este link ya venció" : "Este link no está disponible",
      que: "No pudimos abrir la factura con este link.",
      queHacer: [`Pídele a ${negocio.nombre} que te lo mande de nuevo.`],
      status: 404,
    });
  }
  let archivo: { contenido: ArrayBuffer; tipo: string } | null = null;
  try {
    archivo = await archivoDeFactura(admin, negocio.id, r.factura.id, formato as "pdf" | "xml", r.factura);
  } catch (e) {
    console.error("[cfdi] enlace archivo", e instanceof Error ? e.message : e);
  }
  if (!archivo) {
    return paginaDeError({ titulo: "No pudimos bajar el archivo", que: "El archivo no está disponible por ahora.", queHacer: ["Intenta de nuevo en un minuto."], status: 502 });
  }
  return new Response(archivo.contenido, {
    headers: {
      "Content-Type": archivo.tipo,
      "Content-Disposition": `attachment; filename="factura.${formato}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
