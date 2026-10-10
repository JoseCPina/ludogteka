import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioIdActual } from "@/lib/negocio/actual";
import { paginaDeError } from "@/lib/http/pagina-de-error";
import { archivoDeFactura } from "@/lib/cfdi/servicio";

// Descarga del PDF o XML de una factura. Quién puede lo decide la base
// (cfdi_archivos: el personal con permiso, o el dueño de la factura); este
// archivo solo entrega lo que la base dejó ver, con la secret key del negocio.
export async function descargarFactura(facturaId: string, formato: string): Promise<Response> {
  if (formato !== "pdf" && formato !== "xml") {
    return paginaDeError({ titulo: "Archivo no válido", que: "Ese tipo de archivo no existe.", queHacer: ["Usa el botón de PDF o de XML de la factura."], status: 404 });
  }
  if (!/^[0-9a-f-]{36}$/.test(facturaId)) {
    return paginaDeError({ titulo: "No encontramos esa factura", que: "El link no es válido.", queHacer: ["Vuelve a la lista de facturas."], status: 404 });
  }
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("cfdi_archivos", { p_factura_id: facturaId });
  const fila = (Array.isArray(data) ? data[0] : data) as { pdf_path: string | null; xml_path: string | null; estado: string } | null;
  if (error || !fila) {
    if (error) console.error("[cfdi] descarga", error.message);
    return paginaDeError({
      titulo: "No encontramos esa factura",
      que: "No existe o no tienes permiso para verla.",
      queHacer: ["Vuelve a la lista de facturas.", "Si debería estar ahí, pídele a un admin que revise tus permisos."],
      status: 404,
    });
  }
  const negocioId = await negocioIdActual();
  let archivo: { contenido: ArrayBuffer; tipo: string } | null = null;
  try {
    archivo = await archivoDeFactura(createSupabaseAdminClient(negocioId), negocioId, facturaId, formato, fila);
  } catch (e) {
    console.error("[cfdi] archivo", e instanceof Error ? e.message : e);
  }
  if (!archivo) {
    return paginaDeError({
      titulo: "No pudimos bajar el archivo",
      que: "El archivo todavía no está disponible o el timbrado no respondió.",
      queHacer: ["Intenta de nuevo en un minuto.", "Si sigue igual, avísale a un admin."],
      status: 502,
    });
  }
  return new Response(archivo.contenido, {
    headers: {
      "Content-Type": archivo.tipo,
      "Content-Disposition": `attachment; filename="factura-${facturaId.slice(0, 8)}.${formato}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
