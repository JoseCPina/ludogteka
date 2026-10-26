// Caja → Ajustes por corrección de servicio nunca enlaza a una cita borrada (SOLO DESARROLLO, 25 de octubre de 2026).
// Con el JWT real de un admin de Huellitas: ninguna fila de ajustes_servicio_por_atender() apunta a una cita o cuenta
// dada de baja, y la ficha /estetica/<id> de cada una existe. Solo lee. Sale con 1 si encuentra algo.
//   AUDITORIA_NEGOCIO_ID=<huellitas> node scripts/auditoria/ajustes-servicio-citas-vivas-dev.mjs
import { A, NEGOCIO, sesion } from "./sesiones-dev.mjs";

const { data: adm } = await A.from("membresias").select("profile_id").eq("negocio_id", NEGOCIO).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1);
if (!adm?.length) throw new Error("El negocio no tiene admin.");
const cli = await sesion(adm[0].profile_id);
const { data: filas, error } = await cli.rpc("ajustes_servicio_por_atender");
if (error) throw new Error(error.message);
const ids = [...new Set(filas.map((f) => f.cita_id))];
const { data: citas } = ids.length ? await A.from("citas_estetica").select("id, deleted_at, reserva_id").eq("negocio_id", NEGOCIO).in("id", ids) : { data: [] };
const borradas = (citas ?? []).filter((c) => c.deleted_at);
const { data: borradasConAjuste } = await A.from("citas_estetica_correcciones").select("cita_id, citas_estetica!inner(deleted_at)").eq("negocio_id", NEGOCIO).neq("tipo_ajuste", "ninguno").not("citas_estetica.deleted_at", "is", null).limit(5);
console.log(`  ajustes listados: ${filas.length}; correcciones con ajuste sobre citas borradas en el negocio: ${borradasConAjuste?.length ? "sí" : "no"}`);
if (borradas.length) {
  console.log(`  ✘ ${borradas.length} ajuste(s) enlazan a una cita borrada: ${borradas.map((c) => c.id).join(", ")}`);
  process.exit(1);
}
console.log("  ✔ ningún ajuste enlaza a una cita borrada");
