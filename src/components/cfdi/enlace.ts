import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EnlaceFactura =
  | { estado: "ok"; factura: { id: string; serie: string | null; folio: string | null; total: number; pdf_path: string | null; xml_path: string | null; estado: string } }
  | { estado: "vencido" | "no_existe" };

// El link /fac/<token>: solo se guarda el sha256 del token. Se valida con la
// secret key del negocio de la petición (siempre .eq("negocio_id")) y la factura
// tiene que seguir viva. Nada del cliente ni de otros cobros sale de aquí.
export async function resolverEnlaceFactura(admin: SupabaseClient, negocioId: string, token: string): Promise<EnlaceFactura> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { estado: "no_existe" };
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: e } = await admin
    .from("cfdi_enlaces")
    .select("factura_id, vence_at")
    .eq("negocio_id", negocioId)
    .eq("token_hash", hash)
    .is("deleted_at", null)
    .maybeSingle();
  if (!e) return { estado: "no_existe" };
  if (new Date(e.vence_at as string) < new Date()) return { estado: "vencido" };
  const { data: f } = await admin
    .from("cfdi_facturas")
    .select("id, serie, folio, total, pdf_path, xml_path, estado")
    .eq("negocio_id", negocioId)
    .eq("id", e.factura_id as string)
    .in("estado", ["vigente", "cancelacion_pendiente"])
    .is("deleted_at", null)
    .maybeSingle();
  if (!f) return { estado: "no_existe" };
  return { estado: "ok", factura: { ...(f as object), total: Number(f.total) } as never };
}
