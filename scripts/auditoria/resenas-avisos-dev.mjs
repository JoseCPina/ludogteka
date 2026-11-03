// Reseñas del personal y avisos del negocio al dueño (SOLO DESARROLLO, Huellitas; la app compilada en el 3001 con
// CRON_SECRET=mock-cron). docs/app-duenos/FASE-3.md («Parte 2») · migración 20261203002300.
//
//   node scripts/auditoria/resenas-avisos-dev.mjs [--capturas <carpeta>]
//
//   1. Lo que hace el DUEÑO no le avisa a él: pedir cita y reservar desde la app no dejan aviso «negocio».
//   2. Lo que hace el NEGOCIO sí: confirmar, mover y cancelar la cita; mover fechas y cancelar la estancia → un aviso
//      «negocio» por cada cosa, con el texto correcto y push pendiente. La llave de servicio (cron, WhatsApp) no avisa.
//   3. El despacho: la tarea /api/cron/app-recordatorios apaga los push pendientes (una sola vez).
//   4. Reseñas: recepción SIN el permiso no contesta ni esconde (0 filas); el dueño tampoco; estética tampoco; admin sí y
//      al dueño le llega «… contestó tu reseña»; recepción CON el permiso, sí. Nadie cambia estrellas ni texto.
//   5. En pantalla: «Confirmar cita» en el detalle de la cita; /resenas a 1440 y 390 px: contestar y esconder (la base
//      lo refleja), filtros, sin desbordes; recepción sin permiso no la abre (redirección) y no la ve en el menú.
// Limpia lo que crea.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { URL, env, tokenDe, A } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { BASE, abrirComo, esperarTexto } from "./lib/huellitas-navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const ok = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const comprobar = (c, t) => (c ? ok(t) : mal(t));
const seccion = (t) => console.log(`\n── ${t}`);
const sufijo = `RA-${Date.now().toString(36).slice(-5)}`;
const iCap = process.argv.indexOf("--capturas");
const capturas = iCap > 0 ? process.argv[iCap + 1] : null;
if (capturas) fs.mkdirSync(capturas, { recursive: true });

const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const H = datos.B;
const S = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const enNegocio = (token) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": H } } });
const sinNegocio = (token) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const hoyH = (await S.rpc("fecha_negocio")).data;
const suma = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
const msg = (r) => r.error?.message ?? "";

// Un dueño con cuenta y pocas mascotas.
const { data: miembros } = await S.from("membresias").select("profile_id, cliente_id").eq("negocio_id", H).eq("rol", "cliente").is("deleted_at", null).not("cliente_id", "is", null).order("created_at").limit(40);
let C1 = null;
for (const m of miembros ?? []) {
  const { count } = await S.from("perros").select("id", { count: "exact", head: true }).eq("cliente_id", m.cliente_id).is("deleted_at", null);
  if ((count ?? 0) <= 5) { C1 = m; break; }
}
if (!C1) throw new Error("Huellitas necesita un cliente con cuenta.");
const c1 = enNegocio(await tokenDe(C1.profile_id));
const a1 = sinNegocio(await tokenDe(C1.profile_id));
const adm = enNegocio(await tokenDe(datos.adminB));
const rec = enNegocio(await tokenDe(datos.recepcionB));
const est = enNegocio(await tokenDe(datos.esteticaB));
const { data: negH } = await S.from("negocios").select("nombre").eq("id", H).single();

