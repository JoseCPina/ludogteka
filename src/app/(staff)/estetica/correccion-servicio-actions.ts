"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual } from "@/lib/negocio/actual";
import { conexionDeCobro } from "@/lib/pagos/conexion";
import { cancelarCobrosEnCurso } from "@/lib/pagos/cancelar-cobros-de-cuenta";
import { traducirError } from "../reservas/traducir-error";
import type { CotizacionCorreccion, ResultadoCorreccion } from "./correccion-servicio-tipos";

// Corregir el servicio de una cita. Todo lo decide la base
// (cotizar_correccion_servicio / corregir_servicio_cita): quién puede, el
// precio con las reglas de la cita, el motivo, el historial. Esto solo
// cancela con el proveedor los cobros en curso ANTES de llamar a la base.

export async function cotizarCorreccionServicio(
  citaId: string,
  servicioId: string,
  grupoExcepcionId: string | null,
  motivoExcepcion: string | null
): Promise<{ error: string | null; cotizacion?: CotizacionCorreccion }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cotizar_correccion_servicio", {
    p_cita_id: citaId,
    p_servicio_id: servicioId,
    p_grupo_excepcion_id: grupoExcepcionId,
    p_excepcion_motivo: motivoExcepcion,
  });
  if (error) return { error: traducirError(error) };
  return { error: null, cotizacion: data as CotizacionCorreccion };
}

export async function corregirServicioCita(datos: {
  citaId: string;
  servicioId: string;
  motivo: string;
  precioEsperado: number | null;
  grupoExcepcionId: string | null;
  motivoExcepcion: string | null;
}): Promise<{ error: string | null; resultado?: ResultadoCorreccion }> {
  const sesion = await obtenerSesionConRol();
  if (!sesion || !["admin", "recepcion"].includes(sesion.rol)) return { error: "Solo admin o recepción corrigen el servicio de una cita." };
  if (!datos.motivo.trim()) return { error: "Escribe el motivo de la corrección: queda en el historial de la cita." };

  const supabase = await createSupabaseServerClient();
  // 1. Pregunta a la base (valida permiso y regla) y trae los cobros en curso.
  const { data: previa, error: errorPrevia } = await supabase.rpc("cotizar_correccion_servicio", {
    p_cita_id: datos.citaId,
    p_servicio_id: datos.servicioId,
    p_grupo_excepcion_id: datos.grupoExcepcionId,
    p_excepcion_motivo: datos.motivoExcepcion,
  });
  if (errorPrevia) return { error: traducirError(errorPrevia) };
  const cot = previa as CotizacionCorreccion;
  const abiertas = cot.ordenes_abiertas ?? [];
  // Un bloqueo que no son cobros en curso (cita cerrada, pase aplicado, mismo servicio…): se dice tal cual.
  const bloqueoReal = (cot.bloqueos ?? []).find((b) => !/por confirmar/i.test(b));
  if (bloqueoReal) return { error: bloqueoReal };
  if (!cot.ok && !cot.bloqueos?.length) return { error: cot.error ?? "No se pudo calcular el precio." };

  // 2. Cobros en curso por el monto equivocado: se cancelan antes (nunca uno que el proveedor ya aprobó).
  let canceladas: { id: string; tipo: string; estado_antes: string }[] = [];
  if (abiertas.length > 0) {
    const negocio = await negocioActual();
    const admin = createSupabaseAdminClient(negocio.id);
    const cx = await conexionDeCobro(negocio);
    const r = await cancelarCobrosEnCurso(admin, negocio.id, cx, abiertas, "Cancelado por corrección de servicio de la cita");
    canceladas = r.canceladas;
    if (r.error) {
      if (canceladas.length) revalidatePath("/caja");
      return { error: r.error };
    }
  }

  // 3. La corrección (con el precio que se vio, para no cambiar otro).
  const { data, error } = await supabase.rpc("corregir_servicio_cita", {
    p_cita_id: datos.citaId,
    p_servicio_id: datos.servicioId,
    p_motivo: datos.motivo.trim(),
    p_grupo_excepcion_id: datos.grupoExcepcionId,
    p_excepcion_motivo: datos.motivoExcepcion,
    p_precio_esperado: datos.precioEsperado,
    p_ordenes_canceladas: canceladas,
  });
  if (error) return { error: traducirError(error) };
  const resultado = data as ResultadoCorreccion;
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${datos.citaId}`);
  revalidatePath("/recepcion");
  revalidatePath("/admin");
  revalidatePath("/caja");
  revalidatePath("/caja/turno");
  revalidatePath("/caja/ajustes-servicio");
  if (resultado.reserva_id) {
    revalidatePath(`/caja/cobrar/${resultado.reserva_id}`);
    revalidatePath(`/reservas/${resultado.reserva_id}/cobrar`);
  }
  return { error: null, resultado: { ...resultado, ordenes_canceladas: canceladas.length } };
}
