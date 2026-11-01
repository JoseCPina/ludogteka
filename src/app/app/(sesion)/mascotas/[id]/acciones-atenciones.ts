"use server";

import { sesionApp } from "@/lib/app/sesion";
import { ocultarAtencion } from "@/lib/app/atenciones";

// El dueño oculta (o vuelve a enseñar) una atención que registró un negocio con el QR: deja de contar en su cartilla
// y en sus recordatorios, pero la bitácora no se borra (docs/app-duenos/FASE-2.md).
// registro-final: devuelve cómo quedó (oculto o no); la pantalla lo pinta con eso.
export async function cambiarOculto(atencionId: string, ocultar: boolean): Promise<{ error: string | null; oculto?: boolean }> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión terminó. Vuelve a entrar." };
  if (!/^[0-9a-f-]{36}$/.test(atencionId)) return { error: "No encontramos ese registro." };
  const r = await ocultarAtencion({ atencionId, duenoId: s.dueno.id, ocultar });
  return r.error ? { error: r.error } : { error: null, oculto: ocultar };
}
