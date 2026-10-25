/**
 * El filtro de todos los buscadores de clientes (N124). Sin imports: lo usan
 * <BuscadorClientes>, la lista de /clientes, la búsqueda de Veterinaria y la
 * prueba pura `scripts/auditoria/busqueda-clientes.mjs`.
 *
 * La búsqueda se parte en términos y TODOS tienen que coincidir (Y, no O),
 * cada uno contra el nombre del dueño, el de alguno de sus perros o, solo si
 * el término es numérico, el teléfono. «S32 Est» ya no trae a «QA R23c
 * Cliente Est» por el 32 de su teléfono: «S32» no es un número.
 */
export type PerroFiltrable = { id: string; nombre: string };
export type ClienteFiltrable = { nombre: string; telefono: string | null; perros: PerroFiltrable[] };

export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

type Termino = { texto: string; digitos: string | null };

// Numérico = solo dígitos y los signos con que se escribe un teléfono («+52», «444-123», «(444)»).
export function terminosDeBusqueda(busqueda: string): Termino[] {
  return normalizarBusqueda(busqueda)
    .split(/\s+/)
    .filter(Boolean)
    .map((texto) => ({ texto, digitos: /^[\d+\-().]+$/.test(texto) && /\d/.test(texto) ? texto.replace(/\D/g, "") : null }));
}

/**
 * null si no coincide; si coincide, los perros cuyo nombre contiene alguno
 * de los términos (para pintarlos primero y resaltados).
 */
export function coincidenciaDeCliente<P extends PerroFiltrable>(
  cliente: { nombre: string; telefono: string | null; perros: P[] },
  terminos: Termino[]
): P[] | null {
  const dueno = normalizarBusqueda(cliente.nombre);
  const perros = cliente.perros.map((p) => ({ perro: p, nombre: normalizarBusqueda(p.nombre) }));
  const telefono = (cliente.telefono ?? "").replace(/\D/g, "");
  const coincidentes = new Set<P>();
  for (const t of terminos) {
    const enPerros = perros.filter((p) => p.nombre.includes(t.texto));
    const enTelefono = t.digitos !== null && t.digitos.length > 0 && telefono.includes(t.digitos);
    if (!dueno.includes(t.texto) && enPerros.length === 0 && !enTelefono) return null;
    for (const p of enPerros) coincidentes.add(p.perro);
  }
  return cliente.perros.filter((p) => coincidentes.has(p));
}
