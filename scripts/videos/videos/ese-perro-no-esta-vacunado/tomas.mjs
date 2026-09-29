// Tomas de "Ese perro no está vacunado" (demo Patitas & Co., solo lectura).
// En el demo no se puede apretar «Reservar» (todo es de solo lectura), así
// que el bloqueo se enseña donde la app lo dice antes de reservar: el
// expediente del perro («No se le puede reservar hasta que esto quede»),
// con la misma regla que aplica la base al reservar.
import { TOMA_CELULAR } from "../_serie/comun.mjs";

const interno = (page, sel, texto) => page.locator(sel, { hasText: texto }).filter({ hasNot: page.locator(sel, { hasText: texto }) }).first();

export const TOMAS = {
  // Monitor: el expediente de Simba con la Bordetella vencida.
  expediente: {
    rol: "recepcion", ruta: "/clientes", ancho: 1440, alto: 900, escala: 1.5, puntero: "flecha",
    async antes(page) {
      await page.getByPlaceholder(/Motita/).fill("Simba");
      await page.waitForTimeout(800);
      await page.locator("a", { hasText: "Andrés Cortés" }).last().click();
      await page.waitForURL(/\/clientes\/.+/);
      await page.waitForLoadState("networkidle");
      await page.locator("a[href^='/perros/']").first().click();
      await page.waitForURL(/\/perros\/.+/);
      await page.waitForLoadState("networkidle");
    },
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(1400);
      const vencida = interno(p, "span,div,li", /Bordetella\s*·\s*Vencid/);
      await g.marca("vencida", vencida, { relleno: 3 });
      await g.mover(vencida, { ms: 900 });
      await g.pausa(900);
      await g.marca("panel", interno(p, "div,section", /le falta/), { relleno: 2 });
      const linea = interno(p, "p,div,span", "No se le puede reservar hasta que esto quede");
      await g.marca("no-se-puede", linea, { relleno: 4 });
      await g.mover(linea, { ms: 800 });
      await g.pausa(2600);
    },
  },

  // Tablet: en reportes, cuántos perros tienen vacunas por vencer o vencidas.
  reporte: {
    rol: "admin", ruta: "/reportes", ancho: 1180, alto: 820, escala: 1.5, puntero: "dedo",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(500);
      await g.desplazarA(p.getByRole("heading", { name: "Estado actual" }), { margen: 140, ms: 1500 });
      await g.pausa(300);
      const tarjeta = p.getByText("Cumplimiento sanitario", { exact: true }).locator("xpath=..");
      await g.marca("sanitario", tarjeta, { relleno: 4 });
      await g.clic(tarjeta, { ms: 800, marca: "toque" });
      await g.pausa(2600);
    },
  },

  celular: TOMA_CELULAR,
};
