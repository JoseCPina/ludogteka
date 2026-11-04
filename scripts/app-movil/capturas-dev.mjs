// Capturas de la app nativa (apps/duenos-movil) renderizada en Chromium a tamaño de un Android (Pixel 7, 412×915), con
// el MISMO código, contra la base de DESARROLLO. Sirve cuando no hay emulador de Android en la máquina (sin hipervisor).
//
//   1. cd apps/duenos-movil && npx expo export --platform web --output-dir <carpeta>
//   2. node <servir-web.mjs> <carpeta>   (sirve el export en el 8099 y pasa /api/movil a la app del 3001)
//   3. node scripts/app-movil/capturas-dev.mjs <carpeta de capturas>
//
// Entra como un dueño de Huellitas (código verificado en la base, como en las auditorías) y recorre cada pantalla.
// Sube una alerta de prueba para capturar su detalle y la borra al final.
import fs from "node:fs";
import path from "node:path";
import { A, URL } from "../auditoria/sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Solo desarrollo.");
const SALIDA = process.argv[2] ?? "capturas-app";
fs.mkdirSync(SALIDA, { recursive: true });
const BASE = "http://127.0.0.1:8099";
const API = "http://app.localhost:3001/api/movil";
const llamar = async (accion, args = [], token = null) => (await fetch(`${API}/${accion}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ args }) })).json();

// El dueño con más cosas que enseñar: mascotas con vínculo en Huellitas.
const { data: hue } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const { data: vinc } = await A.from("mascotas_vinculos").select("mascota_id").eq("negocio_id", hue.id).is("deleted_at", null).limit(50);
let dueno = null;
for (const v of vinc ?? []) {
  const { data: m } = await A.from("mascotas").select("id, dueno_id").eq("id", v.mascota_id).is("deleted_at", null).maybeSingle();
  if (!m) continue;
  const { data: d } = await A.from("duenos").select("id, telefono").eq("id", m.dueno_id).maybeSingle();
  const { count } = await A.from("mascotas").select("id", { count: "exact", head: true }).eq("dueno_id", m.dueno_id).is("deleted_at", null);
  if (d?.telefono && count >= 1 && count <= 4) { dueno = { ...d, mascota: m.id }; break; }
}
if (!dueno) throw new Error("No hay un dueño de Huellitas con mascota en la app.");
const p = await llamar("pedirCodigo", [dueno.telefono]);
await A.from("app_entradas").update({ estado: "verificada", verificada_at: new Date().toISOString() }).eq("id", p.entrada.id);
const { tokens } = await llamar("canjearEntrada", [p.entrada.id]);
const P = { lat: 22.1565, lng: -100.9855 };

const navegador = await abrirNavegador();
const contexto = await navegador.newContext({
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: "es-MX",
  userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
  geolocation: { latitude: P.lat, longitude: P.lng }, permissions: ["geolocation"],
});
const pagina = await contexto.newPage();
const tomar = async (nombre, ruta, espera = 2500) => {
  await pagina.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" }).catch(() => {});
  await pagina.waitForTimeout(espera);
  await pagina.screenshot({ path: path.join(SALIDA, `${nombre}.png`) });
  console.log(`  ✔ ${nombre}`);
};

await tomar("01-entrar", "/entrar", 1500);
await pagina.evaluate((t) => localStorage.setItem("peludesk.sesion", JSON.stringify(t)), tokens);
const id = dueno.mascota;
await tomar("02-mis-mascotas", "/");
await tomar("03-ficha-mascota", `/mascotas/${id}`);
await tomar("04-cartilla", `/mascotas/${id}/cartilla`);
await tomar("05-peso-medicinas-gastos", `/mascotas/${id}/seguimiento`);
await tomar("06-placa-qr", `/mascotas/${id}/qr`);
await tomar("07-mascota-perdida", `/mascotas/${id}/perdida`);
await tomar("08-pedir-cita", `/mascotas/${id}/cita`);
await tomar("09-reservar", `/mascotas/${id}/reservar`);
await tomar("10-en-su-negocio", `/mascotas/${id}/negocio/${hue.id}`);
await tomar("11-mis-visitas", "/visitas");
await tomar("12-por-pagar", "/pagos");
await tomar("13-pases", "/pases");
await tomar("14-contratos", "/contratos");
await tomar("15-avisos", "/avisos");
await tomar("16-mi-cuenta", "/yo");
await tomar("17-nueva-mascota", "/mascotas/nueva");
await tomar("18-cerca-de-mi", "/cerca", 6000);
// Una alerta de prueba para el mapa de alertas y su detalle.
const foto = await (await import("sharp")).default({ create: { width: 800, height: 600, channels: 3, background: { r: 150, g: 110, b: 70 } } }).jpeg().toBuffer();
const form = new FormData();
form.append("foto", new Blob([foto], { type: "image/jpeg" }), "a.jpg");
form.append("args", JSON.stringify(["$form"]));
for (const [k, v] of Object.entries({ tipo: "herido", especie: "perro", descripcion: "Cojea de la pata de atrás, está junto a la tienda de la esquina.", color: "café", tamano: "mediano", lat: String(P.lat + 0.004), lng: String(P.lng + 0.003) })) form.append(k, v);
const alerta = await (await fetch(`${API}/crearAlerta`, { method: "POST", headers: { authorization: `Bearer ${tokens.accessToken}` }, body: form })).json();
await tomar("19-alertas", "/alertas", 4000);
await tomar("20-nueva-alerta", "/alertas/nueva", 4000);
if (alerta.id) await tomar("21-detalle-alerta", `/alertas/${alerta.id}`, 3500);
await navegador.close();
if (alerta.id) {
  const { data: f } = await A.from("alertas_calle").select("foto_path").eq("id", alerta.id).single();
  await A.storage.from("alertas-calle").remove([f.foto_path]);
  await A.from("alertas_calle").delete().eq("id", alerta.id);
}
await A.from("app_avisos").delete().eq("tipo", "alerta").gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
await A.from("app_entradas").delete().eq("id", p.entrada.id);
console.log(`Capturas en ${SALIDA}`);
