// Las tomas de "Un día en tu guardería": lo que se hace en la app, frente a
// la cámara, en el negocio de demostración (Patitas & Co.). Todo por las
// pantallas de verdad, con las cuentas de "Ver demo" (solo lectura).
//
// Cada toma deja marcas (lib/grabar.mjs): el compositor hace zoom a su
// posición exacta y las saca de la pantalla. Los tiempos de las escenas se
// sincronizan con las marcas, no con segundos escritos a mano: si la app
// tarda más o menos en cargar, la edición la sigue.

// El primer elemento que contiene el texto sin que lo contenga uno de sus
// hijos (los contenedores también "contienen" el texto).
const interno = (page, sel, texto) => page.locator(sel, { hasText: texto }).filter({ hasNot: page.locator(sel, { hasText: texto }) }).first();

export const TOMAS = {
  // Monitor: la agenda de estética en semana, una columna por estilista.
  estetica: {
    rol: "recepcion", ruta: "/estetica?vista=semana", ancho: 1440, alto: 900, escala: 1.5, puntero: "flecha",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      const columnas = p.locator("section").filter({ has: p.locator("h2") });
      const c1 = columnas.nth(0), c2 = columnas.nth(1);
      await g.marca("columna-1", c1, { relleno: 4 });
      await g.marca("columna-2", c2, { relleno: 4 });
      await g.marca("columna-3", columnas.nth(2), { relleno: 4 });
      await g.pausa(1100);
      await g.mover(c1.locator("a").nth(5), { ms: 900 });
      await g.pausa(900);
      await g.mover(c2.locator("a").nth(0), { ms: 900 });
      await g.marca("cita", c2.locator("a").nth(0), { relleno: 3 });
      await g.pausa(800);
      await g.clic(c2.locator("a").nth(0), { navega: true, marca: "clic-cita", ms: 400 });
      await g.pausa(300);
      await g.marca("detalle", p.locator("h1").first(), { recorte: false });
      await g.pausa(2200);
    },
  },

  // Tablet: el tablero de hotel y la ocupación de toda la casa.
  hotel: {
    rol: "recepcion", ruta: "/hotel", ancho: 1180, alto: 820, escala: 1.5, puntero: "dedo",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.marca("tablero", p.locator("section,div").filter({ has: p.getByRole("heading", { name: /Llegan hoy/i }) }).last().locator(".."), { recorte: false });
      await g.pausa(1400);
      await g.desplazarA(p.getByRole("heading", { name: "Ocupación de la casa" }), { margen: 40, ms: 1300 });
      await g.pausa(350);
      const fila = p.locator("table tbody tr").first();
      await g.marca("tabla", p.locator("table").first(), { relleno: 2 });
      await g.marca("hoy", fila, { relleno: 2 });
      await g.marca("hoy-diurno", fila.locator("td").nth(1), { relleno: 4 });
      await g.marca("hoy-nocturno", fila.locator("td").nth(2), { relleno: 4 });
      await g.clic(fila.locator("td").nth(1), { ms: 800, marca: "toque" });
      await g.pausa(3200);
    },
  },

  // Teléfono: buscar a Simba y ver que se le venció la vacuna.
  vacuna: {
    rol: "recepcion", ruta: "/clientes", ancho: 390, alto: 844, escala: 3, puntero: "dedo",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(500);
      await g.escribir(p.getByPlaceholder(/Motita/), "Simba", { retraso: 120 });
      await g.pausa(700);
      await g.clic(interno(p, "a", "Andrés Cortés"), { navega: true, ms: 650, marca: "clic-cliente" });
      await g.pausa(500);
      await g.clic(p.locator("a[href^='/perros/']").first(), { navega: true, ms: 650, marca: "clic-perro" });
      await g.pausa(400);
      await g.marca("vencida", interno(p, "span,div,li", /Bordetella\s*·\s*Vencida/), { relleno: 3 });
      await g.marca("pendiente", interno(p, "div,section", /le falta/), { relleno: 2 });
      await g.marca("no-se-puede", interno(p, "p,div,span", "No se le puede reservar hasta que esto quede"), { relleno: 4 });
      await g.pausa(2600);
      await g.foto("simba");
    },
  },

  // Monitor: la caja, cobrar una cuenta con la terminal.
  caja: {
    rol: "recepcion", ruta: "/caja", ancho: 1440, alto: 900, escala: 1.5, puntero: "flecha",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(700);
      const cuenta = p.locator("a[href^='/caja/cobrar/']").first();
      await g.marca("cuenta", cuenta, { relleno: 2 });
      await g.clic(cuenta, { navega: true, ms: 900, marca: "clic-cuenta" });
      await g.pausa(500);
      await g.marca("saldo", interno(p, "p,div,span", /^Saldo:/), { relleno: 8 });
      await g.marca("total", interno(p, "p,div,span", /^Total cuenta:/), { relleno: 8 });
      const integrado = p.locator("[data-cobro-integrado]").first();
      await g.desplazarA(integrado, { margen: 120, ms: 900 });
      await g.pausa(200);
      await g.clic(p.getByRole("button", { name: "Cobrar con terminal" }), { ms: 800, marca: "clic-terminal" });
      await g.pausa(500);
      await g.marca("terminal", integrado, { relleno: 2 });
      await g.mover(p.getByRole("button", { name: "Mandar a la terminal" }), { ms: 800 });
      await g.pausa(1800);
    },
  },

  // Teléfono: el portal del dueño (Fernanda, dueña de Canela y Pimienta).
  portal: {
    rol: "cliente", ruta: "/portal", ancho: 390, alto: 844, escala: 3, puntero: "dedo",
    async pasos(g) {
      const p = g.page;
      await g.foto("inicio");
      await g.pausa(900);
      await g.desplazarA(p.getByRole("heading", { name: "Próximas" }), { margen: 20, ms: 1100 });
      await g.pausa(300);
      await g.marca("proximas", p.getByRole("heading", { name: "Próximas" }).locator("xpath=following-sibling::*[1]"), { relleno: 2 });
      await g.pausa(1400);
      await g.desplazarA(p.getByRole("heading", { name: "Tus perros" }), { margen: 20, ms: 1200 });
      await g.foto("perros");
      await g.pausa(1200);
    },
  },

  // Pantallas fijas de teléfono para el cierre (los tres teléfonos que giran).
  celular: {
    rol: "recepcion", ruta: "/guarderia", ancho: 390, alto: 844, escala: 3, puntero: "dedo",
    async pasos(g) {
      await g.foto("guarderia");
      await g.ir("/estetica?vista=semana");
      await g.foto("estetica");
      await g.ir("/caja");
      await g.foto("caja");
      await g.ir("/hotel");
      await g.foto("hotel");
    },
  },
};
