import Link from "next/link";
import type { ReactNode } from "react";

/**
 * El Markdown de peludesk.mx (blog y páginas legales, archivos en /content).
 * Soporta lo que esos textos usan y nada más: "## " y "### " (con ancla),
 * párrafos, listas "- " y "1. ", "> cita", tablas "| a | b |", "---",
 * **negritas**, *cursivas*, `código` y [texto](url). Los textos son nuestros
 * (están en el repo), así que no hay HTML crudo: todo pasa por React.
 */
export type Bloque =
  | { tipo: "h2" | "h3"; texto: string; id: string }
  | { tipo: "p"; texto: string }
  | { tipo: "ul" | "ol"; items: string[] }
  | { tipo: "cita"; texto: string }
  | { tipo: "tabla"; cabecera: string[]; filas: string[][] }
  | { tipo: "hr" };

export function anclaDe(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

const celdas = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parsearMarkdown(texto: string): Bloque[] {
  const lineas = texto.replace(/\r\n/g, "\n").trim().split("\n");
  const bloques: Bloque[] = [];
  const usadas = new Map<string, number>();
  // Un «{#ancla}» al final del encabezado fija su ancla y no se muestra.
  const ancla = (t: string, fija?: string) => {
    const base = fija || anclaDe(t) || "seccion";
    const n = usadas.get(base) ?? 0;
    usadas.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  };
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i].trim();
    if (!l) {
      i++;
    } else if (l.startsWith("### ") || l.startsWith("## ")) {
      const nivel = l.startsWith("### ") ? 3 : 2;
      const crudo = l.slice(nivel + 1);
      const fija = crudo.match(/\s*\{#([a-z0-9-]+)\}\s*$/);
      const texto = fija ? crudo.slice(0, fija.index) : crudo;
      bloques.push({ tipo: nivel === 3 ? "h3" : "h2", texto, id: ancla(texto, fija?.[1]) });
      i++;
    } else if (/^(-{3,}|\*{3,})$/.test(l)) {
      bloques.push({ tipo: "hr" });
      i++;
    } else if (l.startsWith("|") && lineas[i + 1]?.trim().match(/^\|?[\s:|-]+\|[\s:|-]*$/)) {
      const cabecera = celdas(l);
      i += 2;
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i].trim().startsWith("|")) filas.push(celdas(lineas[i++]));
      bloques.push({ tipo: "tabla", cabecera, filas });
    } else if (/^\d+\.\s/.test(l) || /^[-*]\s/.test(l)) {
      const ordenada = /^\d+\.\s/.test(l);
      const patron = ordenada ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items: string[] = [];
      while (i < lineas.length && patron.test(lineas[i].trim())) {
        let item = lineas[i].trim().replace(patron, "");
        i++;
        // Continuación del elemento (renglón sangrado).
        while (i < lineas.length && /^\s{2,}\S/.test(lineas[i]) && !patron.test(lineas[i].trim())) item += ` ${lineas[i++].trim()}`;
        items.push(item);
      }
      bloques.push({ tipo: ordenada ? "ol" : "ul", items });
    } else if (l.startsWith(">")) {
      const partes: string[] = [];
      while (i < lineas.length && lineas[i].trim().startsWith(">")) partes.push(lineas[i++].trim().replace(/^>\s?/, ""));
      bloques.push({ tipo: "cita", texto: partes.join(" ") });
    } else {
      const partes: string[] = [];
      while (
        i < lineas.length && lineas[i].trim() &&
        !/^(#{2,3}\s|>|\||\d+\.\s|[-*]\s)/.test(lineas[i].trim())
      ) partes.push(lineas[i++].trim());
      bloques.push({ tipo: "p", texto: partes.join(" ") });
    }
  }
  return bloques;
}

/** Los "## " del texto, para la tabla de contenido. */
export function encabezados(bloques: Bloque[]): { id: string; texto: string }[] {
  return bloques.flatMap((b) => (b.tipo === "h2" ? [{ id: b.id, texto: b.texto.replace(/\*+/g, "") }] : []));
}

/** Palabras del texto (para el tiempo de lectura). */
export function contarPalabras(texto: string): number {
  return texto.replace(/[#>*|`\-[\]()]/g, " ").split(/\s+/).filter(Boolean).length;
}

function enLinea(texto: string, clave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  let n = 0;
  for (const m of texto.matchAll(re)) {
    if ((m.index ?? 0) > ultimo) partes.push(texto.slice(ultimo, m.index));
    const k = `${clave}-${n++}`;
    if (m[1]) partes.push(<strong key={k} className="font-semibold text-n-900">{m[1]}</strong>);
    else if (m[2]) partes.push(<em key={k}>{m[2]}</em>);
    else if (m[3]) partes.push(<code key={k} className="rounded bg-n-100 px-1 py-0.5 text-[0.9em]">{m[3]}</code>);
    else {
      const href = m[5];
      const externo = /^https?:\/\//.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
      const clase = "font-semibold text-morado underline decoration-morado/40 underline-offset-2 hover:decoration-morado";
      partes.push(
        externo ? (
          <a key={k} href={href} className={clase} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {m[4]}
          </a>
        ) : (
          <Link key={k} href={href} className={clase}>{m[4]}</Link>
        )
      );
    }
    ultimo = (m.index ?? 0) + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

export function Markdown({ bloques }: { bloques: Bloque[] }) {
  return (
    <div className="pd-prosa">
      {bloques.map((b, k) => {
        switch (b.tipo) {
          case "h2":
            return <h2 key={k} id={b.id} className="scroll-mt-24">{enLinea(b.texto, `h${k}`)}</h2>;
          case "h3":
            return <h3 key={k} id={b.id} className="scroll-mt-24">{enLinea(b.texto, `h${k}`)}</h3>;
          case "p":
            return <p key={k}>{enLinea(b.texto, `p${k}`)}</p>;
          case "ul":
            return <ul key={k}>{b.items.map((t, j) => <li key={j}>{enLinea(t, `l${k}-${j}`)}</li>)}</ul>;
          case "ol":
            return <ol key={k}>{b.items.map((t, j) => <li key={j}>{enLinea(t, `l${k}-${j}`)}</li>)}</ol>;
          case "cita":
            return <blockquote key={k}>{enLinea(b.texto, `q${k}`)}</blockquote>;
          case "hr":
            return <hr key={k} />;
          case "tabla":
            return (
              <div key={k} className="pd-tabla" tabIndex={0} role="region" aria-label="Tabla">
                <table>
                  <thead>
                    <tr>{b.cabecera.map((c, j) => <th key={j} scope="col">{enLinea(c, `th${k}-${j}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.filas.map((f, r) => (
                      <tr key={r}>{f.map((c, j) => <td key={j}>{enLinea(c, `td${k}-${r}-${j}`)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
