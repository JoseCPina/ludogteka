// Uso: node scripts/auditoria/negocio-prueba-dev.mjs   (SOLO DESARROLLO)
//
// Crea (o reutiliza) el negocio de prueba "Huellitas" en desarrollo, con
// operación real hecha por SU personal (JWT de cada quien, con el negocio
// en el encabezado): clientes, perros, una cuenta con cargo y cobro, turno
// de caja, contrato generado, empleado y gasto. Además:
//   · una persona que es cliente de Ludogteka Y de Huellitas (la misma
//     cuenta, dos membresías, dos expedientes);
//   · una estilista que trabaja en los dos.
// Todo lo de Huellitas lleva la marca ZZSECRETOB en algún texto, para que
// la auditoría entre negocios lo encuentre si se filtra a Ludogteka.
// Deja en la carpeta temporal del sistema los ids que usa
// scripts/auditoria/entre-negocios.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");

const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const MARCA = "ZZSECRETOB";
const SALIDA = path.join(os.tmpdir(), "peludesk-negocio-b.json");
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

const servicioEn = (negocio) =>
  createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocio } } });
const comoPersona = async (id, negocio) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": negocio } },
  });
const exigir = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
};

// ── Negocio ──
let { data: negocio } = await A.from("negocios").select("id").eq("slug", "huellitas").maybeSingle();
if (!negocio) {
  const id = exigir(
    await A.rpc("crear_negocio", { p_slug: "huellitas", p_nombre: "Huellitas", p_zona_horaria: "America/Monterrey", p_ciudad: "Monterrey" }),
    "crear_negocio"
  );
  negocio = { id };
  console.log("negocio creado", id);
}
const B = negocio.id;
const SB = servicioEn(B);
const SA = servicioEn(LUDOGTEKA);

