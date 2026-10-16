// QA externa del 16 de octubre de 2026, EN PANTALLA (SOLO DESARROLLO, Huellitas, con `next start` en el 3001).
//
//   node scripts/auditoria/qa-n-ui-dev.mjs
//
// N2/N4. Requisitos sanitarios del expediente: el registro aparece en la tabla al momento (y el aviso de «guardado»
//   no sale antes), el mismo tipo y fecha avisa y no se duplica, y «Corregir» / «Anular con motivo» dejan el
//   registro tachado en el historial.
// N3. Reservar guardería: al marcar la mascota sale lo que le falta (vacunas) con su enlace y, para quien tiene la
//   excepción, la casilla con motivo; «Crear reserva» queda apagado hasta resolverlo.
// N5. Caja → Turno: la columna Hora enseña la hora del negocio («09:14 a.m.»), en celular y escritorio.
import { createClient } from "@supabase/supabase-js";
import { B, SB, A, URL, env, datos, personas, fijarModulo, hoy, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const REF = new globalThis.URL(URL).hostname.split(".")[0];
const sufijo = String(Date.now()).slice(-6);
const P = await personas();
const BASE = "http://huellitas.localhost:3001";

async function cookiesDe(profileId, host) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: host, path: "/" }));
}
const nav = await abrirNavegador();
const abrir = async (profileId, ancho = 1100) => {
  const c = await nav.newContext({ viewport: { width: ancho, height: 900 } });
  await c.addCookies(await cookiesDe(profileId, "huellitas.localhost"));
  const p = await c.newPage();
  p.setDefaultTimeout(45000);
  p.on("dialog", (d) => d.accept());
  return { c, p };
};
const texto = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const esperarTexto = async (p, re, ms = 25000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (re.test(await texto(p))) return true;
    await p.waitForTimeout(400);
  }
  return false;
};
const limpieza = [];
try {
  await fijarModulo("veterinaria", true);
  const hoyB = await hoy(P.admin);
  const nombrePerro = `Vacuno${sufijo}`;
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: nombrePerro, especie: "perro", evaluacion_comportamiento_fecha: hoyB }).select("id").single()).data.id;
  limpieza.push(() => SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", perro));
  const tipos = (await SB.from("tipos_requisito_sanitario").select("id, etiqueta").eq("negocio_id", B).is("deleted_at", null).order("orden")).data;

  // ── N2 / N4 ─────────────────────────────────────────────────────
  seccion("N2/N4. Requisitos sanitarios en el expediente");
  let { c, p } = await abrir(datos.adminB);
  await p.goto(`${BASE}/perros/${perro}`, { waitUntil: "domcontentloaded" });
  await esperarTexto(p, /Registrar aplicación/);
  comprobar(/Todavía no hay aplicaciones registradas/.test(await texto(p)), "al inicio la tabla está vacía");
  await p.getByRole("button", { name: "Registrar aplicación" }).click();
  comprobar(await esperarTexto(p, /Registro guardado/), "sale «Registro guardado»");
  comprobar((await p.locator("tr[data-requisito-id]").count()) === 1, "y la tabla YA trae el registro nuevo (sin recargar)");
  comprobar(!/Todavía no hay aplicaciones registradas/.test(await texto(p)), "sin el «Todavía no hay…»");
  await p.getByRole("button", { name: /Registrar aplicación|Actualizando/ }).click();
  comprobar(await esperarTexto(p, /Ya hay un registro de ese requisito con esa fecha/), "el mismo tipo y fecha avisa y no se duplica");
  comprobar((await p.locator("tr[data-requisito-id]").count()) === 1, "sigue habiendo un solo registro");
  comprobar((await p.getByRole("button", { name: "Corregir" }).count()) === 1 && (await p.getByRole("button", { name: "Anular con motivo" }).count()) === 1, "cada registro trae «Corregir» y «Anular con motivo»");
  await p.getByRole("button", { name: "Corregir" }).click();
  await p.getByLabel("Veterinario / producto").fill("Dra. Prueba");
  await p.getByLabel("Motivo de la corrección").fill("Faltaba el veterinario");
  await p.getByRole("button", { name: "Guardar corrección" }).click();
  comprobar(await esperarTexto(p, /Corregido una vez/) && /Dra\. Prueba/.test(await texto(p)), "«Corregir» cambia el detalle y marca «Corregido una vez»");
  await p.getByRole("button", { name: "Anular con motivo" }).click();
  await p.getByLabel("Motivo de la anulación").fill("Capturado por error");
  await p.getByRole("button", { name: "Anular registro" }).click();
  comprobar(await esperarTexto(p, /Anulado: Capturado por error/), "«Anular con motivo» deja el registro tachado con su motivo");
  comprobar((await p.locator('tr[data-anulado="si"]').count()) === 1, "y no se borra de la tabla");
  const cuerpo = await SB.from("requisitos_sanitarios_aplicados").select("deleted_at, anulado_motivo").eq("perro_id", perro);
  comprobar(cuerpo.data?.length === 1 && cuerpo.data[0].deleted_at && cuerpo.data[0].anulado_motivo === "Capturado por error", "en la base queda con deleted_at y motivo");
  await c.close();

  // ── N3 ──────────────────────────────────────────────────────────
  seccion("N3. Reservar guardería: lo que falta sale al marcar la mascota");
  ({ c, p } = await abrir(datos.adminB));
  await p.goto(`${BASE}/guarderia/nueva?cliente=${datos.clienteSoloB}`, { waitUntil: "domcontentloaded" });
  await p.getByLabel(nombrePerro).check();
  const avisoSan = await p.locator("[data-sanitarios-pendientes]").first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  comprobar(avisoSan, "al marcar la mascota sale el aviso de vacunas pendientes");
  const aviso = await p.locator("[data-sanitarios-pendientes]").first().innerText().catch(() => "");
  comprobar(/le falta/i.test(aviso) && /Registrar las vacunas/.test(aviso), "dice qué falta y enlaza al expediente");
  comprobar((await p.locator('[data-sanitarios-pendientes] a[href*="/perros/"]').count()) === 1, "con el enlace al expediente");
  const crear = p.getByRole("button", { name: "Crear reserva" });
  comprobar(await crear.isDisabled(), "«Crear reserva» está apagado mientras falte algo");
  comprobar(/Reservar sin las vacunas/.test(aviso), "el admin ve la casilla de excepción ahí mismo");
  await p.getByLabel(/Reservar sin las vacunas/).check();
  comprobar(await crear.isDisabled(), "con la casilla pero sin motivo sigue apagado");
  await p.getByLabel("Motivo de la excepción").first().fill("Autoriza admin");
  comprobar(!(await crear.isDisabled()), "con la excepción y su motivo se enciende");
  await c.close();
  ({ c, p } = await abrir(P.recSinId));
  await p.goto(`${BASE}/guarderia/nueva?cliente=${datos.clienteSoloB}`, { waitUntil: "domcontentloaded" });
  await p.getByLabel(nombrePerro).check();
  await p.locator("[data-sanitarios-pendientes]").first().waitFor({ timeout: 20000 }).catch(() => undefined);
  comprobar((await p.getByLabel(/Reservar sin las vacunas/).count()) === 0, "quien no tiene el permiso de excepciones NO ve la casilla");
  comprobar(await p.getByRole("button", { name: "Crear reserva" }).isDisabled(), "y no puede crear la reserva");
  await c.close();

  // ── N5 ──────────────────────────────────────────────────────────
  seccion("N5. Caja → Turno: la columna Hora enseña la hora");
  // Un movimiento a la mano: si hay turno abierto (con la sesión real del admin) se registra un retiro de $1.
  const adminJ = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${P.admin}`, "x-negocio-id": B } } });
  const turnoAbierto = (await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").limit(1)).data?.length;
  if (turnoAbierto) await adminJ.rpc("registrar_retiro", { p_monto: 1, p_motivo: `Hora ${sufijo}` });
  for (const ancho of [390, 1280]) {
    ({ c, p } = await abrir(datos.adminB, ancho));
    await p.goto(`${BASE}/caja/turno`, { waitUntil: "domcontentloaded" });
    await esperarTexto(p, /Movimientos de este turno|Abrir turno/);
    const horas = await p.locator("[data-hora-movimiento]").allInnerTexts();
    if (horas.length === 0) console.log(`  · (${ancho} px) el turno no tiene movimientos: se omite`);
    else comprobar(horas.every((h) => /^\d{2}:\d{2} [ap]\.m\.$/.test(h.trim())), `(${ancho} px) la hora sale como «09:14 a.m.» (${horas[0]})`);
    await c.close();
  }
} finally {
  for (const f of limpieza) { try { await f(); } catch { /* nada */ } }
  await nav.close();
}
terminar();
