"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { PERMISOS } from "@/lib/auth/permisos";
import { cambiarPermiso } from "./permisos-actions";

// Los ocho permisos de una persona, como casillas. Cada cambio se guarda
// al momento (y queda en la bitácora con quién y cuándo).
export function CasillasPermisos({ profileId, activos }: { profileId: string; activos: string[] }) {
  const router = useRouter();
  const guardando = useEspera();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // La casilla cambia al instante y se regresa si la base lo rechaza.
  const [marcados, setMarcados] = useState<string[]>(activos);

  async function alternar(clave: string, activar: boolean) {
    setError(null);
    setEnCurso(clave);
    const antes = marcados;
    setMarcados(activar ? [...marcados, clave] : marcados.filter((c) => c !== clave));
    const res = await guardando.ejecutar(() => cambiarPermiso(profileId, clave, activar));
    setEnCurso(null);
    if (res.error) {
      setMarcados(antes);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="grid gap-3 md:grid-cols-2">
        {PERMISOS.map((p) => {
          const activo = marcados.includes(p.clave);
          const cargando = guardando.cargando && enCurso === p.clave;
          return (
            <li key={p.clave}>
              <label
                className={`flex h-full items-start gap-3 rounded-md border-[1.5px] p-3 ${
                  activo ? "border-morado bg-morado-suave" : "border-n-200 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={activo}
                  disabled={guardando.cargando}
                  onChange={(e) => alternar(p.clave, e.target.checked)}
                />
                <span>
                  <span className="font-semibold text-n-900">
                    {p.etiqueta}
                    {cargando && <span className="ml-2 text-xs font-normal text-n-500">Guardando…</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-n-600">{p.implica}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-coral bg-coral-suave px-3 py-2 text-sm font-semibold text-coral-oscuro">
          {error}
        </p>
      )}
    </div>
  );
}
