import type { ClaveModulo } from "@/lib/plan/modulos";

/**
 * Un artículo del centro de ayuda de PeluDesk: una TAREA real del día a día
 * («cómo registrar un check-in»), corta y paso a paso, con la voz de la
 * landing. Vive en el repo junto al código: todo cambio que altere cómo se
 * usa una pantalla actualiza su artículo en el mismo cambio (CLAUDE.md).
 *
 * El mismo texto lo leen: el centro de ayuda público (peludesk.mx/ayuda),
 * la sección Ayuda dentro de la app (solo los de los módulos activos del
 * negocio), el «?» de cada pantalla (por `rutas`) y el asistente, que solo
 * contesta con esto y cita el artículo.
 */
export type Articulo = {
  /** En la URL: /ayuda/<slug>. Minúsculas y guiones. No se cambia (hay links). */
  slug: string;
  /** Con verbo, como lo buscaría alguien: «Cómo registrar un check-in». */
  titulo: string;
  /** Una frase: para qué sirve. */
  resumen: string;
  /** Dónde se agrupa en el índice (una clave de NOMBRE_GRUPO). */
  grupo: keyof typeof NOMBRE_GRUPO;
  /**
   * El módulo del que depende (null: todo negocio lo tiene, p. ej. caja y
   * clientes). Con una lista basta con que esté activo cualquiera (lo que
   * sirve a guardería y a hotel).
   */
  modulo: ClaveModulo | ClaveModulo[] | null;
  /** Quién hace esta tarea (admin y/o recepción). */
  roles: ("admin" | "recepcion")[];
  /**
   * Las pantallas de la app que explica (prefijos de ruta). El «?» de una
   * pantalla abre el artículo con el prefijo más largo que coincida.
   * Segmentos dinámicos con [x]: "/reservas/estancias/[id]/checkin".
   */
  rutas: string[];
  /** Palabras con las que alguien lo buscaría y que no están en el título. */
  palabras?: string[];
  /** Captura del demo en public/ayuda/capturas/<archivo> (ver scripts/demo/capturas-ayuda.mjs). */
  captura?: string;
  /**
   * El artículo, en Markdown reducido (src/lib/ayuda/markdown.tsx):
   * párrafos, "## Subtítulo", listas "1. " y "- ", **negritas**,
   * [texto](/ruta) y "> Nota". Nada más.
   */
  cuerpo: string;
};

export const NOMBRE_GRUPO: Record<string, string> = {
  inicio: "El día a día",
  clientes: "Clientes y perros",
  guarderia: "Guardería",
  hotel: "Hotel",
  bonos: "Day pass y mensualidades",
  estetica: "Estética",
  caja: "Caja y cobros",
  contratos: "Contratos",
  portal: "Portal de clientes",
  inventario: "Inventario",
  empleados: "Empleados",
  gastos: "Gastos",
  reportes: "Reportes",
  recoleccion: "Recolección a domicilio",
  pagina_web: "Página web",
  admin: "Administración",
  ayuda: "Ayuda y soporte",
};
