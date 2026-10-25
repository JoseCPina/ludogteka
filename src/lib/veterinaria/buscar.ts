import type { SupabaseClient } from "@supabase/supabase-js";
import { coincidenciaDeCliente, terminosDeBusqueda } from "@/lib/clientes/filtro";

export type MascotaBuscada = { id: string; nombre: string; especie: string | null; dueno: string; telefono: string | null };

const limpiar = (q: string) => q.replace(/[%,()]/g, " ").trim();

const mapear = (p: { id: string; nombre: string; especie: string | null; clientes: unknown }): MascotaBuscada => {
  const c = (Array.isArray(p.clientes) ? p.clientes[0] : p.clientes) as { nombre: string; telefono: string | null } | null;
  return { id: p.id, nombre: p.nombre, especie: p.especie, dueno: c?.nombre ?? "Sin dueño", telefono: c?.telefono ?? null };
};

/**
 * Busca mascotas por su nombre, el de su dueño o su teléfono, con la regla de todos los buscadores
 * (src/lib/clientes/filtro.ts): cada término tiene que coincidir. La base trae los candidatos del término
 * más largo y aquí se exigen todos. Sin texto: las más recientes.
 */
export async function buscarMascotas(supabase: SupabaseClient, textoCrudo: string): Promise<MascotaBuscada[]> {
  const terminos = terminosDeBusqueda(limpiar(textoCrudo));
  const largo = terminos.reduce<(typeof terminos)[number] | null>((a, t) => (!a || t.texto.length > a.texto.length ? t : a), null);
  if (!largo || terminos.map((t) => t.texto).join(" ").length < 2) {
    const { data } = await supabase.from("perros").select("id, nombre, especie, clientes(nombre, telefono)").is("deleted_at", null).order("created_at", { ascending: false }).limit(15);
    return (data ?? []).map((p) => mapear(p as never));
  }
  const q = largo.texto;
  const enDueno = largo.digitos ? `nombre.ilike.%${q}%,telefono.ilike.%${largo.digitos}%` : `nombre.ilike.%${q}%`;
  const [porNombre, porDueno] = await Promise.all([
    supabase.from("perros").select("id, nombre, especie, clientes(nombre, telefono)").is("deleted_at", null).ilike("nombre", `%${q}%`).order("nombre").limit(60),
    supabase.from("clientes").select("id").is("deleted_at", null).eq("publico_general", false).or(enDueno).limit(40),
  ]);
  const ids = (porDueno.data ?? []).map((c) => c.id as string);
  const delDueno = ids.length
    ? await supabase.from("perros").select("id, nombre, especie, clientes(nombre, telefono)").is("deleted_at", null).in("cliente_id", ids).order("nombre").limit(80)
    : { data: [] };
  const mapa = new Map<string, MascotaBuscada>();
  for (const p of [...(porNombre.data ?? []), ...(delDueno.data ?? [])]) {
    const m = mapear(p as never);
    if (coincidenciaDeCliente({ nombre: m.dueno, telefono: m.telefono, perros: [m] }, terminos)) mapa.set(m.id, m);
  }
  return [...mapa.values()].slice(0, 30);
}

export const etiquetaEspecie = (e: string | null) => (e === "gato" ? "Gato" : e === "otro" ? "Otro" : "Perro");
