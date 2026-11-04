/**
 * Tokens de la app nativa (docs/diseno/DESIGN.md, «App nativa para dueños»). La marca es la de PeluDesk (morado,
 * menta, coral, crema); la app la usa con el lenguaje de una app de consumo: fondo cálido, superficies blancas,
 * un solo acento y colores por tipo de lugar en el mapa. Claro y oscuro.
 */
export const colores = {
  claro: {
    fondo: "#FAF7F2",
    superficie: "#FFFFFF",
    superficieAlta: "#F2EEE7",
    texto: "#221F2B",
    textoSuave: "#625C6B",
    textoTenue: "#857E8D",
    linea: "#E7E1D8",
    primario: "#4B3F72",
    primarioPresionado: "#3A3059",
    primarioSuave: "#ECE8F5",
    sobrePrimario: "#FFFFFF",
    exito: "#1F6B57",
    exitoSuave: "#E3F3ED",
    peligro: "#B23C31",
    peligroSuave: "#FDE8E5",
    aviso: "#8A5400",
    avisoSuave: "#FDF0D9",
    sombra: "#2B2A33",
    velo: "rgba(34,31,43,0.42)",
  },
  oscuro: {
    fondo: "#131117",
    superficie: "#1D1A22",
    superficieAlta: "#29252F",
    texto: "#F4F1F8",
    textoSuave: "#B5AFBE",
    textoTenue: "#8F8999",
    linea: "#35303D",
    primario: "#B9ABF0",
    primarioPresionado: "#A493E8",
    primarioSuave: "#2E2748",
    sobrePrimario: "#1B1530",
    exito: "#7FD1B5",
    exitoSuave: "#173A30",
    peligro: "#F4978E",
    peligroSuave: "#40201D",
    aviso: "#F5B85C",
    avisoSuave: "#3A2A10",
    sombra: "#000000",
    velo: "rgba(0,0,0,0.55)",
  },
} as const;

export type Colores = { [K in keyof typeof colores.claro]: string };

/** Color de cada tipo de lugar o alerta en el mapa (pines y chips). Iguales en claro y oscuro. */
export const coloresLugar = {
  veterinaria: "#D2483E",
  urgencias: "#B0161F",
  estetica: "#8C5AD6",
  guarderia: "#E0861A",
  hotel: "#2B7A99",
  petfriendly: "#2E8B57",
  tienda: "#7A5A48",
  paseador: "#4F63C2",
  peludesk: "#4B3F72",
  perdido: "#D2483E",
  herido: "#B0161F",
  peligro: "#E0861A",
  abandonado: "#7A5A48",
} as const;

export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radio = { control: 12, tarjeta: 18, hoja: 28, pastilla: 999 } as const;

/**
 * Tipografía: Outfit (la del logotipo). Sin mayúsculas forzadas ni letras separadas; los títulos de pantalla los pone
 * la barra nativa (17, seminegrita). `cifra` solo para un dato que manda (peso, saldo).
 */
export const fuentes = {
  normal: "Outfit_400Regular",
  media: "Outfit_500Medium",
  semi: "Outfit_600SemiBold",
  negrita: "Outfit_700Bold",
} as const;

export const tipo = {
  titulo: { fontFamily: fuentes.semi, fontSize: 22, lineHeight: 28 },
  encabezado: { fontFamily: fuentes.semi, fontSize: 17, lineHeight: 22 },
  cuerpo: { fontFamily: fuentes.normal, fontSize: 16, lineHeight: 22 },
  cuerpoFuerte: { fontFamily: fuentes.media, fontSize: 16, lineHeight: 22 },
  secundario: { fontFamily: fuentes.normal, fontSize: 14, lineHeight: 20 },
  pie: { fontFamily: fuentes.media, fontSize: 12, lineHeight: 16 },
  boton: { fontFamily: fuentes.semi, fontSize: 16, lineHeight: 20 },
  cifra: { fontFamily: fuentes.semi, fontSize: 28, lineHeight: 32, fontVariant: ["tabular-nums" as const] },
} as const;

export type EstiloTexto = keyof typeof tipo;
