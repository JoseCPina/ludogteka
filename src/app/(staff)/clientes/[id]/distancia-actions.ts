"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { geocodificarDireccion } from "@/lib/google-maps/geocodificar";
import { calcularDistanciaRuta } from "@/lib/google-maps/ruta";

export type EstadoDistancia = {
  error: string | null;
  distanciaKm?: number;
  simulado?: boolean;
};

// Recalcula solo si la dirección de verdad cambió (o nunca se había
// geocodificado) — geocodificar/calcular ruta cuesta dinero y la
// distancia entre dos puntos fijos no cambia; pedirle a Google lo mismo
// cada vez que se abre esta pantalla sería tirar cuota.
export async function actualizarDireccionYCalcular(
  clienteId: string,
  direccionNueva: string
): Promise<EstadoDistancia> {
  const direccion = direccionNueva.trim();
  if (!direccion) return { error: "Escribe la dirección del cliente." };

  const supabase = await createSupabaseServerClient();

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("direccion, direccion_lat, direccion_lng")
    .eq("id", clienteId)
    .single();
  if (errorCliente || !cliente) return { error: "No se encontró al cliente." };

  const sinCambios =
    cliente.direccion === direccion && cliente.direccion_lat !== null && cliente.direccion_lng !== null;

  if (sinCambios) {
    const { data: actual } = await supabase
      .from("clientes")
      .select("distancia_base_km")
      .eq("id", clienteId)
      .single();
    return { error: null, distanciaKm: actual?.distancia_base_km ?? undefined };
  }

  // La dirección se guarda aunque falle lo de abajo — no se pierde lo que
  // el staff ya tecleó solo porque Google no pudo geocodificarla.
  await supabase.from("clientes").update({ direccion }).eq("id", clienteId);

  const geocodificado = await geocodificarDireccion(direccion);
  if (!geocodificado.ok) {
    revalidatePath(`/clientes/${clienteId}`);
    return { error: `${geocodificado.error} Puedes ajustar la distancia a mano mientras tanto.` };
  }

  const [{ data: cupoData }, { data: sucursal }] = await Promise.all([
    supabase.rpc("resolver_cupo_configuracion"),
    supabase.from("sucursales").select("lat, lng, direccion").is("deleted_at", null).limit(1).single(),
  ]);
  const cupo = (Array.isArray(cupoData) ? cupoData[0] : cupoData) as {
    base_lat: number | null;
    base_lng: number | null;
  } | null;

  if (!cupo?.base_lat || !cupo?.base_lng) {
    revalidatePath(`/clientes/${clienteId}`);
    return { error: "Falta configurar la dirección de la base (donde se guarda la camioneta). Avísale a soporte." };
  }
  if (!sucursal?.lat || !sucursal?.lng) {
    revalidatePath(`/clientes/${clienteId}`);
    return { error: "Falta configurar la dirección de Ludogteka. Avísale a soporte." };
  }

  const ruta = await calcularDistanciaRuta(
    { id: "base", lat: cupo.base_lat, lng: cupo.base_lng },
    { id: `cliente-${clienteId}`, lat: geocodificado.lat, lng: geocodificado.lng },
    { id: "ludogteka", lat: sucursal.lat, lng: sucursal.lng }
  );

  if (!ruta.ok) {
    revalidatePath(`/clientes/${clienteId}`);
    return { error: `${ruta.error} Puedes ajustar la distancia a mano mientras tanto.` };
  }

  const { error: errorUpdate } = await supabase
    .from("clientes")
    .update({
      direccion_lat: geocodificado.lat,
      direccion_lng: geocodificado.lng,
      distancia_base_km: ruta.km,
      distancia_calculada_at: new Date().toISOString(),
      distancia_ajustada_manualmente: false,
    })
    .eq("id", clienteId);

  if (errorUpdate) return { error: "No pudimos guardar la distancia calculada. Intenta de nuevo." };

  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, distanciaKm: ruta.km, simulado: ruta.simulado || geocodificado.simulado };
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
