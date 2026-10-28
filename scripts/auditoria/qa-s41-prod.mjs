// QA S41 en PRODUCCIÓN, en los negocios PRUEBA de QA que lo reportaron (y solo ahí), con navegador. Antes del arreglo
// anota lo que se ve; después del despliegue, lo verifica en los mismos negocios. Sale con 1 si algo sigue mal.
//
//   node scripts/auditoria/qa-s41-prod.mjs [--fotos] [--solo n139|n140|n141|n142|n143|n144]
//
// N139 · prueba-qa-onboarding-vet-s16: el mosaico «Expediente clínico» cuenta las consultas en borrador que hay.
// N140 · prueba-qa-onboarding-vet-s16: firmar una consulta (una nueva, «PRUEBA QA S41», de la mascota de QA) pinta
//        «Firmada» al recibir la respuesta, sin recargar.
// N141 · prueba-qa-onboarding-estetica-s16: «Confirmar inicio» de una cita sale de «Guardando…» con la respuesta y la
//        cita queda en curso en pantalla.
// N142 · prueba-qa-onboarding-estetica-s16: después de agendar con éxito no queda el aviso de horario de antes.
//        (agenda una cita «PRUEBA QA S41» hoy, que es la que usa N141).
// N143 · prueba-qa-onboarding-vet-s16 (tiene gatos): ningún buscador ni etiqueta dice «perro».
// N144 · prueba-qa-onboarding-hotel-s16: el check-out lista los cargos de la cuenta de la estancia y rotula la base.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import os from "node:os";
import path from "node:path";
import { comoPersona, negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const FOTOS = process.argv.includes("--fotos");
const SOLO = process.argv.includes("--solo") ? process.argv[process.argv.indexOf("--solo") + 1] : null;
const toca = (n) => !SOLO || SOLO.split(",").includes(n);
const hallazgos = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const ver = (t) => console.log(`    · ${t}`);
const texto = async (loc) => (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const foto = async (p, nombre) => {
  if (!FOTOS) return;
  const ruta = path.join(os.tmpdir(), `qa-s41-${nombre}.png`);
  await p.screenshot({ path: ruta, fullPage: true });
  ver(`foto: ${ruta}`);
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const nav = await abrirNavegador();
async function pagina(NEG, rol) {
  const s = await NEG.sesion(rol);
  // --celular: como QA en el teléfono (pantalla chica y táctil).
  const c = await nav.newContext(process.argv.includes("--celular") ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  await c.addCookies(s.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(90000);
  // --lento: red de celular lenta (3G: 400 ms de latencia, ~400 kbps de bajada), como QA desde el teléfono.
  if (process.argv.includes("--lento")) {
    const cdp = await c.newCDPSession(p);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 });
  }
  return { p, api: comoPersona(s.token, NEG.negocio.id) };
}
async function abrir(p, url) {
  await p.goto(url);
  await p.waitForLoadState("networkidle").catch(() => {});
}
/** Aprieta un botón y mide cuánto tarda en dejar de estar ocupado (aria-busy o el texto «…ndo…»). */
async function apretarYMedir(p, boton, ocupado = /…/) {
  const t0 = Date.now();
  await boton.click();
  let libre = false;
  while (Date.now() - t0 < 30000) {
    await espera(250);
    const n = await boton.count();
    if (!n) { libre = true; break; }
    const t = await texto(boton.first());
    const busy = await boton.first().getAttribute("aria-busy").catch(() => null);
    if (!ocupado.test(t) && busy !== "true") { libre = true; break; }
  }
  return { libre, ms: Date.now() - t0 };
}

try {
  const VET = toca("n139") || toca("n140") || toca("n143") ? await negocioPrueba("prueba-qa-onboarding-vet-s16") : null;

  if (toca("n139")) {
    console.log("\nN139 · Vet: el mosaico «Expediente clínico» cuenta los borradores sin firmar");
    const { p, api } = await pagina(VET, "admin");
    const { count: reales } = await VET.N.from("vet_consultas").select("id", { count: "exact", head: true }).eq("negocio_id", VET.negocio.id).eq("estado", "borrador").is("deleted_at", null);
    const { data: atencion } = await api.rpc("veterinaria_atencion");
    await abrir(p, `${VET.base}/veterinaria`);
    const mosaico = await texto(p.locator("a", { hasText: "Expediente clínico" }).first());
    const enPantalla = Number((mosaico.match(/(\d+) sin firmar/) ?? [])[1] ?? NaN);
    ver(`borradores sin firmar en la base: ${reales}; veterinaria_atencion.consultas_sin_firmar: ${atencion?.consultas_sin_firmar}; el mosaico dice: «${enPantalla} sin firmar»`);
    await foto(p, "n139-veterinaria");
    if (enPantalla === reales) bien(`el mosaico dice ${enPantalla} sin firmar, igual que los borradores reales`);
    else mal(`el mosaico dice ${enPantalla} sin firmar con ${reales} borrador(es) en la base`);
    await p.context().close();
  }

  if (toca("n140")) {
    console.log("\nN140 · Vet: firmar una consulta pinta «Firmada» al recibir la respuesta");
    const { p, api } = await pagina(VET, "admin");
    const { data: gato } = await VET.N.from("perros").select("id").eq("negocio_id", VET.negocio.id).eq("nombre", "PRUEBA QA S39 Gato Vet").is("deleted_at", null).single();
    const { data: id, error: e1 } = await api.rpc("vet_consulta_iniciar", { p_perro: gato.id, p_cita: null, p_tipo: "consulta", p_medico: null });
    if (e1) throw new Error(`vet_consulta_iniciar: ${e1.message}`);
    const { error: e2 } = await api.rpc("vet_consulta_guardar", { p_id: id, p_datos: { motivo: "PRUEBA QA S41 firmar sin recargar", diagnosticos: [{ ref_id: null, origen: "libre", nombre: "PRUEBA QA S41", tipo: "presuntivo", nota: "" }] } });
    if (e2) throw new Error(`vet_consulta_guardar: ${e2.message}`);
    ver(`consulta ${id}`);
    await abrir(p, `${VET.base}/veterinaria/consulta/${id}`);
    const insignia = () => texto(p.locator("main span.rounded-full", { hasText: /^(Borrador|Firmada|Anulada)$/ }).first());
    const antes = await insignia();
    // Como QA: escribe en la consulta y firma enseguida (el autoguardado todavía no sale).
    if (!process.env.SIN_ESCRIBIR) await p.getByLabel("Motivo de la consulta").fill("PRUEBA QA S41 firmar sin recargar, escrito justo antes de firmar");
    await p.getByRole("button", { name: "Firmar la consulta" }).click();
    // Primero se guarda lo escrito y después se firma: se espera al aviso «Consulta firmada», que llega con la respuesta
    // de la firma, y en ese mismo instante se lee la insignia (sin esperar otra carga de la página).
    const t0 = Date.now();
    await p.getByRole("button", { name: /Sí, firmar|Firmando…/ }).click();
    const libre = await p.locator("[data-consulta-firmada]").waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
    const ms = Date.now() - t0;
    const despues = await insignia();
    const t1 = Date.now();
    while (Date.now() - t1 < 30000 && (await insignia()) !== "Firmada") await espera(250);
    ver(`«Firmada» en la insignia ${Date.now() - t1} ms después del aviso «Consulta firmada»`);
    const errorFirma = await texto(p.locator("[role=alert]").first());
    const exito = await texto(p.locator("[role=status]", { hasText: /firmada/i }).first());
    const enBase = (await VET.N.from("vet_consultas").select("estado").eq("id", id).single()).data?.estado;
    ver(`antes «${antes}»; aviso «Consulta firmada» ${libre ? "sí" : "NO"} en ${ms} ms; en ese instante la insignia dice «${despues}»; en la base: ${enBase}; aviso: «${exito || errorFirma || "—"}»`);
    await foto(p, "n140-consulta-firmada");
    if (enBase === "firmada" && despues === "Firmada" && libre) bien(`al firmar, la pantalla dice «Firmada» sin recargar (${ms} ms)`);
    else mal(`firmar: la base dice ${enBase} y la pantalla «${despues}» sin recargar`);
    await p.context().close();
  }

  const EST = (toca("n141") && !process.argv.includes("--n141")) || toca("n142") ? await negocioPrueba("prueba-qa-onboarding-estetica-s16") : null;
  let citaNueva = null;
  if (toca("n142")) {
    console.log("\nN142 · Estética: después de agendar con éxito no queda el aviso de horario de antes");
    const { p } = await pagina(EST, "admin");
    // La mascota y el servicio de la última cita de QA (ya tienen precio).
    const { data: ult } = await EST.N.from("citas_estetica").select("perro_id, servicio_id, empleado_id, perros(nombre, cliente_id, clientes(nombre))").eq("negocio_id", EST.negocio.id).not("perro_id", "is", null).order("created_at", { ascending: false }).limit(1).single();
    const cliente = ult.perros.clientes.nombre;
    await abrir(p, `${EST.base}/estetica/nueva`);
    await p.getByRole("searchbox").first().fill(ult.perros.nombre);
    await p.locator(`[data-cliente-id="${ult.perros.cliente_id}"] button`).first().click();
    await p.getByLabel(/^(Perro|Mascota|Gato)$/).selectOption(ult.perro_id);
    await p.getByLabel("Servicio", { exact: true }).selectOption(ult.servicio_id).catch(() => {});
    await p.locator("[data-aviso-precio=ok]").waitFor({ timeout: 20000 });
    // El mismo día con el que abre el formulario (su aviso es del día) a una hora distinta en cada corrida, para no
    // chocar con la cita «PRUEBA QA S41» de una corrida anterior.
    const campoHora = p.getByLabel("Fecha y hora");
    const diaForm = (await campoHora.inputValue()).slice(0, 10);
    const minutos = Math.floor(Date.now() / 60000);
    await campoHora.fill(`${diaForm}T0${6 + (minutos % 3)}:${String((minutos % 6) * 10).padStart(2, "0")}`);
    const avisoAntes = await texto(p.locator("[data-aviso-horario]").first());
    ver(`antes de agendar, aviso de horario: «${avisoAntes || "ninguno"}»`);
    const agendar = p.getByRole("button", { name: /Agendar cita|Agendando…/ });
    const t0 = Date.now();
    await agendar.click();
    // Si la mascota ya tiene cita ese día, se confirma (QA agenda varias en el mismo día).
    await Promise.race([p.locator("[data-citas-agendadas]").waitFor({ timeout: 30000 }), p.locator("[data-agendar-de-todos-modos]").waitFor({ timeout: 30000 })]).catch(() => {});
    if (await p.locator("[data-agendar-de-todos-modos]").count()) await p.locator("[data-agendar-de-todos-modos]").click();
    await p.locator("[data-citas-agendadas]").waitFor({ timeout: 30000 }).catch(() => {});
    await espera(2500);
    const exito = await texto(p.locator("[role=status]", { hasText: "Cita agendada" }).first());
    const avisoDespues = await texto(p.locator("[data-aviso-horario]").first());
    ver(`agendada en ${Date.now() - t0} ms: «${exito || "sin aviso de éxito"}»; aviso de horario después: «${avisoDespues || "ninguno"}»`);
    await foto(p, "n142-agendada");
    const { data: nueva } = await EST.N.from("citas_estetica").select("id, inicio").eq("negocio_id", EST.negocio.id).eq("perro_id", ult.perro_id).gte("created_at", new Date(t0 - 5000).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    citaNueva = nueva?.id ?? null;
    ver(`cita creada: ${citaNueva ?? "NINGUNA"}`);
    if (exito && !avisoDespues) bien("después de agendar queda solo el éxito, sin el aviso de horario de antes");
    else mal(`después de agendar con éxito sigue el aviso «${avisoDespues}»${avisoAntes ? ` (antes: «${avisoAntes}»)` : ""}`);
    await p.context().close();
  }

  if (toca("n141")) {
    console.log("\nN141 · Estética: «Confirmar inicio» sale de «Guardando…» con la respuesta");
    // --n141 <slug>:<rol>:<cita> para repetirlo en otro negocio de QA, con otro rol y otra cita.
    const otro = process.argv.includes("--n141") ? process.argv[process.argv.indexOf("--n141") + 1].split(":") : null;
    const NEG141 = otro ? await negocioPrueba(otro[0]) : EST;
    if (otro) citaNueva = otro[2];
    const { p } = await pagina(NEG141, otro?.[1] ?? "admin");
    // Solo la cita que acaba de agendar N142 (o la que se pase con --n141): nunca una cita de QA.
    if (!citaNueva) throw new Error("No hay cita «PRUEBA QA S41» para iniciar: corre n142 en la misma corrida.");
    await abrir(p, `${NEG141.base}/estetica/${citaNueva}`);
    await p.getByRole("button", { name: "Iniciar cita" }).click();
    const entrega = p.locator("#cita-entrega-nombre");
    if (await entrega.count()) await entrega.fill("PRUEBA QA S41");
    let confirmar = p.locator("[data-confirmar-inicio]");
    let r = await apretarYMedir(p, confirmar, /Guardando…/);
    if (await p.locator("[data-checkin-otro-dia]").count()) {
      ver("la cita no es de hoy: confirma recibirla de todos modos");
      confirmar = p.locator("[data-confirmar-inicio]");
      r = await apretarYMedir(p, confirmar, /Guardando…/);
    }
    await espera(1000);
    const sigue = await p.locator("[data-confirmar-inicio]").count();
    const textoBoton = sigue ? await texto(p.locator("[data-confirmar-inicio]").first()) : "(se cerró)";
    const enBase = (await NEG141.N.from("citas_estetica").select("estado").eq("id", citaNueva).single()).data?.estado;
    const finalizar = await p.getByRole("button", { name: /Finalizar/ }).count();
    ver(`botón libre ${r.libre ? "sí" : "NO"} en ${r.ms} ms; botón: «${textoBoton}»; en la base: ${enBase}; la pantalla ofrece finalizar: ${finalizar ? "sí" : "NO"}`);
    await foto(p, "n141-inicio");
    if (r.libre && r.ms < 8000 && enBase === "en_curso" && finalizar) bien(`«Confirmar inicio» respondió en ${r.ms} ms y la cita quedó en curso en pantalla`);
    else mal(`«Confirmar inicio»: ${r.libre ? `tardó ${r.ms} ms` : "se quedó en «Guardando…» más de 30 s"}; base ${enBase}; en pantalla ${finalizar ? "en curso" : "SIN cambiar"}`);
    await p.context().close();
  }

  if (toca("n143")) {
    console.log("\nN143 · buscadores y etiquetas sin «perro» en un negocio con Veterinaria y gatos");
    const { p } = await pagina(VET, "admin");
    const rutas = ["/caja", "/caja/cargo", "/caja/venta", "/caja/pases", "/caja/cobrar-junto", "/clientes", "/clientes/nuevo", "/estetica/nueva", "/reservas/nueva", "/veterinaria/agenda", "/veterinaria/agenda/nueva", "/veterinaria/expediente", "/veterinaria/inventario", "/veterinaria/carnet", "/veterinaria/estimados/nuevo", "/veterinaria/recetas/nueva", "/veterinaria/certificados/nuevo", "/veterinaria/hospitalizacion", "/inventario", "/perros"];
    const encontrados = [];
    for (const r of rutas) {
      await abrir(p, `${VET.base}${r}`);
      if (/\/login/.test(p.url())) continue;
      const cosas = await p.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("input[placeholder], textarea[placeholder]")) out.push(`placeholder «${el.getAttribute("placeholder")}»`);
        for (const el of document.querySelectorAll("label, legend, th, h1, h2, h3, button, p, span, a, option")) {
          if (el.children.length && el.tagName !== "BUTTON" && el.tagName !== "LABEL") continue;
          out.push(`${el.tagName.toLowerCase()} «${(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90)}»`);
        }
        return out.filter((t) => /\bperr(o|os|ito|itos)\b/i.test(t));
      });
      // No cuentan: nombres de mascotas de QA, la especie de una mascota («· Perro») ni lo que es solo de perros por
      // regla (descripciones de guardería, hotel, pases y recolección).
      const soloPerros = /PRUEBA QA|QA S\d+|«· (Perro|Gato)»|Perros por día|Perros que se quedan|pases y mensualidades|recoger y entregar perros|Cada paquete es de un perro/;
      for (const c of new Set(cosas)) if (!soloPerros.test(c)) encontrados.push(`${r}: ${c}`);
    }
    for (const e of encontrados) ver(e);
    if (!encontrados.length) bien("ningún buscador, etiqueta, título ni botón dice «perro»");
    else mal(`${encontrados.length} texto(s) con «perro» en un negocio con Veterinaria`);
    await p.context().close();
  }

  if (toca("n144")) {
    console.log("\nN144 · Hotel: el check-out lista los cargos de la cuenta y rotula la base");
    const HOT = await negocioPrueba("prueba-qa-onboarding-hotel-s16");
    const { p, api } = await pagina(HOT, "admin");
    const { data: e } = await HOT.N.from("estancias").select("id, reserva_id, precio_unitario").eq("negocio_id", HOT.negocio.id).eq("precio_unitario", 120).order("updated_at", { ascending: false }).limit(1).single();
    const { data: lineas } = await api.rpc("cuenta_lineas_estancia", { p_reserva_id: e.reserva_id });
    const suyas = (lineas ?? []).filter((l) => l.estancia_id === e.id);
    const { count: cargos } = await HOT.N.from("cargos_aplicados").select("id", { count: "exact", head: true }).eq("estancia_id", e.id);
    ver(`estancia ${e.id}: líneas de la cuenta ${suyas.map((l) => `${l.tipo} «${l.descripcion}» ${l.total}`).join(" · ")}; filas en cargos_aplicados: ${cargos}`);
    await abrir(p, `${HOT.base}/reservas/estancias/${e.id}/checkout`);
    const seccion = await texto(p.locator("text=Cargos aplicados").locator("xpath=ancestor::div[1]").first());
    ver(`check-out: «${seccion.slice(0, 300)}»`);
    await foto(p, "n144-checkout");
    const cargosEnCuenta = suyas.filter((l) => l.tipo !== "estancia" && l.tipo !== "ajuste").length;
    const diceNinguno = /Ninguno todavía/.test(seccion);
    const rotulaBase = /Base de la estancia/i.test(seccion);
    if ((cargosEnCuenta > 0 ? !diceNinguno : true) && rotulaBase) bien(`la sección de cargos cuadra con la cuenta (${cargosEnCuenta} cargo(s)) y la base va rotulada`);
    else mal(`check-out: ${diceNinguno ? "«Ninguno todavía»" : "lista cargos"} con ${cargosEnCuenta} cargo(s) en la cuenta; base ${rotulaBase ? "rotulada" : "SIN rotular («" + (suyas.find((l) => l.tipo === "estancia")?.descripcion ?? "—") + "»)"}`);
    await p.context().close();
  }
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
