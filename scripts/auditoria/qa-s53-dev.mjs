// QA S53 en PANTALLA — SOLO DESARROLLO, en Huellitas, con la app compilada en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/qa-s53-dev.mjs
//
// 1. N157 · receta desde una consulta: se emite desde el BORRADOR (botón del editor) y la consulta enseña «Ver receta
//    N.º n» con su lista; se firma la consulta y el encabezado dice «Ver receta N.º n» + «Emitir otra receta» (nunca
//    «Emitir receta» a secas); se emite otra desde la FIRMADA y salen las dos; las dos están en la línea de tiempo del
//    expediente.
// 2. N158 · «Cita agendada»: al agendar, el formulario se colapsa (solo el aviso con «Agregar otro perrito de …» y
//    «Listo, ir a la agenda»); «Agregar otro perrito» lo vuelve a abrir limpio (sin perro elegido).
// 3. «No se presentó» en una cita futura: el botón sale deshabilitado con «Disponible a partir de las HH:MM» (la hora
//    de la cita en la zona del negocio); con la hora ya pasada, se habilita y dice «No se presentó». El servidor
//    también lo rechaza antes de la hora.
// 4. «Crear reserva» con todo guardado: la pantalla va al detalle de la reserva (/reservas/<id>?creada=1) con el aviso
//    «Reserva creada», no a un formulario en blanco.
// N155 y N156 en todo el panel: `permisos-pantalla-dev.mjs --perfil prueba-vencida` (abre también ?reprogramar=1) y
// `permisos-pantalla-dev.mjs --roles medico` (etiqueta, aviso y menú del médico con Estética apagada).
//
// Lo que crea (cliente, perros, consulta, recetas, cita, reserva) queda marcado con el sufijo y se da de baja al terminar.
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, datos, B, SB, comprobar, seccion, terminar, rpc, hallazgo, bien } from "./veterinaria-comun-dev.mjs";
import { preparar, limpiar, darFolios } from "./recetas-comun-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const sufijo = `S53-${Date.now().toString(36).slice(-5)}`;
async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const cuerpo = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const pad = (x) => String(x).padStart(2, "0");

const E = await preparar("s53");
const { P } = E;
const nav = await abrirNavegador();
const creados = { clientes: [], perros: [], citas: [], reservas: [], estancias: [] };
const nuevoCtx = async (profileId) => {
  const c = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies(await cookiesDe(profileId));
  const p = await c.newPage();
  p.setDefaultTimeout(60_000);
  p.on("dialog", (d) => d.accept());
  return { c, p };
};

