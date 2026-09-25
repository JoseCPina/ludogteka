import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCallerUser } from "@/lib/supabase/caller";
import { negocioActual, urlDelNegocio } from "@/lib/negocio/actual";

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

  // Todo en ESTE negocio (el del dominio): el rol de quien invita, su
  // permiso, y la membresía que se crea.
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("membresias")
    .select("rol")
    .eq("profile_id", caller.id)
    .eq("negocio_id", negocio.id)
    .is("deleted_at", null)
    .maybeSingle();

  // Admin, o alguien de recepción con el permiso «Personal» (permisos_staff,
  // misma regla que tiene_permiso() en la base). Los roles que se pueden
  // invitar siguen siendo solo recepción y estética: con el permiso nadie
  // puede crear un admin.
  let puedeInvitar = !callerProfileError && callerProfile?.rol === "admin";
  if (!puedeInvitar && !callerProfileError && callerProfile?.rol === "recepcion") {
    const { data: permiso } = await admin
      .from("permisos_staff")
      .select("id")
      .eq("profile_id", caller.id)
      .eq("negocio_id", negocio.id)
      .eq("permiso", "personal")
      .is("revocado_at", null)
      .is("deleted_at", null)
      .maybeSingle();
    puedeInvitar = Boolean(permiso);
  }
  if (!puedeInvitar) {
    return NextResponse.json(
      { error: "Solo un admin, o quien tenga el permiso «Personal», puede invitar personal." },
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
  const { data: existenteId, error: existeError } = await admin.rpc("usuario_por_email", { p_email: email });
  if (existeError) {
    return NextResponse.json({ error: existeError.message }, { status: 500 });
  }
  if (existenteId) {
    // Ya es una persona con cuenta (por ejemplo, trabaja en otro negocio de
    // PeluDesk): no se crea otra; se le da acceso a ESTE negocio y entra
    // con su misma contraseña.
    const { error: rolError } = await admin.rpc("asignar_rol_staff", {
      p_user_id: existenteId as string,
      p_rol: rol,
      p_nombre_completo: body.nombre_completo ?? null,
    });
    if (rolError) {
      return NextResponse.json({ error: rolError.message }, { status: 409 });
    }
    return NextResponse.json({
      email,
      rol,
      invite_link: null,
      ya_tenia_cuenta: true,
      mensaje: `Ese correo ya tenía cuenta: se le dio acceso a ${negocio.nombre}. Entra en ${urlDelNegocio(negocio)} con su misma contraseña.`,
    });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
  });

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  const nuevoUserId = linkData.user.id;

  // El rol NO se pone con un UPDATE directo: desde el arreglo de guardias
  // (10 de septiembre de 2026) el trigger proteger_columnas_sensibles_profile
  // rechaza cambiar `rol` sin sesión de admin, y la secret key no tiene
  // sesión. Antes pasaba porque el guardia evaluaba a NULL. La RPC
  // asignar_rol_staff es la puerta con nombre: solo service_role puede
  // ejecutarla, solo asigna recepcion/estetica, y solo sobre una cuenta
  // que todavía es 'cliente' (la que se acaba de crear).
  const { error: rolError } = await admin.rpc("asignar_rol_staff", {
    p_user_id: nuevoUserId,
    p_rol: rol,
    p_nombre_completo: body.nombre_completo ?? null,
  });

  if (rolError) {
    return NextResponse.json({ error: rolError.message }, { status: 500 });
  }

  // El link apunta a nuestra propia app (/auth/callback), no al
  // action_link crudo de Supabase — ver comentario en esa ruta.
  const inviteLink = `${urlDelNegocio(negocio)}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite`;

  return NextResponse.json({
    email,
    rol,
    invite_link: inviteLink,
  });
}
