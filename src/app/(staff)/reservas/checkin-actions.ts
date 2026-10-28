"use server";

import { textoSalidaAnticipada, type CotizacionSalida } from "@/lib/reservas/salida-anticipada";
import { revalidatePath } from "next/cache";
import { revalidarModulosEstancia } from "./revalidar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

const BUCKET = "perros-archivos";
const EXPIRACION_SEGUNDOS = 60 * 60;

// Misma convención de bucket que las fotos de perfil (perros-archivos),
// misma validación de RLS (solo mira el segmento {perro_id}, índice 2 —
// ver add_storage_perros_archivos.sql) — no hace falta ninguna política
// nueva, esta ruta ya queda cubierta por las que protegen ese bucket.
export async function prepararRutaFotoLlegada(
  clienteId: string,
  perroId: string,
  estanciaId: string
): Promise<string> {
  return `${clienteId}/${perroId}/estancias/${estanciaId}/llegada.jpg`;
}

export async function obtenerUrlFotoLlegada(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, EXPIRACION_SEGUNDOS);
  return error ? null : data.signedUrl;
}

export type EstadoAccion = { error: string | null; registros?: RegistroFinal[] };

export type CamposCheckin = {
  entregadoPorNombre: string;
  entregadoPorTelefono: string;
  estadoLlegada: string;
  fotoLlegadaPath: string | null;
};

// Las pertenencias se guardan aparte, una por una, en cuanto se
// capturan (agregarPertenencia) — no se acumulan en el formulario para
// mandarse juntas aquí. Esta acción solo hace la transición a en_curso.
// QA S31: si con esta entrada la casa rebasa el cupo (un check-in tardío), la base no la guarda y devuelve el texto
// («La casa está llena (10/10); al registrar la entrada quedas en 11/10.»); con `confirmarSobrecupo` se guarda y
// queda anotado en la estancia y en la bitácora.
// QA N125: fuera del horario del negocio (día cerrado u hora fuera de rango) pasa lo mismo: la base devuelve
// «El negocio está cerrado hoy; ¿registrar de todos modos?» y con `fueraHorario` se guarda y queda anotado.
export type ConfirmacionesEntradaSalida = { sobrecupo?: boolean; fueraHorario?: boolean };

