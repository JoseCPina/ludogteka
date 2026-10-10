// Lectura de un Excel (.xlsx) o CSV en el navegador. Todo se convierte a texto: el
// archivo nunca sube completo al servidor, solo las filas ya mapeadas.

export type TablaArchivo = { encabezados: string[]; filas: string[][] };

export const MAX_FILAS = 20000;
export const MAX_BYTES = 8 * 1024 * 1024;

function aTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    // Un teléfono de Excel llega como número: sin exponente ni decimales de más.
    return Number.isInteger(v) ? v.toFixed(0) : String(v);
  }
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v).trim();
}

/** Separa un CSV respetando comillas y detectando coma, punto y coma o tabulador. */
export function parsearCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primera = t.split(/\r?\n/, 1)[0] ?? "";
  const cuentas: [string, number][] = [",", ";", "\t"].map((d) => [d, primera.split(d).length - 1]);
  cuentas.sort((a, b) => b[1] - a[1]);
  const sep = cuentas[0][1] > 0 ? cuentas[0][0] : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
    } else if (c === '"' && campo === "") comillas = true;
    else if (c === sep) {
      fila.push(campo.trim());
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo.trim());
      campo = "";
      filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== "" || fila.length) {
    fila.push(campo.trim());
    filas.push(fila);
  }
  return filas;
}

function decodificar(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // CSV guardado por Excel en Windows: Windows-1252.
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function aTabla(crudas: string[][]): TablaArchivo {
  const filas = crudas.filter((f) => f.some((c) => c !== ""));
  if (filas.length === 0) throw new Error("El archivo está vacío.");
  const ancho = Math.max(...filas.map((f) => f.length));
  const norm = (f: string[]) => Array.from({ length: ancho }, (_, i) => f[i] ?? "");
  const encabezados = norm(filas[0]).map((h, i) => h || `Columna ${i + 1}`);
  const cuerpo = filas.slice(1).map(norm);
  if (cuerpo.length === 0) throw new Error("El archivo solo trae los encabezados: no hay filas para importar.");
  if (cuerpo.length > MAX_FILAS) throw new Error(`El archivo trae ${cuerpo.length.toLocaleString("es-MX")} filas; el máximo por importación es ${MAX_FILAS.toLocaleString("es-MX")}. Pártelo en dos.`);
  return { encabezados, filas: cuerpo };
}

export async function leerArchivo(archivo: File): Promise<TablaArchivo> {
  if (archivo.size > MAX_BYTES) throw new Error("El archivo pesa más de 8 MB. Pártelo en archivos más pequeños.");
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    let datos: unknown[][];
    try {
      datos = (await readSheet(archivo)) as unknown[][];
    } catch {
      throw new Error("No pudimos leer ese Excel. Guárdalo como .xlsx (Libro de Excel) o como CSV e inténtalo otra vez.");
    }
    return aTabla(datos.map((f) => f.map(aTexto)));
  }
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt") || nombre.endsWith(".tsv")) {
    return aTabla(parsearCsv(decodificar(await archivo.arrayBuffer())));
  }
  if (nombre.endsWith(".xls")) {
    throw new Error("Ese es un Excel viejo (.xls). Ábrelo en Excel y guárdalo como .xlsx o como CSV.");
  }
  throw new Error("Sube un archivo de Excel (.xlsx) o un CSV.");
}
