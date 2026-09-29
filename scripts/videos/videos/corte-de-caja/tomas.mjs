// Tomas de "Tu corte de caja, sin sorpresas" (demo Patitas & Co., solo lectura).
import { TOMA_CELULAR } from "../_serie/comun.mjs";

const interno = (page, sel, texto) => page.locator(sel, { hasText: texto }).filter({ hasNot: page.locator(sel, { hasText: texto }) }).first();

export const TOMAS = {
  // Monitor: la cuenta de Oreo se cobra con terminal y la propina va aparte.
  cobro: {
    rol: "recepcion", ruta: "/caja", ancho: 1440, alto: 900, escala: 1.5, puntero: "flecha",
    async antes(page) {
      await page.locator("a[href^='/caja/cobrar/']").first().click();
      await page.waitForURL(/\/caja\/cobrar\//);
      await page.waitForLoadState("networkidle");
    },
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.marca("saldo", interno(p, "p,div,span", /^Saldo:/), { relleno: 8 });
      await g.pausa(500);
      await g.clic(p.getByRole("button", { name: "Cobrar con terminal" }), { ms: 800, marca: "clic-terminal" });
      await g.pausa(500);
      await g.marca("terminal", p.locator("[data-cobro-integrado]").first(), { relleno: 2 });
      await g.pausa(500);
      await g.desplazarA(p.getByText("Registrar cobro", { exact: true }).first(), { margen: 160, ms: 900 });
      const propina = p.getByLabel("Propina").first();
      await g.clic(propina, { ms: 600 });
      await p.keyboard.press("Control+A");
      await p.keyboard.type("50", { delay: 120 });
      await g.pausa(300);
      // El cursor se aparta antes del recorte (si no, sale congelado dentro).
      await g.mover(p.getByText("+ Repartir en otro método").first(), { ms: 500, dx: 260 });
      await g.marca("propina", propina.locator("xpath=ancestor::*[.//text()[normalize-space()='Propina']][1]"), { relleno: 6 }); // con su etiqueta
      await g.marca("total", interno(p, "p,div,span", /^Total de este cobro:/), { relleno: 8 });
      await g.pausa(1800);
    },
  },

  // Tablet: el turno de caja, el arqueo y los cortes que cuadraron.
  turno: {
    rol: "recepcion", ruta: "/caja/turno", ancho: 1180, alto: 820, escala: 1.5, puntero: "dedo",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(400);
      await g.clic(p.getByRole("button", { name: "Cerrar turno" }), { ms: 800, marca: "clic-cerrar" });
      await g.pausa(900);
      await g.marca("arqueo", interno(p, "section,form,div", "Cerrar turno — arqueo"), { relleno: 2 });
      await g.pausa(900);
      await g.desplazarA(p.getByRole("heading", { name: "Tus turnos cerrados" }), { margen: 30, ms: 1100 });
      await g.pausa(300);
      // El primer turno cerrado: la tarjeta (con su tabla) que trae el primer «Cuadró».
      const cuadro = p.getByText("Cuadró", { exact: true }).first();
      await g.marca("turno", cuadro.locator("xpath=ancestor::*[.//table][1]"), { relleno: 2 });
      await g.marca("cuadro", cuadro, { relleno: 6 });
      await g.mover(cuadro, { ms: 800 });
      await g.pausa(2200);
    },
  },

  celular: TOMA_CELULAR,
};
