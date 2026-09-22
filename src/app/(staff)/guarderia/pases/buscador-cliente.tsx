"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { formatearTelefono } from "@/lib/telefono";

type Cliente = { id: string; nombre: string; telefono: string };

// Mismo buscador que la reserva nueva; aquí elegir es navegar, para que
// el servidor cargue los bonos de ese cliente y la URL se pueda pegar.
export function BuscadorCliente({ clientes }: { clientes: Cliente[] }) {
  const [busqueda, setBusqueda] = useState("");
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    const qDigitos = q.replace(/\D/g, "");
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || (qDigitos && c.telefono.includes(qDigitos))
    );
  }, [clientes, busqueda]);

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-sm">
        <Field
          label="Buscar cliente por nombre o teléfono"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="ej. Ana o 444 123"
          autoFocus
        />
      </div>
      <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
        {filtrados.length === 0 ? (
          <p className="p-6 text-center text-n-600">Ningún cliente coincide con la búsqueda.</p>
        ) : (
          <ul className="divide-y divide-n-200">
            {filtrados.slice(0, 30).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/guarderia/pases?cliente=${c.id}`}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
                >
                  <span className="font-semibold text-n-900">{c.nombre}</span>
                  <span className="tabular-nums text-n-600">{formatearTelefono(c.telefono)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
