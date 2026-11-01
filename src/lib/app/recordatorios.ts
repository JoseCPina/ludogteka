import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { configWhatsApp, ClienteWA, graphBase, VERSION_GRAPH } from "@/lib/whatsapp/infra";
import recordatorios from "@/lib/recordatorios/plantillas.json";
import { limpiarVariable } from "@/lib/recordatorios/plantillas";
import { urlApp } from "@/lib/negocio/host";
import { enviarPush } from "./push";
import { crearAviso } from "./avisos";
import citaSugerida from "./plantilla-cita-sugerida.json";
import { firmaDeRegistro, waDeNegocio } from "./atenciones";

/**
 * Los recordatorios de la app para dueños (vacuna, desparasitación, medicamento) salen del cron
 * /api/cron/app-recordatorios cada 15 minutos: cada fila pendiente cuya hora ya llegó se manda UNA vez por push, queda
 * en el centro de avisos y, si el dueño tiene WhatsApp y acepta recordatorios y la plantilla está aprobada, también por
 * WhatsApp con la plantilla de vacuna de PeluDesk (botones Agendar / Después, payload app:<id>:<acción>). Un medicamento
 * nunca va por WhatsApp (sería demasiado seguido): solo push y aviso.
 */
const PLANTILLA_VACUNA = recordatorios.plantillas.vacuna.nombre;
const PLANTILLA_CITA = citaSugerida.nombre;
const cachePlantillas = new Map<string, { ok: boolean; en: number }>();

