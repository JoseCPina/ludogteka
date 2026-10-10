"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

// Solo admin: la base lo exige en cada función.
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const entero = (fd: FormData, k: string) => {
  const v = texto(fd, k);
  return v === "" ? NaN : Number(v);
};

export async function guardarMedico(fd: FormData): Promise<ResultadoAccion> {
  const profileId = texto(fd, "profile_id");
  if (!profileId) return { error: "Elige a la persona del personal que será médico veterinario." };
  if (!texto(fd, "cedula")) return { error: "Escribe la cédula profesional del médico." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_medico_veterinario", {
    p_profile_id: profileId,
    p_cedula: texto(fd, "cedula"),
    p_cpa: texto(fd, "cpa") || null,
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/medicos");
  return { error: null, exito: "Médico guardado." };
}

export async function quitarMedico(medicoId: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("quitar_medico_veterinario", { p_medico_id: medicoId });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/medicos");
  return { error: null, exito: "Ya no es médico veterinario. Sus folios y los que ya usó se conservan." };
}

export async function asignarFolios(medicoId: string, fd: FormData): Promise<ResultadoAccion> {
  const desde = entero(fd, "desde");
  const hasta = entero(fd, "hasta");
  const usados = Number.isFinite(entero(fd, "usados_previos")) ? entero(fd, "usados_previos") : 0;
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 0) return { error: "Escribe el primer y el último folio del bloque, como números enteros." };
  if (hasta < desde) return { error: "El último folio tiene que ser mayor o igual al primero." };
  if (!Number.isInteger(usados) || usados < 0 || usados > hasta - desde + 1) return { error: "Los folios ya usados no pueden ser más que los del bloque." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("asignar_folios_medico", {
    p_medico_id: medicoId,
    p_prefijo: texto(fd, "prefijo"),
    p_desde: desde,
    p_hasta: hasta,
    p_usados_previos: usados,
    p_nota: texto(fd, "nota") || null,
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/medicos");
  return { error: null, exito: "Bloque de folios asignado." };
}
