import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlDelNegocio } from "@/lib/negocio/actual";
import type { NegocioBasico } from "@/lib/negocio/resolver";

// Invitar a una persona del personal: lo usan /api/staff/invite (Administración → Invitar personal) y la bienvenida
// («Tu equipo»). Solo crea recepción o estética: un admin nunca nace por aquí. Quien invita tiene que ser admin o
// tener el permiso «Personal» EN ESTE negocio.
export const ROLES_INVITABLES = ["recepcion", "estetica"] as const;
export type RolInvitable = (typeof ROLES_INVITABLES)[number];

export function esRolInvitable(valor: unknown): valor is RolInvitable {
  return typeof valor === "string" && (ROLES_INVITABLES as readonly string[]).includes(valor);
}

export type ResultadoInvitar =
  | { ok: false; status: number; error: string }
  | { ok: true; userId: string; email: string; rol: RolInvitable; inviteLink: string | null; yaTeniaCuenta: boolean; mensaje?: string };

export async function invitarPersonal(
  negocio: Pick<NegocioBasico, "id" | "nombre" | "slug" | "dominio" | "url_publica">,
  callerId: string,
  datos: { email?: string; rol?: string; nombre_completo?: string }
): Promise<ResultadoInvitar> {
  const admin = createSupabaseAdminClient(negocio.id);
  const { data: callerProfile, error: callerProfileError } = await admin
    .from("membresias")
    .select("rol")
    .eq("profile_id", callerId)
    .eq("negocio_id", negocio.id)
    .is("deleted_at", null)
    .maybeSingle();

  // Admin, o alguien de recepción con el permiso «Personal» (misma regla que tiene_permiso() en la base).
  let puedeInvitar = !callerProfileError && callerProfile?.rol === "admin";
  if (!puedeInvitar && !callerProfileError && callerProfile?.rol === "recepcion") {
    const { data: permiso } = await admin
      .from("permisos_staff")
      .select("id")
      .eq("profile_id", callerId)
      .eq("negocio_id", negocio.id)
      .eq("permiso", "personal")
      .is("revocado_at", null)
      .is("deleted_at", null)
      .maybeSingle();
    puedeInvitar = Boolean(permiso);
  }
  if (!puedeInvitar) return { ok: false, status: 403, error: "Solo un admin, o quien tenga el permiso «Personal», puede invitar personal." };

  const email = datos.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 400, error: "Escribe un correo válido." };
  // La agenda, los selectores y los historiales nombran a la persona: sin nombre saldría su correo.
  const nombre = (datos.nombre_completo?.trim() ?? "").slice(0, 120);
  if (nombre.length < 2) return { ok: false, status: 400, error: "Escribe el nombre de la persona: así sale en la agenda y en los historiales." };
  if (!esRolInvitable(datos.rol)) return { ok: false, status: 400, error: `rol debe ser uno de: ${ROLES_INVITABLES.join(", ")}` };
  const rol = datos.rol;

  // generateLink({type:"invite"}) NO rechaza un correo ya registrado si esa cuenta sigue sin confirmar: la reutiliza.
  // Por eso la verificación de "correo nuevo" va explícita, antes de llamarla.
  const { data: existenteId, error: existeError } = await admin.rpc("usuario_por_email", { p_email: email });
  if (existeError) return { ok: false, status: 500, error: existeError.message };
  if (existenteId) {
    // Ya es una persona con cuenta (trabaja en otro negocio de PeluDesk): se le da acceso a ESTE negocio y entra con
    // su misma contraseña.
    const { error: rolError } = await admin.rpc("asignar_rol_staff", { p_user_id: existenteId as string, p_rol: rol, p_nombre_completo: nombre });
    if (rolError) return { ok: false, status: 409, error: rolError.message };
    return {
      ok: true,
      userId: existenteId as string,
      email,
      rol,
      inviteLink: null,
      yaTeniaCuenta: true,
      mensaje: `Ese correo ya tenía cuenta: se le dio acceso a ${negocio.nombre}. Entra en ${urlDelNegocio(negocio)} con su misma contraseña.`,
    };
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "invite", email });
  if (linkError) return { ok: false, status: 500, error: linkError.message };
  const nuevoUserId = linkData.user.id;

  // El rol NO se pone con un UPDATE directo (el trigger lo rechaza sin sesión de admin): asignar_rol_staff es la
  // puerta con nombre, solo service_role, solo recepción/estética, solo sobre una cuenta recién creada.
  const { error: rolError } = await admin.rpc("asignar_rol_staff", { p_user_id: nuevoUserId, p_rol: rol, p_nombre_completo: nombre });
  if (rolError) return { ok: false, status: 500, error: rolError.message };

  // El link apunta a nuestra propia app (/auth/callback), no al action_link crudo de Supabase.
  const inviteLink = `${urlDelNegocio(negocio)}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite`;
  return { ok: true, userId: nuevoUserId, email, rol, inviteLink, yaTeniaCuenta: false };
}