async function emitirRecetaEnEditor(p) {
  await p.getByLabel("Del inventario clínico (opcional)").selectOption({ label: `Meloxicam ${E.MARCA}` });
  await p.locator('input[name="dosis-0"]').fill("1 tableta");
  await p.locator('input[name="dn-0"]').fill("1");
  await p.locator('input[name="frec-0"]').fill("Cada 12 horas");
  await p.locator('input[name="fh-0"]').fill("12");
  await p.locator('input[name="dur-0"]').fill("5");
  await p.getByRole("button", { name: "Emitir receta" }).click();
  await p.waitForURL(/\/veterinaria\/recetas\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  return new globalThis.URL(p.url()).pathname.split("/").pop();
}

try {
  // ── 1. N157 ─────────────────────────────────────────────────────────────────────────────────────────────────
  seccion("1. N157 · receta desde el borrador y desde la firmada; «Ver receta» en la consulta y en la línea de tiempo");
  const perro = await E.nuevoPerro("Sfe");
  const desde = 1000000 + Math.floor(Math.random() * 800000000);
  await darFolios(E, E.medA, desde, desde + 49);
  const cons = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: E.medA });
  const cid = cons.cuerpo?.id ?? cons.cuerpo;
  comprobar(Boolean(cid), `se abre una consulta borrador (${cons.mensaje ?? "ok"})`);
  await rpc(P.recCon, "vet_consulta_guardar", { p_id: cid, p_datos: { motivo: "Otitis S53", anamnesis: "x", examen_fisico: "x", diagnosticos: [{ origen: "libre", nombre: "Otitis", tipo: "definitivo" }], plan: "Tratar", tratamiento: "Meloxicam 1 tableta cada 12 horas 5 días" } });
  const mvz = await nuevoCtx(P.recConId);
  await mvz.p.goto(`${BASE}/veterinaria/consulta/${cid}`, { waitUntil: "networkidle" });
  comprobar((await mvz.p.locator("[data-ver-receta]").count()) === 0, "la consulta borrador sin receta no enseña «Ver receta»");
  await mvz.p.locator("[data-emitir-receta]").first().click();
  await mvz.p.waitForURL(/\/veterinaria\/recetas\/nueva\?/, { timeout: 60_000 });
  comprobar(new globalThis.URL(mvz.p.url()).searchParams.get("consulta") === cid, "«Emitir receta» del borrador abre la receta ligada a ESA consulta");
  await mvz.p.waitForLoadState("networkidle").catch(() => {});
  const receta1 = await emitirRecetaEnEditor(mvz.p);
  const { data: r1 } = await SB.from("vet_recetas").select("numero, consulta_id").eq("id", receta1).single();
  comprobar(r1?.consulta_id === cid, `la receta N.º ${r1?.numero} quedó ligada a la consulta en la base`);
  await mvz.p.goto(`${BASE}/veterinaria/consulta/${cid}`, { waitUntil: "networkidle" });
  const ver1 = await mvz.p.locator("[data-ver-receta]").allInnerTexts();
  comprobar(ver1.some((t) => t.includes(`N.º ${r1?.numero}`)), `la consulta (borrador) enseña «Ver receta N.º ${r1?.numero}» (${ver1.join(" | ") || "nada"})`);
  comprobar((await mvz.p.locator("[data-lista-recetas-consulta] li").count()) === 1, "y la lista de sus recetas con una fila");
  // Firmar (lo que no tiene precio se marca sin cobro, como en veterinaria-fase4-ui-dev).
  const propuesta = (await rpc(P.recCon, "vet_consulta_cargos", { p_consulta: cid })).cuerpo;
  for (const l of propuesta?.lineas ?? []) if (l.precio_unitario == null) await rpc(P.recCon, "vet_consulta_cargo_quitar", { p_id: l.id, p_motivo: "Sin cobro: prueba S53" });
  const firmada = await rpc(P.recCon, "vet_consulta_firmar", { p_id: cid });
  comprobar(firmada.ok, `la consulta se firma (${firmada.mensaje ?? "ok"})`);
  await mvz.p.goto(`${BASE}/veterinaria/consulta/${cid}`, { waitUntil: "networkidle" });
  const botones = await mvz.p.locator("[data-ver-receta], [data-emitir-receta]").allInnerTexts();
  comprobar(botones.some((t) => /^Ver receta N\.º \d+$/.test(t.trim())) && botones.some((t) => /Emitir otra receta/.test(t)) && !botones.some((t) => t.trim() === "Emitir receta"), `firmada con receta: «Ver receta» + «Emitir otra receta», sin «Emitir receta» a secas (${botones.join(" | ")})`);
  await mvz.p.locator("[data-emitir-receta]").first().click();
  await mvz.p.waitForURL(/\/veterinaria\/recetas\/nueva\?/, { timeout: 60_000 });
  await mvz.p.waitForLoadState("networkidle").catch(() => {});
  const receta2 = await emitirRecetaEnEditor(mvz.p);
  const { data: r2 } = await SB.from("vet_recetas").select("numero, consulta_id").eq("id", receta2).single();
  comprobar(r2?.consulta_id === cid, `la segunda receta (N.º ${r2?.numero}, desde la firmada) también quedó ligada`);
  await mvz.p.goto(`${BASE}/veterinaria/consulta/${cid}`, { waitUntil: "networkidle" });
  const ver2 = await mvz.p.locator("[data-ver-receta]").allInnerTexts();
  comprobar(ver2.length === 2, `la consulta enseña las dos: ${ver2.join(" | ")}`);
  await mvz.p.goto(`${BASE}/veterinaria/expediente/${perro}`, { waitUntil: "networkidle" });
  const exp = await cuerpo(mvz.p);
  comprobar(exp.includes(`Receta N.º ${r1?.numero}`) && exp.includes(`Receta N.º ${r2?.numero}`), "las dos recetas están en la línea de tiempo del expediente");
  await mvz.c.close();

  // ── 2 y 3. Cita de estética: N158 y «No se presentó» ───────────────────────────────────────────────────────────
  seccion("2. N158 · «Cita agendada» colapsa el formulario; «Agregar otro perrito» lo reabre limpio");
  const { data: talla } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: pelo } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
  const { data: razaP } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
  const nombreCliente = `ZZ S53 ${sufijo}`;
  const { data: cliente } = await SB.from("clientes").insert({ nombre: nombreCliente, telefono: `55${String(Date.now()).slice(-8)}` }).select("id").single();
  creados.clientes.push(cliente.id);
  const { data: perroA } = await SB.from("perros").insert({ negocio_id: B, cliente_id: cliente.id, nombre: `ZZ Uno ${sufijo}`, raza: "Poodle", raza_id: razaP.id, tamano_id: talla.id, pelaje_id: pelo.id }).select("id, nombre").single();
  const { data: perroB } = await SB.from("perros").insert({ negocio_id: B, cliente_id: cliente.id, nombre: `ZZ Dos ${sufijo}`, raza: "Poodle", raza_id: razaP.id, tamano_id: talla.id, pelaje_id: pelo.id }).select("id, nombre").single();
  creados.perros.push(perroA.id, perroB.id);
  const adm = await nuevoCtx(datos.adminB);
  await adm.p.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
  await adm.p.locator("input:visible").first().fill(nombreCliente);
  await adm.p.waitForTimeout(800);
  await adm.p.getByText(nombreCliente).first().click();
  await adm.p.waitForTimeout(600);
  await adm.p.getByLabel("Perro").selectOption({ label: perroA.nombre });
  const opciones = await adm.p.getByLabel("Servicio").locator("option").allInnerTexts();
  await adm.p.getByLabel("Servicio").selectOption({ label: opciones.find((o) => /completo/i.test(o)) ?? opciones[1] });
  await adm.p.getByLabel("Empleado").selectOption({ index: 1 });
  const f = new Date(Date.now() + (60 + Math.floor(Math.random() * 300)) * 86400000);
  await adm.p.getByLabel("Fecha y hora").fill(`${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}T10:00`);
  await adm.p.getByRole("button", { name: "Agendar cita" }).click();
  let cita = null;
  for (let i = 0; i < 40 && !cita; i++) {
    cita = (await SB.from("citas_estetica").select("id, reserva_id, inicio").eq("perro_id", perroA.id).is("deleted_at", null).maybeSingle()).data;
    if (!cita) await adm.p.waitForTimeout(500);
  }
  if (!cita) hallazgo(`la cita no se agendó: ${(await cuerpo(adm.p)).slice(0, 500)}`);
  else {
    creados.citas.push(cita.id); creados.reservas.push(cita.reserva_id);
    await adm.p.waitForTimeout(1000);
    comprobar(await adm.p.locator("[data-citas-agendadas]").isVisible(), "sale el recuadro «Cita agendada»");
    comprobar((await adm.p.getByLabel("Perro").count()) === 0 && (await adm.p.getByLabel("Fecha y hora").count()) === 0, "el formulario se colapsó (sin selector de perro ni fecha a la vista)");
    comprobar((await adm.p.locator("[data-ir-agenda]").count()) === 1 && (await adm.p.locator("[data-agregar-otro-perrito]").count()) === 1, "quedan «Agregar otro perrito de …» y «Listo, ir a la agenda»");
    await adm.p.locator("[data-agregar-otro-perrito]").click();
    await adm.p.waitForTimeout(500);
    comprobar((await adm.p.getByLabel("Perro").count()) === 1 && (await adm.p.getByLabel("Perro").inputValue()) === "", "«Agregar otro perrito» reabre el formulario limpio (sin perro elegido)");

    seccion("3. «No se presentó» solo desde la hora de la cita");
    await adm.p.goto(`${BASE}/estetica/${cita.id}`, { waitUntil: "networkidle" });
    const boton = adm.p.locator("[data-no-se-presento]");
    const textoFuturo = (await boton.innerText().catch(() => "")).trim();
    comprobar((await boton.isDisabled().catch(() => false)) && /^Disponible a partir de las \d{2}:\d{2}$/.test(textoFuturo), `cita futura: el botón está deshabilitado y dice «${textoFuturo}»`);
    comprobar(/10:00$/.test(textoFuturo), "la hora que dice es la de la cita (10:00)");
    // (La regla de la hora la aplican la pantalla y la acción del servidor `cancelarCita`, no la base.)
    const pasada = new Date(Date.now() - 2 * 3600_000).toISOString();
    await SB.from("citas_estetica").update({ inicio: pasada, fin: new Date(Date.now() - 3600_000).toISOString() }).eq("id", cita.id);
    await adm.p.goto(`${BASE}/estetica/${cita.id}`, { waitUntil: "networkidle" });
    const textoPasado = (await adm.p.locator("[data-no-se-presento]").innerText().catch(() => "")).trim();
    comprobar(!(await adm.p.locator("[data-no-se-presento]").isDisabled().catch(() => true)) && textoPasado === "No se presentó", `con la hora pasada, el botón se habilita y dice «${textoPasado}»`);
  }

  // ── 4. Crear reserva → detalle ─────────────────────────────────────────────────────────────────────────────────
  seccion("4. «Crear reserva» con todo guardado va al detalle de la reserva");
  const hoy = (await rpc(P.recCon, "fecha_negocio")).cuerpo;
  const suma = (base, d) => new Date(new Date(`${base}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
  let D = suma(hoy, 400 + Math.floor(Math.random() * 100));
  while (new Date(`${D}T12:00:00Z`).getUTCDay() !== 3) D = suma(D, 1); // miércoles: guardería abre
  // Requisitos en regla: evaluación de comportamiento y todos los requisitos sanitarios del negocio aplicados.
  const ev = await rpc(P.recCon, "marcar_evaluacion_comportamiento", { p_perro_id: perroB.id, p_fecha: hoy, p_notas: "prueba S53" });
  if (!ev.ok) console.log(`  · evaluación: ${ev.mensaje}`);
  const { data: tipos } = await SB.from("tipos_requisito_sanitario").select("id").eq("negocio_id", B).is("deleted_at", null);
  for (const t of tipos ?? []) await SB.from("requisitos_sanitarios_aplicados").insert({ negocio_id: B, perro_id: perroB.id, tipo_requisito_id: t.id, fecha_aplicacion: suma(hoy, -3), detalle: "Prueba S53" });
  await adm.p.goto(`${BASE}/guarderia/nueva`, { waitUntil: "networkidle" });
  await adm.p.locator("input[type=text], input[type=search], input:not([type])").first().fill(nombreCliente);
  await adm.p.getByText(nombreCliente).first().click();
  await adm.p.getByLabel(perroB.nombre).check();
  await adm.p.getByLabel("Fecha").fill(D);
  await adm.p.waitForTimeout(1500);
  await adm.p.getByRole("button", { name: /Crear reserva/ }).click();
  await adm.p.waitForURL(/\/reservas\/[0-9a-f-]{36}\?creada=1$/, { timeout: 60_000 }).catch(() => {});
  const donde = new globalThis.URL(adm.p.url()).pathname + new globalThis.URL(adm.p.url()).search;
  const okReserva = /^\/reservas\/[0-9a-f-]{36}\?creada=1$/.test(donde);
  comprobar(okReserva, `al guardar va al detalle de la reserva (${donde})${okReserva ? "" : ` — pantalla: ${(await cuerpo(adm.p)).slice(0, 400)}`}`);
  if (okReserva) {
    comprobar((await adm.p.locator("[data-reserva-creada]").count()) === 1, "con el aviso «Reserva creada»");
    const rid = donde.split("/")[2].split("?")[0];
    creados.reservas.push(rid);
    const { data: est } = await SB.from("estancias").select("id").eq("reserva_id", rid);
    creados.estancias.push(...(est ?? []).map((x) => x.id));
  }
  await adm.c.close();
} finally {
  await nav.close().catch(() => {});
  const ahora = new Date().toISOString();
  for (const id of creados.estancias) await SB.from("estancias").update({ deleted_at: ahora }).eq("id", id);
  for (const id of creados.citas) await SB.from("citas_estetica").update({ deleted_at: ahora }).eq("id", id);
  for (const id of creados.reservas) await SB.from("reservas").update({ deleted_at: ahora }).eq("id", id);
  for (const id of creados.perros) await SB.from("perros").update({ deleted_at: ahora }).eq("id", id);
  for (const id of creados.clientes) await SB.from("clientes").update({ deleted_at: ahora }).eq("id", id);
  await limpiar(E).catch(() => {});
}
void bien;
terminar();
