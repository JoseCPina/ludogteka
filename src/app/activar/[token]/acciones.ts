"use server";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { normalizarTelefono } from "@/lib/telefono";
import { correoSinteticoDeTelefono } from "@/lib/auth/identidad";

export type ResultadoActivar = { error: string | null };

/** Qué dice un enlace de activación, sin crear nada. Siempre con el negocio del dominio. */
export async function leerInvitacionPortal(token: string) {
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const hash = createHash("sha256").update(token).digest("hex");
  const { data } = await admin
    .from("portal_invitaciones")
    .select("id, cliente_id, expira_at, usada_at, cancelada_at")
    .eq("negocio_id", negocio.id)
    .eq("token_hash", hash)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { estado: "invalida" as const };
  if (data.usada_at) return { estado: "usada" as const };
  if (data.cancelada_at) return { estado: "cancelada" as const };
  if (new Date(data.expira_at as string).getTime() < Date.now()) return { estado: "vencida" as const };
  const { data: cliente } = await admin
    .from("clientes")
    .select("nombre, telefono")
    .eq("id", data.cliente_id)
    .eq("negocio_id", negocio.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cliente) return { estado: "invalida" as const };
  return { estado: "vigente" as const, id: data.id as string, clienteId: data.cliente_id as string, nombre: cliente.nombre as string };
}

/**
 * Activa la cuenta del portal con un enlace de un solo uso. Valida token,
 * negocio, vencimiento y que no esté usado; la invitación se marca usada
 * ANTES de crear la cuenta (con condición, así dos aperturas a la vez no
 * activan dos veces) y se libera si la cuenta no se pudo crear.
 */
export async function activarCuentaPortal(token: string, password: string): Promise<ResultadoActivar> {
  if (typeof password !== "string" || password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password.length > 72) return { error: "La contraseña es demasiado larga." };
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const inv = await leerInvitacionPortal(token);
  if (inv.estado !== "vigente") return { error: "Este enlace ya no sirve. Pídele otro a recepción." };

  const { data: cliente } = await admin
    .from("clientes").select("telefono").eq("id", inv.clienteId).eq("negocio_id", negocio.id).single();
  const telefono = normalizarTelefono((cliente?.telefono as string | null) ?? "");
  if (!telefono) return { error: "Tu expediente no tiene un teléfono válido. Avísale a recepción." };

  const { data: tomada } = await admin
    .from("portal_invitaciones")
    .update({ usada_at: new Date().toISOString() })
    .eq("id", inv.id).eq("negocio_id", negocio.id).is("usada_at", null).is("cancelada_at", null)
    .select("id");
  if (!tomada || tomada.length === 0) return { error: "Este enlace ya se usó. Si no fuiste tú, avísale a recepción." };
  const soltar = async () => {
    await admin.from("portal_invitaciones").update({ usada_at: null }).eq("id", inv.id).eq("negocio_id", negocio.id);
  };

  const supabase = await createSupabaseServerClient();
  const { data: email } = await admin.rpc("email_de_persona_por_telefono", { p_telefono: telefono });
  let userId: string | null = null;
  let creadoAqui = false;
  if (email) {
    // Ya tiene cuenta en la plataforma (cliente de otro negocio): nunca se toma
    // una cuenta ajena; tiene que escribir SU contraseña.
    const { data, error } = await supabase.auth.signInWithPassword({ email: email as string, password });
    if (error || !data.user) {
      await soltar();
      return { error: "Ya tienes cuenta con ese teléfono (la usas en otro negocio). Escribe la contraseña que ya usas." };
    }
    userId = data.user.id;
  } else {
    const { data: creado, error } = await admin.auth.admin.createUser({
      email: correoSinteticoDeTelefono(telefono), password, email_confirm: true,
    });
    if (error || !creado.user) {
      await soltar();
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }
    userId = creado.user.id;
    creadoAqui = true;
  }

  const { error: errVinc } = await admin.rpc("vincular_membresia_cliente", { p_user_id: userId, p_cliente_id: inv.clienteId });
  if (errVinc) {
    if (creadoAqui && userId) await admin.auth.admin.deleteUser(userId);
    await soltar();
    return { error: "No pudimos ligar tu cuenta. Avísale a recepción." };
  }
  if (creadoAqui) {
    const { error } = await supabase.auth.signInWithPassword({ email: correoSinteticoDeTelefono(telefono), password });
    if (error) return { error: "Tu cuenta quedó lista. Entra con tu teléfono y tu contraseña." };
  }
  return { error: null };
}
