import localFont from "next/font/local";

// Las fuentes van en el repo (next/font/local), no se bajan de Google al
// compilar: next/font/google hacía fallar el build de Turbopack de forma
// intermitente ("next/font/google queries have exactly one entry"), en
// local y en Vercel. Cada fuente se declara UNA vez, aquí.
//
// Outfit: la letra de PeluDesk (UI kit), base de toda la app.
// Nunito y Fredoka: las de la landing de Ludogteka y su logotipo. Son los
// MISMOS archivos que servía ludogteka.mx (subconjunto latino, fuente
// variable), para que se vea idéntica.
export const outfit = localFont({
  src: "./outfit-latin.woff2",
  weight: "400 800",
  variable: "--font-outfit",
  display: "swap",
});

export const nunito = localFont({
  src: "./nunito-latin.woff2",
  weight: "400 800",
  variable: "--font-nunito",
  display: "swap",
});

export const fredoka = localFont({
  src: "./fredoka-latin.woff2",
  weight: "500 700",
  variable: "--font-fredoka",
  display: "swap",
});
