// Uso: node scripts/seo/indexnow.mjs [--aplicar]
// Avisa a Bing (y a los demás buscadores que usan IndexNow) de TODAS las URL
// del sitemap de peludesk.mx. Sin --aplicar solo muestra lo que mandaría.
// La llave es pública por diseño (src/lib/peludesk/indexnow.ts) y el sitio la
// sirve en /indexnow-key.txt: el protocolo la usa para comprobar que el sitio
// es tuyo, no hace falta entrar a ninguna consola.
// Hay que correrlo DESPUÉS del despliegue (el archivo de llave y las páginas
// tienen que estar en producción) y desde una máquina que llegue a
// api.indexnow.org (la red de la nube no llega).
import { createHash } from "node:crypto";

const SITIO = "https://peludesk.mx";
const llave = createHash("sha256").update("peludesk.mx/indexnow/v1").digest("hex").slice(0, 32);
const aplicar = process.argv.includes("--aplicar");

const archivo = await fetch(`${SITIO}/indexnow-key.txt`);
if (!archivo.ok || (await archivo.text()).trim() !== llave) throw new Error("peludesk.mx todavía no sirve el archivo de llave: ¿ya se desplegó?");
const mapa = await (await fetch(`${SITIO}/sitemap.xml`)).text();
const urls = [...mapa.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log(`${urls.length} URL del sitemap`);
if (!aplicar) process.exit(0);

for (let i = 0; i < urls.length; i += 9000) {
  const r = await fetch("https://api.indexnow.org/IndexNow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: "peludesk.mx", key: llave, keyLocation: `${SITIO}/indexnow-key.txt`, urlList: urls.slice(i, i + 9000) }),
  });
  console.log(`IndexNow: ${r.status} (200 y 202 son éxito)`);
  if (![200, 202].includes(r.status)) process.exitCode = 1;
}
