import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/telefono";
import { registrarEventoHerramienta } from "./telemetria";
import { servicioMercado } from "@/lib/mercado/catalogo";

/**
 * Al abrir la prueba gratis, lo que la persona capturó en las herramientas con ese mismo teléfono se carga en su
 * negocio (herramientas_capturas → su cuenta) y se anota el evento «cuenta» por herramienta. Corre con la secret key
 * del negocio recién creado; nunca detiene el registro: lo que falle queda en los logs y en `aplicado_detalle`.
 *
 * Qué entiende hoy:
 *  · precios-mercado: { servicio: clave canónica, talla, precio } → una tarifa en el servicio del negocio que
 *    corresponde (hotel_noche, guarderia_dia, estetica_estetico/estetica_rapado), marcada «Calculado» para que el
 *    admin la confirme en Servicios y precios.
 * Una herramienta nueva agrega su rama aquí.
 */
const SERVICIO_DEL_NEGOCIO: Record<string, string> = { noche_hotel: "hotel_noche", dia_guarderia: "guarderia_dia", bano: "estetica_estetico", bano_y_corte: "estetica_rapado" };

type Captura = { id: string; herramienta: string; datos: Record<string, unknown> };

export async function aplicarPrecarga(negocioId: string, telefono: string): Promise<{ aplicadas: number; herramientas: string[] }> {
  const salida = { aplicadas: 0, herramientas: [] as string[] };
  try {
    const tel = normalizarTelefono(telefono);
    if (!tel) return salida;
    const plataforma = createSupabaseAdminClient();
    const { data } = await plataforma.from("herramientas_capturas").select("id, herramienta, datos, prospecto_id").eq("telefono_norm", tel).is("deleted_at", null).is("aplicado_at", null).limit(20);
    for (const c of (data ?? []) as (Captura & { prospecto_id: string | null })[]) {
      let detalle = "sin nada que precargar";
      try {
        if (c.herramienta === "precios-mercado") detalle = await precargarTarifa(negocioId, c.datos);
      } catch (e) {
        detalle = `error: ${e instanceof Error ? e.message : e}`;
        console.error("[herramientas] precarga", c.herramienta, detalle);
      }
      await plataforma.from("herramientas_capturas").update({ aplicado_negocio_id: negocioId, aplicado_at: new Date().toISOString(), aplicado_detalle: detalle.slice(0, 400) }).eq("id", c.id);
      await registrarEventoHerramienta({ herramienta: c.herramienta, evento: "cuenta", giro: (c.datos.giro as string | null) ?? null, ciudad: (c.datos.ciudad as string | null) ?? null, prospectoId: c.prospecto_id, negocioId, sinFiltroNavegador: true });
      salida.herramientas.push(c.herramienta);
      if (!detalle.startsWith("error") && detalle !== "sin nada que precargar") salida.aplicadas++;
    }
  } catch (e) {
    console.error("[herramientas] precarga", e instanceof Error ? e.message : e);
  }
  return salida;
}

/** El precio que escribió en el índice queda como tarifa «Calculado» del servicio equivalente del negocio. */
async function precargarTarifa(negocioId: string, datos: Record<string, unknown>): Promise<string> {
  const clave = String(datos.servicio ?? "");
  const precio = Number(datos.precio);
  const talla = typeof datos.talla === "string" ? datos.talla : null;
  const canonico = servicioMercado(clave);
  const claveNegocio = SERVICIO_DEL_NEGOCIO[clave];
  if (!canonico || !claveNegocio || !Number.isFinite(precio) || precio <= 0) return "sin precio que precargar";
  const admin = createSupabaseAdminClient(negocioId);
  const { data: servicio } = await admin.from("servicios").select("id, depende_tamano, depende_grupo_raza").eq("negocio_id", negocioId).eq("clave", claveNegocio).is("deleted_at", null).maybeSingle();
  if (!servicio) return `el negocio no tiene el servicio ${claveNegocio}`;
  const { data: yaTiene } = await admin.from("tarifas").select("id").eq("negocio_id", negocioId).eq("servicio_id", servicio.id).is("deleted_at", null).eq("calculado", false).limit(1);
  if (yaTiene?.length) return "el servicio ya tenía tarifas capturadas";
  const hoy = new Date().toISOString().slice(0, 10);
  const filas: Record<string, unknown>[] = [];
  if (servicio.depende_tamano) {
    const { data: tamanos } = await admin.from("tamanos_categoria").select("id, clave").is("deleted_at", null);
    for (const t of tamanos ?? []) {
      // La talla que dio lleva su precio; las demás, el mismo precio como punto de partida (todas «Calculado»).
      filas.push({ negocio_id: negocioId, servicio_id: servicio.id, tamano_id: t.id, precio, vigencia_desde: hoy, calculado: true, cantidad_desde: 1 });
    }
  } else if (servicio.depende_grupo_raza) {
    const { data: grupos } = await admin.from("grupos_raza").select("id").eq("negocio_id", negocioId).is("deleted_at", null);
    for (const g of grupos ?? []) filas.push({ negocio_id: negocioId, servicio_id: servicio.id, grupo_raza_id: g.id, precio, vigencia_desde: hoy, calculado: true, cantidad_desde: 1 });
  } else {
    filas.push({ negocio_id: negocioId, servicio_id: servicio.id, precio, vigencia_desde: hoy, calculado: true, cantidad_desde: 1 });
  }
  if (!filas.length) return "sin combinaciones donde poner el precio";
  const { error } = await admin.from("tarifas").insert(filas);
  if (error) throw new Error(error.message);
  return `${filas.length} tarifas «Calculado» en ${claveNegocio} con $${precio}${talla ? ` (talla ${talla})` : ""}`;
}
