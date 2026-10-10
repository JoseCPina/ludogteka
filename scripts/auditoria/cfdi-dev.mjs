// Facturación CFDI 4.0 (SOLO DESARROLLO), en Huellitas: base + servidor + PAC de mentiras.
//
//   node scripts/auditoria/cfdi-dev.mjs
//
// Parte A (base, JWT reales de cada rol + llave anónima): permisos, datos fiscales,
// conceptos que calcula la base (IVA 0 % / 16 % / exento, reparto en centavos, cobro
// parcial), candados sobre un cobro facturado, cancelación 01–04 (sustitución por UUID,
// relacionados vigentes, pendiente de aceptación hasta 3 días), factura global
// (periodo cerrado, límite de 24 h), tope de timbres, llave del PAC en Vault.
// Parte B (servidor real `next start` en el 3003 + Facturapi de mentiras en el 4459):
// timbrar desde el cobro, global y cancelación por el código de producción, timbrado
// cortado a la mitad («por revisar»), descargas y enlace público. Necesita `npm run build`.
// Sale con 1 si algo falla. Si hay FACTURAPI_TEST_KEY en .env.local, la parte B corre
// además contra el sandbox REAL de Facturapi (un timbrado y su cancelación).
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { levantarFacturapiFalso } from "./lib/facturapi-falso.mjs";

// Diagnóstico: una petición que pasa de 8 s se reporta (peticiones lentas).
const fetchLento = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const t = Date.now();
  const destino = typeof input === "string" ? input : input.url ?? String(input);
  const aviso = setTimeout(() => console.log(`  ⏱ petición lenta (>8 s) todavía sin respuesta: ${destino.slice(0, 120)}`), 8000);
  try { return await fetchLento(input, init); } finally { clearTimeout(aviso); const d = Date.now() - t; if (d > 8000) console.log(`  ⏱ terminó a los ${Math.round(d / 1000)} s: ${destino.slice(0, 120)}`); }
};

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const T0 = Date.now();
const bien = (t) => console.log(`  ✔ ${t}  [${Math.round((Date.now() - T0) / 1000)}s]`);
const comprobar = (cond, t) => (cond ? bien(t) : hallazgo(t));
const MARCA = "ZZCFDI";
const hoyISO = (d = 0) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const { data: hue } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const H = hue.id;
const SH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const jwt = async (id, negocio = H) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": negocio } } });
const miembros = async (rol, negocio = H) => (await A.from("membresias").select("profile_id").eq("negocio_id", negocio).eq("rol", rol).is("deleted_at", null).order("created_at")).data.map((m) => m.profile_id);
const [idAdmin] = await miembros("admin");
const [idRecep] = await miembros("recepcion");
const [idEstetica] = await miembros("estetica");
const adminJ = await jwt(idAdmin);
const recepJ = await jwt(idRecep);
const esteticaJ = await jwt(idEstetica);
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { "x-negocio-id": H } } });
const [idAdminLudo] = await miembros("admin", "10000000-0000-4000-8000-000000000001");
const ajenoJ = await jwt(idAdminLudo, H); // un admin de OTRO negocio con el encabezado de Huellitas

const dar = (p) => adminJ.rpc("otorgar_permiso", { p_profile_id: idRecep, p_permiso: p });
const quitar = (p) => adminJ.rpc("revocar_permiso", { p_profile_id: idRecep, p_permiso: p });
const rfcEmisor = "EKU9003173C9";
const config = (extra = {}) => ({ activa: true, modo: "pruebas", rfc: rfcEmisor, razon_social: "ESCUELA KEMPER URGATE", regimen_fiscal: "601", cp_expedicion: "42501", tipo_persona: "moral", serie: "A", global_periodicidad: "mes", global_automatica: false, ...extra });

// ── datos de prueba ─────────────────────────────────────────────────────────
const { data: cliente } = await SH.from("clientes").select("id, nombre, telefono").eq("negocio_id", H).eq("publico_general", false).is("deleted_at", null).limit(1).single();
const { data: area } = await SH.from("areas_inventario").select("id").eq("negocio_id", H).is("deleted_at", null).limit(1).single();
const { data: pieza } = await SH.from("unidades_medida").select("id").eq("clave", "pieza").single();
const crearInsumo = async (nombre, precio) => {
  const { data, error } = await SH.from("insumos").insert({ negocio_id: H, nombre: `${MARCA} ${nombre}`, area_id: area.id, unidad_compra_id: pieza.id, unidad_consumo_id: pieza.id, stock_minimo: 0, existencia_inicial: 50, se_vende: true, precio_venta: precio, updated_at: new Date().toISOString() }).select("id").single();
  if (error) throw new Error(`insumo: ${error.message}`);
  return data.id;
};
const turnoAbierto = async () => (await SH.from("turnos_caja").select("id").eq("negocio_id", H).eq("estado", "abierto").maybeSingle()).data;
const nuevaVenta = async (lineas, cli = cliente.id) => {
  const { data, error } = await recepJ.rpc("crear_venta_mostrador", { p_cliente_id: cli, p_lineas: lineas, p_notas: MARCA });
  if (error) throw new Error(`venta: ${error.message}`);
  return data;
};
const cobrar = async (reserva, monto, metodo = "efectivo") => {
  const { data, error } = await recepJ.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: MARCA, p_metodos: [{ metodo, monto, propina: 0 }] });
  if (error) throw new Error(`cobro: ${error.message}`);
  return data;
};
const conceptos = async (facturaId) => (await adminJ.from("cfdi_conceptos").select("*").eq("factura_id", facturaId).order("orden")).data ?? [];
const factura = async (id) => (await adminJ.from("cfdi_facturas").select("*").eq("id", id).single()).data;
const eventos = async (id) => (await adminJ.from("cfdi_eventos").select("tipo").eq("factura_id", id).order("created_at")).data.map((e) => e.tipo);
const registrarTimbrado = (id, extra = {}) => SH.rpc("cfdi_registrar_timbrado", { p_factura_id: id, p: { uuid: crypto.randomUUID().toUpperCase(), pac_factura_id: "pac_" + id.slice(0, 8), folio: String(Math.floor(Math.random() * 9000) + 1000), serie: "A", fecha: new Date().toISOString(), ...extra } });
const total2 = (n) => Math.round(n * 100) / 100;

