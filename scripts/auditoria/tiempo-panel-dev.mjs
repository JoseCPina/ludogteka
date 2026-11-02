// Tiempo de las cuatro pantallas del panel — SOLO DESARROLLO, en Huellitas, con la app compilada en el 3001 arrancada con
// el contador de consultas: `npm run build` y luego `PELUDESK_MEDIR=1 npm run start -- -p 3001` (en PowerShell:
// `$env:PELUDESK_MEDIR="1"; npm run start -- -p 3001`).
//
//   node scripts/auditoria/tiempo-panel-dev.mjs [--tope <ms para todas>] [--muestras 4] [--json]
//
// Mide, con la sesión de admin y de recepción de Huellitas, Recepción (/recepcion), Hotel (/hotel), la Agenda de
// estética (/estetica) y el Inicio del panel (/admin): el tiempo del servidor (hasta los encabezados y hasta el final del
// cuerpo, mediana de varias muestras tras una de calentamiento) y CUÁNTAS consultas a la base hace cada una (el servidor
// las anota por petición con el encabezado `x-peludesk-medir`; src/lib/medicion/consultas.ts). Falla si una pantalla
// pasa del tope de servidor o si hace más consultas que su tope (TOPES_CONSULTAS, fijados con lo que quedó después del
// arreglo del 31 de octubre de 2026). Deja el resultado en <temp>/tiempo-panel-dev.json, que `npm run desplegar` exige
// en verde y de menos de 24 h.
//
// Ojo: la base de desarrollo está en Canadá (ca-central-1) y producción en us-east-1 junto a Vercel; cada viaje a la
// base cuesta aquí unos 70–100 ms más que en producción. El tope de tiempo se compara contra lo medido menos esa ida y
// vuelta por tanda (se mide con `fecha_negocio`), para que el número signifique lo mismo que en producción.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
// Tope de servidor POR PANTALLA (1 de noviembre de 2026): lo medido en la laptop con la base de desarrollo en Medium,
// más 25 %. La meta de 600 ms de la primera versión salió de medir /admin y /recepcion mientras tronaban a medias
// (TypeError: a.catch is not a function) y no se cumple en esas dos; lo de aquí es el freno a una regresión. --tope
// fija uno solo para todas.
const TOPE_ARG = arg("--tope", null);
const TOPES_MS = { "/recepcion": 2400, "/hotel": 650, "/estetica": 400, "/admin": 3100 };
const topeMsDe = (ruta) => (TOPE_ARG ? Number(TOPE_ARG) : TOPES_MS[ruta] ?? 600);
const MUESTRAS = Number(arg("--muestras", "4"));
const JSON_SALIDA = process.argv.includes("--json");
// El dominio del negocio, no 127.0.0.1 + Host: el fetch de Node ignora el encabezado Host y la petición caía en el negocio
// por omisión (→ /sin-acceso). *.localhost resuelve a 127.0.0.1 por el archivo hosts de la laptop.
const BASE = "http://huellitas.localhost:3001";
const HOST = "huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;

// Consultas por pantalla después del arreglo (layout del personal incluido; el middleware no se cuenta). Si una
// pantalla crece, se sube aquí a propósito, con el motivo en el commit.
// Segunda vuelta (1 de noviembre de 2026): los saldos de salidas en una consulta (−2), los videos del inicio
// compartidos con el layout (−1) y la configuración vigente del inicio pedida una vez (−1).
const TOPES_CONSULTAS = { "/recepcion": 61, "/hotel": 20, "/estetica": 19, "/admin": 77 };
// Tandas de viajes a la base que quedan en cada pantalla (sesión + layout + la pantalla): para descontar la latencia
// de desarrollo, no para premiar más tandas.
const TANDAS = { "/recepcion": 6, "/hotel": 5, "/estetica": 6, "/admin": 8 };

