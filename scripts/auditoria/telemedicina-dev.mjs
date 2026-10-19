// Teleconsulta de Veterinaria, Fase 5 (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
// Migración 20261020000100.
//
//   node scripts/auditoria/telemedicina-dev.mjs
//
// 1. Quién agenda y prepara una teleconsulta; solo una cita de tipo Teleconsulta lleva sala.
// 2. La ventana: [inicia − 15 min, termina + 30 min]; la cita manda (reprogramar, cancelar).
// 3. Consentimiento: sin firma no se entra; la liga firma por el servidor.
// 4. Cobro anticipado: la sala solo abre con la cuenta en cero; no se toca ninguna tabla de cobros.
// 5. La liga: solo se guarda el sha256; una nueva anula la anterior; no muestra nada del expediente.
// 6. El médico entra con su sesión y los mismos candados.
// 7. Aislamiento: otro negocio, estética, cliente y llave anónima; módulo apagado.
import crypto from "node:crypto";
import { B, SB, LUDOGTEKA, datos, rpc, get, post, personas, dar, quitar, fijarModulo, comprobar, seccion, terminar, llamar, cab, URL } from "./veterinaria-comun-dev.mjs";

const P = await personas();
const MARCA = `tel-${String(Date.now()).slice(-6)}`;
const medicosCreados = [];
const token = () => { const t = crypto.randomBytes(32).toString("hex"); return { t, h: crypto.createHash("sha256").update(t).digest("hex") }; };
const PERMISOS = ["atender_teleconsultas", "atender_consultas"];
const limpiar = async () => { for (const p of PERMISOS) { await quitar(P.admin, P.recConId, p); await quitar(P.admin, P.recSinId, p); } };
const ajustesAntes = (await SB.from("veterinaria_ajustes").select("id, teleconsulta_cobro_anticipado, teleconsulta_precio").eq("negocio_id", B).is("deleted_at", null).maybeSingle()).data;
const cobrosAntes = (await SB.from("cobros").select("id", { count: "exact", head: true })).count;

