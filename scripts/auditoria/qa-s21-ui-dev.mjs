// QA S21 del 21 de octubre de 2026, EN PANTALLA (SOLO DESARROLLO, Huellitas). Con `npm run build && npm run start -- -p 3001`.
//
//   node scripts/auditoria/qa-s21-ui-dev.mjs
//
// N105. El cargo de una vacuna no tiene «Quitar» en los cargos: «Se quita desde la consulta»; «Quitar» en la sección de
//       vacunas la anula en el carnet y quita su cargo (también la registrada desde el carnet y adoptada).
// N109. La receta desde la consulta pone «250 mg» en Presentación y «7» en Duración.
// N110. El portal no muestra etiquetas de la plantilla en las consultas.
// N101/N106. «Contraseña del portal» solo con cuenta y sin «No hay correo de recuperación».
// N70.  La edición de un servicio por kilómetro trae «Cómo se cobra este servicio» con enlace a sus tarifas.
// N100/N103. Login con contraseña mala: el teléfono se queda, la contraseña se vacía y el aviso sale una vez; placeholders.
// N102. Encabezado del portal: una fila de 56 px fija, negocio y «Salir».
import { createClient } from "@supabase/supabase-js";
import { B, SB, A, URL, env, datos, rpc, personas, dar, quitar, fijarModulo, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { claveAleatoria } from "../lib/clave.mjs";

const REF = new globalThis.URL(URL).hostname.split(".")[0];
const sufijo = String(Date.now()).slice(-6);
const P = await personas();
const BASE = "http://huellitas.localhost:3001";

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
const nav = await abrirNavegador();
const abrir = async (profileId, ancho = 393) => {
  const c = await nav.newContext({ viewport: { width: ancho, height: 860 } });
  if (profileId) await c.addCookies(await cookiesDe(profileId));
  const p = await c.newPage();
  p.setDefaultTimeout(45000);
  return { c, p };
};
const texto = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const esperar = async (fn, ms = 30000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
const limpieza = [];
const medicos = [];
const nuevoPerro = async (nombre, cliente = datos.clienteSoloB) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: cliente, nombre: `${nombre} ${sufijo}`, especie: "perro" }).select("id").single();
  if (r.error) throw new Error(r.error.message);
  limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", r.data.id); });
  return r.data.id;
};
const hoyB = async () => (await rpc(P.admin, "fecha_negocio")).cuerpo;

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  await fijarModulo("portal", true);
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
  medicos.push(med.cuerpo);

  seccion("N105. Cargo de vacuna");
  {
    const perro = await nuevoPerro("S21 vac");
    const fecha = await hoyB();
    // Una registrada desde el carnet antes de la consulta (la adopta el borrador) y una aplicada en la consulta.
    const adoptada = await rpc(P.admin, "registrar_vacuna", { p_perro_id: perro, p_biologico: `Carnet ${sufijo}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: "L-1", p_laboratorio: null, p_fecha: fecha, p_proxima: null, p_medico_id: med.cuerpo, p_dosis: null, p_notas: null, p_descontar: false });
    const ini = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: med.cuerpo });
    const nacida = await rpc(P.recCon, "vet_consulta_registrar_vacuna", { p_consulta: ini.cuerpo, p_biologico: `Consulta ${sufijo}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: "L-2", p_laboratorio: null, p_fecha: fecha, p_proxima: null, p_medico_id: med.cuerpo, p_dosis: null, p_notas: null, p_descontar: false });
    comprobar(adoptada.ok && nacida.ok && ini.ok, `vacunas de prueba registradas (${adoptada.mensaje ?? ""} ${nacida.mensaje ?? ""})`);
    await rpc(P.recCon, "vet_consulta_cargos", { p_consulta: ini.cuerpo });
    const { c, p } = await abrir(datos.adminB, 393);
    await p.goto(`${BASE}/veterinaria/consulta/${ini.cuerpo}`, { waitUntil: "networkidle" });
    const cargos = p.locator("section[aria-labelledby='cargos-titulo'] li", { hasText: `Consulta ${sufijo}` });
    comprobar((await cargos.count()) === 1, "el cargo de la vacuna sale en «Cargos de esta consulta»");
    comprobar((await cargos.locator("[data-se-quita-desde-consulta]").count()) === 1 && (await cargos.getByRole("button", { name: /^Quitar$/ }).count()) === 0, "el cargo de la vacuna no tiene «Quitar»: dice «Se quita desde la consulta»");
    comprobar(((await cargos.locator("[data-se-quita-desde-consulta]").getAttribute("href")) ?? "") === "#t-vacunas-consulta", "y lleva a la sección de vacunas de la consulta");
    for (const nombre of [`Consulta ${sufijo}`, `Carnet ${sufijo}`]) {
      const fila = p.locator("[data-vacuna-consulta]", { hasText: nombre });
      comprobar((await fila.locator("[data-quitar-boton]").count()) === 1, `«${nombre}» trae «Quitar» en la sección de vacunas`);
      await fila.locator("[data-quitar-boton]").click();
      await fila.locator("[data-quitar-si]").click();
      const fuera = await esperar(async () => !(await texto(p)).includes(nombre));
      comprobar(fuera, `«Quitar» la saca de la sección Y de los cargos sin recargar (${nombre})`);
    }
    const anuladas = (await SB.from("carnet_vacunas").select("anulada_at").in("id", [adoptada.cuerpo?.id, nacida.cuerpo?.id])).data ?? [];
    comprobar(anuladas.length === 2 && anuladas.every((v) => v.anulada_at), "las dos quedaron anuladas en el carnet");
    const lineas = (await rpc(P.recCon, "vet_consulta_cargos", { p_consulta: ini.cuerpo })).cuerpo?.lineas ?? [];
    comprobar(!lineas.some((l) => l.tipo === "vacuna" && l.estado !== "quitado"), "y ya no queda ningún cargo de vacuna");
    await rpc(P.recCon, "vet_consulta_descartar", { p_id: ini.cuerpo });
    await c.close();
  }

  seccion("N109 y N110. Receta desde el Tratamiento y portal sin etiquetas");
  {
    await dar(P.admin, P.recConId, "emitir_recetas");
    const perro = await nuevoPerro("S21 rx");
    const ini = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: med.cuerpo });
    await rpc(P.recCon, "vet_consulta_guardar", {
      p_id: ini.cuerpo,
      p_datos: {
        motivo: "Revisión",
        plan: "Estudios solicitados:\nSeguimiento / próxima revisión:\nRecomendaciones al propietario:",
        tratamiento: "Medicamento · dosis · vía · frecuencia · duración: Amoxicilina 250 mg, 1 tableta VO cada 12 horas, 7 días",
        diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Otitis", tipo: "definitivo", nota: "" }],
      },
    });
    const lineas = (await rpc(P.recCon, "vet_consulta_cargos", { p_consulta: ini.cuerpo })).cuerpo?.lineas ?? [];
    for (const l of lineas) await rpc(P.recCon, "vet_consulta_cargo_quitar", { p_id: l.id, p_motivo: "Sin cobro: prueba" });
    const f = await rpc(P.recCon, "vet_consulta_firmar", { p_id: ini.cuerpo });
    comprobar(f.ok, `consulta firmada (${f.mensaje ?? ""})`);
    const { c, p } = await abrir(P.recConId, 393);
    await p.goto(`${BASE}/veterinaria/recetas/nueva?perro=${perro}&consulta=${ini.cuerpo}`, { waitUntil: "networkidle" });
    const pres = await p.locator('input[name="pres-0"]').inputValue().catch(() => null);
    const dur = await p.locator('input[name="dur-0"]').inputValue().catch(() => null);
    const via = await p.locator('input[name="via-0"]').inputValue().catch(() => null);
    comprobar(pres === "250 mg" && dur === "7" && via === "Oral", `Presentación «${pres}», Duración «${dur}», Vía «${via}»`);
    await c.close();
    await quitar(P.admin, P.recConId, "emitir_recetas");

    // El dueño: mueve la mascota a clienteSoloB (que tiene cuenta) — ya es suya — y abre su ficha en el portal.
    const { c: c2, p: p2 } = await abrir(datos.cuentaSoloB, 393);
    await p2.goto(`${BASE}/portal/perros/${perro}`, { waitUntil: "networkidle" });
    const bloque = await p2.locator("[data-expediente-cliente]").innerText().catch(() => "");
    comprobar(/Amoxicilina 250 mg/.test(bloque), "el portal muestra el tratamiento escrito");
    comprobar(!/Medicamento · dosis|Recomendaciones al propietario|Estudios solicitados|Seguimiento \//.test(bloque), `sin etiquetas de la plantilla («${bloque.replace(/\s+/g, " ").slice(0, 160)}»)`);

    seccion("N102. Encabezado del portal");
    const cab = p2.locator("[data-encabezado-portal]");
    const caja = await cab.boundingBox();
    const estilo = await cab.evaluate((h) => getComputedStyle(h).position);
    comprobar(caja && Math.round(caja.height) === 56, `una fila de 56 px (${caja?.height})`);
    comprobar(estilo === "sticky" && /Salir/.test(await cab.innerText()) && !/Hola,|Cerrar sesión/.test(await cab.innerText()), "fija arriba, con «Salir» y sin saludo");
    await p2.mouse.wheel(0, 1500);
    await p2.waitForTimeout(400);
    comprobar(Math.round((await cab.boundingBox())?.y ?? -1) === 0, "al bajar se queda arriba");
    comprobar((await p2.locator("[data-saludo-portal]").count()) === 1, "el saludo va en el cuerpo");
    seccion("N103. Placeholders del portal");
    await p2.goto(`${BASE}/portal`, { waitUntil: "networkidle" });
    comprobar((await p2.locator('input[name="email"]').getAttribute("placeholder")) === "nombre@correo.com", "Correo: «nombre@correo.com»");
    await c2.close();
    await rpc(P.recCon, "vet_consulta_anular", { p_id: ini.cuerpo, p_motivo: "Fin de la prueba" });
  }

  seccion("N101 y N106. Ficha del cliente");
  {
    const { c, p } = await abrir(datos.adminB, 1100);
    await p.goto(`${BASE}/clientes/${datos.clienteSoloB}`, { waitUntil: "networkidle" });
    const t = await texto(p);
    comprobar(/Contraseña del portal/.test(t) && (await p.locator("[data-texto-recuperacion]").count()) === 1, "con cuenta: «Contraseña del portal» con su texto");
    comprobar(!/No hay correo de recuperación/.test(t), "sin «No hay correo de recuperación»");
    const sinCuenta = (await SB.from("clientes").insert({ negocio_id: B, nombre: `S21 sin cuenta ${sufijo}`, telefono: `55${sufijo}${String(Math.floor(Math.random() * 90) + 10)}` }).select("id").single()).data;
    if (sinCuenta) {
      limpieza.push(async () => { await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", sinCuenta.id); });
      await p.goto(`${BASE}/clientes/${sinCuenta.id}`, { waitUntil: "networkidle" });
      const t2 = await texto(p);
      comprobar(!/Contraseña del portal/.test(t2), "sin cuenta: no sale «Contraseña del portal»");
      comprobar((t2.match(/todavía no tiene cuenta/g) ?? []).length === 1 && /Invitar al portal/.test(t2), "«todavía no tiene cuenta» una sola vez, en «Invitar al portal»");
    } else comprobar(false, "no se pudo crear el cliente sin cuenta");
    seccion("N70. Servicio por kilómetro");
    const km = (await SB.from("servicios").select("id").eq("negocio_id", B).eq("unidad", "km").is("deleted_at", null).limit(1).maybeSingle()).data;
    if (km) {
      await p.goto(`${BASE}/servicios/${km.id}`, { waitUntil: "networkidle" });
      // QA S22: con tramos, «Ver y editar los tramos y precios»; sin tramos todavía, «Capturar tramos».
      const enlace = (await p.locator("[data-enlace-tarifas]").count()) ? await p.locator("[data-enlace-tarifas]").getAttribute("href") : await p.locator("[data-capturar-tramos]").getAttribute("href").catch(() => null);
      comprobar((await p.locator("[data-como-se-cobra]").count()) === 1 && Boolean(enlace?.startsWith(`/servicios/${km.id}/tarifas`)), `la edición trae «Cómo se cobra este servicio» con enlace a las tarifas (${enlace})`);
    } else comprobar(false, "Huellitas no tiene un servicio por kilómetro");
    await c.close();
  }

  seccion("N100 y N103. Login con contraseña incorrecta");
  {
    const { data: perfil } = await A.from("profiles").select("telefono").eq("id", datos.cuentaSoloB).maybeSingle();
    const tel = perfil?.telefono ?? "4440000000";
    for (const ancho of [393, 1280]) {
      const { c, p } = await abrir(null, ancho);
      await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
      // QA S36: el cliente entra por «Soy cliente» (el de por omisión) con su teléfono.
      const id = p.getByLabel("Teléfono", { exact: true });
      comprobar((await id.getAttribute("placeholder")) === "10 dígitos", `placeholder «10 dígitos» (${ancho} px)`);
      await id.fill(tel);
      await p.locator('input[name="password"]').fill(claveAleatoria());
      await p.getByRole("button", { name: "Entrar" }).click();
      await esperar(async () => /incorrectos/.test(await texto(p)));
      const veces = ((await texto(p)).match(/Teléfono o contraseña incorrectos/g) ?? []).length;
      comprobar(veces === 1, `el aviso sale una vez (${veces}, ${ancho} px)`);
      comprobar((await id.inputValue()) === tel && (await p.locator('input[name="password"]').inputValue()) === "", `el teléfono se queda y la contraseña se vacía (${ancho} px)`);
      await c.close();
    }
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const f of limpieza) await f().catch(() => {});
  for (const m of medicos) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
  await nav.close();
  terminar();
}
