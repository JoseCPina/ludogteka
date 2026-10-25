import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * El demo al día (vercel.json → crons, cada 15 minutos; QA S31). Nadie opera el demo (es de solo lectura), así que
 * `estancias_poner_al_dia` vive su día por él: check-in y check-out a su hora (o «No llegó»), la agenda de Estética
 * y Veterinaria de los próximos días, cada cita atendida a su hora (la consulta clínica redactada y firmada por su
 * médica), cada cuenta terminada cobrada en el turno de su día, y el turno de caja abierto de la apertura al cierre de su horario (cerrado con
 * diferencia $0). El demo nunca enseña «Llegadas atrasadas» ni una ocupación desfasada, y en horario Caja tiene su
 * turno abierto con los cobros del día. Vercel manda `Authorization: Bearer <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    const admin = createSupabaseAdminClient();
    const { data: demos, error } = await admin.from("negocios").select("id, slug").eq("plan", "demo").order("slug");
    if (error) throw error;
    const resultado: Record<string, unknown> = {};
    for (const n of demos ?? []) {
      const { data, error: e } = await createSupabaseAdminClient(n.id).rpc("estancias_poner_al_dia", { p_negocio: n.id, p_modo: "atender" });
      if (e) throw e;
      resultado[n.slug] = data;
      // Lo que no se pudo atender (una regla de la base lo rechazó) queda en los logs de Vercel con su motivo.
      const errores = (data as { citas?: { errores?: string[] } } | null)?.citas?.errores ?? [];
      if (errores.length) console.error(`[cron] demo ${n.slug}: ${errores.length} cita(s) sin atender`, errores);
    }
    return NextResponse.json({ ok: true, demos: resultado });
  } catch (e) {
    console.error("[cron] demo al día", e);
    return NextResponse.json({ ok: false, error: "No se pudo poner al día el demo." }, { status: 500 });
  }
}
