import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Único destino para invitaciones y recuperación de contraseña. Los
// links de correo de Supabase (invite/recovery/magiclink) NO usan el
// flujo OAuth de code+exchangeCodeForSession — eso es solo para
// proveedores externos. Usan token_hash+verifyOtp, y el link debe
// apuntar a nuestra propia app (no al action_link crudo de
// /auth/v1/verify, que es de Supabase) — por eso quien genera el link
// arma la URL con hashed_token, no con action_link. Antes de esto no
// existía ninguna ruta que recibiera esto: el link caía en la raíz del
// sitio y el invitado terminaba en /login sin forma de poner su
// contraseña.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (token_hash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}/auth/nueva-password`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invitacion_invalida`);
}
