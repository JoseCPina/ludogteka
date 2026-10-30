// QA N154: ¿algo de la pantalla es más ancho que ella? Lo usan `celular-390-dev.mjs` y `qa-s49-prod.mjs`.
//
// Se evalúa en el navegador (`await pagina.evaluate(desbordesDePantalla)`) y devuelve:
//   · la página entera más ancha que la pantalla (se desliza de lado);
//   · cada elemento visible que se sale por la derecha o la izquierda sin que un contenedor lo recorte;
//   · cada contenedor con scroll horizontal (overflow-x auto/scroll) cuyo contenido no cabe y que no lo dice
//     (`<TablaResponsiva>` enseña «Desliza la tabla…»: `[data-tabla-desliza]`). Es el «scroll oculto» de N154.
// Un texto cortado con «…» (truncate) no cuenta: lo recorta su propio contenedor a propósito.
export function desbordesDePantalla() {
  const W = document.documentElement.clientWidth;
  const hallazgos = [];
  const nombre = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const datos = [...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).slice(0, 2).join("");
    const texto = (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50);
    return `${el.tagName.toLowerCase()}${id}${datos}${texto ? ` «${texto}»` : ""}`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.position === "fixed") return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  // ¿Un ancestro lo recorta (overflow distinto de visible) y ese ancestro sí cabe?
  const recortado = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== "visible") {
        const r = p.getBoundingClientRect();
        return r.right <= W + 1 && r.left >= -1;
      }
      if (s.position === "fixed") return true;
    }
    return false;
  };
  if (document.documentElement.scrollWidth > W + 1) hallazgos.push({ tipo: "la página se desliza de lado", detalle: `${document.documentElement.scrollWidth} px en una pantalla de ${W}` });
  const vistos = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("[aria-hidden=true], svg, [data-portal-shell] [role=dialog]") && el.tagName !== "TABLE") continue;
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    if ((s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) {
      const conAviso = el.closest("[data-tabla-responsiva]")?.querySelector("[data-tabla-desliza]");
      if (!conAviso && !vistos.has(el)) { vistos.add(el); hallazgos.push({ tipo: "scroll horizontal escondido", detalle: `${nombre(el)}: ${el.scrollWidth} px de contenido en ${el.clientWidth}` }); }
      continue;
    }
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1 || r.width > W + 1) && !recortado(el)) {
      // Solo el más externo de una cadena que se sale (sus hijos se salen con él).
      let padre = el.parentElement;
      let yaContado = false;
      while (padre) { if (vistos.has(padre)) { yaContado = true; break; } padre = padre.parentElement; }
      vistos.add(el);
      if (!yaContado) hallazgos.push({ tipo: "más ancho que la pantalla", detalle: `${nombre(el)}: de ${Math.round(r.left)} a ${Math.round(r.right)} px (pantalla de ${W})` });
    }
  }
  return hallazgos;
}
