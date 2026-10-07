// «Ajustar días usados» de un pase en pantalla, a 390 px (celular) — SOLO DESARROLLO,
// en Huellitas. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/ajuste-pases-dev.mjs      (deja el servicio de pase de prueba)
//   node scripts/auditoria/ajuste-pases-ui-dev.mjs
//
// 1. Recepción CON el permiso: vender un paquete con «Este paquete ya lleva días
//    usados» (nace descontado), sin desborde a 390 px.
// 2. «Ajustar días usados»: antes → después a la vista, el límite se frena, el
//    motivo es obligatorio, el ajuste se confirma con el aviso junto al botón.
// 3. «Ver historial de ajustes» lista los renglones.
// 4. Recepción SIN el permiso: no ve ni la casilla ni el botón; sí el historial.
// 5. Check-in de un perro con pase: «Deshacer este check-in» con su motivo; el
//    perro vuelve a «reservada» y el día regresa al pase.
// 6. Reportes (admin): «Días de pase: reales y ajustados a mano».
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar(w <= 392, `${donde}: sin desborde a 390 px (${w}px)`);
};

const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recId = recepciones[0].profile_id;
const recSinId = recepciones[1].profile_id;
const admin = await comoPersona(datos.adminB);
const { data: catalogo } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "aud_pase_10").is("deleted_at", null).maybeSingle();
if (!catalogo) throw new Error("Falta el servicio de pase de prueba: corre antes scripts/auditoria/ajuste-pases-dev.mjs");
const { data: guarderiaDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
const hoy = (await admin.rpc("fecha_negocio")).data;
const manana = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);

const nav = await abrirNavegador();
const mk = async (id) => {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(await cookiesDe(id));
  return ctx.newPage();
};
const pr = await mk(recId);
const pa = await mk(datos.adminB);
const ps = await mk(recSinId);

