"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { crearArea, moverArea, quitarArea, renombrarArea } from "./areas-actions";

type AreaFila = { id: string; nombre: string; consumibles: number; equipos: number };

export function EditorAreas({ areas }: { areas: AreaFila[] }) {
  const router = useRouter();
  const guardando = useEspera();
  const [nueva, setNueva] = useState("");
  const [nombres, setNombres] = useState<Record<string, string>>(Object.fromEntries(areas.map((a) => [a.id, a.nombre])));
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function correr(accion: () => Promise<{ error: string | null }>, mensaje: string) {
    setError(null);
    setExito(null);
    const res = await guardando.ejecutar(accion);
    if (res.error) {
      setError(res.error);
      return false;
    }
    setExito(mensaje);
    router.refresh();
    return true;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <ul className="divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
        {areas.map((a, i) => (
          <li key={a.id} className="flex flex-wrap items-end gap-2 px-4 py-3">
            <div className="min-w-[12rem] flex-1">
              <Field
                label={`${a.consumibles} consumibles · ${a.equipos} de equipo`}
                value={nombres[a.id] ?? ""}
                onChange={(e) => setNombres({ ...nombres, [a.id]: e.target.value })}
                disabled={guardando.cargando}
              />
            </div>
            <Button
              type="button"
              variante="secundario"
              disabled={guardando.cargando || nombres[a.id] === a.nombre}
              onClick={() => correr(() => renombrarArea(a.id, nombres[a.id] ?? ""), "Nombre guardado")}
            >
              Guardar
            </Button>
            <Button type="button" variante="secundario" disabled={guardando.cargando || i === 0} onClick={() => correr(() => moverArea(a.id, -1), "Orden guardado")}>
              ↑
            </Button>
            <Button
              type="button"
              variante="secundario"
              disabled={guardando.cargando || i === areas.length - 1}
              onClick={() => correr(() => moverArea(a.id, 1), "Orden guardado")}
            >
              ↓
            </Button>
            <Button
              type="button"
              variante="secundario"
              disabled={guardando.cargando || a.consumibles + a.equipos > 0}
              onClick={() => correr(() => quitarArea(a.id), "Área quitada")}
            >
              Quitar
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <Field label="Nueva área" value={nueva} onChange={(e) => setNueva(e.target.value)} disabled={guardando.cargando} />
        </div>
        <AccionesFormulario error={error} exito={exito}>
          <Button
            type="button"
            cargando={guardando.cargando}
            disabled={!nueva.trim()}
            onClick={async () => {
              if (await correr(() => crearArea(nueva), "Área agregada")) setNueva("");
            }}
          >
            Agregar área
          </Button>
        </AccionesFormulario>
      </div>
      <p className="text-sm text-n-600">Un área solo se puede quitar cuando ya no tiene consumibles ni equipo.</p>
    </div>
  );
}
