// Ayudas de los videos de teleconsulta (91 y 92): dispositivos falsos de cámara y micrófono para el navegador que graba y
// «actores» en segundo plano (el médico o el dueño del otro lado de la llamada), cada uno con su propio navegador y su sesión.
// SOLO desarrollo y SOLO el negocio demo.
import fs from "node:fs";
import { abrirNavegador } from "../../lib/navegador.mjs";
import { conectar } from "./db.mjs";
import { cookiesDe } from "./sesion.mjs";

export const argsDeMedios = ({ audio } = {}) => ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", ...(audio && fs.existsSync(audio) ? [`--use-file-for-fake-audio-capture=${audio}`] : [])];

const abiertos = [];
export async function cerrarActores() {
  while (abiertos.length) await abiertos.pop().close().catch(() => {});
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un navegador en segundo plano con la sesión de `rol` (o sin sesión) y permiso de cámara y micrófono. */
export async function actor({ rol, base, ancho = 1280, alto = 860 }) {
  const nav = await abrirNavegador(argsDeMedios());
  abiertos.push(nav);
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, locale: "es-MX", timezoneId: "America/Mexico_City", permissions: ["camera", "microphone"] });
  if (rol) {
    const c = conectar(false);
    const anon = fs.readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
    await ctx.addCookies(await cookiesDe(c, rol, new URL(base).host.split(":")[0], anon));
  }
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  return { page, ctx, nav };
}

/** Entra a la sala de Daily que está en un iframe de `page` (confirma la pantalla previa si sale). */
export async function unirseASala(page) {
  let marco = null;
  for (let i = 0; i < 40 && !marco; i++) {
    marco = page.frames().find((f) => /daily\.co/.test(f.url()));
    if (!marco) await dormir(1000);
  }
  if (!marco) throw new Error("No apareció la sala de Daily.");
  await dormir(5000);
  const boton = marco.getByRole("button", { name: /^(Join|Unirse|Entrar)/i }).first();
  if (await boton.count().catch(() => 0)) {
    await boton.click({ timeout: 8000 }).catch(() => {});
    await dormir(4000);
  }
  return marco;
}

/** El dueño (sin sesión) abre su liga, firma el consentimiento y entra a la sala. Devuelve el actor para que siga en la llamada. */
export async function duenoEntra({ base, liga, entrar = true }) {
  const a = await actor({ rol: null, base, ancho: 390, alto: 844 });
  const p = a.page;
  await p.goto(base + new URL(liga, base).pathname, { waitUntil: "networkidle" });
  await p.getByLabel("Leí el consentimiento y estoy de acuerdo.").check();
  const nombre = p.getByLabel("Tu nombre completo");
  if (!(await nombre.inputValue())) await nombre.fill("Dueño de ejemplo");
  const lienzo = p.locator('canvas[aria-label="Recuadro de firma"]');
  await lienzo.scrollIntoViewIfNeeded();
  const caja = await lienzo.boundingBox();
  await p.mouse.move(caja.x + 20, caja.y + 40);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(caja.x + 20 + i * 12, caja.y + 40 + (i % 2) * 30);
  await p.mouse.up();
  await p.getByRole("button", { name: "Firmar el consentimiento" }).click();
  await p.getByText(/Firmado por/).first().waitFor({ timeout: 30000 });
  if (entrar) {
    await p.getByRole("button", { name: "Entrar a la videollamada" }).click({ timeout: 20000 });
    await unirseASala(p);
  }
  return a;
}

/** El médico (con su sesión) entra a la sala de una cita de teleconsulta. */
export async function medicoEntra({ base, rol = "mvz", ruta }) {
  const a = await actor({ rol, base });
  await a.page.goto(base + ruta, { waitUntil: "networkidle" });
  await a.page.getByRole("button", { name: "Entrar a la sala" }).click({ timeout: 20000 });
  await unirseASala(a.page);
  return a;
}

const horaMx = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const hoyMx = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * Agenda una teleconsulta (como el médico, con la pantalla de verdad), genera la liga del dueño y deja al médico listo.
 * Devuelve el actor del médico, el id de la cita y la ruta de la liga del dueño.
 */
export async function agendarTeleconsulta({ base, perroId, minutos = 6, motivo = "Seguimiento" }) {
  const med = await actor({ rol: "mvz", base });
  const r = med.page;
  await r.goto(`${base}/veterinaria/agenda/nueva?perro=${perroId}&fecha=${hoyMx()}`, { waitUntil: "networkidle" });
  await r.locator('select[name="tipo"]').selectOption("teleconsulta");
  await r.locator('select[name="medico_id"]').selectOption({ label: "Dr. Emilio Navarro" });
  await r.locator('input[name="hora"]').fill(horaMx(new Date(Date.now() + minutos * 60000)));
  await r.locator('textarea[name="motivo"]').fill(motivo);
  await r.waitForTimeout(1500);
  await r.getByRole("button", { name: "Agendar cita" }).click();
  await r.waitForURL(/\/veterinaria\/teleconsulta\/[0-9a-f-]{36}/, { timeout: 60000 });
  const citaId = r.url().match(/teleconsulta\/([0-9a-f-]{36})/)[1];
  await r.getByRole("button", { name: "Generar liga para el dueño" }).click();
  await r.getByRole("button", { name: "Enviar por WhatsApp" }).waitFor({ timeout: 30000 });
  const liga = await r.locator("input[readonly]").first().inputValue();
  return { med, citaId, liga: new URL(liga, base).pathname, ruta: `/veterinaria/teleconsulta/${citaId}` };
}

/** El médico (actor ya abierto) entra a la sala de su cita. */
export async function medicoYaEntra(med, ruta, base) {
  await med.page.goto(base + ruta, { waitUntil: "networkidle" });
  await med.page.getByRole("button", { name: "Entrar a la sala" }).click({ timeout: 20000 });
  await unirseASala(med.page);
}
