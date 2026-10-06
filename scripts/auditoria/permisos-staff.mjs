// Permisos delegables, contra la base directa, con JWT real (DESARROLLO).
// Uso: node scripts/auditoria/permisos-staff.mjs   (sale con 1 si algo falla)
//
// La MISMA recepcionista, sin y con cada permiso: sin él la base lo tiene
// que rechazar aunque se lo pidan directo a la API; con él tiene que
// funcionar de verdad (y los reportes tienen que dar lo mismo que a admin).
// Luego, con todos prendidos, lo que nunca se delega. Al terminar le
// quita todos los permisos. Crea datos de prueba en desarrollo (un insumo,
// un proveedor, una compra, una reserva cancelada): nunca correr contra
// producción.
import { createClient } from "@supabase/supabase-js";
import { A, NEGOCIO, URL, env, tokenDe } from "./sesiones-dev.mjs";

const PERMISOS = [
  "inventario_costos", "tarifas", "reportes_financieros", "personal", "nomina", "gastos",
  "configuracion_negocio", "excepciones_reserva", "descuentos_sin_tope", "plantillas_contrato", "corregir_estilista", "corregir_servicio", "tarjeta_manual",
];

const conToken = (t) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${t}` } },
});
// PeluDesk: el rol es la membresía en el negocio auditado (NEGOCIO).
const perfil = async (rol, salto = 0) => {
  const { data } = await A.from("membresias").select("id:profile_id, created_at, profiles(nombre_completo)").eq("negocio_id", NEGOCIO).eq("rol", rol).is("deleted_at", null).order("created_at").range(salto, salto).single();
  return data ? { id: data.id, nombre_completo: data.profiles?.nombre_completo ?? null } : null;
};

const rec = await perfil("recepcion");
const adm = await perfil("admin");
const est = await perfil("estetica");
const R = conToken(await tokenDe(rec.id));
const ADM = conToken(await tokenDe(adm.id));
const ANON = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const fallas = [];
const ok = (cond, texto) => { console.log(`${cond ? "  ✔" : "  ✘"} ${texto}`); if (!cond) fallas.push(texto); };
const quitarTodos = async () => { for (const p of PERMISOS) await ADM.rpc("revocar_permiso", { p_profile_id: rec.id, p_permiso: p }); };
const dar = async (p) => { const { error } = await ADM.rpc("otorgar_permiso", { p_profile_id: rec.id, p_permiso: p }); if (error) throw error; };

// ── Datos de prueba ──────────────────────────────────────────────────
const { data: areaInv } = await A.from("areas_inventario").select("id").is("deleted_at", null).limit(1).single();
const { data: unidad } = await A.from("unidades_medida").select("id").limit(1).single();
let { data: insumo } = await A.from("insumos").select("id").eq("nombre", "Prueba de permisos").maybeSingle();
if (!insumo) {
  const r = await A.from("insumos").insert({ nombre: "Prueba de permisos", area_id: areaInv.id, unidad_compra_id: unidad.id, unidad_consumo_id: unidad.id }).select("id").single();
  if (r.error) throw new Error("insumo de prueba: " + r.error.message);
  insumo = r.data;
}
let { data: proveedor } = await A.from("proveedores").select("id").eq("nombre", "Proveedor de prueba de permisos").maybeSingle();
if (!proveedor) proveedor = (await A.from("proveedores").insert({ nombre: "Proveedor de prueba de permisos" }).select("id").single()).data;

const { data: tarifa } = await A.from("tarifas").select("id, precio").is("deleted_at", null).limit(1).single();
const { data: horario } = await A.rpc("horario_semana_vigente");
const dias = (horario ?? []).map((h) => ({ dia_semana: h.dia_semana, hora_apertura: h.hora_apertura ?? "", hora_cierre: h.hora_cierre ?? "" }));
const { data: plantilla } = await A.from("plantillas_contrato").select("id, requiere_refirma").eq("activa", true).limit(1).single();

// Una reserva con una estancia (la crea admin, que sí puede saltar
// bloqueos) para probar descuentos arriba del tope.
const { data: perroPrueba } = await A.from("perros").select("id, cliente_id").is("deleted_at", null).eq("fallecido", false).not("tamano_id", "is", null).limit(1).single();
const { data: servDia } = await A.from("servicios").select("id").eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
// Cada corrida deja su estancia (cancelada) y el perro no puede traslapar:
// se busca el primer día hábil libre a partir de 40 días.
let fechaPrueba = new Date(Date.now() + 40 * 86400000);
const { data: reservaDesc } = await ADM.from("reservas").insert({ cliente_id: perroPrueba.cliente_id, notas: "Prueba de permisos (descuento)" }).select("id").single();
let estDesc, fecha;
for (let intento = 0; intento < 60; intento++, fechaPrueba = new Date(fechaPrueba.getTime() + 86400000)) {
  if ([0, 6].includes(fechaPrueba.getUTCDay())) continue;
  fecha = fechaPrueba.toISOString().slice(0, 10);
  const masUno = new Date(fechaPrueba.getTime() + 86400000).toISOString().slice(0, 10);
  estDesc = await ADM.from("estancias").insert({
    reserva_id: reservaDesc.id, perro_id: perroPrueba.id, servicio_id: servDia.id, fecha_entrada: fecha, fecha_salida: masUno,
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "prueba de permisos",
    bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "prueba de permisos",
  }).select("id").single();
  if (!estDesc.error || !/traslape/.test(estDesc.error.message)) break;
}
if (estDesc.error) throw new Error("estancia de prueba: " + estDesc.error.message);
const { data: tope } = await A.rpc("resolver_tope_descuento_recepcion", { p_fecha: fecha });
const topeRec = Number(tope?.[0]?.tope_recepcion ?? 0);
const { data: motivoDesc } = await A.from("catalogo_descuentos").select("id").is("deleted_at", null).limit(1).single();

let turnoTarjeta = null;
// ── Una prueba por permiso: devuelve true si la base lo DEJÓ hacer ────
const pruebas = {
  async inventario_costos() {
    const compra = await R.rpc("registrar_entrada_compra", { p_insumo_id: insumo.id, p_proveedor_id: proveedor.id, p_cantidad_compra: 1, p_costo_unitario: 10 });
    const { data: compras } = await R.from("compras_insumos").select("id");
    const { data: costo } = await R.rpc("costo_promedio_base_insumo", { p_insumo_id: insumo.id });
    const prov = await R.from("proveedores").update({ nombre: "Proveedor de prueba de permisos" }).eq("id", proveedor.id).select("id");
    const ref = await R.from("insumos_costos").upsert({ insumo_id: insumo.id, costo_unitario_compra: 10 }, { onConflict: "insumo_id" }).select("id");
    const sinCosto = await R.rpc("insumos_sin_costo");
    return {
      dejo: !compra.error && (ref.data ?? []).length === 1,
      ve: (compras ?? []).length > 0 && costo !== null && (prov.data ?? []).length === 1 && !sinCosto.error,
      detalle: compra.error?.message ?? ref.error?.message ?? sinCosto.error?.message,
    };
  },
  // «Nómina»: calcular y leer los pagos de TODOS (no solo los propios).
  async nomina() {
    const { data: emp } = await A.from("empleados").select("id").is("deleted_at", null).is("profile_id", null).limit(1).maybeSingle();
    if (!emp) return { dejo: false, ve: false, detalle: "no hay empleados sin cuenta en desarrollo: corre scripts/auditoria/empleados.mjs" };
    const calc = await R.rpc("calcular_nomina", { p_empleado_id: emp.id, p_desde: "2026-09-01", p_hasta: "2026-09-15" });
    const { data: esq } = await R.from("esquemas_pago").select("id");
    const { count: total } = await A.from("esquemas_pago").select("id", { count: "exact", head: true });
    return { dejo: !calc.error, ve: (esq ?? []).length === total && (total ?? 0) > 0, detalle: calc.error?.message };
  },
  // «Gastos»: ver los pendientes y leer TODOS los gastos.
  async gastos() {
    const r = await R.rpc("gastos_por_atender");
    const { data: vistos } = await R.from("gastos").select("id");
    const { count: total } = await A.from("gastos").select("id", { count: "exact", head: true });
    return { dejo: !r.error, ve: (vistos ?? []).length === total && (total ?? 0) > 0, detalle: r.error?.message ?? (total ? undefined : "no hay gastos en desarrollo: corre scripts/auditoria/gastos.mjs") };
  },
  async tarifas() {
    const r = await R.from("tarifas").update({ precio: tarifa.precio }).eq("id", tarifa.id).select("id");
    // El mismo permiso gobierna las razas: proponer una raza nueva y asignar el grupo de precio de una raza.
    const propuesta = await R.rpc("razas_proponer", { p_nombre: `Raza de prueba permisos ${Date.now()}`, p_variantes: [], p_tamano_id: null, p_pelaje_id: null, p_texto_norm: null });
    if (propuesta.data) await A.from("razas_propuestas").delete().eq("id", propuesta.data);
    const { data: rg } = await A.from("razas_grupo").select("raza_id, grupo_raza_id").is("deleted_at", null).limit(1).single();
    const asignado = await R.rpc("asignar_grupo_raza", { p_raza_id: rg.raza_id, p_grupo_raza_id: rg.grupo_raza_id });
    if (!asignado.error) await A.from("razas_grupo").delete().eq("raza_id", rg.raza_id).not("deleted_at", "is", null);
    const tarifaOk = (r.data ?? []).length === 1;
    return {
      dejo: tarifaOk || !propuesta.error || !asignado.error,
      ve: tarifaOk && !propuesta.error && !asignado.error,
      detalle: r.error?.message ?? propuesta.error?.message ?? asignado.error?.message,
    };
  },
  async reportes_financieros() {
    const args = { p_desde: "2026-01-01", p_hasta: "2027-12-31" };
    const r = await R.rpc("reporte_financiero_periodo", args);
    if (r.error) return { dejo: false, ve: false, detalle: r.error.message };
    const a = await ADM.rpc("reporte_financiero_periodo", args);
    return { dejo: true, ve: JSON.stringify(r.data) === JSON.stringify(a.data), detalle: "mismos números que admin" };
  },
  async personal() {
    const r = await R.rpc("listar_personal");
    return { dejo: !r.error, ve: (r.data ?? []).length > 0, detalle: r.error?.message };
  },
  async configuracion_negocio() {
    // Las políticas y reglas van con el mismo permiso que el horario. Se
    // reenvían las vigentes: la función reemplaza el objeto completo.
    const { data: vigentes } = await A.from("negocio_politicas").select("textos").is("deleted_at", null).maybeSingle();
    const pol = await R.rpc("guardar_politicas_negocio", { p_textos: vigentes?.textos ?? {} });
    if (pol.error) return { dejo: false, ve: false, detalle: `guardar_politicas_negocio: ${pol.error.message}` };
    const r = await R.rpc("guardar_horario_semana", { p_dias: dias });
    return { dejo: !r.error, ve: !r.error, detalle: r.error?.message };
  },
  async excepciones_reserva() {
    const { data: reserva } = await R.from("reservas").insert({ cliente_id: perroPrueba.cliente_id, notas: "Prueba de permisos (excepción)" }).select("id").single();
    const r = await R.from("estancias").insert({
      reserva_id: reserva.id, perro_id: perroPrueba.id, servicio_id: servDia.id,
      fecha_entrada: new Date(fechaPrueba.getTime() + 7 * 86400000).toISOString().slice(0, 10),
      fecha_salida: new Date(fechaPrueba.getTime() + 8 * 86400000).toISOString().slice(0, 10),
      bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "prueba de permisos",
      bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "prueba de permisos",
    }).select("id").single();
    if (r.data) await A.from("estancias").update({ estado: "cancelada" }).eq("id", r.data.id);
    const rechazoPorPermiso = /Excepciones al reservar/.test(r.error?.message ?? "");
    return { dejo: !r.error, ve: !r.error, detalle: r.error?.message, rechazoPorPermiso };
  },
  async descuentos_sin_tope() {
    const r = await R.rpc("aplicar_descuento", { p_reserva_id: reservaDesc.id, p_catalogo_descuento_id: motivoDesc.id, p_tipo: "monto_fijo", p_valor: topeRec + 1, p_motivo_adicional: "prueba de permisos" });
    if (!r.error) await A.from("descuentos_aplicados").update({ cancelado: true, motivo_cancelacion: "prueba de permisos" }).eq("reserva_id", reservaDesc.id).eq("cancelado", false);
    return { dejo: !r.error, ve: !r.error, detalle: r.error?.message };
  },
  // «Corregir estilista de servicios cerrados»: cambiar la estilista de una
  // cita ya terminada (con motivo). Antes de iniciar y en curso NO piden permiso.
  async corregir_estilista() {
    const { data: asignables } = await ADM.rpc("estilistas_asignables");
    const { data: cita } = await A.from("citas_estetica").select("id, empleado_id").eq("estado", "finalizada").is("deleted_at", null).not("empleado_id", "is", null).limit(1).maybeSingle();
    if (!cita || (asignables ?? []).length < 2) return { dejo: false, ve: false, detalle: "no hay una cita terminada y dos estilistas en desarrollo: corre scripts/auditoria/empleados.mjs" };
    const otra = asignables.find((e) => e.id !== cita.empleado_id);
    const r = await R.rpc("reasignar_estilista_cita", { p_cita_id: cita.id, p_empleado_id: otra.id, p_motivo: "prueba de permisos" });
    // Se deja como estaba (admin siempre puede).
    if (!r.error) await ADM.rpc("reasignar_estilista_cita", { p_cita_id: cita.id, p_empleado_id: cita.empleado_id, p_motivo: "prueba de permisos: se regresa" });
    return { dejo: !r.error, ve: !r.error, detalle: r.error?.message };
  },
  // «Corregir servicio de citas»: cambiar el servicio (y con él el precio) de una
  // cita, abierta o terminada. Se prueba con una cita y se deja como estaba (admin siempre puede).
  async corregir_servicio() {
    const { data: citas } = await A.from("citas_estetica").select("id, servicio_id").in("estado", ["reservada", "confirmada", "finalizada"]).is("deleted_at", null).order("created_at", { ascending: false }).limit(30);
    const { data: servs } = await ADM.from("servicios_cotizables").select("id").eq("categoria", "estetica");
    for (const c of citas ?? []) {
      for (const s of (servs ?? []).filter((x) => x.id !== c.servicio_id)) {
        const q = await ADM.rpc("cotizar_correccion_servicio", { p_cita_id: c.id, p_servicio_id: s.id });
        if (q.error || !q.data?.ok) continue;
        const r = await R.rpc("corregir_servicio_cita", { p_cita_id: c.id, p_servicio_id: s.id, p_motivo: "prueba de permisos" });
        if (!r.error) await ADM.rpc("corregir_servicio_cita", { p_cita_id: c.id, p_servicio_id: c.servicio_id, p_motivo: "prueba de permisos: se regresa" });
        return { dejo: !r.error, ve: !r.error, detalle: r.error?.message };
      }
    }
    return { dejo: false, ve: false, detalle: "no hay una cita (abierta o terminada) con otro servicio cotizable en desarrollo" };
  },
  // «Registrar tarjeta manual»: cobrar con «Tarjeta (registro manual)» (folio + motivo).
  // Se usa un turno abierto (si no hay, se abre uno de prueba y se cierra al final).
  async tarjeta_manual() {
    if (!turnoTarjeta) {
      const { data: abierto } = await A.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
      if (abierto) turnoTarjeta = { id: abierto.id, propio: false };
      else {
        const t = await ADM.from("turnos_caja").insert({ fondo_inicial: 0, notas_apertura: "prueba de permisos" }).select("id").single();
        if (t.error) return { dejo: false, ve: false, detalle: `no se pudo abrir un turno de prueba: ${t.error.message}` };
        turnoTarjeta = { id: t.data.id, propio: true };
      }
    }
    const folio = `PERM-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const r = await R.rpc("registrar_cobro", { p_reserva_id: reservaDesc.id, p_notas: "prueba de permisos (tarjeta manual)", p_metodos: [{ metodo: "tarjeta_manual", monto: 1, propina: 0, folio, motivo: "sin_senal" }] });
    const dejo = !r.error;
    if (dejo) {
      await A.from("tarjetas_manuales").update({ deleted_at: new Date().toISOString() }).eq("cobro_id", r.data);
      await A.from("cobros").update({ deleted_at: new Date().toISOString() }).eq("id", r.data);
    }
    return { dejo, ve: dejo, detalle: r.error?.message };
  },
  async plantillas_contrato() {
    const r = await R.rpc("marcar_requiere_refirma", { p_plantilla_id: plantilla.id, p_valor: plantilla.requiere_refirma });
    return { dejo: !r.error, ve: !r.error, detalle: r.error?.message };
  },
};

