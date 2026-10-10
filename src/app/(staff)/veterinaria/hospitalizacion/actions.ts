"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { zonaActual } from "@/lib/negocio/actual";
import { instanteDeHoraLocal } from "@/lib/formato";
import { traducirError } from "../../reservas/traducir-error";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const o = (v: string) => (v === "" ? null : v);
const numero = (v: string) => (v === "" ? null : Number(v));

export async function ingresarMascota(perroId: string, fd: FormData): Promise<ResultadoAccion> {
  if (!texto(fd, "motivo")) return { error: "Escribe el motivo del ingreso." };
  const deposito = numero(texto(fd, "deposito"));
  const precio = numero(texto(fd, "precio_dia"));
  if (deposito !== null && !(deposito >= 0)) return { error: "El depósito no es válido." };
  if (precio !== null && !(precio >= 0)) return { error: "El precio del día no es válido." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("hospitalizar_ingresar", {
    p_perro_id: perroId,
    p_medico_id: o(texto(fd, "medico_id")),
    p_motivo: texto(fd, "motivo"),
    p_ubicacion: o(texto(fd, "ubicacion")),
    p_deposito: deposito ?? 0,
    p_precio_dia: precio,
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/hospitalizacion");
  return { error: null, ir: `/veterinaria/hospitalizacion/${(data as { id: string }).id}` };
}

export async function indicarMedicacion(hospId: string, fd: FormData): Promise<ResultadoAccion> {
  if (!texto(fd, "producto") && !texto(fd, "insumo_id")) return { error: "Escribe el medicamento." };
  if (!texto(fd, "dosis")) return { error: "Escribe la dosis." };
  if (!texto(fd, "primera")) return { error: "Indica cuándo es la primera dosis." };
  const zona = await zonaActual();
  const n = numero(texto(fd, "num_dosis")) ?? 1;
  const freq = numero(texto(fd, "frecuencia_horas"));
  if (!Number.isInteger(n) || n < 1 || n > 200) return { error: "El número de dosis va de 1 a 200." };
  if (n > 1 && freq === null) return { error: "Con varias dosis, indica cada cuántas horas." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("hospitalizar_indicar_medicacion", {
    p_hosp: hospId,
    p_producto: o(texto(fd, "producto")),
    p_insumo_id: o(texto(fd, "insumo_id")),
    p_dosis: texto(fd, "dosis"),
    p_via: o(texto(fd, "via")),
    p_frecuencia_horas: freq,
    p_primera_dosis: instanteDeHoraLocal(texto(fd, "primera"), zona),
    p_num_dosis: n,
    p_precio_dosis: numero(texto(fd, "precio_dosis")),
    p_indicaciones: o(texto(fd, "indicaciones")),
    p_medico_id: o(texto(fd, "medico_id")),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/hospitalizacion/${hospId}`);
  return { error: null, exito: "Medicación indicada. Las dosis quedaron en la hoja." };
}

export async function suspenderMedicacion(hospId: string, medicacionId: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("hospitalizar_suspender_medicacion", { p_medicacion_id: medicacionId, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/hospitalizacion/${hospId}`);
  return { error: null, exito: "Medicación suspendida." };
}

export async function aplicarDosis(hospId: string, dosisId: string, fd: FormData): Promise<ResultadoAccion> {
  const cantidad = numero(texto(fd, "cantidad")) ?? 1;
  if (!(cantidad > 0)) return { error: "La cantidad tiene que ser mayor a cero." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("hospitalizar_aplicar_dosis", {
    p_dosis_id: dosisId,
    p_lote_id: o(texto(fd, "lote_id")),
    p_lote_texto: o(texto(fd, "lote_texto")),
    p_cantidad: cantidad,
    p_nota: o(texto(fd, "nota")),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/hospitalizacion/${hospId}`);
  const cargo = (data as { cargo_id: string | null } | null)?.cargo_id;
  return { error: null, exito: cargo ? "Dosis aplicada y cargada a la cuenta." : "Dosis aplicada." };
}

export async function omitirDosis(hospId: string, dosisId: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("hospitalizar_omitir_dosis", { p_dosis_id: dosisId, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/hospitalizacion/${hospId}`);
  return { error: null, exito: "Dosis marcada como no aplicada." };
}

export async function registrarMonitoreo(hospId: string, fd: FormData): Promise<ResultadoAccion> {
  const t = numero(texto(fd, "temperatura"));
  const p = numero(texto(fd, "peso"));
  const fc = numero(texto(fd, "fc"));
  const fr = numero(texto(fd, "fr"));
  if (t === null && p === null && fc === null && fr === null && !texto(fd, "notas")) return { error: "Captura al menos un dato o una nota." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("hospitalizar_monitorear", { p_hosp: hospId, p_temperatura: t, p_peso: p, p_fc: fc, p_fr: fr, p_notas: o(texto(fd, "notas")) });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/hospitalizacion/${hospId}`);
  return { error: null, exito: "Monitoreo registrado." };
}

export async function agregarCargoHospitalizacion(hospId: string, fd: FormData): Promise<ResultadoAccion> {
  const importe = numero(texto(fd, "importe"));
  if (importe === null || !(importe > 0)) return { error: "El importe tiene que ser mayor a cero." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("hospitalizar_agregar_cargo", { p_hosp: hospId, p_tipo: texto(fd, "tipo") || "procedimiento", p_descripcion: texto(fd, "descripcion"), p_importe: importe });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/hospitalizacion/${hospId}`);
  return { error: null, exito: "Cargo agregado a la cuenta." };
}

export async function darAlta(hospId: string, fd: FormData): Promise<ResultadoAccion> {
  if (!texto(fd, "resumen")) return { error: "Escribe el resumen del alta." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("hospitalizar_dar_alta", { p_hosp: hospId, p_resumen: texto(fd, "resumen") });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/hospitalizacion");
  revalidatePath(`/veterinaria/hospitalizacion/${hospId}`);
  return { error: null, exito: "Alta registrada. La cuenta está lista para cobrarse en Caja." };
}

export async function nuevoConsentimiento(perroId: string, hospId: string | null, fd: FormData): Promise<ResultadoAccion> {
  const tipo = texto(fd, "tipo");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("crear_consentimiento", {
    p_perro_id: perroId,
    p_tipo: tipo,
    p_hospitalizacion_id: hospId,
    p_procedimiento: o(texto(fd, "procedimiento")),
    p_medico_id: o(texto(fd, "medico_id")),
  });
  if (error) return { error: traducirError(error) };
  if (hospId) revalidatePath(`/veterinaria/hospitalizacion/${hospId}`);
  return { error: null, ir: `/veterinaria/consentimientos/${data as string}` };
}
