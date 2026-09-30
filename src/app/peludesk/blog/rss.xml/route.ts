import { todosLosArticulos } from "@/lib/peludesk/blog";
import { SITIO } from "@/lib/peludesk/seo";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// RSS del blog (peludesk.mx/blog/rss.xml). Solo el resumen de cada artículo:
// el texto completo se lee en el sitio.
export function GET() {
  const arts = todosLosArticulos();
  const items = arts
    .map(
      (a) => `    <item>
      <title>${esc(a.titulo)}</title>
      <link>${SITIO}/blog/${a.slug}</link>
      <guid isPermaLink="true">${SITIO}/blog/${a.slug}</guid>
      <pubDate>${new Date(`${a.fecha}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(a.descripcion)}</description>
    </item>`
    )
    .join("\n");
  const ultima = arts[0] ? new Date(`${arts[0].actualizado}T12:00:00Z`).toUTCString() : new Date().toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog de PeluDesk</title>
    <link>${SITIO}/blog</link>
    <atom:link href="${SITIO}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Guías para guarderías, hoteles y estéticas caninas: abrir, cobrar y cuidar tu negocio.</description>
    <language>es-MX</language>
    <lastBuildDate>${ultima}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" } });
}
