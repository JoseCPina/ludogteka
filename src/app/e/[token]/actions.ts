"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { hashDeToken, tokenPlausible } from "@/lib/reporte/enlaces";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

// La liga del estimado (/e/<token>): sin sesión. El servidor resuelve el token (solo existe su sha256),
// con la llave de servidor acotada al negocio del dominio. La base vuelve a comprobar que el estimado
// siga enviado, vigente e íntegro antes de pasar sus líneas a la cuenta de la mascota.

type Resultado = { error: string | null; exito?: string; registros?: RegistroFinal[] };

// El estimado de la liga como quedó. Es clínico: no se devuelve la fila, solo su id (acotado al negocio) y su estado
// (la lectura va con la sesión del navegador, que sin cuenta no ve nada: solo cuenta `datos`).
async function estimadoComoQuedo(admin: ReturnType<typeof createSupabaseAdminClient>, negocioId: string, token: string, estado: string) {
  const { data } = await admin
    .from("vet_estimados")
    .select("id")
    .eq("negocio_id", negocioId)
    .eq("token_hash", hashDeToken(token))
    .maybeSingle();
  return registrosDe(await createSupabaseServerClient(), [{ t: "vet_estimados", i: data?.id as string | undefined, datos: { estado } }]);
}

export async function aceptarEstimadoPublico(token: string, nombre: string, firma: string | null): Promise<Resultado> {
  if (!tokenPlausible(token)) return { error: "Esta liga ya no es válida." };
  if (nombre.trim().length < 3) return { error: "Escribe tu nombre completo para aceptar." };
  if (!firma) return { error: "Dibuja tu firma en el recuadro para aceptar." };
  const negocio = await negocioActual();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "no determinada";
  const ua = h.get("user-agent") ?? "";
  const admin = createSupabaseAdminClient(negocio.id);
  const { error } = await admin.rpc("estimado_aceptar_publico", { p_token_hash: hashDeToken(token), p_nombre: nombre.trim(), p_firma: firma, p_ip: ip, p_ua: ua });
  if (error) return { error: error.code === "P0001" ? error.message : "No pudimos registrar tu aceptación. Intenta de nuevo o avísale a la clínica." };
  revalidatePath(`/e/${token}`);
  return { error: null, exito: "Listo, aceptaste el estimado.", registros: await estimadoComoQuedo(admin, negocio.id, token, "aceptado") };
}

export async function rechazarEstimadoPublico(token: string, motivo: string): Promise<Resultado> {
  if (!tokenPlausible(token)) return { error: "Esta liga ya no es válida." };
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const { error } = await admin.rpc("estimado_rechazar_publico", { p_token_hash: hashDeToken(token), p_motivo: motivo.trim() });
  if (error) return { error: error.code === "P0001" ? error.message : "No pudimos registrar tu respuesta. Intenta de nuevo." };
  revalidatePath(`/e/${token}`);
  return {
    error: null,
    exito: "Listo, avisamos a la clínica que no lo aceptas.",
    registros: await estimadoComoQuedo(admin, negocio.id, token, "rechazado"),
  };
}
