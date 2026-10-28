"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserConReintento } from "@/lib/supabase/get-user";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { invitarPersonal } from "@/lib/personal/invitar";
import { hoyNegocio } from "@/lib/formato";
import { mensajeDeError } from "@/lib/empleados/errores";
import { variablesDesconocidas } from "@/lib/contratos/plantilla";
import { traducirError } from "../reservas/traducir-error";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

// Las acciones de los pasos de la bienvenida (QA S16). Cada una deja el negocio más cerca de poder operar y vuelve a
// pintar /bienvenida, que decide con la base qué ya está listo.

export type ResultadoBienvenida = { error: string | null; exito?: string; inviteLink?: string | null; registros?: RegistroFinal[] };

// Los ajustes de operación del negocio (una fila por negocio): quién atiende, requisitos para hospedar.
async function registrosAjustes(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<RegistroFinal[]> {
  const { data } = await supabase.from("negocio_ajustes_operacion").select("id").is("deleted_at", null).limit(1).maybeSingle();
  return registrosDe(supabase, [{ t: "negocio_ajustes_operacion", i: (data as { id: string } | null)?.id }]);
}

function refrescar() {
  revalidatePath("/bienvenida");
  revalidatePath("/admin");
}

// Cédula profesional: 7 u 8 números (la base lo vuelve a revisar).
const cedulaValida = (c: string) => /^[0-9]{7,8}$/.test(c.replace(/[\s.-]/g, ""));
const MENSAJE_CEDULA = "La cédula profesional son 7 u 8 números, sin letras. Revísala en el Registro Nacional de Profesionistas.";

export type DiaHorario = { dia_semana: number; hora_entrada: string; hora_salida: string };
export type EsquemaSimple = { tipo: "ninguno" | "sueldo" | "dia"; monto: number | null; periodicidad: "semanal" | "quincenal" | "mensual" };
export type AltaEquipo = {
  modo: "cuenta" | "nomina";
  nombre: string;
  puesto: string;
  correo: string;
  rol: "recepcion" | "estetica";
  telefono: string;
  esMedico: boolean;
  cedula: string;
  horario: DiaHorario[];
  esquema: EsquemaSimple;
};

/**
 * «Tu equipo»: invitar a alguien con cuenta (correo y rol: queda asignable en la agenda) o darlo de alta solo en
 * nómina (sin cuenta: no puede atender citas). Horario y forma de pago son opcionales, en el mismo formulario.
 */
export async function altaEquipo(d: AltaEquipo): Promise<ResultadoBienvenida> {
  const nombre = d.nombre.trim();
  if (nombre.length < 2) return { error: "Escribe el nombre de la persona." };
  for (const h of d.horario) {
    if (Boolean(h.hora_entrada) !== Boolean(h.hora_salida)) return { error: "Cada día que trabaja lleva hora de entrada y de salida (o las dos vacías si descansa)." };
  }
  if (d.esquema.tipo !== "ninguno" && !(Number(d.esquema.monto) > 0)) return { error: "Escribe cuánto se le paga, o escoge «Lo capturo después»." };
  if (d.esMedico && !cedulaValida(d.cedula)) return { error: MENSAJE_CEDULA };
  if (d.modo === "cuenta" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo.trim())) return { error: "Escribe su correo: ahí le llega la invitación para crear su contraseña." };

  const sesion = await obtenerSesionConRol();
  const mods = sesion?.modulos ?? [];
  if (d.modo === "nomina" && !mods.includes("empleados")) return { error: "Empleados está apagado: sin él no hay nómina. Invítalo con cuenta, o prende Empleados en Módulos y plan." };
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  let userId: string | null = null;
  let inviteLink: string | null = null;
  let avisoCuenta = "";

  if (d.modo === "cuenta") {
    const { data } = await getUserConReintento(supabase);
    if (!data.user) return { error: "Tu sesión se cerró. Vuelve a entrar." };
    const r = await invitarPersonal(negocio, data.user.id, { email: d.correo, rol: d.rol, nombre_completo: nombre });
    if (!r.ok) return { error: r.error };
    userId = r.userId;
    inviteLink = r.inviteLink;
    avisoCuenta = r.yaTeniaCuenta ? ` ${r.mensaje}` : " Mándale el link de invitación para que cree su contraseña.";
  }

  let empleadoId: string | null = null;
  if (mods.includes("empleados")) {
    const zona = await zonaActual();
    const { data: emp, error } = await supabase
      .from("empleados")
      .insert({ nombre, puesto: d.puesto.trim() || (d.esMedico ? "Médico veterinario" : d.rol === "estetica" ? "Estilista" : "Recepción"), fecha_ingreso: hoyNegocio(zona), telefono: d.telefono.trim() || null, profile_id: userId })
      .select("id")
      .single();
    if (error) return { error: `${d.modo === "cuenta" ? "La invitación sí salió, pero no" : "No"} se pudo dar de alta en nómina: ${mensajeDeError(error)}`, inviteLink };
    empleadoId = emp.id as string;
    const dias = d.horario.filter((h) => h.hora_entrada && h.hora_salida);
    if (dias.length) {
      const { error: eh } = await supabase.rpc("guardar_horario_empleado", { p_empleado_id: empleadoId, p_dias: dias });
      if (eh) return { error: `Quedó dado de alta, pero el horario no se guardó: ${mensajeDeError(eh)} Captúralo en su ficha.`, inviteLink };
    }
    if (d.esquema.tipo !== "ninguno") {
      const { error: ee } = await supabase.from("esquemas_pago").insert({
        empleado_id: empleadoId,
        vigente_desde: hoyNegocio(zona),
        sueldo_monto: d.esquema.tipo === "sueldo" ? Number(d.esquema.monto) : null,
        sueldo_periodicidad: d.esquema.tipo === "sueldo" ? d.esquema.periodicidad : null,
        pago_por_dia: d.esquema.tipo === "dia" ? Number(d.esquema.monto) : null,
        con_comision: false,
        recibe_propinas: false,
      });
      if (ee) return { error: `Quedó dado de alta, pero la forma de pago no se guardó: ${mensajeDeError(ee)} Captúrala en su ficha.`, inviteLink };
    }
  }

  let medicoId: string | null = null;
  if (d.esMedico && userId) {
    const { data: medico, error } = await supabase.rpc("guardar_medico_veterinario", { p_profile_id: userId, p_cedula: d.cedula, p_cpa: null });
    medicoId = (medico as string | null) ?? null;
    if (error) return { error: `Quedó invitado, pero no se pudo designar como médico: ${traducirError(error)}`, inviteLink };
  }

  refrescar();
  revalidatePath("/empleados");
  const sinCuenta = d.modo === "nomina" ? " Quedó solo en nómina: no puede atender citas hasta que tenga cuenta." : "";
  const registros = await registrosDe(supabase, [
    { t: "empleados", i: empleadoId },
    { t: "profiles", i: userId },
    { t: "medicos_veterinarios", i: medicoId },
  ]);
  return { error: null, exito: `${nombre} quedó en tu equipo.${avisoCuenta}${sinCuenta}`, inviteLink, registros };
}

