"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { rutaPorRol } from "@/lib/auth/rutas";
import { urlDelNegocio } from "@/lib/negocio/actual";

// Pasar a otro negocio (o sucursal) de la misma persona desde el selector del personal. Cada dominio tiene su
// propia sesión: aquí se arma un link de un solo uso para ESTA persona que abre la sesión en el otro dominio
// (/auth/entrar) y la deja en la pantalla de su rol. Solo a negocios donde trabaja (mis_negocios, con su sesión).
const ROLES_PERSONAL = new Set(["admin", "recepcion", "estetica"]);

export async function irANegocio(negocioId: string): Promise<{ error: string | null; url?: string }> {
  const sesion = await obtenerSesionConRol();
  if (!sesion?.user.email) return { error: "Vuelve a entrar para cambiar de negocio." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mis_negocios");
  if (error) return { error: "No pudimos leer tus negocios. Intenta de nuevo." };
  const destino = ((data ?? []) as { id: string; slug: string; dominio: string | null; url_publica: string | null; rol: string }[]).find(
    (n) => n.id === negocioId && ROLES_PERSONAL.has(n.rol)
  );
  if (!destino) return { error: "Tu cuenta no tiene acceso a ese negocio." };
  const { data: link, error: e } = await createSupabaseAdminClient(destino.id).auth.admin.generateLink({ type: "magiclink", email: sesion.user.email });
  if (e || !link.properties?.hashed_token) {
    console.error("[ir-a-negocio] generateLink", e?.message);
    return { error: "No pudimos abrir ese negocio. Intenta de nuevo." };
  }
  const token = encodeURIComponent(link.properties.hashed_token);
  return { error: null, url: `${urlDelNegocio(destino)}/auth/entrar?token_hash=${token}&next=${rutaPorRol(destino.rol)}` };
}
