import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lo que necesita cualquier buscador de clientes de la app: el dueño, su
 * teléfono y los nombres de sus perros. El staff sabe el nombre del perro
 * mucho más seguido que el del dueño, así que se busca por los tres; lo
 * que se elige sigue siendo el CLIENTE, porque de él cuelgan los pases y
 * las reservas.
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
  const [{ data: clientes, error: e1 }, { data: perros, error: e2 }] = await Promise.all([
    supabase.from("clientes").select("id, nombre, telefono").is("deleted_at", null).order("nombre"),
    supabase
      .from("perros")
      .select("id, cliente_id, nombre")
      .is("deleted_at", null)
      .eq("fallecido", false)
      .order("nombre"),
  ]);
  const error = e1 ?? e2;
  if (error) return { clientes: [], error: new Error(error.message) };
  return {
    clientes: armarClientesBuscables((clientes ?? []) as ClienteCrudo[], (perros ?? []) as PerroCrudo[]),
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

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Un solo filtro para todos los buscadores: nombre del dueño, teléfono
// (solo dígitos, con o sin espacios y guiones) y nombre de cualquiera de
// sus perros. Sin acentos y sin mayúsculas: "Motita" encuentra "motita",
// "Jose" encuentra "José".
export function filtrarClientesBuscables(clientes: ClienteBuscable[], busqueda: string): CoincidenciaCliente[] {
  const q = normalizar(busqueda);
  if (!q) return clientes.map((cliente) => ({ cliente, perrosCoincidentes: [] }));
  const qDigitos = q.replace(/\D/g, "");

  const resultado: CoincidenciaCliente[] = [];
  for (const cliente of clientes) {
    const perrosCoincidentes = cliente.perros.filter((p) => normalizar(p.nombre).includes(q));
    const porDueno = normalizar(cliente.nombre).includes(q);
    const porTelefono = qDigitos.length > 0 && cliente.telefono.includes(qDigitos);
    if (porDueno || porTelefono || perrosCoincidentes.length > 0) {
      resultado.push({ cliente, perrosCoincidentes });
    }
  }
  return resultado;
}
