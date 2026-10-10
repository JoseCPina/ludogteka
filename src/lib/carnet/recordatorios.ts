import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ClienteWA, configWhatsApp, graphBase, marcarNumeroContesta, VERSION_GRAPH } from "@/lib/whatsapp/infra";
import plantilla from "./plantilla-recordatorio.json";

// La tarea que manda los recordatorios de próxima dosis (/api/cron/carnet, cada hora).
//
// · Solo negocios con Veterinaria prendida Y «envío automático» prendido en sus ajustes.
// · Solo con la plantilla APROBADA por Meta (se consulta en cada corrida): sin aprobar, no sale nada.
// · UN intento automático por dosis (la base aparta el recordatorio antes de mandarlo): si algo
//   queda a medias, la persona lo ve en «Por mandar» y decide; nunca se manda dos veces solo.
// · Solo de 9:00 a 20:00 en la hora del negocio, y solo a quien tiene teléfono; el mensaje dice a
//   quién llamar (este número no recibe respuestas) y se omite si el negocio no tiene teléfono público.

export const NOMBRE_PLANTILLA = plantilla.nombre;
export const HORA_INICIO = 9;
export const HORA_FIN = 20;

export type ResumenRecordatorios = {
  negocios: number;
  enviados: number;
  fallidos: number;
  sin_telefono_negocio: number;
  fuera_de_horario: number;
  plantilla: string;
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function horaLocal(ahora: Date, zona: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", hourCycle: "h23" }).format(ahora));
}
function fechaLocal(ahora: Date, zona: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}
const aDias = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10))) / 86_400_000;

/** «hoy», «mañana», «el 15 de octubre», «desde el 3 de octubre». */
export function cuandoEnTexto(proxima: string, hoy: string): string {
  const d = aDias(proxima) - aDias(hoy);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  const [, m, dia] = proxima.split("-").map(Number);
  return d < 0 ? `desde el ${dia} de ${MESES[m - 1]}` : `el ${dia} de ${MESES[m - 1]}`;
}

const limpiar = (t: string) => t.replace(/[\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 60);

/** ¿Meta aprobó la plantilla? Se pregunta en cada corrida. */
export async function plantillaAprobada(): Promise<boolean> {
  const waba = process.env.PELUDESK_WABA_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN;
  if (!waba || !token) return false;
  try {
    const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}/message_templates?name=${plantilla.nombre}&fields=name,status,language&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await r.json().catch(() => ({}))) as { data?: { name: string; status: string; language?: string }[] };
    return (j.data ?? []).some((p) => p.name === plantilla.nombre && p.status === "APPROVED" && (!p.language || p.language === plantilla.idioma));
  } catch {
    return false;
  }
}

export async function correrRecordatorios(opciones: { ahora?: Date; solo?: string[]; saltarPlantilla?: boolean } = {}): Promise<ResumenRecordatorios> {
  const ahora = opciones.ahora ?? new Date();
  const resumen: ResumenRecordatorios = { negocios: 0, enviados: 0, fallidos: 0, sin_telefono_negocio: 0, fuera_de_horario: 0, plantilla: "no consultada" };
  const cfg = configWhatsApp();
  if (!cfg.token || !cfg.phoneNumberId) {
    resumen.plantilla = "WhatsApp sin configurar";
    return resumen;
  }
  const global = createSupabaseAdminClient();
  const { data: lista, error } = await global.rpc("carnet_negocios_con_recordatorios");
  if (error) throw new Error(`carnet_negocios_con_recordatorios: ${error.message}`);
  let negocios = ((lista ?? []) as { negocio_id: string }[]).map((n) => n.negocio_id);
  if (opciones.solo?.length) negocios = negocios.filter((n) => opciones.solo!.includes(n));
  if (negocios.length === 0) {
    resumen.plantilla = "sin negocios con envío automático";
    return resumen;
  }
  const aprobada = opciones.saltarPlantilla ? true : await plantillaAprobada();
  resumen.plantilla = aprobada ? "aprobada" : "sin aprobar";
  if (!aprobada) return resumen;

  const wa = new ClienteWA(cfg.token, cfg.phoneNumberId, marcarNumeroContesta);
  for (const negocioId of negocios) {
    const sb = createSupabaseAdminClient(negocioId);
    const { data: n } = await sb.from("negocios").select("zona_horaria").eq("id", negocioId).maybeSingle();
    const zona = (n?.zona_horaria as string | undefined) ?? "America/Mexico_City";
    const h = horaLocal(ahora, zona);
    if (h < HORA_INICIO || h >= HORA_FIN) {
      resumen.fuera_de_horario++;
      continue;
    }
    const { data: tel } = await sb.rpc("telefono_recepcion_publico");
    const telNegocio = typeof tel === "string" ? tel.replace(/\D/g, "") : "";
    if (telNegocio.length < 10) {
      resumen.sin_telefono_negocio++;
      continue;
    }
    resumen.negocios++;
    const { data: filas, error: eFilas } = await sb.rpc("carnet_recordatorios_para_enviar", { p_limite: 50 });
    if (eFilas) {
      console.error("[carnet] para_enviar", eFilas.message);
      continue;
    }
    const hoy = fechaLocal(ahora, zona);
    for (const f of (filas ?? []) as { id: string; perro_nombre: string; cliente_nombre: string; cliente_telefono: string | null; negocio_nombre: string; origen_tipo: string; detalle: string; proxima_dosis: string }[]) {
      const digitos = (f.cliente_telefono ?? "").replace(/\D/g, "");
      if (digitos.length !== 10) {
        await sb.rpc("carnet_recordatorio_resultado", { p_id: f.id, p_ok: false, p_error: "El dueño no tiene un teléfono de 10 dígitos", p_wa_id: null });
        resumen.fallidos++;
        continue;
      }
      const que = f.origen_tipo === "vacuna" ? `la vacuna ${limpiar(f.detalle)}` : `la desparasitación (${limpiar(f.detalle)})`;
      const parametros = [limpiar(f.cliente_nombre.split(" ")[0] ?? "") || "cliente", limpiar(f.perro_nombre), limpiar(f.negocio_nombre), que, cuandoEnTexto(f.proxima_dosis, hoy), `${telNegocio.slice(-10, -7)} ${telNegocio.slice(-7, -4)} ${telNegocio.slice(-4)}`];
      const r = await wa.plantillaConParametros(`52${digitos}`, plantilla.nombre, parametros, []);
      await sb.rpc("carnet_recordatorio_resultado", {
        p_id: f.id,
        p_ok: r.ok,
        p_error: r.ok ? null : `${r.estado ?? "red"}${r.codigo ? `/${r.codigo}` : ""}: ${r.error ?? "sin detalle"}`,
        p_wa_id: r.id ?? null,
      });
      if (r.ok) resumen.enviados++;
      else {
        resumen.fallidos++;
        console.error("[carnet] envío fallido", { estado: r.estado, codigo: r.codigo });
      }
    }
  }
  return resumen;
}
