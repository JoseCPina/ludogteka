import { NextResponse } from "next/server";

// Una página HTML mínima para rutas /api que se abren en el navegador en el
// DOMINIO DE LA PLATAFORMA (regreso de OAuth, autorización simulada), donde
// no hay negocio del que sacar nombre ni WhatsApp (paginaDeError los pide).
// Los textos son fijos; el detalle técnico va a console.error.
function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function paginaSimple({ titulo, parrafos, acciones = [], status = 200 }: {
  titulo: string;
  parrafos: string[];
  acciones?: { texto: string; href: string; primaria?: boolean }[];
  status?: number;
}) {
  const botones = acciones
    .map(
      (a) =>
        `<a href="${escapar(a.href)}" style="display:inline-block;margin:.25rem .5rem .25rem 0;padding:.75rem 1.25rem;border-radius:999px;text-decoration:none;font-weight:600;${
          a.primaria ? "background:#4b3f72;color:#fff" : "border:2px solid #4b3f72;color:#4b3f72"
        }">${escapar(a.texto)}</a>`
    )
    .join("");
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(titulo)}</title>
<body style="font-family:system-ui,sans-serif;background:#fff8ee;color:#2b2a33;max-width:34rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.5rem">${escapar(titulo)}</h1>${parrafos.map((p) => `<p>${escapar(p)}</p>`).join("")}<p>${botones}</p></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
