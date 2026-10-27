// QA S39 en PRODUCCIÓN, en los negocios PRUEBA de QA que lo reportaron (y solo ahí), con navegador. Antes del arreglo
// sirve para anotar qué se ve; después del despliegue, para verificarlo en los mismos negocios. Sale con 1 si algo sigue mal.
//
//   node scripts/auditoria/qa-s39-prod.mjs [--fotos] [--solo n137|n138]
//
// N137 · prueba-qa-onboarding-vet-s16 (Veterinaria): el alta de mascota pregunta la especie y se adapta a ella (título,
//        razas, campos que no aplican a gatos); la ficha de «PRUEBA QA S39 Gato Vet» dice gato, no perro.
// N138 · prueba-est-tica: Recepción reprograma una cita que el admin acaba de mover → conflicto → «Guardar los míos
//        encima» → la pantalla pinta la hora guardada al momento, el aviso de conflicto se cierra y queda solo el éxito.
//        Usa la cita futura de QA («PRUEBA QA S35 Perro Multi») y al final la regresa a la hora que tenía.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import os from "node:os";
import path from "node:path";
import { comoPersona, negocioPrueba, sesionDe } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const FOTOS = process.argv.includes("--fotos");
const SOLO = process.argv.includes("--solo") ? process.argv[process.argv.indexOf("--solo") + 1] : null;
const hallazgos = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const ver = (t) => console.log(`    · ${t}`);
const texto = async (loc) => (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const foto = async (p, nombre) => {
  if (!FOTOS) return;
  const ruta = path.join(os.tmpdir(), `qa-s39-${nombre}.png`);
  await p.screenshot({ path: ruta, fullPage: true });
  ver(`foto: ${ruta}`);
};

const nav = await abrirNavegador();
async function pagina(NEG, rol) {
  const s = await NEG.sesion(rol);
  const c = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies(s.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(60000);
  return { p, api: comoPersona(s.token, NEG.negocio.id) };
}

if (!SOLO || SOLO === "n137") {
  console.log("\nN137 · alta y ficha de un gato en un negocio con Veterinaria");
  const VET = await negocioPrueba("prueba-qa-onboarding-vet-s16");
  const { p } = await pagina(VET, "admin");
  const { data: gato } = await VET.N.from("perros").select("id, nombre, especie, cliente_id, clientes(nombre)").eq("negocio_id", VET.negocio.id).eq("nombre", "PRUEBA QA S39 Gato Vet").is("deleted_at", null).single();
  ver(`${gato.nombre} (cliente ${gato.clientes?.nombre}): especie ${gato.especie}`);
  // El texto que se lee, sin las opciones de los <select> ni las listas de sugerencias (dicen «Perro» como opción).
  const visible = (pag, sel = "main") =>
    pag.locator(sel).first().evaluate((n) => {
      const c = n.cloneNode(true);
      c.querySelectorAll("select, datalist, script").forEach((x) => x.remove());
      return (c.innerText || c.textContent || "").replace(/\s+/g, " ");
    });
  const dicePerro = (t) => (t.match(/[^.]{0,40}\bperros?\b[^.]{0,30}/gi) ?? []).map((x) => x.trim());

  // El alta desde la ficha del cliente (a donde llevan «+ Nuevo cliente y su mascota» y «Agregar mascota»).
  await p.goto(`${VET.base}/clientes/${gato.cliente_id}/perros/nuevo`);
  await p.waitForLoadState("networkidle").catch(() => {});
  const titulo = await texto(p.locator("h1").first());
  const especie = p.getByLabel("Especie", { exact: true });
  const hayEspecie = (await especie.count()) > 0;
  ver(`${VET.base}/clientes/${gato.cliente_id}/perros/nuevo → título «${titulo}»; pregunta la especie: ${hayEspecie ? "sí" : "NO"}`);
  if (hayEspecie) {
    await especie.selectOption("gato");
    const tituloGato = await texto(p.locator("h1").first());
    const raza = p.locator("[data-selector-raza] input[role=combobox]");
    await raza.fill("siam");
    const siames = await p.getByRole("option").filter({ hasText: "Siamés" }).count();
    await raza.fill("dom");
    const domestico = await p.getByRole("option").filter({ hasText: "Doméstico de pelo corto" }).count();
    await raza.fill("labra");
    const labrador = await p.getByRole("option").filter({ hasText: "Labrador" }).count();
    await raza.fill("");
    const talla = await p.locator("[data-talla-pelaje]").count();
    const t = await visible(p);
    ver(`con «Gato»: título «${tituloGato}»; Siamés ${siames ? "sí" : "NO"}, Doméstico de pelo corto ${domestico ? "sí" : "NO"}, Labrador ${labrador ? "SÍ" : "no"}; tamaño y pelaje ${talla ? "SALEN" : "no salen"}; «perro»: ${dicePerro(t).join(" · ") || "ninguno"}`);
    await foto(p, "n137-alta-gato");
    if (titulo === "Nueva mascota" && tituloGato === "Nuevo gato" && siames && domestico && !labrador && !talla && !dicePerro(t).length) bien("el alta pregunta primero la especie y se adapta al gato (título, razas, sin tamaño ni pelaje, sin «perro»)");
    else mal(`alta: «${titulo}» → «${tituloGato}», razas de gato ${siames && domestico ? "sí" : "NO"}, Labrador ${labrador ? "SÍ" : "no"}, tamaño ${talla ? "SALE" : "no"}, «perro» ${dicePerro(t).length}`);
  } else {
    await foto(p, "n137-alta");
    mal(`el alta dice «${titulo}» y no pregunta la especie`);
  }

  // La ficha del gato (se espera a que su encabezado lo nombre: la ficha se pinta por partes).
  await p.goto(`${VET.base}/perros/${gato.id}`);
  await p.locator("h1", { hasText: gato.nombre }).first().waitFor({ timeout: 60000 });
  await p.waitForLoadState("networkidle").catch(() => {});
  const ficha = await visible(p);
  ver(`${VET.base}/perros/${gato.id} → «perro» en la ficha: ${dicePerro(ficha).map((x) => `«${x}»`).join(" · ") || "ninguno"}`);
  await foto(p, "n137-ficha");
  if (!dicePerro(ficha).length && /Expediente del gato/.test(ficha)) bien("la ficha dice «Expediente del gato» y ningún «perro»");
  else mal(`la ficha del gato dice «perro» ${dicePerro(ficha).length} vez/veces${/Expediente del gato/.test(ficha) ? "" : " y no «Expediente del gato»"}`);

  // Las vacunas sugeridas de su carnet.
  await p.goto(`${VET.base}/veterinaria/carnet/${gato.id}`);
  await p.waitForLoadState("networkidle").catch(() => {});
  const sugeridas = (await p.locator("[data-vacunas-sugeridas]").first().getAttribute("data-vacunas-sugeridas").catch(() => null)) ?? "";
  ver(`${VET.base}/veterinaria/carnet/${gato.id} → vacunas sugeridas: ${sugeridas || "(ninguna)"}`);
  if (/Triple felina/.test(sugeridas) && /Rabia/.test(sugeridas) && /Leucemia felina/.test(sugeridas)) bien("el carnet sugiere triple felina, rabia y leucemia felina");
  else mal(`el carnet sugiere «${sugeridas || "nada"}»`);
  await p.context().close();

  // El portal del dueño del gato.
  const { data: m } = await VET.N.from("membresias").select("profile_id").eq("negocio_id", VET.negocio.id).eq("rol", "cliente").eq("cliente_id", gato.cliente_id).is("deleted_at", null).limit(1);
  if (m?.length) {
    const s = await sesionDe(m[0].profile_id, `prueba-qa-onboarding-vet-s16.peludesk.mx`);
    const c = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await c.addCookies(s.cookies);
    const d = await c.newPage();
    await d.goto(`${VET.base}/portal/perros/${gato.id}`);
    await d.getByText(gato.nombre).first().waitFor({ timeout: 60000 }).catch(() => {});
    await d.waitForLoadState("networkidle").catch(() => {});
    const portal = await visible(d, "body");
    ver(`portal del dueño → «perro»: ${dicePerro(portal).map((x) => `«${x}»`).join(" · ") || "ninguno"}; tamaño ${/Tamaño/.test(portal) ? "SALE" : "no sale"}`);
    await foto(d, "n137-portal");
    if (!dicePerro(portal).length && !/Tamaño/.test(portal)) bien("el portal del dueño habla del gato sin «perro» ni tamaño");
    else mal("el portal del dueño todavía dice «perro» o enseña el tamaño");
    await c.close();
  } else ver("el dueño del gato no tiene cuenta del portal: no se revisa el portal");
}

if (!SOLO || SOLO === "n138") {
  console.log("\nN138 · «Guardar los míos encima» pinta lo guardado al momento");
  const EST = await negocioPrueba("prueba-est-tica");
  const zona = EST.negocio.zona_horaria;
  const hora = (iso) => new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: zona }).format(new Date(iso));
  const { data: cita } = await EST.N.from("citas_estetica").select("id, inicio, perros(nombre)").eq("negocio_id", EST.negocio.id).gte("inicio", new Date().toISOString()).in("estado", ["reservada", "confirmada"]).is("deleted_at", null).order("inicio").limit(1).single();
  const original = cita.inicio;
  const masHoras = (iso, h) => new Date(new Date(iso).getTime() + h * 3600000).toISOString();
  const local = (iso) => new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: zona }).format(new Date(iso)).replace(" ", "T");
  const { api: admin } = await pagina(EST, "admin");
  const { p: est } = await pagina(EST, "estetica");
  const { p } = await pagina(EST, "recepcion");
  const deRecepcion = masHoras(original, 0.5);
  const deEstilista = masHoras(original, 2);
  try {
    // Como lo hizo QA: la estilista y Recepción tienen abierta la misma cita; Recepción la mueve media hora (éxito) y
    // después la estilista guarda la suya encima.
    await est.goto(`${EST.base}/estetica/${cita.id}?reprogramar=1`);
    await est.waitForLoadState("networkidle").catch(() => {});
    await p.goto(`${EST.base}/estetica/${cita.id}?reprogramar=1`);
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.getByLabel("Nueva fecha y hora").fill(local(deRecepcion));
    await p.getByRole("button", { name: "Guardar la nueva hora" }).click();
    await p.getByText(/Cita reprogramada/).first().waitFor({ timeout: 30000 });
    ver(`cita de ${cita.perros?.nombre}: ${hora(original)}; Recepción la movió a ${hora(deRecepcion)}; la estilista guarda ${hora(deEstilista)} encima`);

    await est.getByLabel("Nueva fecha y hora").fill(local(deEstilista));
    await est.getByRole("button", { name: "Guardar la nueva hora" }).click();
    await est.locator("[data-conflicto-version]").waitFor({ timeout: 30000 });
    await est.locator("[data-guardar-encima]").click();
    await est.locator("[data-guardar-encima-confirmar]").click();
    // Lo que se ve al momento (sin recargar).
    await est.getByText(/Cita reprogramada/).first().waitFor({ timeout: 30000 }).catch(() => {});
    await est.waitForTimeout(3000);
    const encabezado = await texto(est.locator("h1 + p").first());
    const conflicto = await est.locator("[data-conflicto-version]").count();
    const exito = await texto(est.getByText(/Cita reprogramada/).first());
    const { data: base } = await EST.N.from("citas_estetica").select("inicio").eq("id", cita.id).single();
    ver(`estilista, después de «Sí, guardar los míos encima»: encabezado «${encabezado}»; aviso de conflicto ${conflicto ? "SIGUE" : "cerrado"}; éxito «${exito || "(no sale)"}»; en la base ${hora(base.inicio)}`);
    await foto(est, "n138-estilista");
    const muestraNueva = encabezado.includes(hora(deEstilista));
    if (muestraNueva && !conflicto && exito && hora(base.inicio) === hora(deEstilista)) bien(`estilista: pinta ${hora(deEstilista)} al momento, sin aviso de conflicto y con «${exito}»`);
    else mal(`estilista al guardar encima: encabezado ${muestraNueva ? "nuevo" : `VIEJO («${encabezado}»)`}, conflicto ${conflicto ? "SIGUE" : "cerrado"}, éxito ${exito ? "sí" : "NO"}`);

    // Recepción, con su pantalla de antes (dice «Cita reprogramada» de su cambio), vuelve a moverla: choca.
    await p.getByRole("button", { name: "Reprogramar" }).click().catch(() => {});
    await p.getByLabel("Nueva fecha y hora").fill(local(masHoras(original, 1)));
    await p.getByRole("button", { name: "Guardar la nueva hora" }).click();
    await p.locator("[data-conflicto-version]").waitFor({ timeout: 30000 }).catch(() => {});
    const aLaVez = (await p.locator("[data-conflicto-version]").count()) > 0 && (await p.getByText(/Cita reprogramada/).count()) > 0;
    const encabezadoR = await texto(p.locator("h1 + p").first());
    ver(`Recepción vuelve a moverla: aviso de conflicto ${(await p.locator("[data-conflicto-version]").count()) ? "sí" : "no"}; «Cita reprogramada» de antes ${(await p.getByText(/Cita reprogramada/).count()) ? "SIGUE" : "ya no"}; encabezado «${encabezadoR}»`);
    await foto(p, "n138-recepcion");
    if (!aLaVez) bien("Recepción no ve a la vez el éxito de antes y el aviso de conflicto");
    else mal("Recepción ve a la vez «Cita reprogramada» y el aviso de conflicto");
  } finally {
    // La cita de QA regresa a su hora.
    await admin.rpc("reprogramar_cita_estetica", { p_cita_id: cita.id, p_inicio: original, p_motivo: "Verificación QA S39: regresa a su hora" });
    const { data: fin } = await EST.N.from("citas_estetica").select("inicio").eq("id", cita.id).single();
    ver(`la cita regresó a ${hora(fin.inicio)} (${fin.inicio === original || Date.parse(fin.inicio) === Date.parse(original) ? "igual que antes" : "DISTINTA"})`);
    await p.context().close();
  }
}

await nav.close();
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exitCode = hallazgos.length ? 1 : 0;