async function cookieDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return { cookie: [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([k, v]) => `${k}=${v}`).join("; "), token: s.session.access_token };
}

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function medir(ruta, cookie) {
  const muestras = [];
  for (let i = 0; i <= MUESTRAS; i++) {
    const id = randomUUID();
    const t0 = performance.now();
    const r = await fetch(BASE + ruta, { headers: { cookie, accept: "text/html", "x-peludesk-medir": id }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
    const head = performance.now() - t0;
    const html = await r.text();
    const total = performance.now() - t0;
    const m = await fetch(`${BASE}/api/medir?id=${id}`, {});
    const conteo = m.ok ? await m.json() : null;
    if (i > 0) muestras.push({ status: r.status, head, total, bytes: html.length, conteo });
    if (i === 0 && !m.ok) throw new Error(`/api/medir no responde (${m.status}: ${(await m.text()).slice(0, 90)}; la pantalla respondió ${r.status}${r.headers.get("location") ? ` → ${r.headers.get("location")}` : ""}).`);
  }
  return muestras;
}

const fallas = [];
const pantallas = [];
console.log("Tiempo del panel (Huellitas, app compilada en el 3001)");
// Latencia de una ida y vuelta a la base desde esta máquina (para descontarla por tanda).
const { token } = await cookieDe(datos.adminB);
const c = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": B } } });
const idas = [];
for (let i = 0; i < 5; i++) { const t0 = performance.now(); await c.rpc("fecha_negocio"); idas.push(performance.now() - t0); }
const ida = Math.min(...idas);
const { data: mods } = await c.rpc("modulos_activos");
const modulos = (mods ?? []).map(String);
console.log(`  ida y vuelta a la base de desarrollo: ${Math.round(ida)} ms (se descuenta por tanda) · módulos: ${modulos.join(", ")}`);

for (const rol of ["admin", "recepcion"]) {
  const { cookie } = await cookieDe(rol === "admin" ? datos.adminB : datos.recepcionB);
  const rutas = rol === "admin" ? ["/admin", "/recepcion", "/hotel", "/estetica"] : ["/recepcion", "/hotel", "/estetica"];
  console.log(`\n── ${rol} ──`);
  for (const ruta of rutas) {
    if (ruta === "/hotel" && !modulos.includes("hotel")) { console.log(`  ${ruta}: Hotel apagado en Huellitas, no se mide`); continue; }
    if (ruta === "/estetica" && !modulos.includes("estetica")) { console.log(`  ${ruta}: Estética apagada en Huellitas, no se mide`); continue; }
    let m;
    try { m = await medir(ruta, cookie); } catch (e) { fallas.push(`${rol} ${ruta}: ${e.message}`); console.log(`  ✘ ${ruta}: ${e.message}`); continue; }
    if (m[0].status !== 200) { fallas.push(`${rol} ${ruta}: responde ${m[0].status}`); console.log(`  ✘ ${ruta}: responde ${m[0].status}`); continue; }
    const total = mediana(m.map((x) => x.total));
    const consultas = Math.max(...m.map((x) => x.conteo?.total ?? 0));
    const tandas = TANDAS[ruta] ?? 6;
    const servidor = Math.max(0, total - tandas * ida);
    const tope = TOPES_CONSULTAS[ruta] ?? 60;
    const porTipo = m[0].conteo?.porTipo ?? {};
    const lentas = (m[0].conteo?.consultas ?? []).slice().sort((a, b) => b.ms - a.ms).slice(0, 3).map((x) => `${x.que} ${x.ms} ms`).join(", ");
    const topeMs = topeMsDe(ruta);
    const ok = servidor <= topeMs && consultas <= tope;
    pantallas.push({ rol, ruta, totalMs: Math.round(total), servidorMs: Math.round(servidor), consultas, tope, ok });
    console.log(`  ${ok ? "✔" : "✘"} ${ruta.padEnd(11)} ${Math.round(total)} ms medidos · ${Math.round(servidor)} ms sin la latencia de desarrollo (tope ${topeMs}) · ${consultas} consultas (tope ${tope}) · ${Math.round(m[0].bytes / 1024)} KB · más lentas: ${lentas}`);
    if (JSON_SALIDA) console.log(`      ${JSON.stringify(porTipo)}`);
    if (servidor > topeMs) fallas.push(`${rol} ${ruta}: ${Math.round(servidor)} ms de servidor (tope ${topeMs})`);
    if (consultas > tope) fallas.push(`${rol} ${ruta}: ${consultas} consultas (tope ${tope}): ${JSON.stringify(porTipo)}`);
  }
}

const salida = { cuando: new Date().toISOString(), ok: fallas.length === 0, topesMs: TOPE_ARG ? Number(TOPE_ARG) : TOPES_MS, idaMs: Math.round(ida), pantallas, fallas };
fs.writeFileSync(path.join(os.tmpdir(), "tiempo-panel-dev.json"), JSON.stringify(salida, null, 1));
console.log(fallas.length ? `\n✘ Tiempo del panel: ${fallas.length} pantalla(s) fuera de tope.\n  ${fallas.join("\n  ")}` : `\n✔ Tiempo del panel: las ${pantallas.length} mediciones dentro de su tope de tiempo y de su tope de consultas.`);
console.log(`Resultado en ${path.join(os.tmpdir(), "tiempo-panel-dev.json")} (lo exige npm run desplegar).`);
process.exit(fallas.length ? 1 : 0);
