// IndexNow automático, de punta a punta contra dobles (desarrollo): un sitio de mentiras con sitemap, páginas y
// archivo de llave, y un IndexNow de mentiras, ambos en el 4461. Levanta `next start` en el 3001 y llama la tarea
// de verdad (/api/cron/indexnow). Necesita `npm run build`.
//
//   node scripts/auditoria/indexnow-dev.mjs
//
//   1. sin secreto: 401;  2. primer envío: todas las URL son nuevas y quedan registradas con su respuesta;
//   3. sin cambios: no manda nada;  4. una página cambia, otra es nueva y una cambia SOLO en su código
//      (scripts): solo se avisan las dos primeras;  5. IndexNow responde 500: queda registrado como fallido, no
//      se da por avisado y la siguiente corrida lo reintenta;  6. archivo de llave equivocado: no manda nada;
//   7. una página que no abre no frena a las demás;  8. nadie sin ser de la plataforma lee las tablas.
import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";
limpiarAlTerminar({ bitacoras: ["indexnow_envios", "indexnow_urls"] }); // al terminar (también si falla) borra lo que esta corrida creó
import http from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { A, URL as SUPA, env } from "./sesiones-dev.mjs";

if (!SUPA.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 4461;
const D = `http://127.0.0.1:${PUERTO}`;
const LLAVE = createHash("sha256").update("peludesk.mx/indexnow/v1").digest("hex").slice(0, 32);
const CRON = "cron-de-prueba";
const hallazgos = [];
const ok = (c, si, no) => { if (c) console.log(`  ✔ ${si}`); else { hallazgos.push(no); console.log(`  ✘ ${no}`); } };

const E = { llave: LLAVE, api: 200, paginas: { "/": "Inicio v1", "/precios": "Precios v1", "/alternativas/sicar": "SICAR v1" }, ruido: 1, caida: null };
const envios = [];
const pagina = (ruta) => `<html><head><title>${ruta}</title><meta name="description" content="d"><script>self.__next_f.push(["${E.ruido}"])</script></head><body><main>${E.paginas[ruta]}</main></body></html>`;
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const u = new globalThis.URL(req.url, D);
  if (u.pathname === "/indexnow-key.txt") return res.end(E.llave);
  if (u.pathname === "/sitemap.xml") return res.end(`<urlset>${Object.keys(E.paginas).map((r) => `<url><loc>${D}${r}</loc></url>`).join("")}</urlset>`);
  if (u.pathname === "/IndexNow" && req.method === "POST") {
    envios.push(JSON.parse(cuerpo));
    res.writeHead(E.api, { "content-type": "text/plain" });
    return res.end(E.api === 200 ? "" : "Error de prueba");
  }
  if (E.caida && u.pathname === E.caida) { res.writeHead(500); return res.end("x"); }
  if (E.paginas[u.pathname]) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pagina(u.pathname)); }
  res.writeHead(404); res.end("no");
});
await new Promise((r) => doble.listen(PUERTO, "127.0.0.1", r));

const limpiar = async () => {
  await A.from("indexnow_urls").delete().like("url", `${D}%`);
  await A.from("indexnow_envios").delete().like("respuesta", "%Error de prueba%");
  const { data } = await A.from("indexnow_envios").select("id, urls");
  for (const f of data ?? []) if (JSON.stringify(f.urls).includes(D)) await A.from("indexnow_envios").delete().eq("id", f.id);
};
await limpiar();

