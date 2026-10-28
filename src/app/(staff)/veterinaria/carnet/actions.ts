"use server";

import { registrosDe, registrosFinales } from "@/lib/concurrencia/registro-final";
import { conControl, controlDeFormulario } from "@/lib/concurrencia/servidor";
import { conflictoDeError, type ConRegistros } from "@/lib/concurrencia/tipos";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual, urlDelNegocio } from "@/lib/negocio/actual";
import { nuevoToken } from "@/lib/reporte/enlaces";
import { traducirError } from "../../reservas/traducir-error";
import type { ResultadoAccion } from "@/lib/empleados/tipos";
import type { CarnetCompleto, ResultadoEnlace } from "@/lib/veterinaria/carnet";
import type { AplicacionConsulta } from "@/lib/veterinaria/aplicacion-consulta";
import type { CargosConsulta } from "@/lib/veterinaria/cargos-consulta";
import type { SupabaseClient } from "@supabase/supabase-js";

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const o = (v: string) => (v === "" ? null : v);

// QA S18 (N93): desde una consulta, la vacuna nace ligada a ESA consulta (su cargo y su sección la siguen
// aunque la fecha de la consulta cambie).
/**
 * QA S27: desde una consulta, lo que se acaba de aplicar y los cargos de la consulta ya sincronizados viajan en la
 * respuesta y la pantalla los pinta al momento (sin revalidatePath, que repintaba la consulta entera antes de responder).
 */
async function aplicadoEnConsulta(supabase: SupabaseClient, perroId: string, consultaId: string, tipo: "vacuna" | "desparasitacion", id: string | undefined): Promise<AplicacionConsulta> {
  const [{ data: carnet }, { data: cargos }] = await Promise.all([
    supabase.rpc("carnet_de_mascota", { p_perro_id: perroId }),
    supabase.rpc("vet_consulta_cargos", { p_consulta: consultaId }),
  ]);
  const c = (carnet ?? null) as CarnetCompleto | null;
  return {
    consultaId,
    ...(tipo === "vacuna" ? { vacuna: c?.vacunas?.find((v) => v.id === id) } : { desparasitacion: c?.desparasitaciones?.find((v) => v.id === id) }),
    cargos: (cargos ?? null) as CargosConsulta | null,
  };
}

