// Control de concurrencia optimista (QA N43, 18 de octubre de 2026) — SOLO DESARROLLO, en Huellitas.
//
//   node scripts/auditoria/concurrencia-dev.mjs            (base + pantallas; necesita `next start` en el 3001)
//   SOLO=base node scripts/auditoria/concurrencia-dev.mjs  (solo la base)
//
// Dos sesiones reales (JWT de dos personas del personal) editan el MISMO registro de cada tipo: reserva y estancia
// (también por la función de mover fechas), cita de estética, cita y consulta veterinaria, cargo, cliente (y sus
// notas por función), mascota, vacuna, servicio, producto, precios de un servicio (que solo se insertan), empleado,
// permisos, perfil, políticas, horario y ajustes de Veterinaria. En cada uno:
//   - la segunda persona guarda con la versión que leyó: entra;
//   - la primera guarda con la versión VIEJA: la base no guarda (409 / PT409) y dice quién y qué cambió;
//   - guardar encima (forzar) entra y la bitácora lo anota como sobrescritura;
//   - la misma persona con una versión vieja de algo que solo ella cambió DESDE LA MISMA PESTAÑA: entra;
//   - N120: la misma persona desde OTRA pestaña (encabezado x-peludesk-pestana distinto): NO entra (PT409) y el
//     detalle dice `misma_persona` (el aviso: «Cambiaste … desde otra pestaña hace N s»);
//   - sin versión (otro camino que no la manda): entra igual que antes.
// Además: mover fechas con un total distinto al que se vio se rechaza, y las pantallas (dos navegadores) muestran el
// aviso con el nombre de quien cambió, «Recargar con sus cambios» y «Guardar los míos encima» con confirmación.
import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";
limpiarAlTerminar({ bitacoras: ["registro_ediciones"] }); // al terminar (también si falla) borra lo que esta corrida creó
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const comprobar = (c, t) => (c ? console.log(`  ✔ ${t}`) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);

const comoPersona = async (id) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });

// Dos admins del negocio (pueden editar todo); y la recepción para lo que se edita en el mostrador.
const { data: admins } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "admin").is("deleted_at", null).order("created_at");
const idUno = datos.adminB;
const idDos = admins.map((a) => a.profile_id).find((x) => x !== idUno);
if (!idDos) throw new Error("Huellitas necesita dos admins (corre negocio-prueba-dev.mjs).");
const uno = await comoPersona(idUno);
const dos = await comoPersona(idDos);
// El aviso nombra a quien cambió: la segunda persona necesita nombre (una cuenta de prueba puede no traerlo).
let { data: quienDos } = await SB.rpc("nombre_de_persona", { p_profile: idDos, p_vacio: null });
if (!quienDos) {
  await A.from("profiles").update({ nombre_completo: "Admin Dos Huellitas" }).eq("id", idDos);
  ({ data: quienDos } = await SB.rpc("nombre_de_persona", { p_profile: idDos, p_vacio: null }));
}
if (!quienDos) throw new Error("La segunda persona sigue sin nombre.");

const enc = (versiones, forzar = false) => ({ "x-peludesk-version": JSON.stringify(versiones), ...(forzar ? { "x-peludesk-forzar": "1" } : {}) });
const conEnc = (b, h) => {
  for (const [k, v] of Object.entries(h)) b.setHeader(k, v);
  return b;
};
const ultimaEdicion = async (tabla, id) =>
  (await SB.from("registro_ediciones").select("profile_id, sobrescribio, cambios").eq("negocio_id", B).eq("tabla", tabla).eq("registro_id", id).order("ultimo_at", { ascending: false }).limit(1).maybeSingle()).data;

/**
 * Un caso de UPDATE directo. `filtro` = columna por la que se elige la fila (id, o negocio_id en la configuración de
 * una fila por negocio); `clave` = el id que va en la versión (el del registro o el del negocio).
 */
