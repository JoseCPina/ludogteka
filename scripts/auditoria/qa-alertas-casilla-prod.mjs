// «Dar por revisadas…» y Permisos en PRODUCCIÓN, en un negocio PRUEBA y sin apretar nada que guarde (solo lectura):
// la casilla de citas viene apagada y dice cuántas son; Permisos enseña interruptores visibles.
//   node scripts/auditoria/qa-alertas-casilla-prod.mjs [slug]
import { negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const N = await negocioPrueba(process.argv[2] ?? "prueba-qa-hotel-s62");
const sesion = await N.sesion("admin");
const nav = await abrirNavegador();
let mal = 0;
const revisa = (ok, t) => { console.log(`  ${ok ? "✔" : "✘"} ${t}`); if (!ok) mal++; };
try {
  const c = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c.addCookies(sesion.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(90000);
  await p.goto(`${N.base}/admin`, { waitUntil: "networkidle" });
  await p.locator("[data-revisar-alertas]").click();
  const casilla = p.locator("[data-revisar-alertas-citas] input");
  await casilla.waitFor();
  revisa(!(await casilla.isChecked()), "la casilla de citas viene apagada");
  await p.waitForFunction(() => !document.querySelector("[data-revisar-alertas-citas-conteo]")?.textContent?.includes("Contando"), null, { timeout: 30000 });
  console.log(`  · ${(await p.locator("[data-revisar-alertas-citas-conteo]").innerText()).trim()}`);
  await p.goto(`${N.base}/admin/permisos`, { waitUntil: "networkidle" });
  const grupo = p.locator("[data-grupo-permisos] button[aria-expanded]").first();
  if (await grupo.count()) {
    await grupo.click();
    const inter = p.locator('[role="switch"][data-interruptor]').first();
    await inter.waitFor();
    const caja = await inter.locator("span").first().boundingBox();
    revisa(Boolean(caja && caja.width >= 40), "el interruptor de cada permiso se ve");
  } else console.log("  · ese negocio no tiene personal de recepción: Permisos sin grupos");
} finally {
  await nav.close();
}
console.log(mal ? `✘ ${mal} hallazgo(s)` : "✔ Bien en producción.");
process.exit(mal ? 1 : 0);
