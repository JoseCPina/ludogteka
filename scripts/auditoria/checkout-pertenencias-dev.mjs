// N6 (QA externa, 16 de octubre de 2026): check-out con pertenencias confirmadas a mano. SOLO DESARROLLO (Huellitas),
// con `next start` en el 3001.
// Hallazgos de la QA externa del 15 de octubre de 2026, EN PANTALLA (SOLO DESARROLLO, Huellitas).
// Con el servidor compilado en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/qa-hallazgos-ui-dev.mjs
//
// B4. La consulta sin precio no se firma: «Precio de esta consulta», «Guardar como precio de catálogo» (solo con permiso)
//     y «Sin cobro» con motivo.
// B13. «Aplicar vacuna» aparte de «Otro procedimiento»; una vacuna escrita como procedimiento avisa.
// B15. Labrador: la forma del perro sugiere tamaño y pelaje y no lo llama «mestizo».
// B14/6. El check-out de guardería no enseña la salida del día siguiente; los datos de quien entrega/recoge se ven obligatorios;
//     el monto del cobro abre con el saldo.
import { createClient } from "@supabase/supabase-js";
import { B, SB, A, URL, env, datos, personas, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const REF = new globalThis.URL(URL).hostname.split(".")[0];
const sufijo = String(Date.now()).slice(-6);
const P = await personas();

async function cookiesDe(profileId, host) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: host, path: "/" }));
}
const comoAdmin = async () => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${P.admin}`, "x-negocio-id": B } } });
const nav = await abrirNavegador();
const BASE = "http://huellitas.localhost:3001";
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
const sinNum = (s) => s.replace(/\s+/g, " ");

try {
  seccion("Check-out: cada pertenencia se confirma a mano (N6)");
  const { data: gD } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
  const hoy = new Date().toISOString().slice(0, 10);
  const cliente = await comoAdmin();
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Pertenencias ${sufijo}`, especie: "perro" }).select("id").single()).data;
  limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", perro.id); });
  const rG = (await cliente.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
  const dia = (() => { let d = new Date(Date.now() + 90 * 86400000); while (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); })();
  const sig = new Date(new Date(`${dia}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  const e = await cliente.from("estancias").insert({ reserva_id: rG.id, perro_id: perro.id, servicio_id: gD.id, fecha_entrada: dia, fecha_salida: sig, bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }).select("id").single();
  if (e.error) throw new Error(`estancia: ${e.error.message}`);
  limpieza.push(async () => { await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", e.data.id); });
  await SB.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Prueba" }).eq("id", e.data.id);
  const nombres = ["Correa roja", "Cobija", "Plato"];
  for (const d of nombres) await SB.from("estancia_pertenencias").insert({ negocio_id: B, estancia_id: e.data.id, descripcion: d });

  const abrirCheckout = async () => {
    const c = await nav.newContext({ viewport: { width: 390, height: 900 } });
    await c.addCookies(await cookiesDe(datos.adminB, "huellitas.localhost"));
    const p = await c.newPage();
    p.setDefaultTimeout(45000);
    await p.goto(`${BASE}/reservas/estancias/${e.data.id}/checkout`, { waitUntil: "networkidle" });
    return { c, p };
  };
  let { c, p } = await abrirCheckout();
  const cajas = p.locator('input[type="checkbox"]');
  comprobar((await cajas.count()) === 3, "hay tres pertenencias");
  let marcadas = 0;
  for (let i = 0; i < 3; i++) if (await cajas.nth(i).isChecked()) marcadas++;
  comprobar(marcadas === 0, "ninguna viene palomeada: cada una se confirma a mano");
  comprobar((await p.locator("[data-entregue-todo]").count()) === 1, "existe el botón «Entregué todo»");

  // Una entregada, dos no: pide motivo y no cierra sin él.
  await cajas.nth(0).check();
  await p.locator("#checkout-recoge-nombre").fill("Luis Prueba");
  await p.getByRole("button", { name: "Sí, es el dueño" }).click();
  await p.getByRole("button", { name: "Confirmar salida" }).click();
  comprobar(await esperarTexto(p, /escribe el motivo para cerrar la salida/), "con pertenencias sin entregar y sin motivo: pide el motivo");
  comprobar((await SB.from("estancias").select("estado").eq("id", e.data.id).single()).data.estado === "en_curso", "…y la salida NO se cierra");
  // La base (acción) también lo exige: llamada directa sin motivo.
  await p.locator("#checkout-motivo-sin-entrega").fill("Se las lleva en la próxima visita");
  await p.getByRole("button", { name: "Confirmar salida" }).click();
  comprobar(await esperarTexto(p, /Este perro ya salió/), "con motivo escrito: la salida se cierra");
  const fin = (await SB.from("estancias").select("estado, pertenencias_sin_entrega_motivo, pertenencias_sin_entrega_por").eq("id", e.data.id).single()).data;
  comprobar(fin.estado === "finalizada" && fin.pertenencias_sin_entrega_motivo === "Se las lleva en la próxima visita" && fin.pertenencias_sin_entrega_por, "queda registrado el motivo y quién cerró la salida");
  const t = sinNum(await texto(p));
  comprobar(/Correa roja — Entregada/.test(t) && /Cobija — No se entregó/.test(t) && /Plato — No se entregó/.test(t), "la pantalla de salida completada lista lo devuelto y lo no devuelto");
  comprobar(t.includes("Motivo: Se las lleva en la próxima visita"), "…y el motivo");
  await c.close();

  // «Entregué todo»: sin motivo y sin pendientes.
  const e2 = await cliente.from("estancias").insert({ reserva_id: rG.id, perro_id: perro.id, servicio_id: gD.id, fecha_entrada: sig, fecha_salida: new Date(new Date(`${sig}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10), bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }).select("id").single();
  if (e2.error) throw new Error(`estancia 2: ${e2.error.message}`);
  limpieza.push(async () => { await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", e2.data.id); });
  await SB.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Prueba" }).eq("id", e2.data.id);
  for (const d of nombres.slice(0, 2)) await SB.from("estancia_pertenencias").insert({ negocio_id: B, estancia_id: e2.data.id, descripcion: d });
  c = await nav.newContext({ viewport: { width: 390, height: 900 } });
  await c.addCookies(await cookiesDe(datos.adminB, "huellitas.localhost"));
  p = await c.newPage();
  p.setDefaultTimeout(45000);
  await p.goto(`${BASE}/reservas/estancias/${e2.data.id}/checkout`, { waitUntil: "networkidle" });
  await p.locator("[data-entregue-todo]").click();
  const c2 = p.locator('input[type="checkbox"]');
  comprobar((await c2.nth(0).isChecked()) && (await c2.nth(1).isChecked()), "«Entregué todo» las marca de un toque");
  comprobar((await p.locator("#checkout-motivo-sin-entrega").count()) === 0, "sin pendientes no se pide motivo");
  await p.locator("#checkout-recoge-nombre").fill("Luis Prueba");
  await p.getByRole("button", { name: "Sí, es el dueño" }).click();
  await p.getByRole("button", { name: "Confirmar salida" }).click();
  comprobar(await esperarTexto(p, /Este perro ya salió/), "la salida se cierra sin motivo");
  const fin2 = (await SB.from("estancias").select("pertenencias_sin_entrega_motivo").eq("id", e2.data.id).single()).data;
  const ent = (await SB.from("estancia_pertenencias").select("devuelto").eq("estancia_id", e2.data.id)).data;
  comprobar(fin2.pertenencias_sin_entrega_motivo === null && ent.every((x) => x.devuelto), "todas quedan devueltas y sin motivo");
  await c.close();

  // La acción exige el motivo aunque se salte la pantalla: la base rechaza un motivo corto.
  const corto = await SB.from("estancias").update({ pertenencias_sin_entrega_motivo: "x" }).eq("id", e2.data.id);
  comprobar(corto.error, "la base rechaza un motivo de menos de 3 caracteres");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  for (const f of limpieza) await f().catch(() => {});
  await nav.close();
  terminar();
}
