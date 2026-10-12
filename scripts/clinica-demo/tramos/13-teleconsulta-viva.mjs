// Tramo 13 · Teleconsulta EN VIVO con dos navegadores (médico a 1280 px, dueño a 390 px) contra Daily real.
// Desde la nube no se puede (daily.co está fuera de sus dominios): este tramo es para una máquina con red.
//   node scripts/clinica-demo/recorrido.mjs 13
// Comprueba: video y audio entre ambos (pistas vivas, cuadros que avanzan, nivel de audio del otro lado), dictado durante la llamada
// que pasa al expediente, y la EXPULSIÓN al vencer el token (segunda cita con la ventana acortada por el servidor: la de verdad
// termina 30 min después de la cita; aquí solo se adelanta el reloj de la fila de prueba, el vencimiento lo hace Daily).
// Las capturas quedan en la carpeta temporal (peludesk-viva-*.png).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BASE, comprobar, seccion, cuerpo, dormir, hoyMx } from "../comun.mjs";

export const horaMx = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const FOTO = (n) => path.join(os.tmpdir(), `peludesk-viva-${n}.png`);
const FRASE =
  "Llega Firulais, un perro labrador de cinco años, por vómito desde ayer. El dueño dice que ya no quiere comer. " +
  "A la exploración la temperatura es de treinta y nueve punto cinco grados y pesa veintiocho kilos. " +
  "Mucosas rosadas, deshidratación leve, dolor a la palpación abdominal. " +
  "Mi impresión diagnóstica es gastroenteritis. Plan: dieta blanda, suero subcutáneo y revisión en tres días.";

async function audioDePrueba() {
  const wav = path.join(os.tmpdir(), "peludesk-dictado-es.wav");
  if (fs.existsSync(wav)) return;
  const llave = process.env.ELEVENLABS_API_KEY;
  if (!llave) throw new Error("Falta ELEVENLABS_API_KEY para generar el dictado de prueba.");
  const voz = process.env.ELEVENLABS_VOICE_ID || "9Godp7dNohUvXk6qp0gS";
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": llave, "Content-Type": "application/json" },
    body: JSON.stringify({ text: FRASE, model_id: "eleven_multilingual_v2", language_code: "es" }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
  const mp3 = path.join(os.tmpdir(), "peludesk-dictado-es.mp3");
  fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", "-ac", "1", wav]);
}

/** Lo que se ve y se oye dentro del iframe de Daily. */
async function medios(marco) {
  return marco.evaluate(async () => {
    const lee = () => [...document.querySelectorAll("video")].map((v) => ({
      w: v.videoWidth, h: v.videoHeight, t: v.currentTime, local: v.muted,
      vivas: (v.srcObject?.getVideoTracks() ?? []).filter((x) => x.readyState === "live").length,
    }));
    const a = lee();
    const audios = [...document.querySelectorAll("audio, video")].map((e) => e.srcObject).filter((s) => s && s.getAudioTracks().length);
    let nivel = 0;
    try {
      const ctx = new AudioContext();
      await ctx.resume();
      const analizadores = audios.map((s) => {
        const an = ctx.createAnalyser(); an.fftSize = 2048;
        ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(an);
        return an;
      });
      const buf = new Float32Array(2048);
      const fin = Date.now() + 3500;
      while (Date.now() < fin) {
        for (const an of analizadores) { an.getFloatTimeDomainData(buf); nivel = Math.max(nivel, Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)); }
        await new Promise((r) => setTimeout(r, 100));
      }
      await ctx.close();
    } catch { /* sin AudioContext */ }
    const b = lee();
    return { videos: b, avanzan: b.filter((v, i) => a[i] && v.t > a[i].t).length, pistasDeAudio: audios.length, nivel: Number(nivel.toFixed(4)) };
  });
}