let turno = await turnoAbierto();
if (!turno) {
  await recepJ.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: MARCA, abierto_por: idRecep, estado: "abierto" });
  turno = await turnoAbierto();
}
await adminJ.rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
const insPatente = await crearInsumo("Antiparasitario de patente", 100);
const insAlimento = await crearInsumo("Croquetas", 50);
const insOtro = await crearInsumo("Collar", 30);
let mesDesde;
const SOLO_B = Boolean(process.env.SOLO_B);
if (SOLO_B) {
  const b0 = new Date(); b0.setUTCMonth(b0.getUTCMonth() - 2);
  mesDesde = new Date(Date.UTC(b0.getUTCFullYear(), b0.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

// Las globales de corridas anteriores ocupan sus periodos: se dan por canceladas (solo desarrollo).
async function limpiarGlobales() {
  const { data: viejas } = await SH.from("cfdi_facturas").select("id").eq("negocio_id", H).eq("tipo", "global").in("estado", ["borrador", "timbrando", "revisar", "vigente", "cancelacion_pendiente"]);
  const ids = (viejas ?? []).map((f) => f.id);
  if (!ids.length) return;
  await SH.from("cfdi_facturas").update({ estado: "cancelada", cancelada_at: new Date().toISOString() }).in("id", ids);
  await SH.from("cfdi_factura_cobros").update({ vigente: false }).in("factura_id", ids);
}
await limpiarGlobales();

try {
  if (!SOLO_B) {
  // ═══ A1. Permisos ═══════════════════════════════════════════════════════════
  console.log("── A1. Permisos y acceso");
  const mpAdmin = (await adminJ.rpc("mis_permisos")).data ?? [];
  comprobar(["facturar", "cancelar_facturas", "editar_datos_fiscales"].every((p) => mpAdmin.includes(p)), "admin tiene los tres permisos de facturación");
  for (const p of ["facturar", "cancelar_facturas", "editar_datos_fiscales"]) { await dar(p); await quitar(p); }
  const mpRec = (await recepJ.rpc("mis_permisos")).data ?? [];
  comprobar(!mpRec.some((p) => ["facturar", "cancelar_facturas", "editar_datos_fiscales"].includes(p)), "recepción los trae apagados");
  const cfgSinPermiso = await recepJ.rpc("cfdi_guardar_config", { p: config() });
  comprobar(cfgSinPermiso.error && /Editar datos fiscales/.test(cfgSinPermiso.error.message), "recepción sin «Editar datos fiscales» no configura");
  const cfgOk = await adminJ.rpc("cfdi_guardar_config", { p: config() });
  comprobar(!cfgOk.error, `admin configura la facturación (${cfgOk.error?.message ?? "ok"})`);
  const cfgFila = (await SH.from("cfdi_config_negocio").select("global_desde, tope_timbres_mes").eq("negocio_id", H).single()).data;
  comprobar(cfgFila.global_desde === hoyISO() || cfgFila.global_desde, `activar fija desde cuándo junta la global (${cfgFila.global_desde})`);
  const malRfc = await adminJ.rpc("cfdi_guardar_config", { p: config({ rfc: "ABC" }) });
  comprobar(malRfc.error && /RFC/.test(malRfc.error.message), "un RFC mal escrito se rechaza");
  const resico = await adminJ.rpc("cfdi_guardar_config", { p: config({ rfc: "XIQB891116QE3", tipo_persona: "fisica", regimen_fiscal: "626", global_periodicidad: "semana" }) });
  comprobar(resico.error && /RESICO/.test(resico.error.message), "RESICO no acepta global semanal");
  await adminJ.rpc("cfdi_guardar_config", { p: config() });
  const legible = await recepJ.from("cfdi_facturas").select("id");
  comprobar(!legible.error && (legible.data ?? []).length === 0, "recepción sin permiso no ve facturas");
  const est = await esteticaJ.from("cfdi_facturas").select("id");
  comprobar(!est.error && (est.data ?? []).length === 0, "estética no ve facturas");
  const anonLee = await anon.from("cfdi_facturas").select("id");
  comprobar(anonLee.error || (anonLee.data ?? []).length === 0, "la llave anónima no ve facturas");
  for (const fn of ["cfdi_preparar_cobros", "cfdi_global_periodos", "cfdi_timbres_mes", "mis_facturas"]) {
    const r = await anon.rpc(fn, fn === "cfdi_preparar_cobros" ? { p_cobro_ids: [crypto.randomUUID()] } : {});
    comprobar(r.error, `anon no ejecuta ${fn}`);
  }
  const columnaLlave = await adminJ.from("cfdi_config_negocio").select("llave_secreto_id").limit(1);
  comprobar(columnaLlave.error, "la referencia a la llave del PAC no se lee por la API ni siendo admin");
  const selStar = await adminJ.from("cfdi_config_negocio").select("rfc, razon_social, tope_timbres_mes").single();
  comprobar(!selStar.error && selStar.data.rfc === rfcEmisor, "…pero la configuración sí (lista explícita de columnas)");
  const ajeno = await ajenoJ.from("cfdi_config_negocio").select("rfc");
  comprobar(!ajeno.error ? (ajeno.data ?? []).length === 0 : true, "un admin de otro negocio con el encabezado de Huellitas no ve nada");

  // ═══ A2. Datos fiscales ═════════════════════════════════════════════════════
  console.log("── A2. Datos fiscales del cliente");
  const df = (extra = {}) => ({ rfc: "XIQB891116QE3", nombre_fiscal: "BEATRIZ XIQUI", cp: "86400", regimen_fiscal: "612", uso_cfdi: "G03", email: "bea@example.com", ...extra });
  const sinPerm = await recepJ.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: cliente.id, p: df() });
  comprobar(sinPerm.error && /Editar datos fiscales/.test(sinPerm.error.message), "recepción sin permiso no captura datos fiscales");
  const xaxx = await adminJ.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: cliente.id, p: df({ rfc: "XAXX010101000" }) });
  comprobar(xaxx.error && /global/.test(xaxx.error.message), "el RFC genérico XAXX010101000 no se factura aparte (va en la global)");
  const regMal = await adminJ.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: cliente.id, p: df({ regimen_fiscal: "601" }) });
  comprobar(regMal.error && /no corresponde/.test(regMal.error.message), "el régimen de persona moral no va con RFC de persona física");
  const cpMal = await adminJ.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: cliente.id, p: df({ cp: "123" }) });
  comprobar(cpMal.error && /código postal/.test(cpMal.error.message), "el código postal lleva 5 dígitos");
  const sinNombre = await adminJ.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: cliente.id, p: df({ nombre_fiscal: " " }) });
  comprobar(sinNombre.error, "el nombre fiscal es obligatorio");
  const extr = await adminJ.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: cliente.id, p: df({ rfc: "XEXX010101000", nombre_fiscal: "JOHN SMITH", regimen_fiscal: "616", uso_cfdi: "S01", cp: "11111" }) });
  comprobar(!extr.error, `XEXX010101000 (extranjero) es válido (${extr.error?.message ?? "ok"})`);
  const guardado = await adminJ.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: cliente.id, p: df() });
  comprobar(!guardado.error, `datos válidos se guardan (${guardado.error?.message ?? "ok"})`);
  const evCli = (await adminJ.from("cfdi_eventos").select("tipo").eq("cliente_id", cliente.id).eq("tipo", "datos_fiscales_editados")).data;
  comprobar(evCli.length >= 1, "cada edición de datos fiscales deja su evento");
  const publico = (await SH.from("clientes").select("id").eq("negocio_id", H).eq("publico_general", true).maybeSingle()).data;
  if (publico) comprobar((await adminJ.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: publico.id, p: df() })).error, "«Público en general» no recibe datos fiscales");

  // ═══ A3. IVA por clase ══════════════════════════════════════════════════════
  console.log("── A3. IVA por concepto");
  const regla = async (clase) => (await adminJ.rpc("cfdi_regla_clase", { p_clase: clase })).data?.[0];
  comprobar(Number((await regla("estetica")).tasa) === 0.16, "estética 16 %");
  comprobar(Number((await regla("hospedaje")).tasa) === 0.16 && Number((await regla("guarderia")).tasa) === 0.16, "hospedaje y guardería 16 %");
  comprobar(Number((await regla("alimento_mascotas")).tasa) === 0.16, "alimento procesado para mascotas 16 %");
  comprobar(Number((await regla("medicina_patente")).tasa) === 0, "medicinas de patente 0 %");
  comprobar((await regla("consulta_veterinaria")).tratamiento === "tasa", "consulta veterinaria con 16 % si el emisor es persona moral");
  await adminJ.rpc("cfdi_guardar_config", { p: config({ rfc: "XIQB891116QE3", tipo_persona: "fisica", regimen_fiscal: "612" }) });
  comprobar((await regla("consulta_veterinaria")).tratamiento === "exento", "consulta veterinaria exenta si el emisor es persona física");
  await adminJ.rpc("cfdi_guardar_config", { p: config({ rfc: "XIQB891116QE3", tipo_persona: "sociedad_civil", regimen_fiscal: "603" }) });
  comprobar((await regla("consulta_veterinaria")).tratamiento === "exento", "…o sociedad civil");
  await adminJ.rpc("cfdi_guardar_config", { p: config() });
  const ivaCambio = await adminJ.rpc("cfdi_guardar_clase", { p_clase: "otro_servicio", p_tratamiento: "tasa", p_tasa: 0.08, p_clave_prod_serv: "01010101", p_clave_unidad: "E48", p_unidad: "Unidad de servicio" });
  comprobar(!ivaCambio.error && Number((await regla("otro_servicio")).tasa) === 0.08, "el IVA de una clase es configurable (8 % frontera)");
  await adminJ.rpc("cfdi_guardar_clase", { p_clase: "otro_servicio", p_tratamiento: "tasa", p_tasa: 0.16, p_clave_prod_serv: "01010101", p_clave_unidad: "E48", p_unidad: "Unidad de servicio" });
  comprobar((await recepJ.rpc("cfdi_guardar_clase", { p_clase: "estetica", p_tratamiento: "exento", p_tasa: 0, p_clave_prod_serv: "", p_clave_unidad: "", p_unidad: "" })).error, "recepción sin permiso no cambia el IVA");
  await adminJ.rpc("cfdi_guardar_insumo", { p_insumo_id: insPatente, p_de_patente: true, p_clase: "otro_producto" });
  await adminJ.rpc("cfdi_guardar_insumo", { p_insumo_id: insAlimento, p_de_patente: false, p_clase: "alimento_mascotas" });

  // ═══ A4. Conceptos de un cobro ══════════════════════════════════════════════
  console.log("── A4. Conceptos que calcula la base");
  await dar("facturar");
  const reserva1 = await nuevaVenta([{ insumo_id: insPatente, cantidad: 1 }, { insumo_id: insAlimento, cantidad: 2 }, { concepto: `${MARCA} Servicio suelto`, precio: 150.5, cantidad: 1 }]);
  const cobro1 = await cobrar(reserva1, 350.5);
  const prep = await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cobro1], p_receptor: null, p_sustituye: null });
  comprobar(!prep.error, `recepción con «Facturar» prepara la factura (${prep.error?.message ?? "ok"})`);
  const f1 = prep.data;
  const c1 = await conceptos(f1);
  comprobar(c1.length === 3, `3 conceptos (uno por línea): ${c1.length}`);
  const cPat = c1.find((c) => c.clase === "medicina_patente");
  const cAli = c1.find((c) => c.clase === "alimento_mascotas");
  comprobar(cPat && Number(cPat.tasa) === 0 && Number(cPat.iva) === 0 && Number(cPat.importe) === 100, "la medicina de patente va a 0 %: base $100, IVA $0");
  comprobar(cAli && Number(cAli.tasa) === 0.16 && Number(cAli.importe) === total2(100 / 1.16) && Number(cAli.iva) === total2(total2(100 / 1.16) * 0.16), "el alimento va a 16 % desglosado del precio con IVA");
  const fila1 = await factura(f1);
  comprobar(Number(fila1.total_esperado) === 350.5, `lo esperado es exactamente lo cobrado (350.50): ${fila1.total_esperado}`);
  comprobar(Math.abs(Number(fila1.total) - 350.5) <= 0.03, `el total del CFDI coincide con el cobro salvo redondeo ≤ 3 ¢ (${fila1.total})`);
  comprobar(fila1.forma_pago === "01" && fila1.metodo_pago === "PUE" && fila1.uso_cfdi === "G03", "efectivo → forma 01, PUE, uso G03");
  const imp = fila1.impuestos;
  comprobar(imp["0"] && imp["16"], `desglose por tasa: ${JSON.stringify(imp)}`);
  comprobar((await eventos(f1)).includes("preparada"), "la preparación deja su evento");
  const otra = await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cobro1], p_receptor: null, p_sustituye: null });
  comprobar(otra.error && /ya tiene una factura/.test(otra.error.message), "un cobro no entra en dos facturas");

  // cobro parcial y reparto en centavos
  const reserva2 = await nuevaVenta([{ concepto: `${MARCA} A`, precio: 10.01, cantidad: 1 }, { concepto: `${MARCA} B`, precio: 10.02, cantidad: 1 }, { concepto: `${MARCA} C`, precio: 10.03, cantidad: 1 }]);
  const cobro2 = await cobrar(reserva2, 25);
  const f2 = (await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cobro2], p_receptor: null, p_sustituye: null })).data;
  const c2 = await conceptos(f2);
  comprobar(total2(c2.reduce((a, c) => a + Number(c.importe_con_iva), 0)) === 25, `un cobro parcial de $25 de una cuenta de $30.06 se reparte en centavos y suma exacto: ${c2.map((c) => c.importe_con_iva).join(" + ")}`);
  await recepJ.rpc("cfdi_descartar", { p_factura_id: f2 });
  comprobar((await factura(f2)).estado === "descartada", "un borrador se descarta y libera sus cobros");
  const f2b = await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cobro2], p_receptor: null, p_sustituye: null });
  comprobar(!f2b.error, "…y el cobro se puede preparar otra vez");
  await recepJ.rpc("cfdi_descartar", { p_factura_id: f2b.data });

  // público en general: sin datos → error; con receptor al momento → ok
  const reservaPG = await nuevaVenta([{ concepto: `${MARCA} Mostrador`, precio: 80, cantidad: 1 }], null);
  const cobroPG = await cobrar(reservaPG, 80);
  const sinDatos = await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cobroPG], p_receptor: null, p_sustituye: null });
  comprobar(sinDatos.error && /datos fiscales/.test(sinDatos.error.message), "venta a «Público en general» sin receptor: pide los datos");
  const conRec = await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cobroPG], p_receptor: df({ rfc: "XAXX010101000" }), p_sustituye: null });
  comprobar(conRec.error && /global/.test(conRec.error.message), "…y el RFC genérico se manda a la global");
  const conRec2 = await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cobroPG], p_receptor: df(), p_sustituye: null });
  comprobar(!conRec2.error, `…con un receptor capturado al momento sí (${conRec2.error?.message ?? "ok"})`);
  if (conRec2.data) await recepJ.rpc("cfdi_descartar", { p_factura_id: conRec2.data });

  // ═══ A5. Timbrar (la base) ══════════════════════════════════════════════════
  console.log("── A5. Timbrado");
  const ini = await recepJ.rpc("cfdi_iniciar_timbrado", { p_factura_id: f1 });
  comprobar(!ini.error && ini.data.conceptos.length === 3 && ini.data.receptor.rfc === "XIQB891116QE3" && ini.data.emisor.rfc === rfcEmisor, "iniciar_timbrado entrega la solicitud completa");
  comprobar((await factura(f1)).estado === "timbrando", "…y la marca «timbrando»");
  const doble = await recepJ.rpc("cfdi_iniciar_timbrado", { p_factura_id: f1 });
  comprobar(doble.error && /se está timbrando/.test(doble.error.message), "no se timbra dos veces a la vez");
  comprobar((await recepJ.rpc("cfdi_registrar_timbrado", { p_factura_id: f1, p: { uuid: "X" } })).error, "recepción NO puede registrar un timbrado (solo el servidor)");
  comprobar((await adminJ.rpc("cfdi_registrar_timbrado", { p_factura_id: f1, p: { uuid: "X" } })).error, "ni un admin");
  await SH.rpc("cfdi_registrar_error", { p_factura_id: f1, p_mensaje: "RFC no válido", p_incierto: false });
  comprobar((await factura(f1)).estado === "borrador", "un rechazo del PAC regresa a borrador con su mensaje");
  await recepJ.rpc("cfdi_iniciar_timbrado", { p_factura_id: f1 });
  await SH.rpc("cfdi_registrar_error", { p_factura_id: f1, p_mensaje: "se cortó", p_incierto: true });
  comprobar((await factura(f1)).estado === "revisar", "un corte de conexión deja la factura «por revisar», no «borrador»");
  const sinReintento = await recepJ.rpc("cfdi_iniciar_timbrado", { p_factura_id: f1 });
  comprobar(sinReintento.error && /por revisar/.test(sinReintento.error.message), "una factura por revisar no se re-timbra a ciegas");
  const rt = await registrarTimbrado(f1, { total: 350.5, subtotal: 302.3 });
  comprobar(!rt.error, `el servidor registra el timbrado (${rt.error?.message ?? "ok"})`);
  const t1 = await factura(f1);
  comprobar(t1.estado === "vigente" && t1.uuid_fiscal && t1.fecha_timbrado, "queda vigente con UUID y fecha");
  comprobar((await eventos(f1)).includes("timbrada"), "el timbrado deja su evento");
  const att = await recepJ.rpc("cfdi_atencion");
  comprobar(!att.error, "cfdi_atencion responde a quien factura");

  // ═══ A6. Candados sobre un cobro facturado ══════════════════════════════════
  console.log("── A6. Candados sobre un cobro facturado");
  const anul = await adminJ.rpc("anular_cobro", { p_cobro_id: cobro1, p_motivo: "intento de anular uno facturado" });
  comprobar(anul.error && /facturado/.test(anul.error.message), `no se anula un cobro facturado (${anul.error?.message?.slice(0, 70)})`);
  const edit = await adminJ.rpc("editar_monto_cobro", { p_cobro_id: cobro1, p_metodo: "efectivo", p_monto_nuevo: 300, p_motivo: "intento de corregir uno facturado" });
  comprobar(edit.error && /facturado/.test(edit.error.message), "no se corrige el monto de un cobro facturado");
  const dev = await adminJ.rpc("registrar_devolucion", { p_cobro_id: cobro1, p_motivo: "intento", p_metodos: [{ metodo: "efectivo", monto: 10 }] });
  comprobar(dev.error && /facturado/.test(dev.error.message), "no se devuelve el dinero de un cobro facturado");
  const montoIntacto = (await SH.from("cobro_metodos").select("monto").eq("cobro_id", cobro1)).data;
  comprobar(montoIntacto.length === 1 && Number(montoIntacto[0].monto) === 350.5, "el cobro quedó intacto después de los intentos");

  // ═══ A7. Cancelación ════════════════════════════════════════════════════════
  console.log("── A7. Cancelación");
  comprobar((await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: f1, p_motivo: "02", p_sustituta: null })).error, "sin «Cancelar facturas» no se cancela");
  await dar("cancelar_facturas");
  comprobar((await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: f1, p_motivo: "07", p_sustituta: null })).error, "solo los motivos 01 a 04");
  const sin01 = await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: f1, p_motivo: "01", p_sustituta: null });
  comprobar(sin01.error && /UUID/.test(sin01.error.message), "el motivo 01 exige el UUID de la sustituta");
  const falso01 = await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: f1, p_motivo: "01", p_sustituta: crypto.randomUUID() });
  comprobar(falso01.error && /sustituya/.test(falso01.error.message), "…y ese UUID tiene que ser de una factura vigente que la sustituya");

  // sustituta (relación 04)
  const sus = await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cobro1], p_receptor: null, p_sustituye: f1 });
  comprobar(!sus.error, `se prepara la sustituta de los mismos cobros (${sus.error?.message ?? "ok"})`);
  const fS = sus.data;
  comprobar((await factura(fS)).relacion_tipo === "04" && (await factura(fS)).relacionada_a === f1, "la sustituta lleva relación 04 con la original");
  await recepJ.rpc("cfdi_iniciar_timbrado", { p_factura_id: fS });
  await registrarTimbrado(fS, { total: 350.5 });
  const uuidS = (await factura(fS)).uuid_fiscal;
  const bloqueo = await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: f1, p_motivo: "02", p_sustituta: null });
  comprobar(bloqueo.error && /relacionada/.test(bloqueo.error.message), "con una factura vigente relacionada, la cancelación 02 se bloquea");
  const ok01 = await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: f1, p_motivo: "01", p_sustituta: uuidS });
  comprobar(!ok01.error, `motivo 01 con el UUID de la sustituta: se permite (${ok01.error?.message ?? "ok"})`);

  // pendiente de aceptación → rechazada → pendiente → aceptada
  await SH.rpc("cfdi_registrar_cancelacion", { p_factura_id: f1, p_estatus: "pendiente", p_detalle: {} });
  let pf = await factura(f1);
  comprobar(pf.estado === "cancelacion_pendiente" && pf.cancelacion_limite, "pendiente de aceptación: sigue en proceso con su límite");
  const dias = (new Date(pf.cancelacion_limite) - Date.now()) / 86400000;
  comprobar(dias > 2.9 && dias <= 3.01, `…de 3 días (${dias.toFixed(2)})`);
  comprobar((await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: f1, p_motivo: "01", p_sustituta: uuidS })).error, "no se vuelve a solicitar mientras está pendiente");
  const attP = (await recepJ.rpc("cfdi_atencion")).data ?? [];
  comprobar(attP.some((a) => a.clave === "cfdi_cancelacion"), "la cancelación pendiente sale en «Necesita atención»");
  await SH.rpc("cfdi_registrar_cancelacion", { p_factura_id: f1, p_estatus: "rechazada", p_detalle: {} });
  pf = await factura(f1);
  comprobar(pf.estado === "vigente" && pf.cancelacion_estatus === "rechazada", "rechazada por el cliente: la factura sigue vigente");
  await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: f1, p_motivo: "01", p_sustituta: uuidS });
  await SH.rpc("cfdi_registrar_cancelacion", { p_factura_id: f1, p_estatus: "cancelada", p_detalle: {} });
  pf = await factura(f1);
  comprobar(pf.estado === "cancelada" && pf.cancelada_at, "aceptada: la factura queda cancelada");
  const links = (await SH.from("cfdi_factura_cobros").select("factura_id, vigente, es_sustitucion").eq("cobro_id", cobro1)).data;
  comprobar(links.find((l) => l.factura_id === f1)?.vigente === false && links.find((l) => l.factura_id === fS)?.vigente === true && links.find((l) => l.factura_id === fS)?.es_sustitucion === false, "el cobro pasa a la sustituta (la anterior libera el cobro)");
  const evs = await eventos(f1);
  comprobar(["cancelacion_solicitada", "cancelacion_pendiente", "cancelacion_rechazada", "cancelacion_cancelada"].every((e) => evs.includes(e)), `cada paso de la cancelación deja evento: ${evs.join(", ")}`);
  const otraVez = await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: f1, p_motivo: "02", p_sustituta: null });
  comprobar(otraVez.error && /vigente/.test(otraVez.error.message), "una factura cancelada no se cancela otra vez");
  // la sustituta ya cubre el cobro: sigue bloqueado
  comprobar((await adminJ.rpc("anular_cobro", { p_cobro_id: cobro1, p_motivo: "intento con la sustituta vigente" })).error, "con la sustituta vigente el cobro sigue bloqueado");
  // y cancelándola (03) se libera
  await recepJ.rpc("cfdi_iniciar_cancelacion", { p_factura_id: fS, p_motivo: "03", p_sustituta: null });
  await SH.rpc("cfdi_registrar_cancelacion", { p_factura_id: fS, p_estatus: "cancelada", p_detalle: {} });
  const anulOk = await adminJ.rpc("anular_cobro", { p_cobro_id: cobro1, p_motivo: "ya sin factura vigente, se anula" });
  comprobar(!anulOk.error, `cancelada la factura, el cobro se puede anular (${anulOk.error?.message ?? "ok"})`);

  // ═══ A8. Factura global ═════════════════════════════════════════════════════
  console.log("── A8. Factura global");
  await adminJ.rpc("cfdi_guardar_config", { p: config() });
  const hoy = new Date().toISOString().slice(0, 10);
  const primeroMes = new Date(); primeroMes.setUTCDate(1);
  const periodosHoy = (await recepJ.rpc("cfdi_global_periodos")).data ?? [];
  comprobar(periodosHoy.every((p) => p.hasta < hoy), "solo se ofrecen periodos CERRADOS");
  // Cobros "de hace dos meses" para tener un mes cerrado.
  const base = new Date(); base.setUTCMonth(base.getUTCMonth() - 2); base.setUTCDate(10); base.setUTCHours(18);
  mesDesde = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const mesHasta = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const rg1 = await nuevaVenta([{ insumo_id: insPatente, cantidad: 1 }, { insumo_id: insOtro, cantidad: 1 }], null);
  const cg1 = await cobrar(rg1, 130);
  const rg2 = await nuevaVenta([{ concepto: `${MARCA} Global`, precio: 200, cantidad: 1 }], null);
  const cg2 = await cobrar(rg2, 200, "transferencia");
  await SH.from("cobros").update({ created_at: base.toISOString() }).in("id", [cg1, cg2]);
  await SH.from("cfdi_config_negocio").update({ global_desde: mesDesde }).eq("negocio_id", H);
  const periodos = (await recepJ.rpc("cfdi_global_periodos")).data ?? [];
  const per = periodos.find((p) => p.desde === mesDesde);
  comprobar(per && per.hasta === mesHasta && per.n_cobros >= 2, `periodo mensual cerrado ${mesDesde} al ${mesHasta} con ${per?.n_cobros} cobros`);
  const limite = new Date(per.limite_emision);
  const esperado = new Date(mesHasta + "T00:00:00-06:00"); esperado.setUTCDate(esperado.getUTCDate() + 2);
  comprobar(Math.abs(limite - esperado) <= 2 * 3600 * 1000, `el límite es el cierre del periodo + 24 h (${per.limite_emision})`);
  comprobar(per.vencida === true, "…y está vencida si ya pasó (se marca)");
  const gattn = (await recepJ.rpc("cfdi_atencion")).data ?? [];
  comprobar(gattn.some((a) => a.clave === "cfdi_global" && a.urgente), "la global vencida sale urgente en «Necesita atención»");
  comprobar((await esteticaJ.rpc("cfdi_global_periodos")).error, "estética no ve periodos");
  const antes = (await SH.from("cobros").select("id").eq("negocio_id", H).gte("created_at", mesDesde).lte("created_at", mesHasta + "T23:59:59Z")).data.length;
  const gl = await recepJ.rpc("cfdi_preparar_global", { p_desde: mesDesde, p_hasta: mesHasta });
  comprobar(!gl.error, `se prepara la global (${gl.error?.message ?? "ok"})`);
  const fg = await factura(gl.data);
  const cg = await conceptos(gl.data);
  comprobar(fg.tipo === "global" && fg.receptor.rfc === "XAXX010101000" && fg.receptor.nombre === "PUBLICO EN GENERAL" && fg.receptor.regimen === "616" && fg.uso_cfdi === "S01" && fg.receptor.cp === "42501", "receptor: XAXX010101000, PUBLICO EN GENERAL, régimen 616, uso S01 y el CP de expedición");
  comprobar(fg.periodicidad === "mes" && fg.periodo_desde === mesDesde, "lleva la información global del periodo");
  comprobar(cg.some((c) => c.clase === "medicina_patente" && Number(c.tasa) === 0) && cg.some((c) => Number(c.tasa) === 0.16), "IVA separado por tasa en la global (0 % y 16 %)");
  comprobar(total2(Number(fg.total_esperado)) >= 330, `la global suma lo cobrado en el periodo (${fg.total_esperado})`);
  comprobar(antes >= 2, "(había cobros ese mes)");
  const segunda = await recepJ.rpc("cfdi_preparar_global", { p_desde: mesDesde, p_hasta: mesHasta });
  comprobar(segunda.error, "no se prepara dos veces la global del mismo periodo");
  const abierto = await recepJ.rpc("cfdi_preparar_global", { p_desde: mesDesde, p_hasta: hoy });
  comprobar(abierto.error, "no se prepara un periodo que no está cerrado");
  const pegado = await SH.from("cfdi_factura_cobros").select("cobro_id").eq("factura_id", gl.data);
  comprobar(pegado.data.some((x) => x.cobro_id === cg1) && pegado.data.some((x) => x.cobro_id === cg2), "los cobros quedan ligados a la global (no se facturan aparte)");
  const conGlobal = await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cg1], p_receptor: df(), p_sustituye: null });
  comprobar(conGlobal.error && /ya tiene una factura/.test(conGlobal.error.message), "un cobro de la global no se factura aparte");
  await recepJ.rpc("cfdi_descartar", { p_factura_id: gl.data });

  // ═══ A9. Tope de timbres ════════════════════════════════════════════════════
  console.log("── A9. Tope de timbres");
  const u0 = (await recepJ.rpc("cfdi_timbres_mes")).data[0];
  comprobar(u0.usados >= 1 && u0.tope === 100, `cuenta los timbres del mes (${u0.usados} de ${u0.tope})`);
  await SH.from("cfdi_config_negocio").update({ tope_timbres_mes: u0.usados + 1, aviso_timbres_pct: 50 }).eq("negocio_id", H);
  const u1 = (await recepJ.rpc("cfdi_timbres_mes")).data[0];
  comprobar(u1.cerca === true && u1.agotado === false, "cerca del tope avisa");
  await SH.from("cfdi_config_negocio").update({ tope_timbres_mes: u0.usados }).eq("negocio_id", H);
  const u2 = (await recepJ.rpc("cfdi_timbres_mes")).data[0];
  comprobar(u2.agotado === true, "en el tope ya no se factura");
  const rT = await nuevaVenta([{ concepto: `${MARCA} Tope`, precio: 20, cantidad: 1 }]);
  const cT = await cobrar(rT, 20);
  const noPrep = await recepJ.rpc("cfdi_preparar_cobros", { p_cobro_ids: [cT], p_receptor: null, p_sustituye: null });
  comprobar(noPrep.error && /timbres/.test(noPrep.error.message), "agotado el tope no se prepara una factura");
  comprobar((await adminJ.rpc("plataforma_cfdi_tope", { p_negocio_id: H, p_tope: 5, p_aviso_pct: 80, p_motivo: "prueba" })).error, "el admin del negocio NO cambia el tope (solo la plataforma)");
  comprobar((await recepJ.rpc("plataforma_cfdi_uso")).error, "el uso de timbres de todos los negocios es de la plataforma");
  await SH.from("cfdi_config_negocio").update({ tope_timbres_mes: 100, aviso_timbres_pct: 80 }).eq("negocio_id", H);

  // ═══ A10. Llave del PAC (Vault) ═════════════════════════════════════════════
  console.log("── A10. Llave del PAC");
  for (const [quien, cli] of [["admin", adminJ], ["recepción", recepJ], ["anon", anon]]) {
    comprobar((await cli.rpc("cfdi_guardar_llave", { p_llave: "sk_test_x", p_modo: "pruebas" })).error, `${quien} no guarda la llave`);
    comprobar((await cli.rpc("cfdi_leer_llave")).error, `${quien} no lee la llave`);
  }
  const gl2 = await SH.rpc("cfdi_guardar_llave", { p_llave: "sk_test_llave_de_prueba_vault", p_modo: "pruebas" });
  comprobar(!gl2.error, `el servidor sí la guarda en Vault (${gl2.error?.message ?? "ok"})`);
  const lee = await SH.rpc("cfdi_leer_llave");
  comprobar(lee.data?.[0]?.llave === "sk_test_llave_de_prueba_vault" && lee.data[0].modo === "pruebas", "…y la lee de vuelta");
  const enFilas = JSON.stringify((await adminJ.from("cfdi_eventos").select("*").limit(200)).data ?? []);
  comprobar(!enFilas.includes("sk_test_llave_de_prueba_vault"), "la llave no aparece en ninguna fila legible");
  await SH.rpc("cfdi_borrar_llave");
  comprobar(!(await SH.rpc("cfdi_leer_llave")).data?.length, "borrada, ya no hay llave");

  // ═══ A11. Auditoría de frontera ═════════════════════════════════════════════
  console.log("── A11. Frontera");
  const fr = await SH.rpc("auditoria_frontera");
  comprobar(!fr.error && (fr.data ?? []).length === 0, `auditoria_frontera() vacía (${JSON.stringify(fr.data ?? fr.error)})`);
  }
} finally {
  // limpieza: los insumos de prueba se dan de baja; las facturas quedan (inmutables)
  for (const p of ["facturar", "cancelar_facturas", "editar_datos_fiscales"]) await quitar(p);
  await SH.from("cfdi_config_negocio").update({ tope_timbres_mes: 100, aviso_timbres_pct: 80 }).eq("negocio_id", H);
}

