// Patrón de huesos y huellas de la rotulación de la camioneta, para el
// fondo de las franjas turquesa y amarilla. Los trazos son los íconos
// Bone y PawPrint de Phosphor (peso "fill", caja de 256), copiados aquí
// para armar un SVG de fondo sin mandar JavaScript: no están dibujados a
// mano. Generado con un script; si cambia el ícono, se vuelve a generar.
const HUESO = "M231.12,107.72a35.91,35.91,0,0,1-46.19,6.8.14.14,0,0,0-.1,0l-70.35,70.36s0,0,0,.08a36,36,0,1,1-66.37,22.92,36,36,0,1,1,22.92-66.37.14.14,0,0,0,.1,0l70.35-70.36s0,0,0-.08a36,36,0,1,1,66.37-22.92,36,36,0,0,1,23.27,59.57Z";
const HUELLA = "M240,108a28,28,0,1,1-28-28A28,28,0,0,1,240,108ZM72,108a28,28,0,1,0-28,28A28,28,0,0,0,72,108ZM92,88A28,28,0,1,0,64,60,28,28,0,0,0,92,88Zm72,0a28,28,0,1,0-28-28A28,28,0,0,0,164,88Zm23.12,60.86a35.3,35.3,0,0,1-16.87-21.14,44,44,0,0,0-84.5,0A35.25,35.25,0,0,1,69,148.82,40,40,0,0,0,88,224a39.48,39.48,0,0,0,15.52-3.13,64.09,64.09,0,0,1,48.87,0,40,40,0,0,0,34.73-72Z";

// Un mosaico de 160×160 con dos huesos y dos huellas girados, como en la
// lona. Devuelve el valor listo para background-image.
export function patronHuesos(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><g fill="${color}">` +
    `<path transform="translate(8 14) rotate(-28 24 24) scale(0.19)" d="${HUESO}"/>` +
    `<path transform="translate(96 88) rotate(22 24 24) scale(0.19)" d="${HUESO}"/>` +
    `<path transform="translate(98 12) rotate(18 18 18) scale(0.14)" d="${HUELLA}"/>` +
    `<path transform="translate(14 100) rotate(-20 18 18) scale(0.14)" d="${HUELLA}"/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
