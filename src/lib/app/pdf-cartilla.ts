import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { RegistroCartilla } from "./cartilla";

/**
 * La cartilla en PDF (carta), para mandársela a cualquier vet: datos de la mascota, vacunas y desparasitaciones con
 * fecha, próxima dosis, lote y de dónde salió cada registro. Helvetica (acentos del español incluidos).
 */
const MARGEN = 48;
const ANCHO = 612;
const ALTO = 792;

const fecha = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "—");
const quitarNoWinAnsi = (t: string) => t.replace(/[^\x00-\xFF]/g, "?");

export async function generarPdfCartilla(o: { mascota: { nombre: string; especie: string; sexo: string | null; razaTexto: string | null; fechaNacimiento: string | null; microchip: string | null }; dueno: string | null; registros: RegistroCartilla[]; generado: string; encontradas?: number }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  let pagina = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - MARGEN;
  const morado = rgb(0.29, 0.25, 0.45);
  const tinta = rgb(0.17, 0.16, 0.2);
  const gris = rgb(0.45, 0.44, 0.5);

  const texto = (t: string, x: number, tam: number, opts: { negrita?: boolean; color?: ReturnType<typeof rgb> } = {}) =>
    pagina.drawText(quitarNoWinAnsi(t), { x, y, size: tam, font: opts.negrita ? negrita : fuente, color: opts.color ?? tinta });
  const salto = (n: number) => {
    y -= n;
    if (y < MARGEN + 40) {
      pagina = pdf.addPage([ANCHO, ALTO]);
      y = ALTO - MARGEN;
    }
  };

  texto("PeluDesk · Cartilla de " + o.mascota.nombre, MARGEN, 20, { negrita: true, color: morado });
  salto(26);
  const especie = o.mascota.especie === "gato" ? "Gato" : o.mascota.especie === "perro" ? "Perro" : "Mascota";
  texto(`${especie}${o.mascota.sexo ? ` · ${o.mascota.sexo === "hembra" ? "hembra" : "macho"}` : ""}${o.mascota.razaTexto ? ` · ${o.mascota.razaTexto}` : ""}${o.mascota.fechaNacimiento ? ` · nació el ${fecha(o.mascota.fechaNacimiento)}` : ""}${o.mascota.microchip ? ` · microchip ${o.mascota.microchip}` : ""}`, MARGEN, 11, { color: gris });
  salto(16);
  if (o.dueno) {
    texto(`Dueño: ${o.dueno}`, MARGEN, 11, { color: gris });
    salto(16);
  }
  salto(10);

  const seccion = (titulo: string, filas: RegistroCartilla[]) => {
    texto(titulo, MARGEN, 14, { negrita: true, color: morado });
    salto(20);
    if (!filas.length) {
      texto("Sin registros.", MARGEN, 11, { color: gris });
      salto(18);
      return;
    }
    const cols = [MARGEN, MARGEN + 190, MARGEN + 270, MARGEN + 350, MARGEN + 430];
    for (const [i, h] of ["Producto", "Aplicada", "Próxima", "Lote", "Fuente"].entries()) texto(h, cols[i], 9, { negrita: true, color: gris });
    salto(14);
    for (const r of filas) {
      const nombre = r.nombre.length > 36 ? r.nombre.slice(0, 35) + "…" : r.nombre;
      texto(nombre + (r.subtipo ? ` (${r.subtipo})` : ""), cols[0], 10);
      texto(fecha(r.fechaAplicacion), cols[1], 10);
      texto(fecha(r.proximaDosis), cols[2], 10, { color: r.estado === "vencida" ? rgb(0.7, 0.24, 0.19) : tinta });
      texto((r.lote ?? "—").slice(0, 14), cols[3], 10);
      texto({ foto: "foto de la cartilla", manual: "capturado por el dueño", negocio: "negocio en PeluDesk", qr: "registrado por QR" }[r.fuente], cols[4], 9, { color: gris });
      salto(15);
      if (r.laboratorio || r.notas) {
        texto(`${r.laboratorio ? `Lab. ${r.laboratorio}` : ""}${r.laboratorio && r.notas ? " · " : ""}${r.notas ?? ""}`.slice(0, 110), cols[0] + 10, 8, { color: gris });
        salto(12);
      }
    }
    salto(10);
  };
  seccion("Vacunas", o.registros.filter((r) => r.tipo === "vacuna"));
  seccion("Desparasitaciones", o.registros.filter((r) => r.tipo === "desparasitacion"));
  salto(6);
  texto(`Generado el ${o.generado} desde la app PeluDesk (app.peludesk.mx). Lo capturado por el dueño o leído de su cartilla de papel no sustituye el carnet firmado por su médico veterinario.`, MARGEN, 8, { color: gris });
  return pdf.save();
}
