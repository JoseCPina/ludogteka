"use client";

import { useEffect, useRef, useState } from "react";
import { Mascota, type TipoMascota } from "./mascotas";
import { useReducido } from "./usar";

// Frases cortas del equipo de Ludogteka. Sin cifras ni superlativos. Las tres
// primeras las dio el negocio; las otras tres se redactaron en el mismo tono
// sobre lo que de verdad usan (agenda, caja, recordatorios por WhatsApp):
// confirmarlas con el equipo antes de cambiarlas de lugar o de citarlas fuera
// de esta página.
const FRASES: { texto: string; mascota: TipoMascota }[] = [
  { texto: "Nos hizo la vida mucho más fácil.", mascota: "recepcion" },
  { texto: "Es muy práctico.", mascota: "estetica" },
  { texto: "Tenemos mejor control.", mascota: "hotel" },
  { texto: "La agenda ya no se nos empalma.", mascota: "estetica" },
  { texto: "Con la caja sabemos cómo cerró el día.", mascota: "recepcion" },
  { texto: "Mandar el recordatorio por WhatsApp es un solo toque.", mascota: "veterinaria" },
];

const INSTAGRAM = "https://www.instagram.com/ludogteka/";
const MENSAJE = "https://ig.me/m/ludogteka";

export function FrasesLudogteka() {
  const caja = useRef<HTMLUListElement>(null);
  const reducido = useReducido();
  const [vistas, setVistas] = useState(0);
  const [en, setEn] = useState(false);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setEn(true);
        obs.disconnect();
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Las tarjetas aparecen una por una, cada 420 ms.
  useEffect(() => {
    if (!en || reducido) return;
    const ids = FRASES.map((_, i) => window.setTimeout(() => setVistas(i + 1), i * 420));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [en, reducido]);

  const mostradas = reducido ? FRASES.length : vistas;
  return (
    <ul ref={caja} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FRASES.map((f, i) => (
        <li key={f.texto} className="min-h-[104px] sm:min-h-[148px]">
          {i < mostradas && (
            <figure className="pd-pop flex h-full items-start gap-3 rounded-[22px] border border-n-200 bg-white p-5">
              <Mascota tipo={f.mascota} tamano={56} retraso={i * 0.5} />
              <div>
                <blockquote className="text-lg font-semibold leading-snug text-n-900">«{f.texto}»</blockquote>
                <figcaption className="mt-2 text-sm text-n-600">Equipo Ludogteka</figcaption>
              </div>
            </figure>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Botón «Pregúntales» + modal accesible (dialog nativo: foco atrapado, Esc y clic afuera). */
export function PreguntalesModal() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    const alCerrar = () => {
      setAbierto(false);
      document.documentElement.classList.remove("pd-sin-scroll");
    };
    d.addEventListener("close", alCerrar);
    return () => d.removeEventListener("close", alCerrar);
  }, []);

  function abrir() {
    dialogo.current?.showModal();
    document.documentElement.classList.add("pd-sin-scroll");
    setAbierto(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="pd-boton inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border-2 border-morado/25 bg-white px-6 text-base font-semibold text-morado hover:border-morado/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
      >
        Pregúntales
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby="t-ludogteka-modal"
        onClick={(e) => {
          // Un clic en el fondo (el propio <dialog>, no su contenido) cierra.
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
        className="pd-modal m-auto w-[min(92vw,26rem)] rounded-[24px] border border-n-200 bg-white p-0 text-n-900 shadow-2xl"
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="t-ludogteka-modal" className="text-2xl font-bold tracking-[-0.02em]">
                Ludogteka
              </h3>
              <p className="mt-0.5 font-semibold text-morado">@ludogteka</p>
            </div>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              aria-label="Cerrar"
              className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-n-700 hover:bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
            >
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
          <p className="mt-4 leading-relaxed text-n-700">Escríbeles por Instagram y pregúntales cómo les va con PeluDesk.</p>
          <div className="mt-6 grid gap-3">
            <a
              href={INSTAGRAM}
              target="_blank"
              rel="noopener noreferrer"
              className="pd-boton pd-boton-primario inline-flex min-h-12 items-center justify-center rounded-full bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
            >
              Ver su Instagram
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
            <a
              href={MENSAJE}
              target="_blank"
              rel="noopener noreferrer"
              className="pd-boton inline-flex min-h-12 items-center justify-center rounded-full border-2 border-morado/25 bg-white px-6 text-base font-semibold text-morado hover:border-morado/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
            >
              Mandarles mensaje
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
