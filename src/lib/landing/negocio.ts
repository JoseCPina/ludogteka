// Datos públicos del negocio para la landing (ludogteka.mx). Es texto de
// escaparate, no la fuente de verdad de los precios: la app cobra con la
// matriz de `tarifas`. Si el negocio cambia un precio en la app, hay que
// cambiarlo aquí también (y viceversa) — la landing es pública y sin
// sesión, así que no lee la base.

export const URL_PUBLICA = "https://www.ludogteka.mx";

export const TELEFONO_VISIBLE = "444 234 1355";
const TELEFONO_WA = "524442341355"; // wa.me: país + 10 dígitos, sin "+" ni "1"

export function linkWhatsApp(mensaje: string) {
  return `https://wa.me/${TELEFONO_WA}?text=${encodeURIComponent(mensaje)}`;
}

// Un mensaje ya escrito por intención: quien recibe el WhatsApp en el
// mostrador sabe de entrada qué le están pidiendo.
export const MENSAJES = {
  general: "Hola, Ludogteka. Quiero información sobre sus servicios para mi perro.",
  guarderia: "Hola, Ludogteka. Quiero reservar guardería para mi perro.",
  hotel: "Hola, Ludogteka. Quiero apartar hotel para mi perro. Las fechas son:",
  estetica: "Hola, Ludogteka. Quiero agendar estética para mi perro. Su raza es:",
  recoleccion: "Hola, Ludogteka. Quiero cotizar recolección a domicilio. Mi colonia y el día que la necesito:",
  requisitos: "Hola, Ludogteka. Quiero agendar la evaluación de comportamiento de mi perro.",
} as const;

export const DIRECCION = {
  calle: "Calz. de Guadalupe 1050",
  colonia: "Tepeyac",
  cp: "78384",
  ciudad: "San Luis Potosí",
  estado: "S.L.P.",
};

export const DIRECCION_UNA_LINEA = `${DIRECCION.calle}, ${DIRECCION.colonia}, ${DIRECCION.cp} ${DIRECCION.ciudad}, ${DIRECCION.estado}`;

const DESTINO = encodeURIComponent(DIRECCION_UNA_LINEA);
export const MAPA_EMBED = `https://maps.google.com/maps?q=${DESTINO}&z=16&output=embed`;
export const COMO_LLEGAR_GOOGLE = `https://www.google.com/maps/dir/?api=1&destination=${DESTINO}`;
export const COMO_LLEGAR_WAZE = `https://waze.com/ul?q=${DESTINO}&navigate=yes`;

// Mismo horario que horario_semana en la app (guardería abre en todo el
// horario del negocio). Domingo cerrado.
export const HORARIO = [
  { dias: "Lunes a viernes", horas: "9:00 a 19:00", abre: "09:00", cierra: "19:00", schema: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  { dias: "Sábado", horas: "10:00 a 14:00", abre: "10:00", cierra: "14:00", schema: ["Saturday"] },
];

export const PRECIO_KM_RECOLECCION = 12;
export const RECOLECCION_REGLAS = [
  "De lunes a viernes.",
  "Se agenda con 24 horas de anticipación.",
  "Para estética, la recolección es solo los martes.",
];

// Zonas de cobertura de la recolección. Vacío = todavía no definidas: la
// sección invita a preguntar por WhatsApp. En cuanto el negocio las
// defina, se capturan aquí y la sección las muestra sola.
export const ZONAS_COBERTURA: { nombre: string; nota?: string }[] = [];

export const GUARDERIA = {
  ocasionalHora: 35,
  diaCompleto: 350,
  mensualidad: 1950,
  pases: [
    { pases: 10, precio: 1150, vigenciaDias: 20 },
    { pases: 15, precio: 1380, vigenciaDias: 30 },
    { pases: 20, precio: 1610, vigenciaDias: 40 },
  ],
};

export const HOTEL = [
  { talla: "Chica y mediana", precio: 270 },
  { talla: "Grande y extra grande", precio: 300 },
];

// Mismas listas que `servicios.incluye` / `no_incluye` de los tres baños
// (migraciones 20260910190118 y 20260923152350): la diferencia entre $190
// y $390 es lo que incluyen.
export const ESTETICA_INCLUYE = [
  "Baño",
  "Cepillado, deslanado o corte de pelo",
  "Corte de uñas",
  "Limpieza de orejas y dientes",
  "Corte higiénico",
  "Hidratación de nariz y huellitas",
];
export const ESTETICA_RAPADO_DIFERENCIA = "Igual que el estético, con corte rapado.";
export const ESTETICA_EXPRES_INCLUYE = "Solo baño con shampoo y secado. No incluye cepillado ni ningún otro servicio.";

export type GrupoEstetica = {
  nombre: string;
  bano: number;
  rapado?: number;
  expres: number;
};

export const ESTETICA_GRUPOS: GrupoEstetica[] = [
  { nombre: "Poodle, maltés y similares", bano: 390, rapado: 320, expres: 190 },
  { nombre: "Pomerania", bano: 390, expres: 190 },
  { nombre: "Shih tzu, schnauzer, yorkshire, cocker y similares", bano: 390, rapado: 320, expres: 190 },
  { nombre: "Pastores de pelo corto, husky, akita y similares", bano: 590, expres: 370 },
  { nombre: "Pastores de pelo largo, talla grande", bano: 650, expres: 370 },
  { nombre: "Viejo pastor inglés y similares, talla grande", bano: 790, rapado: 590, expres: 450 },
];

export const ESTETICA_POR_TALLA = [
  { talla: "Chico", bano: 250, expres: 150 },
  { talla: "Mediano", bano: 350, expres: 190 },
  { talla: "Grande", bano: 490, expres: 230 },
];

export const ESTETICA_PELO_MALTRATADO = 450;

export const REQUISITOS = [
  { texto: "Evaluación previa de comportamiento", tipo: "si" },
  { texto: "Cartilla de vacunación vigente", tipo: "si" },
  { texto: "Bordetella (vigencia de 6 meses)", tipo: "si" },
  { texto: "Desparasitación cada 3 meses", tipo: "si" },
  { texto: "No recibimos perras en celo ni gestantes", tipo: "no" },
  { texto: "No recibimos perros agresivos", tipo: "no" },
] as const;

const fmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

// "$1,950": sin ".00" en los redondos, con centavos si algún precio los
// llega a tener.
export function pesos(n: number) {
  return Number.isInteger(n) ? fmt.format(n) : fmt.format(n).replace(/(\.\d)$/, "$10");
}