const logs = [];
const app = spawn("npx", ["next", "start", "-p", "3001"], {
  env: { ...process.env, NODE_USE_ENV_PROXY: "", VERCEL_ENV: "", CRON_SECRET: CRON, INDEXNOW_SITIO_URL: D, INDEXNOW_API_URL: `${D}/IndexNow` },
  stdio: ["ignore", "pipe", "pipe"], detached: true,
});
app.stdout.on("data", (d) => logs.push(String(d)));
app.stderr.on("data", (d) => logs.push(String(d)));
const llamar = (secreto = CRON) => fetch("http://127.0.0.1:3001/api/cron/indexnow", { headers: { ...(secreto ? { Authorization: `Bearer ${secreto}` } : {}), Host: "plataforma.localhost:3001" }, signal: AbortSignal.timeout(120_000) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
for (let i = 0; i < 60; i++) { if (logs.join("").includes("Ready")) break; await new Promise((r) => setTimeout(r, 1000)); }
const filasEnvio = async () => (await A.from("indexnow_envios").select("*").order("created_at")).data.filter((f) => JSON.stringify(f.urls).includes(D) || /Error de prueba/.test(f.respuesta ?? ""));

try {
  console.log("1. Sin secreto");
  ok((await llamar(null)).status === 401, "sin secreto, 401", "la tarea corrió sin CRON_SECRET");
  ok(envios.length === 0, "y no avisó a IndexNow", "avisó sin autorización");

  console.log("2. Primer envío");
  let r = await llamar();
  ok(r.json?.estado === "enviado" && r.json.nuevas === 3 && r.json.cambiadas === 0, "las 3 URL del sitemap son nuevas y se avisan", `primer envío: ${JSON.stringify(r.json)}`);
  ok(envios.length === 1 && envios[0].urlList.length === 3 && envios[0].key === LLAVE && envios[0].keyLocation === `${D}/indexnow-key.txt`, "IndexNow recibió las 3 URL con la llave y su ubicación", `cuerpo a IndexNow: ${JSON.stringify(envios[0])}`);
  ok(envios[0]?.urlList.includes(`${D}/alternativas/sicar`), "incluida la comparativa nueva (/alternativas/sicar)", "la comparativa nueva no salió");
  let f = await filasEnvio();
  ok(f.length === 1 && f[0].ok && f[0].estado_http === 200 && f[0].urls_total === 3 && f[0].urls_nuevas === 3 && f[0].origen === "cron", "el envío queda registrado con su respuesta (200, 3 nuevas)", `registro: ${JSON.stringify(f)}`);
  const { count } = await A.from("indexnow_urls").select("*", { count: "exact", head: true }).like("url", `${D}%`);
  ok(count === 3, "y las 3 URL quedan con su huella", `huellas guardadas: ${count}`);

  console.log("3. Sin cambios");
  r = await llamar();
  ok(r.json?.estado === "sin_cambios" && envios.length === 1, "no manda nada si nada cambió", `segunda corrida: ${JSON.stringify(r.json)}`);

  console.log("4. Una cambia, una es nueva y una cambia solo su código");
  E.paginas["/precios"] = "Precios v2"; E.paginas["/guias/caja"] = "Guía nueva"; E.ruido = 2; // /  solo cambia su script
  r = await llamar();
  ok(r.json?.estado === "enviado" && r.json.nuevas === 1 && r.json.cambiadas === 1, "avisa 1 nueva y 1 cambiada", `tercera corrida: ${JSON.stringify(r.json)}`);
  ok(envios.length === 2 && envios[1].urlList.length === 2 && !envios[1].urlList.includes(`${D}/`), "y la que solo cambió su código (scripts) no se avisa", `lote: ${JSON.stringify(envios[1]?.urlList)}`);

  console.log("5. IndexNow responde 500");
  E.paginas["/precios"] = "Precios v3"; E.api = 500;
  r = await llamar();
  ok(r.json?.estado === "fallido" && r.json.http === 500, "queda 'fallido' con el código 500", `con IndexNow caído: ${JSON.stringify(r.json)}`);
  f = await filasEnvio();
  const ult = f.at(-1);
  ok(ult && !ult.ok && ult.estado_http === 500 && /Error de prueba/.test(ult.respuesta), "el registro guarda el 500 y su respuesta", `registro fallido: ${JSON.stringify(ult)}`);
  E.api = 200;
  r = await llamar();
  ok(r.json?.estado === "enviado" && r.json.cambiadas === 1, "la siguiente corrida lo reintenta y lo avisa", `reintento: ${JSON.stringify(r.json)}`);

  console.log("6. Archivo de llave equivocado");
  E.llave = "otra"; E.paginas["/precios"] = "Precios v4";
  r = await llamar();
  const antes = envios.length;
  ok(r.json?.estado === "sitio_no_listo" && envios.length === antes, "no avisa si el sitio no sirve la llave", `llave mala: ${JSON.stringify(r.json)}`);
  E.llave = LLAVE;

  console.log("7. Una página que no abre");
  E.caida = "/alternativas/sicar";
  r = await llamar();
  ok(r.json?.estado === "enviado" && r.json.no_leidas === 1 && r.json.cambiadas === 1, "las demás se avisan y la caída se cuenta como no leída", `con una caída: ${JSON.stringify(r.json)}`);
  ok(!envios.at(-1).urlList.includes(`${D}/alternativas/sicar`), "y no se avisa la que no abrió", "avisó una URL que no abrió");
  E.caida = null;

  console.log("8. Acceso a las tablas");
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  for (const t of ["indexnow_urls", "indexnow_envios"]) {
    const l = await anon.from(t).select("id").limit(1);
    ok(l.error || (l.data ?? []).length === 0, `${t}: la llave anónima no lee nada`, `${t} legible con la llave anónima`);
    const e = await anon.from(t).insert({ url: "x", huella: "x", origen: "cron" });
    ok(Boolean(e.error), `${t}: la llave anónima no escribe`, `${t} escribible con la llave anónima`);
  }
  ok(!logs.join("").includes(CRON), "el secreto de la tarea no sale en los logs", "el secreto salió en los logs");
} finally {
  try { process.kill(-app.pid, "SIGTERM"); } catch { app.kill("SIGTERM"); }
  await limpiar();
  doble.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
