import Link from "next/link";
import type { ReactNode } from "react";

/**
 * El Markdown reducido de los artículos de ayuda: párrafos, "## Subtítulo",
 * listas "1. " y "- ", **negritas**, [texto](/ruta) y "> Nota". A propósito
 * no hay más: los artículos son cortos y paso a paso. `base` antepone una
 * `linkDe` decide a dónde lleva cada link ("" = texto sin link: en el
 * centro público, las pantallas de la app no son links).
 */
function enLinea(texto: string, clave: string, linkDe: (href: string) => string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(re)) {
    if ((m.index ?? 0) > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[1]) partes.push(<strong key={`${clave}-${i++}`} className="font-semibold text-n-900">{m[1]}</strong>);
    else {
      const href = linkDe(m[3]);
      partes.push(
        !href ? (
          <span key={`${clave}-${i++}`} className="font-semibold text-n-900">{m[2]}</span>
        ) : href.startsWith("http") ? (
          <a key={`${clave}-${i++}`} href={href} className="font-semibold text-morado underline">{m[2]}</a>
        ) : (
          <Link key={`${clave}-${i++}`} href={href} className="font-semibold text-morado underline">{m[2]}</Link>
        )
      );
    }
    ultimo = (m.index ?? 0) + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

export function MarkdownAyuda({ texto, linkDe = (h) => h }: { texto: string; linkDe?: (href: string) => string }) {
  const bloques: ReactNode[] = [];
  const lineas = texto.trim().split(/\r?\n/);
  let i = 0;
  let k = 0;
  while (i < lineas.length) {
    const l = lineas[i].trim();
    if (!l) {
      i++;
      continue;
    }
    if (l.startsWith("## ")) {
      bloques.push(<h2 key={k++} className="mt-4 text-lg font-bold text-n-900">{enLinea(l.slice(3), `h${k}`, linkDe)}</h2>);
      i++;
      continue;
    }
    if (/^\d+\.\s/.test(l) || l.startsWith("- ")) {
      const ordenada = /^\d+\.\s/.test(l);
      const items: string[] = [];
      while (i < lineas.length && (ordenada ? /^\d+\.\s/.test(lineas[i].trim()) : lineas[i].trim().startsWith("- "))) {
        items.push(lineas[i].trim().replace(ordenada ? /^\d+\.\s+/ : /^-\s+/, ""));
        i++;
      }
      const Etiqueta = ordenada ? "ol" : "ul";
      bloques.push(
        <Etiqueta key={k++} className={`flex flex-col gap-1.5 pl-6 text-n-800 ${ordenada ? "list-decimal" : "list-disc"}`}>
          {items.map((t, j) => (
            <li key={j}>{enLinea(t, `li${k}-${j}`, linkDe)}</li>
          ))}
        </Etiqueta>
      );
      continue;
    }
    if (l.startsWith("> ")) {
      const nota: string[] = [];
      while (i < lineas.length && lineas[i].trim().startsWith(">")) {
        nota.push(lineas[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      bloques.push(
        <p key={k++} className="rounded-md border-l-4 border-ambar bg-ambar-suave px-3 py-2 text-sm text-n-800">
          {enLinea(nota.join(" "), `n${k}`, linkDe)}
        </p>
      );
      continue;
    }
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(##\s|\d+\.\s|-\s|>)/.test(lineas[i].trim())) {
      parrafo.push(lineas[i].trim());
      i++;
    }
    bloques.push(<p key={k++} className="text-n-800">{enLinea(parrafo.join(" "), `p${k}`, linkDe)}</p>);
  }
  return <div className="flex flex-col gap-3 leading-relaxed">{bloques}</div>;
}
