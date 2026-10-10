"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual, urlDelNegocio } from "@/lib/negocio/actual";
import { nuevoToken } from "@/lib/reporte/enlaces";
import { traducirError } from "../../reservas/traducir-error";
import type { ResultadoAccion } from "@/lib/empleados/tipos";
import type { ResultadoEnlace } from "@/lib/veterinaria/carnet";

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const o = (v: string) => (v === "" ? null : v);

export async function registrarVacuna(perroId: string, fd: FormData): Promise<ResultadoAccion> {
  if (!texto(fd, "biologico") && !texto(fd, "insumo_id")) return { error: "Escribe qué vacuna se aplicó." };
  if (!texto(fd, "fecha")) return { error: "Escribe la fecha de aplicación." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_vacuna", {
    p_perro_id: perroId,
    p_biologico: texto(fd, "biologico") || null,
    p_tipo_requisito_id: o(texto(fd, "tipo_requisito_id")),
    p_insumo_id: o(texto(fd, "insumo_id")),
    p_lote_id: o(texto(fd, "lote_id")),
    p_lote_texto: o(texto(fd, "lote_texto")),
    p_laboratorio: o(texto(fd, "laboratorio")),
    p_fecha: texto(fd, "fecha"),
    p_proxima: o(texto(fd, "proxima")),
    p_medico_id: o(texto(fd, "medico_id")),
    p_dosis: o(texto(fd, "dosis")),
    p_notas: o(texto(fd, "notas")),
    p_descontar: fd.get("descontar") !== "no",
  });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  const aviso = (data as { aviso?: string } | null)?.aviso;
  return { error: null, exito: aviso ? `Vacuna registrada. ${aviso}` : "Vacuna registrada en el carnet." };
}

export async function registrarDesparasitacion(perroId: string, fd: FormData): Promise<ResultadoAccion> {
  if (!texto(fd, "producto") && !texto(fd, "insumo_id")) return { error: "Escribe qué producto se aplicó." };
  if (!texto(fd, "fecha")) return { error: "Escribe la fecha de aplicación." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_desparasitacion", {
    p_perro_id: perroId,
    p_tipo: texto(fd, "tipo") || "interna",
    p_producto: texto(fd, "producto") || null,
    p_insumo_id: o(texto(fd, "insumo_id")),
    p_lote_id: o(texto(fd, "lote_id")),
    p_lote_texto: o(texto(fd, "lote_texto")),
    p_dosis: o(texto(fd, "dosis")),
    p_fecha: texto(fd, "fecha"),
    p_proxima: o(texto(fd, "proxima")),
    p_medico_id: o(texto(fd, "medico_id")),
    p_notas: o(texto(fd, "notas")),
    p_descontar: fd.get("descontar") !== "no",
  });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return { error: null, exito: "Desparasitación registrada en el carnet." };
}

export async function anularRegistroCarnet(perroId: string, tipo: "vacuna" | "desparasitacion", id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("anular_registro_carnet", { p_tipo: tipo, p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return { error: null, exito: "Registro anulado. Queda en el historial con su motivo." };
}

export async function recordatoriosDeMascota(perroId: string, apagados: boolean): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("carnet_recordatorios_mascota", { p_perro_id: perroId, p_apagados: apagados });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return { error: null, exito: apagados ? "Esta mascota ya no recibirá recordatorios." : "Esta mascota volvió a recibir recordatorios." };
}

/** El enlace verificable del carnet. El token en claro se muestra UNA vez: en la base solo queda su sha256. */
export async function generarEnlaceCarnet(perroId: string): Promise<ResultadoEnlace> {
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  const { token, hash } = nuevoToken();
  const { error } = await supabase.rpc("carnet_registrar_enlace", { p_perro_id: perroId, p_token_hash: hash });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return { error: null, url: `${urlDelNegocio(negocio)}/c/${token}` };
}

export async function revocarEnlaceCarnet(perroId: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("carnet_revocar_enlace", { p_perro_id: perroId });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return { error: null, exito: "El enlace dejó de funcionar. Quien lo tenga ya no puede ver el carnet." };
}

export async function guardarAjustesVeterinaria(fd: FormData): Promise<ResultadoAccion> {
  const precio = texto(fd, "precio_dia");
  const dias = Number(texto(fd, "dias_anticipacion"));
  const vigencia = Number(texto(fd, "certificado_vigencia_dias"));
  if (!Number.isInteger(dias) || dias < 0 || dias > 60) return { error: "Los días de anticipación van de 0 a 60." };
  if (!Number.isInteger(vigencia) || vigencia < 1 || vigencia > 365) return { error: "La vigencia del certificado va de 1 a 365 días." };
  if (precio !== "" && !(Number(precio) >= 0)) return { error: "El precio del día no es válido." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_veterinaria_ajustes", {
    p_recordatorios_activos: fd.get("recordatorios_activos") === "si",
    p_dias_anticipacion: dias,
    p_certificado_vigencia_dias: vigencia,
    p_carnet_reemplaza_comprobante: fd.get("carnet_reemplaza_comprobante") === "si",
    p_precio_dia: precio === "" ? null : Number(precio),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/ajustes");
  return { error: null, exito: "Ajustes de Veterinaria guardados." };
}

export async function emitirCertificado(perroId: string, fd: FormData): Promise<ResultadoAccion> {
  if (!texto(fd, "exploracion")) return { error: "Escribe lo que encontraste en la exploración." };
  const dias = texto(fd, "dias");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("emitir_certificado", {
    p_perro_id: perroId,
    p_medico_id: o(texto(fd, "medico_id")),
    p_motivo: texto(fd, "motivo") || "general",
    p_destino: o(texto(fd, "destino")),
    p_exploracion: texto(fd, "exploracion"),
    p_observaciones: o(texto(fd, "observaciones")),
    p_dias_vigencia: dias === "" ? null : Number(dias),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/certificados");
  const id = (data as { id: string }).id;
  return { error: null, ir: `/veterinaria/certificados/${id}` };
}

export async function anularCertificado(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("anular_certificado", { p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/certificados/${id}`);
  return { error: null, exito: "Certificado anulado." };
}

export async function marcarRecordatorio(id: string, estado: "manual" | "omitido", fd?: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("carnet_recordatorio_marcar", { p_id: id, p_estado: estado, p_nota: fd ? o(texto(fd, "nota")) : null });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recordatorios");
  return { error: null, exito: estado === "manual" ? "Anotado como enviado." : "Recordatorio omitido." };
}
