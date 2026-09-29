// El artículo de una pantalla (para el «?»): el de la ruta más específica.
// Aparte del índice para que el menú no cargue el texto de los artículos.
type ConRutas = { slug: string; rutas: string[] };

function coincide(ruta: string, pathname: string): number {
  const partes = ruta.split("/").filter(Boolean);
  const actual = pathname.split("?")[0].split("/").filter(Boolean);
  if (partes.length > actual.length) return -1;
  for (let i = 0; i < partes.length; i++) {
    if (partes[i].startsWith("[")) continue;
    if (partes[i] !== actual[i]) return -1;
  }
  return partes.length;
}

export function articuloDeRuta<T extends ConRutas>(pathname: string, lista: T[]): T | null {
  let mejor: T | null = null;
  let largo = 0;
  for (const a of lista) {
    for (const r of a.rutas) {
      const n = coincide(r, pathname);
      if (n > largo) {
        largo = n;
        mejor = a;
      }
    }
  }
  return mejor;
}
