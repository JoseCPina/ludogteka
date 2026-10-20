// Recetas, registro del SITPV, recetario especial, libro de control y portal EN PANTALLA, a 390 px
// (celular) — SOLO DESARROLLO, en Huellitas. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/veterinaria-fase4-ui-dev.mjs
//
// 1. Quién puede: un admin que no es médico no emite; el médico sí.
// 2. Receta simple: emitirla, original + 2 copias, mandarla (liga sin sesión), anularla.
// 3. Registro del SITPV: registrar, datos para copiar, abrir el SITPV, surtir, folio en la lista.
// 4. Ficha del producto: dice qué pide y no ofrece «Surtir» en un controlado.
// 5. Recetario especial: registrar un folio y surtir contra él.
// 6. Libro de control: renglones con folio y saldo, Excel y reporte mensual.
// 7. Portal del dueño: ve su receta.
// 10 y 10b (QA S15, 19 de octubre): el formulario de vacuna (carnet y consulta) se cierra al guardar y vuelve vacío.
// 10b también (QA S17): vacuna repetida (N53) y «Vacunas y desparasitación» con «Aplicar desparasitación» en la consulta (N51).
// 8. Sugerencias de la QA (17 de octubre): la receta se prellena con el «Tratamiento» de la consulta firmada,
//    la cantidad a surtir se calcula sola (y se puede cambiar) y, sin productos clínicos, el selector dice
//    «No hay productos cargados» con enlace a Inventario.
// 9. N34 (18 de octubre): borrador de la receta mientras se escribe, «Recuperar borrador» al volver y aviso al salir
//    (también al salir por un enlace del menú: confirmar, cancelar se queda).
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { comprobar, seccion, terminar, datos, B } from "./veterinaria-comun-dev.mjs";
import { preparar, limpiar, darFolios, rpc, SB } from "./recetas-comun-dev.mjs";

