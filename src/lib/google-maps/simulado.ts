// Modo simulación: cuando no hay GOOGLE_MAPS_API_KEY configurada (dev
// local sin la llave, o quien la lea nunca la pidió), geocodificar() y
// calcularDistanciaRuta() regresan valores fabricados pero determinísticos
// — la misma dirección siempre da la misma coordenada/distancia falsa, así
// se puede probar la UI y los tramos de tarifa sin gastar cuota real de
// Google ni necesitar la llave en desarrollo. Mismo espíritu que el aviso
// por WhatsApp de Fase 9: no depender de un servicio externo pagado para
// poder trabajar en el día a día.

function hashTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// El punto de partida de los deltas simulados: el negocio (si ya tiene
// coordenadas) o el centro geográfico de México. Nunca una ciudad fija: la
// simulación de un negocio de Tijuana no debe caer en otra ciudad.
const CENTRO_MEXICO = { lat: 23.6345, lng: -102.5528 };

export function geocodificarSimulado(direccion: string, centro?: { lat: number; lng: number } | null): { lat: number; lng: number } {
  const c = centro ?? CENTRO_MEXICO;
  const h = hashTexto(direccion.trim().toLowerCase());
  const deltaLat = ((h % 1000) / 1000 - 0.5) * 0.1;
  const deltaLng = (((h >> 10) % 1000) / 1000 - 0.5) * 0.1;
  return { lat: c.lat + deltaLat, lng: c.lng + deltaLng };
}

export function distanciaSimulada(origenId: string, intermedioId: string, destinoId: string): number {
  const h = hashTexto(`${origenId}|${intermedioId}|${destinoId}`);
  const km = 2 + (h % 280) / 10; // entre 2.0 y 29.9 km
  return Math.round(km * 10) / 10;
}
