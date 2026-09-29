// "¿Cuánto ganaste de verdad?" (~22 s). Un mensaje: la utilidad es lo
// cobrado menos insumos, nómina y gastos del local, contra el mes anterior.
import { TOMAS } from "./tomas.mjs";
import { POS, TITULO, escenaGancho, escenaCierre } from "../_serie/comun.mjs";
import { pantalla } from "../../lib/cortos.mjs";

// Los renglones de la tabla de la app, tal como se leyeron al grabar (marca.texto).
const renglones = (texto) => texto.split("\n").map((l) => l.split("\t").map((x) => x.trim())).filter((f) => f.length > 1 && f[0]);
const fila = (filas, inicio) => filas.find((f) => f[0].replace(/^−\s*/, "").startsWith(inicio));

const guion = {
  titulo: "¿Cuánto ganaste de verdad?",
  traslape: 0.5,
  portada: 10,
  tomas: TOMAS,
  escenas: [
    escenaGancho({
      titulo: "cuánto ganaste",
      pregunta: "¿Cuánto|*ganaste*|este mes?",
      voz: "Vendiste bien este mes. ¿Pero cuánto ganaste de verdad?",
      apuntes: [
        { texto: "Cuentas del mes", clase: "fecha" },
        { texto: "Cobrado: $$$" },
        { texto: "– sueldos ¿?" },
        { texto: "– renta, luz, gas" },
        { texto: "¿Y el champú?", clase: "rojo" },
      ],
      ilustracion: "laptop",
    }),
    {
      id: "e2", titulo: "Monitor: la utilidad del mes", duracion: 8.6, acento: "var(--menta-oscuro)",
      pantalla: "Reportes del mes en curso: «Utilidad del periodo» con ingreso reconocido menos insumos, nómina y gastos del local; el renglón «Utilidad» sale de la pantalla.",
      texto: "«Lo cobrado, menos todo lo demás.»",
      voz: { texto: "PeluDesk le resta a lo que cobraste los insumos, la nómina y los gastos del local.", desde: 0.6, hasta: 7.3 },
      componer: (c) => {
        const M = c.toma("utilidad").marcas;
        const d = 0.2;
        return pantalla(c, {
          disp: { tipo: "monitor", toma: "utilidad", ...POS.monitor },
          desde: d,
          titulo: { texto: "Cobrado, menos|*todo* lo demás.", ...TITULO.monitor },
          zoom: [{ marca: "restas", z: { "16x9": 1.6, "9x16": 2.1 }, t: M.ingreso.t - d - 0.4 }],
          tarjeta: (() => {
            const f = renglones(M.bloque.texto);
            const r = (x, etiqueta) => [etiqueta, fila(f, x)[1]];
            return {
              marca: "bloque", t: M.total.t - d + 0.2, total: true, titulo: "Este mes",
              filas: [r("Ingreso reconocido", "Ingreso reconocido"), r("Insumos", "− Insumos"), r("Nómina", "− Nómina"), r("Gastos del local", "− Gastos del local"), r("Utilidad", "Utilidad")],
              destino: { "16x9": { x: 520, y: 760, w: 760 }, "9x16": { x: 540, y: 480, w: 900 } },
            };
          })(),
        });
      },
    },
    {
      id: "e3", titulo: "Tablet: contra el mes anterior", duracion: 7.8, acento: "var(--morado)",
      pantalla: "Los gastos del local por categoría en la tablet, este periodo contra el anterior y su diferencia; el renglón de la renta sale de la pantalla.",
      texto: "«Contra el mes anterior.»",
      voz: { texto: "Y te lo compara con el mes anterior, gasto por gasto, sin sumar a mano.", desde: 0.5, hasta: 6.6 },
      componer: (c) => {
        const M = c.toma("categorias").marcas;
        const d = 0.3;
        return pantalla(c, {
          disp: { tipo: "tablet", toma: "categorias", ...POS.tablet },
          desde: d,
          titulo: { texto: "Contra el|mes *anterior*.", ...TITULO.tablet },
          zoom: [{ marca: "tabla", z: { "16x9": 1.3, "9x16": 1.6 }, t: M.tabla.t - d - 0.2 }],
          tarjeta: (() => {
            const f = renglones(M.tabla.texto);
            return {
              marca: "tabla", t: M.renta.t - d + 0.2, titulo: "Gastos del local",
              columnas: ["", "Este mes", "Anterior", "Diferencia"],
              filas: ["Renta", "Luz", "Gas", "Publicidad"].map((x) => fila(f, x)),
              destino: { "16x9": { x: 560, y: 780, w: 900 }, "9x16": { x: 540, y: 480, w: 980 } },
            };
          })(),
        });
      },
    },
    escenaCierre({ telefonos: [["celular", "caja"], ["celular", "recepcion"], ["celular", "estetica"]], reversos: [["celular", "hotel"], ["celular", "guarderia"], ["celular", "caja"]] }),
  ],
};

export default guion;
