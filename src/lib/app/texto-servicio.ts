/**
 * Lo que incluye un servicio: en la base es una lista (`servicios.incluye`, text[]); un texto viejo puede venir en
 * renglones. En la app se lee en una línea con «·» (sin separador, React pegaba los elementos: «BañoCepillado…»).
 */
export function incluyeEnLinea(incluye: string | string[] | null | undefined): string {
  const partes = Array.isArray(incluye) ? incluye : String(incluye ?? "").split(/\r?\n+/);
  return partes
    .map((x) => String(x).trim())
    .filter(Boolean)
    .join(" · ");
}
