"use client";

import Link from "next/link";
import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { MarkdownAyuda } from "@/lib/ayuda/markdown";
import { diceQueNoSeResolvio } from "@/lib/ayuda/asistente";
import { preguntarAsistente } from "./acciones";

type Mensaje = { quien: "persona" | "asistente"; texto: string; articulos?: { slug: string; titulo: string }[]; video?: { slug: string; titulo: string } | null; sinRespuesta?: boolean };

/**
 * El asistente de Ayuda: contesta con la documentación de los módulos del
 * negocio y cita el artículo. Si no está documentado, o si la persona dice
 * que no se resolvió, ofrece crear un ticket con lo que ya se platicó.
 */
export function Asistente({ pantalla, disponible }: { pantalla: string | null; disponible: boolean }) {
  const envio = useEspera();
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  const ofrecerTicket = mensajes.some((m) => m.sinRespuesta) || mensajes.some((m) => m.quien === "persona" && diceQueNoSeResolvio(m.texto));
  const primeraPregunta = mensajes.find((m) => m.quien === "persona")?.texto ?? "";
  const hrefTicket = `/ayuda/tickets/nuevo?${new URLSearchParams({
    ...(conversacionId ? { conversacion: conversacionId } : {}),
    ...(pantalla ? { desde: pantalla } : {}),
    asunto: (motivo ?? primeraPregunta).slice(0, 140),
    ...(mensajes.some((m) => m.sinRespuesta) ? { sin: "1" } : {}),
  }).toString()}`;

  async function preguntar() {
    const texto = pregunta.trim();
    if (!texto) return setError("Escribe tu pregunta.");
    setError(null);
    setMensajes((prev) => [...prev, { quien: "persona", texto }]);
    setPregunta("");
    const r = await envio.ejecutar(() => preguntarAsistente({ conversacionId, pregunta: texto, pantalla }));
    if (r.error) {
      setError(r.error);
      return;
    }
    setConversacionId(r.conversacionId ?? null);
    if (r.motivo) setMotivo(r.motivo);
    setMensajes((prev) => [...prev, { quien: "asistente", texto: r.texto ?? "", articulos: r.articulos, video: r.video ?? null, sinRespuesta: r.sinRespuesta }]);
  }

  if (!disponible) {
    return <p className="text-sm text-n-600">En el demo el asistente no está disponible: busca en los artículos de abajo.</p>;
  }

  return (
    <div className="flex flex-col gap-3" data-asistente>
      {mensajes.length > 0 && (
        <ol className="flex flex-col gap-3">
          {mensajes.map((m, i) => (
            <li
              key={i}
              data-mensaje={m.quien}
              className={m.quien === "persona" ? "self-end rounded-lg bg-morado-suave px-3 py-2 text-n-900" : "rounded-lg border border-n-200 bg-white p-3"}
            >
              {m.quien === "persona" ? (
                m.texto
              ) : (
                <div className="flex flex-col gap-2">
                  <MarkdownAyuda texto={m.texto} />
                  {m.articulos && m.articulos.length > 0 && (
                    <p className="text-sm text-n-600">
                      Del artículo:{" "}
                      {m.articulos.map((a, j) => (
                        <span key={a.slug}>
                          {j > 0 ? " · " : ""}
                          <Link href={`/ayuda/${a.slug}`} className="font-semibold text-morado underline" data-cita={a.slug}>
                            {a.titulo}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}
                  {m.video && (
                    <p className="text-sm text-n-600">
                      Míralo en video:{" "}
                      <Link href={`/ayuda/videos/${m.video.slug}`} className="font-semibold text-morado underline" data-cita-video={m.video.slug}>
                        ▶ {m.video.titulo}
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <Textarea
        label={mensajes.length ? "¿Algo más, o no se resolvió?" : "Pregúntale al asistente"}
        value={pregunta}
        onChange={(e) => setPregunta(e.target.value)}
        placeholder="ej. ¿Cómo hago el corte de caja?"
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void preguntar();
          }
        }}
      />
      <AccionesFormulario error={error}>
        <Button type="button" cargando={envio.cargando} onClick={preguntar}>
          {envio.cargando ? "Buscando en la ayuda…" : "Preguntar"}
        </Button>
        {(ofrecerTicket || mensajes.length > 0) && (
          <Link href={hrefTicket}>
            <Button type="button" variante={ofrecerTicket ? "primario" : "secundario"} data-ofrecer-ticket={ofrecerTicket ? "si" : "no"}>
              {ofrecerTicket ? "Crear ticket con lo que platicamos" : "No se resolvió: crear ticket"}
            </Button>
          </Link>
        )}
      </AccionesFormulario>
      <p className="text-xs text-n-500">El asistente solo contesta con la documentación de PeluDesk; no ve los datos de tu negocio.</p>
    </div>
  );
}
