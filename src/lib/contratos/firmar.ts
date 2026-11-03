import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generarPdfContrato } from "@/lib/contratos/generar-pdf";
import { resolverPlantilla } from "@/lib/contratos/plantilla";
import { fechaLocalDeInstante, horaLocalDeInstante } from "@/lib/formato";

const BUCKET = "perros-archivos";

export type ResultadoFirma = { error: string | null; perroId?: string; clienteId?: string };

/**
 * La firma digital de un contrato pendiente, compartida por el portal del dueño y la app para dueños (Fase 3): el
 * ensamblado del PDF pasa por el servidor a propósito, no por el navegador: la fecha/hora y la IP del bloque de auditoría
 * deben venir de algo que el propio cliente no pueda inventar. `supabase` es el cliente CON la sesión del dueño y el
 * negocio del contrato (el portal por su dominio; la app con `supabaseAppEnNegocio`): la base decide con mi_cliente_id().
 */
export async function firmarContratoCon(
  supabase: SupabaseClient,
  args: { contratoId: string; firmaPngDataUrl: string; zona: string; lugar: string | null; ip: string }
): Promise<ResultadoFirma> {
  const { data: contrato, error: errorContrato } = await supabase
    .from("contratos")
    .select("id, perro_id, cliente_id, estado, plantillas_contrato(titulo, cuerpo)")
    .eq("id", args.contratoId)
    .single();
  if (errorContrato || !contrato) return { error: "No encontramos ese contrato." };
  if (contrato.estado !== "pendiente_firma") return { error: "Este contrato ya no está pendiente de firma." };

  const plantilla = Array.isArray(contrato.plantillas_contrato) ? contrato.plantillas_contrato[0] : contrato.plantillas_contrato;
  if (!plantilla) return { error: "No pudimos leer la plantilla de este contrato." };

  // Por contrato, no por perro: el de guardería trae el paquete, los pases y la vigencia de la compra de la que salió.
  const { data: campos, error: errorCampos } = await supabase.rpc("resolver_campos_de_contrato", { p_contrato_id: contrato.id });
  if (errorCampos || !campos) {
    // El detalle a los logs: sin él, el 23 de septiembre de 2026 no se veía que la causa era 'record "v_bono" is not assigned yet'.
    console.error("[firmar contrato] resolver_campos_de_contrato", contrato.id, errorCampos?.code, errorCampos?.message);
    return {
      error:
        "No pudimos preparar tu contrato para firmarlo. Intenta de nuevo en unos minutos; si sigue igual, escríbenos por WhatsApp o fírmalo en papel en recepción.",
    };
  }
  const { data: clienteRow } = await supabase.from("clientes").select("nombre").eq("id", contrato.cliente_id).single();

  if (!args.firmaPngDataUrl.startsWith("data:image/png;base64,")) return { error: "La firma no se capturó correctamente. Vuelve a firmar." };
  const pngBytes = Buffer.from(args.firmaPngDataUrl.slice("data:image/png;base64,".length), "base64");

  const ahoraIso = new Date().toISOString();
  const fechaHoraTexto = `${fechaLocalDeInstante(ahoraIso, args.zona)} ${horaLocalDeInstante(ahoraIso, args.zona)}`;
  const camposTexto = campos as Record<string, string>;
  const pdfBytes = await generarPdfContrato({
    titulo: resolverPlantilla(plantilla.titulo, camposTexto),
    cuerpo: resolverPlantilla(plantilla.cuerpo, camposTexto),
    firma: { pngBytes, firmanteNombre: clienteRow?.nombre ?? "—", fechaHoraTexto, lugarHora: args.lugar ?? args.zona, ip: args.ip },
  });

  const hash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
  const storagePath = `${contrato.cliente_id}/${contrato.perro_id}/contrato/${contrato.id}.pdf`;
  const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (errorSubida) return { error: "No pudimos guardar el PDF firmado. Intenta de nuevo." };

  const { error: errorFinal } = await supabase.rpc("finalizar_firma_contrato", {
    p_contrato_id: args.contratoId,
    p_storage_path: storagePath,
    p_hash_pdf: hash,
    p_ip: args.ip,
  });
  if (errorFinal) return { error: "No pudimos registrar la firma. Intenta de nuevo." };
  return { error: null, perroId: contrato.perro_id as string, clienteId: contrato.cliente_id as string };
}

/** La IP de quien firma, de los encabezados de la petición (para el bloque de auditoría del PDF). */
export function ipDeFirma(hdrs: { get(nombre: string): string | null }): string {
  return hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "no determinada";
}
