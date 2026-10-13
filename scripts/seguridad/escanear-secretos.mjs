// Escaneo de secretos: contraseñas escritas en código, pares correo + contraseña, llaves de API y tokens.
//
//   node scripts/seguridad/escanear-secretos.mjs                 archivos EN STAGE (lo que corre el pre-commit)
//   node scripts/seguridad/escanear-secretos.mjs --todo          todo lo versionado (CI y revisión manual)
//   node scripts/seguridad/escanear-secretos.mjs --desde <ref>   lo que cambió contra <ref> (CI de un push o PR)
//
// Sale con 1 si encuentra algo y dice archivo, línea y regla, SIN imprimir el valor completo. Una línea que es un
// falso positivo de verdad (un valor de ejemplo, una prueba que fabrica su clave) lleva `escaner-ok: motivo` al final.
// Las contraseñas de cuentas de prueba o de siembra NUNCA se escriben: `claveAleatoria()` (scripts/lib/clave.mjs).
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const args = process.argv.slice(2);
let archivos;
if (args.includes("--todo")) archivos = git("ls-files").split("\n");
else if (args.includes("--desde")) archivos = git("diff", "--name-only", "--diff-filter=ACMR", `${args[args.indexOf("--desde") + 1]}...HEAD`).split("\n");
else archivos = git("diff", "--cached", "--name-only", "--diff-filter=ACMR").split("\n");
archivos = archivos.filter(Boolean);

const OMITIR = [/^package-lock\.json$/, /node_modules\//, /^\.env\.example$/, /^public\//, /\.(png|jpe?g|webp|gif|ico|pdf|mp4|mp3|wav|woff2?|ttf|xlsx|zip)$/i, /^scripts\/seguridad\/escanear-secretos\.mjs$/, /^scripts\/tutoriales\/audio\//, /^scripts\/videos\/audio\//];

const VALOR = String.raw`["'\`]([^"'\`\n]{6,})["'\`]`;
const REGLAS = [
  // Contraseña como literal: password: "abc12345", contrasena = '...', pass: `...` (con o sin ${}: si lleva prefijo fijo, igual es una contraseña derivable).
  { nombre: "contraseña escrita en el código", re: new RegExp(String.raw`\b(?:password|passwd|pwd|contrase[nñ]a|clave_?(?:acceso|usuario)|pass)[A-Za-z0-9_]*["']?\s*[:=]\s*` + VALOR, "i"), valor: 1,
    ok: (v, linea) => /^env\(|process\.env|\$\{[^}]*(?:env|claveAleatoria|randomUUID|randomBytes)/i.test(v) || /^(?:\*+|x+|<[^>]+>|\.{3}|tu-|su-|ej(?:emplo)?|placeholder|contrase[nñ]a|password|clave)/i.test(v) || /\b(?:type|autoComplete|autocomplete|name|id|htmlFor|label|aria-label|placeholder|href|className|clave)\s*=/.test(linea) },
  // .fill("literal") en un campo cuya etiqueta habla de contraseña (pruebas de pantalla).
  { nombre: "contraseña tecleada como literal en una prueba", re: /(?:contrase[nñ]a|password|rep[ií]te?la?|escoge tu)[^)\n]*\)(?:\s*,\s*\{[^}]*\})?\s*\)?\.fill\(\s*["'`]([^"'`\n]{4,})["'`]/i, valor: 1, ok: () => false },
  // Correo y contraseña en la misma línea: createUser({ email: "a@b.c", password: "..." }).
  { nombre: "par correo + contraseña", re: new RegExp(String.raw`[\w.+-]+@[\w-]+\.[\w.-]+[^\n]{0,80}\bpass(?:word)?["']?\s*[:=]\s*["'\`][^"'\`\n$]{6,}["'\`]`, "i"), valor: 0, ok: () => false },
  { nombre: "llave secreta de Stripe", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/, valor: 0, ok: () => false },
  { nombre: "secreto de webhook de Stripe", re: /\bwhsec_[A-Za-z0-9]{20,}/, valor: 0, ok: () => false },
  { nombre: "llave secreta de Supabase", re: /\bsb_secret_[A-Za-z0-9_-]{16,}/, valor: 0, ok: () => false },
  { nombre: "JWT (llave de servicio de Supabase u otra)", re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/, valor: 0, ok: () => false },
  { nombre: "llave de Anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, valor: 0, ok: () => false },
  { nombre: "token de acceso de Meta", re: /\bEAA[A-Za-z0-9]{40,}/, valor: 0, ok: () => false },
  { nombre: "token de GitHub", re: /\b(?:ghp|gho|ghs|ghr|github_pat)_[A-Za-z0-9_]{30,}/, valor: 0, ok: () => false },
  { nombre: "token de Vercel", re: /\bvc[a-z]_[A-Za-z0-9]{20,}|\bvercel_[A-Za-z0-9]{20,}/, valor: 0, ok: () => false },
  { nombre: "token de Slack", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, valor: 0, ok: () => false },
  { nombre: "llave de Google", re: /\bAIza[A-Za-z0-9_-]{30,}/, valor: 0, ok: () => false },
  { nombre: "llave de AWS", re: /\bAKIA[A-Z0-9]{16}\b/, valor: 0, ok: () => false },
  { nombre: "llave privada", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, valor: 0, ok: () => false },
  { nombre: "cadena de conexión de Postgres con contraseña", re: /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]{4,}@/, valor: 0, ok: () => false },
  // Llave o token genérico: un literal largo asignado a algo que se llama key/token/secret.
  { nombre: "llave o token escrito en el código", re: new RegExp(String.raw`\b[A-Za-z_]*(?:api_?key|secret|token|llave)[A-Za-z_]*["']?\s*[:=]\s*["'\`]([A-Za-z0-9_\-+/=]{32,})["'\`]`, "i"), valor: 1,
    ok: (v) => /^(?:[a-f0-9]{32,}|[A-Za-z0-9_-]+)$/.test(v) === false },
];

function oculto(t) { return t.length <= 4 ? "****" : `${t.slice(0, 3)}…(${t.length} car.)`; }

let hallazgos = 0;
for (const f of archivos) {
  if (OMITIR.some((r) => r.test(f)) || !fs.existsSync(f) || fs.statSync(f).size > 2_000_000) continue;
  let texto;
  try { texto = fs.readFileSync(f, "utf8"); } catch { continue; }
  if (texto.includes("\0")) continue;
  texto.split("\n").forEach((linea, i) => {
    if (linea.includes("escaner-ok")) return;
    for (const r of REGLAS) {
      const m = r.re.exec(linea);
      if (!m) continue;
      const v = m[r.valor] ?? m[0];
      if (r.ok(v, linea)) continue;
      hallazgos++;
      console.error(`✘ ${f}:${i + 1}  ${r.nombre}  (${oculto(v)})`);
    }
  });
}
if (hallazgos) {
  console.error(`\n${hallazgos} posible(s) secreto(s). No se escriben contraseñas ni llaves en el repo: usa claveAleatoria() (scripts/lib/clave.mjs) o una variable de entorno.`);
  console.error("Si de verdad es un falso positivo, agrega `escaner-ok: motivo` al final de esa línea.");
  process.exit(1);
}
console.log(`Sin secretos en ${archivos.length} archivo(s) revisados.`);
