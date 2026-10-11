import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Borra los audios de dictado que ya cumplieron sus 30 días (solo existen en los negocios que eligieron
 * conservarlos). Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin CRON_SECRET no corre.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "dictados-audio";

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
    const { data, error } = await admin.rpc("vet_dictado_audios_vencidos");
    if (error) throw error;
    const filas = (data ?? []) as { id: string; negocio_id: string; audio_path: string }[];
    if (filas.length === 0) return NextResponse.json({ ok: true, borrados: 0 });
    const { error: errBorrar } = await admin.storage.from(BUCKET).remove(filas.map((f) => f.audio_path));
    if (errBorrar) throw errBorrar;
    const { data: marcados, error: errMarcar } = await admin.rpc("vet_dictado_audios_marcar", { p_ids: filas.map((f) => f.id) });
    if (errMarcar) throw errMarcar;
    return NextResponse.json({ ok: true, borrados: Number(marcados ?? 0) });
  } catch (e) {
    console.error("[cron] audios de dictado vencidos", e);
    return NextResponse.json({ ok: false, error: "No se pudo completar el borrado." }, { status: 500 });
  }
}
