import type { SupabaseClient } from "@supabase/supabase-js";
import { geocodificarDireccion } from "./geocodificar";
import { calcularDistanciaRuta } from "./ruta";

export type ResultadoDistancia = {
  error: string | null;
  distanciaKm?: number;
  simulado?: boolean;
};

// El cálculo de la distancia de un cliente, en un solo lugar, porque ya
// son tres los caminos que lo necesitan: la ficha del cliente (recepción
// corrigiendo una dirección), el alta manual y el alta por link. Escrito
// contra un SupabaseClient que se recibe y no que se crea aquí, porque
// esos tres caminos no corren con los mismos permisos: los dos primeros
// con la sesión del staff, el tercero con la secret key desde el servidor
// (el dueño todavía no tiene sesión cuando termina su alta).
//
// Recalcula solo si la dirección de verdad cambió, o si nunca se había
// geocodificado. Geocodificar y medir la ruta cuestan dinero y la
// distancia entre dos puntos fijos no cambia: pedirle a Google lo mismo
// otra vez sería tirar cuota.
export async function geocodificarYCalcularDistancia(
  supabase: SupabaseClient,
  clienteId: string,
  direccionNueva: string
): Promise<ResultadoDistancia> {
  const direccion = direccionNueva.trim();
  if (!direccion) return { error: "Escribe la dirección del cliente." };

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("direccion, direccion_lat, direccion_lng, distancia_base_km")
    .eq("id", clienteId)
    .single();
  if (errorCliente || !cliente) return { error: "No se encontró al cliente." };

  const sinCambios =
    cliente.direccion === direccion &&
    cliente.direccion_lat !== null &&
    cliente.direccion_lng !== null;
  if (sinCambios) {
    return { error: null, distanciaKm: cliente.distancia_base_km ?? undefined };
  }

  // La dirección se guarda aunque falle lo de abajo — no se pierde lo que
  // ya se tecleó solo porque Google no pudo geocodificarla, y recepción
  // puede ajustar la distancia a mano sobre esa misma dirección.
  await supabase.from("clientes").update({ direccion }).eq("id", clienteId);

  const geocodificado = await geocodificarDireccion(direccion);
  if (!geocodificado.ok) {
    return { error: `${geocodificado.error} Puedes ajustar la distancia a mano mientras tanto.` };
  }

  const [{ data: cupoData }, { data: sucursal }] = await Promise.all([
    supabase.rpc("resolver_cupo_configuracion"),
    supabase.from("sucursales").select("lat, lng").is("deleted_at", null).limit(1).single(),
  ]);
  const cupo = (Array.isArray(cupoData) ? cupoData[0] : cupoData) as {
    base_lat: number | null;
    base_lng: number | null;
  } | null;

  if (!cupo?.base_lat || !cupo?.base_lng) {
    return {
      error: "Falta configurar la dirección de la base (donde se guarda la camioneta). Avísale a soporte.",
    };
  }
  if (!sucursal?.lat || !sucursal?.lng) {
    return { error: "Falta configurar la dirección de Ludogteka. Avísale a soporte." };
  }

  const ruta = await calcularDistanciaRuta(
    { id: "base", lat: cupo.base_lat, lng: cupo.base_lng },
    { id: `cliente-${clienteId}`, lat: geocodificado.lat, lng: geocodificado.lng },
    { id: "ludogteka", lat: sucursal.lat, lng: sucursal.lng }
  );

  if (!ruta.ok) {
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

  return {
    error: null,
    distanciaKm: ruta.km,
    simulado: ruta.simulado || geocodificado.simulado,
  };
}
