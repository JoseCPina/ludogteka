"use client";

import { useCallback, useState } from "react";

/**
 * Abrir WhatsApp (o un PDF) con un link que primero hay que pedirle al servidor.
 *
 * Un `window.open(url)` que corre DESPUÉS de esperar al servidor ya no está dentro del toque de la persona y el
 * navegador del celular lo bloquea (iPhone siempre; Chrome pasados unos segundos): el botón «no hace nada». Por eso
 * la pestaña se abre vacía AL TOCAR, antes de la espera, y cuando llega el link se manda ahí. Si el navegador no dejó
 * abrirla, o el link no llegó a tiempo, `enlace` queda con `bloqueado: true` y la pantalla enseña el link con
 * «Copiar» y «Abrir WhatsApp» (`<AbrirWhatsApp>`), que es un enlace de verdad y se abre con el siguiente toque.
 *
 *   const wa = useAbrirEnlace();
 *   async function mandar() {
 *     const res = await wa.abrirTras(() => envio.ejecutar(() => generarLink(id)), (r) => r.urlWhatsApp);
 *     if (res.error) setError(res.error);
 *   }
 *   {wa.enlace && <AbrirWhatsApp href={wa.enlace.url} bloqueado={wa.enlace.bloqueado} />}
 *
 * `abrirTras` se llama directo en el `onClick` (sin un `await` antes): lo primero que hace es abrir la pestaña.
 */
export function useAbrirEnlace() {
  const [enlace, setEnlace] = useState<{ url: string; bloqueado: boolean } | null>(null);

  const abrirTras = useCallback(async <T>(obtener: () => Promise<T>, urlDe: (r: T) => string | null | undefined): Promise<T> => {
    setEnlace(null);
    const ventana = abrirVacia();
    let r: T;
    try {
      r = await obtener();
    } catch (e) {
      ventana?.close();
      throw e;
    }
    const url = urlDe(r);
    if (!url) {
      ventana?.close();
      return r;
    }
    setEnlace({ url, bloqueado: !llevarA(ventana, url) });
    return r;
  }, []);

  /** Sin esperar a nadie (el link ya está en pantalla): se abre en el mismo toque. */
  const abrir = useCallback((url: string) => {
    setEnlace({ url, bloqueado: !llevarA(abrirVacia(), url) });
  }, []);

  return { enlace, abrirTras, abrir, olvidar: useCallback(() => setEnlace(null), []) };
}

function abrirVacia(): Window | null {
  try {
    const v = window.open("", "_blank");
    if (!v) return null;
    // Sin acceso de regreso a esta pestaña (lo mismo que `noopener`, que no se puede pedir aquí: con él, `open` no
    // devuelve la ventana y no habría a dónde mandar el link).
    try {
      v.opener = null;
      v.document.title = "Abriendo…";
    } catch {}
    return v;
  } catch {
    return null;
  }
}

function llevarA(ventana: Window | null, url: string): boolean {
  if (!ventana || ventana.closed) return false;
  try {
    ventana.location.href = url;
    return true;
  } catch {
    ventana.close();
    return false;
  }
}
