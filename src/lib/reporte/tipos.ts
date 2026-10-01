/** Una opción tal como quedó guardada en el reporte (clave, texto e ícono vigentes al guardar). */
export type OpcionReporte = {
  clave: string;
  texto: string;
  icono: string | null;
  marcada: boolean;
};

export type PresentacionSeccion = "caras" | "iconos" | "lista" | "resumen" | "texto";
export type ColorSeccion = "primario" | "secundario" | "acento";
export type ColumnaSeccion = "izq" | "der" | "completo";

export type SeccionReporte = {
  clave: string;
  titulo: string;
  presentacion: PresentacionSeccion;
  seleccion: "una" | "varias";
  columna: ColumnaSeccion;
  color: ColorSeccion;
  icono: string | null;
  etiqueta_texto: string | null;
  permite_otro: boolean;
  opciones: OpcionReporte[];
  otro: string | null;
  texto: string | null;
};

/** `reportes_guarderia.contenido`: el snapshot completo con las marcas. */
export type ContenidoReporte = {
  titulo: string;
  subtitulo: string;
  secciones: SeccionReporte[];
};

export type EstadoReporte = "borrador" | "listo" | "enviado";

/** Lo que el formulario manda a `reporte_guardar` (por clave de sección). */
export type RespuestasReporte = Record<string, { opciones: string[]; otro?: string | null; texto?: string | null }>;

// ── La plantilla del negocio (tablas reporte_*) ──

export type OpcionPlantilla = {
  id: string;
  seccion_id: string;
  clave: string;
  texto: string;
  icono: string | null;
  orden: number;
  activa: boolean;
  en_buen_dia: boolean;
};

export type SeccionPlantilla = {
  id: string;
  clave: string;
  titulo: string;
  presentacion: PresentacionSeccion;
  seleccion: "una" | "varias";
  permite_otro: boolean;
  etiqueta_texto: string | null;
  columna: ColumnaSeccion;
  color: ColorSeccion;
  icono: string | null;
  orden: number;
  activa: boolean;
  opciones: OpcionPlantilla[];
};

export type ConfigReporte = {
  id: string;
  titulo: string;
  subtitulo: string;
  color_primario: string | null;
  color_secundario: string | null;
  color_acento: string | null;
  retencion_dias: number;
};

export type ColoresTarjeta = { primario: string; secundario: string; acento: string };

/** Las respuestas vacías de una plantilla (una entrada por sección activa). */
export function respuestasVacias(secciones: { clave: string }[]): RespuestasReporte {
  return Object.fromEntries(secciones.map((s) => [s.clave, { opciones: [], otro: null, texto: null }]));
}

/** De un snapshot guardado a las respuestas que el formulario edita. */
export function respuestasDeContenido(contenido: ContenidoReporte): RespuestasReporte {
  return Object.fromEntries(
    contenido.secciones.map((s) => [
      s.clave,
      { opciones: s.opciones.filter((o) => o.marcada).map((o) => o.clave), otro: s.otro, texto: s.texto },
    ])
  );
}

export const ETIQUETA_ESTADO: Record<EstadoReporte | "sin_reporte", string> = {
  sin_reporte: "Sin reporte",
  borrador: "Borrador",
  listo: "Listo",
  enviado: "Enviado",
};
