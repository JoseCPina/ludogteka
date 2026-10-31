import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { entregarPorWhatsApp } from "@/lib/herramientas/entregar";
import { mesEnTexto, pesosMercado } from "@/lib/mercado/catalogo";
import { fraseDeRango, leerConsulta, rangoDe } from "@/lib/mercado/rangos";
import { SITIO } from "@/lib/peludesk/seo";

/**
 * La tarea mensual del Índice PeluDesk de precios (vercel.json → crons, día 1 a las 14:00 UTC = 8:00 de la Ciudad de
 * México): 1) mete al índice las tarifas de los negocios que lo autorizaron (precios_mercado_de_negocios, solo
 * agregados); 2) manda por el bot el rango actualizado a quienes lo pidieron en la herramienta (herramientas_capturas
 * con reporte_mensual), uno por persona y mes, nunca a quien pidió BAJA. La recolección pesada (sitios web, reseñas,
 * plataformas) corre desde la computadora con scripts/mercado. Vercel manda `Authorization: Bearer <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

type Captura = { id: string; telefono_norm: string; prospecto_id: string | null; datos: Record<string, unknown>; updated_at: string };

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const db = createSupabaseAdminClient();
  const salida: Record<string, unknown> = {};
  const inicio = Date.now();

  // 1. Tarifas autorizadas de negocios de PeluDesk.
  try {
    const { data, error } = await db.rpc("precios_mercado_de_negocios");
    if (error) throw new Error(error.message);
    salida.negocios = Number(data ?? 0);
    await db.from("precios_mercado_corridas").insert({ fuente: "negocio_peludesk", origen: "cron", estado: "terminada", fin_at: new Date().toISOString(), insertados: Number(data ?? 0) });
  } catch (e) {
    console.error("[cron] mercado negocios", e instanceof Error ? e.message : e);
    salida.errorNegocios = e instanceof Error ? e.message : String(e);
  }

  // 2. El reporte mensual a quienes lo pidieron (?forzar=1 fuera de producción manda aunque ya haya salido este mes).
  const mes = new Date().toISOString().slice(0, 7);
  const forzar = process.env.VERCEL_ENV !== "production" && request.nextUrl.searchParams.get("forzar") === "1";
  const { data: corrida } = await db.from("precios_mercado_corridas").insert({ fuente: "reporte_mensual", origen: "cron" }).select("id").single();
  let enviados = 0;
  let saltados = 0;
  let fallidos = 0;
  const errores: string[] = [];
  try {
    const { data: capturas, error } = await db.from("herramientas_capturas").select("id, telefono_norm, prospecto_id, datos, updated_at").eq("herramienta", "precios-mercado").is("deleted_at", null).contains("datos", { reporte_mensual: true }).order("updated_at").order("id").limit(300);
    if (error) throw new Error(error.message);
    const { data: exclusiones } = await db.from("seguimiento_pruebas_exclusiones").select("telefono").is("deleted_at", null).limit(1000);
    const excluidos = new Set((exclusiones ?? []).map((x) => x.telefono as string));
    for (const c of (capturas ?? []) as Captura[]) {
      if (Date.now() - inicio > 240_000) break;
      if (!forzar && c.datos.ultimo_reporte === mes) { saltados++; continue; }
      if (excluidos.has(c.telefono_norm)) { saltados++; continue; }
      if (c.prospecto_id) {
        const { data: p } = await db.from("prospectos").select("publicidad_baja_at").eq("id", c.prospecto_id).maybeSingle();
        if (p?.publicidad_baja_at) { saltados++; continue; }
      }
      const consulta = await leerConsulta({ giro: String(c.datos.giro ?? ""), servicio: String(c.datos.servicio ?? ""), ciudad: (c.datos.ciudad as string | null) ?? null, talla: (c.datos.talla as string | null) ?? null });
      if (!consulta) { saltados++; continue; }
      const rango = await rangoDe(consulta);
      if (rango.nivel === "sin_datos") { saltados++; continue; }
      const q = new URLSearchParams({ giro: consulta.giro, servicio: consulta.servicio, ...(consulta.ciudad ? { ciudad: consulta.ciudad.slug } : {}), ...(consulta.talla ? { talla: consulta.talla } : {}) });
      const r = await entregarPorWhatsApp({
        telefono: c.telefono_norm,
        nombre: (c.datos.nombre as string | null) ?? null,
        resumen: `Reporte de ${mesEnTexto(`${mes}-01`)}. ${fraseDeRango(consulta, rango, pesosMercado, mesEnTexto(rango.fecha))}`,
        url: `${SITIO}/precios-mercado?${q}`,
        herramienta: "precios-mercado",
        prospectoId: c.prospecto_id,
      });
      if (r.enviado) {
        enviados++;
        await db.from("herramientas_capturas").update({ datos: { ...c.datos, ultimo_reporte: mes } }).eq("id", c.id);
      } else {
        fallidos++;
        if (errores.length < 20) errores.push(r.motivo ?? "sin detalle");
        // Plantilla sin aprobar o WhatsApp sin configurar: no tiene caso seguir con los demás este mes.
        if (/plantilla|configurar/.test(r.motivo ?? "")) break;
      }
    }
  } catch (e) {
    console.error("[cron] mercado reporte", e instanceof Error ? e.message : e);
    salida.errorReporte = e instanceof Error ? e.message : String(e);
  }
  if (corrida?.id) {
    await db.from("precios_mercado_corridas").update({ estado: salida.errorReporte ? "fallida" : "terminada", fin_at: new Date().toISOString(), revisados: enviados + saltados + fallidos, insertados: enviados, errores: fallidos, detalle: { saltados, errores }, error: (salida.errorReporte as string | undefined) ?? null }).eq("id", corrida.id);
  }
  salida.reporte = { enviados, saltados, fallidos, errores };
  const ok = !salida.errorNegocios && !salida.errorReporte;
  return NextResponse.json({ ok, ...salida }, { status: ok ? 200 : 500 });
}
