"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

export type ResultadoCargoSuelto = { error: string | null; reservaId?: string; precio?: number };

// Un cargo sin reserva de por medio: la base crea la cuenta y el cargo
// en una transacción (crear_cargo_suelto) y devuelve la cuenta para ir
// directo a cobrarla.
export async function crearCargoSuelto(datos: {
  clienteId: string;
  servicioId: string;
  cantidad: number;
  importe: number | null;
  descripcion: string;
  perroId: string | null;
  notas: string;
}): Promise<ResultadoCargoSuelto> {
  if (!datos.clienteId) return { error: "Elige al cliente." };
  if (!datos.servicioId) return { error: "Elige qué cargo aplicar." };
  if (!Number.isFinite(datos.cantidad) || datos.cantidad < 1) return { error: "La cantidad debe ser al menos 1." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("crear_cargo_suelto", {
    p_cliente_id: datos.clienteId,
    p_servicio_id: datos.servicioId,
    p_cantidad: datos.cantidad,
    p_importe: datos.importe,
    p_descripcion: datos.descripcion,
    p_perro_id: datos.perroId,
    p_notas: datos.notas,
  });
  if (error) return { error: traducirError(error) };

  const salida = data as { reserva_id: string; precio: number } | null;
  revalidatePath("/caja");
  return { error: null, reservaId: salida?.reserva_id, precio: salida ? Number(salida.precio) : undefined };
}

// QA S16 (N66): con Veterinaria, el cargo suelto ofrece la consulta general, la urgencia, la revisión de seguimiento y
// la aplicación de vacuna con su precio de catálogo (la base lo toma de la matriz; sin precio, dice dónde capturarlo).
export async function crearCargoVeterinario(datos: { clienteId: string; clave: string; cantidad: number; perroId: string | null; notas: string }): Promise<ResultadoCargoSuelto> {
  if (!datos.clienteId) return { error: "Elige al cliente." };
  if (!Number.isInteger(datos.cantidad) || datos.cantidad < 1) return { error: "La cantidad debe ser al menos 1." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_cargo_suelto", {
    p_cliente_id: datos.clienteId,
    p_perro_id: datos.perroId,
    p_clave: datos.clave,
    p_cantidad: datos.cantidad,
    p_notas: datos.notas,
  });
  if (error) return { error: traducirError(error) };
  const salida = data as { reserva_id: string; precio: number } | null;
  revalidatePath("/caja");
  return { error: null, reservaId: salida?.reserva_id, precio: salida ? Number(salida.precio) : undefined };
}
