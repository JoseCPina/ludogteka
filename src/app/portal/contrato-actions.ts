"use server";

import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bloqueoDeEscritura } from "@/lib/solo-lectura-servidor";
import { zonaActual } from "@/lib/negocio/actual";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { firmarContratoCon, ipDeFirma } from "@/lib/contratos/firmar";

const BUCKET = "perros-archivos";

export type EstadoFirmarContrato = { error: string | null; registros?: RegistroFinal[] };

// Todo el ensamblado del PDF pasa por el servidor a propósito, no por el
// navegador: la fecha/hora y la IP del bloque de auditoría deben venir de
// algo que el propio cliente no pueda inventar — si se armara el PDF en
// el navegador, la "evidencia" de la firma sería tan confiable como lo
// que el propio firmante quisiera reportar de sí mismo.
// La firma misma vive en src/lib/contratos/firmar.ts: la comparte la app para dueños (Fase 3).
export async function firmarContratoDigital(
  contratoId: string,
  firmaPngDataUrl: string
): Promise<EstadoFirmarContrato> {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  // En la demo, el mensaje de la demo y no «No pudimos guardar el PDF firmado» (Storage lo rechaza).
  const bloqueo = await bloqueoDeEscritura(supabase);
  if (bloqueo) return { error: bloqueo.mensaje };

  const r = await firmarContratoCon(supabase, {
    contratoId,
    firmaPngDataUrl,
    zona,
    lugar: (await cargarNegocioLanding()).ciudad ?? null,
    ip: ipDeFirma(await headers()),
  });
  if (r.error) return { error: r.error };

  revalidatePath(`/portal/perros/${r.perroId}`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "contratos", i: contratoId }]) };
}

export async function obtenerUrlContrato(storagePath: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}
