import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generarPdfContrato, resolverTokens } from "@/lib/contratos/generar-pdf";

// Vista previa del contrato SIN firmar, generada al vuelo — nunca se
// guarda en Storage (eso solo pasa al firmar de verdad, ver
// portal/contrato-actions.ts). RLS del propio select ya decide quién
// puede verla: staff cualquiera, el cliente solo la suya.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: contrato, error } = await supabase
    .from("contratos")
    .select("perro_id, plantillas_contrato(titulo, cuerpo)")
    .eq("id", id)
    .single();

  if (error || !contrato) {
    return NextResponse.json({ error: "Contrato no encontrado." }, { status: 404 });
  }

  const plantilla = Array.isArray(contrato.plantillas_contrato)
    ? contrato.plantillas_contrato[0]
    : contrato.plantillas_contrato;
  if (!plantilla) {
    return NextResponse.json({ error: "Plantilla no encontrada." }, { status: 404 });
  }

  const { data: campos, error: errorCampos } = await supabase.rpc("resolver_campos_contrato", {
    p_perro_id: contrato.perro_id,
  });
  if (errorCampos || !campos) {
    return NextResponse.json({ error: "No pudimos leer los datos del expediente." }, { status: 500 });
  }

  const camposTexto = campos as Record<string, string>;
  const pdfBytes = await generarPdfContrato({
    titulo: resolverTokens(plantilla.titulo, camposTexto),
    cuerpo: resolverTokens(plantilla.cuerpo, camposTexto),
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
    },
  });
}
