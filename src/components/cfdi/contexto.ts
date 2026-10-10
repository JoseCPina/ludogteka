import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemCatalogo } from "./textos";

// Lo que las pantallas necesitan saber para ofrecer «Facturar»: si la persona
// puede, si el negocio tiene la facturación activa, los catálogos del SAT y qué
// cobros ya están en una factura. Todo con la sesión de quien mira (la base
// filtra); nada de esto concede un permiso: solo decide qué se muestra.
export type ContextoFacturar = {
  puede: boolean;
  activa: boolean;
  modo: "pruebas" | "produccion";
  catalogos: ItemCatalogo[];
};

export async function contextoFacturar(sb: SupabaseClient, negocioId: string): Promise<ContextoFacturar> {
  const [{ data: puede }, { data: cfg }, { data: cats }] = await Promise.all([
    sb.rpc("tiene_permiso", { p_permiso: "facturar" }),
    sb.from("cfdi_config_negocio").select("activa, modo").eq("negocio_id", negocioId).is("deleted_at", null).maybeSingle(),
    sb.from("cfdi_catalogos").select("tipo, clave, descripcion, persona").in("tipo", ["regimen_fiscal", "uso_cfdi", "motivo_cancelacion"]).is("deleted_at", null).order("clave"),
  ]);
  return {
    puede: Boolean(puede),
    activa: Boolean(cfg?.activa),
    modo: cfg?.modo === "produccion" ? "produccion" : "pruebas",
    catalogos: (cats ?? []) as ItemCatalogo[],
  };
}

export type CobroFacturado = { facturaId: string; etiqueta: string; estado: string };

/** Cobro → su factura vigente (si la tiene). */
export async function facturasDeCobros(sb: SupabaseClient, negocioId: string, cobroIds: string[]): Promise<Record<string, CobroFacturado>> {
  if (!cobroIds.length) return {};
  const { data } = await sb
    .from("cfdi_factura_cobros")
    .select("cobro_id, factura_id, cfdi_facturas(serie, folio, estado, tipo)")
    .eq("negocio_id", negocioId)
    .eq("vigente", true)
    .in("cobro_id", cobroIds);
  const salida: Record<string, CobroFacturado> = {};
  for (const f of data ?? []) {
    const fa = (Array.isArray(f.cfdi_facturas) ? f.cfdi_facturas[0] : f.cfdi_facturas) as { serie: string | null; folio: string | null; estado: string; tipo: string } | null;
    if (!fa || !["borrador", "timbrando", "vigente", "cancelacion_pendiente", "revisar"].includes(fa.estado)) continue;
    const folio = `${fa.serie ?? ""}${fa.folio ?? ""}`.trim();
    salida[f.cobro_id as string] = {
      facturaId: f.factura_id as string,
      estado: fa.estado,
      etiqueta: fa.estado === "borrador" ? "factura sin timbrar" : `factura ${folio || "sin folio"}${fa.tipo === "global" ? " (global)" : ""}`,
    };
  }
  return salida;
}

export type DatosFiscalesCliente = { rfc: string; nombre_fiscal: string; cp: string; regimen_fiscal: string; uso_cfdi: string; email: string | null };

export async function datosFiscalesDe(sb: SupabaseClient, negocioId: string, clienteId: string): Promise<DatosFiscalesCliente | null> {
  const { data } = await sb
    .from("cfdi_datos_fiscales")
    .select("rfc, nombre_fiscal, cp, regimen_fiscal, uso_cfdi, email")
    .eq("negocio_id", negocioId)
    .eq("cliente_id", clienteId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as DatosFiscalesCliente | null) ?? null;
}
