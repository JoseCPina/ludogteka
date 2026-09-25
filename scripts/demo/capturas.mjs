// Capturas del negocio de demostración para la landing de PeluDesk.
//
//   node scripts/demo/capturas.mjs <base> <salida> <tomas.json | rol:ruta:nombre[:ancho[:alto]]...>
//
//   base    http://patitasyco.localhost:3001 o https://patitasyco.peludesk.mx
//   salida  carpeta donde quedan los PNG crudos (2x)
//
// Entra por /demo/entrar/<rol> (la misma puerta que "Ver demo"), abre la
// ruta, espera a que carguen letras e imágenes, apaga animaciones y el
// cursor, y toma la pantalla visible (no la página completa) al ancho
// pedido. Un navegador por rol, una página a la vez: esta máquina tiene
// poca memoria.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const [base, salida, ...resto] = process.argv.slice(2);
if (!base || !salida || !resto.length) throw new Error("Uso: capturas.mjs <base> <salida> <tomas>");
fs.mkdirSync(salida, { recursive: true });
const tomas = resto[0].endsWith(".json")
  ? JSON.parse(fs.readFileSync(resto[0], "utf8"))
  : resto.map((t) => {
      const [rol, ruta, nombre, ancho, alto] = t.split(":");
      return { rol, ruta, nombre, ancho: Number(ancho || 1280), alto: Number(alto || 800) };
    });

const dir = path.join(os.homedir(), "AppData/Local/ms-playwright/chromium_headless_shell-1243");
const sub = fs.readdirSync(dir).find((x) => fs.existsSync(path.join(dir, x, "chrome-headless-shell.exe")));
const navegador = await chromium.launch({ executablePath: path.join(dir, sub, "chrome-headless-shell.exe"), args: ["--disable-gpu"] });
try {
  const porRol = Map.groupBy(tomas, (t) => t.rol);
  for (const [rol, lista] of porRol) {
    const ctx = await navegador.newContext({ deviceScaleFactor: 2, reducedMotion: "reduce", locale: "es-MX", timezoneId: "America/Mexico_City" });
    const page = await ctx.newPage();
    await page.goto(`${base}/demo/entrar/${rol}`, { waitUntil: "load", timeout: 120000 });
    for (const t of lista) {
      const movil = t.ancho < 600;
      await page.setViewportSize({ width: t.ancho, height: t.alto ?? (movil ? 844 : 800) });
      const r = await page.goto(base + t.ruta, { waitUntil: "networkidle", timeout: 120000 });
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} nextjs-portal{display:none!important} [data-aviso-plan=demo]{display:none!important}" });
      if (t.clic) await page.click(t.clic).catch(() => {});
      if (t.bajar) await page.evaluate((y) => window.scrollTo(0, y), t.bajar);
      await page.waitForTimeout(600);
      const archivo = path.join(salida, `${t.nombre}.png`);
      await page.screenshot({ path: archivo, fullPage: Boolean(t.completa) });
      const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
      console.log(`${r?.status()} ${t.nombre} ${t.ruta} → ${new URL(page.url()).pathname}${ancho > t.ancho + 2 ? ` DESBORDA ${ancho}` : ""}`);
    }
    await ctx.close();
  }
} finally {
  await navegador.close();
}