/** «Yo atiendo la estética»: el dueño cuenta como la persona que atiende las citas. */
export async function marcarYoAtiendo(atiende: boolean): Promise<ResultadoBienvenida> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("marcar_dueno_atiende", { p_atiende: atiende });
  if (error) return { error: traducirError(error) };
  refrescar();
  return { error: null, exito: atiende ? "Listo: tú atiendes las citas de estética." : "Quitado.", registros: await registrosAjustes(supabase) };
}

/** «Yo soy el médico»: el admin se designa médico veterinario con su cédula. */
export async function designarmeMedico(cedula: string, cpa: string): Promise<ResultadoBienvenida> {
  if (!cedulaValida(cedula)) return { error: MENSAJE_CEDULA };
  const supabase = await createSupabaseServerClient();
  const { data } = await getUserConReintento(supabase);
  if (!data.user) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const { data: medico, error } = await supabase.rpc("guardar_medico_veterinario", { p_profile_id: data.user.id, p_cedula: cedula, p_cpa: cpa.trim() || null });
  if (error) return { error: traducirError(error) };
  refrescar();
  revalidatePath("/veterinaria/medicos");
  return {
    error: null,
    exito: "Quedaste designado como médico veterinario. Ya puedes agendar consultas a tu nombre.",
    registros: await registrosDe(supabase, [{ t: "medicos_veterinarios", i: medico as string | null }]),
  };
}

