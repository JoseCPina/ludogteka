"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { formatearTelefono } from "@/lib/telefono";

export type ClienteFila = {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  created_at: string;
};

export function ListaClientes({ clientes }: { clientes: ClienteFila[] }) {
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    const qDigitos = q.replace(/\D/g, "");
    return clientes.filter((c) => {
      const porNombre = c.nombre.toLowerCase().includes(q);
      const porTelefono = qDigitos.length > 0 && c.telefono.includes(qDigitos);
      return porNombre || porTelefono;
    });
  }, [clientes, busqueda]);

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
          label="Buscar por nombre o teléfono"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="ej. Ana o 444 123"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Nombre
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
                    className="rounded font-semibold text-azul hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul"
                  >
                    {cliente.nombre}
                  </Link>
                </td>
                <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                  {formatearTelefono(cliente.telefono)}
                </td>
                <td className="border-b border-n-200 px-4 py-3 text-n-600">
                  {cliente.email ?? "—"}
                </td>
                <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-600">
                  {formatearFecha(cliente.created_at)}
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
