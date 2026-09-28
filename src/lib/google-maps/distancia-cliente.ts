import type { SupabaseClient } from "@supabase/supabase-js";
import { geocodificarDireccion } from "./geocodificar";
import { calcularDistanciaRuta } from "./ruta";
import type { NegocioBasico } from "@/lib/negocio/resolver";
import { apartarConsulta, hayLlaveMaps, mensajeTope } from "./cuota";

export type ResultadoDistancia = {
  error: string | null;
  distanciaKm?: number;
  simulado?: boolean;
  // Se llegó al tope de consultas de Google Maps del mes: capturar a mano.
  sinCuota?: boolean;
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
  direccionNueva: string,
  // PeluDesk: todo se filtra por este negocio a mano, porque el alta por
  // link llega aquí con la secret key (salta la RLS: sin el filtro, la
  // sucursal podría ser la de otro negocio).
  negocio: Pick<NegocioBasico, "id">
): Promise<ResultadoDistancia> {
  const direccion = direccionNueva.trim();
  if (!direccion) return { error: "Escribe la dirección del cliente." };

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("direccion, direccion_lat, direccion_lng, distancia_base_km")
    .eq("id", clienteId)
    .eq("negocio_id", negocio.id)
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
  await supabase.from("clientes").update({ direccion }).eq("id", clienteId).eq("negocio_id", negocio.id);

  // La llave de Google es de PeluDesk, para todos, con tope por negocio al
  // mes (src/lib/google-maps/cuota.ts). Primero lo que no gasta consultas:
  // sin la dirección del negocio y la de la base no hay ruta que medir.
  const [{ data: cupoData }, { data: sucursal }, { data: neg }] = await Promise.all([
    supabase.rpc("resolver_cupo_configuracion"),
    supabase.from("sucursales").select("lat, lng").eq("negocio_id", negocio.id).is("deleted_at", null).order("activo", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("negocios").select("ciudad").eq("id", negocio.id).maybeSingle(),
  ]);
  const cupo = (Array.isArray(cupoData) ? cupoData[0] : cupoData) as {
    base_lat: number | null;
    base_lng: number | null;
  } | null;

  if (!cupo?.base_lat || !cupo?.base_lng) {
    return { error: "Falta la dirección de la base (donde se guarda la camioneta): el admin la captura en Administración → Ubicación para recolección. Mientras, captura la distancia a mano." };
  }
  if (!sucursal?.lat || !sucursal?.lng) {
    return { error: "Falta la dirección del negocio: el admin la captura en Administración → Ubicación para recolección. Mientras, captura la distancia a mano." };
  }

  if (hayLlaveMaps()) {
    const cuota = await apartarConsulta(supabase, "geocodificar");
    if (!cuota.permitida) return { error: mensajeTope(cuota), sinCuota: true };
  }
  const geocodificado = await geocodificarDireccion(direccion, {
    ciudad: (neg?.ciudad as string | null) ?? null,
    centro: { lat: Number(sucursal.lat), lng: Number(sucursal.lng) },
  });
  if (!geocodificado.ok) {
    return { error: `${geocodificado.error} Puedes ajustar la distancia a mano mientras tanto.` };
  }
  if (hayLlaveMaps()) {
    const cuota = await apartarConsulta(supabase, "ruta");
    if (!cuota.permitida) {
      // La coordenada ya costó una consulta: se guarda para no pedirla otra vez.
      await supabase
        .from("clientes")
        .update({ direccion_lat: geocodificado.lat, direccion_lng: geocodificado.lng })
        .eq("id", clienteId)
        .eq("negocio_id", negocio.id);
      return { error: mensajeTope(cuota), sinCuota: true };
    }
  }

  const ruta = await calcularDistanciaRuta(
    { id: "base", lat: cupo.base_lat, lng: cupo.base_lng },
    { id: `cliente-${clienteId}`, lat: geocodificado.lat, lng: geocodificado.lng },
    { id: "negocio", lat: Number(sucursal.lat), lng: Number(sucursal.lng) }
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
    .eq("id", clienteId)
    .eq("negocio_id", negocio.id);

  if (errorUpdate) return { error: "No pudimos guardar la distancia calculada. Intenta de nuevo." };

  return {
    error: null,
    distanciaKm: ruta.km,
    simulado: ruta.simulado || geocodificado.simulado,
  };
}
