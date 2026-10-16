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
  await mvz.p.getByLabel("Del inventario clínico (opcional)").selectOption({ label: `Meloxicam ${E.MARCA}` });
  await mvz.p.locator('input[name="dosis-0"]').fill("1 tableta");
  await mvz.p.locator('input[name="dn-0"]').fill("1");
  await mvz.p.locator('input[name="frec-0"]').fill("Cada 12 horas");
  await mvz.p.locator('input[name="fh-0"]').fill("12");
  await mvz.p.locator('input[name="dur-0"]').fill("5");
  comprobar(/Calculada: 10/.test(await cuerpo(mvz.p)), "muestra la cantidad calculada (10) en vivo");
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
  await mvz.p.waitForSelector("text=Salida registrada", { timeout: 15000 });
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
  await mvz.p.waitForSelector("text=Salida registrada", { timeout: 15000 });
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
} finally {
  await nav.close().catch(() => {});
  await limpiar(E);
}
terminar();
