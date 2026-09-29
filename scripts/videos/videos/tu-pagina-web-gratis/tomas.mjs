// Tomas de "Tu página web, gratis" (demo Patitas & Co., solo lectura).
// El demo ya tiene la página incluida; el perfil y la página son los de
// verdad, armados con lo que el negocio capturó.
import { TOMA_CELULAR } from "../_serie/comun.mjs";

export const TOMAS = {
  // Monitor: el perfil del negocio (descripción, dirección, logo y fotos).
  perfil: {
    rol: "admin", ruta: "/admin/perfil", ancho: 1440, alto: 900, escala: 1.5, puntero: "flecha",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(500);
      await g.marca("direccion", p.getByLabel("Dirección").first().locator(".."), { relleno: 6 });
      await g.mover(p.getByLabel("Dirección").first(), { ms: 900 });
      await g.pausa(500);
      await g.desplazarA(p.getByRole("heading", { name: "Fotos del negocio" }), { margen: 60, ms: 1400 });
      await g.pausa(200);
      await g.marca("fotos", p.getByRole("heading", { name: "Fotos del negocio" }).locator("xpath=ancestor::*[.//img][1]"), { relleno: 2, recorte: false });
      const foto = p.getByRole("heading", { name: "Fotos del negocio" }).locator("xpath=ancestor::*[.//img][1]").locator("img").first();
      await g.mover(foto, { ms: 900 });
      await g.marca("foto", foto, { relleno: 0 });
      await g.pausa(2200);
    },
  },

  // Teléfono: la página del negocio, con sus servicios, precios y fotos.
  pagina: {
    rol: "recepcion", ruta: "/", ancho: 390, alto: 844, escala: 3, puntero: "dedo",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(800);
      await g.desplazarA(p.getByText("Estética", { exact: true }).first(), { margen: 20, ms: 1500 });
      await g.pausa(200);
      await g.marca("bano", p.getByText("Baño estético completo", { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { relleno: 4 });
      await g.pausa(1400);
      await g.desplazar(await p.evaluate(() => window.scrollY + 1400), { ms: 1300 });
      await g.foto("fotos");
      await g.pausa(1200);
    },
  },

  celular: TOMA_CELULAR,
};