/** Designar a otra persona del personal (con cuenta) como médico. */
export async function designarMedico(profileId: string, cedula: string): Promise<ResultadoBienvenida> {
  if (!profileId) return { error: "Escoge a la persona del personal que será médico." };
  if (!cedulaValida(cedula)) return { error: MENSAJE_CEDULA };
  const supabase = await createSupabaseServerClient();
  const { data: medico, error } = await supabase.rpc("guardar_medico_veterinario", { p_profile_id: profileId, p_cedula: cedula, p_cpa: null });
  if (error) return { error: traducirError(error) };
  refrescar();
  revalidatePath("/veterinaria/medicos");
  return { error: null, exito: "Médico designado.", registros: await registrosDe(supabase, [{ t: "medicos_veterinarios", i: medico as string | null }]) };
}

/** Requisitos para hospedar: evaluación sí/no y qué vacunas son obligatorias (con su vigencia). */
export async function guardarRequisitosHospedar(exigeEvaluacion: boolean, obligatorias: string[], vigencias: Record<string, number>): Promise<ResultadoBienvenida> {
  for (const [, meses] of Object.entries(vigencias)) {
    if (!Number.isInteger(meses) || meses < 1 || meses > 60) return { error: "La vigencia va de 1 a 60 meses." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_requisitos_estancia", { p_exige_evaluacion: exigeEvaluacion, p_obligatorias: obligatorias, p_vigencias: vigencias });
  if (error) return { error: traducirError(error) };
  refrescar();
  return { error: null, exito: "Requisitos guardados. Se aplican desde la siguiente reserva.", registros: await registrosAjustes(supabase) };
}

/** Publica el contrato general (el de la plantilla de PeluDesk, ya editado) con un clic. */
export async function publicarContratoGeneral(titulo: string, cuerpo: string): Promise<ResultadoBienvenida> {
  if (!titulo.trim()) return { error: "El título no puede estar vacío." };
  if (!cuerpo.trim()) return { error: "El contrato no puede estar vacío." };
  const desconocidas = variablesDesconocidas(`${titulo}\n${cuerpo}`);
  if (desconocidas.length) return { error: `El texto trae variables que el sistema no sabe llenar: ${desconocidas.join(", ")}. Cámbialas por un campo de la lista o quítales las llaves.` };
  const supabase = await createSupabaseServerClient();
  // El contrato general: el de alta que aplica a toda la casa (sin categorías). Un negocio nuevo ya lo trae, sin texto.
  const { data: tipos } = await supabase.from("tipos_contrato").select("id, categorias_servicio, se_genera_al, orden").is("deleted_at", null).eq("se_genera_al", "alta").order("orden");
  const general = (tipos ?? []).find((t) => ((t.categorias_servicio as string[] | null) ?? []).length === 0);
  const { data: publicado, error } = general
    ? await supabase.rpc("publicar_plantilla", { p_tipo_contrato_id: general.id, p_titulo: titulo, p_cuerpo: cuerpo, p_requiere_refirma: false })
    : await supabase.rpc("crear_tipo_contrato", { p_nombre: "Contrato general", p_categorias_servicio: [], p_titulo: titulo, p_cuerpo: cuerpo });
  if (error) return { error: traducirError(error) };
  refrescar();
  revalidatePath("/contratos");
  return {
    error: null,
    exito: "Contrato publicado. Lo firma el dueño al dar de alta a su perro; lo cambias cuando quieras en Contratos.",
    // publicar_plantilla devuelve la plantilla nueva; crear_tipo_contrato, el tipo de contrato nuevo.
    registros: await registrosDe(supabase, [{ t: general ? "plantillas_contrato" : "tipos_contrato", i: publicado as string | null }]),
  };
}