/** ¿Está aprobada (APPROVED + UTILITY) esta plantilla en Meta? Con el doble de Graph de desarrollo, lo dice el doble. */
async function plantillaAprobada(nombre: string = PLANTILLA_VACUNA): Promise<boolean> {
  const cachePlantilla = cachePlantillas.get(nombre) ?? null;
  if (cachePlantilla && Date.now() - cachePlantilla.en < 10 * 60_000) return cachePlantilla.ok;
  const guardar = (ok: boolean) => { cachePlantillas.set(nombre, { ok, en: Date.now() }); return ok; };
  const cfg = configWhatsApp();
  const waba = process.env.PELUDESK_WABA_ID ?? "";
  if (!cfg.token || !waba) return guardar(false);
  try {
    const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}/message_templates?fields=name,status,category&name=${nombre}`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { data?: { name: string; status: string; category: string }[] };
    const p = (j.data ?? []).find((x) => x.name === nombre);
    return guardar(p?.status === "APPROVED" && p.category === "UTILITY");
  } catch {
    return guardar(false);
  }
}

export const payloadApp = (id: string, accion: "agendar" | "despues") => `app:${id}:${accion}`;
export const leerPayloadApp = (p: string | null | undefined) => {
  const m = /^app:([0-9a-f-]{36}):(agendar|despues)$/.exec(p ?? "");
  return m ? { id: m[1], accion: m[2] as "agendar" | "despues" } : null;
};

type Fila = { id: string; dueno_id: string; mascota_id: string; tipo: string; ref_id: string; para_at: string; titulo: string; cuerpo: string };

export async function correrRecordatoriosApp(limite = 100): Promise<{ tomados: number; push: number; whatsapp: number; fallidos: number }> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("app_recordatorios").select("id, dueno_id, mascota_id, tipo, ref_id, para_at, titulo, cuerpo").eq("estado", "pendiente").is("deleted_at", null).lte("para_at", new Date().toISOString()).order("para_at").limit(limite);
  const filas = (data ?? []) as Fila[];
  const resumen = { tomados: filas.length, push: 0, whatsapp: 0, fallidos: 0 };
  if (!filas.length) return resumen;
  const aprobada = await plantillaAprobada(PLANTILLA_VACUNA);
  const aprobadaCita = filas.some((f) => f.tipo === "cita_sugerida") ? await plantillaAprobada(PLANTILLA_CITA) : false;
  const cfg = configWhatsApp();
  const wa = cfg.token && cfg.phoneNumberId ? new ClienteWA(cfg.token, cfg.phoneNumberId) : null;
  for (const f of filas) {
    // Se toma antes de mandar: nunca dos intentos del mismo aviso.
    const { data: tomada } = await db.from("app_recordatorios").update({ estado: "enviado", enviado_at: new Date().toISOString() }).eq("id", f.id).eq("estado", "pendiente").select("id").maybeSingle();
    if (!tomada) continue;
    try {
      const url = `/mascotas/${f.mascota_id}${f.tipo === "medicamento" ? "/seguimiento" : "/cita"}`;
      const { enviadas } = await enviarPush(f.dueno_id, { titulo: f.titulo, cuerpo: f.cuerpo, url, etiqueta: `rec-${f.ref_id}` });
      resumen.push += enviadas;
      await crearAviso({ duenoId: f.dueno_id, tipo: "recordatorio", titulo: f.titulo, cuerpo: f.cuerpo, url, mascotaId: f.mascota_id, push: false });
      let waEstado: string = "no_aplica";
      let waId: string | null = null;
      if (f.tipo === "cita_sugerida") {
        // La próxima cita que sugirió una estética (Fase 2): por WhatsApp solo con su plantilla aprobada.
        if (wa && aprobadaCita) {
          const { data: d } = await db.from("duenos").select("telefono, nombre, recordatorios_whatsapp").eq("id", f.dueno_id).maybeSingle();
          const { data: m } = await db.from("mascotas").select("nombre").eq("id", f.mascota_id).maybeSingle();
          const { data: at } = await db.from("app_atenciones").select("negocio_nombre, datos").eq("id", f.ref_id).maybeSingle();
          const proxima = (at?.datos as { proxima_cita?: string } | null)?.proxima_cita ?? null;
          if (d?.telefono && d.recordatorios_whatsapp !== false && m && at && proxima) {
            const cuando = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${proxima}T00:00:00Z`));
            const parametros = [limpiarVariable(d.nombre?.split(" ")[0] || "hola"), limpiarVariable(at.negocio_nombre as string), limpiarVariable(m.nombre), limpiarVariable(String((at.datos as { servicio?: string }).servicio ?? "estética")), limpiarVariable(cuando)];
            const r = await wa.plantillaConParametros(`52${d.telefono}`, PLANTILLA_CITA, parametros, [payloadApp(f.id, "agendar"), payloadApp(f.id, "despues")], { origen: "carnet_recordatorio", refId: f.id, etiqueta: f.titulo, href: url });
            waEstado = r.ok ? "enviado" : `fallo:${r.error ?? r.codigo ?? ""}`.slice(0, 80);
            waId = r.ok ? (r.id ?? null) : null;
            if (r.ok) resumen.whatsapp += 1;
          } else waEstado = !d?.telefono ? "sin_telefono" : d.recordatorios_whatsapp === false ? "apagado" : "sin_datos";
        } else waEstado = !wa ? "sin_whatsapp" : "plantilla_no_aprobada";
      } else if (f.tipo !== "medicamento" && wa && aprobada) {
        const { data: d } = await db.from("duenos").select("telefono, nombre, recordatorios_whatsapp").eq("id", f.dueno_id).maybeSingle();
        const { data: m } = await db.from("mascotas").select("nombre").eq("id", f.mascota_id).maybeSingle();
        const { data: reg } = await db.from("mascotas_cartilla").select("nombre, tipo, proxima_dosis").eq("id", f.ref_id).maybeSingle();
        if (d?.telefono && d.recordatorios_whatsapp !== false && m && reg) {
          const que = reg.tipo === "vacuna" ? `vacuna ${reg.nombre}` : `desparasitación (${reg.nombre})`;
          const cuando = reg.proxima_dosis ? new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${reg.proxima_dosis}T00:00:00Z`)) : "pronto";
          // Lo registró un negocio con el QR (Fase 2): el carnet es «en <ese negocio>» y «Agendar» lleva a su WhatsApp.
          const firma = await firmaDeRegistro(f.ref_id);
          const parametros = [limpiarVariable(d.nombre?.split(" ")[0] || "hola"), limpiarVariable(m.nombre), firma ? limpiarVariable(firma.nombre) : "tu app PeluDesk", limpiarVariable(que), limpiarVariable(cuando)];
          const r = await wa.plantillaConParametros(`52${d.telefono}`, PLANTILLA_VACUNA, parametros, [payloadApp(f.id, "agendar"), payloadApp(f.id, "despues")], { origen: "carnet_recordatorio", refId: f.id, etiqueta: f.titulo, href: url });
          waEstado = r.ok ? "enviado" : `fallo:${r.error ?? r.codigo ?? ""}`.slice(0, 80);
          waId = r.ok ? (r.id ?? null) : null;
          if (r.ok) resumen.whatsapp += 1;
        } else waEstado = !d?.telefono ? "sin_telefono" : d.recordatorios_whatsapp === false ? "apagado" : "sin_datos";
      } else if (f.tipo !== "medicamento") waEstado = !wa ? "sin_whatsapp" : "plantilla_no_aprobada";
      await db.from("app_recordatorios").update({ push_enviadas: enviadas, wa_estado: waEstado, wa_id: waId }).eq("id", f.id);
    } catch (e) {
      resumen.fallidos += 1;
      await db.from("app_recordatorios").update({ estado: "fallido", error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }).eq("id", f.id);
    }
  }
  return resumen;
}

/** Un botón de la plantilla (Agendar / Después) tocado en WhatsApp: qué se le contesta. */
export async function atenderBotonApp(payload: string | null | undefined): Promise<string | null> {
  const p = leerPayloadApp(payload);
  if (!p) return null;
  const db = createSupabaseAdminClient();
  const { data: r } = await db.from("app_recordatorios").select("mascota_id, tipo, ref_id").eq("id", p.id).maybeSingle();
  if (!r) return "Ese recordatorio ya no está. Abre tu app PeluDesk para ver lo que le toca a tu mascota.";
  if (p.accion === "despues") return "Va. Te lo volvemos a recordar el día que toque.";
  // Firmado por un negocio que registró con el QR: su WhatsApp, con el mensaje listo.
  const firma = r.tipo === "cita_sugerida"
    ? await db.from("app_atenciones").select("negocio_nombre, negocio_whatsapp, oculto_at").eq("id", r.ref_id).maybeSingle().then(({ data }) => (data && !data.oculto_at ? { nombre: data.negocio_nombre as string, whatsapp: data.negocio_whatsapp as string } : null))
    : await firmaDeRegistro(r.ref_id as string);
  if (firma) {
    const { data: m } = await db.from("mascotas").select("nombre").eq("id", r.mascota_id).maybeSingle();
    return `Para agendar, escríbele a ${firma.nombre}: ${waDeNegocio(firma.whatsapp, `Hola, quiero agendar la próxima cita de ${m?.nombre ?? "mi mascota"}.`)}`;
  }
  return `Para pedir la cita, abre ${urlApp()}/mascotas/${r.mascota_id}/cita: ahí está el WhatsApp de tu veterinaria o las que tienes cerca.`;
}
