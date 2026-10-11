// Importador de clientes y mascotas · Parte B: el asistente en el navegador (SOLO DESARROLLO,
// en Huellitas). Lo corre importador-dev.mjs después de su parte de base; también solo:
//
//   node scripts/auditoria/importador-ui-dev.mjs      (necesita `npm run build`)
//
// Levanta `next start` en el 3005 y prueba, con un .xlsx y un .csv de verdad: quién entra,
// la sugerencia de columnas, la vista previa con errores por fila, la importación por
// lotes, el mismo archivo otra vez, la plantilla, acentos de Windows, el historial, deshacer,
// retomar una importación a medias y el autoguardado de borradores en pantalla.
import { spawn } from "node:child_process";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, B, SB, URL, env, rpc, personas, dar, quitar, fijarModulo, comprobar, hallazgo, seccion, terminar } from "./veterinaria-comun-dev.mjs";

const MARCA = `ZZIMU${String(Date.now()).slice(-5)}`;
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
const tel = () => `44${rnd(8)}`;
const chip = () => `98577${rnd(10)}`;
const huella = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");

const P = await personas();
const vetOriginal = (await SB.from("negocio_modulos").select("activo").eq("negocio_id", B).eq("modulo", "veterinaria").is("deleted_at", null).maybeSingle()).data?.activo ?? false;
const clientePorTel = async (t) => (await SB.from("clientes").select("*").eq("negocio_id", B).eq("telefono", t).is("deleted_at", null).maybeSingle()).data;
const perrosDe = async (id) => (await SB.from("perros").select("*").eq("cliente_id", id).is("deleted_at", null).order("created_at")).data;

const PUERTO = 3005;
const BASE = `http://huellitas.localhost:${PUERTO}`;
const REF = new globalThis.URL(URL).hostname.split(".")[0];

