"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canjearEntrada, entrarConContrasena, estadoEntrada, pedirEntrada, type EstadoEntrada } from "@/lib/app/entrada";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Entrar a la app para dueños (src/lib/app/entrada.ts). Ninguna de estas acciones escribe una tabla que la pantalla
// pinte: devuelven el estado de la entrada o navegan.

async function origen(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

export async function pedirCodigo(telefono: string): Promise<{ error: string | null; entrada?: EstadoEntrada }> {
  return pedirEntrada({ telefono, ...(await origen()) });
}

export async function consultarEntrada(id: string): Promise<{ error: string | null; entrada?: EstadoEntrada | null }> {
  return { error: null, entrada: await estadoEntrada(id) };
}

// Verificada por WhatsApp: abre la sesión y navega a donde iba. // registro-final: abre sesión y navega
export async function canjear(id: string, ir: string | null): Promise<{ error: string | null }> {
  const r = await canjearEntrada(id);
  if (r.error) return { error: r.error };
  redirect(destinoSeguro(ir));
}

// registro-final: abre sesión y navega
export async function conContrasena(telefono: string, password: string, ir: string | null): Promise<{ error: string | null }> {
  const r = await entrarConContrasena({ telefono, password });
  if (r.error) return { error: r.error };
  redirect(destinoSeguro(ir));
}

// registro-final: cierra la sesión y navega
export async function salir(): Promise<void> {
  const supabase = await createSupabaseServerClient("portal");
  await supabase.auth.signOut({ scope: "local" });
  redirect("/entrar");
}

function destinoSeguro(ir: string | null): string {
  return ir && /^\/(?!\/)[A-Za-z0-9/_?=&%.-]*$/.test(ir) && !ir.startsWith("/entrar") ? ir : "/";
}
