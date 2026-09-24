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
  bueno: { etiqueta: "Bueno", estilo: "bg-verde-suave text-verde-oscuro" },
  mantenimiento: { etiqueta: "Necesita mantenimiento", estilo: "bg-amarillo-suave text-amarillo-oscuro" },
  descompuesto: { etiqueta: "Descompuesto", estilo: "bg-naranja-suave text-naranja-oscuro" },
  baja: { etiqueta: "Dado de baja", estilo: "bg-n-100 text-n-600" },
};

export const AVISOS_EQUIPO: Record<string, { etiqueta: string; estilo: string }> = {
  vencido: { etiqueta: "Mantenimiento vencido", estilo: "bg-naranja-suave text-naranja-oscuro" },
  pronto: { etiqueta: "Toca mantenimiento pronto", estilo: "bg-amarillo-suave text-amarillo-oscuro" },
  sin_registro: { etiqueta: "Sin mantenimiento registrado", estilo: "bg-amarillo-suave text-amarillo-oscuro" },
  necesita_mantenimiento: { etiqueta: "Necesita mantenimiento", estilo: "bg-amarillo-suave text-amarillo-oscuro" },
  descompuesto: { etiqueta: "Descompuesto", estilo: "bg-naranja-suave text-naranja-oscuro" },
};

// En las listas la existencia va con la unidad corta: «1,960 ml», «3 pz».
export function abreviarUnidad(clave: string) {
  return clave === "pieza" ? "pz" : clave === "galon" ? "gal" : clave;
}