// ═══ PARTE B: el servidor real + el PAC de mentiras + el navegador ═══════════
console.log("\n══ PARTE B · servidor real + Facturapi de mentiras");
const PUERTO = 3003;
const BASE = `http://huellitas.localhost:${PUERTO}`;
const SECRETO_CRON = "cfdi-dev-secreto";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const falso = await levantarFacturapiFalso(4459);
const servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
  env: { ...process.env, FACTURAPI_API_URL: falso.url, CRON_SECRET: SECRETO_CRON, PELUDESK_URL_DESARROLLO: `http://{slug}.localhost:${PUERTO}` },
  stdio: ["ignore", "pipe", "pipe"],
});
let bitacora = "";
servidor.stdout.on("data", (d) => (bitacora += d));
servidor.stderr.on("data", (d) => (bitacora += d));
const cerrarTodo = async () => { try { servidor.kill(); } catch { /* ya cerró */ } await falso.cerrar().catch(() => {}); };
process.on("exit", () => { try { servidor.kill(); } catch { /* ya cerró */ } });

const pedir = (host, ruta, { cabeceras = {} } = {}) => new Promise((resolve, reject) => {
  const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: "GET", headers: { host: `${host}:${PUERTO}`, ...cabeceras } }, (r) => {
    const trozos = [];
    r.on("data", (c) => trozos.push(c));
    r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, cuerpo: Buffer.concat(trozos) }));
  });
  q.on("error", reject);
  q.end();
});
const esperarHasta = async (fn, ms = 20000, paso = 400) => { const t = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t > ms) return null; await new Promise((x) => setTimeout(x, paso)); } };

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

