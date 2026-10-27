// QA S39 · N137: con Veterinaria, el alta de mascota pregunta primero la especie y todo se adapta a ella; sin
// Veterinaria se queda «perro». SOLO DESARROLLO (Huellitas, que tiene Estética, Guardería y Hotel; Veterinaria se prende
// para la prueba y se regresa como estaba), con `next start` en el 3001:
//
//   node scripts/auditoria/especie-mascota-dev.mjs
//
// 1. Recepción (sin el permiso de ficha clínica) da de alta un gato: la especie se pregunta primero; el título pasa de
//    «Nueva mascota» a «Nuevo gato»; las razas son de gato (Siamés sí, Labrador no); sin tamaño ni pelaje; ningún
//    «perro» en la pantalla; guarda y la base tiene especie gato.
// 2. Su ficha: ningún «perro», sin los requisitos de guardería y hotel (no aplican a un gato).
// 3. El carnet sugiere las vacunas de gato (triple felina, rabia, leucemia felina).
// 4. La ficha del cliente dice «Mascotas»; el portal del dueño, «Tus mascotas» y ningún «perro» en la del gato.
// 5. Sin Veterinaria: el alta dice «Nuevo perro», «Nombre del perro» y no pregunta la especie.
const { B, SB, datos, comprobar, seccion, terminar, fijarModulo } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo } = await import("./lib/huellitas-navegador.mjs");

const sufijo = String(Date.now()).slice(-6);
const creados = [];
// El texto que se lee (sin las opciones de los <select> ni las listas de sugerencias, que dicen «Perro» como opción).
const textoVisible = (p, sel = "main") =>
  p.locator(sel).first().evaluate((n) => {
    const c = n.cloneNode(true);
    c.querySelectorAll("select, datalist, script, [data-no-leer]").forEach((x) => x.remove());
    return (c.innerText || c.textContent || "").replace(/\s+/g, " ");
  });
const dicePerro = (t) => (t.match(/[^.]{0,40}\bperros?\b[^.]{0,30}/gi) ?? []).map((x) => x.trim());

