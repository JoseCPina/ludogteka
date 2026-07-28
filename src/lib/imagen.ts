// Miniatura de identificación, no un archivo para imprimir: 800px de lado
// mayor y JPEG calidad 0.82 dan un resultado nítido en pantalla a una
// fracción del peso de una foto de celular (que llegan de 5-10 MB).
const LADO_MAXIMO = 800;
const CALIDAD_JPEG = 0.82;

// createImageBitmap con imageOrientation:"from-image" decodifica ya
// aplicando la rotación que indique el EXIF de la foto — sin esto, una
// foto tomada en vertical con el celular se sube acostada, porque los
// píxeles crudos del sensor suelen venir en horizontal y solo el tag EXIF
// dice cómo mostrarla derecha.
export async function comprimirImagen(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const contexto = canvas.getContext("2d");
  if (!contexto) {
    bitmap.close();
    throw new Error("No se pudo preparar el lienzo para comprimir la imagen.");
  }
  contexto.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen."))),
      "image/jpeg",
      CALIDAD_JPEG
    );
  });
}
