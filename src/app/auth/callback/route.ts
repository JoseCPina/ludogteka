import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Único destino de redirect_to para invitaciones y recuperación de
// contraseña (flujo PKCE de @supabase/ssr: el link de /auth/v1/verify
// llega aquí con ?code=..., nunca con tokens en el hash). Antes de esto
// no existía ninguna ruta que lo recibiera — el link caía en la raíz del
// sitio, el código se perdía y el invitado terminaba en /login sin forma
// de poner su contraseña.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/auth/nueva-password`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invitacion_invalida`);
}
