// Imágenes de ejemplo para los datos previos de un tutorial (una cartilla de vacunas ficticia).
import sharp from "sharp";

export async function cartillaFicticia(nombrePerro = "Tuna") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#fffdf7"/>
  <rect x="40" y="40" width="820" height="1120" fill="none" stroke="#4b3f72" stroke-width="6" rx="24"/>
  <text x="450" y="150" font-family="Arial" font-size="56" font-weight="700" text-anchor="middle" fill="#4b3f72">Cartilla de vacunación</text>
  <text x="450" y="215" font-family="Arial" font-size="34" text-anchor="middle" fill="#6b647a">Ejemplo ficticio · ${nombrePerro}</text>
  ${["Antirrábica", "Múltiple / séxtuple", "Bordetella"].map((v, i) => `<g><rect x="90" y="${320 + i * 220}" width="720" height="170" rx="16" fill="#ece8f5"/><text x="130" y="${400 + i * 220}" font-family="Arial" font-size="42" fill="#2b2a33">${v}</text><text x="130" y="${455 + i * 220}" font-family="Arial" font-size="32" fill="#6b647a">Aplicada hace 2 meses · Dr. Ejemplo</text></g>`).join("")}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}
