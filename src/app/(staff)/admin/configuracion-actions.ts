"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/telefono";
import { traducirError } from "../reservas/traducir-error";

export type EstadoConfiguracion = { error: string | null };

export async function guardarConfiguracionNegocio(datos: {
  cupoDiurno: number;
  cupoNocturno: number;
  telefonoRecepcion: string;
  baseDireccion: string;
}): Promise<EstadoConfiguracion> {
  if (!Number.isFinite(datos.cupoDiurno) || datos.cupoDiurno < 0) {
    return { error: "El cupo de día tiene que ser un número de cero para arriba." };
  }
  if (!Number.isFinite(datos.cupoNocturno) || datos.cupoNocturno < 0) {
    return { error: "El cupo de noche tiene que ser un número de cero para arriba." };
  }

  // El teléfono se guarda a diez dígitos planos, igual que el de los
  // clientes: es el mismo formato con el que se arma el enlace de
  // WhatsApp, y aceptarlo con guiones aquí obligaría a limpiarlo en cada
  // pantalla que lo use.
  const telefonoCrudo = datos.telefonoRecepcion.trim();
  let telefono: string | null = null;
  if (telefonoCrudo) {
    telefono = normalizarTelefono(telefonoCrudo);
    if (!telefono) {
      return { error: "El teléfono de recepción debe tener 10 dígitos." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_configuracion_negocio", {
    p_cupo_diurno: datos.cupoDiurno,
    p_cupo_nocturno: datos.cupoNocturno,
    p_telefono_recepcion: telefono,
    p_base_direccion: datos.baseDireccion.trim() || null,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/admin");
  revalidatePath("/login");
  return { error: null };
}

// Un día cerrado va con las dos horas vacías. 0 = domingo … 6 = sábado,
// igual que horario_semana.
export type DiaHorario = { dia_semana: number; hora_apertura: string | null; hora_cierre: string | null };

export type EstadoHorario = { error: string | null; reservasEnDiasCerrados?: number };

export async function guardarHorarioSemana(dias: DiaHorario[]): Promise<EstadoHorario> {
  for (const d of dias) {
    if (Boolean(d.hora_apertura) !== Boolean(d.hora_cierre)) {
      return { error: "Cada día abierto necesita hora de apertura y de cierre." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("guardar_horario_semana", { p_dias: dias });
  if (error) return { error: traducirError(error) };

  revalidatePath("/admin");
  const salida = data as { reservas_en_dias_cerrados?: number } | null;
  return { error: null, reservasEnDiasCerrados: salida?.reservas_en_dias_cerrados ?? 0 };
}