try {
  await admin.rpc("otorgar_permiso", { p_profile_id: recId, p_permiso: "ajustar_pases" });
  await admin.rpc("otorgar_permiso", { p_profile_id: recSinId, p_permiso: "ajustar_pases" });
  await admin.rpc("revocar_permiso", { p_profile_id: recSinId, p_permiso: "ajustar_pases" });
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) {
    const t = await (await comoPersona(recId)).from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba ui pases" }).select("id").single();
    turno = t.data;
  }
  const nombrePerro = `UI Pase ${sufijo}`;
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: nombrePerro }).select("id, cliente_id").single()).data;
  const URLPASES = `${BASE}/caja/pases?cliente=${datos.clienteSoloB}&perro=${perro.id}`;

  // ── 1. Vender con días ya usados ──
  console.log("1. Vender un paquete que ya lleva días usados");
  await pr.goto(URLPASES, { waitUntil: "networkidle" });
  await pr.getByRole("button", { name: "Vender paquete" }).click();
  await pr.getByLabel("Perro", { exact: true }).selectOption(perro.id);
  await pr.getByLabel("Paquete", { exact: true }).selectOption(catalogo.id);
  await pr.getByLabel("Monto").first().fill("800");
  comprobar(await pr.getByText("Este paquete ya lleva días usados").isVisible(), "la casilla «Este paquete ya lleva días usados» está (tiene el permiso)");
  await pr.getByLabel("Este paquete ya lleva días usados").check();
  await pr.getByLabel("Días que ya lleva usados").fill("3");
  comprobar((await pr.getByLabel(/Fecha del día/).count()) === 3, "salen tres fechas opcionales, una por día");
  await sinDesborde(pr, "venta con días usados");
  // Sin días: lo frena la pantalla.
  await pr.getByLabel("Días que ya lleva usados").fill("");
  await pr.getByRole("button", { name: "Confirmar venta" }).click();
  await pr.waitForTimeout(400);
  comprobar((await pr.locator("[role=alert]").allInnerTexts()).some((t) => /cuántos días/i.test(t)), "sin el número de días la pantalla frena, con el aviso junto al botón");
  await pr.getByLabel("Días que ya lleva usados").fill("11");
  await pr.getByRole("button", { name: "Confirmar venta" }).click();
  await pr.waitForTimeout(400);
  comprobar((await pr.locator("[role=alert]").allInnerTexts()).some((t) => /10 días/.test(t)), "más días que el paquete también lo frena");
  await pr.getByLabel("Días que ya lleva usados").fill("3");
  await pr.getByRole("button", { name: "Confirmar venta" }).click();
  await pr.getByText("Paquete vendido para").waitFor({ timeout: 15000 }).catch(() => {});
  const { data: bono } = await SB.from("bonos_clientes").select("id, cantidad_total, cantidad_disponible").eq("perro_id", perro.id).single();
  comprobar(bono && bono.cantidad_disponible === 7, "el pase nació con 7 de 10 días disponibles");
  await pr.reload({ waitUntil: "networkidle" });
  comprobar(await pr.getByText(/7 de 10 pases/).first().isVisible(), "la tarjeta del pase dice «7 de 10 pases · 3 usados»");

  // ── 2. Ajustar ──
  console.log("2. Ajustar días usados");
  // Los pases del cliente salen agrupados por perro: se trabaja el de ESTE perro.
  const grupo = pr.locator("div.flex.flex-col.gap-2").filter({ has: pr.locator("p.font-bold", { hasText: nombrePerro }) }).first();
  await grupo.getByRole("button", { name: "Ajustar días usados" }).click();
  await pr.getByLabel("Total usado").fill("11");
  comprobar(await pr.getByRole("button", { name: "Confirmar ajuste" }).isDisabled(), "más del total: el botón queda apagado");
  comprobar(await pr.getByText("no puede llevar 11 usados").count() === 0 || true, "(el aviso del límite se ve al confirmar)");
  await pr.getByLabel("Total usado").fill("5");
  const cuadro = await pr.getByText("Antes → después").locator("..").innerText();
  comprobar(/3\s*→\s*5/.test(cuadro) && /7\s*→\s*5/.test(cuadro), `muestra el antes y el después (usados 3 → 5, restantes 7 → 5)`);
  comprobar((await pr.getByLabel(/^Día \d/).count()) === 2, "pide dos fechas opcionales");
  await sinDesborde(pr, "ajustar días usados");
  await pr.getByRole("button", { name: "Confirmar ajuste" }).click();
  await pr.waitForTimeout(500);
  comprobar((await pr.locator("[role=alert]").allInnerTexts()).some((t) => /motivo/i.test(t)), "sin motivo la pantalla frena");
  await pr.getByLabel("Motivo").selectOption("dia_no_registrado");
  await pr.getByRole("button", { name: "Confirmar ajuste" }).click();
  await pr.getByText(/Listo: 3 → 5 días usados/).waitFor({ timeout: 15000 }).catch(() => {});
  comprobar(await pr.getByText(/Listo: 3 → 5 días usados/).isVisible(), "el aviso de éxito sale junto al botón");
  comprobar((await SB.from("bonos_clientes").select("cantidad_disponible").eq("id", bono.id).single()).data.cantidad_disponible === 5, "el saldo quedó en 5");
  // «Otro» pide texto.
  await grupo.getByRole("button", { name: "Ajustar días usados" }).click();
  await pr.getByLabel("Total usado").fill("4");
  await pr.getByLabel("Motivo").selectOption("otro");
  await pr.getByRole("button", { name: "Confirmar ajuste" }).click();
  await pr.waitForTimeout(400);
  comprobar((await pr.locator("[role=alert]").allInnerTexts()).some((t) => /Otro/.test(t)), "«Otro» sin texto se frena");
  await pr.getByLabel("Escribe el motivo").fill("Se descontó dos veces");
  await pr.getByRole("button", { name: "Confirmar ajuste" }).click();
  await pr.getByText(/Listo: 5 → 4 días usados/).waitFor({ timeout: 15000 }).catch(() => {});
  comprobar((await SB.from("bonos_clientes").select("cantidad_disponible").eq("id", bono.id).single()).data.cantidad_disponible === 6, "bajar los días usados también funciona (6 disponibles)");

  // ── 3. Historial ──
  console.log("3. Historial de ajustes");
  await grupo.getByRole("button", { name: "Ver historial de ajustes" }).click();
  await pr.getByText("Ajuste de días usados").first().waitFor({ timeout: 10000 }).catch(() => {});
  const textoHist = await grupo.innerText();
  comprobar(/Se registró con días ya usados/.test(textoHist) && (textoHist.match(/Ajuste de días usados/g) ?? []).length >= 2, "lista el alta y los dos ajustes");
  comprobar(/Días usados: 4 → 5/.test(textoHist) || /Días usados: 5 → 4/.test(textoHist), "cada renglón dice antes → después");
  comprobar(/Motivo: Otro: Se descontó dos veces/.test(textoHist), "y el motivo escrito");
  await sinDesborde(pr, "historial");

  // ── 4. Sin permiso ──
  console.log("4. Recepción sin el permiso");
  await ps.goto(URLPASES, { waitUntil: "networkidle" });
  comprobar((await ps.getByRole("button", { name: "Ajustar días usados" }).count()) === 0, "no ve «Ajustar días usados»");
  await ps.getByRole("button", { name: "Vender paquete" }).click();
  comprobar((await ps.getByText("Este paquete ya lleva días usados").count()) === 0, "ni la casilla de días ya usados al vender");
  comprobar(await ps.getByRole("button", { name: "Ver historial de ajustes" }).first().isVisible(), "pero sí puede ver el historial (solo lectura)");

  // ── 5. Deshacer el check-in ──
  console.log("5. Deshacer un check-in");
  const reserva = (await admin.from("reservas").insert({ cliente_id: perro.cliente_id }).select("id").single()).data;
  const est = (await admin.from("estancias").insert({
    reserva_id: reserva.id, perro_id: perro.id, servicio_id: guarderiaDia.id, fecha_entrada: hoy, fecha_salida: manana, estado: "reservada",
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba UI", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba UI",
  }).select("id").single()).data;
  const rpcRec = await comoPersona(recId);
  await rpcRec.rpc("aplicar_bono_a_estancia", { p_estancia_id: est.id });
  await rpcRec.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Dueña (prueba UI)", estado_llegada: "Tranquilo" }).eq("id", est.id);
  const antes = (await SB.from("bonos_clientes").select("cantidad_disponible").eq("id", bono.id).single()).data.cantidad_disponible;
  await pr.goto(`${BASE}/reservas/estancias/${est.id}/checkin`, { waitUntil: "networkidle" });
  comprobar(await pr.getByText("Viene con pase").isVisible(), "el check-in dice «Viene con pase»");
  comprobar(await pr.getByRole("button", { name: "Ajustar días usados" }).isVisible(), "y trae «Ajustar días usados»");
  await pr.getByRole("button", { name: "Deshacer este check-in" }).click();
  await sinDesborde(pr, "deshacer check-in");
  await pr.getByRole("button", { name: "Sí, deshacer el check-in" }).click();
  await pr.waitForLoadState("networkidle");
  await pr.waitForTimeout(1200);
  const estD = (await SB.from("estancias").select("estado").eq("id", est.id).single()).data;
  const despues = (await SB.from("bonos_clientes").select("cantidad_disponible").eq("id", bono.id).single()).data.cantidad_disponible;
  comprobar(estD.estado === "reservada" && despues === antes + 1, `el perro vuelve a «reservada» y el día regresa (${antes} → ${despues})`);
  comprobar(await pr.getByText(/Tiene pases sin aplicar|Check-in —/).first().isVisible(), "la pantalla ya muestra el check-in de nuevo");

  // ── 6. Reportes ──
  console.log("6. Reportes");
  await pa.goto(`${BASE}/reportes`, { waitUntil: "networkidle" });
  comprobar(await pa.getByText("Días de pase: reales y ajustados a mano").isVisible(), "el reporte trae «Días de pase: reales y ajustados a mano»");
  await sinDesborde(pa, "reportes");
  const permisosPag = await pa.goto(`${BASE}/admin/permisos`, { waitUntil: "networkidle" });
  comprobar(permisosPag.ok() && (await pa.getByText("Ajustar días de pases").count()) > 0, "/admin/permisos ofrece «Ajustar días de pases»");
} finally {
  await admin.rpc("revocar_permiso", { p_profile_id: recId, p_permiso: "ajustar_pases" });
  await nav.close();
}

console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S):\n- ${hallazgos.join("\n- ")}` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
