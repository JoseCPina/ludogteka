// Título, descripción (con capítulos), etiquetas y texto del paquete de YouTube.
import { AREAS } from "../catalogo.mjs";
import { mmss } from "./render.mjs";

const SITIO = "https://peludesk.mx";

/** Capítulos: 0:00 obligatorio, al menos 3, cada uno de 10 s o más. */
export function capitulos(secciones, guion) {
  const lista = [{ ini: 0, titulo: "Introducción" }];
  for (const [i, e] of guion.escenas.entries()) {
    const s = secciones.find((x) => x.id === `e${i + 1}`);
    lista.push({ ini: s.ini, titulo: e.titulo });
  }
  const res = secciones.find((x) => x.id === "resumen");
  lista.push({ ini: res.ini, titulo: "Resumen" });
  const fin = secciones.find((x) => x.id === "cierre").ini;
  // Une los de menos de 10 s con el anterior.
  const salida = [];
  for (const [i, c] of lista.entries()) {
    const siguiente = lista[i + 1]?.ini ?? fin;
    if (siguiente - c.ini < 10 && salida.length) continue;
    salida.push(c);
  }
  return salida;
}

export function textoYoutube({ video, guion, secciones, articulos }) {
  const area = AREAS.find((a) => a.clave === video.area)?.nombre ?? "";
  const cap = capitulos(secciones, guion);
  const lineas = [
    video.resumen,
    "",
    "Capítulos",
    ...cap.map((c) => `${mmss(c.ini)} ${c.titulo}`),
    "",
    ...(articulos.length ? ["Si prefieres leerlo:", ...articulos.map((a) => `${a.titulo}: ${SITIO}/ayuda/${a.slug}`), ""] : []),
    `Todos los videos de la serie: ${SITIO}/ayuda/videos`,
    `Pruébalo 15 días gratis, sin tarjeta: ${SITIO}/registro`,
    "",
    `PeluDesk es el software para guarderías, hoteles y estéticas caninas, hecho en México. Este video es parte de la serie «${area}».`,
    "",
    ["#PeluDesk", ...video.etiquetas.slice(0, 2).map((e) => "#" + e.replace(/[^a-záéíóúñ0-9]+/gi, ""))].join(" "),
  ];
  const etiquetas = ["peludesk", ...video.etiquetas, "software para guarderías caninas", "software para estéticas caninas", area.toLowerCase(), "tutorial"].filter((v, i, a) => v && a.indexOf(v) === i);
  return { titulo: video.titulo, descripcion: lineas.join("\n"), etiquetas, capitulos: cap };
}

export function archivoYoutubeTxt({ titulo, descripcion, etiquetas }) {
  return `TÍTULO\n${titulo}\n\nDESCRIPCIÓN\n${descripcion}\n\nETIQUETAS\n${etiquetas.join(", ")}\n\nIDIOMA: es-MX · VISIBILIDAD: público · CATEGORÍA: Ciencia y tecnología · NO es contenido para niños\n`;
}
