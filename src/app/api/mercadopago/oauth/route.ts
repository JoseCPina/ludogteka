import { NextResponse, type NextRequest } from "next/server";
import { completarConexion, leerEstado } from "@/lib/mercadopago/oauth";
import { negocioParaCobro } from "@/lib/pagos/conexion";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { paginaSimple } from "@/lib/http/pagina-simple";

// Regreso de "Conectar Mercado Pago" (la redirect_uri registrada en la
// aplicación de PeluDesk, en el dominio de la plataforma). Aquí no hay
// sesión del negocio: autoriza el `state` firmado y el nonce sin usar que
// creó un admin de ese negocio (src/lib/mercadopago/oauth.ts). Al terminar
// se regresa al admin a SU dominio, a la pantalla de cobro.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("error") ? null : url.searchParams.get("code");
  const estado = leerEstado(state);
  const negocio = estado ? await negocioParaCobro(estado.n) : null;
  if (!estado || !negocio) {
    console.error("[mercadopago] regreso de OAuth con state inválido o vencido");
    return paginaSimple({
      titulo: "Este enlace de conexión ya no sirve",
      parrafos: ["Venció o ya se usó. Regresa a tu negocio y vuelve a apretar «Conectar Mercado Pago»."],
      status: 400,
    });
  }
  const r = await completarConexion(state, code);
  if (!r.ok) console.warn("[mercadopago] conexión no completada", { negocio: negocio.id, error: r.error });
  const destino = new URL(`${urlDelNegocio(negocio)}/admin/pagos`);
  if (r.ok) destino.searchParams.set("mp", "conectado");
  else destino.searchParams.set("mp_error", r.error ?? "No se pudo conectar.");
  return NextResponse.redirect(destino.toString(), 303);
}