const nav = await abrirNavegador();
const { data: modsAntes } = await SB.from("negocio_modulos").select("modulo, activo").eq("negocio_id", B).eq("modulo", "veterinaria").is("deleted_at", null).maybeSingle();
const vetAntes = Boolean(modsAntes?.activo);
try {
  await fijarModulo("veterinaria", true);
  const { p } = await abrirComo(nav, datos.recepcionB, B);

  seccion("1. Alta de un gato por Recepción");
  await p.goto(`${BASE}/clientes/${datos.clienteSoloB}/perros/nuevo`, { waitUntil: "networkidle", timeout: 120000 });
  const especie = p.getByLabel("Especie", { exact: true });
  const hayEspecie = (await especie.count()) > 0;
  const tituloAntes = (await p.locator("h1").first().innerText().catch(() => "")).trim();
  comprobar(hayEspecie, `pregunta la especie (título «${tituloAntes}»)`);
  comprobar(tituloAntes === "Nueva mascota", `antes de escoger, el título es «Nueva mascota» («${tituloAntes}»)`);
  if (hayEspecie) {
    // La especie va primero: antes que el nombre.
    const orden = await p.evaluate(() => {
      const e = document.querySelector("[data-pregunta-especie]");
      const n = document.querySelector("input[name=nombre]");
      return e && n ? (e.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING ? "especie primero" : "nombre primero") : n ? "nombre sin especie" : "especie sola (el resto espera)";
    });
    comprobar(/especie/.test(orden), `orden: ${orden}`);
    await especie.selectOption("gato");
    const titulo = (await p.locator("h1").first().innerText()).trim();
    comprobar(titulo === "Nuevo gato", `con «Gato» el título es «Nuevo gato» («${titulo}»)`);
    const raza = p.locator("[data-selector-raza] input[role=combobox]");
    await raza.fill("siam");
    const conSiames = await p.getByRole("option").filter({ hasText: "Siamés" }).count();
    await raza.fill("labra");
    const conLabrador = await p.getByRole("option").filter({ hasText: "Labrador" }).count();
    comprobar(conSiames > 0 && conLabrador === 0, `razas de gato: Siamés ${conSiames ? "sí" : "NO"}, Labrador ${conLabrador ? "SÍ" : "no"}`);
    await raza.fill("doméstico de pelo c");
    await p.getByRole("option").filter({ hasText: "Doméstico de pelo corto" }).first().click();
    comprobar((await p.locator("[data-talla-pelaje]").count()) === 0 && (await p.getByLabel(/^Tamaño/).count()) === 0, "sin tamaño ni pelaje (son del precio de un perro)");
    const t = await textoVisible(p);
    comprobar(dicePerro(t).length === 0, `ningún «perro» en el alta (${dicePerro(t).map((x) => `«${x}»`).join(" · ") || "ninguno"})`);
    const nombre = `ZZ Michi ${sufijo}`;
    await p.locator("input[name=nombre]").fill(nombre);
    await p.getByRole("button", { name: /^Guardar gato/ }).click();
    await p.waitForURL(/\/perros\/[0-9a-f-]{36}/, { timeout: 60000 });
    // La ficha se pinta por partes (loading.tsx): se espera a que su encabezado diga el nombre del gato.
    await p.locator("h1", { hasText: nombre }).first().waitFor({ timeout: 60000 });
    await p.getByText("Peso", { exact: true }).first().waitFor({ timeout: 60000 }).catch(() => {});
    const { data: gato } = await SB.from("perros").select("id, especie, raza_id, tamano_id, razas(nombre)").eq("negocio_id", B).eq("nombre", nombre).single();
    creados.push(gato.id);
    comprobar(gato.especie === "gato" && gato.razas?.nombre === "Doméstico de pelo corto", `guardado como ${gato.especie}, raza ${gato.razas?.nombre}`);

    seccion("2. La ficha del gato");
    await p.waitForLoadState("networkidle").catch(() => {});
    const ficha = await textoVisible(p);
    comprobar(dicePerro(ficha).length === 0, `ningún «perro» en la ficha (${dicePerro(ficha).map((x) => `«${x}»`).join(" · ") || "ninguno"})`);
    comprobar(!/Requisitos para guardería y hotel/.test(ficha) && !/Evaluación de comportamiento/.test(ficha), "sin requisitos ni evaluación de guardería y hotel");
    const avisoAlta = await textoVisible(p, "body");
    comprobar(/Gato registrado correctamente/.test(avisoAlta), `confirma el alta con su especie («${(avisoAlta.match(/\S+ registrad[oa] correctamente/) ?? [avisoAlta.slice(0, 200)])[0]}»)`);

    seccion("3. Vacunas sugeridas en el carnet");
    const { p: adm } = await abrirComo(nav, datos.adminB, B);
    await adm.goto(`${BASE}/veterinaria/carnet/${gato.id}`, { waitUntil: "networkidle", timeout: 120000 });
    const abrir = adm.getByRole("button", { name: /Registrar vacuna|Agregar vacuna|Nueva vacuna/ }).first();
    if (await abrir.count()) await abrir.click().catch(() => {});
    const sugeridas = (await adm.locator("[data-vacunas-sugeridas]").first().getAttribute("data-vacunas-sugeridas").catch(() => null)) ?? "";
    comprobar(/Triple felina/.test(sugeridas) && /Leucemia felina/.test(sugeridas) && /Rabia/.test(sugeridas), `sugiere triple felina, rabia y leucemia felina («${sugeridas || "nada"}»)`);
    await adm.context().close();

    seccion("4. Cliente y portal");
    await p.goto(`${BASE}/clientes/${datos.clienteSoloB}`, { waitUntil: "networkidle", timeout: 120000 });
    // La lista de mascotas del cliente se pinta por partes: se espera su encabezado.
    await p.getByRole("heading", { name: /^(Mascotas|Perros)$/ }).first().waitFor({ timeout: 60000 }).catch(() => {});
    comprobar((await p.getByRole("heading", { name: "Mascotas", exact: true }).count()) === 1, "la ficha del cliente dice «Mascotas»");
    const { p: duenio } = await abrirComo(nav, datos.cuentaSoloB, B);
    await duenio.goto(`${BASE}/portal`, { waitUntil: "networkidle", timeout: 120000 });
    comprobar((await duenio.getByRole("heading", { name: "Tus mascotas" }).count()) === 1, "el portal dice «Tus mascotas»");
    await duenio.goto(`${BASE}/portal/perros/${gato.id}`, { waitUntil: "networkidle", timeout: 120000 });
    await duenio.locator("h1", { hasText: nombre }).first().waitFor({ timeout: 60000 });
    const portal = await textoVisible(duenio, "body");
    comprobar(dicePerro(portal).length === 0 && !/Tamaño/.test(portal), `portal del gato sin «perro» ni tamaño (${dicePerro(portal).map((x) => `«${x}»`).join(" · ") || "ninguno"})`);
    await duenio.context().close();
  }

  seccion("5. Sin Veterinaria se queda «perro»");
  await fijarModulo("veterinaria", false);
  await p.goto(`${BASE}/clientes/${datos.clienteSoloB}/perros/nuevo`, { waitUntil: "networkidle", timeout: 120000 });
  const titulo = (await p.locator("h1").first().innerText()).trim();
  comprobar(titulo === "Nuevo perro" && (await p.getByLabel("Especie", { exact: true }).count()) === 0 && (await p.getByLabel("Nombre del perro").count()) === 1, `«${titulo}», sin especie y «Nombre del perro»`);
  await p.context().close();
} finally {
  const ahora = new Date().toISOString();
  for (const id of creados) await SB.from("perros").update({ deleted_at: ahora }).eq("id", id);
  await fijarModulo("veterinaria", vetAntes);
  await nav.close();
}
terminar();
