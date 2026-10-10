import type { SupabaseClient } from "@supabase/supabase-js";

export type MascotaBuscada = { id: string; nombre: string; especie: string | null; dueno: string; telefono: string | null };

const limpiar = (q: string) => q.replace(/[%,()]/g, " ").trim();

const mapear = (p: { id: string; nombre: string; especie: string | null; clientes: unknown }): MascotaBuscada => {
  const c = (Array.isArray(p.clientes) ? p.clientes[0] : p.clientes) as { nombre: string; telefono: string | null } | null;
  return { id: p.id, nombre: p.nombre, especie: p.especie, dueno: c?.nombre ?? "Sin dueño", telefono: c?.telefono ?? null };
};

/** Busca mascotas por su nombre, el de su dueño o su teléfono. Sin texto: las más recientes. */
export async function buscarMascotas(supabase: SupabaseClient, textoCrudo: string): Promise<MascotaBuscada[]> {
  const q = limpiar(textoCrudo);
  if (q.length < 2) {
    const { data } = await supabase.from("perros").select("id, nombre, especie, clientes(nombre, telefono)").is("deleted_at", null).order("created_at", { ascending: false }).limit(15);
    return (data ?? []).map((p) => mapear(p as never));
  }
  const [porNombre, porDueno] = await Promise.all([
    supabase.from("perros").select("id, nombre, especie, clientes(nombre, telefono)").is("deleted_at", null).ilike("nombre", `%${q}%`).order("nombre").limit(30),
    supabase.from("clientes").select("id").is("deleted_at", null).eq("publico_general", false).or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`).limit(20),
  ]);
  const ids = (porDueno.data ?? []).map((c) => c.id as string);
  const delDueno = ids.length
    ? await supabase.from("perros").select("id, nombre, especie, clientes(nombre, telefono)").is("deleted_at", null).in("cliente_id", ids).order("nombre").limit(40)
    : { data: [] };
  const mapa = new Map<string, MascotaBuscada>();
  for (const p of [...(porNombre.data ?? []), ...(delDueno.data ?? [])]) mapa.set(p.id as string, mapear(p as never));
  return [...mapa.values()];
}

export const etiquetaEspecie = (e: string | null) => (e === "gato" ? "Gato" : e === "otro" ? "Otro" : "Perro");
