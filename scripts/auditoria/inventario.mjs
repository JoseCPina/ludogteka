// Inventario (consumibles y equipo por área), contra la base directa, con
// JWT real de cada rol (DESARROLLO). Uso: node scripts/auditoria/inventario.mjs
// Crea datos de prueba en desarrollo; nunca correr contra producción.
import { createClient } from "@supabase/supabase-js";
import { A, NEGOCIO, URL, env, tokenDe } from "./sesiones-dev.mjs";

const conToken = (t) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${t}` } },
});
// PeluDesk: el rol es la membresía en el negocio auditado (NEGOCIO).
const perfil = async (rol, salto = 0) => {
  const { data } = await A.from("membresias").select("id:profile_id, created_at, profiles(nombre_completo)").eq("negocio_id", NEGOCIO).eq("rol", rol).is("deleted_at", null).order("created_at").range(salto, salto).single();
  return data ? { id: data.id, nombre_completo: data.profiles?.nombre_completo ?? null } : null;
};
const [rec, est, adm] = [await perfil("recepcion"), await perfil("estetica"), await perfil("admin")];
const REC = conToken(await tokenDe(rec.id));
const EST = conToken(await tokenDe(est.id));
const ADM = conToken(await tokenDe(adm.id));
const ANON = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// La prueba de recepción corre sin permisos extra.
for (const p of ["inventario_costos", "reportes_financieros"]) await ADM.rpc("revocar_permiso", { p_profile_id: rec.id, p_permiso: p });

const fallas = [];
const ok = (cond, texto) => { console.log(`${cond ? "  ✔" : "  ✘"} ${texto}`); if (!cond) fallas.push(texto); };
const sello = Date.now().toString(36);

const { data: areas } = await A.from("areas_inventario").select("id, clave, nombre").is("deleted_at", null).order("orden");
const area = (clave) => areas.find((a) => a.clave === clave).id;
const { data: unidades } = await A.from("unidades_medida").select("id, clave");
const u = (clave) => unidades.find((x) => x.clave === clave).id;

console.log("── Catálogo inicial sembrado");
const { data: sembrados } = await A.from("insumos").select("nombre, area_id").is("deleted_at", null);
const { data: equiposSem } = await A.from("equipos").select("nombre, area_id, frecuencia_mantenimiento_dias").is("deleted_at", null);
ok(areas.map((a) => a.nombre).join(",").startsWith("Estética,Guardería y hotel,Limpieza,Botiquín"), `áreas: ${areas.map((a) => a.nombre).join(", ")}`);
ok((sembrados ?? []).filter((x) => x.area_id === area("estetica")).length >= 11, `consumibles de estética: ${(sembrados ?? []).filter((x) => x.area_id === area("estetica")).length}`);
ok((equiposSem ?? []).filter((x) => x.area_id === area("estetica")).length >= 13, `equipo de estética: ${(equiposSem ?? []).filter((x) => x.area_id === area("estetica")).length}`);
ok((sembrados ?? []).some((x) => x.nombre === "Alimento del negocio"), "«Alimento del negocio» existe (el del dueño no es inventario)");

console.log("\n── Recepción (sin permiso de costos)");
const alta = await REC.from("insumos").insert({ nombre: `Toallitas prueba ${sello}`, area_id: area("estetica"), unidad_compra_id: u("pieza"), unidad_consumo_id: u("pieza") }).select("id").single();
ok(!alta.error, `da de alta un consumible sin proveedor ni costo${alta.error ? ` (${alta.error.message})` : ""}`);
const insumoRec = alta.data?.id;
const eqAlta = await REC.from("equipos").insert({ nombre: `Secadora prueba ${sello}`, area_id: area("estetica"), cantidad: 2, frecuencia_mantenimiento_dias: 30 }).select("id").single();
ok(!eqAlta.error, `da de alta equipo${eqAlta.error ? ` (${eqAlta.error.message})` : ""}`);
const equipoRec = eqAlta.data?.id;
const costoRec = await REC.from("insumos_costos").insert({ insumo_id: insumoRec, costo_unitario_compra: 10 }).select("id");
ok(Boolean(costoRec.error) || (costoRec.data ?? []).length === 0, "no puede capturar costo");
const verCostos = await REC.from("insumos_costos").select("*");
ok((verCostos.data ?? []).length === 0, "no ve ningún costo de referencia");
const compraRec = await REC.rpc("registrar_entrada_compra", { p_insumo_id: insumoRec, p_proveedor_id: null, p_cantidad_compra: 1, p_costo_unitario: 5 });
ok(Boolean(compraRec.error), "no puede registrar una compra con costo");
const sinCostoRec = await REC.rpc("insumos_sin_costo");
ok(Boolean(sinCostoRec.error), "no ve la lista de sin costo");
const ajuste = await REC.rpc("registrar_ajuste", { p_insumo_id: insumoRec, p_cantidad_consumo: 20, p_sentido: "positivo", p_motivo: "conteo inicial" });
ok(!ajuste.error, "captura existencias por conteo (ajuste)");
const areaRec = await REC.from("areas_inventario").update({ nombre: "Hackeada" }).eq("id", area("botiquin")).select("id");
ok((areaRec.data ?? []).length === 0, "no puede editar las áreas");

console.log("\n── Estética");
const altaEst = await EST.from("insumos").insert({ nombre: `No debe ${sello}`, area_id: area("estetica"), unidad_compra_id: u("pieza"), unidad_consumo_id: u("pieza") }).select("id");
ok(Boolean(altaEst.error) || (altaEst.data ?? []).length === 0, "no da de alta consumibles");
const altaEqEst = await EST.from("equipos").insert({ nombre: `No debe ${sello}`, area_id: area("estetica") }).select("id");
ok(Boolean(altaEqEst.error) || (altaEqEst.data ?? []).length === 0, "no da de alta equipo");
const consumo = await EST.rpc("registrar_salida", { p_insumo_id: insumoRec, p_cantidad_consumo: 3, p_tipo: "consumo", p_motivo: null });
ok(!consumo.error, `registra consumo${consumo.error ? ` (${consumo.error.message})` : ""}`);
const merma = await EST.rpc("registrar_salida", { p_insumo_id: insumoRec, p_cantidad_consumo: 1, p_tipo: "merma", p_motivo: "se mojó" });
ok(!merma.error, "registra merma");
const estadoEq = await EST.rpc("registrar_evento_equipo", { p_equipo_id: equipoRec, p_tipo: "estado", p_estado: "descompuesto", p_nota: "no calienta" });
ok(!estadoEq.error, `cambia el estado del equipo${estadoEq.error ? ` (${estadoEq.error.message})` : ""}`);
const mant = await EST.rpc("registrar_evento_equipo", { p_equipo_id: equipoRec, p_tipo: "mantenimiento", p_nota: "reparada" });
ok(!mant.error, "registra un mantenimiento");
const { data: eqDespues } = await A.from("equipos_estado").select("estado, ultimo_mantenimiento, proximo_mantenimiento, aviso").eq("equipo_id", equipoRec).single();
ok(eqDespues.estado === "bueno" && Boolean(eqDespues.ultimo_mantenimiento) && Boolean(eqDespues.proximo_mantenimiento), `tras el mantenimiento queda en buen estado, con siguiente fecha (${eqDespues.proximo_mantenimiento})`);
const { count: eventos } = await A.from("equipo_eventos").select("id", { count: "exact", head: true }).eq("equipo_id", equipoRec);
ok(eventos === 2, `la bitácora del equipo tiene los 2 cambios (${eventos})`);
const updEst = await EST.from("equipos").update({ nombre: "Renombrada" }).eq("id", equipoRec).select("id");
ok((updEst.data ?? []).length === 0, "no edita los datos del equipo directo");
const { data: ex } = await A.from("insumos_existencia_actual").select("existencia_actual").eq("insumo_id", insumoRec).single();
ok(Number(ex.existencia_actual) === 16, `existencia = 20 − 3 − 1 = ${ex.existencia_actual}`);

console.log("\n── Admin (costos)");
const { data: sinCosto } = await ADM.rpc("insumos_sin_costo");
ok((sinCosto ?? []).some((x) => x.id === insumoRec), "ve en «sin costo» lo que dio de alta recepción");
const costoAdm = await ADM.from("insumos_costos").insert({ insumo_id: insumoRec, costo_unitario_compra: 12.5 }).select("id");
ok(!costoAdm.error, "completa el costo de referencia");
const { data: sinCosto2 } = await ADM.rpc("insumos_sin_costo");
ok(!(sinCosto2 ?? []).some((x) => x.id === insumoRec), "ya no aparece en «sin costo»");
const { data: costoProm } = await ADM.rpc("costo_promedio_base_insumo", { p_insumo_id: insumoRec });
ok(Number(costoProm) === 12.5, `costo promedio sale de la referencia mientras no hay compras (${costoProm})`);
const compra = await ADM.rpc("registrar_entrada_compra", { p_insumo_id: insumoRec, p_proveedor_id: null, p_cantidad_compra: 10, p_costo_unitario: 8 });
ok(!compra.error, `registra una compra SIN proveedor${compra.error ? ` (${compra.error.message})` : ""}`);
const { data: costoProm2 } = await ADM.rpc("costo_promedio_base_insumo", { p_insumo_id: insumoRec });
ok(Number(costoProm2) === 8, `con compras, el costo sale de ellas (${costoProm2})`);
const { data: costoRecVe } = await REC.rpc("costo_promedio_base_insumo", { p_insumo_id: insumoRec });
ok(costoRecVe === null, "recepción sigue sin ver el costo promedio");

console.log("\n── Receta de consumo con el catálogo nuevo");
const { data: shampoo } = await A.from("insumos").select("id").eq("nombre", "Shampoo").eq("area_id", area("estetica")).is("deleted_at", null).single();
// En desarrollo no quedan citas vivas de servicios vigentes: se crea una en
// curso para la prueba (con el perro y la reserva de una cita vieja), probando
// servicio × talla hasta dar con una celda con precio, y se da de baja al final.
const { data: vieja } = await A.from("citas_estetica").select("reserva_id, perro_id, empleado_id, pelaje_id").not("tamano_id", "is", null).limit(1).single();
const { data: servEst } = await A.from("servicios_cotizables").select("id").eq("categoria", "estetica");
const { data: tamanos } = await A.from("tamanos_categoria").select("id");
let cita = null;
for (const sv of servEst ?? []) {
  for (const t of tamanos ?? []) {
    if (cita) break;
    const r = await A.from("citas_estetica").insert({ ...vieja, servicio_id: sv.id, tamano_id: t.id, inicio: "2026-12-01T17:00:00Z", fin: "2026-12-01T18:00:00Z", precio: 1, estado: "en_curso", notas: "prueba de inventario" }).select("id, servicio_id, tamano_id").single();
    if (!r.error) cita = r.data;
  }
}
if (!cita) {
  ok(false, "no se pudo crear una cita de prueba para la receta");
} else {
  await ADM.rpc("registrar_ajuste", { p_insumo_id: shampoo.id, p_cantidad_consumo: 1000, p_sentido: "positivo", p_motivo: "prueba de receta" });
  const { data: receta } = await A.from("recetas_consumo").select("id").eq("servicio_id", cita.servicio_id).eq("tamano_id", cita.tamano_id).eq("insumo_id", shampoo.id).is("deleted_at", null).maybeSingle();
  if (!receta) await ADM.from("recetas_consumo").insert({ servicio_id: cita.servicio_id, tamano_id: cita.tamano_id, insumo_id: shampoo.id, cantidad_consumo: 40 });
  const { data: antes } = await A.from("insumos_existencia_actual").select("existencia_actual").eq("insumo_id", shampoo.id).single();
  const fin = await ADM.rpc("finalizar_cita_con_consumo", { p_cita_id: cita.id, p_recogido_por_nombre: "Prueba", p_recogido_por_telefono: "4440000000", p_recogido_por_es_dueno: true });
  const { data: despues } = await A.from("insumos_existencia_actual").select("existencia_actual").eq("insumo_id", shampoo.id).single();
  ok(!fin.error && Number(despues.existencia_actual) < Number(antes.existencia_actual),
    `finalizar la cita descuenta el shampoo por receta (${antes.existencia_actual} → ${despues.existencia_actual} ml)${fin.error ? ` (${fin.error.message})` : ""}`);
  await A.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).eq("id", cita.id);
}

console.log("\n── Llave anónima pelada");
for (const [fn, args] of [["registrar_evento_equipo", { p_equipo_id: equipoRec, p_tipo: "mantenimiento" }], ["insumos_sin_costo", {}]]) {
  const r = await ANON.rpc(fn, args);
  ok(r.error?.code === "42501", `${fn}: ${r.error?.code ?? "¡respondió!"}`);
}
for (const t of ["insumos", "equipos", "equipo_eventos", "areas_inventario", "insumos_costos"]) {
  const r = await ANON.from(t).select("id");
  ok((r.data ?? []).length === 0, `${t}: 0 filas para anónimo`);
}

// Limpieza: lo de prueba se da de baja (no se borra).
await A.from("insumos").update({ deleted_at: new Date().toISOString() }).eq("id", insumoRec);
await A.from("equipos").update({ deleted_at: new Date().toISOString() }).eq("id", equipoRec);

console.log(`\n${fallas.length === 0 ? "TODO BIEN" : `FALLAS: ${fallas.length}`}`);
for (const f of fallas) console.log("  -", f);
if (fallas.length) process.exit(1);
