"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { cambiarModulo, impactoDeApagar, type ImpactoModulo } from "./actions";

export type FilaModulo = {
  clave: string;
  nombre: string;
  descripcion: string;
  requiere: string[];
  disponible: boolean;
  encendido: boolean;
  activo: boolean;
  cortesia: boolean;
  planes: string[];
};

function Modulo({ m, todos }: { m: FilaModulo; todos: FilaModulo[] }) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<ImpactoModulo | null>(null);
  const falta = m.requiere.map((r) => todos.find((t) => t.clave === r)).filter((t): t is FilaModulo => Boolean(t && !t.activo));

  async function cambiar(activo: boolean) {
    setError(null);
    const res = await envio.ejecutar(() => cambiarModulo(m.clave, activo));
    if (res.error) return setError(res.error);
    setAviso(null);
    router.refresh();
  }
  async function pedirApagar() {
    setError(null);
    const res = await envio.ejecutar(() => impactoDeApagar(m.clave));
    if (res.error) return setError(res.error);
    if (res.impacto && res.impacto.pendientes > 0) return setAviso(res.impacto);
    await cambiar(false);
  }

  return (
    <li className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-n-900">
            {m.nombre}
            {m.cortesia && <span className="ml-2 rounded-full bg-menta-suave px-2 py-0.5 text-xs font-semibold text-menta-oscuro">Cortesía</span>}
          </h2>
          <p className="mt-0.5 text-sm text-n-700">{m.descripcion}</p>
          {!m.disponible && (
            <p className="mt-1 text-sm font-medium text-n-600">
              {m.planes.length ? `Lo incluye el plan ${m.planes.join(" o ")}.` : "Es un complemento que se contrata aparte."}
            </p>
          )}
          {m.disponible && m.encendido && falta.length > 0 && (
            <p className="mt-1 text-sm font-medium text-ambar-oscuro">Necesita {falta.map((f) => f.nombre).join(" y ")} prendido.</p>
          )}
        </div>
        {m.disponible ? (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${m.activo ? "bg-menta-suave text-menta-oscuro" : "bg-n-100 text-n-700"}`}>
            {m.activo ? "Prendido" : "Apagado"}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-n-100 px-2.5 py-1 text-sm font-semibold text-n-600">Fuera de tu plan</span>
        )}
      </div>
      {m.disponible && (
        <AccionesFormulario error={error}>
          {aviso ? (
            <>
              <p className="w-full text-sm text-n-800">
                Hay <strong>{aviso.pendientes}</strong> {aviso.que}. Al apagarlo se esconden, pero no se borran: siguen ahí si lo vuelves a prender.
              </p>
              <Button type="button" variante="peligro" cargando={envio.cargando} onClick={() => cambiar(false)}>
                Apagar de todos modos
              </Button>
              <Button type="button" variante="secundario" onClick={() => setAviso(null)}>
                Cancelar
              </Button>
            </>
          ) : m.encendido ? (
            <Button type="button" variante="secundario" cargando={envio.cargando} onClick={pedirApagar}>
              Apagar
            </Button>
          ) : (
            <Button type="button" cargando={envio.cargando} onClick={() => cambiar(true)}>
              Prender
            </Button>
          )}
        </AccionesFormulario>
      )}
    </li>
  );
}

export function ListaModulos({ modulos }: { modulos: FilaModulo[] }) {
  return (
    <ul className="flex flex-col divide-y divide-n-200 rounded-xl border border-n-200 bg-white">
      {modulos.map((m) => (
        <Modulo key={m.clave} m={m} todos={modulos} />
      ))}
    </ul>
  );
}
