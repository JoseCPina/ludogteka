// Tomas de "Cada raza, su precio" (demo Patitas & Co., solo lectura).
import { TOMA_CELULAR } from "../_serie/comun.mjs";

export const TOMAS = {
  // Monitor: las tarifas del baño completo, por grupo de raza y con precio
  // aparte si el perro llega con el pelo maltratado.
  tarifas: {
    rol: "admin", ruta: "/servicios", ancho: 1440, alto: 900, escala: 1.5, puntero: "flecha",
    async antes(page) {
      const href = await page.getByRole("link", { name: "Baño estético completo" }).first().getAttribute("href");
      await page.goto(new URL(href + "/tarifas", page.url()).href, { waitUntil: "networkidle" });
    },
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(400);
      await g.desplazarA(p.getByText("Poodle, maltés y similares", { exact: true }).first(), { margen: 170, ms: 1100 });
      await g.pausa(200);
      const fila = (texto) => p.getByText(texto, { exact: true }).first().locator("xpath=ancestor::*[.//input][1]");
      await g.marca("poodle", fila("Poodle, maltés y similares"), { relleno: 4 });
      await g.marca("pomerania", fila("Pomerania"), { relleno: 4 });
      await g.marca("grupos", p.getByText("Poodle, maltés y similares", { exact: true }).first().locator("xpath=ancestor::*[count(.//input) > 6][1]"), { recorte: false });
      const precio = fila("Poodle, maltés y similares").locator("input").first();
      await g.mover(precio, { ms: 900 });
      await g.marca("precio", precio, { relleno: 4 });
      await g.pausa(700);
      const maltratado = fila("Poodle, maltés y similares").locator("input").nth(1);
      await g.mover(maltratado, { ms: 700 });
      await g.marca("maltratado", maltratado.locator(".."), { relleno: 4 });
      await g.pausa(2000);
    },
  },

  // Tablet: la agenda de estética de hoy, una columna por estilista.
  agenda: {
    rol: "recepcion", ruta: "/estetica", ancho: 1180, alto: 820, escala: 1.5, puntero: "dedo",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      const columnas = p.locator("section").filter({ has: p.locator("h2") });
      await g.marca("columna-1", columnas.nth(0), { relleno: 4, recorte: false });
      await g.marca("columna-2", columnas.nth(1), { relleno: 4, recorte: false });
      await g.pausa(900);
      const cita = columnas.nth(0).locator("a").first();
      await g.mover(cita, { ms: 900 });
      await g.marca("cita", cita, { relleno: 4 });
      await g.pausa(2800);
    },
  },

  celular: TOMA_CELULAR,
};
