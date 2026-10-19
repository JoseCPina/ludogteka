import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conIva } from "@/lib/cobro/iva";

/**
 * El plan único de PeluDesk, de la base (lo edita la plataforma en /plataforma/planes):
 * nunca un precio escrito en el código. Si hubiera más de un plan activo, el más barato.
 */
export type PlanUnico = {
  nombre: string;
  /** Pesos al mes, sin IVA. */
  mensual: number;
  /** Pesos al mes, IVA incluido. */
  total: number;
  /** Pesos de IVA al mes. */
  iva: number;
  anual: number;
  modulos: string[];
};

export const SIN_COSTO_INICIAL = "Sin costo inicial · Todos los módulos";

export async function planUnico(): Promise<PlanUnico | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("planes")
      .select("nombre, precio_mensual, precio_anual, modulos")
      .eq("tipo", "plan")
      .eq("activo", true)
      .is("deleted_at", null)
      .gt("precio_mensual", 0)
      .order("precio_mensual", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const d = conIva(Number(data.precio_mensual));
    return { nombre: data.nombre as string, mensual: Number(data.precio_mensual), total: d.total / 100, iva: d.iva / 100, anual: Number(data.precio_anual), modulos: (data.modulos ?? []) as string[] };
  } catch {
    return null;
  }
}

const formato = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
export const pesos = (n: number) => `$${formato(n)}`;

/** La sucursal adicional (mismo dueño, después de la primera), de la base: tipo 'sucursal' en planes. */
export async function planSucursal(): Promise<{ mensual: number; total: number } | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("planes")
      .select("precio_mensual")
      .eq("tipo", "sucursal")
      .eq("activo", true)
      .is("deleted_at", null)
      .gt("precio_mensual", 0)
      .order("orden")
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return { mensual: Number(data.precio_mensual), total: conIva(Number(data.precio_mensual)).total / 100 };
  } catch {
    return null;
  }
}
