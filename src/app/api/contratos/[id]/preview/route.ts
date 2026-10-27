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
// La abren el personal (ficha del perro, «Ver borrador») y el dueño (portal y alta por link, «Leer contrato»), y
// desde N12 cada uno tiene su propia cookie de sesión: /api cae en el área «personal», así que con solo esa el
// dueño llegaba sin sesión y la RLS no le devolvía su contrato (27 de octubre de 2026, un cliente de Ludogteka no
// pudo leer los suyos). Se lee con la sesión del personal y, si esa no lo ve, con la del portal.
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

async function leerConAlgunaSesion(id: string) {
  let ultimo: { code?: string; message?: string } | null = null;
  for (const area of ["personal", "portal"] as const) {
    const supabase = await createSupabaseServerClient(area);
    const { data: contrato, error } = await supabase
      .from("contratos")
      .select("id, plantillas_contrato(titulo, cuerpo)")
      .eq("id", id)
      .maybeSingle();
    if (contrato) return { supabase, contrato, area };
    ultimo = error ?? { code: "sin_fila", message: `ninguna fila con la sesión ${area}` };
  }
  return { supabase: null, contrato: null, error: ultimo };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { supabase, contrato, error } = await leerConAlgunaSesion(id);

    if (!supabase || !contrato) {
      console.error("[contrato preview] no se pudo leer el contrato con ninguna sesión", id, error?.code, error?.message);
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