async function caso({ nombre, tabla, id, campo, valor1, valor2, filtro = "id", clave = id, escribir, sinComparar = false }) {
  const w = escribir ?? ((cli, valor) => cli.from(tabla).update({ [campo]: valor }).eq(filtro, id).select("updated_at"));
  const ok = (r) => !r.error && (escribir ? true : r.data?.length);
  console.log(`\n· ${nombre}`);
  const { data: fila, error: e0 } = await SB.from(tabla).select(`updated_at, ${campo}`).eq(filtro, id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (e0 || !fila) return hallazgo(`${nombre}: no se pudo leer (${e0?.message ?? "sin fila"})`);
  const original = fila[campo];
  const v0 = fila.updated_at;
  const ver = [{ t: tabla, i: clave, v: v0 }];
  try {
    const r2 = await conEnc(w(dos, valor2), enc(ver));
    comprobar(ok(r2), `${nombre}: la segunda persona guarda con lo que leyó${r2.error ? ` (${r2.error.message})` : ""}`);
    const r1 = await conEnc(w(uno, valor1), enc(ver));
    comprobar(r1.status === 409 && r1.error?.code === "PT409", `${nombre}: con la versión vieja NO se guarda (409 PT409; llegó ${r1.status} ${r1.error?.code ?? "sin error"})`);
    let det = {};
    try { det = JSON.parse(r1.error?.details ?? "{}"); } catch { det = {}; }
    comprobar(!quienDos || det.quien === quienDos, `${nombre}: el aviso dice quién cambió (${det.quien ?? "—"})`);
    comprobar(det.cambios && Object.keys(det.cambios).includes(campo), `${nombre}: el aviso dice qué cambió (${Object.keys(det.cambios ?? {}).join(", ") || "—"})`);
    const { data: tras } = await SB.from(tabla).select(campo).eq(filtro, id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const igual = (a, b) => (a && b && !Number.isNaN(Date.parse(a)) && /\d{4}-\d{2}-\d{2}T/.test(String(a)) ? Date.parse(a) === Date.parse(b) : JSON.stringify(a) === JSON.stringify(b) || String(a) === String(b));
    if (!sinComparar) comprobar(igual(tras?.[campo], valor2), `${nombre}: lo de la segunda persona sigue ahí`);
    const rf = await conEnc(w(uno, valor1), enc(ver, true));
    comprobar(ok(rf), `${nombre}: «guardar encima» entra${rf.error ? ` (${rf.error.message})` : ""}`);
    const ed = await ultimaEdicion(tabla, clave);
    comprobar(ed?.sobrescribio === true && ed?.profile_id === idUno, `${nombre}: la bitácora anota la sobrescritura y quién`);
    // La misma persona con una versión vieja de lo que SOLO ella cambió después (otra pestaña): no es conflicto.
    const { data: f1 } = await SB.from(tabla).select("updated_at").eq(filtro, id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    await new Promise((r) => setTimeout(r, 30));
    await w(uno, valor2);
    const rm = await conEnc(w(uno, valor1), enc([{ t: tabla, i: clave, v: f1.updated_at }]));
    comprobar(!rm.error, `${nombre}: la misma persona con una versión vieja de sus propios cambios entra${rm.error ? ` (${rm.error.code})` : ""}`);
    const rs = await w(uno, valor2);
    comprobar(!rs.error, `${nombre}: sin versión entra como siempre`);
    // N120: el control es por versión, no por persona. La misma persona en la pestaña A guarda; la pestaña B, con la
    // versión de antes, NO guarda y el detalle dice que fue ella misma; la pestaña A, con esa misma versión, sí.
    const pestanaA = crypto.randomUUID();
    const pestanaB = crypto.randomUUID();
    const { data: f2 } = await SB.from(tabla).select("updated_at").eq(filtro, id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const verVieja = [{ t: tabla, i: clave, v: f2.updated_at }];
    await new Promise((r) => setTimeout(r, 30));
    await conEnc(w(uno, valor1), { "x-peludesk-pestana": pestanaA });
    const rB = await conEnc(w(uno, valor2), { ...enc(verVieja), "x-peludesk-pestana": pestanaB });
    comprobar(rB.error?.code === "PT409", `${nombre}: la misma persona desde OTRA pestaña con la versión vieja NO guarda (${rB.error?.code ?? "entró"})`);
    let detB = {};
    try { detB = JSON.parse(rB.error?.details ?? "{}"); } catch { detB = {}; }
    comprobar(detB.misma_persona === true, `${nombre}: el detalle dice que la cambió la misma persona (misma_persona ${detB.misma_persona})`);
    const rA = await conEnc(w(uno, valor2), { ...enc(verVieja), "x-peludesk-pestana": pestanaA });
    comprobar(!rA.error, `${nombre}: desde la MISMA pestaña con esa versión entra${rA.error ? ` (${rA.error.code})` : ""}`);
  } finally {
    await SB.from(tabla).update({ [campo]: original }).eq(filtro, id);
  }
}

let medicoTemporal = null;
const creadas = [];
/** Una reserva de hotel propia de la prueba, lejos en el futuro (se cancela al terminar). */
async function crearHotel(desfase) {
  const serv = (await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "hotel_noche").is("deleted_at", null).maybeSingle()).data;
  if (!serv) throw new Error("Huellitas no tiene el servicio hotel_noche");
  const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const { data: res, error: er } = await uno.from("reservas").insert({ cliente_id: datos.clienteSoloB, notas: `Prueba concurrencia ${sufijo}` }).select("id").single();
  if (er) throw new Error(`reserva: ${er.message}`);
  // Entrada lunes a miércoles: la salida (y la salida movida un par de días) cae en día que abre.
  let base = 200 + desfase + (Number(sufijo) % 100) * 4;
  while (![1, 2].includes(new Date(Date.now() + base * 86400000).getUTCDay())) base++;
  const { data: e, error: ee } = await uno.from("estancias").insert({
    reserva_id: res.id, perro_id: datos.perroSoloB, servicio_id: serv.id, fecha_entrada: dia(base), fecha_salida: dia(base + 2),
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba concurrencia", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba concurrencia",
  }).select("id, reserva_id").single();
  if (ee) throw new Error(`estancia: ${ee.message}`);
  creadas.push(e.id);
  return e;
}
const uno1 = async (tabla, sel, f = (q) => q) => (await f(SB.from(tabla).select(sel).eq("negocio_id", B)).limit(1).maybeSingle()).data;

try {
  console.log("1. Cada tipo de registro, con dos sesiones");
  const estancia = await uno1("estancias", "id, reserva_id, fecha_entrada, fecha_salida, servicios(categoria)", (q) => q.eq("estado", "reservada").is("deleted_at", null).gte("fecha_entrada", new Date().toISOString().slice(0, 10)).order("fecha_entrada"));
  if (estancia) {
    await caso({ nombre: "Estancia", tabla: "estancias", id: estancia.id, campo: "notas", valor1: `Uno ${sufijo}`, valor2: `Dos ${sufijo}` });
    await caso({ nombre: "Reserva", tabla: "reservas", id: estancia.reserva_id, campo: "notas", valor1: `Uno ${sufijo}`, valor2: `Dos ${sufijo}` });
  } else hallazgo("No hay una estancia reservada en Huellitas para probar.");
  const cita = await uno1("citas_estetica", "id", (q) => q.eq("estado", "reservada").is("deleted_at", null));
  if (cita) await caso({ nombre: "Cita de estética", tabla: "citas_estetica", id: cita.id, campo: "notas", valor1: `Uno ${sufijo}`, valor2: `Dos ${sufijo}` });
  let medicosVivos = ((await SB.from("medicos_veterinarios").select("id").eq("negocio_id", B).is("deleted_at", null)).data ?? []).map((m) => m.id);
  if (!medicosVivos.length) {
    // Otras auditorías dan de baja a sus médicos al terminar: esta designa uno temporal y lo da de baja al final.
    const { data: m, error: em } = await SB.from("medicos_veterinarios").insert({ negocio_id: B, profile_id: idUno, cedula_profesional: `PRUEBA-${sufijo}` }).select("id").single();
    if (em) hallazgo(`No se pudo designar un médico temporal (${em.message})`);
    else {
      medicoTemporal = m.id;
      medicosVivos = [m.id];
    }
  }
  const vcita = medicosVivos.length
    ? await uno1("vet_citas", "id, inicia_at, medico_id", (q) => q.eq("estado", "programada").gt("inicia_at", new Date().toISOString()).order("inicia_at", { ascending: false }))
    : null;
  if (vcita && !medicosVivos.includes(vcita.medico_id)) vcita.medico_id = medicosVivos[0];
  if (!vcita) hallazgo("No hay una cita veterinaria programada con médico vigente en Huellitas.");
  if (vcita)
    await caso({
      nombre: "Cita veterinaria (por vet_reprogramar_cita)", tabla: "vet_citas", id: vcita.id, campo: "termina_at", valor1: 50, valor2: 40, sinComparar: true,
      escribir: (cli, dur) => cli.rpc("vet_reprogramar_cita", { p_id: vcita.id, p_inicia: vcita.inicia_at, p_medico: vcita.medico_id, p_duracion_min: dur }),
    });
  const consulta = await uno1("vet_consultas", "id", (q) => q.eq("estado", "borrador").is("deleted_at", null));
  if (consulta) {
    // La consulta se escribe por su función: la versión viaja igual.
    console.log("\n· Consulta veterinaria (borrador, por vet_consulta_guardar)");
    const { data: c0 } = await SB.from("vet_consultas").select("updated_at, motivo").eq("id", consulta.id).single();
    const ver = [{ t: "vet_consultas", i: consulta.id, v: c0.updated_at }];
    const g2 = await conEnc(dos.rpc("vet_consulta_guardar", { p_id: consulta.id, p_datos: { motivo: `Dos ${sufijo}` } }), enc(ver));
    comprobar(!g2.error, `Consulta: la segunda persona guarda${g2.error ? ` (${g2.error.message})` : ""}`);
    const g1 = await conEnc(uno.rpc("vet_consulta_guardar", { p_id: consulta.id, p_datos: { motivo: `Uno ${sufijo}` } }), enc(ver));
    comprobar(g1.error?.code === "PT409", `Consulta: con la versión vieja NO se guarda por la función (${g1.error?.code ?? "sin error"})`);
    await SB.from("vet_consultas").update({ motivo: c0.motivo }).eq("id", consulta.id);
  }
  const cargo = await uno1("cargos_aplicados", "id", (q) => q.is("deleted_at", null).eq("cancelado", false));
  if (cargo) await caso({ nombre: "Cargo", tabla: "cargos_aplicados", id: cargo.id, campo: "notas", valor1: `Uno ${sufijo}`, valor2: `Dos ${sufijo}` });
  await caso({ nombre: "Cliente", tabla: "clientes", id: datos.clienteSoloB, campo: "email", valor1: `uno${sufijo}@ejemplo.mx`, valor2: `dos${sufijo}@ejemplo.mx` });
  await caso({ nombre: "Mascota", tabla: "perros", id: datos.perroSoloB, campo: "alimentacion_notas", valor1: `Uno ${sufijo}`, valor2: `Dos ${sufijo}` });
  {
    // Una vacuna no se edita: solo se anula (por anular_registro_carnet). Dos personas anulando la misma con lo que leyeron.
    console.log("\n· Vacuna (anular, por anular_registro_carnet)");
    const base = await uno1("carnet_vacunas", "perro_id, medico_id", (q) => q.not("medico_id", "is", null));
    if (base) {
      const hoy = new Date().toISOString().slice(0, 10);
      const { data: v, error: ev } = await SB.from("carnet_vacunas").insert({ negocio_id: B, perro_id: base.perro_id, medico_id: base.medico_id, biologico: `Prueba concurrencia ${sufijo}`, fecha_aplicacion: hoy, vigente_hasta: hoy }).select("id, updated_at").single();
      if (ev) hallazgo(`Vacuna: no se pudo crear la de prueba (${ev.message})`);
      else {
        const ver = [{ t: "carnet_vacunas", i: v.id, v: v.updated_at }];
        const r2 = await conEnc(dos.rpc("anular_registro_carnet", { p_tipo: "vacuna", p_id: v.id, p_motivo: `Dos ${sufijo}` }), enc(ver));
        comprobar(!r2.error, `Vacuna: la segunda persona la anula${r2.error ? ` (${r2.error.message})` : ""}`);
        const r1 = await conEnc(uno.rpc("anular_registro_carnet", { p_tipo: "vacuna", p_id: v.id, p_motivo: `Uno ${sufijo}` }), enc(ver));
        comprobar(!!r1.error, `Vacuna: la primera, con la pantalla vieja, no la vuelve a anular (${r1.error?.code ?? "entró"}: ${r1.error?.message ?? ""})`);
        const { data: va } = await SB.from("carnet_vacunas").select("anulada_motivo").eq("id", v.id).single();
        comprobar(va.anulada_motivo === `Dos ${sufijo}`, "Vacuna: queda el motivo de quien la anuló primero");
      }
    }
  }
  const servicio = await uno1("servicios", "id", (q) => q.is("deleted_at", null).eq("categoria", "estetica"));
  if (servicio) await caso({ nombre: "Servicio", tabla: "servicios", id: servicio.id, campo: "no_incluye", valor1: `Uno ${sufijo}`, valor2: `Dos ${sufijo}` });
  const insumo = await uno1("insumos", "id", (q) => q.is("deleted_at", null).eq("controla_lotes", false));
  if (insumo) await caso({ nombre: "Producto de inventario", tabla: "insumos", id: insumo.id, campo: "presentacion", valor1: `Uno ${sufijo}`, valor2: `Dos ${sufijo}` });
  const empleado = await uno1("empleados", "id", (q) => q.is("deleted_at", null).is("fecha_baja", null));
  if (empleado) await caso({ nombre: "Empleado", tabla: "empleados", id: empleado.id, campo: "notas", valor1: `Uno ${sufijo}`, valor2: `Dos ${sufijo}` });
  const permiso = await uno1("permisos_staff", "id, revocado_at", (q) => q.not("revocado_at", "is", null));
  if (permiso) await caso({ nombre: "Permiso", tabla: "permisos_staff", id: permiso.id, campo: "revocado_at", valor1: new Date(Date.now() - 60000).toISOString(), valor2: new Date(Date.now() - 120000).toISOString() });
  {
    const { data: pol } = await SB.from("negocio_politicas").select("textos").eq("negocio_id", B).maybeSingle();
    const base = pol?.textos ?? {};
    const clave0 = Object.keys(base)[0] ?? "cancelaciones";
    await caso({
      nombre: "Políticas del negocio (por guardar_politicas_negocio)", tabla: "negocio_politicas", id: B, filtro: "negocio_id", campo: "textos",
      valor1: { ...base, [clave0]: `Uno ${sufijo}` }, valor2: { ...base, [clave0]: `Dos ${sufijo}` },
      escribir: (cli, valor) => cli.rpc("guardar_politicas_negocio", { p_textos: valor }),
    });
  }
  {
    const { data: aj } = await uno.rpc("veterinaria_ajustes_actuales");
    const params = (dias) => ({
      p_recordatorios_activos: Boolean(aj?.recordatorios_activos), p_dias_anticipacion: dias, p_certificado_vigencia_dias: aj?.certificado_vigencia_dias ?? 30,
      p_carnet_reemplaza_comprobante: Boolean(aj?.carnet_reemplaza_comprobante), p_precio_dia: aj?.hospitalizacion_precio_dia ?? null,
    });
    await caso({
      nombre: "Ajustes de Veterinaria (por guardar_veterinaria_ajustes)", tabla: "veterinaria_ajustes", id: B, filtro: "negocio_id", campo: "dias_anticipacion",
      valor1: 9, valor2: 8, escribir: (cli, valor) => cli.rpc("guardar_veterinaria_ajustes", params(valor)),
    });
  }
  await caso({ nombre: "Cupo y teléfono de recepción", tabla: "cupo_configuracion", id: B, filtro: "negocio_id", campo: "base_direccion", valor1: `Uno ${sufijo}`, valor2: `Dos ${sufijo}` });

  console.log("\n2. Por las funciones (RPC) que usan las pantallas");
  const hotel = await crearHotel(0).catch((e) => (hallazgo(`No se pudo crear la reserva de hotel de prueba (${e.message})`), null));

  if (hotel) {
    const estancia = hotel;
    const { data: e0 } = await SB.from("estancias").select("updated_at, fecha_entrada, fecha_salida").eq("id", estancia.id).single();
    const ver = [{ t: "estancias", i: estancia.id, v: e0.updated_at }];
    const masUno = (f) => new Date(new Date(`${f}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
    const esGuarderia = estancia.servicios?.categoria === "guarderia";
    const nuevaSalida = esGuarderia ? e0.fecha_salida : masUno(e0.fecha_salida);
    const { data: vista } = await uno.rpc("estancia_cotizar_fechas", { p_estancia_id: estancia.id, p_entrada: e0.fecha_entrada, p_salida: nuevaSalida });
    comprobar(vista && !vista.error && vista.total_despues !== undefined, `Mover fechas: la vista previa da el total ANTES de guardar (${vista?.total_antes} → ${vista?.total_despues}${vista?.error ? `; ${vista.error}` : ""})`);
    const { data: e1 } = await SB.from("estancias").select("fecha_entrada, fecha_salida").eq("id", estancia.id).single();
    comprobar(e1.fecha_salida === e0.fecha_salida, "Mover fechas: la vista previa no cambia nada");
    if (!esGuarderia && vista && !vista.error) {
      const mal = await uno.rpc("estancia_mover_fechas", { p_estancia_id: estancia.id, p_entrada: e0.fecha_entrada, p_salida: nuevaSalida, p_total_visto: Number(vista.total_despues) + 50 });
      comprobar(mal.error?.hint === "total_distinto", `Mover fechas: con un total distinto al que se vio no se guarda (${mal.error?.hint ?? mal.error?.message ?? "entró"})`);
      await conEnc(dos.from("estancias").update({ notas: `Dos ${sufijo}` }).eq("id", estancia.id), enc(ver));
      const viejo = await conEnc(uno.rpc("estancia_mover_fechas", { p_estancia_id: estancia.id, p_entrada: e0.fecha_entrada, p_salida: nuevaSalida, p_total_visto: Number(vista.total_despues) }), enc(ver));
      comprobar(viejo.error?.code === "PT409", `Mover fechas: con la versión vieja la función tampoco guarda (${viejo.error?.code ?? "entró"})`);
      const { data: e2 } = await SB.from("estancias").select("fecha_salida").eq("id", estancia.id).single();
      comprobar(e2.fecha_salida === e0.fecha_salida, "Mover fechas: las fechas no se movieron");
    }
  }
  {
    let { data: n0 } = await SB.from("clientes_notas_internas").select("updated_at, notas").eq("cliente_id", datos.clienteSoloB).maybeSingle();
    if (!n0) {
      await uno.rpc("cliente_notas_guardar", { p_cliente: datos.clienteSoloB, p_notas: "Notas de prueba" });
      ({ data: n0 } = await SB.from("clientes_notas_internas").select("updated_at, notas").eq("cliente_id", datos.clienteSoloB).maybeSingle());
    }
    if (n0) {
      const ver = [{ t: "clientes_notas_internas", i: datos.clienteSoloB, v: n0.updated_at }];
      await conEnc(dos.rpc("cliente_notas_guardar", { p_cliente: datos.clienteSoloB, p_notas: `Dos ${sufijo}` }), enc(ver));
      const r = await conEnc(uno.rpc("cliente_notas_guardar", { p_cliente: datos.clienteSoloB, p_notas: `Uno ${sufijo}` }), enc(ver));
      comprobar(r.error?.code === "PT409", `Notas internas del cliente por su función: versión vieja no guarda (${r.error?.code ?? "entró"})`);
      await SB.from("clientes_notas_internas").update({ notas: n0.notas }).eq("cliente_id", datos.clienteSoloB);
    } else console.log("  · (el cliente no tiene notas internas: se salta)");
  }
  {
    const { data: hv } = await SB.from("horario_semana").select("updated_at").eq("negocio_id", B).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const { data: dias } = await uno.rpc("horario_semana_vigente");
    if (hv && dias?.length) {
      const ver = [{ t: "horario_semana", i: B, v: hv.updated_at }];
      const p = dias.map((d) => ({ dia_semana: d.dia_semana, hora_apertura: d.hora_apertura, hora_cierre: d.hora_cierre }));
      const r2 = await conEnc(dos.rpc("guardar_horario_semana", { p_dias: p }), enc(ver));
      const r1 = await conEnc(uno.rpc("guardar_horario_semana", { p_dias: p }), enc(ver));
      comprobar(!r2.error && r1.error?.code === "PT409", `Horario del negocio: la segunda guarda y la vieja no (${r2.error?.message ?? "ok"} / ${r1.error?.code ?? "entró"})`);
    }
  }
  {
    // Precios de un servicio: solo se insertan; el «registro» es la lista de precios.
    const serv = (await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "cargo").eq("monto_libre", false).is("deleted_at", null).limit(1).maybeSingle()).data;
    if (serv) {
      const ultima = (await SB.from("tarifas").select("created_at").eq("servicio_id", serv.id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.created_at ?? "-infinity";
      const ver = [{ t: "precios_servicio", i: serv.id, v: ultima }];
      const fila = (precio) => ({ servicio_id: serv.id, cantidad_desde: 1, cantidad_hasta: null, vigencia_desde: "2099-01-01", precio, no_aplica: false });
      const r2 = await conEnc(dos.from("tarifas").insert(fila(111)).select("id"), enc(ver));
      const r1 = await conEnc(uno.from("tarifas").insert({ ...fila(222), vigencia_desde: "2099-01-02" }).select("id"), enc(ver));
      comprobar(!r2.error && r1.error?.code === "PT409", `Precios de un servicio: la segunda captura entra y la de la versión vieja no (${r2.error?.message ?? "ok"} / ${r1.error?.code ?? "entró"})`);
      let det = {};
      try { det = JSON.parse(r1.error?.details ?? "{}"); } catch { det = {}; }
      comprobar(!quienDos || det.quien === quienDos, `Precios: dice quién capturó (${det.quien ?? "—"})`);
      const rf = await conEnc(uno.from("tarifas").insert({ ...fila(222), vigencia_desde: "2099-01-02" }).select("id"), enc(ver, true));
      comprobar(!rf.error, "Precios: guardar encima entra");
      await SB.from("tarifas").delete().eq("servicio_id", serv.id).gte("vigencia_desde", "2099-01-01");
    }
  }
  if (empleado) {
    // Horario y esquema de pago del empleado: se guardan como filas nuevas; la versión es la del conjunto.
    const ultima = async (tabla) => (await SB.from(tabla).select("updated_at").eq("empleado_id", empleado.id).order("updated_at", { ascending: false }).limit(1).maybeSingle()).data?.updated_at ?? "-infinity";
    const detalleDe = (r) => { try { return JSON.parse(r.error?.details ?? "{}"); } catch { return {}; } };

    console.log("\n· Horario del empleado (por guardar_horario_empleado)");
    const { data: horOrig } = await SB.from("empleados_horario").select("dia_semana, hora_entrada, hora_salida").eq("empleado_id", empleado.id).is("deleted_at", null);
    const horario = (salida) => [1, 2, 3].map((d) => ({ dia_semana: d, hora_entrada: "09:00", hora_salida: salida }));
    const guardarH = (cli, salida, ver, forzar = false) => conEnc(cli.rpc("guardar_horario_empleado", { p_empleado_id: empleado.id, p_dias: horario(salida) }), enc(ver, forzar));
    try {
      const verH = [{ t: "horario_empleado", i: empleado.id, v: await ultima("empleados_horario") }];
      const h2 = await guardarH(dos, "17:00", verH);
      comprobar(!h2.error, `Horario: la segunda persona guarda con lo que leyó${h2.error ? ` (${h2.error.message})` : ""}`);
      const h1 = await guardarH(uno, "18:00", verH);
      comprobar(h1.error?.code === "PT409", `Horario: con la versión vieja NO se guarda (${h1.error?.code ?? "entró"})`);
      comprobar(detalleDe(h1).quien === quienDos, `Horario: el aviso dice quién cambió (${detalleDe(h1).quien ?? "—"})`);
      const { data: hVivo } = await SB.from("empleados_horario").select("hora_salida").eq("empleado_id", empleado.id).is("deleted_at", null).limit(1).maybeSingle();
      comprobar(String(hVivo?.hora_salida).startsWith("17:00"), "Horario: se quedó lo de la otra persona");
      const hf = await guardarH(uno, "18:00", verH, true);
      comprobar(!hf.error, `Horario: «guardar encima» entra${hf.error ? ` (${hf.error.message})` : ""}`);
      const verPropio = [{ t: "horario_empleado", i: empleado.id, v: await ultima("empleados_horario") }];
      await new Promise((r) => setTimeout(r, 30));
      await guardarH(uno, "18:30", verPropio);
      const hm = await guardarH(uno, "19:00", verPropio);
      comprobar(!hm.error, `Horario: la misma persona con una versión vieja de sus propios cambios entra${hm.error ? ` (${hm.error.code})` : ""}`);
      const hs = await uno.rpc("guardar_horario_empleado", { p_empleado_id: empleado.id, p_dias: horario("17:30") });
      comprobar(!hs.error, "Horario: sin versión entra como siempre");
    } finally {
      await uno.rpc("guardar_horario_empleado", { p_empleado_id: empleado.id, p_dias: (horOrig ?? []).map((h) => ({ dia_semana: h.dia_semana, hora_entrada: String(h.hora_entrada).slice(0, 5), hora_salida: String(h.hora_salida).slice(0, 5) })) });
    }

    console.log("\n· Esquema de pago del empleado (esquemas_pago)");
    const esquema = (monto, dia) => ({ empleado_id: empleado.id, vigente_desde: `2099-0${dia}-01`, sueldo_monto: monto, sueldo_periodicidad: "quincenal", con_comision: false, recibe_propinas: false, notas: `Prueba concurrencia ${sufijo}` });
    const guardarE = (cli, monto, dia, ver, forzar = false) => conEnc(cli.from("esquemas_pago").insert(esquema(monto, dia)).select("id"), enc(ver, forzar));
    try {
      const verE = [{ t: "esquemas_empleado", i: empleado.id, v: await ultima("esquemas_pago") }];
      const e2 = await guardarE(dos, 5000, 1, verE);
      comprobar(!e2.error, `Esquema: la segunda persona guarda con lo que leyó${e2.error ? ` (${e2.error.message})` : ""}`);
      const e1 = await guardarE(uno, 6000, 2, verE);
      comprobar(e1.error?.code === "PT409", `Esquema: con la versión vieja NO se guarda (${e1.error?.code ?? "entró"})`);
      comprobar(detalleDe(e1).quien === quienDos, `Esquema: el aviso dice quién cambió (${detalleDe(e1).quien ?? "—"})`);
      const ef = await guardarE(uno, 6000, 2, verE, true);
      comprobar(!ef.error, `Esquema: «guardar encima» entra${ef.error ? ` (${ef.error.message})` : ""}`);
      const verPropio = [{ t: "esquemas_empleado", i: empleado.id, v: await ultima("esquemas_pago") }];
      await new Promise((r) => setTimeout(r, 30));
      await guardarE(uno, 6500, 3, verPropio);
      const em = await guardarE(uno, 7000, 4, verPropio);
      comprobar(!em.error, `Esquema: la misma persona con una versión vieja de sus propios cambios entra${em.error ? ` (${em.error.code})` : ""}`);
      const es = await uno.from("esquemas_pago").insert(esquema(7500, 5)).select("id");
      comprobar(!es.error, "Esquema: sin versión entra como siempre");
    } finally {
      const borrar = await SB.from("esquemas_pago").delete().eq("empleado_id", empleado.id).like("notas", `Prueba concurrencia ${sufijo}`);
      if (borrar.error) await SB.from("esquemas_pago").update({ deleted_at: new Date().toISOString() }).eq("empleado_id", empleado.id).like("notas", `Prueba concurrencia ${sufijo}`);
    }
  }
  {
    // QA R41: «Guardar los míos encima» dice exactamente qué pasa. La base calcula en el conflicto qué campos de la otra
    // persona pisaría este guardado (sustituye) y cuáles deja (conserva); la pantalla lo dice con esos datos.
    console.log("\n3b. QA R41: qué sustituye y qué conserva «guardar encima»");
    const { textoGuardarEncima, textoSiGuardasEncima, conflictoDeError } = await import("../../src/lib/concurrencia/tipos.ts");
    const tel = `56${String(Date.now()).slice(-8)}`;
    const { data: cg, error: ecg } = await SB.from("clientes").insert({ nombre: `Encima ${sufijo}`, telefono: tel, email: `encima-${sufijo}@ejemplo.mx` }).select("id, updated_at").single();
    if (ecg) hallazgo(`cliente de prueba: ${ecg.message}`);
    else {
      try {
        const ver = [{ t: "clientes", i: cg.id, v: cg.updated_at }];
        // La otra persona cambia el correo (como la recepción que reprograma la cita).
        await conEnc(dos.from("clientes").update({ email: `otro-${sufijo}@ejemplo.mx` }).eq("id", cg.id), enc(ver));
        // a) Una acción que solo escribe lo suyo (como «Corregir servicio»): cambia el nombre y no toca el correo.
        const r1 = await conEnc(uno.from("clientes").update({ nombre: `Encima ${sufijo} nuevo` }).eq("id", cg.id), enc(ver));
        const c1 = conflictoDeError(r1.error);
        comprobar(c1 && Object.keys(c1.mios ?? {}).includes("nombre") && (c1.conserva ?? []).includes("email") && !Object.keys(c1.sustituye ?? {}).length,
          `solo lo suyo: mios = nombre, conserva = correo (${JSON.stringify({ mios: Object.keys(c1?.mios ?? {}), conserva: c1?.conserva, sustituye: Object.keys(c1?.sustituye ?? {}) })})`);
        const t1 = c1 ? textoGuardarEncima(c1) : "";
        comprobar(/Se guarda tu cambio de nombre\./.test(t1) && new RegExp(`Lo que puso ${quienDos} en correo se conserva\\.`).test(t1) && !/se pierden|sustituye/.test(t1), `texto: «${t1}»`);
        // b) El formulario completo (como la ficha del cliente): manda también el correo que leyó, y ese sí se pisa.
        const r2 = await conEnc(uno.from("clientes").update({ nombre: `Encima ${sufijo} nuevo`, email: `encima-${sufijo}@ejemplo.mx` }).eq("id", cg.id), enc(ver));
        const c2 = conflictoDeError(r2.error);
        comprobar(c2 && Object.keys(c2.sustituye ?? {}).includes("email") && Object.keys(c2.mios ?? {}).includes("nombre"), `formulario completo: sustituye = correo (${JSON.stringify(Object.keys(c2?.sustituye ?? {}))})`);
        const t2 = c2 ? textoGuardarEncima(c2) : "";
        comprobar(new RegExp(`Lo que puso ${quienDos} en correo se sustituye por lo de esta pantalla\\.`).test(t2), `texto: «${t2}»`);
        // Y lo que dijo es lo que pasa: con «guardar encima», a) conserva el correo de la otra persona.
        const rf = await conEnc(uno.from("clientes").update({ nombre: `Encima ${sufijo} nuevo` }).eq("id", cg.id), enc(ver, true));
        const { data: tras } = await SB.from("clientes").select("nombre, email").eq("id", cg.id).single();
        comprobar(!rf.error && tras.nombre === `Encima ${sufijo} nuevo` && tras.email === `otro-${sufijo}@ejemplo.mx`, `«guardar encima» de a) deja los dos cambios (${tras.nombre} · ${tras.email})`);
        // Misma persona en otra pestaña: «Lo que pusiste en la otra pestaña…».
        const t3 = textoGuardarEncima({ ...c1, mismaPersona: true });
        comprobar(/Lo que pusiste en la otra pestaña en correo se conserva\./.test(t3), `misma persona: «${t3}»`);
        // Un conjunto (horario del empleado, precios) se reemplaza completo y lo dice.
        const t4 = textoGuardarEncima({ tabla: "horario_empleado", id: "x", quien: quienDos, cuando: null, cambios: {}, versionActual: null });
        comprobar(/Se guarda lo de esta pantalla completo y se sustituye lo que capturó/.test(t4), `conjunto: «${t4}»`);
        // QA S31: el primer aviso ya dice lo mismo, en condicional y con el mismo cálculo.
        const s1 = textoSiGuardasEncima(c1);
        comprobar(s1 === `Si guardas los tuyos encima: se guardaría tu cambio de nombre. Lo que puso ${quienDos} en correo se conservaría.`, `primer aviso, solo lo suyo: «${s1}»`);
        const s2 = c2 ? textoSiGuardasEncima(c2) : "";
        comprobar(new RegExp(`Lo que puso ${quienDos} en correo se sustituiría por lo de esta pantalla\.`).test(s2), `primer aviso, formulario completo: «${s2}»`);
        const s4 = textoSiGuardasEncima({ tabla: "horario_empleado", id: "x", quien: quienDos, cuando: null, cambios: {}, versionActual: null });
        comprobar(/^Si guardas los tuyos encima: se guardaría lo de esta pantalla completo y se sustituiría lo que capturó/.test(s4), `primer aviso, conjunto: «${s4}»`);
      } finally {
        await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", cg.id);
      }
    }
  }
  {
    console.log("\n3. La llave anónima no lee la bitácora");
    const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
    const { data } = await anon.from("registro_ediciones").select("id").limit(1);
    comprobar(!data?.length, "Anónimo: registro_ediciones vacío");
  }

  if (process.env.SOLO !== "base") await pantallas().catch((e) => hallazgo(`las pantallas tronaron: ${e.message.split("\n")[0]}`));
} finally {
  // Baja lógica (cancelar exige un rol y con la llave de servicio fallaba callado: se acumulaban reservas vivas del
  // mismo perro y la fecha al azar terminaba chocando con estancias_perro_sin_traslape).
  if (creadas.length) await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).in("id", creadas).is("deleted_at", null);
  if (medicoTemporal) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", medicoTemporal);
  console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
  process.exitCode = hallazgos.length ? 1 : 0;
}

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

async function pantallas() {
  console.log("\n4. Pantallas: dos navegadores sobre el mismo cliente");
  const { abrirNavegador } = await import("../lib/navegador.mjs");
  const nav = await abrirNavegador();
  // Un cliente propio de la prueba (la ficha del cliente fijo de Huellitas carga lento con todo su residuo).
  const tel = `55${String(Date.now()).slice(-8)}`;
  const { data: cn, error: ecn } = await SB.from("clientes").insert({ nombre: `Concurrencia ${sufijo}`, telefono: tel }).select("id").single();
  if (ecn) throw new Error(`cliente de prueba: ${ecn.message}`);
  const clienteP = cn.id;
  const c0 = { nombre: `Concurrencia ${sufijo}`, email: null };
  const guardarCliente = (p) => p.locator('form:has(input[name="nombre"])').first().locator('button[type="submit"]').first().click();
  try {
    const ctxA = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctxA.addCookies(await cookiesDe(idUno));
    const ctxB = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctxB.addCookies(await cookiesDe(idDos));
    const pa = await ctxA.newPage();
    const pb = await ctxB.newPage();
    await pa.goto(`${BASE}/clientes/${clienteP}`, { waitUntil: "networkidle" });
    await pb.goto(`${BASE}/clientes/${clienteP}`, { waitUntil: "networkidle" });
    // La segunda persona guarda primero.
    await pb.locator('input[name="nombre"]').fill(`${c0.nombre} B`);
    await guardarCliente(pb);
    await pb.getByText("Cambios guardados").first().waitFor({ timeout: 30000 });
    // La primera, con su pantalla vieja.
    await pa.locator('input[name="nombre"]').fill(`${c0.nombre} A`);
    await guardarCliente(pa);
    const aviso = pa.locator("[data-conflicto-version]");
    await aviso.waitFor({ timeout: 30000 }).catch(() => {});
    comprobar(await aviso.isVisible(), "Cliente: la pantalla vieja NO guarda y enseña el aviso");
    const texto = (await pa.locator("[data-conflicto-texto]").textContent().catch(() => "")) ?? "";
    comprobar(!quienDos || texto.includes(quienDos), `Cliente: el aviso nombra a quien cambió («${texto.slice(0, 90)}»)`);
    comprobar(/¿Recargar con sus cambios o guardar los tuyos encima\?/.test(texto), "Cliente: el aviso pregunta recargar o guardar encima");
    comprobar((await pa.locator('input[name="nombre"]').inputValue()) === `${c0.nombre} A`, "Cliente: lo escrito sigue en el campo");
    let { data: cb } = await SB.from("clientes").select("nombre").eq("id", clienteP).single();
    comprobar(cb.nombre === `${c0.nombre} B`, "Cliente: en la base sigue lo de la otra persona");
    // QA S31: el primer aviso ya dice qué se conservaría y qué se sustituiría, y coincide con la confirmación.
    const siEncima = ((await pa.locator("[data-si-guardas-encima]").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    comprobar(/^Si guardas los tuyos encima: se guardaría/.test(siEncima) && /(se sustituiría|se conservaría|no se tocaría)/.test(siEncima), `Cliente: el primer aviso dice qué pasaría («${siEncima}»)`);
    await pa.locator("[data-guardar-encima]").click();
    const yaEncima = ((await pa.locator("[data-guardar-encima-texto]").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    const aCondicional = (s) => s.replace(/ Queda anotado quién lo hizo\.$/, "").replace(/\bse guarda(n?)\b/gi, (m, n) => `se guardaría${n}`).replace(/se sustituye/g, "se sustituiría").replace(/se conserva/g, "se conservaría").replace(/no se toca/g, "no se tocaría");
    comprobar(siEncima === `Si guardas los tuyos encima: ${aCondicional(yaEncima.charAt(0).toLowerCase() + yaEncima.slice(1))}`, `Cliente: el primer aviso y la confirmación dicen lo mismo («${yaEncima}» → «${siEncima}»)`);
    // Guardar encima pide confirmación.
    await pa.locator("[data-guardar-encima-confirmar]").click();
    await pa.waitForFunction(() => !document.querySelector("[data-conflicto-version]"), null, { timeout: 30000 }).catch(() => {});
    ({ data: cb } = await SB.from("clientes").select("nombre").eq("id", clienteP).single());
    comprobar(cb.nombre === `${c0.nombre} A`, "Cliente: «Sí, guardar los míos encima» guarda");
    const ed = await ultimaEdicion("clientes", clienteP);
    comprobar(ed?.sobrescribio === true, "Cliente: queda en la bitácora como sobrescritura");
    // Recargar trae lo de la otra persona.
    await pb.locator('input[name="nombre"]').fill(`${c0.nombre} B2`);
    await guardarCliente(pb);
    await pb.locator("[data-conflicto-version]").waitFor({ timeout: 30000 }).catch(() => {});
    comprobar(await pb.locator("[data-conflicto-version]").isVisible(), "Cliente: el otro navegador también ve el aviso");
    await Promise.all([pb.waitForLoadState("load"), pb.locator("[data-recargar-conflicto]").click()]);
    await pb.waitForTimeout(500);
    await pb.waitForLoadState("networkidle");
    comprobar((await pb.locator('input[name="nombre"]').inputValue()) === `${c0.nombre} A`, "Cliente: «Recargar con sus cambios» enseña lo de la otra persona");

    console.log("\n4a. N120: el mismo admin en dos pestañas del mismo navegador sobre el mismo cliente");
    {
      const p1 = await ctxA.newPage();
      const p2 = await ctxA.newPage();
      await p1.goto(`${BASE}/clientes/${clienteP}`, { waitUntil: "networkidle" });
      await p2.goto(`${BASE}/clientes/${clienteP}`, { waitUntil: "networkidle" });
      await p2.locator('input[name="nombre"]').fill(`${c0.nombre} Pestaña 2`);
      await guardarCliente(p2);
      await p2.getByText("Cambios guardados").first().waitFor({ timeout: 30000 });
      // La misma pestaña guarda otra vez con lo que ya devolvió el guardado: no es conflicto.
      await p2.locator('input[name="nombre"]').fill(`${c0.nombre} Pestaña 2b`);
      await guardarCliente(p2);
      // Se espera a que ese segundo guardado llegue a la base (o al aviso, si lo hubiera).
      let guardado2b = false;
      for (let i = 0; i < 40 && !guardado2b; i++) {
        guardado2b = (await SB.from("clientes").select("nombre").eq("id", clienteP).single()).data?.nombre === `${c0.nombre} Pestaña 2b`;
        if (!guardado2b && (await p2.locator("[data-conflicto-version]").isVisible().catch(() => false))) break;
        if (!guardado2b) await p2.waitForTimeout(500);
      }
      comprobar(guardado2b && !(await p2.locator("[data-conflicto-version]").isVisible().catch(() => false)), "Dos pestañas: la misma pestaña vuelve a guardar sin aviso");
      // La pestaña vieja.
      await p1.locator('input[name="nombre"]').fill(`${c0.nombre} Pestaña 1`);
      await guardarCliente(p1);
      const aviso1 = p1.locator("[data-conflicto-version]");
      await aviso1.waitFor({ timeout: 30000 }).catch(() => {});
      comprobar(await aviso1.isVisible(), "Dos pestañas: la pestaña vieja del MISMO admin NO guarda y enseña el aviso");
      const t1 = (await p1.locator("[data-conflicto-texto]").textContent().catch(() => "")) ?? "";
      comprobar(/^Cambiaste .+ desde otra pestaña hace/.test(t1), `Dos pestañas: el aviso dice «Cambiaste … desde otra pestaña hace …» («${t1.slice(0, 90)}»)`);
      comprobar(await p1.locator("[data-recargar-conflicto]").isVisible() && (await p1.locator("[data-guardar-encima]").isVisible()), "Dos pestañas: ofrece «Recargar con sus cambios» y «Guardar los míos encima»");
      const { data: cp } = await SB.from("clientes").select("nombre").eq("id", clienteP).single();
      comprobar(cp.nombre === `${c0.nombre} Pestaña 2b`, "Dos pestañas: en la base sigue lo de la otra pestaña");
      await p1.locator("[data-guardar-encima]").click();
      await p1.locator("[data-guardar-encima-confirmar]").click();
      await p1.waitForFunction(() => !document.querySelector("[data-conflicto-version]"), null, { timeout: 30000 }).catch(() => {});
      const { data: cp2 } = await SB.from("clientes").select("nombre").eq("id", clienteP).single();
      comprobar(cp2.nombre === `${c0.nombre} Pestaña 1`, "Dos pestañas: «Sí, guardar los míos encima» guarda");
      await p1.close();
      await p2.close();
    }

    console.log("\n4b. Pantallas: dos navegadores sobre el horario del mismo empleado");
    {
      const emp = (await SB.from("empleados").select("id").eq("negocio_id", B).is("deleted_at", null).is("fecha_baja", null).limit(1).maybeSingle()).data;
      if (!emp) hallazgo("No hay un empleado en Huellitas para la pantalla del horario.");
      else {
        const { data: horOrig } = await SB.from("empleados_horario").select("dia_semana, hora_entrada, hora_salida").eq("empleado_id", emp.id).is("deleted_at", null);
        try {
          await pa.goto(`${BASE}/empleados/${emp.id}`, { waitUntil: "networkidle" });
          await pb.goto(`${BASE}/empleados/${emp.id}`, { waitUntil: "networkidle" });
          const formH = (p) => p.locator("form", { has: p.getByRole("button", { name: "Guardar horario" }) }).first();
          await formH(pb).locator('input[name="entrada_1"]').fill("08:00");
          await formH(pb).locator('input[name="salida_1"]').fill("16:00");
          await formH(pb).getByRole("button", { name: "Guardar horario" }).click();
          await formH(pb).getByText(/Horario guardado/).first().waitFor({ timeout: 40000 }).catch(() => {});
          await formH(pa).locator('input[name="entrada_1"]').fill("10:00");
          await formH(pa).locator('input[name="salida_1"]').fill("18:00");
          await formH(pa).getByRole("button", { name: "Guardar horario" }).click();
          const avisoH = formH(pa).locator("[data-conflicto-version]");
          await avisoH.waitFor({ timeout: 40000 }).catch(() => {});
          comprobar(await avisoH.isVisible().catch(() => false), "Horario del empleado: la pantalla vieja no guarda y enseña el aviso");
          const tH = (await formH(pa).locator("[data-conflicto-texto]").textContent().catch(() => "")) ?? "";
          comprobar(tH.includes(quienDos) && /el horario de este empleado/.test(tH), `Horario del empleado: el aviso nombra a quien cambió («${tH.slice(0, 90)}»)`);
          const { data: h1 } = await SB.from("empleados_horario").select("hora_entrada").eq("empleado_id", emp.id).eq("dia_semana", 1).is("deleted_at", null).maybeSingle();
          comprobar(String(h1?.hora_entrada).startsWith("08:00"), "Horario del empleado: se quedó lo de la otra persona");
          await formH(pa).locator("[data-guardar-encima]").click();
          await formH(pa).locator("[data-guardar-encima-confirmar]").click();
          await formH(pa).getByText(/Horario guardado/).first().waitFor({ timeout: 40000 }).catch(() => {});
          const { data: h2 } = await SB.from("empleados_horario").select("hora_entrada").eq("empleado_id", emp.id).eq("dia_semana", 1).is("deleted_at", null).maybeSingle();
          comprobar(String(h2?.hora_entrada).startsWith("10:00"), "Horario del empleado: «Sí, guardar los míos encima» guarda");
        } finally {
          await uno.rpc("guardar_horario_empleado", { p_empleado_id: emp.id, p_dias: (horOrig ?? []).map((h) => ({ dia_semana: h.dia_semana, hora_entrada: String(h.hora_entrada).slice(0, 5), hora_salida: String(h.hora_salida).slice(0, 5) })) });
        }
      }
    }

    console.log("\n5. Pantallas: mover fechas con vista previa del total");
    const est = await crearHotel(10).catch((e) => (hallazgo(`No se pudo crear la reserva de hotel de prueba (${e.message})`), null));
    if (est) {
      const { data: e0 } = await SB.from("estancias").select("fecha_entrada, fecha_salida").eq("id", est.id).single();
      await pa.goto(`${BASE}/reservas/${est.reserva_id}`, { waitUntil: "networkidle" });
      await pb.goto(`${BASE}/reservas/${est.reserva_id}`, { waitUntil: "networkidle" });
      const abrir = async (p) => {
        await p.locator(`[data-estancia="${est.id}"] >> text=Mover fechas`).first().click().catch(async () => p.getByRole("button", { name: "Mover fechas" }).first().click());
        await p.locator("[data-mover-fechas]").waitFor();
      };
      await abrir(pa);
      await abrir(pb);
      const salidaNueva = (p) => p.locator("[data-mover-fechas] input[type=date]").last();
      const mas = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
      await salidaNueva(pb).fill(mas(e0.fecha_salida, 1));
      await pb.locator("[data-total-despues]").waitFor({ timeout: 20000 });
      comprobar(await pb.locator("[data-guardar-fechas]").isEnabled(), "Mover fechas: con la vista previa del total, «Guardar fechas» se activa");
      await pb.locator("[data-guardar-fechas]").click();
      await pb.waitForFunction(() => !document.querySelector("[data-mover-fechas]"), null, { timeout: 30000 }).catch(() => {});
      await salidaNueva(pa).fill(mas(e0.fecha_salida, 2));
      await pa.locator("[data-total-despues]").waitFor({ timeout: 20000 });
      await pa.locator("[data-guardar-fechas]").click();
      await pa.locator("[data-conflicto-version]").waitFor({ timeout: 30000 }).catch(() => {});
      const t = (await pa.locator("[data-conflicto-texto]").textContent().catch(() => "")) ?? "";
      comprobar(/salida/.test(t) && /total \$/.test(t), `Mover fechas: el aviso dice la salida y el total nuevos («${t.slice(0, 100)}»)`);
      const { data: e1 } = await SB.from("estancias").select("fecha_salida").eq("id", est.id).single();
      comprobar(e1.fecha_salida === mas(e0.fecha_salida, 1), "Mover fechas: se quedó lo de la otra persona");
      await uno.rpc("estancia_mover_fechas", { p_estancia_id: est.id, p_entrada: e0.fecha_entrada, p_salida: e0.fecha_salida, p_total_visto: null }).then(async (r) => {
        if (r.error) await SB.from("estancias").update({ fecha_salida: e0.fecha_salida }).eq("id", est.id);
      });
    } else hallazgo("No hay una estancia de hotel reservada en Huellitas para la pantalla de mover fechas.");
  } finally {
    await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", clienteP);
    await nav.close();
  }
}
