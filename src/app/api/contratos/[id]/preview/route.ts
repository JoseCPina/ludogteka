import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generarPdfContrato } from "@/lib/contratos/generar-pdf";
import { resolverPlantilla } from "@/lib/contratos/plantilla";
import { paginaDeError } from "@/lib/http/pagina-de-error";

// Vista previa del contrato SIN firmar, generada al vuelo — nunca se
// guarda en Storage (eso solo pasa al firmar de verdad, ver
// portal/contrato-actions.ts). RLS del propio select ya decide quién
// puede verla: staff cualquiera, el cliente solo la suya.
//
// Se abre en una pestaña del navegador (del dueño o del staff): si falla,
// responde una página en español, nunca JSON crudo, y el error real va a
// los logs de Vercel.

const NO_ENCONTRADO = {
  titulo: "No encontramos este contrato",
  que: "Puede que tu sesión se haya cerrado, o que este contrato sea de otra cuenta.",
  queHacer: [
    "Entra a la app con tu teléfono y tu contraseña, y ábrelo desde tu portal.",
    "Si sigue sin abrir, escríbenos y lo revisamos.",
  ],
  status: 404,
};

const NO_SE_PUDO = {
  titulo: "No pudimos preparar tu contrato",
  que: "Tuvimos un problema de nuestro lado al armar el documento. No es nada que hayas hecho mal y tu registro no se perdió.",
  queHacer: [
    "Cierra esta pestaña e inténtalo de nuevo en unos minutos.",
    "Si sigue igual, escríbenos por WhatsApp; también lo puedes firmar en papel en recepción.",
  ],
  status: 500,
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createSupabaseServerClient();

    const { data: contrato, error } = await supabase
      .from("contratos")
      .select("id, plantillas_contrato(titulo, cuerpo)")
      .eq("id", id)
      .single();

    if (error || !contrato) {
      console.error("[contrato preview] no se pudo leer el contrato", id, error?.code, error?.message);
      return paginaDeError(NO_ENCONTRADO);
    }

    const plantilla = Array.isArray(contrato.plantillas_contrato)
      ? contrato.plantillas_contrato[0]
      : contrato.plantillas_contrato;
    if (!plantilla) {
      console.error("[contrato preview] contrato sin plantilla", id);
      return paginaDeError(NO_SE_PUDO);
    }

    const { data: campos, error: errorCampos } = await supabase.rpc("resolver_campos_de_contrato", {
      p_contrato_id: id,
    });
    if (errorCampos || !campos) {
      console.error("[contrato preview] resolver_campos_de_contrato", id, errorCampos?.code, errorCampos?.message);
      return paginaDeError(NO_SE_PUDO);
    }

    const camposTexto = campos as Record<string, string>;
    const pdfBytes = await generarPdfContrato({
      titulo: resolverPlantilla(plantilla.titulo, camposTexto),
      cuerpo: resolverPlantilla(plantilla.cuerpo, camposTexto),
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    console.error("[contrato preview] falló al generar el PDF", id, e);
    return paginaDeError(NO_SE_PUDO);
  }
}
