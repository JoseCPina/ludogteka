// Lo común de las auditorías de la Fase 4 de Veterinaria (recetas, espejo del SITPV, libro de control):
// SOLO DESARROLLO, en Huellitas; nunca Ludogteka. Arma médicos, una mascota, productos con cada
// clasificación y sus lotes con existencia, y lo deja limpio al terminar.
import { A, B, SB, rpc, get, personas, quitar, dar, fijarModulo, materialClinico, productoClinico, hoy, sumaDias, datos } from "./veterinaria-comun-dev.mjs";
import { tokenDe } from "./sesiones-dev.mjs";

export const PERMISOS_F4 = ["emitir_recetas", "registrar_recetas_sitpv", "ver_libro_control", "lotes_clinicos", "hospitalizar", "atender_consultas", "firmar_expediente"];

export async function preparar(nombre) {
  const P = await personas();
  const MARCA = `${nombre}-${String(Date.now()).slice(-6)}`;
  const estado = { P, MARCA, medicos: [], perros: [], insumos: [], reservas: [] };
  const ajustes = (await SB.from("veterinaria_ajustes").select("*").eq("negocio_id", B).is("deleted_at", null).maybeSingle())?.data;
  estado.ajustes = ajustes;
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  for (const p of PERMISOS_F4) {
    await quitar(P.admin, P.recConId, p);
    await quitar(P.admin, P.recSinId, p);
  }
  const ced = `CEDR${String(Date.now()).slice(-6)}`;
  // La recepcionista «con» es médico (con CPA); la persona de estética, médico sin CPA.
  const m1 = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: ced, p_cpa: "CPA-F4" });
  const m2 = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: datos.esteticaB, p_cedula: `${ced}9`, p_cpa: null });
  if (!m1.ok || !m2.ok) throw new Error(`no se pudieron designar médicos: ${m1.mensaje} ${m2.mensaje}`);
  estado.medA = m1.cuerpo;
  estado.medE = m2.cuerpo;
  estado.medicos.push(m1.cuerpo, m2.cuerpo);
  estado.cedA = ced;

  estado.hoy = await hoy(P.admin);
  estado.nuevoPerro = async (n, extra = {}) => {
    const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${n} ${MARCA}`, especie: "perro", ...extra }).select("id").single();
    if (r.error) throw new Error(`perro: ${r.error.message}`);
    estado.perros.push(r.data.id);
    return r.data.id;
  };

  // Productos: uno por clasificación. Compra en litros y consumo en ml (1 l = 1000 ml).
  const m = await materialClinico();
  estado.m = m;
  const { data: cat } = await SB.from("principios_activos").select("id, nombre").is("deleted_at", null);
  const pa = (n) => cat.find((x) => x.nombre.toLowerCase() === n)?.id ?? null;
  estado.producto = async (clave, nombre, extra) => {
    const id = await productoClinico(P.admin, `${nombre} ${MARCA}`, extra);
    estado.insumos.push(id);
    estado[clave] = id;
    return id;
  };
  await estado.producto("grupoI", "Xilazina", { p_principio_activo_id: pa("xilazina"), p_grupo_senasica: "I" });
  await estado.producto("grupoII", "Meloxicam", { p_principio_activo_id: pa("meloxicam"), p_grupo_senasica: "II" });
  await estado.producto("antim", "Amoxicilina", { p_principio_activo_id: pa("amoxicilina"), p_grupo_senasica: "II", p_es_antimicrobiano: true });
  await estado.producto("libre", "Shampoo clínico", { p_grupo_senasica: "III" });
  await estado.producto("fr3", "Diazepam", { p_principio_activo_id: pa("diazepam"), p_clasificacion_lgs: "psicotropico_245_III" });
  await estado.producto("fr4", "Fenobarbital", { p_principio_activo_id: pa("fenobarbital"), p_clasificacion_lgs: "psicotropico_245_IV" });
  await estado.producto("especial", "Morfina", { p_principio_activo_id: pa("morfina"), p_clasificacion_lgs: "estupefaciente_234" });
  // Datos regulatorios y existencias (1 compra = 1 litro = 1000 ml; el lote tiene 1000 ml).
  for (const [clave, reg] of [["grupoI", "REG-I-1"], ["especial", "REG-E-1"], ["fr3", "REG-3"], ["fr4", "REG-4"]]) {
    await rpc(P.admin, "vet_producto_regulatorio_guardar", { p_insumo: estado[clave], p_registro: reg, p_laboratorio: "Laboratorio Prueba", p_presentacion: "Frasco 100 ml" });
  }
  estado.lote = {};
  const cad = sumaDias(estado.hoy, 365);
  for (const clave of ["grupoI", "grupoII", "antim", "libre", "fr3", "fr4", "especial"]) {
    const r = await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: estado[clave], p_codigo: `L-${clave}-${MARCA}`, p_caducidad: cad, p_cantidad_compra: 1, p_proveedor: null, p_notas: null });
    if (!r.ok) throw new Error(`lote ${clave}: ${r.mensaje}`);
    estado.lote[clave] = r.cuerpo;
  }
  return estado;
}

/** Bloque de folios para un médico (la base lleva su contador). */
export async function darFolios(estado, medico, desde, hasta) {
  const r = await rpc(estado.P.admin, "asignar_folios_medico", { p_medico_id: medico, p_prefijo: "", p_desde: desde, p_hasta: hasta, p_usados_previos: 0, p_nota: "prueba F4" });
  if (!r.ok) throw new Error(`folios: ${r.mensaje}`);
  return r.cuerpo;
}

export async function limpiar(estado) {
  const { P } = estado;
  for (const p of PERMISOS_F4) {
    await quitar(P.admin, P.recConId, p);
    await quitar(P.admin, P.recSinId, p);
  }
  if (estado.ajustes) await SB.from("veterinaria_ajustes").update({ espejo_antimicrobianos: estado.ajustes.espejo_antimicrobianos ?? false }).eq("id", estado.ajustes.id);
  else await SB.from("veterinaria_ajustes").update({ espejo_antimicrobianos: false }).eq("negocio_id", B);
  const ahora = new Date().toISOString();
  await SB.from("insumos").update({ deleted_at: ahora }).in("id", estado.insumos);
  for (const m of estado.medicos) await SB.from("medicos_veterinarios").update({ deleted_at: ahora }).eq("id", m);
  // Reservas (cuentas) de hospitalización/estimados creadas por las pruebas: cerradas para no ensuciar Caja.
  for (const r of estado.reservas) await SB.from("reservas").update({ deleted_at: ahora }).eq("id", r);
}

export { rpc, get, SB, B, A, dar, quitar, sumaDias, tokenDe };
