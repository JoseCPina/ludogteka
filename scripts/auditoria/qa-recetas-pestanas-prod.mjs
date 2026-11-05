// Filtros de /veterinaria/recetas y /veterinaria/recetas/sitpv en PRODUCCIÓN (negocio PRUEBA, solo lectura): ningún
// filtro lleva un «?» vacío; «Todas» vuelve a la pantalla limpia y tocar otro filtro cambia la dirección.
//   node scripts/auditoria/qa-recetas-pestanas-prod.mjs <slug-del-negocio-prueba>
import { negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const slug = process.argv[2] ?? "prueba-qa-vet-s62";
const N = await negocioPrueba(slug);
const sesion = await N.sesion("admin");
const nav = await abrirNavegador();
let mal = 0;
const revisa = (ok, t) => { console.log(`  ${ok ? "✔" : "✘"} ${t}`); if (!ok) mal++; };
try {
  const c = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies(sesion.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(60000);
  for (const [ruta, filtro] of [["/veterinaria/recetas", "Emitidas"], ["/veterinaria/recetas/sitpv", null]]) {
    await p.goto(`${N.base}${ruta}`, { waitUntil: "networkidle" });
    const hrefs = await p.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    revisa(!hrefs.some((h) => h.endsWith("?")), `${ruta}: ningún enlace termina en «?»`);
    const todas = p.getByRole("link", { name: /^(Todas|Todos)$/ }).first();
    if (await todas.count()) revisa((await todas.getAttribute("href")) === ruta, `${ruta}: «Todas» apunta a ${ruta}`);
    if (filtro) {
      await p.getByRole("link", { name: filtro, exact: true }).first().click();
      await p.waitForURL(/estado=emitida/, { timeout: 30000 }).catch(() => {});
      revisa(p.url().includes("estado=emitida"), `${ruta}: «${filtro}» cambia la dirección`);
      await p.getByRole("link", { name: "Todas", exact: true }).first().click();
      await p.waitForURL((u) => u.pathname === ruta && !u.search, { timeout: 30000 }).catch(() => {});
      revisa(new URL(p.url()).search === "" , `${ruta}: «Todas» regresa sin filtros`);
    }
  }
} finally {
  await nav.close();
}
console.log(mal ? `\n✘ ${mal} hallazgo(s).` : "\n✔ Filtros de recetas bien en producción.");
process.exit(mal ? 1 : 0);
