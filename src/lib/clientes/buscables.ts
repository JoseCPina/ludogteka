import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/supabase/paginar";
import { coincidenciaDeCliente, terminosDeBusqueda } from "@/lib/clientes/filtro";

/**
 * Lo que necesita cualquier buscador de clientes de la app: el dueño, su
 * teléfono y los nombres de sus perros. El staff sabe el nombre del perro
 * mucho más seguido que el del dueño, así que se busca por los tres; lo
 * que se elige sigue siendo el CLIENTE, porque de él cuelgan las reservas
 * (los pases son de cada perro y se escogen después).
 *
 * Todo buscador de clientes (reserva nueva, walk-in, serie, cita de
 * estética, pases, vinculación, lista de clientes) arma sus filas con
 * esto y las pinta con <BuscadorClientes>. El próximo buscador hereda
 * los tres criterios sin reescribir el filtro.
 */
export type PerroBuscable = { id: string; nombre: string };

export type ClienteBuscable = {
  id: string;
  nombre: string;
  telefono: string;
  perros: PerroBuscable[];
};

export type ClienteCrudo = { id: string; nombre: string; telefono: string };
export type PerroCrudo = { id: string; cliente_id: string; nombre: string };

// Para las pantallas que ya cargan clientes y perros por su cuenta (la
// reserva nueva, la serie, la cita): se combinan aquí y no se vuelve a
// pedir nada a la base.
export function armarClientesBuscables(clientes: ClienteCrudo[], perros: PerroCrudo[]): ClienteBuscable[] {
  const porCliente = new Map<string, PerroBuscable[]>();
  for (const p of perros) {
    const lista = porCliente.get(p.cliente_id) ?? [];
    lista.push({ id: p.id, nombre: p.nombre });
    porCliente.set(p.cliente_id, lista);
  }
  return clientes.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    perros: porCliente.get(c.id) ?? [],
  }));
}

// Para las pantallas que solo necesitan el buscador (pases, vinculación,
// lista de clientes). Perros vivos y no fallecidos: el nombre de un perro
// que ya murió no es con el que se busca al dueño en el mostrador.
export async function cargarClientesBuscables(
  supabase: SupabaseClient
): Promise<{ clientes: ClienteBuscable[]; error: Error | null }> {
  // Todos los clientes y perros del negocio, página por página: la API corta en 1,000 filas.
  const [{ data: clientes, error: e1 }, { data: perros, error: e2 }] = await Promise.all([
    leerTodo<ClienteCrudo>(() => supabase.from("clientes").select("id, nombre, telefono").is("deleted_at", null).eq("publico_general", false).order("nombre").order("id")),
    leerTodo<PerroCrudo>(() => supabase.from("perros").select("id, cliente_id, nombre").is("deleted_at", null).eq("fallecido", false).order("nombre").order("id")),
  ]);
  const error = e1 ?? e2;
  if (error) return { clientes: [], error: new Error(error.message) };
  return {
    clientes: armarClientesBuscables(clientes, perros),
    error: null,
  };
}

export type CoincidenciaCliente = {
  cliente: ClienteBuscable;
  // Los perros cuyo nombre coincidió con la búsqueda, para pintarlos
  // primero y resaltados: es lo que desambigua dos perros que se llaman
  // igual con dueños distintos.
  perrosCoincidentes: PerroBuscable[];
};

// Un solo filtro para todos los buscadores (src/lib/clientes/filtro.ts): cada
// término de la búsqueda tiene que estar en el nombre del dueño, en el de
// alguno de sus perros o, si es numérico, en el teléfono. Sin acentos y sin
// mayúsculas: "Motita" encuentra "motita", "Jose" encuentra "José".
export function filtrarClientesBuscables(clientes: ClienteBuscable[], busqueda: string): CoincidenciaCliente[] {
  const terminos = terminosDeBusqueda(busqueda);
  if (terminos.length === 0) return clientes.map((cliente) => ({ cliente, perrosCoincidentes: [] }));

  const resultado: CoincidenciaCliente[] = [];
  for (const cliente of clientes) {
    const perrosCoincidentes = coincidenciaDeCliente(cliente, terminos);
    if (perrosCoincidentes) resultado.push({ cliente, perrosCoincidentes });
  }
  return resultado;
}