export async function registrarVacuna(perroId: string, fd: FormData, consultaId?: string): Promise<ResultadoAccion & { aplicada?: AplicacionConsulta }> {
  if (!texto(fd, "biologico") && !texto(fd, "insumo_id")) return { error: "Escribe qué vacuna se aplicó." };
  if (!texto(fd, "fecha")) return { error: "Escribe la fecha de aplicación." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(consultaId ? "vet_consulta_registrar_vacuna" : "registrar_vacuna", {
    ...(consultaId ? { p_consulta: consultaId } : { p_perro_id: perroId }),
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
  const aviso = (data as { aviso?: string } | null)?.aviso;
  const exito = aviso ? `Vacuna registrada. ${aviso}` : "Vacuna registrada en el carnet.";
  if (consultaId) return { error: null, exito, aplicada: await aplicadoEnConsulta(supabase, perroId, consultaId, "vacuna", (data as { id?: string } | null)?.id) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return { error: null, exito };
}

export async function registrarDesparasitacion(perroId: string, fd: FormData, consultaId?: string): Promise<ResultadoAccion & { aplicada?: AplicacionConsulta }> {
  if (!texto(fd, "producto") && !texto(fd, "insumo_id")) return { error: "Escribe qué producto se aplicó." };
  if (!texto(fd, "fecha")) return { error: "Escribe la fecha de aplicación." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(consultaId ? "vet_consulta_registrar_desparasitacion" : "registrar_desparasitacion", {
    ...(consultaId ? { p_consulta: consultaId } : { p_perro_id: perroId }),
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
  const exito = "Desparasitación registrada en el carnet.";
  if (consultaId) return { error: null, exito, aplicada: await aplicadoEnConsulta(supabase, perroId, consultaId, "desparasitacion", (data as { id?: string } | null)?.id) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return { error: null, exito };
}

export async function anularRegistroCarnet(perroId: string, tipo: "vacuna" | "desparasitacion", id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("anular_registro_carnet", { p_tipo: tipo, p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return {
    error: null,
    exito: "Registro anulado. Queda en el historial con su motivo.",
    registros: await registrosDe(supabase, [{ t: tipo === "vacuna" ? "carnet_vacunas" : "carnet_desparasitaciones", i: id }]),
  };
}

export async function recordatoriosDeMascota(perroId: string, apagados: boolean): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("carnet_recordatorios_mascota", { p_perro_id: perroId, p_apagados: apagados });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return {
    error: null,
    exito: apagados ? "Esta mascota ya no recibirá recordatorios." : "Esta mascota volvió a recibir recordatorios.",
    registros: await registrosDe(supabase, [{ t: "perros", i: perroId, datos: { recordatorios_apagados: apagados } }]),
  };
}

/** El enlace verificable del carnet. El token en claro se muestra UNA vez: en la base solo queda su sha256. */
export async function generarEnlaceCarnet(perroId: string): Promise<ResultadoEnlace & ConRegistros> {
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  const { token, hash } = nuevoToken();
  const { data: enlaceId, error } = await supabase.rpc("carnet_registrar_enlace", { p_perro_id: perroId, p_token_hash: hash });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return { error: null, url: `${urlDelNegocio(negocio)}/c/${token}`, registros: await registrosDe(supabase, [{ t: "carnet_enlaces", i: enlaceId as string | null }]) };
}

export async function revocarEnlaceCarnet(perroId: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("carnet_revocar_enlace", { p_perro_id: perroId });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return {
    error: null,
    exito: "El enlace dejó de funcionar. Quien lo tenga ya no puede ver el carnet.",
    registros: await registrosDe(supabase, [{ t: "perros", i: perroId, datos: { carnet_enlace_activo: false } }]),
  };
}

export async function guardarAjustesVeterinaria(fd: FormData): Promise<ResultadoAccion> {
  const precio = texto(fd, "precio_dia");
  const dias = Number(texto(fd, "dias_anticipacion"));
  const vigencia = Number(texto(fd, "certificado_vigencia_dias"));
  if (!Number.isInteger(dias) || dias < 0 || dias > 60) return { error: "Los días de anticipación van de 0 a 60." };
  if (!Number.isInteger(vigencia) || vigencia < 1 || vigencia > 365) return { error: "La vigencia del certificado va de 1 a 365 días." };
  if (precio !== "" && !(Number(precio) >= 0)) return { error: "El precio del día no es válido." };
  const supabase = await createSupabaseServerClient();
  const { error } = await conControl(
    supabase.rpc("guardar_veterinaria_ajustes", {
      p_recordatorios_activos: fd.get("recordatorios_activos") === "si",
      p_dias_anticipacion: dias,
      p_certificado_vigencia_dias: vigencia,
      p_carnet_reemplaza_comprobante: fd.get("carnet_reemplaza_comprobante") === "si",
      p_precio_dia: precio === "" ? null : Number(precio),
    }),
    controlDeFormulario(fd)
  );
  const conflicto = conflictoDeError(error);
  if (conflicto) return { error: null, conflicto, registros: await registrosFinales(supabase, controlDeFormulario(fd)) };
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/ajustes");
  return { error: null, registros: await registrosFinales(supabase, controlDeFormulario(fd)), exito: "Ajustes de Veterinaria guardados." };
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
  return { error: null, exito: "Certificado anulado.", registros: await registrosDe(supabase, [{ t: "certificados_salud", i: id }]) };
}

export async function marcarRecordatorio(id: string, estado: "manual" | "omitido", fd?: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("carnet_recordatorio_marcar", { p_id: id, p_estado: estado, p_nota: fd ? o(texto(fd, "nota")) : null });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recordatorios");
  return {
    error: null,
    exito: estado === "manual" ? "Anotado como enviado." : "Recordatorio omitido.",
    registros: await registrosDe(supabase, [{ t: "carnet_recordatorios", i: id }]),
  };
}

/** «Reintentar envío»: el recordatorio vuelve a pendiente y la tarea lo manda otra vez en su siguiente corrida. */
export async function reintentarRecordatorio(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("carnet_recordatorio_reintentar", { p_id: id });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recordatorios");
  revalidatePath("/recepcion");
  return {
    error: null,
    exito: "Listo: se vuelve a mandar en la siguiente corrida (cada hora, de 9:00 a 20:00).",
    registros: await registrosDe(supabase, [{ t: "carnet_recordatorios", i: id }]),
  };
}

export async function guardarDictadoAjustes(fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_veterinaria_dictado", { p_conservar: fd.get("conservar") === "si" });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/ajustes");
  return {
    error: null,
    exito: "Opción del dictado guardada.",
    registros: await registrosDe(supabase, [{ t: "veterinaria_ajustes", i: (await negocioActual()).id }]),
  };
}

export async function guardarTeleconsultaAjustes(fd: FormData): Promise<ResultadoAccion> {
  const cobro = fd.get("cobro") === "si";
  const precio = texto(fd, "precio");
  if (precio !== "" && !(Number(precio) >= 0)) return { error: "El precio no es válido." };
  if (cobro && !(Number(precio) > 0)) return { error: "Para cobrar por adelantado escribe el precio de la teleconsulta." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_veterinaria_teleconsulta", { p_cobro: cobro, p_precio: precio === "" ? null : Number(precio) });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/ajustes");
  return {
    error: null,
    exito: "Opciones de la teleconsulta guardadas.",
    registros: await registrosDe(supabase, [{ t: "veterinaria_ajustes", i: (await negocioActual()).id }]),
  };
}
