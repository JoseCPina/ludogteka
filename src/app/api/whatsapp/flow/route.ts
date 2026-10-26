import { after, NextResponse, type NextRequest } from "next/server";
import { configWhatsApp, firmaMetaValida } from "@/lib/whatsapp/infra";
import { cifrarRespuesta, descifrarPeticion, esPeticionCifrada } from "@/lib/whatsapp/flow/cifrado";
import { responderIntercambio } from "@/lib/whatsapp/flow/intercambio";
import { configFlow, depsIntercambio, procesarSesion } from "@/lib/whatsapp/flow/servidor";

/**
 * Endpoint cifrado del WhatsApp Flow «PeluDesk · Prueba gratis» (data exchange). Vive en el dominio de la
 * plataforma: https://peludesk.mx/api/whatsapp/flow (en el de un negocio da 404, como el webhook).
 *
 *   1. firma X-Hub-Signature-256 con el secreto de la app ANTES de leer nada (401);
 *   2. descifra con WHATSAPP_FLOW_PRIVATE_KEY (si no se puede, 421: Meta vuelve a pedir la llave pública);
 *   3. contesta ping, avisos de error, INIT/BACK y el intercambio de cada pantalla (intercambio.ts);
 *      un flow_token que no es nuestro o ya venció → 427;
 *   4. «Crear mi cuenta»: la sesión queda completada, se contesta de inmediato (Meta da 10 s) y el negocio se abre
 *      después (after); el aviso del webhook (nfm_reply) y la tarea de respaldo también lo intentan, y solo uno lo hace.
 * La respuesta va cifrada, en base64 y como texto plano.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const crudo = await request.text();
  if (!firmaMetaValida(request.headers.get("x-hub-signature-256"), crudo, configWhatsApp().appSecret)) {
    console.warn("[whatsapp-flow] firma inválida");
    return new NextResponse("Firma inválida", { status: 401 });
  }
  const { llavePrivada, frase } = configFlow();
  if (!llavePrivada) {
    console.error("[whatsapp-flow] falta WHATSAPP_FLOW_PRIVATE_KEY");
    return new NextResponse("Sin llave", { status: 500 });
  }
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return new NextResponse("Ilegible", { status: 400 });
  }
  if (!esPeticionCifrada(cuerpo)) return new NextResponse("Ilegible", { status: 400 });

  let descifrada: ReturnType<typeof descifrarPeticion>;
  try {
    descifrada = descifrarPeticion(cuerpo, llavePrivada, frase);
  } catch (e) {
    console.error("[whatsapp-flow] no se pudo descifrar", e instanceof Error ? e.message : e);
    return new NextResponse("No se pudo descifrar", { status: 421 });
  }

  const porAbrir: string[] = [];
  let r: Awaited<ReturnType<typeof responderIntercambio>>;
  try {
    r = await responderIntercambio(descifrada.datos, depsIntercambio((token) => porAbrir.push(token)));
  } catch (e) {
    console.error("[whatsapp-flow] intercambio", e instanceof Error ? e.message : e);
    r = { status: 500, cuerpo: null };
  }
  if (porAbrir.length) after(async () => { for (const t of porAbrir) await procesarSesion(t); });
  if (r.status !== 200 || r.cuerpo === null) {
    console.warn("[whatsapp-flow] respuesta", r.status, { accion: descifrada.datos.action, pantalla: descifrada.datos.screen });
    return new NextResponse(r.cuerpo ? JSON.stringify(r.cuerpo) : "", { status: r.status, headers: { "content-type": "application/json" } });
  }
  return new NextResponse(cifrarRespuesta(r.cuerpo, descifrada.aes, descifrada.iv), { status: 200, headers: { "content-type": "text/plain" } });
}
