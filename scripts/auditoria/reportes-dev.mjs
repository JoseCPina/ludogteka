// Uso: node scripts/auditoria/reportes-dev.mjs   (SOLO DESARROLLO, Huellitas; servidor en :3001)
//
// De punta a punta, en el navegador, como recepción de Huellitas:
//   «Buen día» → «Dejar listo» (se dibuja la tarjeta) → «Enviar por WhatsApp»
//   (wa.me con la liga) → la liga pública en el dominio del negocio, sin sesión
//   (imagen 1080×1350, logo, sin datos del dueño) → «Repetir el de ayer».
// Capturas en %TEMP%\reportes-e2e-*.png (1024 y 390).
import os from "node:os";
import path from "node:path";
import { A } from "./sesiones-dev.mjs";
import { prepararHuellitas } from "./reportes-datos-dev.mjs";
import { cookiesDe, PUERTO, servicioEn } from "./reportes-sesion-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

let fallos = 0;
const ok = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) fallos++; };
const D = await prepararHuellitas();
const SH = servicioEn(D.H);
const base = `http://huellitas.localhost:${PUERTO}`;
const foto = (n) => path.join(os.tmpdir(), `reportes-e2e-${n}.png`);

// Limpio lo de hoy de Firulais y dejo un reporte de AYER para «Repetir el de ayer».
const { data: hoyRep } = await SH.from("reportes_guarderia").select("id, contenido").eq("perro_id", D.firulais).eq("fecha", D.hoy).maybeSingle();
const ayer = new Date(new Date(`${D.hoy}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
await SH.from("reportes_guarderia").delete().eq("perro_id", D.firulais).eq("fecha", ayer);
if (hoyRep) {
  await SH.from("reportes_guarderia").insert({ perro_id: D.firulais, fecha: ayer, estado: "enviado", contenido: hoyRep.contenido });
  await SH.from("enlaces_cliente").delete().eq("reporte_id", hoyRep.id);
  await SH.from("reportes_guarderia_versiones").delete().eq("reporte_id", hoyRep.id);
  await SH.from("reportes_guarderia").delete().eq("id", hoyRep.id);
}
const { data: previos } = await SH.from("reportes_guarderia").select("id").eq("perro_id", D.pelusa).eq("fecha", D.hoy);
for (const r of previos ?? []) {
  await SH.from("enlaces_cliente").delete().eq("reporte_id", r.id);
  await SH.from("reportes_guarderia_versiones").delete().eq("reporte_id", r.id);
  await SH.from("reportes_guarderia").delete().eq("id", r.id);
}

const nav = await abrirNavegador();
try {
  for (const [nombre, ancho, alto] of [["tablet", 1024, 768], ["celular", 390, 844]]) {
    const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 500 });
    await ctx.addCookies(await cookiesDe(D.recepcionB));
    const p = await ctx.newPage();
    await p.goto(`${base}/guarderia/reportes`, { waitUntil: "networkidle" });
    ok(await p.getByText("Reportes del día").first().isVisible(), `[${nombre}] panel «Reportes del día»`);
    await p.screenshot({ path: foto(`${nombre}-panel`), fullPage: true });

    const perro = nombre === "tablet" ? D.pelusa : D.firulais;
    await p.goto(`${base}/guarderia/reportes/${perro}`, { waitUntil: "networkidle" });
    if (nombre === "celular") {
      const { data: modelo } = await SH.from("reportes_guarderia").select("contenido").eq("perro_id", D.pelusa).eq("fecha", D.hoy).single();
      await SH.from("reportes_guarderia").delete().eq("perro_id", D.firulais).eq("fecha", ayer);
      await SH.from("reportes_guarderia").insert({ perro_id: D.firulais, fecha: ayer, estado: "enviado", contenido: modelo.contenido });
      await p.reload({ waitUntil: "networkidle" });
      await p.getByRole("button", { name: /Repetir el de ayer/ }).click();
      await p.waitForTimeout(2500);
      ok(await p.locator("text=Buen día").count() > 0, "[celular] «Repetir el de ayer» copia el reporte anterior como borrador");
      await p.screenshot({ path: foto("celular-repetido"), fullPage: true });
    } else {
      await p.getByRole("button", { name: /^Buen día/ }).first().click();
      await p.waitForTimeout(1500);
      await p.screenshot({ path: foto("tablet-formulario"), fullPage: true });
    }
    await p.getByRole("button", { name: /Dejar listo/ }).click();
    await p.waitForSelector("text=Enviar por WhatsApp", { timeout: 60000 });
    ok(true, `[${nombre}] «Dejar listo» dibuja la tarjeta`);
    await p.screenshot({ path: foto(`${nombre}-listo`), fullPage: true });
    const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 20000 }).catch(() => null), p.getByRole("button", { name: /Enviar por WhatsApp/ }).click()]);
    const url = popup ? popup.url() : "";
    await popup?.close().catch(() => {});
    const m = decodeURIComponent(url).match(/\/r\/([A-Za-z0-9_-]{43})/);
    ok(/wa\.me\/52|phone=52/.test(url) && !!m, `[${nombre}] «Enviar por WhatsApp» abre wa.me con la liga /r/<token> (${url.slice(0, 40)}…)`);
    if (m) {
      const anon = await (await nav.newContext({ viewport: { width: ancho, height: alto } })).newPage();
      await anon.goto(`${base}/r/${m[1]}`, { waitUntil: "networkidle" });
      const dim = await anon.locator("img").evaluateAll((is) => is.map((i) => [i.naturalWidth, i.naturalHeight]));
      ok(dim.some(([w, h]) => w === 1080 && h === 1350), `[${nombre}] la liga pública muestra la tarjeta 1080×1350`);
      const html = await anon.locator("body").innerText();
      ok(!/8110000001|4448887777|\$\s?\d/.test(html), `[${nombre}] la liga no trae teléfono del dueño ni precios`);
      await anon.screenshot({ path: foto(`${nombre}-publico`), fullPage: true });
    }
    await ctx.close();
  }
} finally {
  await nav.close();
}
console.log(fallos ? `\n✘ ${fallos} falla(s)` : "\n✔ Todo en orden.");
process.exit(fallos ? 1 : 0);
