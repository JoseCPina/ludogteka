import { cache } from "react";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getUserConReintento } from "@/lib/supabase/get-user";
import { ENCABEZADO_APP } from "@/lib/negocio/resolver";
import { telefonoDeCorreoSintetico } from "@/lib/auth/identidad";

/**
 * La sesión de la app para dueños (docs/app-duenos/PLAN.md). Sin negocio: es la persona, en todos sus negocios.
 * Vive en la cookie del portal (area.ts) porque es la misma cuenta con la que entra al portal de cada negocio.
 * La primera vez que entra se asegura su fila en `duenos` (si no la creó ya el puente con los negocios).
 */
export type Dueno = { id: string; telefono: string | null; nombre: string | null; lat: number | null; lng: number | null; ciudad: string | null };

export const sesionApp = cache(async (): Promise<{ user: User; dueno: Dueno } | null> => {
  const supabase = await createSupabaseServerClient("portal");
  const {
    data: { user },
  } = await getUserConReintento(supabase);
  if (!user) return null;
  const dueno = await asegurarDueno(user);
  return { user, dueno };
});

/** ¿Esta petición es de la app para dueños (app.peludesk.mx)? */
export async function esApp(): Promise<boolean> {
  return (await headers()).get(ENCABEZADO_APP) === "1";
}

async function asegurarDueno(user: User): Promise<Dueno> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("duenos").select("id, telefono, nombre, lat, lng, ciudad, ultimo_acceso_at").eq("id", user.id).is("deleted_at", null).maybeSingle();
  const ahora = new Date();
  if (data) {
    // El último acceso se anota como mucho una vez por hora (no en cada pantalla).
    const ultimo = data.ultimo_acceso_at ? new Date(data.ultimo_acceso_at as string).getTime() : 0;
    if (ahora.getTime() - ultimo > 3_600_000) await admin.from("duenos").update({ ultimo_acceso_at: ahora.toISOString() }).eq("id", user.id);
    return { id: data.id as string, telefono: (data.telefono as string | null) ?? null, nombre: (data.nombre as string | null) ?? null, lat: (data.lat as number | null) ?? null, lng: (data.lng as number | null) ?? null, ciudad: (data.ciudad as string | null) ?? null };
  }
  // Cuenta sin fila todavía: el teléfono sale del correo sintético (t<tel>@…) y el nombre de la cuenta, si lo trae.
  const telefono = telefonoDeCorreoSintetico(user.email);
  const nombre = typeof user.user_metadata?.nombre === "string" ? (user.user_metadata.nombre as string).trim() || null : null;
  const { data: otro } = telefono ? await admin.from("duenos").select("id").eq("telefono", telefono).is("deleted_at", null).neq("id", user.id).maybeSingle() : { data: null };
  const fila = { id: user.id, telefono: otro ? null : telefono, nombre, ultimo_acceso_at: ahora.toISOString(), created_by: user.id, updated_at: ahora.toISOString() };
  const { error } = await admin.from("duenos").upsert(fila, { onConflict: "id" });
  if (error) console.error("[app] no se pudo crear la fila del dueño", error.message);
  return { id: user.id, telefono: fila.telefono, nombre, lat: null, lng: null, ciudad: null };
}
