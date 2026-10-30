"use client";

import { useLayoutEffect, useRef, useState, type TableHTMLAttributes } from "react";

/**
 * Toda tabla de la app (QA N154, 30 de octubre de 2026): en celular (menos de 640 px) cada fila es una tarjeta —la
 * primera celda es su título y las demás van debajo con el nombre de su columna—; desde tableta, tabla. Nunca hay
 * scroll horizontal escondido: si en tableta la tabla no cabe, abajo dice «Desliza la tabla para ver más columnas».
 *
 * El nombre de cada dato sale solo del encabezado (`<thead>`): cada `<td>` de `<tbody>`/`<tfoot>` recibe el
 * `data-label` de su columna (respetando `colSpan`) salvo que ya traiga uno. Una celda sin encabezado (acciones)
 * ocupa todo el ancho de la tarjeta. El estilo vive en `table.tabla-tarjetas` (src/app/globals.css).
 *
 * Se usa igual que `<table>`: `<TablaResponsiva className="w-full …"><thead>…</thead><tbody>…</tbody></TablaResponsiva>`.
 */
export function TablaResponsiva({
  className = "",
  contenedorClassName = "",
  children,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & { contenedorClassName?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const tabla = useRef<HTMLTableElement>(null);
  const [desborda, setDesborda] = useState(false);

  useLayoutEffect(() => {
    const t = tabla.current;
    const c = caja.current;
    if (!t || !c) return;
    const etiquetar = () => {
      const filasEncabezado = t.tHead?.rows;
      const encabezado = filasEncabezado?.length ? filasEncabezado[filasEncabezado.length - 1] : null;
      const nombres: string[] = [];
      if (encabezado) {
        for (const th of Array.from(encabezado.cells)) {
          const texto = (th.getAttribute("data-label") ?? th.textContent ?? "").trim().replace(/\s+/g, " ");
          for (let i = 0; i < (th.colSpan || 1); i++) nombres.push(texto);
        }
      }
      for (const cuerpo of [...Array.from(t.tBodies), ...(t.tFoot ? [t.tFoot] : [])]) {
        for (const fila of Array.from(cuerpo.rows)) {
          let col = 0;
          for (const celda of Array.from(fila.cells)) {
            const nombre = (celda.colSpan || 1) === 1 ? nombres[col] : "";
            col += celda.colSpan || 1;
            if (celda.hasAttribute("data-label") && !celda.hasAttribute("data-label-auto")) continue;
            if (nombre) {
              if (celda.getAttribute("data-label") !== nombre) celda.setAttribute("data-label", nombre);
              celda.setAttribute("data-label-auto", "");
            } else if (celda.hasAttribute("data-label-auto")) {
              celda.removeAttribute("data-label");
              celda.removeAttribute("data-label-auto");
            }
          }
        }
      }
    };
    const medir = () => setDesborda(c.scrollWidth > c.clientWidth + 1);
    etiquetar();
    medir();
    let pendiente = 0;
    const obs = new MutationObserver(() => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        etiquetar();
        medir();
      });
    });
    obs.observe(t, { childList: true, subtree: true, characterData: true });
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    ro.observe(t);
    return () => {
      obs.disconnect();
      ro.disconnect();
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, []);

  return (
    <div className={`min-w-0 max-w-full ${contenedorClassName}`} data-tabla-responsiva>
      <div ref={caja} className="max-w-full overflow-x-auto">
        <table ref={tabla} className={`tabla-tarjetas ${className}`} {...props}>
          {children}
        </table>
      </div>
      {desborda && (
        <p className="mt-1.5 px-1 text-right text-xs font-semibold text-n-600" data-tabla-desliza>
          Desliza la tabla para ver más columnas →
        </p>
      )}
    </div>
  );
}
