// «Dar por revisadas todas las anteriores a…» con la casilla de citas (SOLO DESARROLLO, en Huellitas; migración
// 20261203004050). Fechas de hace unas semanas: el precio del servicio tiene que valer ese día.
//   · la cuenta previa dice cuántas citas cerraría y cuántas no por tener cobro;
//   · sin la casilla, ninguna cita cambia; con ella, las pasadas quedan «No llegó» con la nota en su historial;
//   · una cita de estética con cobro y una en curso no se tocan; una cita de veterinaria sí se cierra;
//   · sin el permiso y con la llave anónima, no.
//
//   node scripts/auditoria/alertas-hasta-dev.mjs
import { personas, B, SB, rpc, datos, comprobar, seccion, terminar, quitar } from "./veterinaria-comun-dev.mjs";
import { designarMedicoTemporal, quitarMedicoTemporal } from "./lib/medico-dev.mjs";

const P = await personas();
const dias = 20 + Math.floor(Math.random() * 10);
const dia = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
const siguiente = new Date(Date.parse(`${dia}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const creadas = { citas: [], vet: [], cobros: [] };

const { data: base } = await SB.from("citas_estetica").select("servicio_id, empleado_id").eq("negocio_id", B).not("empleado_id", "is", null).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).single();

async function cita(hora, estado) {
  const r = await rpc(P.admin, "crear_reserva_para_cita", { p_perro_id: datos.perroSoloB });
  if (!r.ok) throw new Error(`reserva: ${r.mensaje}`);
  const { data, error } = await SB.from("citas_estetica")
    .insert({ negocio_id: B, reserva_id: r.cuerpo, perro_id: datos.perroSoloB, servicio_id: base.servicio_id, empleado_id: base.empleado_id, inicio: `${dia}T${hora}:00:00+00:00`, estado: "reservada" })
    .select("id, reserva_id").single();
  if (error) throw new Error(`cita: ${error.message}`);
  creadas.citas.push(data.id);
  if (estado !== "reservada") {
    const u = await SB.from("citas_estetica").update({ estado }).eq("id", data.id);
    if (u.error) throw new Error(`cita a ${estado}: ${u.error.message}`);
  }
  return data;
}
const estado = async (id) => (await SB.from("citas_estetica").select("estado").eq("id", id).single()).data?.estado;
const llamarCierre = (token, cerrar, nota = "Revisado por la auditoría") => rpc(token, "alertas_dar_por_revisadas_hasta", { p_hasta: siguiente, p_nota: nota, p_cerrar_citas: cerrar });

try {
  const libre = await cita(15, "reservada");
  const confirmada = await cita(16, "confirmada");
  const enCurso = await cita(17, "en_curso");
  const conCobro = await cita(18, "reservada");
  const { data: turno } = await SB.from("turnos_caja").select("id").eq("negocio_id", B).order("created_at", { ascending: false }).limit(1).single();
  const { data: cobro, error: eCobro } = await SB.from("cobros").insert({ negocio_id: B, reserva_id: conCobro.reserva_id, turno_id: turno.id, origen: "manual", notas: "auditoría alertas" }).select("id").single();
  if (eCobro) throw new Error(`cobro: ${eCobro.message}`);
  creadas.cobros.push(cobro.id);
  const m = await SB.from("cobro_metodos").insert({ negocio_id: B, cobro_id: cobro.id, metodo: "efectivo", monto: 100 });
  if (m.error) throw new Error(`método: ${m.error.message}`);
  const { data: tipoVet } = await SB.from("vet_tipos_cita").select("id, clave").eq("negocio_id", B).eq("clave", "consulta").single();
  const medico = await designarMedicoTemporal({ B, adminId: P.adminId, profileId: P.adminId });
  const { data: vet, error: eVet } = await SB.from("vet_citas")
    .insert({ negocio_id: B, perro_id: datos.perroSoloB, cliente_id: datos.clienteSoloB, tipo_id: tipoVet.id, tipo_clave: tipoVet.clave, medico_id: medico, inicia_at: `${dia}T15:00:00+00:00`, termina_at: `${dia}T15:30:00+00:00` })
    .select("id").single();
  if (eVet) throw new Error(`cita vet: ${eVet.message}`);
  creadas.vet.push(vet.id);

  seccion("La cuenta previa");
  const previa = await rpc(P.admin, "alertas_por_revisar_hasta", { p_hasta: siguiente });
  comprobar(previa.ok && previa.cuerpo.citas >= 3, `cuenta las citas que cerraría, sin la del cobro ni la en curso (${previa.cuerpo?.citas})`);
  comprobar(previa.ok && previa.cuerpo.citas_con_cobro >= 1, `y dice cuántas no cierra por tener cobro (${previa.cuerpo?.citas_con_cobro})`);

  seccion("Quién");
  await quitar(P.admin, P.recSinId, "revisar_alertas");
  comprobar(!(await llamarCierre(P.recSin, true)).ok, "recepción sin el permiso no cierra");
  comprobar(!(await llamarCierre(null, true)).ok, "la llave anónima tampoco");

  seccion("Con la casilla apagada");
  const apagada = await rpc(P.admin, "alertas_dar_por_revisadas_hasta", { p_hasta: siguiente, p_nota: "Revisado por la auditoría" });
  comprobar(apagada.ok && apagada.cuerpo.cerradas.citas === 0, `por omisión no cierra citas (${apagada.mensaje ?? "ok"})`);
  comprobar((await estado(libre.id)) === "reservada" && (await estado(confirmada.id)) === "confirmada", "las citas siguen como estaban");

  seccion("Con la casilla prendida");
  const prendida = await llamarCierre(P.admin, true, "Arranque limpio de la auditoría");
  comprobar(prendida.ok && prendida.cuerpo.cerradas.citas >= 3, `cierra las citas pasadas (${prendida.cuerpo?.cerradas?.citas})`);
  comprobar(prendida.cuerpo?.pendientes?.citas_con_cobro >= 1, "y dice cuántas dejó por tener cobro");
  comprobar((await estado(libre.id)) === "no_llego" && (await estado(confirmada.id)) === "no_llego", "reservada y confirmada quedan «No llegó»");
  comprobar((await estado(enCurso.id)) === "en_curso", "una cita en curso no se toca");
  comprobar((await estado(conCobro.id)) === "reservada", "una cita con cobro no se toca");
  const vetFinal = (await SB.from("vet_citas").select("estado").eq("id", vet.id).single()).data;
  comprobar(vetFinal?.estado === "no_llego", "la cita de veterinaria también queda «No llegó»");
  const hist = (await SB.from("citas_estetica_cambios").select("tipo, motivo").eq("cita_id", libre.id).single()).data;
  comprobar(hist?.tipo === "no_llego" && /Arranque limpio/.test(hist.motivo ?? ""), "el historial de la cita guarda la nota");
} finally {
  await quitarMedicoTemporal().catch(() => {});
  if (creadas.cobros.length) {
    await SB.from("cobro_metodos").delete().in("cobro_id", creadas.cobros);
    await SB.from("cobros").delete().in("id", creadas.cobros);
  }
  const ahora = new Date().toISOString();
  if (creadas.citas.length) await SB.from("citas_estetica").update({ deleted_at: ahora }).in("id", creadas.citas);
  if (creadas.vet.length) await SB.from("vet_citas").update({ deleted_at: ahora }).in("id", creadas.vet);
}
terminar();
