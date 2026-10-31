// Pendientes del médico de prueba, en PRODUCCIÓN (30 de octubre de 2026). Nunca en Ludogteka. Sale con 1 si algo falla.
//
//   node scripts/auditoria/qa-medico-prod.mjs [--fotos]
//
// 1. La regla de solo lectura desplegada bloquea «No se aplicó» y «Suspender esta medicación» (se busca en el código
//    que la app manda al navegador: en los negocios PRUEBA no hay hospitalizaciones para verlo en pantalla).
// 2-4. En prueba-qa-onboarding-vet-s16, con su admin y a 390 px, por la pantalla:
//    · «Tu equipo» dice «te damos un link para mandárselo» y no enseña «Falta…» antes de intentar;
//    · invita a «PRUEBA Invitado QA S16» (buzón de QA, sin teléfono): el formulario se limpia sin «Falta…», junto al
//      link salen «Copiar» y «Mandar por WhatsApp» (abre WhatsApp con el link en el mensaje);
//    · sin que esa persona abra su link, el admin le restablece la contraseña en Cuentas y con la temporal SÍ se
//      entra. La contraseña y el link solo viven en memoria: no se imprimen ni se guardan.
// 5. prueba-veterinaria no recibe el médico de prueba (su admin de QA ya era médico desde el 14 de octubre).
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { negocioPrueba, servicioSinNegocio, sesionDe, llavesProd, URL_PROD } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const FOTOS = process.argv.includes("--fotos");
const fallas = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { fallas.push(t); console.log(`  ✘ ${t}`); };
const S = servicioSinNegocio();
const SLUG = "prueba-qa-onboarding-vet-s16";
const CORREO = "tester-peludesk+invitado-vet-s16@mail.grokbot.com";
const NOMBRE = "PRUEBA Invitado QA S16";

