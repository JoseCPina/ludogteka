import type { ConfigReporte, ContenidoReporte, SeccionPlantilla } from "./tipos";

/**
 * Un reporte inventado a partir de la plantilla del negocio, para la vista
 * previa del editor: marca la primera opción (o dos, si es de varias) de
 * cada sección y rellena los campos de texto con frases de ejemplo.
 */
export function contenidoDeEjemplo(secciones: SeccionPlantilla[], config: Pick<ConfigReporte, "titulo" | "subtitulo"> | null): ContenidoReporte {
  return {
    titulo: config?.titulo ?? "REPORTE DE COMPORTAMIENTO",
    subtitulo: config?.subtitulo ?? "",
    secciones: secciones
      .filter((s) => s.activa)
      .map((s) => {
        const opciones = s.opciones.filter((o) => o.activa);
        const cuantas = s.seleccion === "una" ? 1 : 2;
        return {
          clave: s.clave,
          titulo: s.titulo,
          presentacion: s.presentacion,
          seleccion: s.seleccion,
          columna: s.columna,
          color: s.color,
          icono: s.icono,
          etiqueta_texto: s.etiqueta_texto,
          permite_otro: s.permite_otro,
          opciones: opciones.map((o, i) => ({ clave: o.clave, texto: o.texto, icono: o.icono, marcada: i < cuantas })),
          otro: null,
          texto: s.etiqueta_texto ? "Texto de ejemplo para ver cómo se acomoda en la tarjeta." : null,
        };
      }),
  };
}
