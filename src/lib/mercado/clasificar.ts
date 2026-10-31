import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { costoIaMxn, HERRAMIENTA_PRECIOS, limpiarClasificacion, SISTEMA_CLASIFICAR_PRECIOS, usuarioClasificar, type Candidato } from "./extraer";
import { precioCreible, servicioMercado, type GiroMercado, type Talla } from "./catalogo";
import { crearIAConUso } from "./ia";

/**
 * La clasificación de candidatos en la nube (/api/cron/mercado-clasificar): toma pendientes de
 * precios_mercado_candidatos, le pide a claude-haiku-5-5 de qué servicio es cada cantidad, inserta los válidos en
 * precios_mercado (sin repetir: huella por fuente, origen, servicio, talla, precio y mes) y marca cada candidato.
 * Tope de IA: 300 MXN en 31 días por fuente, igual que los scripts.
 */
export const TOPE_IA_MXN = 300;

export const huellaDe = (partes: (string | number | null | undefined)[]) => createHash("sha256").update(partes.map((p) => p ?? "").join("|")).digest("hex").slice(0, 40);

type Pendiente = { id: string; giro: GiroMercado; precio: number; contexto: string; fuente: string; url: string | null; prospecto_id: string | null; ciudad: string | null; estado: string | null; origen: string | null };

export async function gastoIaDelMes(db: SupabaseClient, fuente: string): Promise<number> {
  const { data } = await db.from("precios_mercado_corridas").select("costo_ia_mxn").in("fuente", [fuente, "clasificacion"]).gte("inicio_at", new Date(Date.now() - 31 * 86_400_000).toISOString()).is("deleted_at", null).limit(500);
  return (data ?? []).reduce((n, c) => n + Number(c.costo_ia_mxn || 0), 0);
}

export async function clasificarPendientes(db: SupabaseClient, o: { apiKey: string; workspace?: string | null; url?: string; tope?: number; presupuestoMs?: number }) {
  const inicio = Date.now();
  const ia = crearIAConUso({ apiKey: o.apiKey, workspace: o.workspace, url: o.url });
  const resumen = { revisados: 0, clasificados: 0, insertados: 0, descartados: 0, costo: 0, errores: [] as string[], agotado: false };
  const { data: corrida } = await db.from("precios_mercado_corridas").insert({ fuente: "clasificacion", origen: "cron" }).select("id").single();
  const gastoPrevio = await gastoIaDelMes(db, "sitio_web");
  const mes = new Date().toISOString().slice(0, 7);
  try {
    // También los que quedaron en «error» en una corrida anterior (un fallo al insertar no es culpa del candidato).
    const { data, error } = await db.from("precios_mercado_candidatos").select("id, giro, precio, contexto, fuente, url, prospecto_id, ciudad, estado, origen").in("situacion", ["pendiente", "error"]).is("deleted_at", null).order("created_at").order("id").limit(o.tope ?? 600);
    if (error) throw new Error(error.message);
    const pendientes = (data ?? []) as Pendiente[];
    for (let i = 0; i < pendientes.length; i += 30) {
      if (Date.now() - inicio > (o.presupuestoMs ?? 240_000)) break;
      if (gastoPrevio + resumen.costo >= TOPE_IA_MXN) {
        resumen.agotado = true;
        break;
      }
      const lote = pendientes.slice(i, i + 30);
      const candidatos: (Candidato & { giro: GiroMercado })[] = lote.map((c) => ({ id: c.id, precio: Number(c.precio), contexto: c.contexto, giro: c.giro }));
      let entrada: unknown = null;
      try {
        const r = await ia(SISTEMA_CLASIFICAR_PRECIOS, usuarioClasificar(candidatos), HERRAMIENTA_PRECIOS, 3000);
        resumen.costo += costoIaMxn(r.tokensIn, r.tokensOut);
        entrada = r.entrada;
      } catch (e) {
        resumen.errores.push(`IA: ${e instanceof Error ? e.message : e}`);
        if (/401|403/.test(String(e))) break;
        continue;
      }
      const porId = new Map(lote.map((c) => [c.id, c]));
      const clasificados = limpiarClasificacion(entrada, candidatos);
      const vistos = new Set<string>();
      for (const c of clasificados) {
        const p = porId.get(c.id)!;
        vistos.add(c.id);
        resumen.revisados++;
        if (!c.servicio) {
          resumen.descartados++;
          await db.from("precios_mercado_candidatos").update({ situacion: "descartado", confianza: Math.min(1, Math.max(0, c.confianza)), clasificado_at: new Date().toISOString() }).eq("id", c.id);
          continue;
        }
        const s = servicioMercado(c.servicio)!;
        const fila = {
          giro: s.giro,
          servicio: c.servicio,
          talla: c.talla as Talla | null,
          precio: Math.round(Number(p.precio) * 100) / 100,
          ciudad: p.ciudad,
          estado: p.estado,
          fuente: p.fuente,
          url: p.url?.slice(0, 500) ?? null,
          prospecto_id: p.prospecto_id,
          detalle: p.contexto.slice(0, 200),
          valido: precioCreible(c.servicio, Number(p.precio)),
          huella: huellaDe([p.fuente, p.origen ?? p.url ?? p.prospecto_id ?? "", c.servicio, c.talla ?? "-", String(p.precio), mes]),
        };
        // El índice único de la huella es parcial: no sirve un upsert con on conflict. Se busca y, si no está, se inserta
        // (un 23505 por una carrera cuenta como repetido).
        const { data: repetido } = await db.from("precios_mercado").select("id").eq("huella", fila.huella).is("deleted_at", null).limit(1);
        let insertado = false;
        if (!(repetido ?? []).length) {
          const { error: eIns } = await db.from("precios_mercado").insert(fila);
          if (eIns && eIns.code !== "23505") {
            resumen.errores.push(`insertar: ${eIns.message}`);
            await db.from("precios_mercado_candidatos").update({ situacion: "error" }).eq("id", c.id);
            continue;
          }
          insertado = !eIns;
        }
        resumen.clasificados++;
        if (insertado) resumen.insertados++;
        await db.from("precios_mercado_candidatos").update({ situacion: "clasificado", servicio: c.servicio, talla: c.talla, confianza: Math.min(1, Math.max(0, c.confianza)), clasificado_at: new Date().toISOString() }).eq("id", c.id);
      }
      // Los que la IA no devolvió quedan pendientes para la siguiente hora (una vez); si tampoco, descartados.
      for (const c of lote) if (!vistos.has(c.id)) await db.from("precios_mercado_candidatos").update({ situacion: "descartado", clasificado_at: new Date().toISOString() }).eq("id", c.id);
    }
  } catch (e) {
    resumen.errores.push(e instanceof Error ? e.message : String(e));
  }
  if (corrida?.id) {
    await db.from("precios_mercado_corridas").update({ estado: resumen.errores.length && !resumen.revisados ? "fallida" : "terminada", fin_at: new Date().toISOString(), revisados: resumen.revisados, encontrados: resumen.clasificados, insertados: resumen.insertados, costo_ia_mxn: Math.round(resumen.costo * 100) / 100, errores: resumen.errores.length, detalle: { errores: resumen.errores.slice(0, 40), descartados: resumen.descartados, agotado: resumen.agotado }, error: resumen.errores[0] ?? null }).eq("id", corrida.id);
  }
  return resumen;
}