const marcoDaily = (pagina) => pagina.frames().find((f) => /daily\.co/.test(f.url()));
export async function unirse(pagina, quien) {
  const marco = await (async () => { for (let i = 0; i < 40; i++) { const m = marcoDaily(pagina); if (m) return m; await dormir(1000); } return null; })();
  if (!marco) return null;
  await dormir(6000);
  // Daily Prebuilt puede pedir confirmar cámara y micrófono antes de entrar.
  for (const nombre of [/^(Join|Unirse|Entrar|Join meeting|Join call)/i]) {
    const b = marco.getByRole("button", { name: nombre }).first();
    if (await b.count().catch(() => 0)) { await b.click({ timeout: 8000 }).catch(() => {}); console.log(`     · ${quien}: confirmó la pantalla previa de Daily`); await dormir(5000); }
  }
  return marco;
}

export async function agendar(r, perro, inicio, motivo) {
  await r.goto(`${BASE}/veterinaria/agenda/nueva?perro=${perro}&fecha=${hoyMx()}`, { waitUntil: "networkidle" });
  await r.locator('select[name="tipo"]').waitFor({ timeout: 30000 });
  await r.locator('select[name="tipo"]').selectOption("teleconsulta");
  await r.locator('select[name="medico_id"]').selectOption({ index: 0 });
  await r.locator('input[name="fecha"]').fill(hoyMx());
  await r.locator('input[name="hora"]').fill(horaMx(inicio));
  await r.locator('textarea[name="motivo"]').fill(motivo);
  await r.waitForTimeout(2500);
  await r.getByRole("button", { name: "Agendar cita" }).click();
  await r.waitForURL(/\/veterinaria\/teleconsulta\/[0-9a-f-]{36}/, { timeout: 60000 }).catch(async () => { throw new Error(`no se pudo agendar: ${(await cuerpo(r)).slice(-300)}`); });
  return r.url().match(/teleconsulta\/([0-9a-f-]{36})/)[1];
}

