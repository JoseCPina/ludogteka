"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  geocodificarYCalcularDistancia,
  type ResultadoDistancia,
} from "@/lib/google-maps/distancia-cliente";

export type EstadoDistancia = ResultadoDistancia;

// La lógica vive en lib/google-maps/distancia-cliente.ts porque ya son
// tres los caminos que la necesitan (esta ficha, el alta manual y el alta
// por link) y no pueden tener tres copias de cómo se cotiza un viaje.
// Aquí solo queda lo propio de esta pantalla: correr con la sesión del
// staff y revalidar la ficha.
export async function actualizarDireccionYCalcular(
  clienteId: string,
  direccionNueva: string
): Promise<EstadoDistancia> {
  const supabase = await createSupabaseServerClient();
  const resultado = await geocodificarYCalcularDistancia(supabase, clienteId, direccionNueva);
  revalidatePath(`/clientes/${clienteId}`);
  return resultado;
}

// En México es común que una colonia geocodifique mal — este es el
// escape hatch: recepción pone el número que sabe correcto, y queda
// marcado como ajuste manual para que nadie confíe en que vino de
// Google.
export async function ajustarDistanciaManual(clienteId: string, km: number): Promise<EstadoDistancia> {
  if (!Number.isFinite(km) || km < 0) {
    return { error: "La distancia debe ser un número mayor o igual a cero." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clientes")
    .update({
      distancia_base_km: Math.round(km * 10) / 10,
      distancia_calculada_at: new Date().toISOString(),
      distancia_ajustada_manualmente: true,
    })
    .eq("id", clienteId);

  if (error) return { error: "No pudimos guardar el ajuste. Intenta de nuevo." };

  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, distanciaKm: Math.round(km * 10) / 10 };
}
