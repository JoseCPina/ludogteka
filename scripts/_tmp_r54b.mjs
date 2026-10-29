import { negocioPrueba } from "./lib/prod.mjs";
import { abrirNavegador } from "./lib/navegador.mjs";
const E = await negocioPrueba("prueba-qa-onboarding-hotel-s16");
const s = await E.sesion("recepcion").catch(() => E.sesion("admin"));
const nav = await abrirNavegador();
try {
  const c = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c.addCookies(s.cookies);
  const p = await c.newPage();
  for (const [n, r, e] of [["S42", "98c2484a-72e7-4480-9007-262686c8dbb2", "b2fd3a0b-2dd4-4a4b-9a90-7cb4fc3058b4"], ["S41", "27b09678-be73-4500-9f50-dd991a6b5318", "156127ba-0a56-412e-a794-ccf3893e0b9d"]]) {
    for (const [cual, ruta] of [["detalle", `/reservas/${r}`], ["checkout", `/reservas/estancias/${e}/checkout`], ["checkin", `/reservas/estancias/${e}/checkin`]]) {
      await p.goto(`${E.base}${ruta}`, { waitUntil: "networkidle", timeout: 90000 });
      const t = (await p.locator("main").innerText()).replace(/\s+/g, " ");
      const i = t.toLowerCase().indexOf("cargos aplicados");
      console.log(`${n} ${cual}: ${i < 0 ? "(sin «Cargos aplicados»)" : t.slice(i, i + 260)}`);
      const sec = p.getByText(/cargos aplicados/i).first();
      if (await sec.count()) { await sec.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${process.argv[2]}/r54-${n}-${cual}.png` }); }
    }
  }
} finally { await nav.close(); }
