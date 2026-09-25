"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mensajeDeError } from "@/lib/empleados/errores";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();
const opcional = (fd: FormData, campo: string) => texto(fd, campo) || null;

function leerDatos(fd: FormData) {
  return {
    nombre: texto(fd, "nombre"),
    puesto: texto(fd, "puesto"),
    fecha_ingreso: texto(fd, "fecha_ingreso"),
    telefono: opcional(fd, "telefono"),
    emergencia_nombre: opcional(fd, "emergencia_nombre"),
    emergencia_telefono: opcional(fd, "emergencia_telefono"),
    emergencia_parentesco: opcional(fd, "emergencia_parentesco"),
    profile_id: opcional(fd, "profile_id"),
    notas: opcional(fd, "notas"),
  };
}

function validar(d: ReturnType<typeof leerDatos>): string | null {
  if (!d.nombre) return "Escribe el nombre.";
  if (!d.puesto) return "Escribe el puesto.";
  if (!d.fecha_ingreso) return "Pon la fecha de ingreso.";
  return null;
}

// Alta y edición: admin o quien tenga «Nómina» (la base lo aplica).
export async function crearEmpleado(fd: FormData): Promise<ResultadoAccion> {
  const datos = leerDatos(fd);
  const invalido = validar(datos);
  if (invalido) return { error: invalido };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("empleados").insert(datos).select("id").single();
  if (error) return { error: mensajeDeError(error) };
  revalidatePath("/empleados");
  return { error: null, ir: `/empleados/${data.id}?creado=1` };
}

export async function actualizarEmpleado(id: string, fd: FormData): Promise<ResultadoAccion> {
  const datos = leerDatos(fd);
  const invalido = validar(datos);
  if (invalido) return { error: invalido };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("empleados").update(datos).eq("id", id).select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: "No tienes permiso para cambiar a este empleado." };
  revalidatePath(`/empleados/${id}`);
  return { error: null, exito: "Datos guardados" };
}

// Baja: deja de trabajar ahí. No se borra nada (su asistencia y sus pagos
// se conservan); desde el día siguiente ya no cuenta faltas.
export async function darDeBajaEmpleado(id: string, fd: FormData): Promise<ResultadoAccion> {
  const fecha = texto(fd, "fecha_baja");
  const motivo = texto(fd, "motivo_baja");
  if (!fecha) return { error: "Pon el último día que trabajó." };
  if (!motivo) return { error: "Escribe el motivo de la baja." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("empleados").update({ fecha_baja: fecha, motivo_baja: motivo }).eq("id", id).select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: "No tienes permiso para dar de baja a este empleado." };
  revalidatePath("/empleados");
  return { error: null, exito: "Baja registrada" };
}

export async function reactivarEmpleado(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("empleados").update({ fecha_baja: null, motivo_baja: null }).eq("id", id).select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: "No tienes permiso para esto." };
  revalidatePath("/empleados");
  return { error: null, exito: "Reactivado" };
}

// Horario: un renglón por día (entrada y salida vacías = descansa).
export async function guardarHorario(empleadoId: string, fd: FormData): Promise<ResultadoAccion> {
  const dias = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    dia_semana: d,
    hora_entrada: texto(fd, `entrada_${d}`),
    hora_salida: texto(fd, `salida_${d}`),
  }));
  for (const d of dias) {
    if (Boolean(d.hora_entrada) !== Boolean(d.hora_salida)) {
      return { error: "Cada día que trabaja lleva hora de entrada y de salida (o las dos vacías si descansa)." };
    }
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_horario_empleado", { p_empleado_id: empleadoId, p_dias: dias.filter((d) => d.hora_entrada) });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath(`/empleados/${empleadoId}`);
  return { error: null, exito: "Horario guardado: vale desde hoy" };
}
