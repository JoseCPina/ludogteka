// R35 (QA externa) — SOLO DESARROLLO, Huellitas, con `npm run build && npm run start -- -p 3001`.
//
//   node scripts/auditoria/r35-dev.mjs
//
//   1. Contraseña temporal del portal: recepción la restablece desde la ficha del cliente; el dueño entra con ella y
//      SOLO puede ver la pantalla para cambiarla (el resto del portal y su API lo regresan ahí). Al escoger una nueva
//      llega a su portal, la marca se quita (y la cuenta conserva su proveedor de Auth) y la siguiente vez entra
//      directo. Una cuenta sin marca abre «Cambiar mi contraseña» de forma voluntaria.
//   2. Reserva de hotel cancelada: con un cobro de por medio, la reserva enseña Total $0.00 (la estancia, «no se
//      cobra»), lo cobrado y el saldo a favor; después de la devolución, lo devuelto y saldo $0.00. El calendario dice
//      lo mismo en la fila.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { claveAleatoria } from "../lib/clave.mjs";

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
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
const ruta = (p) => new globalThis.URL(p.url()).pathname;
const ir = (p, r) => p.goto(`${BASE}${r}`, { waitUntil: "networkidle", timeout: 120000 });

const nav = await abrirNavegador();
try {
  // ─────────────────────────────────────────────────────────────── 1
  console.log("── 1. Contraseña temporal del portal");
  const { data: antes } = await A.auth.admin.getUserById(datos.cuentaSoloB);
  const proveedorAntes = antes.user.app_metadata?.provider;
  const { data: perfil } = await A.from("profiles").select("telefono").eq("id", datos.cuentaSoloB).maybeSingle();
  const usuario = perfil?.telefono ?? antes.user.email;

  const ctxAdmin = await nav.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxAdmin.addCookies(await cookiesDe(datos.adminB));
  const pa = await ctxAdmin.newPage();
  await ir(pa, `/clientes/${datos.clienteSoloB}`);
  await pa.getByRole("button", { name: "Restablecer contraseña" }).click();
  await pa.getByRole("button", { name: "Sí, restablecer" }).click();
  const campo = pa.locator("input[readonly]").first();
  await campo.waitFor();
  const temporal = await campo.inputValue();
  comprobar(temporal.length >= 8, "recepción ve la contraseña temporal");
  comprobar(await pa.getByText("su portal le pide escoger una nueva").isVisible(), "la ficha dice que el portal le pedirá cambiarla");
  const { data: marcado } = await A.auth.admin.getUserById(datos.cuentaSoloB);
  comprobar(marcado.user.app_metadata?.debe_cambiar_password === true, "la cuenta queda marcada para cambiarla");
  comprobar(marcado.user.app_metadata?.provider === proveedorAntes, `la marca no borra el proveedor de Auth (${proveedorAntes})`);

  const ctxD = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pd = await ctxD.newPage();
  await ir(pd, "/login");
  await pd.getByLabel("Teléfono o correo").fill(usuario);
  await pd.locator('input[name="password"]').fill(temporal);
  await pd.getByRole("button", { name: "Entrar" }).click();
  await pd.waitForURL(/cambiar-contrasena/, { timeout: 60000 }).catch(() => {});
  comprobar(ruta(pd) === "/portal/cambiar-contrasena", `con la temporal llega directo a cambiarla (${ruta(pd)})`);
  comprobar(await pd.locator('[data-modo-cambio="obligatorio"]').isVisible(), "la pantalla dice que es obligatorio");
  for (const r of ["/portal", "/portal/facturas"]) {
    await ir(pd, r);
    comprobar(ruta(pd) === "/portal/cambiar-contrasena", `${r} lo regresa a cambiarla`);
  }
  // Ya con sesión (cookie del portal), un dueño marcado tampoco entra al personal ni a la API protegida.
  const api = await pd.evaluate(async () => { const r = await fetch("/api/veterinaria/adjunto/00000000-0000-0000-0000-000000000000", { redirect: "manual" }); return r.status; });
  comprobar(api !== 200, `la API protegida no responde datos (${api})`);

  await pd.locator('input[name="password"]').fill(claveAleatoria());
  await pd.locator('input[name="confirmacion"]').fill(claveAleatoria());
  await pd.getByRole("button", { name: "Guardar contraseña" }).click();
  await pd.getByText("Las contraseñas no coinciden.").first().waitFor({ timeout: 30000 }).catch(() => {});
  comprobar(await pd.getByText("Las contraseñas no coinciden.").first().isVisible(), "si no coinciden, lo dice junto al botón");

  const nueva = claveAleatoria();
  await pd.locator('input[name="password"]').fill(nueva);
  await pd.locator('input[name="confirmacion"]').fill(nueva);
  await pd.getByRole("button", { name: "Guardar contraseña" }).click();
  await pd.waitForURL(/\/portal\?contrasena=cambiada/, { timeout: 60000 }).catch(() => {});
  comprobar(ruta(pd) === "/portal", `al guardarla llega a su portal (${pd.url()})`);
  comprobar(await pd.getByText("Contraseña cambiada").isVisible(), "y ve «Contraseña cambiada»");
  const { data: despues } = await A.auth.admin.getUserById(datos.cuentaSoloB);
  comprobar(despues.user.app_metadata?.debe_cambiar_password !== true, "la marca se quitó");
  comprobar(despues.user.app_metadata?.provider === proveedorAntes, "y el proveedor de Auth sigue igual");
  const viejo = await createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: despues.user.email, password: temporal });
  comprobar(!!viejo.error, "la temporal ya no sirve");

  const ctxD2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pd2 = await ctxD2.newPage();
  await ir(pd2, "/login");
  await pd2.getByLabel("Teléfono o correo").fill(usuario);
  await pd2.locator('input[name="password"]').fill(nueva);
  await pd2.getByRole("button", { name: "Entrar" }).click();
  await pd2.waitForURL(/\/portal/, { timeout: 60000 }).catch(() => {});
  comprobar(ruta(pd2) === "/portal", `con la nueva entra directo a su portal (${ruta(pd2)})`);
  await pd2.locator("[data-enlace-cambiar-contrasena]").click();
  await pd2.waitForURL(/cambiar-contrasena/).catch(() => {});
  comprobar(await pd2.locator('[data-modo-cambio="voluntario"]').isVisible(), "sin marca, «Cambiar mi contraseña» abre la pantalla de forma voluntaria");

  // ─────────────────────────────────────────────────────────────── 2
  console.log("── 2. Reserva de hotel cancelada");
  const admin = await comoPersona(datos.adminB);
  const hoy = (await admin.rpc("fecha_negocio")).data;
  const suma = (base, dias) => new Date(new Date(`${base}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
  // Un lunes lejano (el hotel no recibe en domingo y otras auditorías dejan estancias cerca de hoy).
  let D = suma(hoy, 200 + Math.floor(Math.random() * 200));
  while (new Date(`${D}T12:00:00Z`).getUTCDay() !== 1) D = suma(D, 1);
  const { data: hotel } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").is("deleted_at", null).limit(1).single();
  const { data: talla } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: perro, error: ePerro } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ r35 ${sufijo}`, tamano_id: talla.id }).select("id").single();
  if (ePerro) throw new Error(`perro: ${ePerro.message}`);
  const rr = await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
  const reserva = rr.data.id;
  const est = await admin.from("estancias").insert({
    reserva_id: reserva, perro_id: perro.id, servicio_id: hotel.id, fecha_entrada: D, fecha_salida: suma(D, 2), estado: "reservada",
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba R35", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba R35",
  }).select("id").single();
  if (est.error) throw new Error(`estancia: ${est.error.message}`);
  const turno = (await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").maybeSingle()).data;
  if (!turno) {
    const t = await admin.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba R35" });
    if (t.error) throw new Error(`turno: ${t.error.message}`);
  }
  await admin.rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  const cobro = await admin.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: "anticipo R35", p_metodos: [{ metodo: "efectivo", monto: 100, propina: 0 }] });
  if (cobro.error) throw new Error(`cobro: ${cobro.error.message}`);
  const cobroId = (await SB.from("cobros").select("id").eq("reserva_id", reserva).single()).data.id;

  await ir(pa, `/reservas/${reserva}`);
  comprobar((await pa.locator("[data-total-cobrado]").textContent())?.includes("100.00"), "antes de cancelar ya se ve lo cobrado ($100)");
  await pa.getByRole("button", { name: "Cancelar", exact: true }).click();
  await pa.getByRole("button", { name: "Sí, cancelar" }).click();
  await pa.locator("[data-total-estancia-cancelada]").waitFor({ timeout: 30000 }).catch(() => {});
  comprobar(await pa.locator("[data-total-estancia-cancelada]").isVisible(), "la estancia cancelada dice Total $0.00 (no se cobra)");
  await pa.waitForFunction(() => document.querySelector("[data-total-cuenta]")?.textContent?.includes("$0.00"), null, { timeout: 30000 }).catch(() => {});
  const totalCuenta = await pa.locator("[data-total-cuenta]").textContent();
  comprobar(totalCuenta?.trim() === "$0.00", `el total de la reserva es $0.00 (${totalCuenta})`);
  comprobar(await pa.getByText("Total (cancelada):").isVisible(), "y se rotula como cancelada");
  comprobar(await pa.getByText("a favor del cliente").isVisible(), "lo cobrado queda como saldo a favor");

  const dev = await admin.rpc("registrar_devolucion", { p_cobro_id: cobroId, p_motivo: "reserva cancelada R35", p_metodos: [{ metodo: "efectivo", monto: 100 }] });
  if (dev.error) throw new Error(`devolución: ${dev.error.message}`);
  await ir(pa, `/reservas/${reserva}`);
  comprobar((await pa.locator("[data-total-devuelto]").textContent())?.includes("100.00"), "después de la devolución se ve lo devuelto ($100)");
  comprobar((await pa.locator("[data-total-cobrado]").textContent())?.includes("100.00"), "y sigue lo cobrado ($100)");
  comprobar(await pa.getByText("Saldo: $0.00").isVisible(), "con saldo $0.00");

  for (const ancho of [390, 1280]) {
    await pa.setViewportSize({ width: ancho, height: 900 });
    await ir(pa, `/reservas/calendario?dia=${D}`);
    const fila = pa.getByText(`ZZ r35 ${sufijo}`).first();
    comprobar(await fila.isVisible(), `a ${ancho} px la reserva sale en el día del calendario`);
    const texto = await pa.locator("body").innerText();
    comprobar(/cobrado \$100\.00 · devuelto \$100\.00/.test(texto), `a ${ancho} px la fila dice lo cobrado y lo devuelto`);
    const desborda = await pa.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    comprobar(!desborda, `a ${ancho} px no hay desplazamiento horizontal`);
  }
} finally {
  await nav.close();
}

console.log(hallazgos.length ? `\n${hallazgos.length} hallazgo(s).` : "\nTodo bien.");
process.exit(hallazgos.length ? 1 : 0);
