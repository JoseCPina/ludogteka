"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conControl } from "@/lib/concurrencia/servidor";
import { conflictoDeError, type Conflicto, type ControlVersion, type RegistroFinal } from "@/lib/concurrencia/tipos";
import { registrosDe, registrosFinales } from "@/lib/concurrencia/registro-final";
import { traducirError } from "../reservas/traducir-error";
import { esMotivoBaja } from "@/lib/perros/baja";

/**
 * Dar de baja una mascota sin tocar al dueño. La regla la aplica la base (perro_dar_de_baja): admin o recepción; con
 * una cita, estancia, consulta u hospitalización viva no deja y dice cuál; sin historial la elimina de verdad, con
 * historial la deja inactiva (deleted_at + motivo + quién) y reactivable; termina sus series, apaga sus recordatorios
 * y deja la bitácora en perros_bajas. La versión leída viaja con el control de concurrencia (perros).
 */
export type ResultadoBaja = {
  error: string | null;
  conflicto?: Conflicto | null;
  registros?: RegistroFinal[];
  ir?: string;
  resultado?: "eliminada" | "inactiva";
};

type SalidaBaja = { resultado: "eliminada" | "inactiva"; perro_id: string; cliente_id: string; nombre: string; recordatorios_apagados: number; pases_con_saldo: unknown[] };

export async function darDeBajaMascota(perroId: string, motivo: string, nota: string, solicitudId: string | null, control?: ControlVersion): Promise<ResultadoBaja> { // registro-final: navega a la ficha del dueño (ir)
  if (!esMotivoBaja(motivo)) return { error: "Elige el motivo de la baja." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await conControl(
    supabase.rpc("perro_dar_de_baja", { p_perro_id: perroId, p_motivo: motivo, p_nota: nota.trim() || null, p_solicitud_id: solicitudId }),
    control
  );
  if (error) {
    const c = conflictoDeError(error);
    return c ? { error: null, conflicto: c, registros: await registrosFinales(supabase, control) } : { error: traducirError(error) };
  }
  const d = data as SalidaBaja;
  if (d.resultado === "eliminada") {
    // La mascota ya no existe: su foto y sus archivos tampoco (si el almacenamiento no deja, no pasa nada).
    try {
      const carpeta = `${d.cliente_id}/${perroId}`;
      const { data: archivos } = await supabase.storage.from("perros-archivos").list(carpeta, { limit: 200 });
      if (archivos?.length) await supabase.storage.from("perros-archivos").remove(archivos.map((a) => `${carpeta}/${a.name}`));
    } catch (e) {
      console.error("[baja] archivos", e instanceof Error ? e.message : e);
    }
  }
  revalidatePath(`/clientes/${d.cliente_id}`);
  revalidatePath(`/perros/${perroId}`);
  revalidatePath("/recepcion");
  revalidatePath("/admin");
  const q = new URLSearchParams({ baja: d.resultado, mascota: d.nombre });
  if (Array.isArray(d.pases_con_saldo) && d.pases_con_saldo.length) q.set("pases", String(d.pases_con_saldo.length));
  return { error: null, resultado: d.resultado, ir: `/clientes/${d.cliente_id}?${q}` };
}

/** La baja fue un error: la mascota vuelve a estar activa (y deja de estar «fallecida» si vino de esa baja). */
export async function reactivarMascota(perroId: string): Promise<ResultadoBaja> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("perro_reactivar", { p_perro_id: perroId });
  if (error) return { error: traducirError(error) };
  const d = data as { cliente_id: string };
  revalidatePath(`/clientes/${d.cliente_id}`);
  revalidatePath(`/perros/${perroId}`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "perros", i: perroId }]) };
}

/** El negocio no acepta la solicitud del dueño; el motivo lo lee él en su portal. */
export async function rechazarSolicitudBaja(solicitudId: string, respuesta: string, perroId: string): Promise<ResultadoBaja> {
  if (respuesta.trim().length < 3) return { error: "Para rechazar la solicitud hay que decir por qué: el dueño lo va a leer." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("perro_solicitud_baja_rechazar", { p_solicitud_id: solicitudId, p_respuesta: respuesta.trim() });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/perros/${perroId}`);
  revalidatePath("/recepcion");
  revalidatePath("/admin");
  return { error: null, registros: await registrosDe(supabase, [{ t: "perros_bajas", i: solicitudId }]) };
}

/** Un pase con saldo de la mascota dada de baja pasa a otra mascota del mismo dueño (permiso «Ajustar días de pases»). */
export async function traspasarPase(bonoId: string, perroDestino: string): Promise<ResultadoBaja> {
  if (!perroDestino) return { error: "Escoge a qué mascota se traspasa el pase." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("pase_traspasar_a_mascota", { p_bono_id: bonoId, p_perro_destino: perroDestino });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/perros/${perroDestino}`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "bonos_clientes", i: bonoId }]) };
}