const creados = { perro: null, reservas: [], citas: [], estancias: [], resenas: [], permiso: null, mascota: null };
const avisosDe = async (mascota) => ((await A.from("app_avisos").select("id, titulo, cuerpo, datos, created_at").eq("mascota_id", mascota).eq("tipo", "negocio").order("created_at")).data ?? []);
const nav = await abrirNavegador();
try {
  seccion("Preparación");
  const { data: talla } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: pelo } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
  const { data: raza } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
  const { data: perro, error: eP } = await S.from("perros").insert({ negocio_id: H, cliente_id: C1.cliente_id, nombre: `Aviso ${sufijo}`, raza: "Poodle", raza_id: raza?.id, tamano_id: talla?.id, pelaje_id: pelo?.id }).select("id, nombre").single();
  if (eP) throw new Error(`perro: ${eP.message}`);
  creados.perro = perro.id;
  const vinculo = ((await a1.rpc("app_mis_vinculos")).data ?? []).find((v) => v.perro_id === perro.id);
  creados.mascota = vinculo?.mascota_id ?? null;
  comprobar(Boolean(creados.mascota), "el perro nuevo está ligado a una mascota de la app del dueño");
  const { data: servicios } = await S.from("servicios").select("id, nombre, categoria, unidad").eq("negocio_id", H).is("deleted_at", null);
  const estetica = (servicios ?? []).find((s) => s.categoria === "estetica" && /ba[ñn]o/i.test(s.nombre)) ?? (servicios ?? []).find((s) => s.categoria === "estetica");
  const guarderia = (servicios ?? []).find((s) => s.categoria === "guarderia" && s.unidad !== "hora") ?? (servicios ?? []).find((s) => s.categoria === "guarderia");

  // ── 1. Lo que hace el dueño no le avisa a él ──────────────────────────────────────────────────────────────
  seccion("1. Lo que hace el dueño no le avisa a él");
  const horasDe = async (desde) => {
    for (let d = desde; d <= desde + 14; d++) {
      const fecha = suma(hoyH, d);
      const { data } = await c1.rpc("portal_horas_disponibles", { p_servicio: estetica.id, p_fecha: fecha });
      if (data?.abre && (data.horas ?? []).length > 1) return data.horas;
    }
    return null;
  };
  const horas = await horasDe(20 + Math.floor(Math.random() * 40));
  if (!horas) throw new Error("No hay horas libres para pedir citas.");
  const cita = await c1.rpc("portal_pedir_cita", { p_perro: perro.id, p_servicio: estetica.id, p_inicio: horas[0].inicio });
  if (cita.error) throw new Error(`pedir cita: ${msg(cita)}`);
  creados.citas.push(cita.data.cita_id); creados.reservas.push(cita.data.reserva_id);
  await adm.rpc("marcar_evaluacion_comportamiento", { p_perro_id: perro.id, p_fecha: hoyH, p_notas: "prueba avisos" });
  const { data: tipos } = await S.from("tipos_requisito_sanitario").select("id").eq("negocio_id", H).is("deleted_at", null);
  for (const t of tipos ?? []) await S.from("requisitos_sanitarios_aplicados").insert({ negocio_id: H, perro_id: perro.id, tipo_requisito_id: t.id, fecha_aplicacion: suma(hoyH, -3), detalle: "Prueba avisos" });
  let D = suma(hoyH, 500 + Math.floor(Math.random() * 100));
  while (new Date(`${D}T12:00:00Z`).getUTCDay() !== 3) D = suma(D, 1);
  const res = await c1.rpc("portal_reservar", { p_perro: perro.id, p_servicio: guarderia.id, p_entrada: D, p_salida: suma(D, 1) });
  if (res.data?.estancia_id) { creados.estancias.push(res.data.estancia_id); creados.reservas.push(res.data.reserva_id); }
  comprobar(!res.error, `el dueño reserva guardería el ${D}${res.error ? ` («${msg(res)}»)` : ""}`);
  const conf = await c1.rpc("portal_confirmar_visita", { p_tipo: "estetica", p_id: cita.data.cita_id });
  comprobar(!conf.error, `el dueño confirma su cita desde la app${conf.error ? ` («${msg(conf)}»)` : ""}`);
  comprobar((await avisosDe(creados.mascota)).length === 0, "pedir cita, reservar y confirmar desde la app no le dejan ningún aviso «negocio»");

  // ── 2. Lo que hace el negocio sí ───────────────────────────────────────────────────────────────────────────
  seccion("2. Lo que hace el negocio le llega al dueño");
  // Una segunda cita, reservada, para que el negocio la confirme.
  const horas2 = await horasDe(80);
  const cita2 = await c1.rpc("portal_pedir_cita", { p_perro: perro.id, p_servicio: estetica.id, p_inicio: horas2?.[0]?.inicio });
  if (cita2.error) throw new Error(`segunda cita: ${msg(cita2)}`);
  creados.citas.push(cita2.data.cita_id); creados.reservas.push(cita2.data.reserva_id);
  const confNeg = await adm.from("citas_estetica").update({ estado: "confirmada" }).eq("id", cita2.data.cita_id).eq("estado", "reservada").select("id");
  comprobar(!confNeg.error && confNeg.data?.length === 1, "el admin confirma la cita");
  let av = await avisosDe(creados.mascota);
  const aConf = av.find((a) => /confirmó la cita/.test(a.titulo));
  comprobar(Boolean(aConf) && aConf.titulo.startsWith(negH.nombre) && aConf.titulo.includes(perro.nombre) && aConf.datos?.push_pendiente === true, `aviso «${aConf?.titulo ?? "no llegó"}» — ${aConf?.cuerpo ?? ""} (push pendiente: ${aConf?.datos?.push_pendiente})`);
  const nuevo = horas2[horas2.length - 1].inicio;
  const mov = await rec.rpc("reprogramar_cita_estetica", { p_cita_id: cita2.data.cita_id, p_inicio: nuevo, p_motivo: "Prueba de aviso" });
  comprobar(!mov.error, `recepción mueve la cita${mov.error ? ` («${msg(mov)}»)` : ""}`);
  av = await avisosDe(creados.mascota);
  const aMov = av.find((a) => /movió la cita/.test(a.titulo));
  comprobar(Boolean(aMov) && /ahora es el .+ a las \d{2}:\d{2} \(antes el .+\)\./.test(aMov.cuerpo), `aviso «${aMov?.titulo ?? "no llegó"}» — ${aMov?.cuerpo ?? ""}`);
  const can = await rec.rpc("cancelar_cita_estetica", { p_cita_id: cita2.data.cita_id, p_motivo: "Se enfermó la estilista", p_no_llego: false });
  comprobar(!can.error, `recepción cancela la cita${can.error ? ` («${msg(can)}»)` : ""}`);
  av = await avisosDe(creados.mascota);
  const aCan = av.find((a) => /canceló la cita/.test(a.titulo));
  comprobar(Boolean(aCan) && /Motivo: Se enfermó la estilista/.test(aCan.cuerpo), `aviso «${aCan?.titulo ?? "no llegó"}» — ${aCan?.cuerpo ?? ""}`);
  if (res.data?.estancia_id) {
    const movE = await adm.from("estancias").update({ fecha_entrada: suma(D, 7), fecha_salida: suma(D, 8) }).eq("id", res.data.estancia_id).select("id");
    comprobar(!movE.error && movE.data?.length === 1, `el admin mueve las fechas de la estancia${movE.error ? ` («${msg(movE)}»)` : ""}`);
    av = await avisosDe(creados.mascota);
    const aMovE = av.find((a) => /cambió las fechas/.test(a.titulo));
    comprobar(Boolean(aMovE) && /Ahora es el /.test(aMovE.cuerpo), `aviso «${aMovE?.titulo ?? "no llegó"}» — ${aMovE?.cuerpo ?? ""}`);
    const canE = await adm.from("estancias").update({ estado: "cancelada", motivo_cancelacion: "Prueba de aviso" }).eq("id", res.data.estancia_id).select("id");
    comprobar(!canE.error && canE.data?.length === 1, "el admin cancela la estancia");
    av = await avisosDe(creados.mascota);
    const aCanE = av.find((a) => /canceló la guardería|canceló la estancia/.test(a.titulo));
    comprobar(Boolean(aCanE), `aviso «${aCanE?.titulo ?? "no llegó"}» — ${aCanE?.cuerpo ?? ""}`);
  }
  const antesServ = (await avisosDe(creados.mascota)).length;
  // La llave de servicio (cron, el webhook de WhatsApp cuando el dueño contesta «Confirmo») no avisa.
  const cita3 = await c1.rpc("portal_pedir_cita", { p_perro: perro.id, p_servicio: estetica.id, p_inicio: (await horasDe(120))?.[0]?.inicio });
  if (cita3.data?.cita_id) { creados.citas.push(cita3.data.cita_id); creados.reservas.push(cita3.data.reserva_id); }
  await S.from("citas_estetica").update({ estado: "confirmada" }).eq("id", cita3.data?.cita_id ?? "00000000-0000-0000-0000-000000000000");
  comprobar((await avisosDe(creados.mascota)).length === antesServ, "un cambio con la llave de servicio (WhatsApp, cron) no deja aviso");

  // ── 3. El despacho de los push ─────────────────────────────────────────────────────────────────────────────
  seccion("3. El despacho de los push pendientes");
  const r1 = await fetch(`${BASE}/api/cron/app-recordatorios`, { headers: { Authorization: "Bearer mock-cron" } });
  const j1 = await r1.json().catch(() => ({}));
  comprobar(r1.ok && j1.ok, `la tarea de la app corre (${r1.status}, avisos del negocio enviados: ${j1.avisosNegocio})`);
  av = await avisosDe(creados.mascota);
  comprobar(av.length > 0 && av.every((a) => a.datos?.push_pendiente === false && a.datos?.push_at), `los ${av.length} avisos quedan sin push pendiente (con la hora del envío)`);
  const j2 = await (await fetch(`${BASE}/api/cron/app-recordatorios`, { headers: { Authorization: "Bearer mock-cron" } })).json().catch(() => ({}));
  const nuestros2 = (await avisosDe(creados.mascota)).filter((a) => a.datos?.push_pendiente).length;
  comprobar(nuestros2 === 0 && j2.ok, "una segunda corrida no los vuelve a tomar");

  // ── 4. Reseñas: quién contesta y esconde ───────────────────────────────────────────────────────────────────
  seccion("4. Reseñas: permisos");
  const fin = await S.from("citas_estetica").update({ estado: "en_curso" }).eq("id", cita.data.cita_id);
  if (!fin.error) await S.from("citas_estetica").update({ estado: "finalizada" }).eq("id", cita.data.cita_id);
  const rese = await c1.rpc("portal_resenar", { p_tipo: "estetica", p_id: cita.data.cita_id, p_estrellas: 4, p_texto: `Muy atentos ${sufijo}` });
  if (rese.error) throw new Error(`reseña: ${msg(rese)}`);
  const resenaId = rese.data.id;
  creados.resenas.push(resenaId);
  // Recepción sin el permiso (se quita si lo tuviera de otra corrida).
  await S.from("permisos_staff").delete().eq("negocio_id", H).eq("profile_id", datos.recepcionB).eq("permiso", "responder_resenas");
  const recSin = await rec.from("resenas").update({ respuesta: "x" }).eq("id", resenaId).select("id");
  comprobar(!recSin.error ? recSin.data?.length === 0 : true, `recepción sin «Responder y esconder reseñas» no contesta (${recSin.error ? msg(recSin) : `${recSin.data?.length} filas`})`);
  const estSin = await est.from("resenas").update({ publicada: false }).eq("id", resenaId).select("id");
  comprobar(!estSin.error ? estSin.data?.length === 0 : true, "estética no esconde");
  const duenoSin = await c1.from("resenas").update({ respuesta: "me contesto solo" }).eq("id", resenaId).select("id");
  comprobar(!duenoSin.error ? duenoSin.data?.length === 0 : true, "el dueño no se contesta a sí mismo");
  const estrellas = await adm.from("resenas").update({ estrellas: 5 }).eq("id", resenaId).select("id");
  comprobar(Boolean(estrellas.error), `el admin no puede cambiar las estrellas («${msg(estrellas)}»)`);
  const antesResp = (await avisosDe(creados.mascota)).length;
  const admResp = await adm.from("resenas").update({ respuesta: `Gracias ${sufijo}`, respondida_at: new Date().toISOString() }).eq("id", resenaId).select("id");
  comprobar(!admResp.error && admResp.data?.length === 1, "el admin contesta");
  av = await avisosDe(creados.mascota);
  const aResp = av.find((a) => /contestó tu reseña/.test(a.titulo));
  comprobar(av.length === antesResp + 1 && Boolean(aResp) && aResp.cuerpo.includes(`Gracias ${sufijo}`), `al dueño le llega «${aResp?.titulo ?? "nada"}»`);
  const ins = await S.from("permisos_staff").insert({ negocio_id: H, profile_id: datos.recepcionB, permiso: "responder_resenas" }).select("id").single();
  creados.permiso = ins.data?.id ?? null;
  const recCon = await rec.from("resenas").update({ publicada: false }).eq("id", resenaId).select("id");
  comprobar(!recCon.error && recCon.data?.length === 1, "recepción CON el permiso esconde la reseña");
  const pub = await S.rpc("resenas_de_negocio", { p_negocio: H });
  comprobar(!(pub.data?.ultimas ?? []).some((u) => (u.texto ?? "").includes(sufijo)), "escondida, ya no sale en las públicas");
  await S.from("resenas").update({ publicada: true, respuesta: null, respondida_at: null }).eq("id", resenaId);
  if (creados.permiso) { await S.from("permisos_staff").delete().eq("id", creados.permiso); creados.permiso = null; }

  // ── 5. En pantalla ─────────────────────────────────────────────────────────────────────────────────────────
  seccion("5. En pantalla");
  // «Confirmar cita» en el detalle (cita3 volvió a reservada).
  await S.from("citas_estetica").update({ estado: "reservada" }).eq("id", cita3.data?.cita_id ?? "00000000-0000-0000-0000-000000000000");
  if (cita3.data?.cita_id) {
    const { c, p } = await abrirComo(nav, datos.adminB, H);
    await p.goto(`${BASE}/estetica/${cita3.data.cita_id}`, { waitUntil: "networkidle" }).catch(() => {});
    const antes = (await avisosDe(creados.mascota)).length;
    await p.locator("[data-confirmar-cita]").click();
    comprobar(await esperarTexto(p, /Cita confirmada\./), "«Confirmar cita» dice «Cita confirmada.» con la respuesta");
    const est3 = (await S.from("citas_estetica").select("estado").eq("id", cita3.data.cita_id).single()).data?.estado;
    comprobar(est3 === "confirmada" && (await avisosDe(creados.mascota)).length === antes + 1, `la base la deja confirmada (${est3}) y el dueño recibe el aviso`);
    comprobar((await p.locator("[data-confirmar-cita]").count()) === 0, "el botón desaparece (ya está confirmada)");
    await c.close();
  }
  for (const ancho of [1440, 390]) {
    const { c, p } = await abrirComo(nav, datos.adminB, H, { width: ancho, height: ancho === 390 ? 844 : 900 });
    const errJs = [];
    p.on("pageerror", (e) => errJs.push(e.message));
    await p.goto(`${BASE}/resenas`, { waitUntil: "networkidle" }).catch(() => {});
    const fila = p.locator(`[data-resena="${resenaId}"]`);
    comprobar(await fila.count() === 1, `${ancho} px: /resenas enseña la reseña de la prueba`);
    await fila.locator("[data-contestar]").click();
    await fila.getByLabel("Respuesta del negocio").fill(`Gracias por venir ${sufijo} ${ancho}`);
    await fila.locator("[data-guardar-respuesta]").click();
    comprobar(await esperarTexto(p, /Respuesta guardada/), `${ancho} px: «Respuesta guardada» junto al botón`);
    const enBase = (await S.from("resenas").select("respuesta, respondida_at").eq("id", resenaId).single()).data;
    comprobar(enBase?.respuesta === `Gracias por venir ${sufijo} ${ancho}` && enBase?.respondida_at, "la base guardó la respuesta y cuándo");
    comprobar((await fila.locator("[data-respuesta]").innerText()).includes(`${sufijo} ${ancho}`), "la fila la enseña sin recargar");
    if (capturas) await p.screenshot({ path: path.join(capturas, `resenas-${ancho}.jpg`), fullPage: true, quality: 80, type: "jpeg" });
    await fila.locator("[data-alternar-visible]").click();
    comprobar(await esperarTexto(p, /Reseña escondida/), `${ancho} px: «Esconder de la página» dice «Reseña escondida»`);
    comprobar((await S.from("resenas").select("publicada").eq("id", resenaId).single()).data?.publicada === false && (await fila.getAttribute("data-publicada")) === "no", "la base y la fila la marcan escondida");
    await p.goto(`${BASE}/resenas?ver=escondidas`, { waitUntil: "networkidle" }).catch(() => {});
    comprobar(await p.locator(`[data-resena="${resenaId}"]`).count() === 1, "el filtro «Escondidas» la trae");
    await p.locator(`[data-resena="${resenaId}"] [data-alternar-visible]`).click();
    comprobar(await esperarTexto(p, /se ve otra vez/), "«Mostrar en la página» la regresa");
    const ancho2 = await p.evaluate(() => document.documentElement.scrollWidth);
    comprobar(ancho2 <= ancho, `${ancho} px: nada más ancho que la pantalla (${ancho2})`);
    comprobar(errJs.length === 0, `${ancho} px: sin errores de JavaScript${errJs.length ? ` (${errJs[0]})` : ""}`);
    await c.close();
  }
  // Recepción sin el permiso: no la abre ni la ve en el menú.
  {
    const { c, p } = await abrirComo(nav, datos.recepcionB, H);
    await p.goto(`${BASE}/resenas`, { waitUntil: "networkidle" }).catch(() => {});
    comprobar(!new globalThis.URL(p.url()).pathname.startsWith("/resenas"), `recepción sin permiso no abre /resenas (termina en ${new globalThis.URL(p.url()).pathname})`);
    await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" }).catch(() => {});
    comprobar((await p.locator('nav a[href="/resenas"]').count()) === 0, "y no la ve en el menú");
    await c.close();
  }
} catch (e) {
  mal(`la auditoría se cortó: ${e.message.split("\n")[0]}`);
} finally {
  await nav.close().catch(() => {});
  const ahora = new Date().toISOString();
  if (creados.permiso) await S.from("permisos_staff").delete().eq("id", creados.permiso);
  for (const id of creados.resenas) await S.from("resenas").delete().eq("id", id);
  if (creados.mascota) await A.from("app_avisos").delete().eq("mascota_id", creados.mascota).eq("tipo", "negocio");
  for (const id of creados.citas) {
    await S.from("citas_estetica_cambios").delete().eq("cita_id", id);
    await S.from("citas_estetica").delete().eq("id", id);
  }
  for (const id of creados.estancias) await S.from("estancias").delete().eq("id", id);
  for (const id of creados.reservas) await S.from("reservas").delete().eq("id", id);
  if (creados.perro) {
    await S.from("requisitos_sanitarios_aplicados").delete().eq("perro_id", creados.perro);
    await S.from("perros_evaluaciones").delete().eq("perro_id", creados.perro);
    await S.from("perros").update({ deleted_at: ahora }).eq("id", creados.perro);
  }
}
console.log(hallazgos.length ? `\n✘ Reseñas y avisos del negocio: ${hallazgos.length} hallazgo(s).` : "\n✔ Reseñas y avisos del negocio: todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
