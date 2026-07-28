"use client";

import { useMemo, useState } from "react";
import { Field } from "@/components/ui/field";
import { ChipRol } from "@/components/ui/chip-rol";
import { formatearFecha } from "@/lib/formato";

export type Cuenta = {
  id: string;
  email: string;
  rol: string;
  cliente_id: string | null;
  creado_en: string;
};

export function ListaCuentas({ cuentas }: { cuentas: Cuenta[] }) {
  const [busqueda, setBusqueda] = useState("");

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cuentas;
    return cuentas.filter(
      (c) => c.email.toLowerCase().includes(q) || c.rol.toLowerCase().includes(q)
    );
  }, [cuentas, busqueda]);

  if (cuentas.length === 0) {
    return (
      <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-10 text-center">
        <h3 className="text-lg font-bold text-n-900">Aún no hay cuentas</h3>
        <p className="mt-1 text-n-600">En cuanto invites a alguien, va a aparecer aquí.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">
        <Field
          label="Buscar por correo o rol"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="ej. recepcion@..."
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Correo
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Rol
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Vinculada
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Alta
              </th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((cuenta) => (
              <tr key={cuenta.id} className="hover:bg-n-50">
                <td className="border-b border-n-200 px-4 py-3 text-n-900">{cuenta.email}</td>
                <td className="border-b border-n-200 px-4 py-3">
                  <ChipRol rol={cuenta.rol} />
                </td>
                <td className="border-b border-n-200 px-4 py-3">
                  {cuenta.rol === "cliente" ? (
                    cuenta.cliente_id ? (
                      <span className="font-semibold text-verde-oscuro">Sí</span>
                    ) : (
                      <span className="font-semibold text-amarillo-oscuro">No</span>
                    )
                  ) : (
                    <span className="text-n-400">—</span>
                  )}
                </td>
                <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-600">
                  {formatearFecha(cuenta.creado_en)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtradas.length === 0 && (
          <p className="p-6 text-center text-n-600">
            Ninguna cuenta coincide con &quot;{busqueda}&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
