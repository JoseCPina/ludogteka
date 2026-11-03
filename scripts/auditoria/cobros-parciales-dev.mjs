// Cobros parciales de punta a punta (SOLO DESARROLLO, Huellitas; ux/cobros-parciales). docs/caja-y-cuentas.md
//
// Con la app compilada y prendida (npm run build && npm run start -- -p 3001):
//
//   node scripts/auditoria/cobros-parciales-dev.mjs [--capturas <carpeta>]
//
// Una estancia de hotel de 5 noches de un dueño con cuenta (C1), con turno de caja abierto:
//   1. Caja (1440 px, admin): el atajo «Una noche» propone el precio de una noche; la pantalla avisa «Es un abono…» y,
//      al registrarlo en efectivo, dice «Abono registrado… Resta $X»; la base tiene ese cobro y ese saldo.
//   2. Segundo abono repartido: efectivo + transferencia en el mismo cobro → otro abono, con su saldo.
//   3. La salida (check-out) enseña Total / Pagado / Por pagar con el saldo de la base; Recepción lo da por la misma
//      fuente (saldos_de_reservas), y si la salida es hoy, la fila dice «Debe $X».
//   4. App (390 px) «Por pagar» y portal del dueño: el mismo saldo, lo pagado y los dos abonos.
//   5. Link de pago desde la app: cobra el SALDO (no el total); se paga (simulación) y la cuenta queda en cero.
//   6. Devolución de un abono: la cuenta vuelve a deber ese monto y la app lo dice («Te devolvieron»).
//   7. Cuadre al centavo: caja (los cobros del turno), cuenta (cuenta_totales_reserva), Recepción (saldos_de_reservas) y
//      app (mis_abonos / mis_pagos_pendientes).
// Lo que crea se borra al terminar (devolución, cobros, orden, estancia, reserva y perro).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = Number(process.env.PUERTO_APP ?? 3001);
const BASE = `http://huellitas.localhost:${PUERTO}`;
const BASE_APP = `http://app.localhost:${PUERTO}`;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const ic = process.argv.indexOf("--capturas");
const CAPTURAS = ic > 0 ? process.argv[ic + 1] : null;
if (CAPTURAS) fs.mkdirSync(CAPTURAS, { recursive: true });

const hallazgos = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const comprobar = (c, t) => (c ? bien(t) : mal(t));
const seccion = (t) => console.log(`\n── ${t}`);
const centavos = (x) => Math.round(Number(x) * 100);
const suma = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);

const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const H = datos.B;
const S = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const enNegocio = (token) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": H } } });
const hoy = (await S.rpc("fecha_negocio")).data;
const adm = enNegocio(await tokenDe(datos.adminB));
const turno = (await S.from("turnos_caja").select("id").eq("estado", "abierto").is("deleted_at", null).maybeSingle()).data;
if (!turno) throw new Error("Huellitas necesita un turno de caja abierto.");

// Un dueño con cuenta y pocas mascotas.
const { data: miembros } = await S.from("membresias").select("profile_id, cliente_id").eq("negocio_id", H).eq("rol", "cliente").is("deleted_at", null).not("cliente_id", "is", null).order("created_at").limit(40);
let C1 = null;
for (const m of miembros ?? []) {
  const { count } = await S.from("perros").select("id", { count: "exact", head: true }).eq("cliente_id", m.cliente_id).is("deleted_at", null);
  if ((count ?? 0) <= 5) { C1 = m; break; }
}
if (!C1) throw new Error("Huellitas necesita un cliente con cuenta.");
const c1 = enNegocio(await tokenDe(C1.profile_id));
await A.from("duenos").upsert([{ id: C1.profile_id, updated_at: new Date().toISOString() }], { onConflict: "id", ignoreDuplicates: true });

async function cookies(profileId, dominio, nombres) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  return nombres.flatMap((n) => (trozos.length === 1 ? [[n, valor]] : trozos.map((t, k) => [`${n}.${k}`, t]))).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}
const totales = async (reserva) => { const { data } = await adm.rpc("cuenta_totales_reserva", { p_reserva_id: reserva }); return Array.isArray(data) ? data[0] : data; };

