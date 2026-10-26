import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ClienteWA, configWhatsApp, graphBase, marcarNumeroContesta, VERSION_GRAPH } from "@/lib/whatsapp/infra";
import { IDIOMA, TIPOS_RECORDATORIO, parametrosDe, payloadsDe, plantillaDe, textoDe, type FilaParaEnviar, type TipoRecordatorio } from "./plantillas";
import { reportarExcedentesPendientes } from "./stripe";
import { actualizarPrecioSiToca } from "./tarifa-meta";

/**
 * La tarea de los recordatorios automáticos (/api/cron/recordatorios, cada 15 minutos).
 *
 * Por cada negocio con algún tipo prendido: programa lo de los próximos días (recordatorios_programar), toma lo que
 * ya toca (recordatorios_tomar: revalida la cita, cancela lo que cambió, aplica los 30 gratis y el tope, solo de 8:00
 * a 21:00 del negocio) y lo manda con su plantilla. Una plantilla que Meta no tenga APROBADA como UTILITY no sale
 * (su recordatorio espera). UN intento por recordatorio: la base lo aparta antes de mandarlo («enviando») y nunca se
 * reintenta solo, así no hay dos iguales. Al final reporta a Stripe los excedentes que falten.
 */
export type ResumenRecordatorios = {
  negocios: number;
  programados: number;
  enviados: number;
  fallidos: number;
  /** Tipos sin plantilla aprobada, sumados por negocio (sus recordatorios esperan). */
  sin_plantilla: number;
  plantillas: Record<string, string>;
  stripe?: { reportados: number; fallidos: number };
  precio?: string;
};

type EstadoPlantilla = { status: string; category?: string };

/** El estado de cada plantilla de recordatorios en Meta (una consulta por corrida). */
export async function estadoPlantillas(): Promise<Record<TipoRecordatorio, EstadoPlantilla | null>> {
  const vacio = Object.fromEntries(TIPOS_RECORDATORIO.map((t) => [t, null])) as Record<TipoRecordatorio, EstadoPlantilla | null>;
  const waba = process.env.PELUDESK_WABA_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN;
  if (!waba || !token) return vacio;
  try {
    const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}/message_templates?fields=name,status,language,category&limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await r.json().catch(() => ({}))) as { data?: { name: string; status: string; language?: string; category?: string }[] };
    for (const t of TIPOS_RECORDATORIO) {
      const p = (j.data ?? []).find((x) => x.name === plantillaDe(t).nombre && (!x.language || x.language === IDIOMA));
      vacio[t] = p ? { status: p.status, category: p.category } : null;
    }
  } catch (e) {
    console.error("[recordatorios] no se pudo leer el estado de las plantillas", e instanceof Error ? e.message : e);
  }
  return vacio;
}

const aprobada = (p: EstadoPlantilla | null) => p?.status === "APPROVED" && p.category === "UTILITY";

export async function correrRecordatorios(opciones: { solo?: string[]; saltarPlantilla?: boolean; sinStripe?: boolean } = {}): Promise<ResumenRecordatorios> {
  const resumen: ResumenRecordatorios = { negocios: 0, programados: 0, enviados: 0, fallidos: 0, sin_plantilla: 0, plantillas: {} };
  const cfg = configWhatsApp();
  if (!cfg.token || !cfg.phoneNumberId) {
    resumen.plantillas.todas = "WhatsApp sin configurar";
    return resumen;
  }
  const global = createSupabaseAdminClient();
  resumen.precio = await actualizarPrecioSiToca().catch((e) => `error: ${e instanceof Error ? e.message : e}`);

  const { data: lista, error } = await global.rpc("recordatorios_negocios_activos");
  if (error) throw new Error(`recordatorios_negocios_activos: ${error.message}`);
  let negocios = ((lista ?? []) as { negocio_id: string }[]).map((n) => n.negocio_id);
  if (opciones.solo?.length) negocios = negocios.filter((n) => opciones.solo!.includes(n));

  const estados = opciones.saltarPlantilla
    ? (Object.fromEntries(TIPOS_RECORDATORIO.map((t) => [t, { status: "APPROVED", category: "UTILITY" }])) as Record<TipoRecordatorio, EstadoPlantilla>)
    : await estadoPlantillas();
  for (const t of TIPOS_RECORDATORIO) resumen.plantillas[t] = estados[t] ? `${estados[t]!.status}/${estados[t]!.category}` : "no existe";

  const wa = new ClienteWA(cfg.token, cfg.phoneNumberId, marcarNumeroContesta);
  for (const negocioId of negocios) {
    const sb = createSupabaseAdminClient(negocioId);
    const { data: prog, error: eProg } = await sb.rpc("recordatorios_programar");
    if (eProg) {
      console.error("[recordatorios] programar", negocioId, eProg.message);
      continue;
    }
    resumen.negocios++;
    resumen.programados += Number(prog ?? 0);
    // Solo los tipos cuya plantilla Meta ya aprobó como UTILITY: los demás esperan (vencen solos si no llega a tiempo).
    const tipos = TIPOS_RECORDATORIO.filter((t) => aprobada(estados[t]));
    if (tipos.length < TIPOS_RECORDATORIO.length) resumen.sin_plantilla += TIPOS_RECORDATORIO.length - tipos.length;
    if (tipos.length === 0) continue;
    const { data: filas, error: eFilas } = await sb.rpc("recordatorios_tomar", { p_limite: 50, p_tipos: tipos });
    if (eFilas) {
      console.error("[recordatorios] tomar", negocioId, eFilas.message);
      continue;
    }
    for (const f of (filas ?? []) as FilaParaEnviar[]) {
      const plantilla = plantillaDe(f.tipo);
      const digitos = (f.telefono ?? "").replace(/\D/g, "").slice(-10);
      const parametros = parametrosDe(f);
      const texto = textoDe(f.tipo, parametros);
      const r = await wa.plantillaConParametros(`52${digitos}`, plantilla.nombre, parametros, payloadsDe(f.tipo, f.id), {
        origen: "recordatorio",
        negocioId,
        refId: f.id,
        etiqueta: `Recordatorio de ${parametros[1] ?? "una mascota"}`,
        href: "/recordatorios",
      });
      await sb.rpc("recordatorio_resultado", {
        p_id: f.id,
        p_ok: r.ok,
        p_wa_id: r.id ?? null,
        p_error: r.ok ? null : `${r.estado ?? "red"}${r.codigo ? `/${r.codigo}` : ""}: ${r.error ?? "sin detalle"}`,
        p_plantilla: plantilla.nombre,
        p_texto: texto,
        p_telefono: `52${digitos}`,
      });
      if (r.ok) resumen.enviados++;
      else {
        resumen.fallidos++;
        console.error("[recordatorios] envío rechazado", { estado: r.estado, codigo: r.codigo });
      }
    }
  }
  if (!opciones.sinStripe) resumen.stripe = await reportarExcedentesPendientes().catch((e) => {
    console.error("[recordatorios] stripe", e instanceof Error ? e.message : e);
    return { reportados: 0, fallidos: -1 };
  });
  return resumen;
}