console.log(`Recepcionista de prueba: ${rec.nombre_completo ?? rec.id.slice(0, 8)} | tope de recepción: $${topeRec}`);
await quitarTodos();
for (const p of PERMISOS) {
  console.log(`\n── ${p}`);
  const sin = await pruebas[p]();
  ok(!sin.dejo, `sin el permiso, la base lo rechaza${sin.detalle ? ` (${sin.detalle.slice(0, 90)})` : ""}`);
  await dar(p);
  const con = await pruebas[p]();
  ok(con.dejo && con.ve, `con el permiso, funciona${con.detalle ? ` (${con.detalle.slice(0, 90)})` : ""}`);
  // Aislamiento: tener este permiso no abre otro.
  const otro = PERMISOS[(PERMISOS.indexOf(p) + 1) % PERMISOS.length];
  const cruzado = await pruebas[otro]();
  ok(!cruzado.dejo, `con «${p}» sigue sin poder «${otro}»`);
  await ADM.rpc("revocar_permiso", { p_profile_id: rec.id, p_permiso: p });
  const quitado = await pruebas[p]();
  ok(!quitado.dejo, "al quitarlo, se vuelve a rechazar");
}

console.log("\n── Lo que nunca se delega (con los ocho permisos prendidos)");
for (const p of PERMISOS) await dar(p);
const autoOtorgar = await R.rpc("otorgar_permiso", { p_profile_id: rec.id, p_permiso: "tarifas" });
ok(Boolean(autoOtorgar.error), `no puede darse ni dar permisos (${autoOtorgar.error?.message ?? "¡lo dejó!"})`);
const autoRevocar = await R.rpc("revocar_permiso", { p_profile_id: rec.id, p_permiso: "tarifas" });
ok(Boolean(autoRevocar.error), "no puede quitar permisos");
// El rol vive en la membresía (PeluDesk); profiles.rol es legado y
// también se prueba.
const rolEn = async (id) => (await A.from("membresias").select("rol").eq("negocio_id", NEGOCIO).eq("profile_id", id).is("deleted_at", null).single()).data?.rol;
const hacerseAdmin = await R.from("membresias").update({ rol: "admin" }).eq("negocio_id", NEGOCIO).eq("profile_id", rec.id).select("rol");
ok((await rolEn(rec.id)) === "recepcion", `no puede cambiarse el rol a admin (${hacerseAdmin.error?.message ?? "sin error, pero el rol no cambió"})`);
const hacerseAdminLegado = await R.from("profiles").update({ rol: "admin" }).eq("id", rec.id).select("rol");
const { data: rolLegado } = await A.from("profiles").select("rol").eq("id", rec.id).single();
ok(rolLegado.rol !== "admin", `tampoco en la columna legado profiles.rol (${hacerseAdminLegado.error?.message ?? "sin error, pero no cambió"})`);
const cambiarOtro = await R.from("membresias").update({ rol: "admin" }).eq("negocio_id", NEGOCIO).eq("profile_id", est.id).select("rol");
ok((await rolEn(est.id)) === "estetica", `no puede cambiarle el rol a otra persona (${cambiarOtro.error?.message ?? "sin error, pero no cambió"})`);
const asignar = await R.rpc("asignar_rol_staff", { p_user_id: est.id, p_rol: "recepcion" });
ok(Boolean(asignar.error), "no puede usar asignar_rol_staff");
const tope2 = await R.from("configuracion_descuentos").insert({ tope_recepcion: 999999 }).select("id");
ok(Boolean(tope2.error) || (tope2.data ?? []).length === 0, "no puede subirse el tope de descuentos de recepción");
const aEstetica = await ADM.rpc("otorgar_permiso", { p_profile_id: est.id, p_permiso: "tarifas" });
ok(Boolean(aEstetica.error), `a estética no se le pueden dar permisos (${aEstetica.error?.message ?? "¡lo dejó!"})`);
await quitarTodos();

