"use server";

import { headers } from "next/headers";
import { negocioPorSlug } from "@/lib/directorio/consulta";
import { estadoReclamo, iniciarReclamo, type EstadoReclamo } from "@/lib/directorio/reclamo";
import { origenDeParametros } from "@/lib/herramientas/telemetria";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** «¿Es tu negocio? Reclámalo»: pedir el código y preguntar si ya llegó por WhatsApp. Sin sesión. */
export async function pedirCodigoReclamo(e: { slug: string; telefono: string; origen?: Record<string, string>; sitio_web?: string }): Promise<{ error: string | null; reclamo?: EstadoReclamo }> {
  if (typeof e.sitio_web === "string" && e.sitio_web) return { error: null };
  const n = await negocioPorSlug(String(e.slug ?? ""));
  if (!n) return { error: "No encontramos ese negocio." };
  const { data: p } = await createSupabaseAdminClient().from("prospectos").select("telefono_norm").eq("id", n.id).maybeSingle();
  const h = await headers();
  return iniciarReclamo({
    prospectoId: n.id,
    telefonoNegocio: (p?.telefono_norm as string | null) ?? null,
    telefono: String(e.telefono ?? ""),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    origen: origenDeParametros(e.origen ?? {}),
    giro: n.servicios[0] ?? n.giro,
    ciudad: n.ciudad,
  });
}

export async function consultarReclamo(id: string): Promise<{ error: string | null; reclamo?: EstadoReclamo | null }> {
  return { error: null, reclamo: await estadoReclamo(String(id ?? "")) };
}