// ── Personas ──
async function cuenta(email, nombre) {
  const { data: existente } = await A.rpc("usuario_por_email", { p_email: email });
  if (existente) return existente;
  const creado = exigir(
    await A.auth.admin.createUser({ email, password: `Prueba-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { nombre_completo: nombre } }),
    `crear ${email}`
  );
  return creado.user.id;
}
async function membresia(profileId, negocioId) {
  return (await A.from("membresias").select("rol, cliente_id").eq("profile_id", profileId).eq("negocio_id", negocioId).is("deleted_at", null).maybeSingle()).data;
}

const adminB = await cuenta("admin@huellitas.prueba", `Admin Huellitas ${MARCA}`);
if (!(await membresia(adminB, B))) exigir(await A.rpc("agregar_admin_negocio", { p_negocio_id: B, p_profile_id: adminB }), "agregar_admin_negocio");
const recepcionB = await cuenta("recepcion@huellitas.prueba", `Recepción Huellitas ${MARCA}`);
if (!(await membresia(recepcionB, B))) exigir(await SB.rpc("asignar_rol_staff", { p_user_id: recepcionB, p_rol: "recepcion", p_nombre_completo: `Recepción Huellitas ${MARCA}` }), "rol recepción");
const esteticaB = await cuenta("estetica@huellitas.prueba", `Estética Huellitas ${MARCA}`);
if (!(await membresia(esteticaB, B))) exigir(await SB.rpc("asignar_rol_staff", { p_user_id: esteticaB, p_rol: "estetica", p_nombre_completo: `Estética Huellitas ${MARCA}` }), "rol estética");

// La estilista que trabaja en los dos: una de Ludogteka, con acceso también a Huellitas.
const { data: estLudo } = await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "estetica").is("deleted_at", null).order("created_at").limit(1).single();
const esteticaAmbos = estLudo.profile_id;
if (!(await membresia(esteticaAmbos, B))) exigir(await SB.rpc("asignar_rol_staff", { p_user_id: esteticaAmbos, p_rol: "estetica" }), "estética en los dos");

const ADM = await comoPersona(adminB, B);
const REC = await comoPersona(recepcionB, B);

// ── Clientes y perros de Huellitas (los captura recepción de Huellitas) ──
async function clienteB(nombre, telefono) {
  const { data: ya } = await SB.from("clientes").select("id").eq("negocio_id", B).eq("telefono", telefono).is("deleted_at", null).maybeSingle();
  if (ya) return ya.id;
  return exigir(await REC.from("clientes").insert({ nombre, telefono }).select("id").single(), `cliente ${nombre}`).id;
}
async function perroB(clienteId, nombre) {
  const { data: ya } = await SB.from("perros").select("id").eq("cliente_id", clienteId).eq("nombre", nombre).is("deleted_at", null).maybeSingle();
  if (ya) return ya.id;
  return exigir(await REC.from("perros").insert({ cliente_id: clienteId, nombre, raza: "Criollo" }).select("id").single(), `perro ${nombre}`).id;
}

// Cliente solo de Huellitas, con cuenta.
const clienteSoloB = await clienteB(`Dueña Huellitas ${MARCA}`, "8110000001");
const perroSoloB = await perroB(clienteSoloB, `Firulais ${MARCA}`);
const cuentaSoloB = await cuenta("cliente@huellitas.prueba", `Dueña Huellitas ${MARCA}`);
if (!(await membresia(cuentaSoloB, B))) exigir(await SB.rpc("vincular_membresia_cliente", { p_user_id: cuentaSoloB, p_cliente_id: clienteSoloB }), "vincular cliente B");

// Cliente de los dos: un cliente de Ludogteka con cuenta, dado de alta
// también en Huellitas con el mismo teléfono y ligado a su misma cuenta.
const { data: ambos } = await A.from("membresias")
  .select("profile_id, cliente_id, clientes(telefono, nombre)")
  .eq("negocio_id", LUDOGTEKA).eq("rol", "cliente").not("cliente_id", "is", null).is("deleted_at", null)
  .order("created_at").limit(1).single();
const cuentaAmbos = ambos.profile_id;
const clienteAmbosA = ambos.cliente_id;
const clienteAmbosB = await clienteB(`${ambos.clientes.nombre} en Huellitas ${MARCA}`, ambos.clientes.telefono);
const perroAmbosB = await perroB(clienteAmbosB, `Canela ${MARCA}`);
if (!(await membresia(cuentaAmbos, B))) exigir(await SB.rpc("vincular_membresia_cliente", { p_user_id: cuentaAmbos, p_cliente_id: clienteAmbosB }), "vincular cliente de los dos");

// ── Caja: turno, cargo suelto (crea la cuenta) y cobro ──
let { data: turno } = await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").maybeSingle();
if (!turno) turno = exigir(await REC.from("turnos_caja").insert({ fondo_inicial: 500, notas_apertura: MARCA }).select("id").single(), "abrir turno");
const { data: comida } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("monto_libre", true).is("deleted_at", null).limit(1).single();
let { data: reserva } = await SB.from("reservas").select("id").eq("negocio_id", B).eq("cliente_id", clienteSoloB).is("deleted_at", null).limit(1).maybeSingle();
if (!reserva) {
  const cargo = exigir(
    await REC.rpc("crear_cargo_suelto", { p_cliente_id: clienteSoloB, p_servicio_id: comida.id, p_cantidad: 1, p_importe: 123, p_descripcion: `Croquetas ${MARCA}`, p_perro_id: perroSoloB, p_notas: MARCA }),
    "cargo suelto"
  );
  const reservaId = typeof cargo === "string" ? cargo : cargo?.reserva_id ?? cargo?.[0]?.reserva_id;
  reserva = reservaId ? { id: reservaId } : (await SB.from("reservas").select("id").eq("negocio_id", B).eq("cliente_id", clienteSoloB).limit(1).single()).data;
}
const { data: cobroPrevio } = await SB.from("cobros").select("id").eq("negocio_id", B).eq("reserva_id", reserva.id).limit(1).maybeSingle();
if (!cobroPrevio) exigir(await REC.rpc("registrar_cobro", { p_reserva_id: reserva.id, p_notas: MARCA, p_metodos: [{ metodo: "efectivo", monto: 123 }] }), "cobro");

// ── Contrato: plantilla publicada y contrato generado ──
const { data: tipo } = await SB.from("tipos_contrato").select("id").eq("negocio_id", B).is("deleted_at", null).order("orden").limit(1).single();
const { data: plantilla } = await SB.from("plantillas_contrato").select("id").eq("negocio_id", B).eq("tipo_contrato_id", tipo.id).limit(1).maybeSingle();
if (!plantilla) exigir(await ADM.rpc("publicar_plantilla", { p_tipo_contrato_id: tipo.id, p_titulo: `Contrato Huellitas ${MARCA}`, p_cuerpo: `Contrato de prueba ${MARCA} para {{perro_nombre}}.` }), "publicar plantilla");
const { data: contratoPrevio } = await SB.from("contratos").select("id").eq("negocio_id", B).eq("perro_id", perroSoloB).limit(1).maybeSingle();
if (!contratoPrevio) exigir(await REC.rpc("generar_contrato", { p_perro_id: perroSoloB, p_tipo_contrato_id: tipo.id }), "generar contrato");

// ── Empleado y gasto ──
const { data: empPrevio } = await SB.from("empleados").select("id").eq("negocio_id", B).limit(1).maybeSingle();
if (!empPrevio) exigir(await ADM.from("empleados").insert({ nombre: `Bañador ${MARCA}`, puesto: "Estilista", fecha_ingreso: hoy }).select("id").single(), "empleado");
const { data: gastoPrevio } = await SB.from("gastos").select("id").eq("negocio_id", B).limit(1).maybeSingle();
if (!gastoPrevio) {
  const { data: cat } = await SB.from("categorias_gasto").select("id").eq("negocio_id", B).is("deleted_at", null).limit(1).single();
  exigir(await ADM.rpc("registrar_gasto", { p_concepto: `Renta ${MARCA}`, p_categoria_id: cat.id, p_monto: 4321, p_fecha_pago: hoy, p_metodo: "transferencia", p_proveedor_id: null, p_periodo_desde: null, p_periodo_hasta: null, p_comprobante_path: null, p_notas: MARCA }), "gasto");
}

// ── Una foto en Storage bajo el expediente de Huellitas ──
const rutaFoto = `${clienteSoloB}/${perroSoloB}/perfil/foto.jpg`;
await SB.storage.from("perros-archivos").upload(rutaFoto, new Blob([Buffer.from(MARCA)], { type: "image/jpeg" }), { upsert: true });

// ── Lo que la auditoría necesita ──
const tablasB = ["clientes", "perros", "reservas", "cargos_aplicados", "cobros", "cobro_metodos", "turnos_caja", "contratos", "plantillas_contrato", "tipos_contrato", "empleados", "gastos", "servicios", "grupos_raza", "categorias_gasto", "membresias", "cupo_configuracion", "horario_semana"];
const idsB = [B];
for (const t of tablasB) {
  const { data, error } = await SB.from(t).select("id").eq("negocio_id", B);
  if (error) throw new Error(`${t}: ${error.message}`);
  idsB.push(...data.map((f) => f.id));
}
fs.writeFileSync(
  SALIDA,
  JSON.stringify({ B, adminB, recepcionB, esteticaB, esteticaAmbos, cuentaSoloB, cuentaAmbos, clienteSoloB, clienteAmbosA, clienteAmbosB, perroSoloB, perroAmbosB, reservaB: reserva.id, rutaFoto, idsB: [...new Set(idsB)] }, null, 1)
);
const conteo = async (t) => (await SB.from(t).select("id", { count: "exact", head: true }).eq("negocio_id", B)).count;
console.log(`Huellitas ${B}: clientes ${await conteo("clientes")}, perros ${await conteo("perros")}, reservas ${await conteo("reservas")}, cobros ${await conteo("cobros")}, contratos ${await conteo("contratos")}, empleados ${await conteo("empleados")}, gastos ${await conteo("gastos")}, membresías ${await conteo("membresias")}`);
console.log(`ids para la auditoría: ${idsB.length} → ${SALIDA}`);
void SA;
