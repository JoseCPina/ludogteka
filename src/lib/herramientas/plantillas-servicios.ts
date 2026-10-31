// Los servicios típicos de cada giro para el generador de lista de precios (/lista-de-precios): la plantilla con la
// que arranca la captura. `canonico` liga el renglón con el catálogo del Índice de precios (para enseñar el rango de
// la ciudad al lado y para precargarlo como tarifa al abrir la prueba). Sin imports.
import type { GiroMercado, Talla } from "@/lib/mercado/catalogo";

export type RenglonPlantilla = { nombre: string; canonico?: string; talla?: Talla; unidad: string };

export const PLANTILLA_SERVICIOS: Record<GiroMercado, RenglonPlantilla[]> = {
  estetica: [
    { nombre: "Baño completo · chico", canonico: "bano", talla: "chico", unidad: "por sesión" },
    { nombre: "Baño completo · mediano", canonico: "bano", talla: "mediano", unidad: "por sesión" },
    { nombre: "Baño completo · grande", canonico: "bano", talla: "grande", unidad: "por sesión" },
    { nombre: "Baño y corte · chico", canonico: "bano_y_corte", talla: "chico", unidad: "por sesión" },
    { nombre: "Baño y corte · mediano", canonico: "bano_y_corte", talla: "mediano", unidad: "por sesión" },
    { nombre: "Baño y corte · grande", canonico: "bano_y_corte", talla: "grande", unidad: "por sesión" },
    { nombre: "Corte de uñas", canonico: "corte_unas", unidad: "por sesión" },
    { nombre: "Limpieza de oídos", unidad: "por sesión" },
    { nombre: "Deslanado", unidad: "por sesión" },
    { nombre: "Baño medicado", unidad: "por sesión" },
  ],
  hotel: [
    { nombre: "Noche · perro chico", canonico: "noche_hotel", talla: "chico", unidad: "por noche" },
    { nombre: "Noche · perro mediano", canonico: "noche_hotel", talla: "mediano", unidad: "por noche" },
    { nombre: "Noche · perro grande", canonico: "noche_hotel", talla: "grande", unidad: "por noche" },
    { nombre: "Segundo perro de la misma familia", unidad: "por noche" },
    { nombre: "Baño de salida", unidad: "por sesión" },
    { nombre: "Recolección a domicilio", unidad: "por viaje" },
  ],
  guarderia: [
    { nombre: "Día completo", canonico: "dia_guarderia", unidad: "por día" },
    { nombre: "Medio día", unidad: "por día" },
    { nombre: "Paquete de 10 días", canonico: "paquete_guarderia", unidad: "por paquete" },
    { nombre: "Mensualidad", unidad: "por mes" },
    { nombre: "Hora extra", unidad: "por hora" },
  ],
  veterinaria: [
    { nombre: "Consulta general", canonico: "consulta", unidad: "por consulta" },
    { nombre: "Vacuna", canonico: "vacuna", unidad: "por dosis" },
    { nombre: "Desparasitación", canonico: "desparasitacion", unidad: "por aplicación" },
    { nombre: "Esterilización · perro", canonico: "esterilizacion", talla: "mediano", unidad: "por cirugía" },
    { nombre: "Esterilización · gato", canonico: "esterilizacion", talla: "chico", unidad: "por cirugía" },
    { nombre: "Limpieza dental", unidad: "por sesión" },
    { nombre: "Consulta a domicilio", unidad: "por visita" },
  ],
};

export type EstiloLista = "clara" | "calida" | "oscura";
export const ESTILOS_LISTA: { clave: EstiloLista; nombre: string; detalle: string }[] = [
  { clave: "clara", nombre: "Clara", detalle: "fondo crema, líneas finas" },
  { clave: "calida", nombre: "Cálida", detalle: "bloques menta y morado" },
  { clave: "oscura", nombre: "Oscura", detalle: "fondo oscuro, precios en menta" },
];

/** Un renglón capturado (lo que se dibuja, se precarga y se manda). */
export type RenglonLista = { nombre: string; precio: number | null; nota?: string; canonico?: string; talla?: Talla; unidad?: string };

/** El texto «$350» o «desde $350»; vacío si no hay precio. */
export const precioEnTexto = (r: RenglonLista) => (r.precio && r.precio > 0 ? `$${Math.round(r.precio).toLocaleString("es-MX")}` : "");
