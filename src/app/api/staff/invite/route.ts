import { NextResponse } from "next/server";
import { getCallerUser } from "@/lib/supabase/caller";
import { negocioActual } from "@/lib/negocio/actual";
import { invitarPersonal } from "@/lib/personal/invitar";

// Whitelist server-side: este endpoint nunca puede crear 'admin' ni 'cliente', pase lo que pase en el body. Alta de
// admins es procedimiento manual (ver docs/PROYECTO.md); 'cliente' nace por self-signup. Las reglas viven en
// invitarPersonal (las comparte la bienvenida, «Tu equipo»).
export async function POST(request: Request) {
  const caller = await getCallerUser(request);
  if (!caller) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let body: { email?: string; rol?: string; nombre_completo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  // Todo en ESTE negocio (el del dominio): el rol de quien invita, su permiso, y la membresía que se crea.
  const negocio = await negocioActual();
  const r = await invitarPersonal(negocio, caller.id, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({
    email: r.email,
    rol: r.rol,
    invite_link: r.inviteLink,
    ...(r.yaTeniaCuenta ? { ya_tenia_cuenta: true, mensaje: r.mensaje } : {}),
  });
}