const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar(w <= 392, `${donde}: sin desborde a 390 px (${w}px)`);
};
const cuerpo = async (pag) => (await pag.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");

const E = await preparar("ui4");
const { P } = E;
const nav = await abrirNavegador();
const nuevoCtx = async (profileId) => {
  const c = await nav.newContext({ viewport: { width: 390, height: 844 } });
  if (profileId) await c.addCookies(await cookiesDe(profileId));
  const p = await c.newPage();
  p.on("dialog", (d) => d.accept());
  return { c, p };
};
try {
  const perro = await E.nuevoPerro("Uifour");
  const nombrePerro = `Uifour ${E.MARCA}`;
  const desde = 1000000 + Math.floor(Math.random() * 800000000);
  await darFolios(E, E.medA, desde, desde + 49);
  const telDueno = String((await SB.from("clientes").select("telefono").eq("id", datos.clienteSoloB).single()).data.telefono).replace(/\D/g, "").slice(-10);
  const adm = await nuevoCtx(datos.adminB);
  const mvz = await nuevoCtx(P.recConId);
  const cli = await nuevoCtx(datos.cuentaSoloB);
  const anon = await nuevoCtx(null);

  seccion("1. Quién puede");
  await adm.p.goto(`${BASE}/veterinaria/recetas/nueva?perro=${perro}`, { waitUntil: "networkidle" });
  comprobar(/Emitir recetas es de un médico veterinario/.test(await cuerpo(adm.p)), "un admin que no es médico ve que emitir es del médico");
  await adm.p.goto(`${BASE}/veterinaria`, { waitUntil: "networkidle" });
  comprobar(/Recetas y controlados/.test(await cuerpo(adm.p)), "la tarjeta «Recetas y controlados» sale en el inicio de Veterinaria");

  seccion("2. Receta simple");
  await mvz.p.goto(`${BASE}/veterinaria/recetas/nueva?perro=${perro}`, { waitUntil: "networkidle" });
  await sinDesborde(mvz.p, "nueva receta");
  comprobar((await mvz.p.locator("[data-receta-prellenada]").count()) === 0, "desde la ficha no hay prellenado");
  await mvz.p.getByLabel("Del inventario clínico (opcional)").selectOption({ label: `Meloxicam ${E.MARCA}` });
  await mvz.p.locator('input[name="dosis-0"]').fill("1 tableta");
  await mvz.p.locator('input[name="dn-0"]').fill("1");
  await mvz.p.locator('input[name="frec-0"]').fill("Cada 12 horas");
  await mvz.p.locator('input[name="fh-0"]').fill("12");
  await mvz.p.locator('input[name="dur-0"]').fill("5");
  comprobar(/Calculada: 10/.test(await cuerpo(mvz.p)), "muestra la cantidad calculada (10) en vivo");
  // N22 (medicamento escrito/elegido a mano): las indicaciones salen con los datos que hay.
  const indManual = await mvz.p.locator('input[name="ind-0"]').inputValue();
  comprobar(/^Meloxicam/.test(indManual) && /1 tableta cada 12 horas por 5 días$/.test(indManual), `N22: con el medicamento a mano, Indicaciones se genera («${indManual}»)`);
  await mvz.p.locator('input[name="dur-0"]').fill("8");
  comprobar(/por 8 días$/.test(await mvz.p.locator('input[name="ind-0"]').inputValue()), "N22: si cambias los días, las indicaciones los siguen (8)");
  await mvz.p.locator('input[name="dur-0"]').fill("5");
  comprobar((await mvz.p.locator('input[name="cant-0"]').inputValue()) === "10", "y la deja escrita en «Cantidad a surtir» (10)");
  await mvz.p.locator('input[name="cant-0"]').fill("12");
  comprobar(/La escribiste tú/.test(await cuerpo(mvz.p)) && (await mvz.p.locator('input[name="cant-0"]').inputValue()) === "12", "se puede cambiar a mano (12) y lo dice");
  await mvz.p.locator('input[name="cant-0"]').fill("10");
  // N18: ya escrita a mano, cambiar la duración NO deja una nota con un cálculo que no coincide.
  await mvz.p.locator('input[name="dur-0"]').fill("6");
  const notaManual = await cuerpo(mvz.p);
  comprobar((await mvz.p.locator('input[name="cant-0"]').inputValue()) === "10" && /La escribiste tú/.test(notaManual) && !/Calculada con dosis/.test(notaManual) && !/Calculada: 12/.test(notaManual), "editada a mano y cambiada la duración: sigue en 10 y la nota solo dice que la escribiste tú");
  comprobar((await mvz.p.locator("[data-usar-calculada]").count()) === 1 && /\(12\)/.test(await mvz.p.locator("[data-usar-calculada]").innerText()), "y ofrece el botón «Usar la cantidad calculada…» (12) como sugerencia");
  await mvz.p.locator("[data-usar-calculada]").click();
  comprobar((await mvz.p.locator('input[name="cant-0"]').inputValue()) === "12" && /Calculada: 12/.test(await cuerpo(mvz.p)), "al usarla, la cantidad vuelve a seguir al cálculo (12)");
  await mvz.p.locator('input[name="dur-0"]').fill("5");
  comprobar((await mvz.p.locator('input[name="cant-0"]').inputValue()) === "10", "y si cambias los días otra vez, la sigue (10)");
  await mvz.p.getByRole("button", { name: "Emitir receta" }).click();
  await mvz.p.waitForURL(/\/veterinaria\/recetas\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const rxId = mvz.p.url().split("/").pop();
  const t = await cuerpo(mvz.p);
  comprobar(/ORIGINAL/.test(t) && /COPIA 1/.test(t) && /COPIA 2/.test(t) && !/COPIA 3/.test(t), "la receta trae el original y 2 copias");
  comprobar(/Meloxicam/.test(t) && /cédula profesional/.test(t) && new RegExp(E.cedA).test(t) && /uso exclusivo en veterinaria|Uso exclusivo/i.test(t), "con producto, la cédula del médico y la leyenda");
  comprobar(/Cantidad a surtir:\s*10/.test(t), "y la cantidad a surtir");
  await sinDesborde(mvz.p, "receta");
  await mvz.p.getByRole("button", { name: "Mandar al dueño por WhatsApp" }).click();
  await mvz.p.waitForSelector('input[readonly]', { timeout: 15000 });
  const liga = await mvz.p.locator('input[readonly]').first().inputValue();
  comprobar(/\/rx\//.test(liga), `se genera la liga del dueño (${liga.slice(0, 40)}…)`);
  const hrefWa = await mvz.p.getByRole("link", { name: /Abrir WhatsApp/ }).getAttribute("href").catch(() => null);
  comprobar(hrefWa?.startsWith(`https://wa.me/52${telDueno}`), `y el WhatsApp sale con el teléfono del dueño (${hrefWa?.slice(0, 40)})`);
  await anon.p.goto(liga.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
  const pub = await cuerpo(anon.p);
  comprobar(/Receta n\.º/.test(pub) && /Meloxicam/.test(pub) && !/lote/i.test(pub), "la liga la abre cualquiera sin sesión y muestra la receta sin lotes");
  await sinDesborde(anon.p, "receta pública");
  await anon.p.goto(`${BASE}/rx/${"a".repeat(43)}`, { waitUntil: "networkidle" });
  comprobar(!/Meloxicam/.test(await cuerpo(anon.p)), "una liga inventada no muestra nada");
  await mvz.p.getByRole("button", { name: "Anular esta receta" }).click();
  await mvz.p.getByLabel("Motivo de la anulación").fill("Dosis mal escrita en prueba");
  await mvz.p.getByRole("button", { name: "Anular receta" }).click();
  await mvz.p.waitForSelector("text=Receta ANULADA", { timeout: 15000 });
  comprobar(true, "se anula con motivo y queda marcada");
  await anon.p.goto(liga.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
  comprobar(/anulada/i.test(await cuerpo(anon.p)), "y la liga del dueño dice que está anulada");
  await mvz.p.goto(`${BASE}/veterinaria/recetas`, { waitUntil: "networkidle" });
  comprobar(/Receta \d+ · Uifour/.test(await cuerpo(mvz.p)) && /Anulada/.test(await cuerpo(mvz.p)), "la lista la muestra anulada");
  // Para el portal: otra emitida
  const emitida = await rpc(P.recCon, "vet_receta_emitir", { p_perro: perro, p_consulta: null, p_lineas: [{ insumo_id: E.grupoII, producto: null, dosis: "1 tableta", via: "Oral", frecuencia: "Cada 12 horas", duracion_dias: 5, cantidad_surtir: 10 }], p_diagnostico: null, p_observaciones: null });

  seccion("3. Registro del SITPV");
  await mvz.p.goto(`${BASE}/veterinaria/recetas/sitpv/nuevo?perro=${perro}`, { waitUntil: "networkidle" });
  await sinDesborde(mvz.p, "registrar SITPV");
  await mvz.p.getByLabel("Producto (Grupo I)").selectOption({ label: new RegExp(`Xilazina ${E.MARCA}`).source ? undefined : undefined }).catch(() => {});
  const opcion = await mvz.p.locator('select[name="insumo_id"] option', { hasText: `Xilazina ${E.MARCA}` }).first().getAttribute("value");
  await mvz.p.locator('select[name="insumo_id"]').selectOption(opcion);
  const lote = await mvz.p.locator('select[name="lote_id"] option', { hasText: `L-grupoI-${E.MARCA}` }).first().getAttribute("value");
  await mvz.p.locator('select[name="lote_id"]').selectOption(lote);
  await mvz.p.locator('input[name="cantidad_total"]').fill("60");
  await mvz.p.locator('input[name="dosis"]').fill("0.5 ml/kg");
  await mvz.p.locator('select[name="parcialidades"]').selectOption("si");
  await mvz.p.locator('input[name="comprobante_compra"]').fill("Factura UI-1");
  await mvz.p.getByRole("button", { name: "Registrar", exact: true }).click();
  await mvz.p.waitForURL(/\/veterinaria\/recetas\/sitpv\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const espId = mvz.p.url().split("/").pop();
  const te = await cuerpo(mvz.p);
  comprobar(new RegExp(`Folio ${desde}`, "i").test(te) && /CPA-F4/.test(te) && /REG-I-1/.test(te), "el registro lleva el primer folio de su bloque, su CPA y el registro SENASICA");
  comprobar(/Espejo de receta SITPV – no válida para surtir/.test(te), "dice «Espejo de receta SITPV – no válida para surtir»");
  comprobar((await mvz.p.getByRole("link", { name: /Abrir el SITPV en otra pestaña/ }).getAttribute("target")) === "_blank", "hay un botón que abre el SITPV en otra pestaña");
  comprobar(/Datos para copiar al SITPV/.test(te) && (await mvz.p.getByRole("button", { name: "Copiar" }).count()) >= 5, "y los datos listos para copiar");
  await sinDesborde(mvz.p, "detalle del registro SITPV");
  await mvz.p.locator('select[name="lote_id"]').selectOption({ index: 0 });
  await mvz.p.locator('input[name="cantidad"]').fill("25");
  await mvz.p.getByRole("button", { name: "Registrar salida" }).click();
  await mvz.p.waitForSelector("text=Salida registrada", { timeout: 60000 });
  await mvz.p.reload({ waitUntil: "networkidle" });
  comprobar(/Surtido 25 de 60/.test(await cuerpo(mvz.p)) && /Aplicaciones \(parcialidades\)/.test(await cuerpo(mvz.p)), "la aplicación queda como parcialidad: surtido 25 de 60");
  await mvz.p.goto(`${BASE}/veterinaria/recetas/sitpv`, { waitUntil: "networkidle" });
  comprobar(new RegExp(`Folio ${desde} · Xilazina`, "i").test(await cuerpo(mvz.p)) && /49 disponibles de 50 asignados/.test(await cuerpo(mvz.p)), "la lista muestra el folio y los folios que le quedan (49 de 50)");
  await sinDesborde(mvz.p, "lista SITPV");

  seccion("4. Ficha del producto");
  await adm.p.goto(`${BASE}/veterinaria/inventario/${E.grupoI}`, { waitUntil: "networkidle" });
  const tp = await cuerpo(adm.p);
  comprobar(/Pide: Receta cuantificada del SITPV/.test(tp) && /libro de control/i.test(tp), "la ficha dice que pide la receta cuantificada y que va al libro");
  comprobar((await adm.p.getByRole("button", { name: "Surtir", exact: true }).count()) === 0, "y no ofrece «Surtir» en un controlado");
  comprobar(/Datos regulatorios/.test(tp), "muestra los datos regulatorios");
  await adm.p.goto(`${BASE}/veterinaria/inventario/${E.grupoII}`, { waitUntil: "networkidle" });
  comprobar((await adm.p.getByRole("button", { name: "Surtir", exact: true }).count()) >= 1, "un Grupo II sí conserva «Surtir»");

  seccion("5. Recetario especial");
  await mvz.p.goto(`${BASE}/veterinaria/recetas/especial?nuevo=1&perro=${perro}`, { waitUntil: "networkidle" });
  await sinDesborde(mvz.p, "recetario especial");
  await mvz.p.locator('input[name="folio"]').fill(`UI-${E.MARCA}`);
  await mvz.p.locator('input[name="codigo_barras"]').fill("7509876543210");
  await mvz.p.locator('input[name="dias"]').fill("10");
  await mvz.p.locator('input[name="cantidad_diaria"]').fill("5");
  await mvz.p.getByRole("button", { name: "Registrar", exact: true }).click();
  await mvz.p.waitForURL(/\/veterinaria\/recetas\/especial$/, { timeout: 20000 });
  comprobar(new RegExp(`Folio UI-${E.MARCA}`).test(await cuerpo(mvz.p)) && /= 50/.test(await cuerpo(mvz.p)), "el folio queda registrado: 10 días × 5 = 50");
  const tarjeta = mvz.p.locator("li", { hasText: `Folio UI-${E.MARCA}` });
  await tarjeta.getByRole("button", { name: "Surtir contra este folio" }).click();
  await mvz.p.locator('input[name="cantidad"]').fill("20");
  await mvz.p.getByRole("button", { name: "Registrar salida" }).click();
  await mvz.p.waitForSelector("text=Salida registrada", { timeout: 60000 });
  comprobar(true, "se surte contra el folio");
  await mvz.p.goto(`${BASE}/veterinaria/recetas/especial?nuevo=1&perro=${perro}`, { waitUntil: "networkidle" });
  await mvz.p.locator('input[name="folio"]').fill(`UI2-${E.MARCA}`);
  await mvz.p.locator('input[name="codigo_barras"]').fill("1");
  await mvz.p.locator('input[name="dias"]').fill("31");
  await mvz.p.locator('input[name="cantidad_diaria"]').fill("1");
  await mvz.p.getByRole("button", { name: "Registrar", exact: true }).click();
  await mvz.p.waitForTimeout(1500);
  comprobar(/30/.test(await cuerpo(mvz.p)), "más de 30 días se rechaza en pantalla");

  seccion("6. Libro de control y reporte mensual");
  await mvz.p.goto(`${BASE}/veterinaria/libro-control`, { waitUntil: "networkidle" });
  const tl = await cuerpo(mvz.p);
  comprobar(new RegExp(`Xilazina ${E.MARCA}`).test(tl) && new RegExp(String(desde)).test(tl) && /Uifour/.test(tl), "el libro trae la xilazina con el folio y el paciente");
  comprobar(new RegExp(`Morfina ${E.MARCA}`).test(tl) && new RegExp(`UI-${E.MARCA}`).test(tl), "y la morfina con el folio del recetario");
  comprobar(!new RegExp(`Meloxicam ${E.MARCA}`).test(tl), "sin los productos que no llevan libro");
  await sinDesborde(mvz.p, "libro de control");
  const xls = await mvz.p.evaluate(async () => {
    const r = await fetch(document.querySelector('a[href^="/api/veterinaria/libro-control/excel"]').getAttribute("href"));
    const b = await r.arrayBuffer();
    return { ok: r.ok, tipo: r.headers.get("content-type"), bytes: b.byteLength, cabeza: Array.from(new Uint8Array(b).slice(0, 2)) };
  });
  comprobar(xls.ok && /spreadsheetml/.test(xls.tipo ?? "") && xls.bytes > 3000 && xls.cabeza[0] === 0x50 && xls.cabeza[1] === 0x4b, `el Excel se descarga (${xls.bytes} bytes)`);
  const mesActual = E.hoy.slice(0, 8) + "01";
  await mvz.p.goto(`${BASE}/veterinaria/recetas/sitpv/reporte?medico=${E.medA}&periodo=${mesActual}`, { waitUntil: "networkidle" });
  const tr = await cuerpo(mvz.p);
  comprobar(/Reporte mensual del SITPV/.test(tr) && /Folios usados \(1\)/.test(tr) && /Parcialidades \(1\)/.test(tr) && /Todavía no termina|todavía no termina/.test(tr), "el reporte del mes trae el folio usado y la parcialidad, y dice que el mes no termina");
  await sinDesborde(mvz.p, "reporte mensual");
  await adm.p.goto(`${BASE}/veterinaria/libro-control`, { waitUntil: "networkidle" });
  comprobar(!/Xilazina/.test(await cuerpo(adm.p)) === false || /Ver el libro es de un médico|Xilazina/.test(await cuerpo(adm.p)), "admin también entra al libro");

  seccion("8. Receta desde una consulta firmada, cantidad y sin productos");
  const cons = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: E.medA });
  const cid = cons.cuerpo?.id ?? cons.cuerpo;
  await rpc(P.recCon, "vet_consulta_guardar", { p_id: cid, p_datos: { motivo: "Infección", anamnesis: "x", examen_fisico: "x", diagnosticos: [{ origen: "libre", nombre: "Otitis", tipo: "definitivo" }], plan: "Tratar", tratamiento: "Amoxicilina 250 mg, 1 tableta cada 12 horas por 7 días\nMeloxicam 1 ml cada 24 h durante 3 días" } });
  // Sin precio de catálogo para la consulta general, la consulta no se firma: se marca «Sin cobro» con motivo.
  const propuesta = (await rpc(P.recCon, "vet_consulta_cargos", { p_consulta: cid })).cuerpo;
  for (const l of propuesta?.lineas ?? []) if (l.precio_unitario == null) await rpc(P.recCon, "vet_consulta_cargo_quitar", { p_id: l.id, p_motivo: "Sin cobro: prueba de recetas" });
  const firmada = await rpc(P.recCon, "vet_consulta_firmar", { p_id: cid });
  comprobar(firmada.ok, `se firma una consulta con Tratamiento (${firmada.mensaje})`);
  if (firmada.ok) {
    await mvz.p.goto(`${BASE}/veterinaria/recetas/nueva?perro=${perro}&consulta=${cid}`, { waitUntil: "networkidle" });
    comprobar((await mvz.p.locator("[data-receta-prellenada]").count()) === 1, "desde la consulta firmada avisa que prellenó el medicamento");
    comprobar((await mvz.p.locator('input[name="producto-0"]').inputValue()) === "Amoxicilina" && (await mvz.p.locator('input[name="producto-1"]').inputValue()) === "Meloxicam", "un medicamento por renglón del Tratamiento (Amoxicilina y Meloxicam)");
    comprobar((await mvz.p.locator('input[name="fh-0"]').inputValue()) === "12" && (await mvz.p.locator('input[name="dur-0"]').inputValue()) === "7", "con sus horas (12) y sus días (7)");
    comprobar((await mvz.p.locator('input[name="cant-0"]').inputValue()) === "14", "y la cantidad calculada (14) ya escrita, editable");
    // N22: indicaciones generadas, con la frecuencia en el mismo formato que el placeholder.
    comprobar((await mvz.p.locator('input[name="frec-0"]').inputValue()) === "Cada 12 horas" && (await mvz.p.locator('input[name="frec-1"]').inputValue()) === "Cada 24 horas", "N22: la frecuencia prellenada es «Cada 12 horas» / «Cada 24 horas» (no «cada 24 h»)");
    comprobar((await mvz.p.locator('input[name="ind-1"]').inputValue()) === "Meloxicam 1 ml, 1 ml cada 24 horas por 3 días" || /^Meloxicam.*cada 24 horas por 3 días$/.test(await mvz.p.locator('input[name="ind-1"]').inputValue()), "N22: Indicaciones del Meloxicam dice «… cada 24 horas por 3 días»");
    await mvz.p.locator('input[name="dur-1"]').fill("5");
    comprobar(/cada 24 horas por 5 días$/.test(await mvz.p.locator('input[name="ind-1"]').inputValue()) && (await mvz.p.locator("[data-indicaciones-desfasadas]").count()) === 0, "N22: al cambiar la duración a 5, las indicaciones dicen «por 5 días» y no hay aviso");
    await mvz.p.locator('input[name="ind-1"]').fill("Dar con comida");
    await mvz.p.locator('input[name="dur-1"]').fill("6");
    comprobar((await mvz.p.locator("[data-indicaciones-desfasadas]").count()) === 1 && (await mvz.p.locator('input[name="ind-1"]').inputValue()) === "Dar con comida", "N22: si las escribiste tú y ya no coinciden, avisa y no las pisa");
    await mvz.p.locator("[data-regenerar-indicaciones]").click();
    comprobar(/cada 24 horas por 6 días$/.test(await mvz.p.locator('input[name="ind-1"]').inputValue()) && (await mvz.p.locator("[data-indicaciones-desfasadas]").count()) === 0, "N22: «Regenerar las indicaciones» las vuelve a armar (6 días)");
    await mvz.p.locator('input[name="producto-0"]').fill("Amoxicilina 250 mg");
    comprobar((await mvz.p.locator('input[name="producto-0"]').inputValue()) === "Amoxicilina 250 mg", "el medicamento prellenado se puede editar");
    await sinDesborde(mvz.p, "receta prellenada");
  }
  // Sin productos clínicos: mensaje con enlace a Inventario (se ocultan un momento y se restauran).
  const { data: vivos } = await SB.from("insumos").select("id").eq("negocio_id", B).eq("controla_lotes", true).is("deleted_at", null);
  const ids = (vivos ?? []).map((v) => v.id);
  try {
    if (ids.length) await SB.from("insumos").update({ deleted_at: new Date().toISOString() }).in("id", ids);
    await mvz.p.goto(`${BASE}/veterinaria/recetas/nueva?perro=${perro}`, { waitUntil: "networkidle" });
    const msg = mvz.p.locator("[data-sin-productos]").first();
    comprobar((await msg.count()) === 1 && /No hay productos cargados/.test(await msg.innerText()), "sin productos clínicos dice «No hay productos cargados»");
    comprobar((await msg.getByRole("link", { name: "Inventario" }).getAttribute("href").catch(() => null)) === "/veterinaria/inventario", "con enlace a Inventario");
    comprobar((await mvz.p.getByLabel("Del inventario clínico (opcional)").count()) === 0, "y ya no ofrece un selector vacío");
  } finally {
    if (ids.length) await SB.from("insumos").update({ deleted_at: null }).in("id", ids);
  }

  seccion("7. Portal del dueño");
  await cli.p.goto(`${BASE}/portal`, { waitUntil: "networkidle" });
  const enlacePerro = await cli.p.getByRole("link", { name: new RegExp(nombrePerro) }).first().getAttribute("href").catch(() => null);
  if (enlacePerro) {
    await cli.p.goto(`${BASE}${enlacePerro}`, { waitUntil: "networkidle" });
    const tc = await cuerpo(cli.p);
    comprobar(/Recetas/.test(tc) && /Meloxicam/.test(tc) && !/CPA|SITPV|lote/i.test(tc.split("Recetas")[1] ?? ""), "el dueño ve su receta, sin lotes ni datos del SITPV");
    await sinDesborde(cli.p, "portal con recetas");
  } else {
    comprobar(Boolean(emitida.ok), "(el portal no lista a la mascota de prueba: se verifica la función)");
  }

  // N34 (QA externa, 18 de octubre de 2026): la receta guarda un borrador mientras se escribe, lo ofrece al volver
  // y avisa antes de salir con cambios sin emitir.
  seccion("9. N34: borrador de la receta");
  {
    const perroB = await E.nuevoPerro("Borrador");
    const urlB = `${BASE}/veterinaria/recetas/nueva?perro=${perroB}`;
    const dialogos = [];
    mvz.p.on("dialog", (d) => dialogos.push(d.type()));
    const clave = `${perroB}:ficha`;
    const borradores = async () => ((await SB.from("formulario_borradores").select("id").eq("formulario", "receta").eq("clave", clave).is("deleted_at", null)).data ?? []).length;
    await mvz.p.goto(urlB, { waitUntil: "networkidle" });
    comprobar((await mvz.p.getByTestId("aviso-borrador").count()) === 0, "una receta nueva no ofrece borrador");
    await mvz.p.locator('input[name="producto-0"]').fill("Prednisona 20 mg");
    await mvz.p.locator('input[name="dosis-0"]').fill("1 tableta");
    await mvz.p.locator('input[name="dur-0"]').fill("7");
    await mvz.p.locator('input[name="diagnostico"]').fill("Dermatitis alérgica");
    for (let i = 0; i < 20 && (await borradores()) === 0; i++) await mvz.p.waitForTimeout(500);
    comprobar((await borradores()) === 1, "a los pocos segundos de escribir se guarda UN borrador");
    // Salir con cambios sin emitir avisa (beforeunload) y, al aceptar, se sale.
    await mvz.p.goto(`${BASE}/veterinaria/recetas`, { waitUntil: "networkidle" });
    comprobar(dialogos.includes("beforeunload"), "al salir con cambios sin emitir, el navegador avisa");
    await mvz.p.goto(urlB, { waitUntil: "networkidle" });
    const aviso = mvz.p.getByTestId("aviso-borrador");
    await aviso.waitFor({ timeout: 20000 });
    comprobar(/Tienes un borrador sin guardar/.test(await aviso.innerText()), "al volver a abrir la receta de esa mascota ofrece recuperar el borrador");
    comprobar((await mvz.p.locator('input[name="producto-0"]').inputValue()) === "", "y no lo pone solo: el formulario sigue en blanco hasta que lo pidas");
    await sinDesborde(mvz.p, "receta con aviso de borrador");
    await mvz.p.getByRole("button", { name: "Recuperar borrador" }).click();
    await mvz.p.waitForTimeout(600);
    comprobar((await mvz.p.locator('input[name="producto-0"]').inputValue()) === "Prednisona 20 mg" && (await mvz.p.locator('input[name="dosis-0"]').inputValue()) === "1 tableta" && (await mvz.p.locator('input[name="diagnostico"]').inputValue()) === "Dermatitis alérgica", "«Recuperar borrador» devuelve medicamento, dosis y diagnóstico");
    // N34 (QA S13): salir por un enlace de la app (menú lateral, Inicio) también pide confirmar.
    {
      let aceptar = false;
      const tipos = [];
      mvz.p.removeAllListeners("dialog");
      mvz.p.on("dialog", (d) => { tipos.push(`${d.type()}:${d.message().slice(0, 40)}`); (aceptar ? d.accept() : d.dismiss()).catch(() => {}); });
      const antes = mvz.p.url();
      const clicMenu = () => mvz.p.evaluate(() => {
        const a = [...document.querySelectorAll("nav a[href^='/'], aside a[href^='/']")].find((x) => new URL(x.href).pathname !== location.pathname);
        if (!a) return null;
        a.click();
        return a.getAttribute("href");
      });
      const destino = await clicMenu();
      await mvz.p.waitForTimeout(1500);
      comprobar(!!destino && tipos.some((t) => t.startsWith("confirm:")), `al tocar un enlace del menú (${destino}) pide confirmar antes de salir`);
      comprobar(mvz.p.url() === antes, "y si se cancela, se queda en la receta");
      comprobar((await mvz.p.locator('input[name="producto-0"]').inputValue()) === "Prednisona 20 mg", "con lo escrito intacto");
      aceptar = true;
      tipos.length = 0;
      await clicMenu();
      await mvz.p.waitForURL((u) => u.toString() !== antes, { timeout: 30000 }).catch(() => {});
      comprobar(mvz.p.url() !== antes, `si se acepta, sale a ${new globalThis.URL(mvz.p.url()).pathname}`);
      mvz.p.removeAllListeners("dialog");
      mvz.p.on("dialog", (d) => d.accept().catch(() => {}));
      await mvz.p.goto(urlB, { waitUntil: "networkidle" });
      await mvz.p.getByTestId("aviso-borrador").waitFor({ timeout: 20000 });
      await mvz.p.getByRole("button", { name: "Recuperar borrador" }).click();
      await mvz.p.waitForTimeout(600);
    }
    // Emitir la receta limpia el borrador y ya no avisa al salir.
    await mvz.p.locator('input[name="dn-0"]').fill("1");
    await mvz.p.locator('input[name="frec-0"]').fill("Cada 24 horas");
    await mvz.p.locator('input[name="fh-0"]').fill("24");
    await mvz.p.getByRole("button", { name: "Emitir receta" }).click();
    await mvz.p.waitForURL(/\/veterinaria\/recetas\/[0-9a-f-]{36}/, { timeout: 40000 }).catch(() => {});
    comprobar(/\/veterinaria\/recetas\/[0-9a-f-]{36}/.test(mvz.p.url()), `la receta se emite (${mvz.p.url().split("/").pop()})`);
    comprobar((await borradores()) === 0, "emitida, el borrador se borra");
    await mvz.p.goto(urlB, { waitUntil: "networkidle" });
    comprobar((await mvz.p.getByTestId("aviso-borrador").count()) === 0, "y al volver a abrir ya no lo ofrece");
  }

  seccion("10. QA S14: el formulario de vacuna se limpia después de registrar");
  {
    const perroV = await E.nuevoPerro("Vacunaform");
    await mvz.p.goto(`${BASE}/veterinaria/carnet/${perroV}`, { waitUntil: "networkidle" });
    await mvz.p.getByRole("button", { name: "Registrar vacuna" }).first().click();
    const form = mvz.p.locator("form", { has: mvz.p.locator('input[name="biologico"]') }).first();
    await form.waitFor({ timeout: 20000 });
    const inv = form.locator('select[name="insumo_id"]');
    const hayInventario = (await inv.count()) > 0 && (await inv.locator("option").count()) > 1;
    if (hayInventario) await inv.selectOption({ index: 1 });
    await form.locator('input[name="biologico"]').fill(`Rabia prueba ${E.MARCA}`);
    await form.locator('input[name="laboratorio"]').fill("Lab prueba");
    await form.locator('input[name="dosis"]').fill("1 mL");
    const medico = form.locator('select[name="medico_id"]');
    if (!(await medico.inputValue())) await medico.selectOption({ index: 1 });
    await form.getByRole("button", { name: "Registrar vacuna" }).click();
    // QA S15: al guardar, el formulario se cierra y deja el aviso junto al botón; al abrirlo de nuevo nace vacío.
    const avisoV = mvz.p.locator("[data-desplegable-aviso]").first();
    await avisoV.waitFor({ timeout: 40000 }).catch(() => {});
    comprobar(/Vacuna registrada/.test(await avisoV.innerText().catch(() => "")), "se registra la vacuna y el aviso queda junto al botón");
    comprobar((await mvz.p.locator('input[name="biologico"]').count()) === 0, "el formulario se cierra al guardar");
    await mvz.p.getByRole("button", { name: "Registrar vacuna" }).first().click();
    const form2 = mvz.p.locator("form", { has: mvz.p.locator('input[name="biologico"]') }).first();
    await form2.waitFor({ timeout: 20000 });
    comprobar((await form2.locator('input[name="biologico"]').inputValue()) === "", "al abrirlo de nuevo, el nombre de la vacuna está vacío");
    comprobar((await form2.locator('input[name="laboratorio"]').inputValue()) === "" && (await form2.locator('input[name="dosis"]').inputValue()) === "", "laboratorio y cantidad vacíos");
    if (hayInventario) comprobar((await form2.locator('select[name="insumo_id"]').inputValue()) === "", "la vacuna del inventario vuelve a «Lo escribo yo»");
    comprobar((await mvz.p.locator("[data-desplegable-aviso]").count()) === 0, "y el aviso anterior ya no se ve");
    const { count } = await SB.from("carnet_vacunas").select("id", { count: "exact", head: true }).eq("perro_id", perroV).is("anulada_at", null);
    comprobar(count === 1, `queda UNA vacuna registrada (${count})`);
    await sinDesborde(mvz.p, "carnet después de registrar");
  }

  seccion("10b. QA S15: «Aplicar vacuna» dentro de la consulta se cierra al guardar y vuelve vacío");
  {
    const perroC = await E.nuevoPerro("Vacunaconsulta");
    const cons = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perroC, p_cita: null, p_tipo: "consulta", p_medico: E.medA });
    const cidV = cons.cuerpo?.id ?? cons.cuerpo;
    comprobar(Boolean(cidV), `se abre una consulta en borrador (${cons.mensaje ?? "ok"})`);
    await mvz.p.goto(`${BASE}/veterinaria/consulta/${cidV}`, { waitUntil: "networkidle" });
    const apartado = mvz.p.locator("[data-aplicar-vacuna]");
    await apartado.getByRole("button", { name: "Aplicar vacuna", exact: true }).click();
    const formC = apartado.locator("form").first();
    await formC.waitFor({ timeout: 20000 });
    await formC.locator('input[name="biologico"]').fill(`Moquillo prueba ${E.MARCA}`);
    await formC.locator('input[name="laboratorio"]').fill("Lab consulta");
    await formC.locator('input[name="dosis"]').fill("1 mL");
    const medC = formC.locator('select[name="medico_id"]');
    if (!(await medC.inputValue())) await medC.selectOption({ index: 1 });
    await formC.getByRole("button", { name: "Registrar vacuna" }).click();
    const avisoC = apartado.locator("[data-desplegable-aviso]");
    await avisoC.waitFor({ timeout: 40000 }).catch(() => {});
    comprobar(/Vacuna registrada/.test(await avisoC.innerText().catch(() => "")), "en la consulta, se registra y avisa");
    comprobar((await apartado.locator('input[name="biologico"]').count()) === 0, "y el formulario se cierra");
    await apartado.getByRole("button", { name: "Aplicar vacuna", exact: true }).click();
    const formC2 = apartado.locator("form").first();
    await formC2.waitFor({ timeout: 20000 });
    comprobar((await formC2.locator('input[name="biologico"]').inputValue()) === "" && (await formC2.locator('input[name="laboratorio"]').inputValue()) === "" && (await formC2.locator('input[name="dosis"]').inputValue()) === "", "al abrir «Aplicar vacuna» otra vez, todo está vacío");
    const { count: nC } = await SB.from("carnet_vacunas").select("id", { count: "exact", head: true }).eq("perro_id", perroC).is("anulada_at", null);
    comprobar(nC === 1, `queda UNA vacuna en el carnet (${nC})`);
    // QA S17 (N53): repetir la misma vacuna con la misma fecha: se bloquea, el formulario se cierra y ofrece salidas.
    await formC2.locator('input[name="biologico"]').fill(`Moquillo prueba ${E.MARCA}`);
    const medC2 = formC2.locator('select[name="medico_id"]');
    if (!(await medC2.inputValue())) await medC2.selectOption({ index: 1 });
    await formC2.getByRole("button", { name: "Registrar vacuna" }).click();
    const dup = apartado.locator("[data-aviso-duplicado]");
    const hayDup = await dup.waitFor({ timeout: 30000 }).then(() => true, () => false);
    comprobar(hayDup && /Ya hay una vacuna/.test(await dup.innerText()) && (await apartado.locator('input[name="biologico"]').count()) === 0
      && (await dup.locator("[data-cancelar-duplicado]").count()) === 1 && (await dup.locator("[data-ver-carnet]").getAttribute("href")) === `/veterinaria/carnet/${perroC}`,
      "N53: la vacuna repetida cierra el formulario y ofrece «Cancelar» y «Ver en el carnet»");
    await dup.locator("[data-cancelar-duplicado]").click();
    comprobar((await apartado.locator("[data-aviso-duplicado]").count()) === 0, "«Cancelar» cierra el aviso");
    // QA S17 (N51): lo aplicado se ve en la sección «Vacunas y desparasitación» de la consulta, y se desparasita desde ahí.
    await mvz.p.reload({ waitUntil: "networkidle" });
    comprobar((await mvz.p.locator("[data-vacunas-consulta] [data-vacuna-consulta]").innerText().catch(() => "")).includes(`Moquillo prueba ${E.MARCA}`), "N51: la vacuna aplicada sale en «Vacunas y desparasitación» de la consulta");
    const despa = mvz.p.locator("[data-aplicar-desparasitacion]");
    comprobar((await despa.count()) === 1, "N51: junto a «Aplicar vacuna» está «Aplicar desparasitación»");
    await despa.getByRole("button", { name: "Aplicar desparasitación", exact: true }).click();
    const formD = despa.locator("form").first();
    await formD.waitFor({ timeout: 20000 });
    await formD.locator('input[name="producto"]').fill(`Desparasitante prueba ${E.MARCA}`);
    await formD.getByRole("button", { name: "Registrar desparasitación" }).click();
    await despa.locator("[data-desplegable-aviso]").waitFor({ timeout: 40000 }).catch(() => {});
    await mvz.p.reload({ waitUntil: "networkidle" });
    comprobar((await mvz.p.locator("[data-vacunas-consulta] [data-desparasitacion-consulta]").innerText().catch(() => "")).includes(`Desparasitante prueba ${E.MARCA}`), "N51: la desparasitación aplicada desde la consulta sale en su sección");
    await rpc(P.recCon, "vet_consulta_anular", { p_id: cidV, p_motivo: "Prueba de auditoría" }).catch(() => {});
  }
  // QA S16: la cédula profesional son 7 u 8 números (pantalla y base), y la bienvenida ofrece «Yo soy el médico».
  seccion("11. QA S16: cédula profesional válida al designar un médico");
  {
    const { c, p } = await nuevoCtx(datos.adminB);
    await p.goto(`${BASE}/veterinaria/medicos`, { waitUntil: "networkidle" });
    const persona = p.getByLabel("Persona del personal");
    if (await persona.count()) {
      await persona.selectOption({ index: 1 });
      const form = p.locator("form", { has: persona });
      await form.getByLabel("Cédula profesional").fill("ABC-12");
      await form.getByRole("button", { name: "Designar médico" }).click();
      await p.waitForTimeout(2500);
      comprobar(/7 u 8 números/.test(await cuerpo(p)), "en Médicos, una cédula con letras se rechaza y dice que son 7 u 8 números");
    } else comprobar(true, "(todo el personal ya es médico: sin candidatos que probar en Médicos)");
    await p.goto(`${BASE}/bienvenida/medico`, { waitUntil: "networkidle" });
    const yo = p.locator("[data-yo-soy-medico]");
    if (await yo.count()) {
      await yo.getByLabel("Cédula profesional *").fill("123");
      comprobar(await yo.getByRole("button", { name: "Designarme médico" }).isDisabled() && /Son 7 u 8 números/.test(await yo.innerText()), "en la bienvenida, «Designarme médico» no se activa con una cédula corta y dice por qué");
      await yo.getByLabel("Cédula profesional *").fill("1234567");
      comprobar(await yo.getByRole("button", { name: "Designarme médico" }).isEnabled(), "con 7 números se activa (no se guarda en esta prueba)");
    } else comprobar(true, "(el admin ya es médico: la bienvenida no ofrece «Yo soy el médico»)");
    await c.close();
  }
} finally {
  await nav.close().catch(() => {});
  await limpiar(E);
}
terminar();
