// Las plantillas de consulta traen títulos («Estudios solicitados:», «Seguimiento / próxima revisión:»…) que el
// médico llena o no. Al dueño no se le muestran los que quedaron vacíos (QA externa, 16 de octubre de 2026): un
// renglón que es solo un título, sin nada escrito después, se quita. Un título con su texto, o seguido de renglones
// que lo desarrollan, se conserva.
// Un renglón que son solo títulos: «Estudios solicitados:» o varios seguidos («A: B:») si el texto quedó en una línea.
const SOLO_TITULO = /^(?:[^\n:]{1,80}:\s*)+$/;
const INICIA_TITULO = /^[^\n:]{1,80}:/;

export function sinTitulosVacios(texto: string): string {
  const lineas = texto.split("\n").map((l) => l.replace(/\s+$/, ""));
  const conservadas: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (SOLO_TITULO.test(l.trim())) {
      const sig = lineas.slice(i + 1).find((x) => x.trim() !== "");
      if (sig === undefined || INICIA_TITULO.test(sig.trim())) continue;
    }
    conservadas.push(l);
  }
  return conservadas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const normalizar = (t: string) => t.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * QA S21 (N110): al dueño nunca se le enseñan las etiquetas de la plantilla de consulta, solo lo capturado. Quita
 * del inicio de cada renglón las etiquetas conocidas (`etiquetas`, las que entrega `mi_expediente` de las
 * plantillas del negocio) y las guías con «·» («Medicamento · dosis · vía · frecuencia · duración:»); un renglón
 * que se queda vacío se quita. Lo que sobra pasa por `sinTitulosVacios`. Si no queda nada, la sección no se muestra.
 */
export function sinEtiquetasDePlantilla(texto: string, etiquetas: string[] = []): string {
  const conocidas = new Set(etiquetas.map(normalizar).filter(Boolean));
  const renglones = texto.split("\n").map((linea) => {
    let r = linea.trim();
    for (;;) {
      const m = r.match(/^([^:\n]{1,100}):\s*/);
      if (!m) break;
      const etiqueta = normalizar(m[1]);
      if (!conocidas.has(etiqueta) && !m[1].includes("·")) break;
      r = r.slice(m[0].length);
    }
    return r;
  });
  return sinTitulosVacios(renglones.filter((r, i, todos) => r !== "" || (i > 0 && todos[i - 1] !== "")).join("\n"));
}