const nav = await abrirNavegador();
try {
  // ── 1 ──
  console.log("\n1. Regla de solo lectura desplegada");
  {
    const n = await negocioPrueba("prueba-veterinaria");
    const ctx = await nav.newContext();
    await ctx.addCookies((await sesionDe((await n.N.from("membresias").select("profile_id").eq("negocio_id", n.negocio.id).eq("rol", "admin").is("deleted_at", null).limit(1).single()).data.profile_id, "prueba-veterinaria.peludesk.mx")).cookies);
    const p = await ctx.newPage();
    const scripts = [];
    p.on("response", async (r) => { if (/\.js(\?|$)/.test(r.url())) scripts.push(await r.text().catch(() => "")); });
    await p.goto(`${n.base}/veterinaria`, { waitUntil: "load" });
    await p.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const codigo = scripts.join("\n");
    if (/se aplic[oó]\)\|suspender/.test(codigo) || (codigo.includes("se aplicó") && codigo.includes("suspender"))) bien("el código desplegado bloquea «No se aplicó» y «Suspender…» en solo lectura");
    else mal("no encontré «No se aplicó» / «Suspender» en la regla desplegada");
    await ctx.close();
  }

  // ── 2 a 4 ──
  console.log(`\n2-4. «Tu equipo» y Cuentas en ${SLUG} (390 px)`);
  const n = await negocioPrueba(SLUG);
  const { data: yaId } = await S.rpc("usuario_por_email", { p_email: CORREO });
  if (yaId) console.log("  · la cuenta de prueba ya existe (corrida anterior): 2-4 necesitan una invitación nueva, se saltan");
  else {
    const { data: adm } = await n.N.from("membresias").select("profile_id").eq("negocio_id", n.negocio.id).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1).single();
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addCookies((await sesionDe(adm.profile_id, `${SLUG}.peludesk.mx`)).cookies);
    const p = await ctx.newPage();
    p.on("dialog", (d) => d.dismiss().catch(() => {}));
    await p.goto(`${n.base}/bienvenida/equipo`, { waitUntil: "load" });
    await p.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const radio = (await p.locator("[data-formulario-equipo] fieldset").innerText()).replace(/\s+/g, " ");
    if (/te damos un link para mandárselo/.test(radio) && !/le llega un link a su correo/.test(radio)) bien("«Invitar con cuenta: te damos un link para mandárselo…»");
    else mal(`el texto no cambió («${radio.slice(0, 120)}»)`);
    if (await p.locator("[data-falta-equipo]").isVisible().catch(() => false)) mal("con el formulario vacío ya dice «Falta…»"); else bien("con el formulario vacío no dice «Falta…»");
    await p.getByLabel("Nombre completo *").fill(NOMBRE);
    await p.getByLabel("Correo *").fill(CORREO);
    await p.getByRole("button", { name: "Invitar", exact: true }).click();
    await p.locator("[data-link-invitacion]").waitFor({ timeout: 20000 }).catch(() => {});
    if (!(await p.locator("[data-link-invitacion]").isVisible().catch(() => false))) mal("no salió el link de invitación");
    else {
      if (await p.locator("[data-falta-equipo]").isVisible().catch(() => false)) mal("tras invitar dice «Falta…»"); else bien("tras invitar, el formulario se limpió sin «Falta…»");
      if (await p.locator("[data-link-invitacion]").getByRole("button", { name: /^Copiar$/ }).count()) bien("junto al link está «Copiar»"); else mal("no está «Copiar»");
      if (FOTOS) await p.locator("[data-link-invitacion]").screenshot({ path: path.join(os.tmpdir(), "qa-medico-link-invitacion.png") }).catch(() => {});
      const [wa] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), p.locator("[data-mandar-invitacion]").click()]);
      await wa?.waitForURL(/wa\.me|whatsapp/, { timeout: 8000 }).catch(() => {});
      const url = wa ? decodeURIComponent(wa.url()) : "";
      if (/auth\/callback\?token_hash=/.test(url)) bien("«Mandar por WhatsApp» abre WhatsApp con el link en el mensaje (sin teléfono: escoges el chat)");
      else if (await p.locator("[data-abrir-whatsapp-panel]").isVisible().catch(() => false)) bien("«Mandar por WhatsApp»: el navegador no dejó abrir solo y enseña «Abrir WhatsApp»");
      else mal("«Mandar por WhatsApp» no abrió WhatsApp con el link");
      await wa?.close().catch(() => {});
    }
    const { data: id } = await S.rpc("usuario_por_email", { p_email: CORREO });
    const { data: u0 } = id ? await S.auth.admin.getUserById(id) : { data: null };
    if (!id) mal("la invitación no creó la cuenta");
    else if (u0?.user?.email_confirmed_at) mal("la cuenta invitada ya estaba confirmada: la prueba no sirve");
    else {
      bien("la persona invitada no ha abierto su link (correo sin confirmar)");
      await p.goto(`${n.base}/admin`, { waitUntil: "load" });
      await p.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const fila = p.locator("tr", { hasText: /tester.*invitado-vet-s16|PRUEBA Invitado/ }).first();
      await fila.scrollIntoViewIfNeeded().catch(() => {});
      await fila.getByRole("button", { name: "Restablecer contraseña" }).click();
      await fila.getByRole("button", { name: "Sí, restablecer" }).click();
      const campo = fila.locator("input[readonly]").first();
      await campo.waitFor({ timeout: 20000 }).catch(() => {});
      const temporal = await campo.inputValue().catch(() => "");
      if (!temporal) mal(`no salió la contraseña temporal («${(await fila.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120)}»)`);
      else {
        const cli = createClient(URL_PROD, llavesProd().anon, { auth: { persistSession: false } });
        const { error } = await cli.auth.signInWithPassword({ email: CORREO, password: temporal });
        if (error) mal(`con la temporal no se entra («${error.message}»)`);
        else { bien("con la contraseña temporal SÍ se entra: la cuenta quedó activa al restablecer"); await cli.auth.signOut({ scope: "local" }); }
      }
    }
    await ctx.close();
  }

  // ── 5 ──
  console.log("\n5. prueba-veterinaria sin médico");
  const pv = await negocioPrueba("prueba-veterinaria");
  // No se le agrega el médico de prueba (está en solo lectura). El que ya tenía (su admin de QA se designó médico el
  // 14 de octubre) es de QA y no se toca.
  const { data: idPrueba } = await S.rpc("usuario_por_email", { p_email: "tester-peludesk+medico-veterinaria@mail.grokbot.com" });
  const { data: meds } = await pv.N.from("medicos_veterinarios").select("profile_id").eq("negocio_id", pv.negocio.id).is("deleted_at", null);
  const { data: admins } = await pv.N.from("membresias").select("profile_id").eq("negocio_id", pv.negocio.id).eq("rol", "admin").is("deleted_at", null);
  const ajenos = (meds ?? []).filter((m) => !(admins ?? []).some((a) => a.profile_id === m.profile_id));
  if (idPrueba || ajenos.length) mal(`prueba-veterinaria tiene un médico que no es su admin (${ajenos.length}) o la cuenta de prueba existe`);
  else bien(`prueba-veterinaria: sin médico de prueba; ${(meds ?? []).length} médico(s), su propio admin de QA`);
} finally {
  await nav.close();
}
console.log(fallas.length ? `\n✘ ${fallas.length} falla(s).` : "\n✔ Pendientes del médico de prueba, en orden en producción.");
process.exit(fallas.length ? 1 : 0);
