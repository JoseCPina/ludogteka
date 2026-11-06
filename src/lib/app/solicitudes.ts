import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ClienteWA, configWhatsApp, graphBase, VERSION_GRAPH } from "@/lib/whatsapp/infra";
import { limpiarVariable } from "@/lib/recordatorios/plantillas";
import { telefonoDeCorreoSintetico } from "@/lib/auth/identidad";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { requisitoParaPersonal, type MotivoBase } from "./requisitos";
import plantilla from "./plantilla-solicitud-reserva.json";

/**
 * «Pedir lugar»: el aviso por WhatsApp a los admins del negocio (solo con la plantilla aprobada; mientras tanto la
 * solicitud se ve igual en «Necesita atención», en Solicitudes y en su agenda) y la caducidad de cada hora.
 */
async function plantillaAprobada(): Promise<boolean> {
  const cfg = configWhatsApp();
  const waba = process.env.PELUDESK_WABA_ID;
  if (!cfg.token || !cfg.phoneNumberId || !waba) return false;
  try {
    const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}/message_templates?fields=name,status&name=${plantilla.nombre}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as { data?: { name: string; status: string }[] };
    return (j.data ?? []).some((x) => x.name === plantilla.nombre && x.status === "APPROVED");
  } catch {
    return false;
  }
}

export function avisarSolicitudAlNegocio(o: { negocioId: string; solicitudId: string }): void {
  after(async () => {
    try {
      if (!(await plantillaAprobada())) return;
      const cfg = configWhatsApp();
      const wa = new ClienteWA(cfg.token!, cfg.phoneNumberId!);
      const db = createSupabaseAdminClient(o.negocioId);
      const { data: s } = await db
        .from("solicitudes_reserva")
        .select("tipo, fecha_entrada, fecha_salida, inicio, motivos, clientes(nombre), perros(nombre), servicios(nombre), negocios(nombre, zona_horaria, slug, dominio, url_publica)")
        .eq("id", o.solicitudId)
        .eq("negocio_id", o.negocioId)
        .maybeSingle();
      if (!s) return;
      const f = s as unknown as {
        tipo: string; fecha_entrada: string | null; fecha_salida: string | null; inicio: string | null; motivos: MotivoBase[];
        clientes: { nombre: string } | null; perros: { nombre: string } | null; servicios: { nombre: string } | null; negocios: { nombre: string; zona_horaria: string | null; slug: string; dominio: string | null; url_publica: string | null } | null;
      };
      const zona = f.negocios?.zona_horaria ?? "America/Mexico_City";
      const cuando = f.tipo === "cita" && f.inicio
        ? new Intl.DateTimeFormat("es-MX", { timeZone: zona, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(f.inicio))
        : `${f.fecha_entrada?.slice(8, 10)}/${f.fecha_entrada?.slice(5, 7)} al ${f.fecha_salida?.slice(8, 10)}/${f.fecha_salida?.slice(5, 7)}`;
      const faltan = f.motivos.map(requisitoParaPersonal).join(", ");
      if (!f.negocios) return;
      const enlace = `${urlDelNegocio(f.negocios)}/solicitudes`;
      const { data: admins } = await db.from("membresias").select("profile_id").eq("negocio_id", o.negocioId).eq("rol", "admin").is("deleted_at", null).limit(3);
      for (const a of (admins ?? []) as { profile_id: string }[]) {
        const { data: u } = await db.auth.admin.getUserById(a.profile_id);
        const tel = telefonoDeCorreoSintetico(u?.user?.email);
        if (!tel) continue;
        await wa.plantillaConParametros(`52${tel}`, plantilla.nombre, [
          limpiarVariable(f.negocios?.nombre ?? "tu negocio"),
          limpiarVariable(f.clientes?.nombre ?? "Un cliente"),
          limpiarVariable(f.perros?.nombre ?? "su mascota"),
          limpiarVariable(`${f.servicios?.nombre ?? "Servicio"}, ${cuando}`),
          limpiarVariable(faltan),
          enlace,
        ], []);
      }
    } catch (e) {
      console.error("[solicitudes] aviso al negocio", e instanceof Error ? e.message : e);
    }
  });
}

/** La tarea de cada hora: caduca las vencidas, negocio por negocio. Los push salen con la tarea de avisos de la app. */
export async function caducarSolicitudes(): Promise<number> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("solicitudes_reserva").select("negocio_id").eq("estado", "pendiente").is("deleted_at", null).lte("expira_at", new Date().toISOString()).limit(1000);
  if (error) {
    console.error("[solicitudes] caducar", error.message);
    return 0;
  }
  let total = 0;
  for (const negocioId of new Set((data ?? []).map((f) => f.negocio_id as string))) {
    const r = await createSupabaseAdminClient(negocioId).rpc("solicitudes_caducar");
    if (r.error) console.error("[solicitudes] caducar", negocioId, r.error.message);
    total += Number(r.data ?? 0);
  }
  return total;
}
