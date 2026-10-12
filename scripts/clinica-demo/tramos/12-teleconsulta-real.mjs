// Tramo 12 · Teleconsulta con Daily REAL (producción; la sala se crea desde Vercel, no desde esta máquina: la red de la
// nube no alcanza *.daily.co). Agenda, sala real, liga por WhatsApp a 4441301539 con la plantilla aprobada (estado real
// por el webhook), consentimiento firmado por el dueño, la ventana, y las reclamaciones del token de Daily.
// NO se puede desde aquí: abrir la sala en el navegador (daily.co bloqueado) ni dictar durante la llamada.
import { BASE, comprobar, seccion, cuerpo, sinDesborde, hoyMx, dormir } from "../comun.mjs";

const horaMx = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const claims = (url) => {
  const t = new URL(url).searchParams.get("t") ?? "";
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8")); } catch { return null; }
};

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  seccion("12. Teleconsulta con Daily real");
  const { data: firu } = await S.from("perros").select("id, nombre").eq("negocio_id", NEG).eq("nombre", "Firulais").is("deleted_at", null).maybeSingle();
  comprobar(firu, "Firulais (perro de 4441301539) existe en la clínica");
  if (!firu) return;
  const rec = await c.abrir("recepcion");
  const r = rec.p;
  const inicio = new Date(Date.now() + 6 * 60000);
  // Una corrida anterior deja su cita viva y el médico no se empalma: se cancela antes de agendar.
  await S.from("vet_citas").update({ estado: "cancelada", cancelada_motivo: "Corrida anterior del recorrido" }).eq("negocio_id", NEG).eq("perro_id", firu.id).eq("tipo_clave", "teleconsulta").in("estado", ["programada", "confirmada"]).is("deleted_at", null);
  await r.goto(`${BASE}/veterinaria/agenda/nueva?perro=${firu.id}&fecha=${hoyMx()}`, { waitUntil: "networkidle" });
  await r.locator('select[name="tipo"]').waitFor({ timeout: 30000 });
  await r.locator('select[name="tipo"]').selectOption("teleconsulta");
  await r.locator('select[name="medico_id"]').selectOption({ index: 0 });
  await r.locator('input[name="fecha"]').fill(hoyMx());
  await r.locator('input[name="hora"]').fill(horaMx(inicio));
  await r.locator('textarea[name="motivo"]').fill("Seguimiento por video (demo)");
  await r.waitForTimeout(2500);
  await r.getByRole("button", { name: "Agendar cita" }).click();
  await r.waitForURL(/\/veterinaria\/teleconsulta\/[0-9a-f-]{36}/, { timeout: 60000 });
  const citaId = r.url().match(/teleconsulta\/([0-9a-f-]{36})/)[1];
  c.guardarEstado({ citaTele: citaId });
  await sinDesborde(r, "pantalla de la teleconsulta");
  let sala = null;
  for (let i = 0; i < 6 && !sala; i++) { sala = (await S.from("vet_telemedicina").select("proveedor, sala_nombre, sala_url, ventana_desde, ventana_hasta, estado").eq("negocio_id", NEG).eq("cita_id", citaId).maybeSingle()).data; if (!sala) await dormir(2000); }
  if (!sala) { // la sala no se creó sola al agendar: se pide con el botón
    const t0 = await cuerpo(r);
    console.log(`     · sin sala al agendar: ${t0.slice(-200)}`);
    if (await r.getByRole("button", { name: "Preparar la sala" }).count()) { await r.getByRole("button", { name: "Preparar la sala" }).click(); await dormir(8000); sala = (await S.from("vet_telemedicina").select("proveedor, sala_nombre, sala_url, ventana_desde, ventana_hasta, estado").eq("negocio_id", NEG).eq("cita_id", citaId).maybeSingle()).data; }
  }
  comprobar(sala?.proveedor === "daily" && /^https:\/\/[a-z0-9-]+\.daily\.co\/pd-/.test(sala?.sala_url ?? ""), `la sala es REAL de Daily (${sala?.proveedor}, ${(sala?.sala_url ?? "").replace(/pd-.*/, "pd-…")})`);
  if (!sala) { await rec.c.close(); return; }
  const dur = (Date.parse(sala.ventana_hasta) - Date.parse(sala.ventana_desde)) / 60000;
  comprobar(dur >= 45 && dur <= 90, `la ventana es de la cita −15 min a +30 min (${Math.round(dur)} min en total)`);

  // Liga y mensaje por WhatsApp con la plantilla aprobada.
  await r.getByRole("button", { name: "Generar liga para el dueño" }).click();
  await r.getByRole("button", { name: "Enviar por WhatsApp" }).waitFor({ timeout: 30000 });
  const liga = await r.locator("input[readonly]").first().inputValue().catch(() => "");
  comprobar(/\/t\/[A-Za-z0-9_-]{30,}/.test(liga), "la liga del dueño es un token largo");
  await r.getByRole("button", { name: "Enviar por WhatsApp" }).click();
  await r.waitForTimeout(6000);
  const tx = await cuerpo(r);
  comprobar(/Mensaje enviado por WhatsApp/.test(tx), `el servidor mandó la plantilla peludesk_teleconsulta_v1 (${/Mensaje enviado/.test(tx) ? "ok" : tx.slice(-140)})`);
  let ent = null;
  for (let i = 0; i < 12; i++) {
    const { data } = await servicio().from("wa_entregas").select("estado, error_codigo, origen, tipo, motivo").eq("origen", "teleconsulta").eq("ref_id", citaId).order("aceptado_at", { ascending: false }).limit(1).maybeSingle();
    ent = data;
    if (ent && ["entregado", "leido", "fallido"].includes(ent.estado)) break;
    await dormir(5000);
  }
  console.log(`     · estado de entrega de la liga por el webhook: ${JSON.stringify(ent)}`);
  comprobar(ent?.estado === "entregado" || ent?.estado === "leido", "la liga de la teleconsulta llegó a «delivered»");

  // El dueño (sin sesión) firma el consentimiento desde su celular.
  const pub = await c.abrir(null);
  await pub.p.goto(liga, { waitUntil: "networkidle" });
  comprobar(/Firma el consentimiento/.test(await cuerpo(pub.p)), "el dueño ve el paso de firmar");
  comprobar(!(await pub.p.getByRole("button", { name: "Entrar a la videollamada" }).count()), "sin firmar no aparece «Entrar a la videollamada»");
  await pub.p.getByLabel("Leí el consentimiento y estoy de acuerdo.").check();
  await pub.p.getByLabel("Tu nombre completo").fill("Cliente de ejemplo");
  const lienzo = pub.p.locator('canvas[aria-label="Recuadro de firma"]');
  await lienzo.scrollIntoViewIfNeeded();
  const caja = await lienzo.boundingBox();
  await pub.p.mouse.move(caja.x + 20, caja.y + 40);
  await pub.p.mouse.down();
  for (let i = 1; i <= 12; i++) await pub.p.mouse.move(caja.x + 20 + i * 12, caja.y + 40 + (i % 2) * 30);
  await pub.p.mouse.up();
  await sinDesborde(pub.p, "liga del dueño");
  await pub.p.getByRole("button", { name: "Firmar el consentimiento" }).click();
  await pub.p.waitForTimeout(6000);
  comprobar(/Firmado por/.test(await cuerpo(pub.p)), "consentimiento firmado por el dueño");
  // La sala para el dueño: el token de Daily trae lo que prometemos.
  await pub.p.getByRole("button", { name: "Entrar a la videollamada" }).click();
  await pub.p.waitForTimeout(8000);
  const urlSala = await pub.p.locator("iframe").first().getAttribute("src").catch(() => null);
  const cl = urlSala ? claims(urlSala) : null;
  console.log(`     · iframe de la sala: ${urlSala ? urlSala.replace(/\?t=.*/, "?t=<token>") : "no apareció"}`);
  comprobar(Boolean(urlSala) && /daily\.co\/pd-/.test(urlSala), "al dueño se le abre la sala real de Daily");
  if (cl) {
    comprobar(cl.o !== true, "el token del dueño NO es de moderador");
    comprobar(cl.nbf && cl.exp && cl.exp - cl.nbf > 3000 && cl.exp - cl.nbf < 6000, "el token tiene ventana (nbf/exp) de la cita");
    comprobar(cl.ejt === true || cl.eject_at_token_exp === true || JSON.stringify(cl).includes("ejt"), `el token expulsa al vencer (${Object.keys(cl).join(",")})`);
  }
  // El médico (con su sesión) entra por su botón.
  const med = await c.abrir("mvz");
  await med.p.goto(`${BASE}/veterinaria/teleconsulta/${citaId}`, { waitUntil: "networkidle" });
  await sinDesborde(med.p, "pantalla del médico");
  const entrar = med.p.getByRole("button", { name: "Entrar a la sala" });
  if (!(await entrar.count())) console.log(`     · sin botón «Entrar a la sala»: ${(await cuerpo(med.p)).slice(0, 600)}`);
  await entrar.click({ timeout: 15000 });
  await med.p.waitForTimeout(8000);
  const urlMed = await med.p.locator("iframe").first().getAttribute("src").catch(() => null);
  const cm = urlMed ? claims(urlMed) : null;
  comprobar(Boolean(urlMed) && cm?.o === true, "el médico entra como moderador (is_owner)");
  console.log("     · NO PROBADO desde aquí: abrir la sala en el navegador y dictar durante la llamada (la red de la nube no alcanza daily.co).");
  for (const x of [rec, pub, med]) await x.c.close();
}

import { servicioEn } from "../../lib/prod.mjs";
import { estado } from "../../lib/prod.mjs";
function servicio() { return servicioEn(estado().negocioId); }
