"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  COOKIE_CONSENTIMIENTO,
  COOKIES_DECLARADAS,
  EVENTO_ABRIR_PREFERENCIAS,
  EVENTO_CONSENTIMIENTO,
  MESES_VIGENCIA,
  SEGUNDOS_VIGENCIA,
  leerConsentimiento,
  serializarConsentimiento,
  type Consentimiento,
} from "@/lib/peludesk/cookies";
import { Medicion } from "./medicion";

/**
 * El aviso de cookies de peludesk.mx (solo ahí: lo monta src/app/peludesk/layout.tsx).
 *
 *  · «Aceptar» y «Rechazar» son el mismo botón en tamaño, color y lugar.
 *  · «Configurar» abre un diálogo nativo (<dialog>: el fondo queda inerte,
 *    Escape cierra, el foco no se escapa) con una categoría por interruptor;
 *    las necesarias van prendidas y fijas.
 *  · La elección dura 6 meses (cookie propia) y se cambia o se revoca desde
 *    «Preferencias de cookies» en el pie (evento EVENTO_ABRIR_PREFERENCIAS).
 *  · Cada cambio se anuncia con el evento `peludesk:consentimiento`, y
 *    `window.PeluDeskConsentimiento` deja leer el estado.
 */
const BOTON =
  "inline-flex min-h-12 flex-1 items-center justify-center rounded-full border-2 border-morado bg-morado px-5 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave";

declare global {
  interface Window {
    PeluDeskConsentimiento?: { obtener: () => Consentimiento; abrirPreferencias: () => void };
  }
}

function escribirCookie(c: Pick<Consentimiento, "analitica" | "marketing">) {
  const seguro = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_CONSENTIMIENTO}=${serializarConsentimiento(c)}; Max-Age=${SEGUNDOS_VIGENCIA}; Path=/; SameSite=Lax${seguro}`;
}

function leerCookieActual(): Consentimiento {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_CONSENTIMIENTO}=([^;]*)`));
  return leerConsentimiento(m?.[1]);
}

