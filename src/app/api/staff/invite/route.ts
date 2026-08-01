import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCallerUser } from "@/lib/supabase/caller";

// Whitelist server-side: este endpoint nunca puede crear 'admin' ni
// 'cliente', pase lo que pase en el body. Alta de admins es procedimiento
// manual (ver docs/PROYECTO.md); 'cliente' nace por self-signup.
const ROLES_INVITABLES = ["recepcion", "estetica"] as const;
type RolInvitable = (typeof ROLES_INVITABLES)[number];

function esRolInvitable(valor: unknown): valor is RolInvitable {
  return (
    typeof valor === "string" &&
    (ROLES_INVITABLES as readonly string[]).includes(valor)
  );
}

export async function POST(request: Request) {
  const caller = await getCallerUser(request);
  if (!caller) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("profiles")
    .select("rol")
    .eq("id", caller.id)
    .single();

  if (callerProfileError || callerProfile?.rol !== "admin") {
    return NextResponse.json(
      { error: "Solo un admin puede invitar staff." },
      { status: 403 }
    );
  }

  let body: { email?: string; rol?: string; nombre_completo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Falta email." }, { status: 400 });
  }

  if (!esRolInvitable(body.rol)) {
    return NextResponse.json(
      { error: `rol debe ser uno de: ${ROLES_INVITABLES.join(", ")}` },
      { status: 400 }
    );
  }
  const rol = body.rol;

  // generateLink({type:"invite"}) NO rechaza un correo ya registrado si esa
  // cuenta sigue sin confirmar: la reutiliza y regenera el link. Por eso la
  // verificación de "correo nuevo" va explícita, antes de llamarla.
  const { data: yaExiste, error: existeError } = await admin.rpc(
    "existe_usuario_por_email",
    { p_email: email }
  );
  if (existeError) {
    return NextResponse.json({ error: existeError.message }, { status: 500 });
  }
  if (yaExiste) {
    return NextResponse.json(
      { error: "Ya existe una cuenta con ese correo." },
      { status: 409 }
    );
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
  });

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  const nuevoUserId = linkData.user.id;

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({ rol, nombre_completo: body.nombre_completo ?? null })
    .eq("id", nuevoUserId);

  if (profileUpdateError) {
    return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
  }

  // El link apunta a nuestra propia app (/auth/callback), no al
  // action_link crudo de Supabase — ver comentario en esa ruta.
  const origin = new URL(request.url).origin;
  const inviteLink = `${origin}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite`;

  return NextResponse.json({
    email,
    rol,
    invite_link: inviteLink,
  });
}
