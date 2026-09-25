"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { formatearTelefono } from "@/lib/telefono";
import { ETIQUETA_BUSCAR_CLIENTES } from "@/components/buscador-clientes";
import { filtrarClientesBuscables, type ClienteBuscable } from "@/lib/clientes/buscables";
import { useZonaNegocio } from "@/components/zona-negocio";

export type ClienteFila = ClienteBuscable & {
  email: string | null;
  created_at: string;
  alta_por_cliente: boolean;
  datos_revisados_at: string | null;
};

export function ListaClientes({ clientes }: { clientes: ClienteFila[] }) {
  const zona = useZonaNegocio();
  const [busqueda, setBusqueda] = useState("");

  // Mismo filtro que todos los buscadores: perro, dueño o teléfono.
  const filtrados = useMemo(
    () => filtrarClientesBuscables(clientes, busqueda).map((c) => ({ ...(c.cliente as ClienteFila), coincidentes: new Set(c.perrosCoincidentes.map((p) => p.id)) })),
    [clientes, busqueda]
  );

  if (clientes.length === 0) {
    return (
      <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-10 text-center">
        <h3 className="text-lg font-bold text-n-900">Aún no hay dueños registrados</h3>
        <p className="mt-1 text-n-600">En cuanto des de alta al primero, va a aparecer aquí.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">
        <Field
          label={ETIQUETA_BUSCAR_CLIENTES}
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="ej. Motita, Ana o 444 123"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Nombre
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Perros
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Teléfono
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Correo
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Alta
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((cliente) => (
              <tr key={cliente.id} className="hover:bg-n-50">
                <td className="border-b border-n-200 px-4 py-3">
                  <Link
                    href={`/clientes/${cliente.id}`}
                    className="rounded font-semibold text-morado hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado"
                  >
                    {cliente.nombre}
                  </Link>
                  {cliente.alta_por_cliente && !cliente.datos_revisados_at && (
                    <span
                      className="ml-2 whitespace-nowrap rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado-oscuro"
                      title="Estos datos los capturo el dueno desde su celular: conviene revisarlos"
                    >
                      Alta del cliente · sin revisar
                    </span>
                  )}
                </td>
                <td className="border-b border-n-200 px-4 py-3 text-n-700">
                  {cliente.perros.length === 0
                    ? <span className="text-n-400">—</span>
                    : cliente.perros.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && ", "}
                          {cliente.coincidentes.has(p.id) ? (
                            <strong className="rounded bg-ambar-suave px-1 text-n-900">{p.nombre}</strong>
                          ) : (
                            p.nombre
                          )}
                        </span>
                      ))}
                </td>
                <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                  {formatearTelefono(cliente.telefono)}
                </td>
                <td className="border-b border-n-200 px-4 py-3 text-n-600">
                  {cliente.email ?? "—"}
                </td>
                <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-600">
                  {formatearFecha(cliente.created_at, zona)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtrados.length === 0 && (
          <p className="p-6 text-center text-n-600">
            Ningún cliente coincide con &quot;{busqueda}&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
