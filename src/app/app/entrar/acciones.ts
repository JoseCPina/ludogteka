"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { entrarConContrasena } from "@/lib/app/entrada";
import { pedirCodigoEntrada, verificarCodigoEntrada, type EnvioCodigo } from "@/lib/app/entrada-codigo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Entrar a la app para dueños (src/lib/app/entrada.ts). Ninguna de estas acciones escribe una tabla que la pantalla
// pinte: devuelven el estado de la entrada o navegan.

async function origen(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

// registro-final: no cambia nada que la pantalla pinte; manda el código.
export async function pedirCodigo(telefono: string, canal?: "whatsapp" | "sms"): Promise<{ error: string | null; envio?: EnvioCodigo }> {
  const { ip } = await origen();
  return pedirCodigoEntrada({ telefono, canal, ip });
}

// El código correcto abre la sesión y navega a donde iba. // registro-final: abre sesión y navega
export async function verificarCodigo(telefono: string, codigo: string, ir: string | null): Promise<{ error: string | null; pedirOtro?: boolean }> {
  const r = await verificarCodigoEntrada({ telefono, codigo, destino: "cookie" });
  if (r.error) return { error: r.error, pedirOtro: r.pedirOtro };
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