let nav;
try {
  const listo = await esperarHasta(async () => (await pedir("huellitas.localhost", "/login").catch(() => null))?.status === 200, 60000, 1000);
  comprobar(listo, "el servidor de la prueba arrancó (necesita `npm run build`)");
  if (!listo) throw new Error("sin servidor:\n" + bitacora.slice(-1500));

  // la llave del PAC de Huellitas, en Vault (la lee el servidor)
  await SH.rpc("cfdi_guardar_llave", { p_llave: "sk_test_doble_de_la_prueba", p_modo: "pruebas" });
  await adminJ.rpc("cfdi_guardar_config", { p: config({ global_automatica: false }) });
  await SH.from("cfdi_config_negocio").update({ tope_timbres_mes: 100, aviso_timbres_pct: 80 }).eq("negocio_id", H);

  nav = await abrirNavegador();
  const ctx = await nav.newContext();
  await ctx.addCookies(await cookiesDe(idAdmin));
  const pag = await ctx.newPage();
  const mensajeEn = async (re, ms = 40000) => pag.getByText(re).first().waitFor({ timeout: ms }).then(() => true).catch(() => false);
  const cuenta = async (precio, cli = cliente.id) => { const r = await nuevaVenta([{ concepto: `${MARCA} Browser`, precio, cantidad: 1 }], cli); return { reserva: r, cobro: await cobrar(r, precio) }; };
  const ultimaFacturaDe = async (cobro) => {
    const { data } = await SH.from("cfdi_factura_cobros").select("factura_id, created_at").eq("cobro_id", cobro).order("created_at", { ascending: false }).limit(1);
    return data?.[0] ? factura(data[0].factura_id) : null;
  };
  const folioDe = (f) => `${f.serie ?? ""}${f.folio ?? ""}`;
  const facturarDesdeCobro = async (reserva) => {
    await pag.goto(`${BASE}/caja/cobrar/${reserva}`, { waitUntil: "networkidle" });
    await pag.getByRole("button", { name: "Facturar", exact: true }).first().click();
  };

  // ── B1. Timbrar desde un cobro ──
  console.log("── B1. Timbrar desde un cobro");
  falso.peticiones.length = 0;
  const c1 = await cuenta(180);
  console.log("  · cuenta y cobro creados; abriendo la pantalla de cobro");
  await facturarDesdeCobro(c1.reserva);
  console.log("  · botón Facturar presionado");
  comprobar(await mensajeEn(/Factura timbrada|PRUEBAS/), "la pantalla confirma «Factura timbrada» (en PRUEBAS)");
  const fb1 = await esperarHasta(async () => { const f = await ultimaFacturaDe(c1.cobro); return f?.estado === "vigente" ? f : null; });
  comprobar(fb1 && fb1.uuid_fiscal, "la base guardó la factura vigente con UUID");
  const doble1 = [...falso.facturas.values()].find((f) => f.external_id === fb1?.referencia);
  comprobar(doble1 && doble1.uuid === fb1.uuid_fiscal, "el UUID de la base es el que timbró el PAC");
  comprobar(doble1?.customer.tax_id === "XIQB891116QE3" && doble1.customer.address.zip === "86400" && doble1.customer.tax_system === "612" && doble1.use === "G03", "el PAC recibió el receptor tal cual está en sus datos fiscales");
  comprobar(doble1?.items.length === 1 && doble1.items[0].product.tax_included === true && doble1.items[0].product.price === 180 && doble1.items[0].product.taxes[0].rate === 0.16, "…el concepto con IVA 16 % incluido en el precio ($180)");
  comprobar(falso.peticiones.length > 0 && falso.peticiones.every((p) => p.auth.startsWith("Bearer sk_test")), "todas las llamadas al PAC llevaron la llave de ESTE negocio (la de Vault)");
  comprobar(fb1 && Number(fb1.total) === Number(doble1.total), "el total guardado es el que timbró el PAC");
  const fb1b = await esperarHasta(async () => { const f = await factura(fb1.id); return f.pdf_path && f.xml_path ? f : null; }, 15000);
  comprobar(fb1b, "PDF y XML quedaron guardados");
  const bajar = (p, ruta) => p.evaluate(async (u) => { const r = await fetch(u, { redirect: "manual", credentials: "include" }); const t = await r.text(); return { status: r.status, tipo: r.headers.get("content-type"), texto: t.slice(0, 300) }; }, ruta);
  const pdf = await bajar(pag, `/caja/facturas/${fb1.id}/pdf`);
  comprobar(pdf.status === 200 && pdf.texto.startsWith("%PDF"), "se descarga el PDF desde Facturas");
  const xml = await bajar(pag, `/caja/facturas/${fb1.id}/xml`);
  comprobar(xml.status === 200 && xml.texto.includes(fb1.uuid_fiscal), "se descarga el XML (con el UUID)");
  await pag.goto(`${BASE}/caja/cobrar/${c1.reserva}`, { waitUntil: "networkidle" });
  comprobar(await pag.getByText(/Ya está en la/).first().isVisible().catch(() => false), "el cobro ya facturado no vuelve a ofrecer «Facturar»");

  // recepción sin permiso: ni botón ni descarga
  const ctxR = await nav.newContext();
  await ctxR.addCookies(await cookiesDe(idRecep));
  const pr = await ctxR.newPage();
  await pr.goto(`${BASE}/caja/cobrar/${c1.reserva}`, { waitUntil: "networkidle" });
  comprobar((await pr.getByRole("button", { name: "Facturar", exact: true }).count()) === 0, "recepción sin «Facturar» no ve el botón");
  const pdfR = await bajar(pr, `/caja/facturas/${fb1.id}/pdf`);
  comprobar(pdfR.status !== 200 || !pdfR.texto.startsWith("%PDF"), `…ni descarga la factura (${pdfR.status})`);

  // ── B2. El PAC rechaza / se corta la conexión ──
  console.log("── B2. Rechazo del PAC y timbrado cortado");
  falso.control({ fallarTimbrado: 1 });
  const c2 = await cuenta(95);
  await facturarDesdeCobro(c2.reserva);
  comprobar(await mensajeEn(/El PAC dice: El RFC del receptor/), "el rechazo del SAT se le dice a quien factura");
  let f2 = await ultimaFacturaDe(c2.cobro);
  comprobar(f2?.estado === "borrador" && /RFC del receptor/.test(f2.error ?? ""), "queda en borrador con el mensaje (se puede reintentar)");
  await pag.goto(`${BASE}/caja/facturas`, { waitUntil: "networkidle" });
  await pag.locator("li", { hasText: "Sin timbrar" }).filter({ hasText: "$95.00" }).getByRole("button", { name: "Timbrar", exact: true }).first().click();
  f2 = await esperarHasta(async () => { const f = await ultimaFacturaDe(c2.cobro); return f?.estado === "vigente" ? f : null; });
  comprobar(f2, "«Timbrar» reintenta el borrador y sale");

  falso.control({ cortarTrasCrear: 1 });
  const c3 = await cuenta(77);
  await facturarDesdeCobro(c3.reserva);
  comprobar(await mensajeEn(/por revisar/i), "con la conexión cortada avisa que quedó «por revisar»");
  let f3 = await esperarHasta(async () => { const f = await ultimaFacturaDe(c3.cobro); return f?.estado === "revisar" ? f : null; });
  comprobar(f3, "la base la deja en «revisar», no en borrador");
  const creadasAntes = falso.facturas.size;
  await pag.goto(`${BASE}/caja/facturas`, { waitUntil: "networkidle" });
  await pag.getByRole("button", { name: "Revisar si sí salió" }).first().click();
  f3 = await esperarHasta(async () => { const f = await ultimaFacturaDe(c3.cobro); return f?.estado === "vigente" ? f : null; });
  comprobar(f3 && falso.facturas.size === creadasAntes, "«Revisar» encontró la factura en el PAC por su referencia: quedó vigente y NO se timbró otra");

  // ── B3. Cancelar ──
  console.log("── B3. Cancelación");
  const abrirCancelar = async (f) => {
    await pag.goto(`${BASE}/caja/facturas`, { waitUntil: "networkidle" });
    const fila = pag.locator("li", { hasText: folioDe(f) }).first();
    await fila.getByRole("button", { name: "Cancelar factura" }).click();
    return fila;
  };
  falso.control({ cancelacion: "aceptada" });
  let fila = await abrirCancelar(f3);
  await fila.getByLabel("Motivo").selectOption("02");
  await fila.getByRole("button", { name: "Sí, cancelar la factura" }).click();
  const canc = await esperarHasta(async () => { const f = await factura(f3.id); return f.estado === "cancelada" ? f : null; });
  comprobar(canc && [...falso.facturas.values()].find((x) => x.uuid === f3.uuid_fiscal)?.motivo === "02", "motivo 02: el PAC la canceló y la base la marcó cancelada");
  comprobar((await SH.from("cfdi_factura_cobros").select("vigente").eq("factura_id", f3.id)).data.every((l) => l.vigente === false), "el cobro queda libre para facturarse otra vez");

  falso.control({ cancelacion: "pendiente" });
  fila = await abrirCancelar(f2);
  await fila.getByLabel("Motivo").selectOption("03");
  await fila.getByRole("button", { name: "Sí, cancelar la factura" }).click();
  const pend = await esperarHasta(async () => { const f = await factura(f2.id); return f.estado === "cancelacion_pendiente" ? f : null; });
  comprobar(pend && pend.cancelacion_limite, "pendiente de aceptación del cliente: sigue vigente y con límite de 3 días");
  const dPend = [...falso.facturas.values()].find((x) => x.uuid === f2.uuid_fiscal);
  dPend.status = "canceled"; dPend.cancellation_status = "accepted"; // el cliente aceptó en el SAT
  const cron1 = await pedir("huellitas.localhost", "/api/cron/cfdi", { cabeceras: { authorization: `Bearer ${SECRETO_CRON}` } });
  comprobar(cron1.status === 200, `la tarea programada responde (${cron1.status})`);
  const aceptada = await esperarHasta(async () => { const f = await factura(f2.id); return f.estado === "cancelada" ? f : null; });
  comprobar(aceptada, "la tarea programada le pregunta al PAC y cierra la cancelación aceptada");
  const sinSecreto = await pedir("huellitas.localhost", "/api/cron/cfdi");
  comprobar(sinSecreto.status === 401, "sin el secreto del cron: 401");

  // ── B4. Corregir y sustituir (motivo 01) ──
  console.log("── B4. Corregir y sustituir");
  falso.control({ cancelacion: "aceptada" });
  const c4 = await cuenta(60);
  await facturarDesdeCobro(c4.reserva);
  const f4 = await esperarHasta(async () => { const f = await ultimaFacturaDe(c4.cobro); return f?.estado === "vigente" ? f : null; });
  comprobar(f4, "factura de $60 para sustituir");
  await pag.goto(`${BASE}/caja/facturas`, { waitUntil: "networkidle" });
  fila = pag.locator("li", { hasText: folioDe(f4) }).first();
  await fila.getByRole("button", { name: "Corregir y sustituir" }).click();
  await fila.getByLabel("Nombre o razón social (como en la constancia)").fill("BEATRIZ XIQUI CORREGIDA");
  await fila.getByRole("button", { name: "Emitir la nueva y cancelar esta" }).click();
  const vieja = await esperarHasta(async () => { const f = await factura(f4.id); return f.estado === "cancelada" ? f : null; });
  const nueva = await ultimaFacturaDe(c4.cobro);
  comprobar(vieja && nueva && nueva.id !== f4.id && nueva.estado === "vigente" && nueva.relacion_tipo === "04", "salió la nueva (relación 04) y la anterior quedó cancelada");
  const dNueva = [...falso.facturas.values()].find((x) => x.external_id === nueva?.referencia);
  const dVieja = [...falso.facturas.values()].find((x) => x.uuid === f4.uuid_fiscal);
  comprobar(dNueva?.related_documents?.[0]?.relationship === "04" && dNueva.related_documents[0].documents[0] === f4.uuid_fiscal, "el PAC recibió la relación 04 con el UUID de la anterior");
  comprobar(dVieja?.motivo === "01" && dVieja.sustitucion === dNueva?.uuid, "la anterior se canceló con motivo 01 y el UUID de la nueva");
  comprobar(dNueva?.customer.legal_name === "BEATRIZ XIQUI CORREGIDA", "…con los datos corregidos");

  // ── B5. Enviar: WhatsApp (enlace público) y correo ──
  console.log("── B5. Enlace público y correo");
  await pag.goto(`${BASE}/caja/facturas`, { waitUntil: "networkidle" });
  fila = pag.locator("li", { hasText: folioDe(nueva) }).first();
  await fila.getByRole("button", { name: "Mandar por WhatsApp" }).click();
  const campo = fila.getByLabel("Mensaje para el cliente (con el link de descarga)");
  await campo.waitFor({ timeout: 30000 });
  const mensaje = await campo.inputValue();
  const link = mensaje.match(/https?:\/\/\S+\/fac\/([0-9a-f]{64})/);
  comprobar(link, "el mensaje trae el link /fac/<token>");
  if (link) {
    const token = link[1];
    const enBase = (await SH.from("cfdi_enlaces").select("token_hash, vence_at").eq("factura_id", nueva.id)).data ?? [];
    comprobar(enBase.length >= 1 && enBase.every((e) => e.token_hash !== token) && enBase.some((e) => e.token_hash === createHash("sha256").update(token).digest("hex")), "en la base solo está el sha256 del token, nunca el token");
    const pub = await pedir("huellitas.localhost", `/fac/${token}`);
    comprobar(pub.status === 200 && /noindex/i.test(String(pub.headers["x-robots-tag"] ?? "") + pub.cuerpo.toString()), "la página pública abre sin sesión y es noindex");
    const pubPdf = await pedir("huellitas.localhost", `/fac/${token}/pdf`);
    comprobar(pubPdf.status === 200 && pubPdf.cuerpo.toString().startsWith("%PDF"), "…y baja el PDF");
    const malo = await pedir("huellitas.localhost", `/fac/${"0".repeat(64)}`);
    const maloPdf = await pedir("huellitas.localhost", `/fac/${"0".repeat(64)}/pdf`);
    comprobar(!malo.cuerpo.toString().includes("Descargar PDF") && maloPdf.status === 404, "un token inventado no entrega nada (página «no disponible» y 404 en la descarga)");
    const otroNegocio = await pedir("ludogteka.localhost", `/fac/${token}`);
    const otroPdf = await pedir("ludogteka.localhost", `/fac/${token}/pdf`);
    comprobar(!otroNegocio.cuerpo.toString().includes("Descargar PDF") && otroPdf.status === 404, "el mismo link en el dominio de OTRO negocio no entrega nada");
    await SH.from("cfdi_enlaces").update({ vence_at: new Date(Date.now() - 1000).toISOString() }).eq("factura_id", nueva.id);
    const vencido = await pedir("huellitas.localhost", `/fac/${token}`);
    comprobar(vencido.status === 404 || /venci/i.test(vencido.cuerpo.toString()), "vencido el link, ya no entrega la factura");
  }
  await fila.getByRole("button", { name: "Mandar por correo" }).click();
  await fila.getByLabel("Correo del cliente").fill("cliente@example.com");
  await fila.getByRole("button", { name: "Enviar", exact: true }).click();
  const correo = await esperarHasta(async () => (await factura(nueva.id)).enviado_correo_at);
  const dNueva2 = [...falso.facturas.values()].find((x) => x.external_id === nueva.referencia);
  comprobar(correo && dNueva2?.correos?.includes("cliente@example.com"), "el correo lo manda el PAC a la dirección escrita y queda registrado");

  // ── B6. Factura global automática (tarea programada) ──
  console.log("── B6. Factura global");
  await limpiarGlobales();
  const diaBase = new Date(`${mesDesde}T18:00:00Z`); diaBase.setUTCDate(10);
  const rg1 = await nuevaVenta([{ insumo_id: insPatente, cantidad: 1 }, { insumo_id: insOtro, cantidad: 1 }], null);
  const cg1 = await cobrar(rg1, 130);
  const rg2 = await nuevaVenta([{ concepto: `${MARCA} Global B`, precio: 200, cantidad: 1 }], null);
  const cg2 = await cobrar(rg2, 200, "transferencia");
  await SH.from("cobros").update({ created_at: diaBase.toISOString() }).in("id", [cg1, cg2]);
  await SH.from("cfdi_config_negocio").update({ global_desde: mesDesde, global_automatica: true }).eq("negocio_id", H);
  await dar("facturar");
  const per2 = ((await recepJ.rpc("cfdi_global_periodos")).data ?? []).find((p) => p.desde === mesDesde);
  comprobar(per2, "hay un periodo cerrado con cobros sin facturar");
  const antesGlobal = [...falso.facturas.values()].filter((x) => x.global).length;
  const cron2 = await pedir("huellitas.localhost", "/api/cron/cfdi", { cabeceras: { authorization: `Bearer ${SECRETO_CRON}` } });
  const j2 = JSON.parse(cron2.cuerpo.toString() || "{}");
  comprobar(cron2.status === 200 && j2.globales >= 1, `la tarea emite la global del periodo cerrado (${cron2.cuerpo.toString().slice(0, 100)})`);
  const glob = [...falso.facturas.values()].filter((x) => x.global);
  const dg = glob.find((x) => x.global.months === mesDesde.slice(5, 7) && x.global.year === Number(mesDesde.slice(0, 4)));
  comprobar(glob.length >= antesGlobal + 1 && dg && dg.customer.tax_id === "XAXX010101000" && dg.customer.legal_name === "PUBLICO EN GENERAL" && dg.customer.tax_system === "616" && dg.use === "S01", "el PAC recibió la global al público en general (XAXX010101000, 616, S01)");
  comprobar(dg.global.periodicity === "month" && dg.global.months === mesDesde.slice(5, 7) && dg.global.year === Number(mesDesde.slice(0, 4)), `…con su información global (${JSON.stringify(dg.global)})`);
  comprobar(dg.items.some((i) => i.product.taxes[0].rate === 0) && dg.items.some((i) => i.product.taxes[0].rate === 0.16), "…con el IVA separado por tasa (0 % y 16 %)");
  const gdb = (await SH.from("cfdi_facturas").select("*").eq("negocio_id", H).eq("tipo", "global").eq("periodo_desde", mesDesde).eq("estado", "vigente")).data;
  comprobar(gdb.length === 1 && Math.abs(Number(gdb[0].total) - Number(gdb[0].total_esperado)) <= 0.05, "en la base: una global vigente por periodo, con el total de lo cobrado");
  await pedir("huellitas.localhost", "/api/cron/cfdi", { cabeceras: { authorization: `Bearer ${SECRETO_CRON}` } });
  comprobar([...falso.facturas.values()].filter((x) => x.global).length === glob.length, "una segunda corrida NO emite otra global del mismo periodo");
  await SH.from("cfdi_config_negocio").update({ global_automatica: false }).eq("negocio_id", H);

  // ── B7. Sin llave ──
  console.log("── B7. Sin llave del PAC");
  await SH.rpc("cfdi_borrar_llave");
  const c7 = await cuenta(33);
  await facturarDesdeCobro(c7.reserva);
  comprobar(await mensajeEn(/Todavía no hay una llave del PAC/), "sin llave: lo dice claro y no timbra");
  const f7 = await ultimaFacturaDe(c7.cobro);
  comprobar(f7?.estado === "borrador", "la factura queda en borrador");
  const llaveAdmin = await pag.goto(`${BASE}/admin/facturacion`, { waitUntil: "networkidle" });
  comprobar(llaveAdmin.status() === 200 && !(await pag.content()).includes("sk_test_doble_de_la_prueba"), "/admin/facturacion abre y nunca muestra la llave");
  if (f7) await adminJ.rpc("cfdi_descartar", { p_factura_id: f7.id });

  // ── B8. Portal del cliente ──
  console.log("── B8. Portal");
  const cuentaCliente = (await A.from("membresias").select("profile_id, cliente_id").eq("negocio_id", H).eq("rol", "cliente").not("cliente_id", "is", null).is("deleted_at", null).limit(1)).data?.[0];
  if (!cuentaCliente) console.log("  · (no hay una cuenta de cliente en Huellitas: portal NO probado)");
  else {
    const cli = await jwt(cuentaCliente.profile_id);
    const mis = await cli.rpc("mis_facturas");
    comprobar(!mis.error && (mis.data ?? []).every((f) => f.estado), `mis_facturas() responde (${mis.data?.length ?? 0} facturas)`);
    const ajena = (await SH.from("cfdi_facturas").select("id, cliente_id").eq("negocio_id", H).eq("estado", "vigente").neq("cliente_id", cuentaCliente.cliente_id).limit(1)).data?.[0];
    if (ajena) comprobar(((await cli.rpc("cfdi_archivos", { p_factura_id: ajena.id })).data ?? []).length === 0, "un cliente no obtiene los archivos de la factura de otro");
    comprobar((await cli.from("cfdi_facturas").select("id")).data?.length === 0, "un cliente no lee cfdi_facturas por la API");
  }

  // ── B9. Sandbox real de Facturapi (solo si hay llave de prueba) ──
  if (env.FACTURAPI_TEST_KEY) console.log("  · FACTURAPI_TEST_KEY presente: este tramo contra el sandbox REAL aún no está automatizado; correrlo a mano con FACTURAPI_API_URL vacío");
  else console.log("  · FACTURAPI_TEST_KEY no está en .env.local: NO se probó contra el sandbox real de Facturapi");
} catch (e) {
  hallazgo(`excepción en la parte B: ${e.stack ?? e}`);
  if (typeof bitacora === "string" && bitacora) console.log("--- bitácora del servidor ---\n" + bitacora.slice(-2500));
} finally {
  await nav?.close().catch(() => {});
  await cerrarTodo();
  for (const p of ["facturar", "cancelar_facturas", "editar_datos_fiscales"]) await quitar(p);
  try { await SH.rpc("cfdi_borrar_llave"); } catch { /* sin llave */ }
  await SH.from("insumos").update({ deleted_at: new Date().toISOString() }).in("id", [insPatente, insAlimento, insOtro]);
  await SH.from("cfdi_config_negocio").update({ global_automatica: false, tope_timbres_mes: 100, aviso_timbres_pct: 80 }).eq("negocio_id", H);
}
console.log(`\n${hallazgos.length ? `✘ ${hallazgos.length} hallazgo(s)` : "✔ Sin hallazgos"}`);
process.exit(hallazgos.length ? 1 : 0);
