import { NextResponse } from "next/server";
import { cargarNegocioLanding, whatsAppDelNegocio } from "@/lib/landing/negocio";

// Lo que ve una persona cuando una ruta /api que se abre en el navegador
// (la vista previa del contrato) falla. Nunca JSON crudo: así vio Ronith
// Navarrete {"error":"No pudimos leer los datos del expediente."} al
// completar el alta de guardería (23 de septiembre de 2026). Página en
// español que dice qué pasó y qué hacer.
//
// Los textos son fijos (nunca el mensaje de la base): el detalle técnico
// va a los logs de Vercel con console.error, no a la pantalla.
function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export async function paginaDeError({
  titulo,
  que,
  queHacer,
  status,
}: {
  titulo: string;
  que: string;
  queHacer: string[];
  status: number;
}) {
  // PeluDesk: el nombre y el WhatsApp son los del negocio del dominio.
  const nombre = (await cargarNegocioLanding()).nombre;
  const whatsapp = await whatsAppDelNegocio("contrato_error", (n) => `Hola, ${n}. No pude abrir mi contrato en la app.`);
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} · ${escapar(nombre)}</title>
<style>
  body{margin:0;background:#fff8ee;color:#2b2a33;font-family:Outfit,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
  main{max-width:30rem;margin:3rem auto;padding:0 1rem}
  .tarjeta{background:#fff;border-radius:12px;border-left:4px solid #b23c31;padding:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  h1{font-size:1.35rem;margin:0 0 .5rem}
  p{margin:.5rem 0}
  ul{margin:.75rem 0 0;padding-left:1.2rem}
  li{margin:.35rem 0}
  a.boton{display:inline-block;margin-top:1.25rem;background:#117a43;color:#fff;font-weight:700;text-decoration:none;padding:.75rem 1.25rem;border-radius:999px}
  .marca{font-weight:700;color:#4b3f72;margin-bottom:1rem}
</style>
</head>
<body>
<main>
  <p class="marca">${escapar(nombre)}</p>
  <div class="tarjeta">
    <h1>${escapar(titulo)}</h1>
    <p>${escapar(que)}</p>
    <ul>${queHacer.map((q) => `<li>${escapar(q)}</li>`).join("")}</ul>
    ${whatsapp ? `<a class="boton" href="${escapar(whatsapp)}" target="_blank" rel="noopener noreferrer">Escribirnos por WhatsApp</a>` : ""}
  </div>
</main>
</body>
</html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
