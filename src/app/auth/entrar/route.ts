import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Canje de un link de un solo uso que abre sesión en ESTE dominio y manda
// a una pantalla de la app: lo usa el registro de prueba en peludesk.mx,
// que crea el negocio en otro dominio (<slug>.peludesk.mx) y necesita que
// la sesión nazca aquí. /auth/callback es otra cosa: invitaciones y
// recuperación, que terminan en escoger contraseña.
//
// `next` solo puede ser una de estas rutas: nunca una dirección de
// afuera (un link así serviría para mandar a alguien, con sesión, a
// cualquier lado).
const DESTINOS = new Set(["/bienvenida", "/admin"]);

function ir(ruta: string) {
  return new NextResponse(null, { status: 303, headers: { Location: ruta, "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const next = searchParams.get("next") ?? "/admin";
  if (!tokenHash) return ir("/login");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error) {
    console.error("[auth/entrar] verifyOtp", error.message);
    return ir("/login?error=link_vencido");
  }
  return ir(DESTINOS.has(next) ? next : "/admin");
}
