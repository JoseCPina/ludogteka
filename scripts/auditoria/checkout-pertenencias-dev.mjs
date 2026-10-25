// N6 (QA externa, 16 de octubre de 2026): check-out con pertenencias confirmadas a mano. QA S15 (19 de octubre):
// check-in con «Quién entrega» de la lista u «Otra persona» con nombre, y cancelar una reserva con motivo opcional. SOLO DESARROLLO (Huellitas),
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
import { confirmarSiFueraDeHorario } from "../lib/fuera-horario.mjs";

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
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Pertenencias ${sufijo}`, especie: "perro" }).select("id, nombre").single()).data;
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
  await confirmarSiFueraDeHorario(p);
  comprobar(await esperarTexto(p, /Este perro ya salió/), "con motivo escrito: la salida se cierra");
  const fin = (await SB.from("estancias").select("estado, pertenencias_sin_entrega_motivo, pertenencias_sin_entrega_por").eq("id", e.data.id).single()).data;
  comprobar(fin.estado === "finalizada" && fin.pertenencias_sin_entrega_motivo === "Se las lleva en la próxima visita" && fin.pertenencias_sin_entrega_por, "queda registrado el motivo y quién cerró la salida");
  const t = sinNum(await texto(p));
  comprobar(/Correa roja — Entregada/.test(t) && /Cobija — No se entregó/.test(t) && /Plato — No se entregó/.test(t), "la pantalla de salida completada lista lo devuelto y lo no devuelto");
  comprobar(t.includes("Motivo: Se las lleva en la próxima visita"), "…y el motivo");
  await c.close();

  // «Entregué todo»: sin motivo y sin pendientes.
  const e2 = await cliente.from("estancias").insert({ reserva_id: rG.id, perro_id: perro.id, servicio_id: gD.id, fecha_entrada: sig, fecha_salida: new Date(new Date(`${sig}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10), dia_cerrado_confirmado: "confirmado", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }).select("id").single();
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
  await confirmarSiFueraDeHorario(p);
  comprobar(await esperarTexto(p, /Este perro ya salió/), "la salida se cierra sin motivo");
  const fin2 = (await SB.from("estancias").select("pertenencias_sin_entrega_motivo").eq("id", e2.data.id).single()).data;
  const ent = (await SB.from("estancia_pertenencias").select("devuelto").eq("estancia_id", e2.data.id)).data;
  comprobar(fin2.pertenencias_sin_entrega_motivo === null && ent.every((x) => x.devuelto), "todas quedan devueltas y sin motivo");
  await c.close();

  // La acción exige el motivo aunque se salte la pantalla: la base rechaza un motivo corto.
  const corto = await SB.from("estancias").update({ pertenencias_sin_entrega_motivo: "x" }).eq("id", e2.data.id);
  comprobar(corto.error, "la base rechaza un motivo de menos de 3 caracteres");

  // ── QA S15 (19 de octubre de 2026) ──
  seccion("Check-in: «Quién entrega» es de la lista o «Otra persona» con su nombre (QA S15)");
  {
    const { data: duenoB } = await SB.from("clientes").select("nombre").eq("id", datos.clienteSoloB).single();
    const diaI = (() => { let d = new Date(Date.now() + 120 * 86400000 + (Number(sufijo) % 50) * 86400000); while (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); })();
    const sigI = new Date(new Date(`${diaI}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
    const nuevaEstancia = async (desfase = 0) => {
      let d = new Date(new Date(`${diaI}T12:00:00Z`).getTime() + desfase * 86400000);
      while (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000);
      const ent = d.toISOString().slice(0, 10);
      const sal = new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
      const r = await cliente.from("estancias").insert({ reserva_id: rG.id, perro_id: perro.id, servicio_id: gD.id, fecha_entrada: desfase ? ent : diaI, fecha_salida: desfase ? sal : sigI, bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }).select("id").single();
      if (r.error) throw new Error(`estancia check-in: ${r.error.message}`);
      limpieza.push(async () => { await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", r.data.id); });
      return r.data.id;
    };
    const abrirCheckin = async (id) => {
      const cx = await nav.newContext({ viewport: { width: 390, height: 900 } });
      await cx.addCookies(await cookiesDe(datos.adminB, "huellitas.localhost"));
      const px = await cx.newPage();
      px.setDefaultTimeout(45000);
      await px.goto(`${BASE}/reservas/estancias/${id}/checkin`, { waitUntil: "networkidle" });
      return { cx, px };
    };
    // 1) Sin escoger: marca el campo y no deja confirmar.
    const eI = await nuevaEstancia();
    let { cx, px } = await abrirCheckin(eI);
    const quien = px.locator("#checkin-entrega-quien");
    const opciones = await quien.locator("option").allInnerTexts();
    comprobar(opciones.some((o) => o.startsWith("Dueño:") && o.includes(duenoB.nombre)) && opciones.some((o) => /^Otra persona/.test(o)), `la lista trae al dueño y «Otra persona» (${opciones.join(" | ")})`);
    comprobar((await px.locator("#checkin-entrega-nombre").count()) === 0, "no hay un campo de texto libre mientras no se escoja «Otra persona»");
    comprobar(await px.locator("[data-confirmar-checkin]").isDisabled() && /escoge quién entrega/.test(await px.locator("[data-motivo-confirmar]").innerText()), "sin escoger: el botón está deshabilitado y dice qué falta (N69)");
    // 2) «Otra persona» sin nombre: pide el nombre.
    await quien.selectOption("otra");
    comprobar((await px.locator("#checkin-entrega-nombre").count()) === 1, "«Otra persona» abre el campo «Nombre de la otra persona»");
    comprobar(await px.locator("[data-confirmar-checkin]").isDisabled() && /el nombre de quien entrega/.test(await px.locator("[data-motivo-confirmar]").innerText()), "con «Otra persona» y sin nombre, pide el nombre");
    comprobar((await SB.from("estancias").select("estado").eq("id", eI).single()).data.estado !== "en_curso", "y no registra el check-in");
    await px.locator("#checkin-entrega-nombre").fill("Tía Rosa Prueba");
    await px.getByRole("button", { name: /Confirmar check-in/ }).click();
    await confirmarSiFueraDeHorario(px);
    comprobar(await esperarTexto(px, /Check-in registrado/), "con el nombre de la otra persona, el check-in se registra");
    const regI = (await SB.from("estancias").select("estado, entregado_por_nombre").eq("id", eI).single()).data;
    comprobar(regI.estado === "en_curso" && regI.entregado_por_nombre === "Tía Rosa Prueba", `queda quién lo entregó (${regI.entregado_por_nombre})`);
    await cx.close();
    // 3) El dueño de la lista: se guarda su nombre.
    await SB.from("estancias").update({ estado: "finalizada" }).eq("id", eI);
    const eI2 = await nuevaEstancia(3);
    ({ cx, px } = await abrirCheckin(eI2));
    await px.locator("#checkin-entrega-quien").selectOption({ index: 1 });
    await px.getByRole("button", { name: /Confirmar check-in/ }).click();
    await confirmarSiFueraDeHorario(px);
    comprobar(await esperarTexto(px, /Check-in registrado/), "escogiendo al dueño, el check-in se registra");
    comprobar((await SB.from("estancias").select("entregado_por_nombre").eq("id", eI2).single()).data.entregado_por_nombre === duenoB.nombre, "y queda el nombre del dueño");
    await cx.close();
    await SB.from("estancias").update({ estado: "finalizada" }).eq("id", eI2);
  }

  seccion("Cancelar una reserva de hotel pide motivo opcional y queda en la bitácora (QA S15)");
  {
    const { data: hotel } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "hotel_noche").is("deleted_at", null).maybeSingle();
    // El hotel cobra por talla: la mascota de prueba lleva una.
    const { data: talla } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
    await SB.from("perros").update({ tamano_id: talla.id }).eq("id", perro.id);
    let base = 200 + (Number(sufijo) % 60) * 2;
    while (![1, 2].includes(new Date(Date.now() + base * 86400000).getUTCDay())) base++;
    const dH = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const rH = (await cliente.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    const eH = await cliente.from("estancias").insert({ reserva_id: rH.id, perro_id: perro.id, servicio_id: hotel?.id ?? gD.id, fecha_entrada: dH(base), fecha_salida: dH(base + 1), bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }).select("id").single();
    if (eH.error) throw new Error(`estancia hotel: ${eH.error.message}`);
    limpieza.push(async () => { await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", eH.data.id); });
    const cx = await nav.newContext({ viewport: { width: 390, height: 900 } });
    await cx.addCookies(await cookiesDe(datos.adminB, "huellitas.localhost"));
    const px = await cx.newPage();
    px.setDefaultTimeout(45000);
    await px.goto(`${BASE}/reservas/${rH.id}`, { waitUntil: "networkidle" });
    await px.getByRole("button", { name: "Cancelar toda la reserva" }).click();
    const dialogo = await px.locator("body").innerText();
    // Desde S18 la confirmación dice qué se cancela (servicio, mascota y fechas: describirEstancia).
    comprobar(new RegExp(`¿Cancelar [^?]*${perro.nombre}[^?]*\\?`).test(dialogo) && !/perro\(s\)/.test(dialogo), `N52: con un perro lo nombra («¿Cancelar … ${perro.nombre} …?»), sin «perro(s)»`);
    const motivo = px.getByLabel("Motivo (opcional)");
    comprobar((await motivo.count()) === 1, "al cancelar, aparece «Motivo (opcional)»");
    await motivo.fill("El cliente cambió de fechas");
    await px.getByRole("button", { name: "Sí, cancelar todo" }).click();
    comprobar(await esperarTexto(px, new RegExp(`Se canceló la reserva de ${perro.nombre} el .+ a las \\d{1,2}:\\d{2} [ap]\\.m\\. Motivo: El cliente cambió de fechas`)), "R23 N52: el aviso dice a quién, la fecha, la hora y el motivo");
    const fH = (await SB.from("estancias").select("estado, motivo_cancelacion, cancelada_por, cancelada_at").eq("id", eH.data.id).single()).data;
    comprobar(fH.estado === "cancelada" && fH.motivo_cancelacion === "El cliente cambió de fechas" && fH.cancelada_por === datos.adminB && fH.cancelada_at, "la estancia guarda el motivo, quién y cuándo");
    const { data: bit } = await SB.from("registro_ediciones").select("cambios").eq("tabla", "estancias").eq("registro_id", eH.data.id).order("created_at", { ascending: false }).limit(1);
    comprobar(JSON.stringify(bit?.[0]?.cambios ?? {}).includes("El cliente cambió de fechas"), "y la bitácora de ediciones anota el motivo junto con el cambio de estado");
    await px.reload({ waitUntil: "networkidle" });
    const tc = await px.locator("[data-cancelacion-estancia]").innerText().catch(() => "");
    comprobar(/Cancelada por .+ el .+ a las \d{1,2}:\d{2} [ap]\.m\. Motivo: El cliente cambió de fechas/.test(tc) && !/@/.test(tc), `N52: la reserva lo enseña con el nombre, la fecha, la hora y el motivo («${tc}»)`);
    // Sin motivo también se puede.
    const rH2 = (await cliente.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    const eH2 = await cliente.from("estancias").insert({ reserva_id: rH2.id, perro_id: perro.id, servicio_id: hotel?.id ?? gD.id, fecha_entrada: dH(base + 7), fecha_salida: dH(base + 8), bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }).select("id").single();
    if (eH2.error) throw new Error(`estancia hotel 2: ${eH2.error.message}`);
    limpieza.push(async () => { await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", eH2.data.id); });
    await px.goto(`${BASE}/reservas/${rH2.id}`, { waitUntil: "networkidle" });
    await px.getByRole("button", { name: "Cancelar toda la reserva" }).click();
    await px.getByRole("button", { name: "Sí, cancelar todo" }).click();
    comprobar(await esperarTexto(px, /Se canceló la reserva de .+ a las/), "sin motivo también se cancela (es opcional)");
    const fH2 = (await SB.from("estancias").select("estado, motivo_cancelacion, cancelada_por").eq("id", eH2.data.id).single()).data;
    comprobar(fH2.estado === "cancelada" && fH2.motivo_cancelacion === null && fH2.cancelada_por === datos.adminB, "queda quién la canceló, sin motivo");
    // R23 (N52): con dos perros, los nombra a los dos con la concordancia correcta.
    const otro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Segundo ${sufijo}`, especie: "perro" }).select("id, nombre").single()).data;
    if (!otro) throw new Error("no se pudo crear el segundo perro");
    await SB.from("perros").update({ tamano_id: talla.id }).eq("id", otro.id);
    limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", otro.id); });
    const rH3 = (await cliente.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    for (const pid of [perro.id, otro.id]) {
      const e = await cliente.from("estancias").insert({ reserva_id: rH3.id, perro_id: pid, servicio_id: hotel?.id ?? gD.id, fecha_entrada: dH(base + 14), fecha_salida: dH(base + 15), bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }).select("id").single();
      if (e.error) throw new Error(`estancia hotel 3: ${e.error.message}`);
      limpieza.push(async () => { await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", e.data.id); });
    }
    await px.goto(`${BASE}/reservas/${rH3.id}`, { waitUntil: "networkidle" });
    await px.getByRole("button", { name: "Cancelar toda la reserva" }).click();
    const dialogo3 = await px.locator("body").innerText();
    comprobar(/¿Cancelar [^?]*\?/.test(dialogo3) && dialogo3.includes(perro.nombre) && dialogo3.includes(otro.nombre) && !/perro\(s\)/.test(dialogo3), "R23 N52: con dos perros nombra a los dos");
    await px.getByRole("button", { name: "Sí, cancelar todo" }).click();
    comprobar(await esperarTexto(px, /Se canceló la reserva de .+ y .+ el .+ a las \d{1,2}:\d{2} [ap]\.m\./), "R23 N52: el aviso nombra a los dos perros con fecha y hora");
    await cx.close();
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  for (const f of limpieza) await f().catch(() => {});
  await nav.close();
  terminar();
}