export async function ligaYFirma(c, r, citaId) {
  await r.getByRole("button", { name: "Generar liga para el dueño" }).click();
  await r.getByRole("button", { name: "Enviar por WhatsApp" }).waitFor({ timeout: 30000 });
  const liga = await r.locator("input[readonly]").first().inputValue();
  const dueno = await c.abrir(null, { viewport: { width: 390, height: 844 }, permisos: ["camera", "microphone"] });
  const p = dueno.p;
  await p.goto(liga, { waitUntil: "networkidle" });
  await p.getByLabel("Leí el consentimiento y estoy de acuerdo.").check();
  await p.getByLabel("Tu nombre completo").fill("Cliente de ejemplo");
  const lienzo = p.locator('canvas[aria-label="Recuadro de firma"]');
  await lienzo.scrollIntoViewIfNeeded();
  const caja = await lienzo.boundingBox();
  await p.mouse.move(caja.x + 20, caja.y + 40);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(caja.x + 20 + i * 12, caja.y + 40 + (i % 2) * 30);
  await p.mouse.up();
  await p.getByRole("button", { name: "Firmar el consentimiento" }).click();
  await p.getByText(/Firmado por/).first().waitFor({ timeout: 30000 });
  return { dueno, liga };
}

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  await audioDePrueba();
  seccion("13. Teleconsulta en vivo: médico (1280 px) y dueño (390 px) contra Daily real");
  const { data: perros } = await S.from("perros").select("id, nombre").eq("negocio_id", NEG).is("deleted_at", null).order("created_at");
  const firu = perros.find((x) => x.nombre === "Firulais");
  const otro = perros.find((x) => x.id !== firu.id) ?? firu;
  await S.from("vet_citas").update({ estado: "cancelada", cancelada_motivo: "Corrida anterior de la prueba en vivo" }).eq("negocio_id", NEG).eq("tipo_clave", "teleconsulta").in("estado", ["programada", "confirmada", "en_curso"]).is("deleted_at", null);

  seccion("13a. Cita para dentro de pocos minutos; médico y dueño entran");
  const rec = await c.abrir("recepcion");
  const citaId = await agendar(rec.p, firu.id, new Date(Date.now() + 3 * 60000), "Prueba en vivo: video, audio y dictado");
  c.guardarEstado({ citaViva: citaId });
  const { dueno } = await ligaYFirma(c, rec.p, citaId);
  await rec.c.close();

  const med = await c.abrir("mvz", { viewport: { width: 1280, height: 860 }, permisos: ["camera", "microphone"] });
  await med.p.goto(`${BASE}/veterinaria/teleconsulta/${citaId}`, { waitUntil: "networkidle" });
  await med.p.getByRole("button", { name: "Entrar a la sala" }).click({ timeout: 20000 });
  await dueno.p.getByRole("button", { name: "Entrar a la videollamada" }).click({ timeout: 20000 });
  const mM = await unirse(med.p, "médico");
  const mD = await unirse(dueno.p, "dueño");
  comprobar(Boolean(mM) && Boolean(mD), "los dos abren la sala de Daily (iframe de daily.co)");
  if (!mM || !mD) { await dueno.c.close(); await med.c.close(); return; }
  await dormir(8000);
  await med.p.screenshot({ path: FOTO("medico-llamada") });
  await dueno.p.screenshot({ path: FOTO("dueno-llamada") });
  const m1 = await medios(mM);
  const m2 = await medios(mD);
  console.log(`     · médico ve: ${JSON.stringify(m1)}`);
  console.log(`     · dueño ve: ${JSON.stringify(m2)}`);
  comprobar(m1.videos.filter((v) => v.w > 0 && v.vivas > 0).length >= 2 && m1.avanzan >= 2, "el médico ve su video y el del dueño, con cuadros que avanzan");
  comprobar(m2.videos.filter((v) => v.w > 0 && v.vivas > 0).length >= 2 && m2.avanzan >= 2, "el dueño ve su video y el del médico, con cuadros que avanzan");
  comprobar(m1.pistasDeAudio >= 1 && m1.nivel > 0.005, `el médico oye al dueño (nivel de audio ${m1.nivel})`);
  comprobar(m2.pistasDeAudio >= 1 && m2.nivel > 0.005, `el dueño oye al médico (nivel de audio ${m2.nivel})`);

  seccion("13b. Dictar durante la llamada y pasar el borrador al expediente");
  const consulta = await med.c.newPage();
  consulta.setDefaultNavigationTimeout(60000);
  await consulta.goto(`${BASE}/veterinaria/teleconsulta/${citaId}`, { waitUntil: "networkidle" });
  await consulta.getByRole("button", { name: "Iniciar la consulta" }).click({ timeout: 20000 }).catch(() => {});
  await consulta.waitForURL(/\/veterinaria\/consulta\//, { timeout: 40000 });
  const consultaId = consulta.url().split("/").pop();
  await consulta.getByRole("button", { name: "Dictar", exact: true }).click({ timeout: 30000 });
  await consulta.getByLabel(/Ya le avisé al dueño/).check();
  await consulta.getByRole("button", { name: "Empezar a grabar" }).click();
  await consulta.getByRole("timer").waitFor({ timeout: 15000 });
  await consulta.waitForTimeout(34000);
  // La llamada sigue viva mientras se dicta.
  const durante = await medios(mM);
  comprobar(durante.avanzan >= 2, "la llamada sigue viva mientras el médico dicta");
  await consulta.getByRole("button", { name: "Detener y transcribir" }).click();
  const hecho = await consulta.getByText("Borrador hecho con IA").waitFor({ timeout: 180000 }).then(() => true).catch(() => false);
  const tn = (await cuerpo(consulta)).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  comprobar(hecho, "Scribe y Claude arman el borrador");
  if (hecho) {
    comprobar(/vomito/.test(tn) && /dieta blanda/.test(tn) && /39[.,]5/.test(tn), "el borrador conserva lo dictado (vómito, 39.5, dieta blanda)");
    await consulta.getByRole("button", { name: "Pasar al expediente" }).click();
    await consulta.getByText("Pasado al expediente").waitFor({ timeout: 20000 });
    await consulta.waitForTimeout(4000);
    const { data: cs } = await S.from("vet_consultas").select("modalidad, subjetivo, plan").eq("id", consultaId).maybeSingle();
    console.log(`     · consulta ${consultaId}: modalidad ${cs?.modalidad ?? "?"}`);
    const { data: dic } = await S.from("vet_dictados").select("estado, audio_path").eq("negocio_id", NEG).eq("consulta_id", consultaId);
    comprobar(dic?.length === 1 && dic[0].estado === "listo" && !dic[0].audio_path, "el dictado queda registrado y el audio borrado");
  }
  await med.p.screenshot({ path: FOTO("medico-despues-dictado") });
  await dueno.c.close();
  await med.c.close();

  seccion("13c. Expulsión al vencer (segunda cita con la ventana acortada)");
  const rec2 = await c.abrir("recepcion");
  const cita2 = await agendar(rec2.p, otro.id, new Date(Date.now() + 130 * 60000), "Prueba de expulsión");
  const { dueno: d2 } = await ligaYFirma(c, rec2.p, cita2);
  await rec2.c.close();
  const ahora = Date.now();
  const hasta = new Date(ahora + 3.5 * 60000).toISOString();
  const up = await S.from("vet_telemedicina").update({ ventana_desde: new Date(ahora - 60000).toISOString(), ventana_hasta: hasta }).eq("negocio_id", NEG).eq("cita_id", cita2);
  comprobar(!up.error, `ventana de la segunda cita acortada a 3.5 min (${up.error?.message ?? "ok"})`);
  const m2c = await c.abrir("mvz", { viewport: { width: 1280, height: 860 }, permisos: ["camera", "microphone"] });
  await m2c.p.goto(`${BASE}/veterinaria/teleconsulta/${cita2}`, { waitUntil: "networkidle" });
  await m2c.p.getByRole("button", { name: "Entrar a la sala" }).click({ timeout: 20000 });
  await d2.p.getByRole("button", { name: "Entrar a la videollamada" }).click({ timeout: 20000 });
  const a = await unirse(m2c.p, "médico (2)");
  const b = await unirse(d2.p, "dueño (2)");
  await dormir(6000);
  const antes = await medios(b);
  comprobar(antes.videos.filter((v) => v.w > 0).length >= 1, "antes de vencer, el dueño está dentro de la llamada");
  console.log(`     · esperando a que Daily expulse (vence ${hasta})…`);
  while (Date.now() < Date.parse(hasta) + 45000) await dormir(5000);
  await dormir(15000);
  await d2.p.screenshot({ path: FOTO("dueno-expulsado") });
  await m2c.p.screenshot({ path: FOTO("medico-expulsado") });
  const textoDueno = ((await b.evaluate(() => document.body.innerText).catch(() => "")) || "").replace(/\s+/g, " ");
  const textoMed = ((await a.evaluate(() => document.body.innerText).catch(() => "")) || "").replace(/\s+/g, " ");
  const despuesD = await b.evaluate(() => [...document.querySelectorAll("video")].filter((v) => v.videoWidth > 0 && v.srcObject?.getVideoTracks().some((t) => t.readyState === "live")).length).catch(() => 0);
  const despuesM = await a.evaluate(() => [...document.querySelectorAll("video")].filter((v) => v.videoWidth > 0 && v.srcObject?.getVideoTracks().some((t) => t.readyState === "live")).length).catch(() => 0);
  console.log(`     · dueño al vencer: «${textoDueno.slice(0, 160)}» (videos vivos: ${despuesD})`);
  console.log(`     · médico al vencer: «${textoMed.slice(0, 160)}» (videos vivos: ${despuesM})`);
  comprobar(despuesD === 0 && despuesM === 0, "al vencer el token Daily saca a los dos de la sala");
  await d2.c.close();
  await m2c.c.close();
}
