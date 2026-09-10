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
