/**
 * "Nuevo cliente" desde una pantalla que estaba buscando a un cliente
 * (agendar estética, reservar, cobrar, vender pases): quien lo captura a
 * mano en el mostrador tiene que regresar a donde iba, con el cliente ya
 * elegido, en vez de volver a buscarlo.
 *
 * La ruta de regreso viaja en la URL (`?volver=`), así que se valida
 * contra una lista cerrada de módulos del staff: una ruta arbitraria
 * convertiría el alta en un redirect abierto.
 */
const PREFIJOS_DE_VUELTA = ["/estetica", "/guarderia", "/hotel", "/caja", "/reservas"];

export function rutaDeVuelta(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  if (!/^\/[a-z0-9\-/]*$/.test(valor) || valor.includes("//")) return null;
  return PREFIJOS_DE_VUELTA.some((p) => valor === p || valor.startsWith(`${p}/`)) ? valor : null;
}

// La pantalla de origen lee `?cliente=` y deja al cliente ya elegido.
export function hrefDeVuelta(ruta: string, clienteId: string) {
  return `${ruta}?cliente=${clienteId}`;
}
