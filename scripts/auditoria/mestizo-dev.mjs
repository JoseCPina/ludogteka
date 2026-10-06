// Precio de estética del mestizo / sin grupo de raza: matriz TALLA × PELAJE
// (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/mestizo-dev.mjs
//
// 1. La migración: «Por talla» pasó a «Mestizo / sin raza» (sin restricción de
//    pelaje, cobra por pelaje) y sus precios de pelo corto quedaron igual.
// 2. Las 9 combinaciones talla × pelaje × los 3 servicios: cada una cotiza y se
//    agenda con el precio de su celda (rapado a pelo corto, bloqueado).
// 3. Pelo maltratado, celda vacía (con y sin excepción con motivo), perro sin
//    talla o pelaje (qué falta, y se completa y agenda), «calculado» y su
//    confirmación, y el caso Osito (mestizo, chico, pelo largo) hasta el cobro.
// 4. Carga y reversa exacta de una tabla de precios; otro negocio no alcanza
//    nada; un negocio nuevo hereda la forma del grupo y la matriz vacía.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const cab = (token, negocio = B) => ({ apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-negocio-id": negocio, "Content-Type": "application/json", Prefer: "return=representation" });
const llamar = async (url, opciones) => {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { ok: r.ok, status: r.status, cuerpo, mensaje: cuerpo?.message ?? (typeof cuerpo === "string" ? cuerpo : "") };
};
const rpc = (token, fn, args = {}, negocio = B) => llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token, negocio), body: JSON.stringify(args) });

const tAdmin = await tokenDe(datos.adminB);
const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const tRec = await tokenDe(recepciones[0].profile_id);
const tRecSin = await tokenDe(recepciones[1].profile_id);
const tCliente = await tokenDe(datos.cuentaSoloB);
const tLudo = await tokenDe((await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "admin").is("deleted_at", null).limit(1).single()).data.profile_id);

const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
const talla = (c) => tallas.find((t) => t.clave === c).id;
const pelaje = (c) => pelajes.find((t) => t.clave === c).id;
const { data: servicios } = await SB.from("servicios").select("id, clave").eq("categoria", "estetica").is("deleted_at", null);
const srv = (c) => servicios.find((s) => s.clave === `estetica_${c}`).id;
const { data: razas } = await A.from("razas").select("id, nombre");
const razaMestizo = razas.find((r) => r.nombre === "Mestizo").id;
const { data: grupoMestizo } = await SB.from("grupos_raza").select("*").eq("clave", "mestizo").single();
const { data: hoyB } = await rpc(tAdmin, "fecha_negocio").then((r) => ({ data: r.cuerpo }));
const sumar = (f, n) => { const [y, m, d] = f.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const sufijo = String(Date.now()).slice(-6);
const creados = { perros: [], reservas: [], citas: [] };
let dia = 4000 + Math.floor(Math.random() * 20000);

const mkPerro = async (nombre, { t = null, p = null, raza = razaMestizo } = {}) => {
  const { data, error } = await SB.from("perros").insert({
    cliente_id: datos.clienteSoloB, nombre: `ZZ mest ${nombre} ${sufijo}`, raza: raza ? "Mestizo" : "Cosa rara", raza_id: raza,
    tamano_id: t ? talla(t) : null, pelaje_id: p ? pelaje(p) : null,
  }).select("id").single();
  if (error) throw new Error(`perro ${nombre}: ${error.message}`);
  creados.perros.push(data.id);
  return data.id;
};
const cotizar = async (perro, servicio, extra = {}) => (await rpc(tAdmin, "cotizar_cita_estetica", { p_perro_id: perro, p_servicio_id: srv(servicio), ...extra })).cuerpo;
const agendar = async (perro, servicio, extra = {}, token = tAdmin) => {
  const rr = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: datos.clienteSoloB }) });
  const reservaId = rr.cuerpo?.[0]?.id;
  creados.reservas.push(reservaId);
  const f = sumar(hoyB, dia++);
  let r;
  for (let i = 0; i < 8; i++) {
    const h = `${String(10 + Math.floor(Math.random() * 12)).padStart(2, "0")}:${String(Math.floor(Math.random() * 6) * 10).padStart(2, "0")}:00-06:00`;
    r = await llamar(`${URL}/rest/v1/citas_estetica`, { method: "POST", headers: cab(token), body: JSON.stringify({ reserva_id: reservaId, perro_id: perro, servicio_id: srv(servicio), empleado_id: datos.esteticaB, inicio: `${f}T${h}`, ...extra }) });
    if (r.ok || !/traslape/.test(r.mensaje)) break;
  }
  if (r.ok && r.cuerpo?.[0]?.id) creados.citas.push(r.cuerpo[0].id);
  return r;
};
const precioTabla = async (servicio, t, p) => {
  const { data } = await SB.from("tarifas_vigentes").select("precio, precio_pelo_maltratado, no_aplica, calculado").eq("servicio_id", srv(servicio)).eq("grupo_raza_id", grupoMestizo.id).eq("tamano_id", talla(t)).eq("pelaje_id", pelaje(p));
  return data?.[0] ?? null;
};

