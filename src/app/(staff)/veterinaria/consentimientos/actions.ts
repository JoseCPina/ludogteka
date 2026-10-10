"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { generarPdfContrato } from "@/lib/contratos/generar-pdf";
import { fechaLocalDeInstante, horaLocalDeInstante } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { llenarConsentimiento, variablesDesconocidas } from "@/lib/veterinaria/carnet";
import { traducirError } from "../../reservas/traducir-error";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

const BUCKET = "perros-archivos";
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Firma de un consentimiento en el mostrador. Como en un contrato, el PDF se arma en el
 * servidor: la hora y la IP del sello salen de aquí, no de lo que reporte el navegador.
 */
export async function firmarConsentimiento(consentimientoId: string, firmanteNombre: string, firmaPngDataUrl: string): Promise<ResultadoAccion> {
  const nombre = firmanteNombre.trim();
  if (!nombre) return { error: "Escribe el nombre de quien firma." };
  if (!firmaPngDataUrl.startsWith("data:image/png;base64,")) return { error: "La firma no se capturó correctamente. Vuelve a firmar." };
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();

  const { data: c, error: errorLectura } = await supabase
    .from("consentimientos")
    .select("id, perro_id, cliente_id, titulo, cuerpo, estado")
    .eq("id", consentimientoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (errorLectura || !c) return { error: "No encontramos ese consentimiento." };
  if (c.estado !== "pendiente_firma") return { error: "Este consentimiento ya no está pendiente de firma." };

  const { data: campos, error: errorCampos } = await supabase.rpc("consentimiento_campos", { p_id: consentimientoId });
  if (errorCampos || !campos) return { error: "No pudimos preparar el consentimiento para firmarlo. Intenta de nuevo." };
  const mapa = campos as Record<string, string>;
  const cuerpo = llenarConsentimiento(c.cuerpo as string, mapa);
  const titulo = llenarConsentimiento(c.titulo as string, mapa);
  const faltan = variablesDesconocidas(`${titulo}\n${cuerpo}`);
  if (faltan.length > 0) return { error: `El texto de este consentimiento trae campos que el sistema no sabe llenar: ${faltan.join(", ")}. Corrígelos en la plantilla y crea otro consentimiento.` };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "no determinada";
  const ahoraIso = new Date().toISOString();
  const pngBytes = Buffer.from(firmaPngDataUrl.slice("data:image/png;base64,".length), "base64");
  const pdfBytes = await generarPdfContrato({
    titulo,
    cuerpo,
    firma: {
      pngBytes,
      firmanteNombre: nombre,
      fechaHoraTexto: `${fechaLocalDeInstante(ahoraIso, zona)} ${horaLocalDeInstante(ahoraIso, zona)}`,
      lugarHora: (await cargarNegocioLanding()).ciudad ?? zona,
      ip,
    },
  });
  const hash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
  const ruta = `${c.cliente_id}/${c.perro_id}/consentimientos/${c.id}.pdf`;
  const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(ruta, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (errorSubida) return { error: "No pudimos guardar el PDF firmado. Intenta de nuevo." };

  const { error } = await supabase.rpc("consentimiento_registrar_firma", { p_id: consentimientoId, p_firmante: nombre, p_metodo: "mostrador", p_ip: ip, p_hash: hash, p_path: ruta });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/consentimientos/${consentimientoId}`);
  revalidatePath("/veterinaria/consentimientos");
  return { error: null, exito: "Consentimiento firmado y guardado." };
}

export async function urlConsentimientoFirmado(ruta: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 60 * 30);
  return error ? null : data.signedUrl;
}

export async function cancelarConsentimiento(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_consentimiento", { p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/consentimientos/${id}`);
  return { error: null, exito: "Consentimiento cancelado." };
}

export async function guardarPlantillaConsentimiento(tipo: string, fd: FormData): Promise<ResultadoAccion> {
  const titulo = texto(fd, "titulo");
  const cuerpo = texto(fd, "cuerpo");
  if (!titulo || !cuerpo) return { error: "El título y el texto no pueden quedar vacíos." };
  const faltan = variablesDesconocidas(`${titulo}\n${cuerpo}`);
  if (faltan.length > 0) return { error: `El texto usa campos que el sistema no sabe llenar: ${faltan.join(", ")}.` };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("guardar_plantilla_consentimiento", { p_tipo: tipo, p_titulo: titulo, p_cuerpo: cuerpo });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/consentimientos");
  return { error: null, exito: `Guardado: es la versión ${data as number}. Los consentimientos que ya se crearon conservan su texto.` };
}
