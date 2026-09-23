"use client";

import { BuscadorClientes } from "@/components/buscador-clientes";
import type { ClienteBuscable } from "@/lib/clientes/buscables";

// Aquí elegir es navegar, para que el servidor cargue los bonos de ese
// cliente y la URL se pueda pegar.
export function BuscadorCliente({ clientes }: { clientes: ClienteBuscable[] }) {
  return <BuscadorClientes clientes={clientes} hrefDe={(c) => `/guarderia/pases?cliente=${c.id}`} nuevoCliente="guarderia_hotel" autoFocus />;
}
