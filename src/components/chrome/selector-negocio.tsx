"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { irANegocio } from "@/lib/negocio/ir-a-negocio";

export type NegocioDelSelector = {
  id: string;
  nombre: string;
  grupoId: string;
  grupoNombre: string;
  esPrincipal: boolean;
  actual: boolean;
};

/** Agrupa por dueño: la primera sucursal y sus sucursales juntas, en ese orden. */
export function agruparNegocios(negocios: NegocioDelSelector[]): { id: string; nombre: string; negocios: NegocioDelSelector[] }[] {
  const grupos = new Map<string, { id: string; nombre: string; negocios: NegocioDelSelector[] }>();
  for (const n of negocios) {
    const g = grupos.get(n.grupoId) ?? { id: n.grupoId, nombre: n.grupoNombre, negocios: [] };
    g.negocios.push(n);
    grupos.set(n.grupoId, g);
  }
  for (const g of grupos.values()) g.negocios.sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal) || a.nombre.localeCompare(b.nombre, "es"));
  return [...grupos.values()];
}

// «Tus negocios» en el menú del personal: solo sale si la persona trabaja en más de uno. Las sucursales del
// mismo dueño salen juntas, bajo el nombre de la primera.
export function SelectorNegocio({ negocios, className = "" }: { negocios: NegocioDelSelector[]; className?: string }) {
  const envio = useEspera();
  const [cual, setCual] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (negocios.length < 2) return null;

  async function ir(id: string) {
    setError(null);
    setCual(id);
    const res = await envio.ejecutar(() => irANegocio(id));
    if (res.error || !res.url) {
      setCual(null);
      return setError(res.error ?? "No pudimos abrir ese negocio.");
    }
    window.location.assign(res.url);
  }

  return (
    <section aria-label="Tus negocios" data-selector-negocio className={`rounded-lg border border-n-200 p-2 ${className}`}>
      <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-n-500">Tus negocios</p>
      {agruparNegocios(negocios).map((g) => (
        <div key={g.id} data-grupo-negocio={g.id} className="mt-1">
          {g.negocios.length > 1 && <p className="px-2 pt-1 text-xs font-semibold text-n-600">{g.nombre} y sus sucursales</p>}
          <ul className="flex flex-col">
            {g.negocios.map((n) => (
              <li key={n.id}>
                {n.actual ? (
                  <span aria-current="true" className={`flex min-h-11 items-center rounded-md bg-morado-suave px-2 text-sm font-semibold text-morado ${g.negocios.length > 1 ? "pl-4" : ""}`}>
                    {n.nombre} <span className="ml-auto text-xs font-medium">Aquí estás</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => ir(n.id)}
                    disabled={envio.cargando}
                    data-ir-negocio={n.id}
                    className={`flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm font-semibold text-n-800 hover:bg-n-100 disabled:opacity-60 ${g.negocios.length > 1 ? "pl-4" : ""}`}
                  >
                    {n.nombre}
                    {envio.cargando && cual === n.id && <span className="ml-auto text-xs font-medium text-n-600">Abriendo…</span>}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {error && <p role="alert" className="px-2 pt-1 text-sm text-coral-oscuro">{error}</p>}
    </section>
  );
}