try {
  await fijarModulo("veterinaria", true);
  await limpiar();
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
  comprobar(med.ok, `admin designa a la recepcionista como médico (${med.mensaje})`);
  medicosCreados.push(med.cuerpo);
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Tele ${MARCA}` }).select("id").single()).data.id;
  const cita = async (inicioMs, { tipo = "teleconsulta", token: t = P.recSin } = {}) => {
    const r = await rpc(t, "vet_agendar_cita", { p_perro: perro, p_tipo: tipo, p_medico: med.cuerpo, p_inicia: new Date(inicioMs).toISOString(), p_duracion_min: 30, p_motivo: `Revisión ${MARCA}` });
    if (!r.ok) throw new Error(`cita: ${r.mensaje}`);
    return r.cuerpo.id;
  };
  const crear = (t, c, h = token().h) => rpc(t, "vet_telemedicina_crear", { p_cita: c, p_proveedor: "simulado", p_sala_nombre: `sim-${MARCA}-${Math.random().toString(36).slice(2, 6)}`, p_sala_url: "simulada://x", p_token_hash: h });
  const publica = (h) => SB.rpc("teleconsulta_publica", { p_token_hash: h });
  const sala = (h) => SB.rpc("teleconsulta_sala_dueno", { p_token_hash: h });
  const dia = 86400000;
  const base = Date.now() + 3 * dia;

  seccion("1. Quién la prepara");
  const cNormal = await cita(base + 3600000, { tipo: "consulta" });
  comprobar(!(await crear(P.recSin, cNormal)).ok, "una cita que no es Teleconsulta no lleva sala");
  const cA = await cita(base);
  for (const [quien, t] of [["estética", P.estetica], ["el cliente", P.cliente], ["la llave anónima", null]]) {
    comprobar(!(await crear(t, cA)).ok, `${quien} no prepara la sala`);
  }
  comprobar(!(await crear(P.recSin, cA, "")).ok, "sin liga (hash vacío) no se crea");
  const tkA = token();
  const rA = await crear(P.recSin, cA, tkA.h);
  comprobar(rA.ok && rA.cuerpo.consentimiento_id && rA.cuerpo.reserva_id === null, `recepción prepara la sala; consentimiento listo, sin cobro (${rA.mensaje})`);
  comprobar(!(await crear(P.recSin, cA)).ok, "una cita no tiene dos salas");
  const fila = (await SB.from("vet_telemedicina").select("token_hash, sala_url").eq("cita_id", cA).single()).data;
  comprobar(fila.token_hash === tkA.h && !JSON.stringify(fila).includes(tkA.t), "solo se guarda el sha256 de la liga, nunca el token");

  seccion("2. La ventana");
  const det = (t, c) => rpc(t, "vet_telemedicina_detalle", { p_cita: c });
  let d = (await det(P.recSin, cA)).cuerpo;
  const desde = new Date(d.desde).getTime();
  comprobar(Math.abs(desde - (base - 15 * 60000)) < 1000 && Math.abs(new Date(d.hasta).getTime() - (base + 60 * 60000)) < 1000, "la ventana va de 15 min antes a 30 min después del término");
  comprobar(d.ventana === "antes" && d.puede_entrar === false, "faltando días: «todavía no abre»");
  const mover = (c, inicio) => SB.from("vet_citas").update({ inicia_at: new Date(inicio).toISOString(), termina_at: new Date(inicio + 30 * 60000).toISOString() }).eq("id", c);
  await mover(cA, Date.now() - 5 * 60000);
  d = (await det(P.recSin, cA)).cuerpo;
  comprobar(d.ventana === "abierta", "la reprogramación mueve la ventana sola (trigger): ahora abierta");
  comprobar(d.puede_entrar === false, "pero sin consentimiento firmado aún no se puede entrar");
  await mover(cA, Date.now() - 3 * 3600000);
  comprobar((await det(P.recSin, cA)).cuerpo.ventana === "cerrada", "pasada la hora: cerrada");
  await mover(cA, Date.now() - 5 * 60000);

  seccion("3. Consentimiento");
  const pub = await publica(tkA.h);
  comprobar(!pub.error && pub.data?.consentimiento?.estado === "pendiente_firma" && pub.data.mascota?.includes("Tele"), "la liga muestra el consentimiento pendiente");
  const llaves = Object.keys(pub.data ?? {}).join(",");
  comprobar(!/notas|diagnos|consulta_id|perro_id|cliente_id|sala_url|telefono(?!_negocio)|token/.test(llaves), `la liga pública no trae nada del expediente ni la sala (${llaves})`);
  comprobar((await sala(tkA.h)).error?.message.includes("firma el consentimiento"), "sin firma la sala no se da");
  comprobar((await SB.rpc("teleconsulta_firmar_consentimiento", { p_token_hash: tkA.h, p_nombre: "ab", p_ip: "1.1.1.1", p_hash: "h", p_path: "p" })).error, "un nombre de menos de 3 letras no firma");
  comprobar((await SB.rpc("teleconsulta_firmar_consentimiento", { p_token_hash: token().h, p_nombre: "Dueña Prueba", p_ip: "1.1.1.1", p_hash: "h", p_path: "p" })).error, "una liga inventada no firma");
  const f = await SB.rpc("teleconsulta_firmar_consentimiento", { p_token_hash: tkA.h, p_nombre: "Dueña Prueba", p_ip: "1.1.1.1", p_hash: "abc123", p_path: `x/${MARCA}.pdf` });
  comprobar(!f.error, `el servidor registra la firma (${f.error?.message ?? "ok"})`);
  comprobar((await SB.rpc("teleconsulta_firmar_consentimiento", { p_token_hash: tkA.h, p_nombre: "Dueña Prueba", p_ip: "1.1.1.1", p_hash: "abc123", p_path: "p" })).error, "firmar dos veces se rechaza");
  const cons = (await SB.from("consentimientos").select("estado, firma_metodo, ip_firma, hash_pdf, tipo").eq("id", rA.cuerpo.consentimiento_id).single()).data;
  comprobar(cons.estado === "firmado" && cons.firma_metodo === "remota" && cons.ip_firma === "1.1.1.1" && cons.hash_pdf === "abc123" && cons.tipo === "teleconsulta", "queda firmado remoto con IP y hash del PDF");
  d = (await det(P.recSin, cA)).cuerpo;
  comprobar(d.consentimiento_firmado && d.puede_entrar, "ahora sí se puede entrar");
  const s = await sala(tkA.h);
  comprobar(!s.error && s.data.sala_url === "simulada://x", "el servidor obtiene la sala del dueño");
  comprobar((await det(P.recSin, cA)).cuerpo.entro_dueno_at, "y queda anotado cuándo entró");

  seccion("4. Cobro anticipado");
  comprobar(!(await rpc(P.recSin, "guardar_veterinaria_teleconsulta", { p_cobro: true, p_precio: 350 })).ok, "recepción sin «Configuración del negocio» no activa el cobro");
  comprobar(!(await rpc(P.admin, "guardar_veterinaria_teleconsulta", { p_cobro: true, p_precio: null })).ok, "cobrar sin precio se rechaza");
  comprobar((await rpc(P.admin, "guardar_veterinaria_teleconsulta", { p_cobro: true, p_precio: 350 })).ok, "admin prende el cobro anticipado a $350");
  const cB = await cita(base + 7200000);
  const tkB = token();
  const rB = await crear(P.recSin, cB, tkB.h);
  comprobar(rB.ok && rB.cuerpo.reserva_id && Number(rB.cuerpo.monto) === 350, `la sala nace con su cuenta de $350 (${rB.mensaje})`);
  const linea = (await SB.from("cargos_aplicados").select("precio, servicio_id, descripcion").eq("reserva_id", rB.cuerpo.reserva_id)).data;
  comprobar(linea.length === 1 && Number(linea[0].precio) === 350 && linea[0].descripcion.startsWith("Teleconsulta"), "con una sola línea de cargo de monto libre");
  await mover(cB, Date.now() - 40 * 60000);
  await SB.rpc("teleconsulta_firmar_consentimiento", { p_token_hash: tkB.h, p_nombre: "Dueña Prueba", p_ip: "1.1.1.1", p_hash: "h2", p_path: "p" });
  d = (await det(P.recSin, cB)).cuerpo;
  comprobar(d.pago_requerido && !d.pagado && !d.puede_entrar && Number(d.saldo) === 350, "firmada pero sin pagar: no se puede entrar");
  comprobar((await sala(tkB.h)).error?.message.includes("pago"), "y el servidor no da la sala del dueño");
  comprobar(!(await rpc(P.recSin, "vet_telemedicina_sala_medico", { p_cita: cB })).ok, "ni la del médico sin permiso");
  // Pagar: turno abierto y cobro en efectivo por la vía de siempre.
  let turno = (await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle()).data;
  if (!turno) {
    const t = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(P.recSin), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: "prueba teleconsulta" }) });
    turno = t.cuerpo?.[0];
  }
  comprobar(Boolean(turno?.id), "hay un turno abierto para cobrar");
  const pago = await rpc(P.recSin, "registrar_cobro", { p_reserva_id: rB.cuerpo.reserva_id, p_notas: "teleconsulta", p_metodos: [{ metodo: "efectivo", monto: 350 }] });
  comprobar(pago.ok, `el cobro se registra por la caja de siempre (${pago.mensaje})`);
  d = (await det(P.recSin, cB)).cuerpo;
  comprobar(d.pagado && d.puede_entrar, "pagada: la sala abre");
  comprobar(!(await sala(tkB.h)).error, "y el servidor da la sala del dueño");

  seccion("5. La liga");
  const tkA2 = token();
  comprobar(!(await rpc(P.recSin, "vet_telemedicina_liga_nueva", { p_cita: cA, p_token_hash: "" })).ok, "una liga vacía se rechaza");
  comprobar((await rpc(P.recSin, "vet_telemedicina_liga_nueva", { p_cita: cA, p_token_hash: tkA2.h })).ok, "se genera una liga nueva");
  comprobar((await publica(tkA.h)).data === null, "la anterior deja de servir");
  comprobar((await publica(tkA2.h)).data !== null, "la nueva sirve");
  comprobar((await sala(tkA.h)).error, "y la anterior no da sala");
  for (const [quien, t] of [["estética", P.estetica], ["el cliente", P.cliente], ["la llave anónima", null]]) {
    comprobar(!(await rpc(t, "vet_telemedicina_liga_nueva", { p_cita: cA, p_token_hash: token().h })).ok, `${quien} no genera ligas`);
  }

  seccion("6. El médico");
  comprobar(!(await rpc(P.recSin, "vet_telemedicina_sala_medico", { p_cita: cA })).ok, "recepción sin permiso no entra a la sala del médico");
  const m = await rpc(P.recCon, "vet_telemedicina_sala_medico", { p_cita: cA });
  comprobar(m.ok && m.cuerpo.sala_url === "simulada://x", "el médico designado entra con su sesión");
  comprobar((await det(P.recCon, cA)).cuerpo.entro_medico_at, "queda anotado cuándo entró");
  await mover(cA, Date.now() + 2 * 3600000);
  comprobar(!(await rpc(P.recCon, "vet_telemedicina_sala_medico", { p_cita: cA })).ok, "reprogramada a dentro de 2 h: la sala del médico no abre (antes de la ventana)");
  await mover(cA, Date.now() - 3 * 3600000);
  comprobar(!(await rpc(P.recCon, "vet_telemedicina_sala_medico", { p_cita: cA })).ok, "pasada la ventana tampoco");
  await mover(cA, Date.now() - 5 * 60000);
  await dar(P.admin, P.recSinId, "atender_teleconsultas");
  comprobar((await rpc(P.recSin, "vet_telemedicina_sala_medico", { p_cita: cA })).ok, "con el permiso «Atender teleconsultas» también entra");
  await quitar(P.admin, P.recSinId, "atender_teleconsultas");
  const ci = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: null, p_cita: cA, p_tipo: null, p_medico: null });
  comprobar(ci.ok, `iniciar la cita abre una consulta (${ci.mensaje})`);
  const cons2 = (await SB.from("vet_consultas").select("modalidad, tipo_clave").eq("id", ci.cuerpo).single()).data;
  comprobar(cons2.modalidad === "telemedicina", `y queda marcada «telemedicina» (${cons2.modalidad})`);
  await SB.from("vet_citas").update({ estado: "cancelada", cancelada_motivo: "prueba" }).eq("id", cB);
  d = (await det(P.recSin, cB)).cuerpo;
  comprobar(d.ventana === "cancelada" && !d.puede_entrar, "cancelar la cita cierra la sala");
  comprobar((await sala(tkB.h)).error?.message.includes("canceló"), "y el dueño recibe el aviso de cancelación");

  seccion("7. Aislamiento");
  for (const [quien, t] of [["estética", P.estetica], ["el cliente", P.cliente], ["la llave anónima", null]]) {
    comprobar(!(await det(t, cA)).ok || (await det(t, cA)).cuerpo === null, `${quien} no ve el detalle`);
    comprobar(!(await rpc(t, "vet_telemedicina_sala_medico", { p_cita: cA })).ok, `${quien} no entra como médico`);
    const r = await get(t, "vet_telemedicina?select=id,sala_url,token_hash");
    comprobar(!r.ok || (Array.isArray(r.cuerpo) && r.cuerpo.length === 0), `${quien} no lee vet_telemedicina por la API`);
    comprobar(!(await post(t, "vet_telemedicina", { cita_id: cA })).ok, `${quien} no escribe en vet_telemedicina`);
  }
  for (const fn of ["teleconsulta_publica", "teleconsulta_firmar_consentimiento", "teleconsulta_sala_dueno"]) {
    for (const [quien, t] of [["admin", P.admin], ["el médico", P.recCon], ["el cliente", P.cliente], ["la llave anónima", null]]) {
      comprobar(!(await rpc(t, fn, { p_token_hash: tkA2.h, p_nombre: "x", p_ip: "x", p_hash: "x", p_path: "x" })).ok, `${quien} no ejecuta ${fn} (es del servidor)`);
    }
  }
  comprobar(!(await rpc(P.recCon, "vet_telemedicina_detalle", { p_cita: cA }, LUDOGTEKA)).ok, "con el encabezado de otro negocio el detalle no se abre");
  comprobar(!(await rpc(P.recCon, "vet_telemedicina_sala_medico", { p_cita: cA }, LUDOGTEKA)).ok, "ni la sala del médico");
  const otro = await createOtroNegocioPublica(tkA2.h);
  comprobar(otro === null, "la liga de Huellitas no sirve con la llave de servidor de otro negocio");
  await fijarModulo("veterinaria", false);
  comprobar((await publica(tkA2.h)).data === null, "con Veterinaria apagada la liga no sirve");
  comprobar(!(await crear(P.recSin, await cita(base + 20 * 3600000).catch(() => cA))).ok, "ni se crean salas");
  await fijarModulo("veterinaria", true);
  comprobar((await SB.from("cobros").select("id", { count: "exact", head: true })).count === cobrosAntes + 1, "en todo esto solo hubo el cobro de la prueba: las tablas de cobros no se tocaron");
} finally {
  await limpiar();
  if (ajustesAntes) await SB.from("veterinaria_ajustes").update({ teleconsulta_cobro_anticipado: ajustesAntes.teleconsulta_cobro_anticipado, teleconsulta_precio: ajustesAntes.teleconsulta_precio }).eq("id", ajustesAntes.id);
  else await SB.from("veterinaria_ajustes").update({ teleconsulta_cobro_anticipado: false, teleconsulta_precio: null }).eq("negocio_id", B);
  await fijarModulo("veterinaria", true);
  for (const m of medicosCreados) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
}
terminar();

async function createOtroNegocioPublica(hash) {
  const { servicioEn } = await import("./veterinaria-comun-dev.mjs");
  const r = await servicioEn(LUDOGTEKA).rpc("teleconsulta_publica", { p_token_hash: hash });
  return r.data ?? null;
}
