import type { SupabaseClient } from "@supabase/supabase-js";
import { crearAdaptador, conexionPac, SIN_LLAVE } from "./conexion";
import { ErrorPac } from "./errores";
import type { AdaptadorPac, EstadoCancelacion, SolicitudTimbrado } from "./tipos";

/**
 * Lo que se hace con una factura, en este orden y nada más:
 *   1) la base arma el borrador (cfdi_preparar_*: conceptos e importes);
 *   2) cfdi_iniciar_timbrado lo marca «timbrando» y entrega la solicitud;
 *   3) el PAC timbra;
 *   4) cfdi_registrar_timbrado guarda el resultado (solo service_role).
 * Si algo se corta entre 3 y 4 la factura queda «por revisar», y se resuelve
 * preguntándole al PAC por la referencia (nunca se timbra dos veces a ciegas).
 *
 * `sb` es el cliente con la sesión de quien actúa (la base comprueba su permiso);
 * `admin` es el de la secret key atado al negocio (guarda lo que dijo el PAC).
 */
export const BUCKET = "cfdi-archivos";

export type Resultado = { error: string | null; aviso?: string };

function texto(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function adaptadorDe(admin: SupabaseClient): Promise<{ pac: AdaptadorPac; modo: "pruebas" | "produccion" } | null> {
  const c = await conexionPac(admin);
  return c ? { pac: crearAdaptador(c), modo: c.modo } : null;
}

export async function timbrarFactura(sb: SupabaseClient, admin: SupabaseClient, negocioId: string, facturaId: string): Promise<Resultado> {
  const ini = await sb.rpc("cfdi_iniciar_timbrado", { p_factura_id: facturaId });
  if (ini.error) return { error: traducir(ini.error) };
  const sol = ini.data as SolicitudTimbrado;

  const ad = await adaptadorDe(admin);
  if (!ad) {
    await admin.rpc("cfdi_registrar_error", { p_factura_id: facturaId, p_mensaje: SIN_LLAVE, p_incierto: false });
    return { error: SIN_LLAVE };
  }
  try {
    const r = await ad.pac.timbrar(sol);
    const g = await admin.rpc("cfdi_registrar_timbrado", {
      p_factura_id: facturaId,
      p: { uuid: r.uuid, pac_factura_id: r.pac_factura_id, folio: r.folio, serie: r.serie, fecha: r.fecha, total: r.total, subtotal: r.subtotal },
    });
    if (g.error) {
      // El CFDI existe en el PAC: que no se pierda. Queda por revisar y se concilia por la referencia.
      await admin.rpc("cfdi_registrar_error", { p_factura_id: facturaId, p_mensaje: `Timbrada (${r.uuid}) pero no se pudo guardar: ${g.error.message}`, p_incierto: true });
      return { error: "La factura se timbró pero no se pudo guardar aquí. Quedó «por revisar»: ábrela en Facturas y presiona Revisar." };
    }
    await guardarArchivos(admin, ad.pac, negocioId, facturaId, r.pac_factura_id).catch((e) => console.error("[cfdi] archivos", texto(e)));
    return { error: null, aviso: ad.modo === "pruebas" ? "Factura timbrada en PRUEBAS (sandbox): no tiene validez fiscal." : undefined };
  } catch (e) {
    const incierto = e instanceof ErrorPac ? e.incierto : true;
    const mensaje = e instanceof ErrorPac ? e.message : texto(e);
    await admin.rpc("cfdi_registrar_error", { p_factura_id: facturaId, p_mensaje: mensaje, p_incierto: incierto });
    console.error("[cfdi] timbrar", e instanceof ErrorPac ? e.detalle ?? e.message : texto(e));
    return {
      error: incierto
        ? `${mensaje} La factura quedó «por revisar»: puede que sí haya salido. Ábrela en Facturas y presiona Revisar antes de volver a intentar.`
        : mensaje,
    };
  }
}

/** Una factura «por revisar» (el timbrado se cortó): se le pregunta al PAC si sí salió. */
export async function revisarFactura(sb: SupabaseClient, admin: SupabaseClient, negocioId: string, facturaId: string): Promise<Resultado> {
  const { data: f } = await admin.from("cfdi_facturas").select("id, referencia, estado").eq("id", facturaId).eq("negocio_id", negocioId).maybeSingle();
  if (!f || f.estado !== "revisar") return { error: "Esa factura no está por revisar." };
  const { data: permiso } = await sb.rpc("tiene_permiso", { p_permiso: "facturar" });
  if (!permiso) return { error: "Necesitas el permiso «Facturar»." };
  const ad = await adaptadorDe(admin);
  if (!ad) return { error: SIN_LLAVE };
  try {
    const r = await ad.pac.buscarPorReferencia(f.referencia);
    if (!r) {
      await admin.rpc("cfdi_registrar_error", { p_factura_id: facturaId, p_mensaje: "El PAC no tiene una factura con esta referencia: no salió. Se puede volver a timbrar.", p_incierto: false });
      return { error: null, aviso: "El PAC no la tiene: no salió. Quedó otra vez como borrador, ya puedes timbrarla." };
    }
    const g = await admin.rpc("cfdi_registrar_timbrado", {
      p_factura_id: facturaId,
      p: { uuid: r.uuid, pac_factura_id: r.pac_factura_id, folio: r.folio, serie: r.serie, fecha: r.fecha, total: r.total, subtotal: r.subtotal },
    });
    if (g.error) return { error: traducir(g.error) };
    await guardarArchivos(admin, ad.pac, negocioId, facturaId, r.pac_factura_id).catch((e) => console.error("[cfdi] archivos", texto(e)));
    return { error: null, aviso: "Sí había salido: la factura quedó vigente." };
  } catch (e) {
    return { error: e instanceof ErrorPac ? e.message : texto(e) };
  }
}

export async function cancelarFactura(
  sb: SupabaseClient,
  admin: SupabaseClient,
  facturaId: string,
  motivo: string,
  sustitutaUuid: string | null
): Promise<Resultado> {
  const ini = await sb.rpc("cfdi_iniciar_cancelacion", { p_factura_id: facturaId, p_motivo: motivo, p_sustituta: sustitutaUuid });
  if (ini.error) return { error: traducir(ini.error) };
  const d = ini.data as { pac_factura_id: string; sustituta: string | null };
  const ad = await adaptadorDe(admin);
  if (!ad) return { error: SIN_LLAVE };
  let estado: EstadoCancelacion;
  try {
    estado = await ad.pac.cancelar(d.pac_factura_id, motivo, d.sustituta);
  } catch (e) {
    return { error: e instanceof ErrorPac ? e.message : texto(e) };
  }
  const detalle = { motivo, sustituta: d.sustituta };
  const g = await admin.rpc("cfdi_registrar_cancelacion", { p_factura_id: facturaId, p_estatus: estado === "vigente" ? "pendiente" : estado, p_detalle: detalle });
  if (g.error) return { error: traducir(g.error) };
  if (estado === "pendiente") return { error: null, aviso: "Solicitud enviada. El cliente tiene hasta 3 días para aceptarla; mientras tanto la factura sigue vigente." };
  if (estado === "rechazada") return { error: "El cliente rechazó la cancelación: la factura sigue vigente." };
  return { error: null, aviso: "Factura cancelada." };
}

/** Pregunta al PAC cómo van las cancelaciones pendientes y las aplica. Devuelve cuántas cambiaron. */
export async function sincronizarCancelaciones(admin: SupabaseClient, negocioId: string): Promise<number> {
  const { data: pendientes } = await admin
    .from("cfdi_facturas")
    .select("id, pac_factura_id, cancelacion_limite")
    .eq("negocio_id", negocioId)
    .eq("estado", "cancelacion_pendiente")
    .is("deleted_at", null);
  if (!pendientes?.length) return 0;
  const ad = await adaptadorDe(admin);
  if (!ad) return 0;
  let cambiaron = 0;
  for (const f of pendientes) {
    try {
      const e = await ad.pac.estadoCancelacion(f.pac_factura_id);
      if (e === "cancelada") {
        const vencido = f.cancelacion_limite && new Date(f.cancelacion_limite) < new Date();
        await admin.rpc("cfdi_registrar_cancelacion", { p_factura_id: f.id, p_estatus: "cancelada", p_detalle: { estatus: vencido ? "plazo_vencido" : "aceptada" } });
        cambiaron++;
      } else if (e === "rechazada") {
        await admin.rpc("cfdi_registrar_cancelacion", { p_factura_id: f.id, p_estatus: "rechazada", p_detalle: {} });
        cambiaron++;
      }
    } catch (e) {
      console.error("[cfdi] sincronizar", texto(e));
    }
  }
  return cambiaron;
}

export async function guardarArchivos(admin: SupabaseClient, pac: AdaptadorPac, negocioId: string, facturaId: string, pacId: string): Promise<void> {
  const rutas: { pdf?: string; xml?: string } = {};
  for (const formato of ["pdf", "xml"] as const) {
    const { contenido, tipo } = await pac.descargar(pacId, formato);
    const ruta = `${negocioId}/${facturaId}/factura.${formato}`;
    const { error } = await admin.storage.from(BUCKET).upload(ruta, contenido, { contentType: tipo, upsert: true });
    if (error) throw new Error(`No se pudo guardar el ${formato}: ${error.message}`);
    rutas[formato] = ruta;
  }
  const g = await admin.rpc("cfdi_adjuntar_archivos", { p_factura_id: facturaId, p_pdf: rutas.pdf ?? null, p_xml: rutas.xml ?? null });
  if (g.error) throw new Error(g.error.message);
}

/** El archivo de una factura (ya guardado, o bajado del PAC la primera vez que se pide). */
export async function archivoDeFactura(
  admin: SupabaseClient,
  negocioId: string,
  facturaId: string,
  formato: "pdf" | "xml",
  fila: { pdf_path: string | null; xml_path: string | null; estado: string }
): Promise<{ contenido: ArrayBuffer; tipo: string } | null> {
  const ruta = formato === "pdf" ? fila.pdf_path : fila.xml_path;
  if (ruta) {
    const { data } = await admin.storage.from(BUCKET).download(ruta);
    if (data) return { contenido: await data.arrayBuffer(), tipo: formato === "pdf" ? "application/pdf" : "application/xml" };
  }
  // No se guardó (el PAC falló en su momento): se baja ahora.
  const { data: f } = await admin.from("cfdi_facturas").select("pac_factura_id").eq("id", facturaId).eq("negocio_id", negocioId).maybeSingle();
  if (!f?.pac_factura_id) return null;
  const ad = await adaptadorDe(admin);
  if (!ad) return null;
  await guardarArchivos(admin, ad.pac, negocioId, facturaId, f.pac_factura_id).catch((e) => console.error("[cfdi] archivos", texto(e)));
  return ad.pac.descargar(f.pac_factura_id, formato);
}

/** Manda la factura por correo con el PAC (él adjunta PDF y XML). */
export async function enviarPorCorreo(admin: SupabaseClient, facturaId: string, pacId: string, correo: string): Promise<Resultado> {
  const ad = await adaptadorDe(admin);
  if (!ad) return { error: SIN_LLAVE };
  try {
    await ad.pac.enviarPorCorreo(pacId, correo);
    return { error: null };
  } catch (e) {
    return { error: e instanceof ErrorPac ? e.message : texto(e) };
  }
}

export async function buscarClaves(admin: SupabaseClient, que: "productos" | "unidades", consulta: string) {
  const ad = await adaptadorDe(admin);
  if (!ad) throw new Error(SIN_LLAVE);
  return que === "productos" ? ad.pac.buscarProductos(consulta) : ad.pac.buscarUnidades(consulta);
}

export async function hayLlave(admin: SupabaseClient): Promise<{ hay: boolean; modo: "pruebas" | "produccion" | null; origen: "negocio" | "entorno" | null }> {
  const c = await conexionPac(admin);
  return { hay: !!c, modo: c?.modo ?? null, origen: c?.origen ?? null };
}

/** Las reglas de la base ya vienen explicadas (P0001 / 42501); lo demás, genérico. */
export function traducir(e: { code?: string; message: string }): string {
  if (e.code === "P0001" || e.code === "42501") return e.message;
  if (/solo lectura/i.test(e.message)) return e.message;
  return "No pudimos completar esto. Intenta de nuevo.";
}
