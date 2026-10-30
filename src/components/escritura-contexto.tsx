"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { alcancesDeFormulario, esControlDeEscritura, type BloqueoEscritura } from "@/lib/cobro/bloqueo-escritura";
import { mensajeSiSoloLectura } from "@/lib/ui/solo-lectura-actions";
import { conTope } from "@/lib/ui/espera";

// QA N151: con el negocio en solo lectura por prueba vencida o falta de pago, todo botón, enlace y campo que escribe
// se ve deshabilitado y al tocarlo dice por qué (src/lib/cobro/bloqueo-escritura.ts). Lo provee el layout del
// personal con `bloqueoDeEscritura()`; ninguna pantalla lo decide por su cuenta. Al contratar, la siguiente
// respuesta del servidor ya no trae bloqueo y todo se habilita: la pantalla vuelve a preguntar al regresar a la
// pestaña y al tocar algo bloqueado, y se repinta sola si ya se puede.
const ContextoEscritura = createContext<BloqueoEscritura | null>(null);

/** El bloqueo vigente (null: se puede escribir). Para un componente que quiera decirlo con sus palabras. */
export function useBloqueoEscritura(): BloqueoEscritura | null {
  return useContext(ContextoEscritura);
}

/** Lo de adentro solo si el negocio deja escribir; si no, `sino`. */
export function SiPuedeEscribir({ children, sino = null }: { children: ReactNode; sino?: ReactNode }) {
  return <>{useBloqueoEscritura() ? sino : children}</>;
}

const SELECTOR = "a[href], button, [role=button], input, select, textarea";
// Teclas que solo mueven el foco o la página.
const TECLAS_LIBRES = new Set(["Tab", "Escape", "Shift", "Alt", "Control", "Meta", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

function marcar(raiz: HTMLElement, ruta: string) {
  const alcances = alcancesDeFormulario(raiz);
  for (const el of raiz.querySelectorAll<HTMLElement>(SELECTOR)) {
    const bloquear = esControlDeEscritura(el, ruta, alcances);
    if (bloquear && !el.hasAttribute("data-bloqueado")) {
      el.setAttribute("data-bloqueado", "");
      el.setAttribute("aria-disabled", "true");
      if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && !(el as HTMLInputElement).readOnly) {
        (el as HTMLInputElement).readOnly = true;
        el.setAttribute("data-bloqueado-ro", "");
      }
    } else if (!bloquear && el.hasAttribute("data-bloqueado")) {
      desmarcar(el);
    }
  }
}

function desmarcar(el: HTMLElement) {
  el.removeAttribute("data-bloqueado");
  el.removeAttribute("aria-disabled");
  if (el.hasAttribute("data-bloqueado-ro")) {
    (el as HTMLInputElement).readOnly = false;
    el.removeAttribute("data-bloqueado-ro");
  }
}

export function ProveedorEscritura({ bloqueo, children }: { bloqueo: BloqueoEscritura | null; children: ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  const [aviso, setAviso] = useState(false);
  const tope = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preguntando = useRef(false);

  // ¿Ya se puede? (contrató en otra pestaña, el pago entró). Si sí, se repinta con lo que diga el servidor.
  const revisar = useCallback(async () => {
    if (preguntando.current) return;
    preguntando.current = true;
    try {
      if ((await conTope(mensajeSiSoloLectura(), 8000)) === null) {
        setAviso(false);
        router.refresh();
      }
    } catch {
      // Sin red: se queda bloqueado; la base es la que manda de todos modos.
    } finally {
      preguntando.current = false;
    }
  }, [router]);

  const avisar = useCallback(() => {
    setAviso(true);
    if (tope.current) clearTimeout(tope.current);
    tope.current = setTimeout(() => setAviso(false), 7000);
    void revisar();
  }, [revisar]);

  // Marca lo que escribe en cuanto se pinta (antes de que alguien alcance a teclear) y cada vez que la pantalla cambia.
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    if (!bloqueo) {
      for (const m of el.querySelectorAll<HTMLElement>("[data-bloqueado]")) desmarcar(m);
      return;
    }
    marcar(el, ruta);
    let pendiente = 0;
    const obs = new MutationObserver(() => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        marcar(el, ruta);
      });
    });
    obs.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["href", "type", "data-escritura", "data-acciones-formulario"], characterData: true });
    return () => {
      obs.disconnect();
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, [bloqueo, ruta]);

  // Lo bloqueado no hace nada: ni clic, ni tecla, ni pegar, ni enviar el formulario. Se escucha en captura sobre el
  // contenedor: React despacha sus onClick/onSubmit en la raíz, así que no llegan.
  useEffect(() => {
    const el = raiz.current;
    if (!el || !bloqueo) return;
    const bloqueado = (t: EventTarget | null) => (t instanceof Element ? t.closest("[data-bloqueado]") : null);
    const alTocar = (e: Event) => {
      if (!bloqueado(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "click") avisar();
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (!bloqueado(e.target) || TECLAS_LIBRES.has(e.key) || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      avisar();
    };
    const alEnviar = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (form.closest("[data-sin-bloqueo]") || (form.getAttribute("method") ?? "").toLowerCase() === "get") return;
      e.preventDefault();
      e.stopPropagation();
      avisar();
    };
        // (Sin touchstart: cancelarlo se come el clic y en el celular no saldría el aviso.)
    const tipos = ["click", "mousedown", "beforeinput", "paste", "drop", "change"] as const;
    for (const t of tipos) el.addEventListener(t, alTocar, true);
    el.addEventListener("keydown", alTeclear, true);
    el.addEventListener("submit", alEnviar, true);
    const alVolver = () => { if (document.visibilityState === "visible") void revisar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      for (const t of tipos) el.removeEventListener(t, alTocar, true);
      el.removeEventListener("keydown", alTeclear, true);
      el.removeEventListener("submit", alEnviar, true);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [bloqueo, avisar, revisar]);

  useEffect(() => () => { if (tope.current) clearTimeout(tope.current); }, []);

  return (
    <ContextoEscritura.Provider value={bloqueo}>
      <div ref={raiz} data-solo-lectura={bloqueo ? bloqueo.motivo : undefined} className="contents">
        {children}
      </div>
      {bloqueo && aviso && (
        <div
          role="alert"
          data-aviso-solo-lectura
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-lg border border-ambar bg-ambar-suave px-4 py-3 text-sm font-semibold text-n-900 shadow-lg"
        >
          <span>{bloqueo.mensaje}</span>
          <span className="flex items-center gap-2">
            {bloqueo.boton && (
              <Link href={bloqueo.boton.href} className="rounded-md bg-morado px-3 py-1.5 text-white hover:bg-morado-oscuro">
                {bloqueo.boton.texto}
              </Link>
            )}
            <button type="button" onClick={() => setAviso(false)} className="rounded-md px-2 py-1 text-n-700 hover:bg-white" aria-label="Cerrar aviso">
              ✕
            </button>
          </span>
        </div>
      )}
    </ContextoEscritura.Provider>
  );
}
