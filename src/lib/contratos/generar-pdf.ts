import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

const ANCHO_PAGINA = 595.28; // A4 en puntos
const ALTO_PAGINA = 841.89;
const MARGEN = 50;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;
const TAMANO_TEXTO = 11;

export type FirmaContrato = {
  pngBytes: Uint8Array;
  firmanteNombre: string;
  fechaHoraTexto: string;
  ip: string;
};

export type OpcionesPdfContrato = {
  titulo: string;
  cuerpo: string;
  firma?: FirmaContrato;
};

// Generador propio, sin depender de un motor de HTML — pdf-lib es puro
// JS (sin binarios nativos), corre bien en un entorno serverless. El
// layout es deliberadamente simple (texto con salto de línea manual, sin
// Markdown real): la plantilla es texto plano con dobles saltos de línea
// como separador de párrafo, suficiente para un contrato de servicio, no
// para maquetación rica.
export async function generarPdfContrato(opciones: OpcionesPdfContrato): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fuente = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let pagina = pdfDoc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  let y = ALTO_PAGINA - MARGEN;

  function nuevaPagina() {
    pagina = pdfDoc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
    y = ALTO_PAGINA - MARGEN;
  }

  function escribirLinea(texto: string, opts: { negrita?: boolean; tamano?: number } = {}) {
    const tamano = opts.tamano ?? TAMANO_TEXTO;
    const f: PDFFont = opts.negrita ? fuenteNegrita : fuente;
    if (y < MARGEN + tamano * 1.4) nuevaPagina();
    pagina.drawText(texto, { x: MARGEN, y, size: tamano, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= tamano * 1.4;
  }

  function escribirParrafo(texto: string, opts: { tamano?: number } = {}) {
    const tamano = opts.tamano ?? TAMANO_TEXTO;
    if (texto.trim() === "") {
      y -= tamano * 0.7;
      return;
    }
    const palabras = texto.split(/\s+/);
    let linea = "";
    for (const palabra of palabras) {
      const pruebaLinea = linea ? `${linea} ${palabra}` : palabra;
      const ancho = fuente.widthOfTextAtSize(pruebaLinea, tamano);
      if (ancho > ANCHO_UTIL && linea) {
        escribirLinea(linea, { tamano });
        linea = palabra;
      } else {
        linea = pruebaLinea;
      }
    }
    if (linea) escribirLinea(linea, { tamano });
  }

  escribirLinea(opciones.titulo, { negrita: true, tamano: 16 });
  y -= TAMANO_TEXTO * 0.6;

  const parrafos = opciones.cuerpo.split(/\n{2,}/);
  for (const parrafo of parrafos) {
    for (const sublinea of parrafo.split(/\n/)) {
      escribirParrafo(sublinea);
    }
    y -= TAMANO_TEXTO * 0.5;
  }

  if (opciones.firma) {
    y -= TAMANO_TEXTO;
    const imagenFirma = await pdfDoc.embedPng(opciones.firma.pngBytes);
    const anchoFirma = 200;
    const altoFirma = (imagenFirma.height / imagenFirma.width) * anchoFirma;

    if (y < MARGEN + altoFirma + 70) nuevaPagina();

    escribirLinea("Firma:", { negrita: true });
    y -= altoFirma;
    pagina.drawImage(imagenFirma, { x: MARGEN, y, width: anchoFirma, height: altoFirma });
    y -= 14;

    escribirLinea(
      `Firmado electrónicamente por ${opciones.firma.firmanteNombre}.`,
      { tamano: 9 }
    );
    escribirLinea(
      `${opciones.firma.fechaHoraTexto} (hora de San Luis Potosí) · IP: ${opciones.firma.ip}`,
      { tamano: 9 }
    );
    escribirLinea(
      "Este documento queda sellado con la fecha, hora e IP de la firma. Su integridad puede verificarse comparando el hash almacenado contra el archivo.",
      { tamano: 8 }
    );
  }

  return pdfDoc.save();
}

export function resolverTokens(texto: string, campos: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (coincidencia, clave: string) =>
    Object.prototype.hasOwnProperty.call(campos, clave) ? campos[clave] : coincidencia
  );
}
