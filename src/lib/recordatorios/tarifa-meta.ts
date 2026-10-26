import ExcelJS from "exceljs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DatosSupabase, graphBase, VERSION_GRAPH } from "@/lib/whatsapp/infra";

/**
 * Lo que nos cobra Meta por cada mensaje de utilidad entregado en México, leído de su hoja de tarifas vigente
 * (developers.facebook.com/docs/whatsapp/pricing, la hoja en la moneda en que factura la WABA de PeluDesk: MXN) y
 * guardado en `wa_precios` con su fecha de vigencia. Si la WABA facturara en dólares, el costo se convierte a pesos con
 * el tipo de cambio del día de corte. Precio al negocio = el doble, redondeado a centavos (lo calcula la base).
 *
 * Meta no tiene una API de tarifas: la hoja es un .xlsx enlazado desde la página de precios. La tarea de recordatorios
 * la revisa una vez al día (`wa_config` «wa_tarifa_revisada»); la plataforma la puede revisar a mano.
 */
const PAGINA = "https://developers.facebook.com/docs/whatsapp/pricing";
const CLAVE_REVISADA = "wa_tarifa_revisada";

export type TarifaLeida = { vigente: string; moneda: "MXN" | "USD"; costo: number };

/** La moneda en que factura la WABA de PeluDesk (MXN). */
export async function monedaDeLaWaba(): Promise<"MXN" | "USD"> {
  const waba = process.env.PELUDESK_WABA_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN;
  if (!waba || !token) return "MXN";
  const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}?fields=currency`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  const j = (await r.json().catch(() => ({}))) as { currency?: string };
  return j.currency === "USD" ? "USD" : "MXN";
}

/** Lee la hoja de tarifas de Meta en esa moneda: México, utilidad. */
export async function leerTarifaMeta(moneda: "MXN" | "USD"): Promise<TarifaLeida> {
  const html = await (await fetch(PAGINA, { headers: { "User-Agent": "Mozilla/5.0 PeluDesk" }, signal: AbortSignal.timeout(30_000) })).text();
  // El enlace de «Tarifas en MXN» (o «MXN list rates»): el último href antes de la etiqueta.
  const etiquetas = moneda === "MXN" ? [">Tarifas en MXN<", ">MXN list rates<", ">MXN rates<"] : [">Tarifas en USD<", ">USD list rates<", ">USD rates<"];
  let url: string | null = null;
  for (const etiqueta of etiquetas) {
    const i = html.indexOf(etiqueta);
    if (i < 0) continue;
    const hrefs = [...html.slice(Math.max(0, i - 4000), i).matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const ultimo = hrefs.at(-1);
    if (!ultimo) continue;
    try {
      const u = new URL(ultimo, PAGINA);
      url = u.hostname === "l.facebook.com" ? u.searchParams.get("u") : u.toString();
    } catch {
      url = null;
    }
    if (url) break;
  }
  if (!url || !/^https:\/\/[a-z0-9.-]+\.(fbcdn\.net|facebook\.com)\//.test(url)) throw new Error("No encontré la hoja de tarifas en la página de Meta.");
  const bytes = await (await fetch(url, { signal: AbortSignal.timeout(30_000) })).arrayBuffer();
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes);
  const hoja = libro.worksheets[0];
  let vigente: string | null = null;
  let colUtility = -1;
  let costo: number | null = null;
  hoja.eachRow((fila) => {
    const valores = (fila.values as unknown[]).map((v) => (typeof v === "object" && v && "text" in v ? String((v as { text: unknown }).text) : v));
    const texto = valores.filter((v) => typeof v === "string").join(" ");
    const efectiva = /effective\s+([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(texto);
    if (efectiva && !vigente) {
      const d = new Date(`${efectiva[1]} 12:00 UTC`);
      if (!Number.isNaN(d.getTime())) vigente = d.toISOString().slice(0, 10);
    }
    const iU = valores.findIndex((v) => typeof v === "string" && v.trim() === "Utility");
    if (iU > 0 && valores.some((v) => v === "Market")) colUtility = iU;
    if (colUtility > 0 && valores.some((v) => v === "Mexico")) {
      const n = Number(valores[colUtility]);
      if (Number.isFinite(n) && n > 0) costo = n;
    }
  });
  if (!vigente || costo === null) throw new Error("La hoja de Meta no trae la tarifa de utilidad de México o su fecha.");
  return { vigente, moneda, costo };
}

/** Pesos por dólar del día (si la WABA factura en dólares). Fuente: el BCE vía frankfurter.dev. */
async function tipoDeCambio(fecha: string): Promise<number> {
  const r = await fetch(`https://api.frankfurter.dev/v1/${fecha}?base=USD&symbols=MXN`, { signal: AbortSignal.timeout(15_000) });
  const j = (await r.json().catch(() => ({}))) as { rates?: { MXN?: number } };
  if (!j.rates?.MXN) throw new Error("No se pudo leer el tipo de cambio.");
  return j.rates.MXN;
}

/** Lee la hoja y registra el precio si cambió. Devuelve qué hizo. */
export async function registrarTarifaMeta(): Promise<string> {
  const moneda = await monedaDeLaWaba();
  const t = await leerTarifaMeta(moneda);
  const tc = moneda === "MXN" ? 1 : await tipoDeCambio(t.vigente);
  const { data, error } = await createSupabaseAdminClient().rpc("wa_precio_registrar", {
    p_vigente: t.vigente,
    p_moneda: moneda,
    p_costo: t.costo,
    p_tipo_cambio: tc,
    p_fuente: `Hoja de tarifas de Meta en ${moneda} (México, utilidad), vigente desde el ${t.vigente}${moneda === "USD" ? `, tipo de cambio ${tc}` : ""}`,
  });
  if (error) throw new Error(error.message);
  return data ? `nuevo: ${t.costo} ${moneda} desde ${t.vigente}` : `sin cambio: ${t.costo} ${moneda} desde ${t.vigente}`;
}

/** Una vez al día, desde la tarea de recordatorios. */
export async function actualizarPrecioSiToca(): Promise<string> {
  const datos = new DatosSupabase();
  const ultima = await datos.config(CLAVE_REVISADA).catch(() => null);
  if (ultima && Date.now() - Date.parse(ultima) < 20 * 3_600_000) return "revisada en las últimas 20 h";
  await datos.guardarConfig(CLAVE_REVISADA, new Date().toISOString()).catch(() => {});
  try {
    return await registrarTarifaMeta();
  } catch (e) {
    console.error("[recordatorios] tarifa de Meta", e instanceof Error ? e.message : e);
    return `no se pudo leer: ${e instanceof Error ? e.message : e}`;
  }
}