console.log("\n══ PARTE B · servidor real + navegador");
const servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
  env: { ...process.env, PELUDESK_URL_DESARROLLO: `http://{slug}.localhost:${PUERTO}` },
  stdio: ["ignore", "pipe", "pipe"],
});
let bitacora = "";
servidor.stdout.on("data", (d) => (bitacora += d));
servidor.stderr.on("data", (d) => (bitacora += d));
process.on("exit", () => { try { servidor.kill(); } catch { /* ya cerró */ } });
const pedir = (host, ruta) => new Promise((resolve, reject) => {
  const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: "GET", headers: { host: `${host}:${PUERTO}` } }, (r) => { r.resume(); r.on("end", () => resolve({ status: r.statusCode })); });
  q.on("error", reject);
  q.end();
});
const esperarHasta = async (fn, ms = 20000, paso = 400) => { const t = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t > ms) return null; await new Promise((x) => setTimeout(x, paso)); } };
async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: ses, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(ses.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

// Un .xlsx de verdad (zip con una hoja): lo que Excel entrega, sin depender de Excel.
const celdaXlsx = (v, ref) => (typeof v === "number"
  ? `<c r="${ref}"><v>${v}</v></c>`
  : `<c r="${ref}" t="inlineStr"><is><t>${String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></is></c>`);
function xlsx(filas) {
  const col = (i) => String.fromCharCode(65 + i);
  const filasXml = filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => (v === "" || v === null ? "" : celdaXlsx(v, `${col(c)}${r + 1}`))).join("")}</row>`).join("");
  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filasXml}</sheetData></worksheet>`;
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8(`${cab}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": strToU8(`${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`${cab}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clientes" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(hoja),
  }));
}

let nav;
const clientesCreados = [];
try {
  const listo = await esperarHasta(async () => (await pedir("huellitas.localhost", "/login").catch(() => null))?.status === 200, 60000, 1000);
  comprobar(listo, "el servidor de la prueba arrancó (necesita `npm run build`)");
  if (!listo) throw new Error("sin servidor:\n" + bitacora.slice(-1500));
  await fijarModulo("veterinaria", true);
  await dar(P.admin, P.recConId, "editar_ficha_clinica");
  await quitar(P.admin, P.recSinId, "importar_datos");
  await quitar(P.admin, P.recConId, "importar_datos");

  nav = await abrirNavegador();
  const ctxA = await nav.newContext();
  await ctxA.addCookies(await cookiesDe(P.adminId));
  const pag = await ctxA.newPage();
  // La base de desarrollo está lejos: una ficha tarda de 6 a 20 s en cargar.
  pag.setDefaultNavigationTimeout(90000);
  const seen = (re, ms = 30000) => pag.getByText(re).first().waitFor({ timeout: ms }).then(() => true).catch(() => false);

  // ── B1 ──
  seccion("B1. Quién entra a Importar");
  const ctxR = await nav.newContext();
  await ctxR.addCookies(await cookiesDe(P.recSinId));
  const pr = await ctxR.newPage();
  await pr.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  const rutaR = new globalThis.URL(pr.url()).pathname;
  comprobar(!rutaR.startsWith("/admin/importar"), `recepción sin el permiso no entra (${rutaR})`);
  comprobar((await pr.getByRole("link", { name: "Importar", exact: true }).count()) === 0, "…y no ve «Importar» en el menú");
  await pag.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  comprobar(await seen(/Importar clientes y mascotas/), "admin entra");
  comprobar((await pag.getByRole("link", { name: "Importar", exact: true }).count()) > 0, "…y lo ve en el menú");

  // ── B2 ──
  seccion("B2. Un Excel (.xlsx) de punta a punta");
  const T1 = tel(), T2 = tel(), T3 = tel(), T5 = tel();
  const dueno2 = await SB.from("clientes").insert({ negocio_id: B, nombre: `${MARCA} Existente UI`, telefono: T2 }).select("id").single();
  clientesCreados.push(dueno2.data.id);
  const encabezados = ["Nombre del cliente", "Celular", "Correo electrónico", "Mascota", "Especie", "Raza", "Sexo", "Fecha de nacimiento", "Tamaño", "Peso (kg)", "Alergias", "Microchip", "Cosas sueltas"];
  const M1 = chip();
  const filasX = [
    encabezados,
    [`${MARCA} Ana UI`, Number(T1), "ana.ui@correo.test", `${MARCA} Rocky`, "Perro", "Labrador", "Macho", "15/03/2021", "Grande", 28.5, "Pollo; Polen", M1, "x"],
    [`${MARCA} Ana UI`, T1, "", `${MARCA} Luna`, "Gato", "Raza imaginaria Q", "Hembra", "", "", "", "", "", ""],
    [`${MARCA} Ana UI`, T1, "", `${MARCA} Luna`, "Gato", "", "", "", "", "", "", "", ""],
    [`${MARCA} Beto UI`, `(${T3.slice(0, 3)}) ${T3.slice(3, 6)} ${T3.slice(6)}`, "", "", "", "", "", "", "", "", "", "", ""],
    [`${MARCA} Carla UI`, "12345", "", `${MARCA} Fido`, "", "", "", "", "", "", "", "", ""],
    [`${MARCA} Dora UI`, T5, "no-es-correo", `${MARCA} Fido`, "", "Mestizo", "Quizá", "31/02/2020", "Enorme", "", "", "", ""],
    [`${MARCA} Existente UI`, T2, "", `${MARCA} Nuevo UI`, "Perro", "Criollo", "", "", "", "", "", "", ""],
    ["", tel(), "", "", "", "", "", "", "", "", "", "", ""],
  ];
  const archivoX = { name: `${MARCA}-clientes.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsx(filasX) };
  await pag.setInputFiles('[data-testid="archivo-importar"]', archivoX);
  comprobar(await seen(/Revisa a qué campo corresponde/), "se lee el Excel y pasa al mapeo de columnas");
  const valores = await pag.locator("table select").evaluateAll((els) => els.map((e) => e.value));
  const esperado = ["c_nombre", "c_telefono", "c_email", "m_nombre", "m_especie", "m_raza", "m_sexo", "m_nacimiento", "m_tamano", "m_peso", "m_alergias", "m_microchip", ""];
  comprobar(JSON.stringify(valores) === JSON.stringify(esperado), `la sugerencia automática acierta cada columna (${valores.join(",")})`);
  const celdaTel = await pag.locator("table tbody tr").nth(1).locator("td").nth(1).innerText();
  comprobar(celdaTel.includes(T1) && !/e\+/i.test(celdaTel), "un teléfono que Excel guarda como número se lee completo, sin exponente");
  await pag.getByRole("button", { name: "Revisar antes de importar" }).click();
  comprobar(await seen(/Se importan/), "la vista previa se arma");
  const textoPrev = await pag.locator("section").filter({ hasText: "Se importan" }).first().innerText();
  const cifra = (etiqueta) => Number(new RegExp(`(\\d[\\d,]*)\\s*\\n?\\s*${etiqueta}`).exec(textoPrev)?.[1]?.replace(/,/g, "") ?? NaN);
  comprobar(cifra("Filas") === 8, `8 filas (${cifra("Filas")})`);
  comprobar(cifra("Se importan") === 6, `6 se importan (${cifra("Se importan")})`);
  comprobar(cifra("Con error \\(no entran\\)") === 2, `2 con error: teléfono inválido y sin nombre (${cifra("Con error \\(no entran\\)")})`);
  comprobar(cifra("Dueños nuevos") === 3, `3 dueños nuevos: Ana (en 3 filas), Beto y Dora (${cifra("Dueños nuevos")})`);
  comprobar(cifra("Dueños que ya existen") === 1, "1 dueño que ya existe");
  comprobar(cifra("Mascotas nuevas") === 4, `4 mascotas nuevas: Rocky, Luna, Fido de Dora y la de Existente (${cifra("Mascotas nuevas")})`);
  comprobar(await pag.getByText("Mismo dueño que la fila 2").first().isVisible(), "las filas del mismo teléfono dicen «Mismo dueño que la fila 2»");
  comprobar(await pag.getByText("Repetida (fila 3)").first().isVisible(), "una mascota repetida en el archivo se marca");
  comprobar(await pag.getByText(/no tiene 10 dígitos/).first().isVisible(), "el error del teléfono dice cuál es");
  comprobar(await pag.getByText(/Falta el nombre del dueño/).first().isVisible(), "…y el de la fila sin nombre");
  comprobar((await pag.getByText(/Sexo «Quizá» no reconocido/).first().isVisible()) && (await pag.getByText(/Fecha de nacimiento «31\/02\/2020» no válida/).first().isVisible()), "los avisos (sexo, fecha imposible) se explican por fila");
  comprobar((await pag.getByText(/Razas que no están en el catálogo/).first().isVisible()) && (await pag.getByText(/Raza imaginaria Q/).first().isVisible()), "las razas fuera del catálogo se resumen antes de importar");
  await pag.getByRole("button", { name: "Con error", exact: true }).click();
  const filasError = await pag.locator('[data-testid="tabla-revision"] tbody tr').count();
  comprobar(filasError === 2, `el filtro «Con error» deja 2 filas (${filasError})`);
  await pag.getByRole("button", { name: "Todas", exact: true }).click();
  await pag.getByRole("button", { name: /^Importar 6 filas/ }).click();
  comprobar(await seen(/Importación terminada/, 90000), "la importación avanza por lotes y termina");
  const ana = await clientePorTel(T1);
  comprobar(ana && ana.email === "ana.ui@correo.test", "Ana quedó con su correo");
  const perrosAna = ana ? await perrosDe(ana.id) : [];
  comprobar(perrosAna.length === 2, `…y con sus 2 mascotas, sin la repetida (${perrosAna.length})`);
  const rocky = perrosAna.find((p) => p.nombre.endsWith("Rocky"));
  comprobar(rocky && rocky.fecha_nacimiento === "2021-03-15" && rocky.microchip === M1, "fecha en formato día/mes/año y microchip");
  comprobar(await clientePorTel(T3), "«(444) 111 2233» se guarda como 10 dígitos");
  const dora = await clientePorTel(T5);
  const fido = dora ? (await perrosDe(dora.id))[0] : null;
  comprobar(fido && fido.sexo === null && fido.fecha_nacimiento === null && fido.tamano_id === null && dora.email === null, "los datos con aviso se importan vacíos (sexo, fecha, tamaño, correo)");
  comprobar(fido && fido.raza_id !== null, "«Mestizo» se liga al catálogo");
  comprobar((await perrosDe(dueno2.data.id)).length === 1, "el dueño existente recibe su mascota nueva");
  comprobar(await pag.getByText(/Raza imaginaria Q/).first().isVisible(), "el resumen final lista la raza que quedó como texto");
  comprobar(await pag.getByRole("link", { name: "Perros → Razas" }).first().isVisible(), "…con el enlace para corregirla");
  const imp = (await SB.from("importaciones").select("id, estado, total_filas").eq("negocio_id", B).eq("nombre_archivo", archivoX.name)).data;
  comprobar(imp.length === 1 && imp[0].estado === "completada" && imp[0].total_filas === 8, "queda UNA importación en el historial");
  const idX = imp[0].id;

  // ── B3 ──
  seccion("B3. Subir el mismo archivo otra vez no duplica");
  await pag.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  await pag.setInputFiles('[data-testid="archivo-importar"]', archivoX);
  await pag.getByRole("button", { name: "Revisar antes de importar" }).click();
  await pag.getByText(/Se importan/).first().waitFor({ timeout: 30000 });
  comprobar(await pag.getByText(/Ya existe/).first().isVisible(), "la vista previa ya marca a esos dueños como existentes");
  const contar = async () => (await SB.from("clientes").select("id", { count: "exact", head: true }).eq("negocio_id", B).like("nombre", `${MARCA}%`).is("deleted_at", null)).count;
  const antesN = await contar();
  await pag.getByRole("button", { name: /^Importar \d+ filas/ }).click();
  await seen(/Importación terminada/, 60000);
  await new Promise((r) => setTimeout(r, 1500));
  const despuesN = await contar();
  const impN = (await SB.from("importaciones").select("id", { count: "exact", head: true }).eq("negocio_id", B).eq("nombre_archivo", archivoX.name)).count;
  comprobar(antesN === despuesN && impN === 1, `no hay dueños nuevos ni una segunda importación (${antesN}→${despuesN}, importaciones ${impN})`);

  // ── B4 ──
  seccion("B4. Plantilla descargable y CSV con acentos");
  await pag.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  const [descarga] = await Promise.all([pag.waitForEvent("download"), pag.getByRole("button", { name: "Descargar plantilla" }).click()]);
  const contenido = (await readFile(await descarga.path())).toString("utf8");
  comprobar(descarga.suggestedFilename().endsWith(".csv") && contenido.startsWith("﻿") && contenido.includes("Nombre del dueño") && contenido.includes("Microchip"), "la plantilla es un CSV con sus encabezados y ejemplos (con Veterinaria prendida trae los clínicos)");
  await pag.setInputFiles('[data-testid="archivo-importar"]', { name: "plantilla.csv", mimeType: "text/csv", buffer: Buffer.from(contenido, "utf8") });
  await pag.getByText(/Revisa a qué campo corresponde/).first().waitFor({ timeout: 20000 });
  const selPlantilla = await pag.locator("table select").evaluateAll((els) => els.map((e) => e.value));
  comprobar(selPlantilla.length === 17 && selPlantilla.every(Boolean) && new Set(selPlantilla).size === 17, `volver a subir la plantilla mapea sus 17 columnas solas (${selPlantilla.filter(Boolean).length})`);
  const T9 = tel();
  const csvLatin = Buffer.from(`Dueño;Teléfono;Mascota;Raza;Tamaño\r\n${MARCA} María Pérez;${T9};${MARCA} Ñoño;Pastor Alemán;Grande\r\n`, "latin1");
  await pag.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  await pag.setInputFiles('[data-testid="archivo-importar"]', { name: `${MARCA}-latin.csv`, mimeType: "text/csv", buffer: csvLatin });
  await pag.getByText(/Revisa a qué campo corresponde/).first().waitFor({ timeout: 20000 });
  const selCsv = await pag.locator("table select").evaluateAll((els) => els.map((e) => e.value));
  comprobar(selCsv.join() === "c_nombre,c_telefono,m_nombre,m_raza,m_tamano", `CSV con punto y coma: columnas con acentos reconocidas (${selCsv.join()})`);
  await pag.getByRole("button", { name: "Revisar antes de importar" }).click();
  await pag.getByText(/Se importan/).first().waitFor({ timeout: 30000 });
  comprobar((await pag.getByText(`${MARCA} María Pérez`).first().isVisible()) && (await pag.getByText(`${MARCA} Ñoño`).first().isVisible()), "…y los acentos y la eñe se leen bien (Windows-1252)");
  await pag.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  await pag.setInputFiles('[data-testid="archivo-importar"]', { name: "x.csv", mimeType: "text/csv", buffer: Buffer.from("Cosa;Otra\r\na;b\r\n") });
  await pag.getByText(/Revisa a qué campo corresponde/).first().waitFor({ timeout: 20000 });
  comprobar(await pag.getByText(/Nombre del dueño y Teléfono \(WhatsApp\) son obligatorios/).first().isVisible(), "sin columnas de nombre y teléfono avisa que son obligatorias");
  comprobar(await pag.getByRole("button", { name: "Revisar antes de importar" }).isDisabled(), "…y no deja continuar");
  await pag.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  await pag.setInputFiles('[data-testid="archivo-importar"]', { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
  comprobar(await seen(/Sube un archivo de Excel/, 15000), "un PDF se rechaza con un mensaje claro");
  await pag.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  await pag.setInputFiles('[data-testid="archivo-importar"]', { name: "vacio.csv", mimeType: "text/csv", buffer: Buffer.from("Nombre;Teléfono\r\n") });
  comprobar(await seen(/solo trae los encabezados/, 15000), "un archivo sin filas también");

  // ── B5 ──
  seccion("B5. Historial y deshacer");
  await pag.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  comprobar(await pag.getByText(archivoX.name).first().isVisible(), "la importación aparece en el historial");
  await pag.goto(`${BASE}/admin/importar/${idX}`, { waitUntil: "networkidle" });
  comprobar(await pag.getByText(/Raza imaginaria Q/).first().isVisible(), "el detalle repite las razas por corregir");
  await pag.getByRole("link", { name: /Con error \(2\)/ }).click();
  await pag.waitForURL(/ver=errores/);
  comprobar(await pag.getByText(/no tiene 10 dígitos/).first().isVisible(), "el detalle muestra por qué falló cada fila");
  await pag.getByRole("button", { name: "Revisar si se puede deshacer" }).click();
  comprobar(await seen(/Se puede deshacer/), "se revisa si se puede deshacer");
  await pag.getByRole("button", { name: "Sí, deshacer la importación" }).click();
  comprobar(await seen(/la importación se deshizo/), "se deshace");
  comprobar(!(await clientePorTel(T1)) && !(await clientePorTel(T3)), "los dueños creados ya no están activos");
  comprobar((await clientePorTel(T2))?.nombre === `${MARCA} Existente UI`, "el dueño que ya existía sigue ahí");
  comprobar((await perrosDe(dueno2.data.id)).length === 0, "…sin la mascota que se había agregado");

  // ── B6 ──
  seccion("B6. Una importación a medias se retoma");
  const cr = await rpc(P.admin, "importacion_crear", { p_nombre_archivo: `${MARCA}-medias.csv`, p_huella: huella(), p_modo: "omitir", p_con_clinicos: false, p_mapeo: {}, p_total: 4 });
  const idMedias = cr.cuerpo.id;
  await rpc(P.admin, "importacion_agregar_filas", { p_id: idMedias, p_filas: [2, 3, 4, 5].map((n) => ({ n, datos: { c_nombre: `${MARCA} Medias ${n}`, c_telefono: tel() } })) });
  await rpc(P.admin, "importacion_procesar_lote", { p_id: idMedias, p_max: 1 });
  await pag.goto(`${BASE}/admin/importar/${idMedias}`, { waitUntil: "networkidle" });
  comprobar(await seen(/Quedan 3 filas por procesar/), "el historial dice cuántas faltan");
  await pag.getByRole("button", { name: "Continuar la importación" }).click();
  await esperarHasta(async () => (await rpc(P.admin, "importacion_progreso", { p_id: idMedias })).cuerpo?.pendientes === 0, 60000, 800);
  comprobar((await rpc(P.admin, "importacion_progreso", { p_id: idMedias })).cuerpo?.pendientes === 0, "«Continuar la importación» termina lo que faltaba");

  // ── B7 ──
  seccion("B7. Autoguardado y «Recuperar borrador»");
  const borradores = async (formulario) => (await SB.from("formulario_borradores").select("datos, clave").eq("negocio_id", B).eq("usuario_id", P.adminId).eq("formulario", formulario)).data ?? [];
  await SB.from("formulario_borradores").delete().eq("negocio_id", B).eq("usuario_id", P.adminId);
  await pag.goto(`${BASE}/clientes/nuevo`, { waitUntil: "networkidle" });
  await pag.getByLabel("Nombre del dueño").fill(`${MARCA} Borrador`);
  await pag.getByLabel("Teléfono").fill("4445556677");
  comprobar(await esperarHasta(async () => (await borradores("cliente_nuevo")).length === 1, 12000, 500), "al escribir se guarda el borrador solo");
  const bd = (await borradores("cliente_nuevo"))[0];
  comprobar(bd?.datos?.nombre === `${MARCA} Borrador` && bd.datos.telefono === "4445556677" && !JSON.stringify(bd.datos).toLowerCase().includes("password"), "…con lo escrito (y nunca contraseñas)");
  await pag.goto(`${BASE}/clientes/nuevo`, { waitUntil: "networkidle" });
  comprobar(await pag.getByTestId("aviso-borrador").isVisible(), "al volver aparece «Tienes un borrador sin guardar»");
  comprobar((await pag.getByLabel("Nombre del dueño").inputValue()) === "", "…sin llenar nada solo");
  await pag.getByRole("button", { name: "Recuperar borrador" }).click();
  comprobar((await pag.getByLabel("Nombre del dueño").inputValue()) === `${MARCA} Borrador` && (await pag.getByLabel("Teléfono").inputValue()) === "4445556677", "«Recuperar borrador» regresa lo escrito");
  comprobar(!(await pag.getByTestId("aviso-borrador").isVisible().catch(() => false)), "…y el aviso se va");
  await pag.goto(`${BASE}/clientes/nuevo`, { waitUntil: "networkidle" });
  await pag.getByTestId("aviso-borrador").waitFor({ timeout: 15000 });
  await pag.getByRole("button", { name: "Descartar" }).click();
  comprobar(await esperarHasta(async () => (await borradores("cliente_nuevo")).length === 0, 10000, 500), "«Descartar» borra el borrador");
  await pag.goto(`${BASE}/clientes/nuevo`, { waitUntil: "networkidle" });
  const T10 = tel();
  await pag.getByLabel("Nombre del dueño").fill(`${MARCA} Guardado UI`);
  await pag.getByLabel("Teléfono").fill(T10);
  await esperarHasta(async () => (await borradores("cliente_nuevo")).length === 1, 12000, 500);
  await pag.getByRole("button", { name: "Crear cliente", exact: true }).click();
  await pag.waitForURL(/\/clientes\/[0-9a-f-]{36}/, { timeout: 30000 });
  const cNuevo = await clientePorTel(T10);
  comprobar(cNuevo, "guardar el cliente lo crea");
  comprobar((await borradores("cliente_nuevo")).length === 0, "…y su borrador desaparece");
  if (cNuevo) {
    await pag.goto(`${BASE}/clientes/${cNuevo.id}/perros/nuevo`, { waitUntil: "networkidle" });
    await pag.locator('input[name="nombre"]').fill(`${MARCA} Mascota Borrador`);
    comprobar(await esperarHasta(async () => (await borradores("mascota_nueva")).some((b) => b.clave === cNuevo.id), 12000, 500), "el borrador de la mascota queda ligado al dueño (clave = su id)");
    await pag.goto(`${BASE}/clientes/${cNuevo.id}/perros/nuevo`, { waitUntil: "networkidle" });
    comprobar(await pag.getByTestId("aviso-borrador").isVisible(), "…y vuelve a ofrecerse");
    await pag.getByRole("button", { name: "Recuperar borrador" }).click();
    comprobar(await esperarHasta(async () => (await pag.locator('input[name="nombre"]').inputValue()) === `${MARCA} Mascota Borrador`, 5000, 200), "…y se recupera");
    await pag.goto(`${BASE}/clientes/${dueno2.data.id}/perros/nuevo`, { waitUntil: "networkidle" });
    comprobar(!(await pag.getByTestId("aviso-borrador").isVisible().catch(() => false)), "…y no aparece en la ficha de otro dueño");
    await new Promise((r) => setTimeout(r, 3500));
    comprobar(!(await borradores("mascota_nueva")).some((b) => b.clave === dueno2.data.id), "abrir un formulario y no escribir nada NO deja un borrador (los valores de arranque no cuentan)");
  }
  await pag.goto(`${BASE}/contratos`, { waitUntil: "networkidle" });
  await pag.getByRole("button", { name: "Nuevo contrato" }).click();
  await pag.getByLabel("Nombre del contrato").fill(`${MARCA} Contrato borrador`);
  await pag.getByLabel("Cuerpo del contrato").fill("Texto largo del contrato de prueba para el borrador.");
  comprobar(await esperarHasta(async () => (await borradores("contrato_tipo_nuevo")).length === 1, 12000, 500), "el contrato nuevo también se autoguarda");
  await pag.goto(`${BASE}/contratos`, { waitUntil: "networkidle" });
  await pag.getByRole("button", { name: "Nuevo contrato" }).click();
  await pag.getByTestId("aviso-borrador").waitFor({ timeout: 15000 });
  await pag.getByRole("button", { name: "Recuperar borrador" }).click();
  comprobar((await pag.getByLabel("Nombre del contrato").inputValue()).includes("Contrato borrador") && (await pag.getByLabel("Cuerpo del contrato").inputValue()).startsWith("Texto largo"), "…y se recupera (formulario hecho con estado de React)");
  await SB.from("formulario_borradores").delete().eq("negocio_id", B).eq("usuario_id", P.adminId);
} catch (e) {
  console.log(`  ✘ la parte B se detuvo: ${e.stack ?? e}`);
  hallazgo(`la parte B se detuvo: ${e.message}`);
} finally {
  try { await nav?.close(); } catch { /* ya cerró */ }
  try { servidor.kill(); } catch { /* ya cerró */ }
  const ahora = new Date().toISOString();
  const { data: mios } = await SB.from("clientes").select("id").eq("negocio_id", B).like("nombre", `${MARCA}%`);
  const idsC = [...new Set([...(mios ?? []).map((x) => x.id), ...clientesCreados])];
  if (idsC.length) {
    await SB.from("perros").update({ deleted_at: ahora }).in("cliente_id", idsC).is("deleted_at", null);
    await SB.from("clientes").update({ deleted_at: ahora }).in("id", idsC).is("deleted_at", null);
  }
  await quitar(P.admin, P.recConId, "importar_datos").catch(() => {});
  await fijarModulo("veterinaria", vetOriginal).catch(() => {});
}
if (fileURLToPath(import.meta.url) === process.argv[1]) terminar();
