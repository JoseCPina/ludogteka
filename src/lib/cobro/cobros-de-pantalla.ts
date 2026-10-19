// QA S15 (N28): los cobros que registró ESTA pestaña sobre una cuenta (o un cobro junto). Solo esos no piden confirmar
// al volver a cobrar; se guardan por pestaña (sessionStorage) para que un F5 no los olvide, y si el almacenamiento no
// está disponible, en memoria: en el peor caso se pregunta de más, nunca de menos.

const CLAVE = (cuentas: string[]) => `peludesk_cobros_pantalla:${[...cuentas].sort().join(",")}`;
const enMemoria = new Map<string, string[]>();

export function leerCobrosDePantalla(cuentas: string[]): string[] {
  const clave = CLAVE(cuentas);
  try {
    const v = window.sessionStorage.getItem(clave);
    if (v) return (JSON.parse(v) as string[]).filter((x) => typeof x === "string");
  } catch {
    // sin almacenamiento: lo de memoria
  }
  return enMemoria.get(clave) ?? [];
}

export function anotarCobroDePantalla(cuentas: string[], id: string | undefined | null) {
  if (!id) return;
  const clave = CLAVE(cuentas);
  const lista = [...new Set([...leerCobrosDePantalla(cuentas), id])].slice(-20);
  enMemoria.set(clave, lista);
  try {
    window.sessionStorage.setItem(clave, JSON.stringify(lista));
  } catch {
    // sin almacenamiento: queda en memoria
  }
}
