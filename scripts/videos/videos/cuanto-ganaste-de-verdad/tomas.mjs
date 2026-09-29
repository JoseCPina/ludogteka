// Tomas de "¿Cuánto ganaste de verdad?" (demo Patitas & Co., solo lectura).
// El demo tiene historia desde agosto: «Mes en curso» compara septiembre
// contra agosto (agosto completo se compararía contra un julio vacío).
import { TOMA_CELULAR } from "../_serie/comun.mjs";

const mesEnCurso = async (page) => {
  await page.getByRole("link", { name: "Mes en curso" }).first().click();
  await page.waitForURL(/desde=/);
  await page.waitForLoadState("networkidle");
};
const utilidad = (p) => p.getByText("Utilidad del periodo", { exact: true }).first().locator("xpath=ancestor::*[.//table][1]");

export const TOMAS = {
  // Monitor: la utilidad del mes, cobrado menos insumos, nómina y gastos.
  utilidad: {
    rol: "admin", ruta: "/reportes", ancho: 1440, alto: 900, escala: 1.5, puntero: "flecha",
    async antes(page) { await mesEnCurso(page); },
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(500);
      await g.marca("bloque", utilidad(p), { relleno: 2, recorte: false });
      const fila = (texto) => p.locator("tr", { has: p.getByText(texto, { exact: true }) }).first();
      await g.mover(fila("Ingreso reconocido"), { ms: 800, dx: 120 });
      await g.marca("ingreso", fila("Ingreso reconocido"), { relleno: 4 });
      await g.pausa(400);
      await g.mover(p.locator("tr", { hasText: "Gastos del local" }).first(), { ms: 900, dx: 120 });
      await g.marca("restas", p.locator("tr", { hasText: "Insumos consumidos" }).first(), { relleno: 4 });
      await g.pausa(400);
      const total = p.locator("tr", { has: p.getByText("Utilidad", { exact: true }) }).first();
      await g.mover({ x: 1400, y: 820 }, { ms: 500 }); // el cursor, fuera del recorte
      await g.marca("total", total, { relleno: 6 });
      await g.mover(total, { ms: 800, dx: 120 });
      await g.pausa(2200);
    },
  },

  // Tablet: los gastos del local por categoría, contra el mes anterior.
  categorias: {
    rol: "admin", ruta: "/reportes", ancho: 1180, alto: 820, escala: 1.5, puntero: "dedo",
    async antes(page) { await mesEnCurso(page); },
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      await g.pausa(400);
      await g.desplazarA(p.getByText("Gastos del local, por categoría").first(), { margen: 30, ms: 1300 });
      await g.pausa(300);
      await g.marca("tabla", p.getByText("Gastos del local, por categoría").first().locator("xpath=following-sibling::*[1]"), { relleno: 4, recorte: false });
      const renta = p.locator("tr", { has: p.getByText("Renta", { exact: true }) }).first();
      await g.mover({ x: 1140, y: 780 }, { ms: 400 }); // el dedo, fuera del recorte
      await g.marca("renta", renta, { relleno: 6 });
      await g.clic(renta, { ms: 800, marca: "toque" });
      await g.pausa(2400);
    },
  },

  celular: TOMA_CELULAR,
};
