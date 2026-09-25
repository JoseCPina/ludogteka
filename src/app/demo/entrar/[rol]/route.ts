import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { CUENTAS_DEMO, esRolDemo } from "@/lib/demo/cuentas";

// "Ver demo": abre sesión con la cuenta del rol escogido en el negocio de
// demostración, sin registro. Solo si el negocio del dominio es un demo y
// la cuenta ahí es de solo lectura (ver lib/demo/cuentas.ts). Location
// relativo, como /auth/callback: el origen de request.url es el del
// servidor, no el dominio del demo.
export const dynamic = "force-dynamic";

function ir(ruta: string) {
  return new NextResponse(null, { status: 303, headers: { Location: ruta, "Cache-Control": "no-store" } });
}

export async function GET(_request: NextRequest, contexto: { params: Promise<{ rol: string }> }) {
  const { rol } = await contexto.params;
  if (!esRolDemo(rol)) return ir("/demo");
  const cuenta = CUENTAS_DEMO[rol];
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);

  const { data: n } = await admin.from("negocios").select("plan").eq("id", negocio.id).maybeSingle();
  if (n?.plan !== "demo") return ir("/login");

  const { data: persona } = await admin.rpc("usuario_por_email", { p_email: cuenta.email });
  const { data: membresia } = persona
    ? await admin.from("membresias").select("solo_lectura").eq("negocio_id", negocio.id).eq("profile_id", persona).is("deleted_at", null).maybeSingle()
    : { data: null };
  if (!membresia?.solo_lectura) {
    console.error("[demo] la cuenta del rol no es de solo lectura en este negocio", rol, negocio.slug);
    return ir("/demo?error=cuenta");
  }

  const { data: link, error: errorLink } = await admin.auth.admin.generateLink({ type: "magiclink", email: cuenta.email });
  if (errorLink || !link.properties?.hashed_token) {
    console.error("[demo] generateLink", errorLink?.message);
    return ir("/demo?error=sesion");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) {
    console.error("[demo] verifyOtp", error.message);
    return ir("/demo?error=sesion");
  }
  return ir(cuenta.destino);
}
