// Tomas de "Tu cliente ve todo desde su celular" (demo Patitas & Co.,
// cuenta de Fernanda, dueña de Canela y Pimienta; solo lectura).
import { TOMA_CELULAR } from "../_serie/comun.mjs";

export const TOMAS = {
  // Teléfono: el portal, sus próximas citas y su historial.
  portal: {
    rol: "cliente", ruta: "/portal", ancho: 390, alto: 844, escala: 3, puntero: "dedo",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(700);
      await g.desplazarA(p.getByRole("heading", { name: "Próximas" }), { margen: 20, ms: 1200 });
      await g.pausa(300);
      await g.marca("proximas", p.getByRole("heading", { name: "Próximas" }).locator("xpath=following-sibling::*[1]"), { relleno: 2 });
      await g.pausa(1300);
      await g.desplazarA(p.getByRole("heading", { name: "Historial" }), { margen: 20, ms: 1200 });
      await g.marca("historial", p.getByRole("heading", { name: "Historial" }).locator("xpath=following-sibling::*[1]"), { relleno: 2, recorte: false });
      await g.pausa(1500);
    },
  },

  // Teléfono: la ficha de Canela, con sus vacunas y sus contratos.
  perro: {
    rol: "cliente", ruta: "/portal", ancho: 390, alto: 844, escala: 3, puntero: "dedo",
    async antes(page) {
      await page.locator("a[href^='/portal/perros/']").first().click();
      await page.waitForURL(/\/portal\/perros\//);
      await page.waitForLoadState("networkidle");
    },
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(600);
      await g.desplazarA(p.getByRole("heading", { name: "Estado de salud" }), { margen: 60, ms: 1200 });
      await g.pausa(200);
      await g.marca("salud", p.getByRole("heading", { name: "Estado de salud" }).locator("xpath=following-sibling::*[1]"), { relleno: 6 });
      await g.pausa(1400);
      await g.desplazarA(p.getByRole("heading", { name: "Contratos" }), { margen: 60, ms: 1100 });
      await g.marca("contratos", p.getByRole("heading", { name: "Contratos" }).locator("xpath=following-sibling::*[1]"), { relleno: 4, recorte: false });
      await g.pausa(1500);
    },
  },

  celular: TOMA_CELULAR,
};
