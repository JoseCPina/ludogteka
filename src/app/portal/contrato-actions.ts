"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generarPdfContrato } from "@/lib/contratos/generar-pdf";
import { resolverPlantilla } from "@/lib/contratos/plantilla";
import { fechaLocalDeInstante, horaLocalDeInstante } from "@/lib/formato";

const BUCKET = "perros-archivos";

export type EstadoFirmarContrato = { error: string | null };

// Todo el ensamblado del PDF pasa por el servidor a propósito, no por el
// navegador: la fecha/hora y la IP del bloque de auditoría deben venir de
// algo que el propio cliente no pueda inventar — si se armara el PDF en
// el navegador, la "evidencia" de la firma sería tan confiable como lo
// que el propio firmante quisiera reportar de sí mismo.
export async function firmarContratoDigital(
  contratoId: string,
  firmaPngDataUrl: string
): Promise<EstadoFirmarContrato> {
  const supabase = await createSupabaseServerClient();

  const { data: contrato, error: errorContrato } = await supabase
    .from("contratos")
    .select("id, perro_id, cliente_id, estado, plantillas_contrato(titulo, cuerpo)")
    .eq("id", contratoId)
    .single();

  if (errorContrato || !contrato) return { error: "No encontramos ese contrato." };
  if (contrato.estado !== "pendiente_firma") {
    return { error: "Este contrato ya no está pendiente de firma." };
  }

  const plantilla = Array.isArray(contrato.plantillas_contrato)
    ? contrato.plantillas_contrato[0]
    : contrato.plantillas_contrato;
  if (!plantilla) return { error: "No pudimos leer la plantilla de este contrato." };

  // Por contrato, no por perro: el de guardería trae el paquete, los
  // pases y la vigencia de la compra de la que salió.
  const { data: campos, error: errorCampos } = await supabase.rpc("resolver_campos_de_contrato", {
    p_contrato_id: contrato.id,
  });
  if (errorCampos || !campos) {
    // El detalle a los logs: sin él, el 23 de septiembre de 2026 no se veía
    // que la causa era 'record "v_bono" is not assigned yet' en la base.
    console.error("[firmar contrato] resolver_campos_de_contrato", contrato.id, errorCampos?.code, errorCampos?.message);
    return {
      error:
        "No pudimos preparar tu contrato para firmarlo. Intenta de nuevo en unos minutos; si sigue igual, escríbenos por WhatsApp o fírmalo en papel en recepción.",
    };
  }

  const { data: clienteRow } = await supabase
    .from("clientes")
    .select("nombre")
    .eq("id", contrato.cliente_id)
    .single();

  if (!firmaPngDataUrl.startsWith("data:image/png;base64,")) {
    return { error: "La firma no se capturó correctamente. Vuelve a firmar." };
  }
  const pngBytes = Buffer.from(firmaPngDataUrl.slice("data:image/png;base64,".length), "base64");

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "no determinada";

  const ahoraIso = new Date().toISOString();
  const fechaHoraTexto = `${fechaLocalDeInstante(ahoraIso)} ${horaLocalDeInstante(ahoraIso)}`;

  const camposTexto = campos as Record<string, string>;
  const pdfBytes = await generarPdfContrato({
    titulo: resolverPlantilla(plantilla.titulo, camposTexto),
    cuerpo: resolverPlantilla(plantilla.cuerpo, camposTexto),
    firma: {
      pngBytes,
      firmanteNombre: clienteRow?.nombre ?? "—",
      fechaHoraTexto,
      ip,
    },
  });

  const hash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
  const storagePath = `${contrato.cliente_id}/${contrato.perro_id}/contrato/${contrato.id}.pdf`;

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (errorSubida) return { error: "No pudimos guardar el PDF firmado. Intenta de nuevo." };

  const { error: errorFinal } = await supabase.rpc("finalizar_firma_contrato", {
    p_contrato_id: contratoId,
    p_storage_path: storagePath,
    p_hash_pdf: hash,
    p_ip: ip,
  });
  if (errorFinal) return { error: "No pudimos registrar la firma. Intenta de nuevo." };

  revalidatePath(`/portal/perros/${contrato.perro_id}`);
  return { error: null };
}

export async function obtenerUrlContrato(storagePath: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);
  return error ? null : data.signedUrl;
}
