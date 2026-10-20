// QA S17 (N28): los cobros que registró ESTA CARGA de la pantalla sobre una cuenta (o un cobro junto). Solo esos no
// piden confirmar al volver a cobrar. Viven en memoria y por carga (`carga` = un id que la pantalla crea al montarse):
// un F5, salir y volver a entrar u otra pestaña son otra carga, así que cualquier cobro de los últimos 2 minutos
// que no salió de aquí pide confirmar. Antes se guardaban en sessionStorage y un F5 los recordaba (no preguntaba).

const CLAVE = (carga: string, cuentas: string[]) => `${carga}:${[...cuentas].sort().join(",")}`;
const enMemoria = new Map<string, string[]>();

export function leerCobrosDePantalla(carga: string, cuentas: string[]): string[] {
  return enMemoria.get(CLAVE(carga, cuentas)) ?? [];
}

export function anotarCobroDePantalla(carga: string, cuentas: string[], id: string | undefined | null) {
  if (!id) return;
  const clave = CLAVE(carga, cuentas);
  enMemoria.set(clave, [...new Set([...(enMemoria.get(clave) ?? []), id])].slice(-20));
}
