// Prueba REAL de los recordatorios automáticos por WhatsApp en PRODUCCIÓN, en la «Clínica Demo PeluDesk» (y SOLO ahí;
// nunca Ludogteka ni un cliente real): una cita veterinaria de prueba para mañana a la mascota del «Cliente de ejemplo
// (WhatsApp de PeluDesk)», que tiene el teléfono del dueño de PeluDesk.
//
//   node scripts/clinica-demo/recordatorio-real.mjs preparar    prende «Cita veterinaria» (hora 07:00) y agenda la cita;
//                                                             la tarea de Vercel (cada 15 min, de 8:00 a 21:00) la manda
//   node scripts/clinica-demo/recordatorio-real.mjs estado      el recordatorio (estado, respuesta) y la cita
//   node scripts/clinica-demo/recordatorio-real.mjs limpiar     cancela y borra la cita de prueba y apaga los recordatorios
//
// Sesión del admin por enlace mágico (scripts/lib/prod.mjs); la llave se lee al vuelo y nunca se imprime.
import { comoPersona, guardarEstado, estado as leerEstado, servicioEn, servicioSinNegocio, sesionDe, SLUG_CLINICA, TELEFONO_DUENO } from "../lib/prod.mjs";

const paso = process.argv[2];
const S = servicioSinNegocio();
const { data: negocio } = await S.from("negocios").select("id, slug, zona_horaria").eq("slug", SLUG_CLINICA).single();
if (negocio?.slug !== SLUG_CLINICA) throw new Error("No encontré la clínica demo.");
const C = servicioEn(negocio.id);
const { data: adminM } = await S.from("membresias").select("profile_id").eq("negocio_id", negocio.id).eq("rol", "admin").is("deleted_at", null).limit(1).single();
const { token } = await sesionDe(adminM.profile_id);
const P = comoPersona(token, negocio.id);

const manana = new Intl.DateTimeFormat("en-CA", { timeZone: negocio.zona_horaria }).format(new Date(Date.now() + 86400000));
function instante(fecha, hora, z) {
  const guess = new Date(`${fecha}T${hora}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(guess).map((x) => [x.type, x.value]));
  return new Date(guess.getTime() - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess.getTime())).toISOString();
}

if (paso === "preparar") {
  const { data: cliente } = await C.from("clientes").select("id, nombre, telefono, recordatorios_whatsapp").eq("negocio_id", negocio.id).like("telefono", `%${TELEFONO_DUENO}%`).is("deleted_at", null).single();
  if (!cliente) throw new Error("No está el cliente de ejemplo con el teléfono del dueño.");
  if (!cliente.recordatorios_whatsapp) throw new Error("El cliente de ejemplo tiene los recordatorios apagados (respondió BAJA): no se le manda nada.");
  const { data: perro } = await C.from("perros").select("id, nombre").eq("cliente_id", cliente.id).eq("especie", "perro").is("deleted_at", null).limit(1).single();
  const { data: medico } = await C.from("medicos_veterinarios").select("id").eq("negocio_id", negocio.id).is("deleted_at", null).limit(1).single();
  const aj = await P.rpc("guardar_recordatorios_ajustes", { p_estetica: false, p_veterinaria: true, p_llegada: false, p_listo: false, p_vacuna: false, p_hora: "07:00" });
  if (aj.error) throw new Error(`ajustes: ${aj.error.message}`);
  const cita = await P.rpc("vet_agendar_cita", { p_perro: perro.id, p_tipo: "consulta", p_medico: medico.id, p_inicia: instante(manana, "11:00", negocio.zona_horaria), p_duracion_min: 30, p_motivo: "PRUEBA de recordatorio automático por WhatsApp (se borra después)" });
  if (cita.error) throw new Error(`cita: ${cita.error.message}`);
  const citaId = cita.data?.id ?? cita.data;
  guardarEstado({ recordatorioCita: citaId });
  console.log(`Cita de prueba ${citaId}: ${perro.nombre}, ${manana} 11:00. El recordatorio sale en la siguiente corrida de la tarea (cada 15 min, de 8:00 a 21:00).`);
} else if (paso === "estado") {
  const citaId = leerEstado().recordatorioCita;
  if (!citaId) throw new Error("No hay cita de prueba (corre «preparar»).");
  const { data: rec } = await C.from("recordatorios_wa").select("estado, motivo, respuesta, respuesta_at, enviado_at, entregado_at, leido_at, cobrable, plantilla, texto").eq("ref_id", citaId).order("created_at", { ascending: false });
  const { data: cita } = await C.from("vet_citas").select("estado, inicia_at, deleted_at").eq("id", citaId).single();
  console.log(JSON.stringify({ cita, recordatorios: rec }, null, 1));
} else if (paso === "limpiar") {
  const citaId = leerEstado().recordatorioCita;
  if (citaId) {
    const { data: cita } = await C.from("vet_citas").select("estado").eq("id", citaId).single();
    if (cita && ["programada", "confirmada"].includes(cita.estado)) {
      const r = await Promise.resolve(P.rpc("vet_cita_estado", { p_id: citaId, p_estado: "cancelada", p_motivo: "Prueba de recordatorio terminada" })).catch((e) => ({ error: e }));
      if (r.error) await C.from("vet_citas").update({ estado: "cancelada", cancelada_motivo: "Prueba de recordatorio terminada" }).eq("id", citaId);
    }
    await C.from("vet_citas").update({ deleted_at: new Date().toISOString() }).eq("id", citaId);
    guardarEstado({ recordatorioCita: null });
    console.log(`Cita de prueba ${citaId} cancelada y borrada.`);
  }
  const aj = await P.rpc("guardar_recordatorios_ajustes", { p_estetica: false, p_veterinaria: false, p_llegada: false, p_listo: false, p_vacuna: false, p_hora: "10:00" });
  console.log(aj.error ? `No se pudieron apagar los recordatorios: ${aj.error.message}` : "Recordatorios de la clínica demo apagados.");
} else {
  console.log("Uso: node scripts/clinica-demo/recordatorio-real.mjs preparar | estado | limpiar");
}
