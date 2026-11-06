// Recolección a domicilio ligada a una reserva (migración 20261203004100; docs/guarderia-hotel.md). Tipos y textos que
// comparten el formulario «Incluir recolección», el bloque de la reserva y de la cita, el tablero del día y /recolecciones.

export type EstadoRecoleccion = "pendiente" | "en_camino" | "recogido" | "cancelada";
export type PuntoPartida = "negocio" | "base";

export const ETIQUETA_PUNTO: Record<PuntoPartida, string> = { negocio: "El local", base: "La base de la camioneta" };

export function etiquetaEstadoRecoleccion(estado: string): string {
  return estado === "en_camino" ? "En camino" : estado === "recogido" ? "Recogido" : estado === "cancelada" ? "Cancelada" : "Pendiente";
}

/** Lo que devuelve recoleccion_cotizar. */
export type Cotizacion = {
  km: number | null;
  origen_km: "guardada" | "calculada" | "ruta" | "estimada" | "sin_datos";
  punto: PuntoPartida;
  punto_direccion: string | null;
  servicio_id: string;
  cantidad: number;
  precio_km: number | null;
  precio: number | null;
  estado_precio: string;
  sin_tarifa: string | null;
  direccion_guardada: string | null;
  lat_guardada: number | null;
  lng_guardada: number | null;
};

/** Lo que el formulario arma y la acción guarda (después de cotizar). */
export type PedidoRecoleccion = {
  direccion: string;
  lat: number | null;
  lng: number | null;
  punto: PuntoPartida;
  km: number;
  hora: string | null;
  notas: string;
  guardarDireccion: boolean;
};

export type Recoleccion = {
  id: string;
  reserva_id: string;
  estancia_id: string | null;
  cita_id: string | null;
  perro_id: string;
  cliente_id: string;
  fecha: string;
  hora_estimada: string | null;
  direccion: string;
  lat: number | null;
  lng: number | null;
  punto_partida: PuntoPartida;
  km: number;
  precio: number;
  cargo_id: string | null;
  estado: EstadoRecoleccion;
  salio_at: string | null;
  recogido_at: string | null;
  cancelada_at: string | null;
  motivo_cancelacion: string | null;
  notas: string | null;
  updated_at: string;
};

/** Una fila de recolecciones_dia (con el perro, el cliente y la distancia al punto de partida). */
export type RecoleccionDia = Recoleccion & {
  perro_nombre: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  punto_direccion: string | null;
  distancia_recta_km: number | null;
};

/** «Cómo llegar»: Google Maps con destino la dirección (o la coordenada) y origen el punto de partida si se conoce. */
export function linkComoLlegar(r: { direccion: string; lat: number | null; lng: number | null; punto_direccion?: string | null }): string {
  const destino = r.lat != null && r.lng != null ? `${r.lat},${r.lng}` : r.direccion;
  const p = new URLSearchParams({ api: "1", destination: destino, travelmode: "driving" });
  if (r.punto_direccion) p.set("origin", r.punto_direccion);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

export function horaCorta(hora: string | null | undefined): string | null {
  if (!hora) return null;
  const [h, m] = hora.split(":");
  const n = Number(h);
  if (!Number.isFinite(n)) return hora;
  const sufijo = n >= 12 ? "p. m." : "a. m.";
  const h12 = n % 12 === 0 ? 12 : n % 12;
  return `${h12}:${m} ${sufijo}`;
}