const creados = { perro: null, reserva: null, estancia: null, orden: null, devolucion: null, conexion: false, plan: null };
// Mercado Pago SIMULADO para el link (como conciliacion-origen-dev): solo si Huellitas no tiene integración propia, y se
// quita al terminar. Con la conexión simulada, abrir /api/mercadopago/simulacion/<orden> equivale a pagar el link.
const previoCobro = (await A.from("integraciones_cobro").select("id, proveedor, elegida, estado").eq("negocio_id", H)).data ?? [];
async function conectarSimulado() {
  if (previoCobro.some((f) => f.estado === "conectada")) return false;
  creados.conexion = true; // la restauración del finally corre aunque esto truene a medias
  await A.from("integraciones_cobro").update({ elegida: false }).eq("negocio_id", H);
  await S.rpc("integracion_guardar_secreto", { p_proveedor: "mercadopago", p_secreto: JSON.stringify({ accessToken: "APP_USR-sim-cp", refreshToken: "TG-sim-cp", userId: "SIM-CP", expiraAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), liveMode: false, simulada: true }) });
  const { error } = await A.from("integraciones_cobro").update({ elegida: true, estado: "conectada", modo: "oauth", cuenta_id: "SIM-CP", cuenta_nombre: "HUELLITAS_SIMULADA", conectada_at: new Date().toISOString(), token_expira_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }).eq("negocio_id", H).eq("proveedor", "mercadopago");
  if (error) throw new Error(`conexión simulada: ${error.message}`);
  return true;
}
const nav = await abrirNavegador();
try {
  // ── Escenario: estancia de hotel de 5 noches que sale hoy (o, si la base no deja fechas pasadas, que sale en 5 días) ──
  const { data: talla } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: pelo } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
  const { data: raza } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
  const sufijo = `CP-${Date.now().toString(36).slice(-5)}`;
  const { data: perro, error: eP } = await S.from("perros").insert({ negocio_id: H, cliente_id: C1.cliente_id, nombre: `Toby ${sufijo}`, raza: "Poodle", raza_id: raza?.id, tamano_id: talla?.id, pelaje_id: pelo?.id }).select("id").single();
  if (eP) throw new Error(`perro: ${eP.message}`);
  creados.perro = perro.id;
  await adm.rpc("marcar_evaluacion_comportamiento", { p_perro_id: perro.id, p_fecha: hoy, p_notas: "prueba cobros parciales" });
  const { data: tipos } = await S.from("tipos_requisito_sanitario").select("id").eq("negocio_id", H).is("deleted_at", null);
  for (const t of tipos ?? []) {
    const r = await S.from("requisitos_sanitarios_aplicados").insert({ negocio_id: H, perro_id: perro.id, tipo_requisito_id: t.id, fecha_aplicacion: suma(hoy, -10), detalle: "Prueba cobros parciales" });
    if (r.error) console.log(`    · requisito ${t.id.slice(0, 8)}: ${r.error.message.slice(0, 100)}`);
  }
  const { data: hotel } = await S.from("servicios").select("id, nombre").eq("negocio_id", H).eq("categoria", "hotel").eq("unidad", "noche").is("deleted_at", null).limit(1).single();
  // Con la sesión del admin (como en el panel): con la llave de servicio la RLS no aplica y la validación de requisitos
  // ve los tipos de TODOS los negocios.
  const { data: reserva, error: eR } = await adm.from("reservas").insert({ negocio_id: H, cliente_id: C1.cliente_id }).select("id").single();
  if (eR) throw new Error(`reserva: ${eR.message}`);
  creados.reserva = reserva.id;
  let salidaHoy = true;
  let est = await adm.from("estancias").insert({ negocio_id: H, reserva_id: reserva.id, perro_id: perro.id, servicio_id: hotel.id, fecha_entrada: suma(hoy, -5), fecha_salida: hoy }).select("id, precio_unitario").single();
  if (est.error) {
    salidaHoy = false;
    console.log(`    · con fechas pasadas no se pudo (${est.error.message.slice(0, 80)}); la salida queda en 5 días`);
    est = await adm.from("estancias").insert({ negocio_id: H, reserva_id: reserva.id, perro_id: perro.id, servicio_id: hotel.id, fecha_entrada: hoy, fecha_salida: suma(hoy, 5) }).select("id, precio_unitario").single();
  }
  if (est.error) throw new Error(`estancia: ${est.error.message}`);
  creados.estancia = est.data.id;
  // Dentro (en curso), para que salga en «Se van hoy»; el check-in fuera de horario lo pide confirmar en pantalla.
  if (salidaHoy) { const u = await S.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Dueño (prueba)", checkin_fuera_horario: true }).eq("id", est.data.id); if (u.error) { salidaHoy = false; console.log(`    · no quedó en curso (${u.error.message.slice(0, 80)}): se omite la fila de «Se van hoy»`); } }
  const noche = Number(est.data.precio_unitario);
  const t0 = await totales(reserva.id);
  console.log(`Huellitas · ${hotel.nombre} 5 noches × $${noche} = $${t0?.total_cuenta} · salida ${salidaHoy ? "hoy" : "en 5 días"}`);
  if (!(noche > 0) || centavos(t0?.total_cuenta) !== centavos(noche * 5)) throw new Error("la estancia no quedó con su precio (¿tarifa de hotel en Huellitas?)");

  // ── 1. Caja: atajo «Una noche» y abono en efectivo ──────────────────────────────────────────────────────────────
  seccion("1. Abono de una noche en efectivo (Caja, 1440 px)");
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(await cookies(datos.adminB, "huellitas.localhost", [`sb-${REF}-auth-token`]));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => mal(`error de JavaScript en ${p.url()}: ${e.message.slice(0, 140)}`));
  await p.goto(`${BASE}/caja/cobrar/${reserva.id}`, { waitUntil: "networkidle" });
  comprobar((await p.locator("[data-atajos-monto] [data-atajo]").count()) >= 3, "la pantalla de cobro ofrece atajos (lo que falta, la mitad, una noche)");
  await p.locator('[data-atajo="unidad"]').click();
  const propuesto = Number(await p.locator('[data-monto-metodo="0"]').inputValue());
  comprobar(centavos(propuesto) === centavos(noche), `«Una noche» propone $${propuesto} (precio de la noche $${noche})`);
  const resta = await p.locator("[data-resta-tras-cobro]").getAttribute("data-resta-tras-cobro").catch(() => null);
  comprobar(centavos(resta) === centavos(noche * 4), `avisa «Es un abono: después quedan $${resta}»`);
  if (CAPTURAS) await p.screenshot({ path: path.join(CAPTURAS, "cobro-parcial-1440.jpg"), type: "jpeg", quality: 85, fullPage: true });
  await p.locator("[data-registrar-cobro]").click();
  await p.getByText("Abono registrado").first().waitFor({ timeout: 30_000 }).catch(() => null);
  const exito1 = await p.getByText("Abono registrado").first().innerText().catch(() => "");
  comprobar(/Resta \$/.test(exito1), `dice «${exito1.trim()}»`);
  const t1 = await totales(reserva.id);
  comprobar(centavos(t1?.saldo) === centavos(noche * 4), `en la base: saldo $${t1?.saldo} (4 noches)`);

  // ── 2. Segundo abono: efectivo + transferencia ────────────────────────────────────────────────────────────────
  seccion("2. Abono repartido: efectivo + transferencia");
  const ef = Math.round(noche * 0.6 * 100) / 100, tr = Math.round(noche * 0.4 * 100) / 100;
  await p.locator('[data-monto-metodo="0"]').fill(String(ef));
  await p.getByRole("button", { name: "+ Repartir en otro método" }).click();
  await p.locator('[data-metodo-cobro="1"]').selectOption("transferencia");
  await p.locator('[data-monto-metodo="1"]').fill(String(tr));
  await p.locator("[data-registrar-cobro]").click();
  await p.waitForFunction((s) => /Resta \$/.test(document.body.innerText) && document.body.innerText.includes(s), (noche * 3).toLocaleString("es-MX", { minimumFractionDigits: 2 }), { timeout: 30_000 }).catch(() => null);
  const t2 = await totales(reserva.id);
  comprobar(centavos(t2?.saldo) === centavos(noche * 3), `en la base: saldo $${t2?.saldo} (3 noches) tras el abono repartido`);
  const { data: cobros } = await S.from("cobros").select("id, turno_id, cobro_metodos(metodo, monto)").eq("reserva_id", reserva.id).is("anulado_at", null).order("created_at");
  comprobar((cobros ?? []).length === 2 && (cobros ?? [])[1].cobro_metodos.length === 2 && (cobros ?? []).every((c) => c.turno_id === turno.id), "dos cobros en el turno abierto; el segundo con efectivo y transferencia");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/caja/cobrar/${reserva.id}`, { waitUntil: "networkidle" });
  await p.locator('[data-atajo="mitad"]').click().catch(() => {});
  if (CAPTURAS) await p.screenshot({ path: path.join(CAPTURAS, "cobro-parcial-390.jpg"), type: "jpeg", quality: 85, fullPage: true });
  await p.setViewportSize({ width: 1440, height: 900 });

  // ── 3. Salida y Recepción ──────────────────────────────────────────────────────────────────────────────────────
  seccion("3. Salida y Recepción");
  await p.goto(`${BASE}/reservas/estancias/${est.data.id}/checkout`, { waitUntil: "networkidle" });
  const enSalida = await p.locator("[data-cuenta-salida]").getAttribute("data-saldo").catch(() => null);
  comprobar(centavos(enSalida) === centavos(t2?.saldo), `la salida enseña «Por pagar» $${enSalida} (base $${t2?.saldo})`);
  if (CAPTURAS) await p.screenshot({ path: path.join(CAPTURAS, "salida-con-saldo-1440.jpg"), type: "jpeg", quality: 85, fullPage: true });
  const { data: saldosRec } = await adm.rpc("saldos_de_reservas", { p_reservas: [reserva.id] });
  comprobar(centavos(saldosRec?.[reserva.id]) === centavos(t2?.saldo), `Recepción (saldos_de_reservas) da $${saldosRec?.[reserva.id]}`);
  if (salidaHoy) {
    await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
    const debe = await p.locator("[data-debe]").evaluateAll((els) => els.map((e) => e.getAttribute("data-debe")));
    comprobar(debe.some((d) => centavos(d) === centavos(t2?.saldo)), `en «Se van hoy» la fila dice «Debe $${t2?.saldo}»`);
  }
  const { data: cliAnon } = await c1.rpc("saldos_de_reservas", { p_reservas: [reserva.id] });
  comprobar(!cliAnon || Object.keys(cliAnon).length === 0, "el dueño no lee saldos_de_reservas (solo personal)");

  // ── 4. App y portal del dueño ──────────────────────────────────────────────────────────────────────────────────
  seccion("4. App (390 px) y portal");
  const ctxApp = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctxApp.addCookies(await cookies(C1.profile_id, "app.localhost", [`sb-${REF}-portal-auth-token`]));
  const pa = await ctxApp.newPage();
  pa.on("pageerror", (e) => mal(`error de JavaScript en la app: ${e.message.slice(0, 140)}`));
  await pa.goto(`${BASE_APP}/pagos`, { waitUntil: "networkidle" });
  const tarjetaApp = pa.locator(`[data-pago="${reserva.id}"]`);
  const saldoApp = (await tarjetaApp.locator("[data-saldo]").innerText().catch(() => "")).replace(/[^0-9.]/g, "");
  comprobar(centavos(saldoApp) === centavos(t2?.saldo) && (await tarjetaApp.locator("[data-abono]").count()) === 2, `«Por pagar» de la app: $${saldoApp} y 2 abonos`);
  if (CAPTURAS) await pa.screenshot({ path: path.join(CAPTURAS, "app-por-pagar-390.jpg"), type: "jpeg", quality: 85, fullPage: true });
  const ctxPortal = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctxPortal.addCookies(await cookies(C1.profile_id, "huellitas.localhost", [`sb-${REF}-portal-auth-token`]));
  const pp = await ctxPortal.newPage();
  await pp.goto(`${BASE}/portal`, { waitUntil: "networkidle" });
  const saldoPortal = (await pp.locator(`[data-pago-portal="${reserva.id}"] [data-saldo]`).innerText().catch(() => "")).replace(/[^0-9.]/g, "");
  comprobar(centavos(saldoPortal) === centavos(t2?.saldo), `el portal dice «Te falta» $${saldoPortal}`);
  const { data: ab } = await c1.rpc("mis_abonos", { p_reserva: reserva.id });
  comprobar(centavos(ab?.pagado) === centavos(t2?.total_cobrado - t2?.total_devuelto) && centavos(ab?.saldo) === centavos(t2?.saldo), `mis_abonos: pagado $${ab?.pagado}, saldo $${ab?.saldo} (= cuenta)`);

  // ── 5. Link de pago del saldo, pagado ──────────────────────────────────────────────────────────────────────────
  seccion("5. Link de pago por el saldo");
  if (!(await conectarSimulado())) console.log("    · Huellitas ya tiene una integración de cobro: no se toca (sin link simulado)");
  const [popup] = await Promise.all([pa.waitForEvent("popup", { timeout: 20_000 }).catch(() => null), tarjetaApp.locator("[data-pagar]").click()]);
  await pa.waitForTimeout(2500);
  if (popup) await popup.close().catch(() => {});
  const { data: orden } = await S.from("mp_ordenes").select("id, monto, simulado, estado").eq("reserva_id", reserva.id).eq("tipo", "link").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (orden) creados.orden = orden.id;
  comprobar(orden && centavos(orden.monto) === centavos(t2?.saldo), `el link cobra el saldo $${orden?.monto} (no el total $${t2?.total_cuenta})`);
  if (orden?.simulado) {
    // Un pago simulado solo se da por pagado con plan demo o prueba (negocio_puede_simular): Huellitas en prueba solo
    // durante este paso; el finally la deja como estaba.
    const { data: planAntes } = await A.from("negocios").select("plan, prueba_termina_at").eq("id", H).single();
    if (!["demo", "prueba"].includes(planAntes.plan)) {
      creados.plan = planAntes;
      await A.from("negocios").update({ plan: "prueba", prueba_termina_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }).eq("id", H);
    }
    const r = await fetch(`${BASE}/api/mercadopago/simulacion/${orden.id}`);
    comprobar(r.ok, `pagarlo (simulación) responde ${r.status}${r.ok ? "" : `: ${(await r.text()).replace(/<[^>]+>/g, " ").replace(/s+/g, " ").slice(0, 200)}`}`);
    const t3 = await totales(reserva.id);
    comprobar(centavos(t3?.saldo) === 0, `la cuenta queda en $${t3?.saldo}`);
  } else bien("Huellitas no cobra en simulación: el pago del link no se puede hacer aquí (se comprobó el monto)");

  // ── 6. Devolución de un abono ─────────────────────────────────────────────────────────────────────────────────
  seccion("6. Devolución de un abono");
  const primero = (cobros ?? [])[0];
  const dev = await adm.rpc("registrar_devolucion", { p_cobro_id: primero.id, p_motivo: "prueba de cobros parciales", p_metodos: [{ metodo: "efectivo", monto: noche }] });
  if (!dev.error) creados.devolucion = typeof dev.data === "string" ? dev.data : dev.data?.id ?? null;
  const t4 = await totales(reserva.id);
  comprobar(!dev.error && centavos(t4?.total_devuelto) === centavos(noche), `devolver el primer abono ($${noche}): devuelto $${t4?.total_devuelto} (${dev.error?.message ?? "ok"})`);
  await pa.goto(`${BASE_APP}/pagos`, { waitUntil: "networkidle" });
  const deApp = (await pa.locator(`[data-pago="${reserva.id}"] [data-saldo]`).innerText().catch(() => "")).replace(/[^0-9.]/g, "");
  comprobar(centavos(deApp) === centavos(t4?.saldo) && (await pa.locator(`[data-pago="${reserva.id}"] [data-devolucion]`).count()) === 1, `la app vuelve a decir $${deApp} y «Te devolvieron»`);

  // ── 7. Cuadre al centavo ──────────────────────────────────────────────────────────────────────────────────────
  seccion("7. Cuadre");
  const { data: todos } = await S.from("cobros").select("id, turno_id, cobro_metodos(monto)").eq("reserva_id", reserva.id).is("anulado_at", null);
  const enCaja = (todos ?? []).reduce((s, c) => s + c.cobro_metodos.reduce((x, m) => x + Number(m.monto), 0), 0);
  const { data: devs } = await S.from("devoluciones").select("id, devolucion_metodos(monto)").in("cobro_id", (todos ?? []).map((c) => c.id)).is("deleted_at", null);
  const devuelto = (devs ?? []).reduce((s, d) => s + d.devolucion_metodos.reduce((x, m) => x + Number(m.monto), 0), 0);
  const { data: ab2 } = await c1.rpc("mis_abonos", { p_reserva: reserva.id });
  const { data: rec2 } = await adm.rpc("saldos_de_reservas", { p_reservas: [reserva.id] });
  const pendientesApp = ((await c1.rpc("mis_pagos_pendientes")).data ?? []).find((x) => x.reserva_id === reserva.id);
  const cuadra = centavos(enCaja) === centavos(t4.total_cobrado) && centavos(devuelto) === centavos(t4.total_devuelto) && centavos(ab2?.pagado) === centavos(enCaja - devuelto) && centavos(rec2?.[reserva.id]) === centavos(t4.saldo) && centavos(pendientesApp?.saldo ?? 0) === centavos(t4.saldo) && centavos(t4.total_cuenta) === centavos(enCaja - devuelto + Number(t4.saldo));
  comprobar(cuadra, `caja $${enCaja} − devuelto $${devuelto} = pagado app $${ab2?.pagado}; saldo cuenta $${t4.saldo} = Recepción $${rec2?.[reserva.id]} = app $${pendientesApp?.saldo ?? 0}; total $${t4.total_cuenta}`);
} finally {
  await nav.close().catch(() => {});
  if (creados.reserva) {
    const { data: cs } = await S.from("cobros").select("id").eq("reserva_id", creados.reserva);
    const ids = (cs ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: ds } = await S.from("devoluciones").select("id").in("cobro_id", ids);
      for (const d of ds ?? []) { await S.from("devolucion_metodos").delete().eq("devolucion_id", d.id); await S.from("devoluciones").delete().eq("id", d.id); }
      await S.from("tarjetas_manuales").delete().in("cobro_id", ids);
      await S.from("cobro_metodos").delete().in("cobro_id", ids);
      await S.from("cobros").delete().in("id", ids);
    }
    await S.from("mp_ordenes").delete().eq("reserva_id", creados.reserva);
    await S.from("estancias").delete().eq("reserva_id", creados.reserva);
    await S.from("reservas").delete().eq("id", creados.reserva);
  }
  if (creados.plan) await A.from("negocios").update({ plan: creados.plan.plan, prueba_termina_at: creados.plan.prueba_termina_at }).eq("id", H);
  if (creados.conexion) {
    await S.rpc("integracion_borrar_secreto", { p_proveedor: "mercadopago" });
    // Como estaba: la de Mercado Pago sin elegir y desconectada, y cada fila con su «elegida» de antes (primero se
    // desmarca todo: solo una puede estar elegida).
    const r1 = await A.from("integraciones_cobro").update({ elegida: false, estado: "desconectada" }).eq("negocio_id", H).eq("proveedor", "mercadopago");
    if (r1.error) console.log(`    · restaurar Mercado Pago: ${r1.error.message}`);
    for (const f of previoCobro.filter((x) => x.elegida)) {
      const r2 = await A.from("integraciones_cobro").update({ elegida: true }).eq("negocio_id", H).eq("proveedor", f.proveedor);
      if (r2.error) console.log(`    · restaurar ${f.proveedor}: ${r2.error.message}`);
    }
  }
  if (creados.perro) {
    await S.from("requisitos_sanitarios_aplicados").delete().eq("perro_id", creados.perro);
    await S.from("perros_evaluaciones").delete().eq("perro_id", creados.perro);
    await S.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", creados.perro);
  }
}
console.log(hallazgos.length ? `\n✘ Cobros parciales: ${hallazgos.length} hallazgo(s).` : "\n✔ Cobros parciales: todo en orden (caja, cuenta, Recepción y app cuadran al centavo).");
process.exit(hallazgos.length ? 1 : 0);
