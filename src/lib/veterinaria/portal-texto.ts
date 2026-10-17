// Las plantillas de consulta traen títulos («Estudios solicitados:», «Seguimiento / próxima revisión:»…) que el
// médico llena o no. Al dueño no se le muestran los que quedaron vacíos (QA externa, 16 de octubre de 2026): un
// renglón que es solo un título, sin nada escrito después, se quita. Un título con su texto, o seguido de renglones
// que lo desarrollan, se conserva.
const SOLO_TITULO = /^[^\n:]{1,80}:\s*$/;
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
