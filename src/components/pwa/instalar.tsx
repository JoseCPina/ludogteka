"use client";

import { useState, useSyncExternalStore } from "react";

// «Instalar la app» (QA N26, 17 de octubre de 2026). Antes era un botón flotante abajo a la izquierda que tapaba
// botones de acción («Crear cliente», «Agendar cita», «Emitir receta») y no se podía cerrar. Ahora:
//   - AvisoInstalar: un aviso EN EL FLUJO de la página (arriba, nunca encima de nada) que se cierra y recuerda que
//     se cerró (en este navegador);
//   - BotonInstalar: «Instalar la app» siempre disponible en el menú;
//   - ninguno sale si la app ya está instalada (se abrió como app o el navegador avisó que se instaló).
// El aviso nativo de Chrome/Android (beforeinstallprompt) se guarda aquí, una sola vez para toda la página.

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const CLAVE_CERRADO = "peludesk_aviso_instalar_cerrado";
let evento: EventoInstalar | null = null;
let instaladaAhora = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    evento = e as EventoInstalar;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    instaladaAhora = true;
    evento = null;
    avisar();
  });
}

function suscribir(f: () => void) {
  oyentes.add(f);
  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener?.("change", f);
  return () => {
    oyentes.delete(f);
    mq?.removeEventListener?.("change", f);
  };
}

export function appInstalada(): boolean {
  if (instaladaAhora) return true;
  try {
    return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone);
  } catch {
    return false;
  }
}

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

type Estado = "instalada" | "nativo" | "ios" | "manual";
// El estado como texto (useSyncExternalStore compara por valor).
function leerEstado(): Estado {
  if (appInstalada()) return "instalada";
  if (evento) return "nativo";
  return esIOS() ? "ios" : "manual";
}

export function useInstalar() {
  const estado = useSyncExternalStore(suscribir, leerEstado, () => "instalada" as Estado);
  const instalar = async (): Promise<"listo" | "instrucciones"> => {
    const ev = evento;
    if (!ev || typeof ev.prompt !== "function") return "instrucciones";
    evento = null;
    avisar();
    await ev.prompt();
    await ev.userChoice.catch(() => null);
    return "listo";
  };
  return { estado, instalar };
}

const INSTRUCCIONES: Record<"ios" | "manual", string> = {
  ios: "En el iPhone: toca el botón de compartir de Safari y luego «Agregar a inicio».",
  manual: "Abre el menú del navegador (⋮) y elige «Instalar app» o «Agregar a la pantalla principal».",
};

function leerCerrado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_CERRADO) === "1";
  } catch {
    return false;
  }
}

/** El aviso de arriba: solo cuando el navegador ofrece instalar (o en iPhone), una vez, y se cierra. */
export function AvisoInstalar() {
  const { estado, instalar } = useInstalar();
  const cerradoGuardado = useSyncExternalStore(suscribir, leerCerrado, () => true);
  const [cerrado, setCerrado] = useState(false);
  const [ayuda, setAyuda] = useState<string | null>(null);
  if (estado === "instalada" || estado === "manual" || cerrado || cerradoGuardado) return null;
  const cerrar = () => {
    setCerrado(true);
    try {
      window.localStorage.setItem(CLAVE_CERRADO, "1");
    } catch {
      // sin almacenamiento: se cierra por esta vez
    }
  };
  return (
    <div role="region" aria-label="Instalar la app" data-aviso-instalar className="flex flex-wrap items-center gap-3 border-b border-morado/20 bg-morado-suave/60 px-4 py-2.5 text-sm text-n-800 print:hidden">
      <p className="min-w-0 flex-1">{ayuda ?? "Instala la app en este equipo para abrirla como cualquier otra, con su propio ícono."}</p>
      {!ayuda && (
        <button
          type="button"
          data-instalar-aviso
          onClick={async () => {
            const r = await instalar();
            if (r === "instrucciones") setAyuda(INSTRUCCIONES.ios);
            else cerrar();
          }}
          className="min-h-10 rounded-md bg-morado px-4 font-semibold text-white hover:bg-morado-oscuro"
        >
          Instalar
        </button>
      )}
      <button type="button" data-cerrar-aviso-instalar onClick={cerrar} className="grid h-10 w-10 place-items-center rounded-md text-n-600 hover:bg-white" aria-label="Cerrar el aviso de instalar la app">
        <span aria-hidden className="text-xl leading-none">×</span>
      </button>
    </div>
  );
}

/** «Instalar la app» en el menú: siempre disponible (si no se puede abrir el aviso del navegador, dice cómo). */
export function BotonInstalar({ className = "" }: { className?: string }) {
  const { estado, instalar } = useInstalar();
  const [ayuda, setAyuda] = useState<string | null>(null);
  if (estado === "instalada") return null;
  return (
    <div className={className}>
      <button
        type="button"
        data-instalar-menu
        onClick={async () => {
          const r = await instalar();
          setAyuda(r === "instrucciones" ? INSTRUCCIONES[estado === "ios" ? "ios" : "manual"] : null);
        }}
        className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 font-semibold text-n-700 hover:bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Instalar la app
      </button>
      {ayuda && <p role="status" className="px-3 pt-1 text-sm text-n-600">{ayuda}</p>}
    </div>
  );
}
