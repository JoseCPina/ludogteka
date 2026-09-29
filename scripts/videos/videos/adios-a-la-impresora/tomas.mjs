// Tomas de "Adiós a la impresora" (demo Patitas & Co., solo lectura).
import { TOMA_CELULAR } from "../_serie/comun.mjs";

const interno = (page, sel, texto) => page.locator(sel, { hasText: texto }).filter({ hasNot: page.locator(sel, { hasText: texto }) }).first();

export const TOMAS = {
  // Monitor: el tablero avisa qué contratos esperan firma y desde cuándo.
  pendientes: {
    rol: "recepcion", ruta: "/recepcion", ancho: 1440, alto: 900, escala: 1.5, puntero: "flecha",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(1200); // primero llegan el dispositivo y el título
      const aviso = interno(p, "a,div", "esperan la firma del dueño");
      await g.marca("aviso", aviso, { relleno: 4 });
      await g.pausa(700);
      await g.clic(aviso, { navega: true, ms: 900, marca: "clic-aviso" });
      await g.pausa(500);
      await g.marca("espera", interno(p, "span,p,div", /Espera la firma desde hace/), { relleno: 5 });
      const boton = p.getByRole("link", { name: "Recordar por WhatsApp" }).first();
      await g.marca("fila", boton.locator("xpath=ancestor::*[.//*[contains(., 'Espera la firma')]][1]"), { relleno: 2 });
      await g.mover(boton, { ms: 900 });
      await g.marca("whatsapp", boton, { relleno: 6 });
      await g.pausa(2400);
    },
  },

  // Teléfono: en el portal de la dueña, los contratos de Canela ya firmados.
  firmados: {
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
      await g.pausa(700);
      await g.desplazarA(p.getByRole("heading", { name: "Contratos" }), { margen: 90, ms: 1300 });
      await g.pausa(300);
      const tarjeta = p.getByText("Contrato de guardería", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
      await g.marca("guarderia", tarjeta, { relleno: 3 });
      await g.marca("firmado", tarjeta.getByText("Firmado", { exact: true }), { relleno: 5 });
      await g.clic(tarjeta.getByText("Firmado", { exact: true }), { ms: 800, marca: "toque" });
      await g.pausa(2400);
    },
  },

  celular: TOMA_CELULAR,
};
