"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Select } from "@/components/ui/select";
import { Antiguedad } from "@/components/ui/antiguedad";
import { asignarGrupoDePropuesta, asignarGrupoDeRaza } from "../grupos-actions";

export type RazaSinGrupo = { id: string; nombre: string; perros: number; tamano: string | null; pelaje: string | null; dias: number; notas?: string | null };

export function GruposDeRaza({
  razas,
  grupos,
  puedeAsignar,
  propuestas = false,
}: {
  // propuestas: son razas propuestas que PeluDesk todavía no aprueba.
  propuestas?: boolean;
  razas: RazaSinGrupo[];
  grupos: { id: string; nombre: string; depende_tamano: boolean }[];
  puedeAsignar: boolean;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [elegido, setElegido] = useState<Record<string, string>>({});
  const [activo, setActivo] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Record<string, { error?: string | null; exito?: string }>>({});

  async function guardar(razaId: string) {
    setActivo(razaId);
    const res = await envio.ejecutar(() => (propuestas ? asignarGrupoDePropuesta : asignarGrupoDeRaza)(razaId, elegido[razaId]));
    setMensajes((m) => ({ ...m, [razaId]: res }));
    if (!res.error) router.refresh();
  }

  return (
    <ul className="flex flex-col gap-3">
      {razas.map((r) => (
        <li key={r.id} className="rounded-lg border border-n-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-lg font-bold text-n-900">{r.nombre}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-n-700">{r.perros === 1 ? "1 perro" : `${r.perros} perros`}</span>
              <Antiguedad
                dias={r.dias}
                texto={
                  propuestas
                    ? r.dias === 0 ? "Propuesta desde hoy" : `Propuesta desde hace ${r.dias} día(s)`
                    : r.dias === 0 ? "En el catálogo desde hoy" : `En el catálogo desde hace ${r.dias} día(s)`
                }
              />
            </div>
          </div>
          {r.notas && <p className="mt-1 text-sm text-n-700">{r.notas}</p>}
          {(r.tamano || r.pelaje) && (
            <p className="mt-1 text-sm text-n-600">
              Según el catálogo: {[r.tamano && `talla ${r.tamano.toLowerCase()}`, r.pelaje && `pelo ${r.pelaje.toLowerCase()}`].filter(Boolean).join(", ")}. Es solo una guía: el grupo lo decides tú.
            </p>
          )}
          {puedeAsignar && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1">
                <Select label="Grupo de precio" value={elegido[r.id] ?? ""} onChange={(e) => setElegido((x) => ({ ...x, [r.id]: e.target.value }))}>
                  <option value="">Elige un grupo</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre}{g.depende_tamano ? " (cobra por talla)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <AccionesFormulario error={mensajes[r.id]?.error} exito={mensajes[r.id]?.exito}>
                <Button type="button" disabled={!elegido[r.id]} cargando={envio.cargando && activo === r.id} onClick={() => guardar(r.id)}>
                  Guardar grupo
                </Button>
              </AccionesFormulario>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
