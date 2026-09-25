import type { SupabaseClient } from "@supabase/supabase-js";

// Lo que comparten las pantallas de inventario.

export type Area = { id: string; nombre: string; orden: number };

export async function cargarAreas(supabase: SupabaseClient): Promise<Area[]> {
  const { data } = await supabase.from("areas_inventario").select("id, nombre, orden").is("deleted_at", null).order("orden");
  return (data ?? []) as Area[];
}

// Dar de alta y editar consumibles y equipo: admin y recepción (la base lo
// aplica con insumos_insert_staff / equipos_insert_staff). Estética registra
// consumo, merma y estado del equipo, pero no da de alta.
export function puedeDarDeAlta(rol: string | undefined): boolean {
  return rol === "admin" || rol === "recepcion";
}

export const ESTADOS_EQUIPO: Record<string, { etiqueta: string; estilo: string }> = {
  bueno: { etiqueta: "Bueno", estilo: "bg-menta-suave text-menta-oscuro" },
  mantenimiento: { etiqueta: "Necesita mantenimiento", estilo: "bg-ambar-suave text-ambar-oscuro" },
  descompuesto: { etiqueta: "Descompuesto", estilo: "bg-coral-suave text-coral-oscuro" },
  baja: { etiqueta: "Dado de baja", estilo: "bg-n-100 text-n-600" },
};

export const AVISOS_EQUIPO: Record<string, { etiqueta: string; estilo: string }> = {
  vencido: { etiqueta: "Mantenimiento vencido", estilo: "bg-coral-suave text-coral-oscuro" },
  pronto: { etiqueta: "Toca mantenimiento pronto", estilo: "bg-ambar-suave text-ambar-oscuro" },
  sin_registro: { etiqueta: "Sin mantenimiento registrado", estilo: "bg-ambar-suave text-ambar-oscuro" },
  necesita_mantenimiento: { etiqueta: "Necesita mantenimiento", estilo: "bg-ambar-suave text-ambar-oscuro" },
  descompuesto: { etiqueta: "Descompuesto", estilo: "bg-coral-suave text-coral-oscuro" },
};

// En las listas la existencia va con la unidad corta: «1,960 ml», «3 pz».
export function abreviarUnidad(clave: string) {
  return clave === "pieza" ? "pz" : clave === "galon" ? "gal" : clave;
}
