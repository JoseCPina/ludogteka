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

// Centro aproximado de San Luis Potosí capital — el punto de partida de
// los deltas simulados, no una coordenada real de nadie.
const SLP_LAT = 22.1565;
const SLP_LNG = -100.9855;

export function geocodificarSimulado(direccion: string): { lat: number; lng: number } {
  const h = hashTexto(direccion.trim().toLowerCase());
  const deltaLat = ((h % 1000) / 1000 - 0.5) * 0.1;
  const deltaLng = (((h >> 10) % 1000) / 1000 - 0.5) * 0.1;
  return { lat: SLP_LAT + deltaLat, lng: SLP_LNG + deltaLng };
}

export function distanciaSimulada(origenId: string, intermedioId: string, destinoId: string): number {
  const h = hashTexto(`${origenId}|${intermedioId}|${destinoId}`);
  const km = 2 + (h % 280) / 10; // entre 2.0 y 29.9 km
  return Math.round(km * 10) / 10;
}
