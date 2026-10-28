// QA S41 (link sin enviar, 28 oct 2026): revisión ESTÁTICA de todo botón que abre WhatsApp (o un PDF) con un link que
// le pide al servidor. Falla (sale con 1) si encuentra:
//   1. `window.open(...)` con un link DESPUÉS de un `await` en la misma función: ya no está dentro del toque y el celular
//      lo bloquea (el botón «no hace nada»; cambiar de página en la misma pestaña, `location.href = …`, no se bloquea). Va por `useAbrirEnlace().abrirTras(...)`
//      (src/hooks/use-abrir-enlace.ts), que abre la pestaña al tocar y si no puede deja el link con «Copiar».
//   2. Un `<Button>` metido en un `<a href={…WhatsApp…}>`: un botón dentro de un enlace no siempre lo sigue; va
//      `<AbrirWhatsApp href>` (src/components/ui/abrir-whatsapp.tsx), que es un enlace de verdad.
//   3. «Mandarle un link» de lo que le falta a un perro para guardería y hotel que no genera el link (`linkParaCompletar`),
//      y la ficha de un cliente con cuenta sin el botón del link de su portal: así se quedó sin link la dueña de Goku.
//
//   node scripts/auditoria/whatsapp-al-tocar.mjs
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve("src");
const PERMITIDOS = new Set([path.join("src", "hooks", "use-abrir-enlace.ts")]);
const hallazgos = [];

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

// El cuerpo de la función que encierra la posición `i`: desde su encabezado más cercano (async o no).
const ENCABEZADO = /(async\s+function\b|async\s*\([^)]*\)\s*=>|async\s+[a-zA-Z_$][\w$]*\s*=>|\bfunction\s+[\w$]+\s*\(|\([^()]*\)\s*=>\s*\{)/g;
function encabezadoAntes(texto, i) {
  let ultimo = null;
  for (const m of texto.slice(0, i).matchAll(ENCABEZADO)) ultimo = m;
  return ultimo;
}

let revisados = 0;
for (const f of archivos(RAIZ)) {
  const rel = path.relative(process.cwd(), f);
  if (PERMITIDOS.has(rel)) continue;
  const texto = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  const linea = (i) => texto.slice(0, i).split("\n").length;

  // 1. Abrir después de esperar.
  for (const m of texto.matchAll(/window\.open\(\s*([^,)]+)/g)) {
    const arg = m[1].trim();
    if (/^["'`]{2}$/.test(arg)) continue; // la pestaña vacía que se abre al tocar
    revisados += 1;
    const h = encabezadoAntes(texto, m.index);
    if (!h || !/^async/.test(h[0])) continue;
    const entre = texto.slice(h.index, m.index);
    if (/\bawait\b/.test(entre)) hallazgos.push(`${rel}:${linea(m.index)} abre «${arg.slice(0, 40)}» después de un await (el celular lo bloquea): usa useAbrirEnlace().abrirTras`);
  }

  // 2. Un botón dentro de un enlace de WhatsApp.
  for (const m of texto.matchAll(/<a\b[^>]*href=\{([^}]*)\}[^>]*>\s*<Button\b/g)) {
    revisados += 1;
    if (/wa|whats/i.test(m[1])) hallazgos.push(`${rel}:${linea(m.index)} <Button> dentro de <a href={${m[1]}}>: usa <AbrirWhatsApp href>`);
  }
}

// 3. El botón de la sección de pendientes de guardería y hotel, y la ficha del cliente con cuenta.
const pendientes = fs.readFileSync("src/app/(staff)/perros/pendientes-estancia.tsx", "utf8");
if (!/linkParaCompletar/.test(pendientes) || /#link-complemento/.test(pendientes))
  hallazgos.push("pendientes-estancia.tsx: «Mandarle un link» solo lleva a la ficha del cliente (con cuenta en el portal, ahí no hay link): tiene que generarlo con linkParaCompletar");
const complemento = fs.readFileSync("src/app/(staff)/clientes/[id]/link-complemento.tsx", "utf8");
if (!/data-mandar-link-portal/.test(complemento))
  hallazgos.push("link-complemento.tsx: un cliente con cuenta activa no tiene cómo recibir el link de su portal");

console.log(`Botones que abren un link revisados: ${revisados}`);
for (const h of hallazgos) console.log(`  ✘ ${h}`);
console.log(hallazgos.length ? `${hallazgos.length} hallazgo(s).` : "  ✔ Ninguno abre después de esperar ni mete un botón en un enlace de WhatsApp.");
process.exit(hallazgos.length ? 1 : 0);
