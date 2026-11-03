"use client";

import { useRef, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { valorDelCampo } from "@/lib/ui/campo-vivo";
import { cambiarVisibilidadResena, responderResena } from "./actions";

export type FilaResena = {
  id: string;
  estrellas: number;
  texto: string | null;
  respuesta: string | null;
  respondida_at: string | null;
  publicada: boolean;
  cuando: string;
  quien: string;
  perro: string | null;
  origen: string;
};

/** Una reseña: lo que escribió el dueño (no se edita), contestar y esconder o mostrar. */
export function ResenaFila({ r, puedeEditar }: { r: FilaResena; puedeEditar: boolean }) {
  const [respuesta, setRespuesta] = useState(r.respuesta ?? "");
  const [guardada, setGuardada] = useState(r.respuesta);
  const [publicada, setPublicada] = useState(r.publicada);
  const [contestando, setContestando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const envio = useEspera();
  const visible = useEspera();
  const campo = useRef<HTMLTextAreaElement>(null);

  async function guardar() {
    setError(null);
    setExito(null);
    const texto = valorDelCampo(campo, respuesta);
    const res = await envio.ejecutar(() => responderResena(r.id, texto));
    if (res.error) return setError(res.error);
    setGuardada(texto.trim() || null);
    setContestando(false);
    setExito(res.exito ?? null);
  }

  async function alternar() {
    setError(null);
    setExito(null);
    const res = await visible.ejecutar(() => cambiarVisibilidadResena(r.id, !publicada));
    if (res.error) return setError(res.error);
    setPublicada(!publicada);
    setExito(res.exito ?? null);
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border p-4 last:border-b-0" data-resena={r.id} data-publicada={publicada ? "si" : "no"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-lg tracking-wide text-ambar-oscuro" aria-label={`${r.estrellas} de 5 estrellas`}>
          {"★".repeat(r.estrellas)}
          <span className="text-n-300">{"★".repeat(5 - r.estrellas)}</span>
        </span>
        <span className="text-sm font-semibold text-n-900">{r.quien}</span>
        <span className="text-sm text-n-600">{[r.perro, r.origen, r.cuando].filter(Boolean).join(" · ")}</span>
        {!publicada && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-800" data-escondida>Escondida</span>}
      </div>
      {r.texto ? <p className="text-n-800">{r.texto}</p> : <p className="text-sm text-n-600">Sin comentario, solo las estrellas.</p>}
      {guardada && !contestando && (
        <p className="rounded-md bg-muted p-3 text-sm text-n-800" data-respuesta>
          <span className="font-semibold text-n-900">Tu respuesta:</span> {guardada}
        </p>
      )}
      {puedeEditar && (contestando ? (
        <div className="flex flex-col gap-2">
          <Textarea ref={campo} label="Respuesta del negocio" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} maxLength={500} ayuda="Se ve junto a la reseña en la página del negocio y en la app. Hasta 500 caracteres." />
          <AccionesFormulario error={error} exito={exito}>
            <Button type="button" cargando={envio.cargando} onClick={() => guardar()} data-guardar-respuesta>
              Guardar respuesta
            </Button>
            <Button type="button" variante="secundario" onClick={() => { setContestando(false); setRespuesta(guardada ?? ""); }}>
              Dejarla como estaba
            </Button>
          </AccionesFormulario>
        </div>
      ) : (
        <AccionesFormulario error={error} exito={exito}>
          <Button type="button" variante="secundario" tamano="compacto" onClick={() => { setContestando(true); setExito(null); }} data-contestar>
            {guardada ? "Cambiar respuesta" : "Contestar"}
          </Button>
          <Button type="button" variante="secundario" tamano="compacto" cargando={visible.cargando} onClick={() => alternar()} data-alternar-visible>
            {publicada ? "Esconder de la página" : "Mostrar en la página"}
          </Button>
        </AccionesFormulario>
      ))}
    </li>
  );
}