function Interruptor({
  id,
  titulo,
  texto,
  marcado,
  fijo,
  alCambiar,
}: {
  id: string;
  titulo: string;
  texto: string;
  marcado: boolean;
  fijo?: boolean;
  alCambiar?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-n-200 bg-white p-4">
      <div>
        <label htmlFor={id} className="text-base font-bold text-n-900">{titulo}</label>
        <p id={`${id}-d`} className="mt-1 text-sm leading-relaxed text-n-700">{texto}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={marcado}
        disabled={fijo}
        aria-describedby={`${id}-d`}
        onChange={(e) => alCambiar?.(e.target.checked)}
        className="mt-1 h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-borde bg-n-200 transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:translate-y-[1px] before:rounded-full before:bg-white before:shadow before:transition-transform checked:border-morado checked:bg-morado checked:before:translate-x-[22px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  );
}

export function ConsentimientoCookies({ inicial, pixelId, googleAdsId = null }: { inicial: Consentimiento; pixelId: string | null; googleAdsId?: string | null }) {
  const [estado, setEstado] = useState<Consentimiento>(inicial);
  const [configurando, setConfigurando] = useState(false);
  const [analitica, setAnalitica] = useState(inicial.analitica);
  const [marketing, setMarketing] = useState(inicial.marketing);
  const dialogo = useRef<HTMLDialogElement>(null);
  const origen = useRef<Element | null>(null);

  const decidir = useCallback((a: boolean, m: boolean) => {
    escribirCookie({ analitica: a, marketing: m });
    const nuevo: Consentimiento = { decidido: true, analitica: a, marketing: m };
    setEstado(nuevo);
    setAnalitica(a);
    setMarketing(m);
    setConfigurando(false);
    window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMIENTO, { detail: nuevo }));
  }, []);

  const abrir = useCallback(() => {
    origen.current = document.activeElement;
    // Al reabrir, los interruptores parten de lo que hay guardado.
    const actual = leerCookieActual();
    setAnalitica(actual.analitica);
    setMarketing(actual.marketing);
    setConfigurando(true);
  }, []);

  useEffect(() => {
    window.PeluDeskConsentimiento = { obtener: leerCookieActual, abrirPreferencias: abrir };
    window.addEventListener(EVENTO_ABRIR_PREFERENCIAS, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_PREFERENCIAS, abrir);
  }, [abrir]);

  // El diálogo nativo se abre y se cierra con el estado.
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (configurando && !d.open) d.showModal();
    if (!configurando && d.open) {
      d.close();
      if (origen.current instanceof HTMLElement) origen.current.focus();
    }
  }, [configurando]);

  return (
    <>
      <Medicion consentimiento={estado} pixelId={pixelId} googleAdsId={googleAdsId} />

      {/* Una sola línea: lo que se pide y los dos botones iguales; «Configurar» abre el detalle. */}
      {!estado.decidido && !configurando && (
        <section aria-label="Aviso de cookies" data-fijo-inferior className="fixed inset-x-0 bottom-0 z-[60] border-t border-n-200 bg-white/95 shadow-[0_-8px_32px_rgb(75_63_114/0.14)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-5 sm:px-6">
            <p className="flex-1 text-sm leading-snug text-n-800">
              Usamos una cookie necesaria y, solo si aceptas, analítica y publicidad.{" "}
              <button type="button" onClick={abrir} className="-my-2 inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-morado underline underline-offset-2 hover:bg-morado-suave focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">Configurar</button>
              {" · "}
              <Link href="/cookies" className="font-semibold text-morado underline underline-offset-2">Más información</Link>
            </p>
            <div className="flex gap-2 sm:w-auto">
              <button type="button" className={`${BOTON} sm:min-h-11 sm:w-36 sm:flex-none sm:px-0 sm:text-sm`} onClick={() => decidir(false, false)}>
                Rechazar
              </button>
              <button type="button" className={`${BOTON} sm:min-h-11 sm:w-36 sm:flex-none sm:px-0 sm:text-sm`} onClick={() => decidir(true, true)}>
                Aceptar
              </button>
            </div>
          </div>
        </section>
      )}

      <dialog
        ref={dialogo}
        aria-labelledby="pd-cookies-titulo"
        onClose={() => setConfigurando(false)}
        className="m-auto max-h-[92dvh] w-[min(40rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-n-200 bg-crema p-0 text-n-900 shadow-[0_20px_60px_rgb(43_42_51/0.35)] backdrop:bg-grafito/50"
      >
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <h2 id="pd-cookies-titulo" className="text-xl font-bold">
              Preferencias de cookies
            </h2>
            <button
              type="button"
              aria-label="Cerrar sin cambiar nada"
              onClick={() => setConfigurando(false)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-2xl leading-none text-n-700 hover:bg-morado-suave focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
            >
              <span aria-hidden>×</span>
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-n-700">
            Escoge qué categorías permites en peludesk.mx. Tu elección se guarda {MESES_VIGENCIA} meses y puedes cambiarla o
            revocarla cuando quieras.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <Interruptor
              id="pd-ck-nec"
              titulo="Necesarias (siempre activas)"
              texto="Recuerdan esta misma elección y mantienen la sesión de quien administra la plataforma. Sin ellas el sitio no funciona; no miden ni rastrean."
              marcado
              fijo
            />
            <Interruptor
              id="pd-ck-ana"
              titulo="Analítica"
              texto="Cuenta las visitas por página, de dónde llegas, tu país y tu tipo de dispositivo, de forma agregada, para saber qué páginas sirven. No guarda cookies en tu navegador."
              marcado={analitica}
              alCambiar={setAnalitica}
            />
            <Interruptor
              id="pd-ck-mkt"
              titulo="Marketing"
              texto="El píxel de Meta y, cuando exista la cuenta, el tag de Google Ads miden si un anuncio de PeluDesk terminó en un registro. Envían qué página viste y si abriste el demo, dejaste tu WhatsApp en una herramienta o creaste tu negocio de prueba."
              marcado={marketing}
              alCambiar={setMarketing}
            />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" className={BOTON} onClick={() => decidir(false, false)}>
              Rechazar todo
            </button>
            <button type="button" className={BOTON} onClick={() => decidir(analitica, marketing)}>
              Guardar mi elección
            </button>
            <button type="button" className={BOTON} onClick={() => decidir(true, true)}>
              Aceptar todo
            </button>
          </div>
          <p className="mt-4 text-sm text-n-600">
            Qué guarda cada una, cuánto dura y para qué, en la{" "}
            <Link href="/cookies" className="font-semibold text-morado underline underline-offset-2" onClick={() => setConfigurando(false)}>
              política de cookies
            </Link>{" "}
            ({COOKIES_DECLARADAS.length} elementos declarados).
          </p>
        </div>
      </dialog>
    </>
  );
}