export async function confirmarCheckin(
  estanciaId: string,
  campos: CamposCheckin,
  confirma: ConfirmacionesEntradaSalida = {}
): Promise<EstadoAccion & { sobrecupo?: string; fueraHorario?: string; quedo?: string | null; quedoFueraHorario?: string | null }> {
  if (!campos.entregadoPorNombre.trim()) {
    return { error: "Registra quién entrega al perro." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("estancias")
    .update({
      estado: "en_curso",
      entregado_por_nombre: campos.entregadoPorNombre.trim(),
      entregado_por_telefono: campos.entregadoPorTelefono.trim() || null,
      estado_llegada: campos.estadoLlegada.trim() || null,
      foto_llegada_path: campos.fotoLlegadaPath,
      ...(confirma.sobrecupo ? { checkin_sobrecupo: "confirmado" } : {}),
      ...(confirma.fueraHorario ? { checkin_fuera_horario: "confirmado" } : {}),
    })
    .eq("id", estanciaId)
    .select("checkin_sobrecupo, checkin_fuera_horario")
    .maybeSingle();

  if (error?.hint === "fuera_horario") return { error: null, fueraHorario: error.message, registros: await registrosDe(supabase, [{ t: "estancias", i: estanciaId }]) };
  if (error?.hint === "sobrecupo") return { error: null, sobrecupo: error.message, registros: await registrosDe(supabase, [{ t: "estancias", i: estanciaId }]) };
  if (error) return { error: traducirError(error) };

  revalidarModulosEstancia();
  revalidatePath(`/reservas/estancias/${estanciaId}/checkin`);
  return {
    error: null,
    quedo: (data?.checkin_sobrecupo as string | null | undefined) ?? null,
    quedoFueraHorario: (data?.checkin_fuera_horario as string | null | undefined) ?? null,
    registros: await registrosDe(supabase, [{ t: "estancias", i: estanciaId }]),
  };
}

export async function agregarPertenencia(
  estanciaId: string,
  descripcion: string
): Promise<{ error: string | null; id: string | null; registros?: RegistroFinal[] }> {
  if (!descripcion.trim()) return { error: "Escribe una descripción.", id: null };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("estancia_pertenencias")
    .insert({ estancia_id: estanciaId, descripcion: descripcion.trim() })
    .select("id")
    .single();

  if (error) return { error: "No pudimos guardar la pertenencia.", id: null };
  revalidatePath(`/reservas/estancias/${estanciaId}/checkin`);
  revalidatePath(`/reservas/estancias/${estanciaId}/checkout`);
  return {
    error: null,
    id: data.id,
    registros: await registrosDe(supabase, [{ t: "estancia_pertenencias", i: data.id as string }, { t: "estancias", i: estanciaId }]),
  };
}

export async function alternarPertenencia(
  pertenenciaId: string,
  devuelto: boolean
): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("estancia_pertenencias")
    .update({ devuelto })
    .eq("id", pertenenciaId);

  if (error) return { error: "No pudimos actualizar esa pertenencia." };
  return { error: null, registros: await registrosDe(supabase, [{ t: "estancia_pertenencias", i: pertenenciaId }]) };
}

export type CamposCheckout = {
  recogidoPorNombre: string;
  recogidoPorTelefono: string;
  recogidoPorEsDueno: boolean;
  // Las pertenencias que se entregan al dueño en esta salida (las que no vienen aquí quedan «sin entregar»).
  pertenenciasEntregadas?: string[];
  // Obligatorio si queda alguna pertenencia sin entregar.
  motivoSinEntrega?: string;
};

export async function confirmarCheckout(
  estanciaId: string,
  campos: CamposCheckout,
  confirmarFueraHorario = false
): Promise<EstadoAccion & { fueraHorario?: string; quedoFueraHorario?: string | null; saldo?: number | null; ajusteSalida?: string | null }> {
  if (!campos.recogidoPorNombre.trim()) {
    return { error: "Registra quién recoge al perro." };
  }

  const supabase = await createSupabaseServerClient();
  const entregadas = (campos.pertenenciasEntregadas ?? []).filter((id) => /^[0-9a-f-]{36}$/.test(id));

  // Lo que no se entrega se confirma con un motivo, que queda registrado con quién cerró la salida.
  const { data: registradas } = await supabase
    .from("estancia_pertenencias")
    .select("id")
    .eq("estancia_id", estanciaId)
    .is("deleted_at", null);
  const sinEntregar = (registradas ?? []).filter((p) => !entregadas.includes(p.id as string)).length;
  const motivoSinEntrega = (campos.motivoSinEntrega ?? "").trim();
  if (sinEntregar > 0 && motivoSinEntrega.length < 3) {
    return { error: "Hay pertenencias sin entregar: escribe el motivo para cerrar la salida." };
  }
  const { data: quien } = await supabase.auth.getUser();

  const { data: salida, error } = await supabase
    .from("estancias")
    .update({
      estado: "finalizada",
      recogido_por_nombre: campos.recogidoPorNombre.trim(),
      recogido_por_telefono: campos.recogidoPorTelefono.trim() || null,
      recogido_por_es_dueno: campos.recogidoPorEsDueno,
      pertenencias_sin_entrega_motivo: sinEntregar > 0 ? motivoSinEntrega : null,
      pertenencias_sin_entrega_por: sinEntregar > 0 ? (quien.user?.id ?? null) : null,
      ...(confirmarFueraHorario ? { checkout_fuera_horario: "confirmado" } : {}),
    })
    .eq("id", estanciaId)
    .select("checkout_fuera_horario")
    .maybeSingle();

  if (error?.hint === "fuera_horario") return { error: null, fueraHorario: error.message, registros: await registrosDe(supabase, [{ t: "estancias", i: estanciaId }]) };
  if (error) return { error: traducirError(error) };

  // Lo entregado queda registrado: quién y cuándo.
  if (entregadas.length > 0) {
    const u = quien;
    await supabase
      .from("estancia_pertenencias")
      .update({ devuelto: true, devuelto_at: new Date().toISOString(), devuelto_por: u.user?.id ?? null })
      .eq("estancia_id", estanciaId)
      .in("id", entregadas);
  }

  // N132: si salió antes de su salida prevista, la cuenta se ajusta a lo que usó (o no, por la política del negocio).
  // La salida ya quedó registrada: si el ajuste falla se dice, sin deshacerla.
  const { data: ajuste, error: errorAjuste } = await supabase.rpc("salida_anticipada_aplicar", { p_estancia_id: estanciaId });
  const a = (ajuste ?? null) as (CotizacionSalida & { aplicada?: boolean; saldo?: number }) | null;

  revalidarModulosEstancia();
  revalidatePath(`/reservas/estancias/${estanciaId}/checkout`);
  return {
    error: null,
    quedoFueraHorario: (salida?.checkout_fuera_horario as string | null | undefined) ?? null,
    saldo: a?.saldo ?? null,
    ajusteSalida: errorAjuste
      ? `No se pudo ajustar la cuenta a lo que usó: ${traducirError(errorAjuste)}. Revísala antes de cobrar`
      : a?.aplicada || a?.politica === "completa" ? textoSalidaAnticipada(a) : null,
    registros: await registrosDe(supabase, [{ t: "estancias", i: estanciaId }, ...entregadas.map((i) => ({ t: "estancia_pertenencias", i }))]),
  };
}

// Guardería que no recogen antes del cierre → noche de hotel. La RPC
// cambia el servicio de la misma estancia; el trigger recotiza por talla
// y valida cupo nocturno y requisitos. Si algo no cuadra, el mensaje de
// la base dice qué.
export async function convertirEnNocheHotel(estanciaId: string): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("convertir_estancia_a_hotel", { p_estancia_id: estanciaId });

  if (error) return { error: traducirError(error) };

  revalidarModulosEstancia();
  revalidatePath(`/reservas/estancias/${estanciaId}/checkout`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "estancias", i: estanciaId }]) };
}
