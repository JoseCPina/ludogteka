// Prospección nacional (desarrollo). Necesita `npm run build`; levanta `next start` en el 3001 con un Google de
// mentiras en el 4461 que NO devuelve lugares (no se escribe ningún prospecto).
//   node scripts/auditoria/prospectos-nacional-dev.mjs
//   1. lista: sin repetidos, zonas partidas por municipio, filtros por estado y zona;  2. estimador: gratis del mes,
//   cobradas, dólares y días;  3. endpoint: sin secreto 401, sin tope 400, estimar sin llamar a Google,
//   una tanda de 3 búsquedas respeta el tope y la siguiente sigue con otras ciudades (rotación), pausa la detiene.
import http from "node:http";
import { spawn } from "node:child_process";
import { A, URL as SUPA } from "./sesiones-dev.mjs";
import { CIUDADES_NACIONALES, ciudadesNacionales, estimarCosto } from "../../src/lib/prospectos/nacional.ts";

if (!SUPA.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const CRON = "cron-de-prueba";
const hallazgos = [];
const ok = (c, si, no) => { if (c) console.log(`  ✔ ${si}`); else { hallazgos.push(no); console.log(`  ✘ ${no}`); } };

console.log("1. Lista");
const todas = ciudadesNacionales();
ok(todas.length === new Set(todas).size && todas.length >= 190 && CIUDADES_NACIONALES.every((x) => x.poblacion > 0 && /^\d{5}$/.test(x.clave)), `${todas.length} ciudades, sin repetidos`, "la lista repite ciudades o es corta");
ok(new Set(CIUDADES_NACIONALES.map((x) => x.estado)).size >= 30, "cubre al menos 30 estados", "faltan estados");
const gdl = ciudadesNacionales({ zonas: ["guadalajara"] });
ok(gdl.includes("Zapopan, Jalisco") && gdl.length === 6, "Guadalajara se parte en sus 6 municipios", `Guadalajara: ${gdl}`);
ok(ciudadesNacionales({ estados: ["Nuevo Leon"] }).every((n) => n.endsWith("Nuevo León")), "el filtro por estado ignora acentos", "filtro por estado");

console.log("2. Estimador");
const e = estimarCosto({ ciudades: 100, consultasPorCiudad: 8, paginasPorConsulta: 3, topeDiario: 300 });
ok(e.llamadasMaximas === 2400 && e.llamadasCobradas === 1400 && e.costoUsd === 49 && e.dias === 8, "2,400 llamadas, 1,000 gratis, $49 y 8 días", JSON.stringify(e));
ok(estimarCosto({ ciudades: 1, consultasPorCiudad: 1, paginasPorConsulta: 1 }).costoUsd === 0, "dentro de lo gratis no cuesta", "costo dentro de lo gratis");
ok(estimarCosto({ ciudades: 100, consultasPorCiudad: 8, paginasPorConsulta: 3, yaUsadasEsteMes: 1000 }).llamadasCobradas === 2400, "con lo gratis ya gastado se cobra todo", "gratis ya gastado");

console.log("3. Endpoint");
let llamadasGoogle = 0;
const google = http.createServer((req, res) => { llamadasGoogle++; req.resume(); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ places: [] })); });
await new Promise((r) => google.listen(4461, "127.0.0.1", r));
const { data: ajAntes } = await A.from("prospeccion_ajustes").select("pausado").eq("id", 1).single();
const inicio = new Date().toISOString();
const logs = [];
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3001"], { env: { ...process.env, NODE_USE_ENV_PROXY: "", VERCEL_ENV: "", CRON_SECRET: CRON, GOOGLE_PLACES_API_KEY: "llave-de-prueba", PLACES_API_URL: "http://127.0.0.1:4461" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
app.stdout.on("data", (d) => logs.push(String(d)));
app.stderr.on("data", (d) => logs.push(String(d)));
for (let i = 0; i < 60; i++) { if (logs.join("").includes("Ready")) break; await new Promise((r) => setTimeout(r, 1000)); }
const ir = (q, secreto = CRON) => fetch(`http://127.0.0.1:3001/api/cron/prospectos-nacional?${q}`, { headers: { ...(secreto ? { Authorization: `Bearer ${secreto}` } : {}), Host: "plataforma.localhost:3001" }, signal: AbortSignal.timeout(120_000) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
try {
  ok((await ir("tope=3", null)).status === 401, "sin secreto, 401", "corrió sin secreto");
  ok((await ir("tope=3", "otro")).status === 401, "secreto equivocado, 401", "aceptó otro secreto");
  ok((await ir("giros=hotel")).status === 400, "sin tope, 400", "corrió sin tope");
  ok((await ir("tope=900")).status === 400, "tope de 900, 400", "aceptó un tope enorme");
  ok(llamadasGoogle === 0, "nada de eso llamó a Google", "llamó a Google sin permiso");
  const est = await ir("estimar=1&zonas=Guadalajara&giros=hotel,estetica");
  ok(est.status === 200 && est.json.ciudades === 6 && est.json.llamadasMaximas === 6 * 4 * 3 && /INEGI/.test(est.json.lista), `estimar: ${JSON.stringify(est.json)}`, `estimar ${JSON.stringify(est.json)}`);
  ok(llamadasGoogle === 0, "estimar no llama a Google", "estimar llamó a Google");
  const t1 = await ir("tope=3&zonas=Guadalajara&giros=hotel");
  ok(t1.status === 200 && t1.json.busquedas === 3 && llamadasGoogle === 3, `tanda de 3 búsquedas (${t1.json?.busquedas}, Google ${llamadasGoogle})`, `tanda ${JSON.stringify(t1.json)}`);
  const t2 = await ir("tope=3&zonas=Guadalajara&giros=hotel");
  const { data: cur } = await A.from("prospeccion_cursores").select("ciudad, consulta, ultima_at").in("ciudad", ciudadesNacionales({ zonas: ["Guadalajara"] })).not("ultima_at", "is", null);
  const distintas = new Set((cur ?? []).map((c) => `${c.ciudad}|${c.consulta}`)).size;
  ok(t2.json?.busquedas === 3 && distintas === 6, `la segunda tanda siguió con otras combinaciones (${distintas} distintas)`, `rotación: ${distintas} distintas`);
  await A.from("prospeccion_ajustes").update({ pausado: true }).eq("id", 1);
  const t3 = await ir("tope=3&zonas=Guadalajara&giros=hotel");
  ok(t3.json?.pausada === true && llamadasGoogle === 6, "en pausa no busca", `pausa: ${JSON.stringify(t3.json)} Google ${llamadasGoogle}`);
} finally {
  await A.from("prospeccion_ajustes").update({ pausado: ajAntes.pausado }).eq("id", 1);
  const ciudades = ciudadesNacionales({ zonas: ["Guadalajara"] });
  await A.from("prospeccion_cursores").delete().in("ciudad", ciudades);
  await A.from("prospeccion_corridas").delete().gte("inicio_at", inicio).eq("origen", "manual");
  try { process.kill(-app.pid); } catch {}
  google.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgos` : "\n✔ Prospección nacional sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
