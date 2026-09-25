"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mensajeDeError } from "@/lib/empleados/errores";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

// Todo esto es dinero: admin o quien tenga «Nómina». La base lo aplica.

const monto = (fd: FormData, campo: string) => {
  const v = String(fd.get(campo) ?? "").trim().replace(",", ".");
  return v ? Number(v) : null;
};

// Cambiar el esquema es capturar uno nuevo con su fecha: el anterior queda
// como historia y los pagos ya hechos no cambian.
export async function guardarEsquema(empleadoId: string, fd: FormData): Promise<ResultadoAccion> {
  const sueldo = monto(fd, "sueldo_monto");
  const porDia = monto(fd, "pago_por_dia");
  const conComision = fd.get("con_comision") === "on";
  const comisionTipo = String(fd.get("comision_tipo") ?? "") || null;
  const comisionValor = monto(fd, "comision_valor");
  const vigente = String(fd.get("vigente_desde") ?? "");
  if (!vigente) return { error: "Pon desde cuándo vale." };
  if (!sueldo && !porDia && !conComision) return { error: "Captura al menos una forma de pago: sueldo, pago por día o comisión." };
  if (sueldo !== null && !(sueldo > 0)) return { error: "El sueldo tiene que ser mayor a cero." };
  if (porDia !== null && !(porDia > 0)) return { error: "El pago por día tiene que ser mayor a cero." };
  if (comisionTipo && !(comisionValor && comisionValor > 0)) return { error: "Escribe cuánto es la comisión." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("esquemas_pago").insert({
    empleado_id: empleadoId,
    vigente_desde: vigente,
    sueldo_monto: sueldo,
    sueldo_periodicidad: sueldo ? String(fd.get("sueldo_periodicidad") ?? "quincenal") : null,
    pago_por_dia: porDia,
    con_comision: conComision,
    comision_tipo: conComision ? comisionTipo : null,
    comision_valor: conComision && comisionTipo ? comisionValor : null,
    recibe_propinas: fd.get("recibe_propinas") === "on",
    notas: String(fd.get("notas") ?? "").trim() || null,
  });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath(`/empleados/${empleadoId}`);
  return { error: null, exito: "Esquema de pago guardado" };
}

export async function registrarAdelanto(empleadoId: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_adelanto", {
    p_empleado_id: empleadoId,
    p_monto: monto(fd, "monto"),
    p_fecha: String(fd.get("fecha") ?? "") || null,
    p_metodo: String(fd.get("metodo") ?? "efectivo"),
    p_motivo: String(fd.get("motivo") ?? ""),
  });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath(`/empleados/${empleadoId}`);
  return { error: null, exito: "Adelanto registrado: se descuenta del siguiente pago" };
}

export async function cancelarAdelanto(id: string, empleadoId: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_adelanto", { p_adelanto_id: id, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath(`/empleados/${empleadoId}`);
  return { error: null, exito: "Adelanto cancelado" };
}

// La base vuelve a calcular el periodo al registrar: lo que se guarda es su
// cálculo, no lo que haya en pantalla.
export async function registrarPago(empleadoId: string, desde: string, hasta: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_pago_nomina", {
    p_empleado_id: empleadoId,
    p_desde: desde,
    p_hasta: hasta,
    p_metodo: String(fd.get("metodo") ?? ""),
    p_fecha_pago: String(fd.get("fecha_pago") ?? "") || null,
    p_notas: String(fd.get("notas") ?? ""),
  });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath("/empleados/nomina", "layout");
  return { error: null, exito: "Pago registrado" };
}

export async function revertirPago(pagoId: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revertir_pago_nomina", { p_pago_id: pagoId, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath("/empleados/nomina", "layout");
  return { error: null, exito: "Pago revertido: el periodo se puede volver a pagar" };
}

// Regla de comisión de un servicio de estética (de todos o de un estilista).
export async function guardarComision(fd: FormData): Promise<ResultadoAccion> {
  const servicio = String(fd.get("servicio_id") ?? "");
  const empleado = String(fd.get("empleado_id") ?? "") || null;
  const tipo = String(fd.get("tipo") ?? "");
  const valor = monto(fd, "valor");
  if (!servicio) return { error: "Elige el servicio." };
  if (!tipo) return { error: "Elige si es porcentaje o monto fijo." };
  if (!(valor && valor > 0)) return { error: "Escribe cuánto es la comisión." };
  if (tipo === "porcentaje" && valor > 100) return { error: "Un porcentaje no puede pasar de 100." };
  const supabase = await createSupabaseServerClient();
  // Reemplaza la regla vigente del mismo servicio y estilista (la vieja se
  // da de baja, no se borra).
  let viejas = supabase.from("comisiones_servicio").update({ deleted_at: new Date().toISOString() }).eq("servicio_id", servicio).is("deleted_at", null);
  viejas = empleado ? viejas.eq("empleado_id", empleado) : viejas.is("empleado_id", null);
  const { error: e1 } = await viejas;
  if (e1) return { error: mensajeDeError(e1) };
  const { error } = await supabase.from("comisiones_servicio").insert({ servicio_id: servicio, empleado_id: empleado, tipo, valor });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath("/empleados/comisiones");
  return { error: null, exito: "Regla guardada" };
}

export async function quitarComision(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("comisiones_servicio").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: "No tienes permiso para esto." };
  revalidatePath("/empleados/comisiones");
  return { error: null, exito: "Regla quitada" };
}