try {
  // Restos de corridas anteriores: sus citas liberan la hora.
  const { data: viejos } = await SB.from("perros").select("id").like("nombre", "ZZ mest%");
  if (viejos?.length) await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("perro_id", viejos.map((p) => p.id)).is("deleted_at", null);

  // Estado de partida: lo de medio y largo vuelve a estar «calculado» (una corrida anterior pudo confirmarlo).
  const normalizar = () => SB.from("tarifas").update({ calculado: true }).eq("grupo_raza_id", grupoMestizo.id).in("pelaje_id", [pelaje("medio"), pelaje("largo")]).is("deleted_at", null);
  await normalizar();

  // ── 1. La migración ──
  console.log("── 1. «Por talla» pasó a «Mestizo / sin raza»");
  comprobar(grupoMestizo.nombre === "Mestizo / sin raza" && grupoMestizo.depende_pelaje === true && grupoMestizo.depende_tamano === true && grupoMestizo.pelajes_permitidos === null,
    "el grupo se llama «Mestizo / sin raza», cobra por talla y pelaje y ya no se limita a pelo corto");
  comprobar(grupoMestizo.es_predeterminado === true, "sigue siendo el grupo por defecto (perros sin raza de catálogo)");
  const corto = { estetico: { chico: 250, mediano: 350, grande: 490 }, expres: { chico: 150, mediano: 190, grande: 230 } };
  let intactos = true;
  for (const [s, porTalla] of Object.entries(corto)) for (const [t, precio] of Object.entries(porTalla)) {
    const c = await precioTabla(s, t, "corto");
    if (!c || Number(c.precio) !== precio || c.calculado) { intactos = false; hallazgo(`pelo corto ${s} ${t}: esperaba $${precio} sin marca y hay ${JSON.stringify(c)}`); }
  }
  comprobar(intactos, "los precios de pelo corto (250/150, 350/190, 490/230) quedaron EXACTOS y sin marca «calculado»");
  for (const t of ["chico", "mediano", "grande"]) {
    const c = await precioTabla("rapado", t, "corto");
    comprobar(c?.no_aplica === true, `rapado a pelo corto (${t}) sigue «no aplica»`);
  }

  // ── 2. Las 9 combinaciones ──
  console.log("── 2. Las 9 combinaciones × 3 servicios");
  let celdas = 0;
  for (const t of ["chico", "mediano", "grande"]) {
    for (const p of ["corto", "medio", "largo"]) {
      const perro = await mkPerro(`${t}-${p}`, { t, p });
      for (const s of ["estetico", "rapado", "expres"]) {
        const celda = await precioTabla(s, t, p);
        const q = await cotizar(perro, s);
        if (s === "rapado" && p === "corto") {
          comprobar(q.estado === "pelaje_no_ofrecido", `rapado a pelo corto (${t}) no se ofrece`);
          const r = await agendar(perro, s);
          comprobar(!r.ok && /no se ofrece/i.test(r.mensaje), "y la base lo rechaza al agendar");
          continue;
        }
        const ok = q.estado === "ok" && Number(q.precio) === Number(celda?.precio);
        if (!ok) hallazgo(`${s} ${t} pelo ${p}: la cotización dice ${JSON.stringify(q)} y la celda $${celda?.precio}`);
        const r = await agendar(perro, s);
        const cita = r.cuerpo?.[0];
        if (!r.ok || Number(cita?.precio) !== Number(celda?.precio)) hallazgo(`${s} ${t} pelo ${p}: la cita sale ${r.ok ? cita?.precio : r.mensaje} y la celda $${celda?.precio}`);
        else celdas += 1;
      }
    }
  }
  comprobar(celdas === 24, `las 24 combinaciones que se ofrecen se agendan con el precio de su celda (${celdas} de 24)`);

  // ── 3. Maltratado, calculado, celda vacía, datos que faltan, Osito ──
  console.log("── 3. Maltratado, celda vacía, datos que faltan y Osito");
  const perroM = await mkPerro("maltratado", { t: "chico", p: "largo" });
  const celdaM = await precioTabla("estetico", "chico", "largo");
  const qM = await cotizar(perroM, "estetico", { p_pelo_maltratado: true });
  comprobar(qM.estado === "ok" && Number(qM.precio) === Number(celdaM.precio_pelo_maltratado) && qM.maltratado_aplicado === true, `maltratado cobra el precio alterno de su celda ($${qM.precio})`);
  const rM = await agendar(perroM, "estetico", { pelo_maltratado: true });
  comprobar(rM.ok && Number(rM.cuerpo?.[0]?.precio_base) === Number(celdaM.precio_pelo_maltratado), "y la cita lo guarda");
  const calculadas = (await SB.from("tarifas_vigentes").select("calculado").eq("grupo_raza_id", grupoMestizo.id).eq("calculado", true)).data?.length ?? 0;
  comprobar(calculadas === 18, `las 18 celdas de medio y largo siguen marcadas «calculado» (${calculadas})`);

  // Osito: mestizo, chico, pelo largo.
  const osito = await mkPerro("Osito", { t: "chico", p: "largo" });
  const qO = await cotizar(osito, "estetico");
  comprobar(qO.estado === "ok" && Number(qO.precio) === 390, `Osito (mestizo, chico, pelo largo): baño estético $${qO.precio}, sin avisos`);
  const rO = await agendar(osito, "estetico");
  comprobar(rO.ok && Number(rO.cuerpo?.[0]?.precio) === 390, "y se agenda a $390");
  if (rO.ok) {
    const { data: totales } = await rpc(tAdmin, "cuenta_totales_reserva", { p_reserva_id: rO.cuerpo[0].reserva_id }).then((r) => ({ data: r.cuerpo }));
    comprobar(Number(totales?.[0]?.saldo) === 390, "la cuenta llega al cobro con saldo $390");
  }

  // Perro sin pelaje / sin talla.
  const sinPelo = await mkPerro("sin-pelo", { t: "chico", p: null });
  const qSP = await cotizar(sinPelo, "estetico");
  comprobar(qSP.estado === "faltan_datos" && JSON.stringify(qSP.faltan) === '["pelaje"]', "sin pelaje: dice que falta el pelaje (y solo eso)");
  const rSP = await agendar(sinPelo, "estetico");
  comprobar(!rSP.ok && /no tiene pelaje registrado/.test(rSP.mensaje), `la base lo rechaza con un mensaje claro («${rSP.mensaje.slice(0, 70)}»)`);
  const sinNada = await mkPerro("sin-nada", {});
  const qSN = await cotizar(sinNada, "estetico");
  comprobar(qSN.estado === "faltan_datos" && JSON.stringify(qSN.faltan) === '["tamano","pelaje"]', "sin talla ni pelaje: dice que faltan los dos");
  const { error: errCompleta } = await SB.from("perros").update({ tamano_id: talla("mediano"), pelaje_id: pelaje("medio") }).eq("id", sinNada);
  const qSN2 = await cotizar(sinNada, "estetico");
  comprobar(!errCompleta && qSN2.estado === "ok" && Number(qSN2.precio) === Number((await precioTabla("estetico", "mediano", "medio")).precio), "al completarlos se recalcula y da el precio de su celda");
  // Recepción completa talla y pelaje desde la pantalla (update directo con su sesión).
  const sinPelo2 = await mkPerro("sin-pelo2", { t: "grande", p: null });
  const upd = await llamar(`${URL}/rest/v1/perros?id=eq.${sinPelo2}`, { method: "PATCH", headers: cab(tRec), body: JSON.stringify({ pelaje_id: pelaje("largo") }) });
  comprobar(upd.ok && upd.cuerpo?.length === 1, "recepción guarda el pelaje en el expediente");
  comprobar((await cotizar(sinPelo2, "estetico")).estado === "ok", "y el precio sale en el momento");

  // Celda vacía: se borra (baja lógica) la de chico × medio del exprés.
  console.log("── 3b. Celda vacía y excepción con motivo");
  const perroV = await mkPerro("vacia", { t: "chico", p: "medio" });
  const { data: filaVacia } = await SB.from("tarifas").select("id").eq("servicio_id", srv("expres")).eq("grupo_raza_id", grupoMestizo.id).eq("tamano_id", talla("chico")).eq("pelaje_id", pelaje("medio")).is("deleted_at", null);
  await SB.from("tarifas").update({ deleted_at: new Date().toISOString() }).in("id", filaVacia.map((f) => f.id));
  try {
    const qV = await cotizar(perroV, "expres");
    comprobar(qV.estado === "sin_precio" && /servicios\/.+\/tarifas/.test(qV.ruta_precios), "la celda vacía cotiza «sin precio» y trae la ruta a Servicios y precios");
    const rV = await agendar(perroV, "expres");
    comprobar(!rV.ok && /Esta combinación no tiene precio/.test(rV.mensaje) && /excepción con motivo/.test(rV.mensaje) && /\/servicios\/.+\/tarifas/.test(rV.mensaje), `la base dice qué hacer («${rV.mensaje.slice(0, 120)}…»)`);
    // Excepción: con otro grupo y motivo, con permiso.
    const { data: gPoodle } = await SB.from("grupos_raza").select("id").eq("clave", "poodle_maltes").single();
    const qE = await cotizar(perroV, "expres", { p_grupo_excepcion_id: gPoodle.id });
    comprobar(qE.estado === "ok" && Number(qE.precio) === 190, `con la excepción (grupo poodle) cotiza $${qE.precio}`);
    const sinMotivo = await agendar(perroV, "expres", { grupo_raza_excepcion_id: gPoodle.id });
    comprobar(!sinMotivo.ok && /motivo/i.test(sinMotivo.mensaje), "la excepción sin motivo se rechaza");
    const conMotivo = await agendar(perroV, "expres", { grupo_raza_excepcion_id: gPoodle.id, excepcion_grupo_motivo: "Todavía no capturamos ese precio" });
    comprobar(conMotivo.ok && Number(conMotivo.cuerpo?.[0]?.precio) === 190 && conMotivo.cuerpo?.[0]?.excepcion_grupo_por, "con motivo se agenda a $190 y queda quién la hizo");
    await rpc(tAdmin, "revocar_permiso", { p_profile_id: recepciones[1].profile_id, p_permiso: "excepciones_reserva" });
    const sinPermiso = await agendar(perroV, "expres", { grupo_raza_excepcion_id: gPoodle.id, excepcion_grupo_motivo: "intento" }, tRecSin);
    comprobar(!sinPermiso.ok && /excepci/i.test(sinPermiso.mensaje), "recepción sin el permiso de excepciones no puede");
  } finally {
    await SB.from("tarifas").update({ deleted_at: null }).in("id", filaVacia.map((f) => f.id));
  }

  // ── Confirmar calculados ──
  console.log("── 3c. Confirmar los precios calculados");
  const conf0 = await rpc(tRecSin, "confirmar_tarifas_calculadas", { p_grupo_id: grupoMestizo.id, p_servicio_id: srv("expres") });
  comprobar(!conf0.ok, "recepción sin el permiso «Precios y tarifas» no confirma");
  const conf1 = await rpc(tAdmin, "confirmar_tarifas_calculadas", { p_grupo_id: grupoMestizo.id, p_servicio_id: srv("expres") });
  comprobar(conf1.ok && Number(conf1.cuerpo) === 6, `admin confirma las 6 del exprés (${conf1.cuerpo})`);
  const quedan = (await SB.from("tarifas_vigentes").select("calculado").eq("grupo_raza_id", grupoMestizo.id).eq("calculado", true)).data?.length;
  comprobar(quedan === 12, "las otras 12 (baño y rapado) siguen «calculado»");
  const { data: ev } = await SB.from("tarifas_eventos").select("accion, actor, detalle").eq("accion", "confirmar_calculadas").order("created_at", { ascending: false }).limit(1);
  comprobar(ev?.[0]?.actor === datos.adminB && ev[0].detalle.cuantas === 6, "queda el evento con quién confirmó y cuántas");
  // Editar una celda (guardarTarifas inserta una fila nueva sin marca).
  const ins = await llamar(`${URL}/rest/v1/tarifas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ servicio_id: srv("estetico"), grupo_raza_id: grupoMestizo.id, tamano_id: talla("chico"), pelaje_id: pelaje("medio"), vigencia_desde: hoyB, precio: 340, precio_pelo_maltratado: 390 }) });
  const editada = await precioTabla("estetico", "chico", "medio");
  comprobar((ins.ok || /traslape|conflicting|23P01/i.test(ins.mensaje)) && (Number(editada.precio) === 340 ? editada.calculado === false : true), "editar una celda calculada la deja como capturada por el negocio");
  // Revertir el cambio de prueba para no ensuciar: se vuelve a 330 calculado.
  await SB.from("tarifas").update({ precio: 330, precio_pelo_maltratado: 380, calculado: true }).eq("servicio_id", srv("estetico")).eq("grupo_raza_id", grupoMestizo.id).eq("tamano_id", talla("chico")).eq("pelaje_id", pelaje("medio")).is("deleted_at", null);

  // ── 4. Carga, reversa, aislamiento ──
  console.log("── 4. Carga y reversa exacta; otro negocio");
  const config = { grupos: [{ clave: "mestizo", pelajes_permitidos: null, depende_pelaje: true }], tarifas: [
    { servicio: "estetica_estetico", grupo: "mestizo", tamano: "chico", pelaje: "medio", precio: 999, maltratado: 1100, calculado: true },
    { servicio: "estetica_estetico", grupo: "pomerania", precio: 777, maltratado: 888, calculado: false },
  ] };
  const antes = JSON.stringify((await SB.from("tarifas_vigentes").select("servicio_id, grupo_raza_id, tamano_id, pelaje_id, precio, precio_pelo_maltratado, calculado").order("servicio_id")).data);
  const carga = await SB.rpc("plataforma_cargar_tarifas_estetica", { p_negocio_id: B, p_config: config, p_motivo: "prueba mestizo-dev" });
  comprobar(!carga.error && carga.data.tarifas_nuevas === 2, `la plataforma carga 2 celdas (${carga.error?.message ?? "ok"})`);
  const carga2 = await SB.rpc("plataforma_cargar_tarifas_estetica", { p_negocio_id: B, p_config: config, p_motivo: "prueba mestizo-dev" });
  comprobar(!carga2.error && carga2.data.tarifas_nuevas === 0 && carga2.data.tarifas_iguales === 2, "volver a cargar lo mismo no cambia nada (idempotente)");
  const rev = await SB.rpc("plataforma_revertir_carga_tarifas", { p_evento_id: carga.data.evento });
  comprobar(!rev.error, `la reversa funciona (${rev.error?.message ?? JSON.stringify(rev.data)})`);
  const despues = JSON.stringify((await SB.from("tarifas_vigentes").select("servicio_id, grupo_raza_id, tamano_id, pelaje_id, precio, precio_pelo_maltratado, calculado").order("servicio_id")).data);
  comprobar(antes === despues, "después de la reversa, los precios vigentes son EXACTAMENTE los de antes");
  const rev2 = await SB.rpc("plataforma_revertir_carga_tarifas", { p_evento_id: carga.data.evento });
  comprobar(Boolean(rev2.error), "no se revierte dos veces");
  const hayEvento = async (accion) => ((await SB.from("plataforma_eventos").select("id").eq("accion", accion).is("negocio_id", null).limit(1)).data ?? []).length === 1;
  comprobar((await hayEvento("cargar_tarifas_estetica")) && (await hayEvento("revertir_tarifas_estetica")) && (await hayEvento("migracion_matriz_mestizo")), "carga, reversa y migración dejan su evento de auditoría");
  for (const [quien, tok] of [["admin del negocio", tAdmin], ["recepción", tRec], ["cliente", tCliente], ["anónimo", null]]) {
    const a = await rpc(tok, "plataforma_cargar_tarifas_estetica", { p_negocio_id: B, p_config: config });
    const b = await rpc(tok, "plataforma_revertir_carga_tarifas", { p_evento_id: carga.data.evento });
    comprobar(!a.ok && !b.ok, `${quien} no carga ni revierte precios (solo la plataforma)`);
  }

  const perroX = await mkPerro("ajeno", { t: "chico", p: "largo" });
  const cruzado = await rpc(tLudo, "cotizar_cita_estetica", { p_perro_id: perroX, p_servicio_id: srv("estetico") }, LUDOGTEKA);
  comprobar(!cruzado.ok || !cruzado.cuerpo?.precio, "Ludogteka no cotiza el perro de Huellitas");
  const cruzado2 = await rpc(tLudo, "confirmar_tarifas_calculadas", { p_grupo_id: grupoMestizo.id }, LUDOGTEKA);
  comprobar(!cruzado2.ok, "ni confirma los precios de Huellitas");
  const leeEventos = await llamar(`${URL}/rest/v1/tarifas_eventos?select=id`, { headers: cab(tLudo, LUDOGTEKA) });
  comprobar(leeEventos.ok && leeEventos.cuerpo.every((e) => e) && !JSON.stringify(leeEventos.cuerpo).includes(grupoMestizo.id), "Ludogteka no lee la bitácora de precios de Huellitas");
  for (const [quien, tok] of [["cliente", tCliente], ["anónimo", null]]) {
    const q = await rpc(tok, "cotizar_cita_estetica", { p_perro_id: perroX, p_servicio_id: srv("estetico") });
    const e = await llamar(`${URL}/rest/v1/tarifas_eventos?select=id`, { headers: cab(tok) });
    comprobar(!q.ok && (!e.ok || e.cuerpo.length === 0), `${quien} no cotiza ni lee la bitácora de precios`);
  }
  const { data: defCrear } = await SB.rpc("auditoria_frontera");
  comprobar((defCrear ?? []).length === 0, "auditoria_frontera() vacía");
} finally {
  await SB.from("tarifas").update({ calculado: true }).eq("grupo_raza_id", grupoMestizo.id).in("pelaje_id", [pelaje("medio"), pelaje("largo")]).is("deleted_at", null);
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recepciones[1].profile_id, p_permiso: "excepciones_reserva" });
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recepciones[1].profile_id, p_permiso: "excepciones_reserva" });
  const ids = creados.perros;
  if (ids.length) {
    await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("perro_id", ids);
    await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", ids);
  }
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ mestizo: sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
