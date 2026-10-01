import type { ColumnaSeccion, ColorSeccion, PresentacionSeccion } from "@/lib/reporte/tipos";

export type OpcionEditable = {
  id: string | null;
  texto: string;
  icono: string | null;
  activa: boolean;
  en_buen_dia: boolean;
};

export type SeccionEditable = {
  id: string;
  titulo: string;
  presentacion: PresentacionSeccion;
  seleccion: "una" | "varias";
  permite_otro: boolean;
  etiqueta_texto: string | null;
  columna: ColumnaSeccion;
  color: ColorSeccion;
  icono: string | null;
  activa: boolean;
  opciones: OpcionEditable[];
};

export type SeccionNueva = Omit<SeccionEditable, "id" | "opciones" | "activa" | "icono">;

export type ConfigEditable = {
  titulo: string;
  subtitulo: string;
  color_primario: string | null;
  color_secundario: string | null;
  color_acento: string | null;
  retencion_dias: number;
};

export type ResultadoEditor = { error: string | null; ok?: boolean };

export const PRESENTACIONES: { valor: PresentacionSeccion; etiqueta: string }[] = [
  { valor: "caras", etiqueta: "Caras o íconos grandes en una fila" },
  { valor: "iconos", etiqueta: "Íconos en cuadrícula" },
  { valor: "lista", etiqueta: "Lista con círculos" },
  { valor: "resumen", etiqueta: "Casillas grandes (resumen)" },
  { valor: "texto", etiqueta: "Solo un campo de texto" },
];

export const COLUMNAS: { valor: ColumnaSeccion; etiqueta: string }[] = [
  { valor: "izq", etiqueta: "Columna izquierda" },
  { valor: "der", etiqueta: "Columna derecha" },
  { valor: "completo", etiqueta: "Todo el ancho (abajo)" },
];

export const COLORES: { valor: ColorSeccion; etiqueta: string }[] = [
  { valor: "primario", etiqueta: "Color principal" },
  { valor: "secundario", etiqueta: "Color secundario" },
  { valor: "acento", etiqueta: "Color de acento" },
];