console.log("\n── Llave anónima pelada");
for (const [fn, args] of [["tiene_permiso", { p_permiso: "tarifas" }], ["mis_permisos", {}], ["otorgar_permiso", { p_profile_id: rec.id, p_permiso: "tarifas" }], ["listar_personal", {}], ["reporte_financiero_periodo", { p_desde: "2026-01-01", p_hasta: "2026-12-31" }]]) {
  const r = await ANON.rpc(fn, args);
  ok(r.error?.code === "42501", `${fn}: ${r.error?.code ?? "¡respondió!"}`);
}

// Limpieza: la estancia de prueba del descuento.
await A.from("estancias").update({ estado: "cancelada" }).eq("id", estDesc.data.id);
// «Registrar tarjeta manual» viene prendido por omisión para toda la recepción: se deja como estaba.
await dar("tarjeta_manual");
if (turnoTarjeta?.propio) await A.from("turnos_caja").update({ estado: "cerrado", cerrado_at: new Date().toISOString(), deleted_at: new Date().toISOString() }).eq("id", turnoTarjeta.id);

console.log(`\n${fallas.length === 0 ? "TODO BIEN" : `FALLAS: ${fallas.length}`}`);
for (const f of fallas) console.log("  -", f);
if (fallas.length) process.exit(1);
