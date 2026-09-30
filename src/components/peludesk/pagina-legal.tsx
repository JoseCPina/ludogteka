import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { Migas } from "@/components/peludesk/blog";
import { Markdown, encabezados, parsearMarkdown } from "@/lib/peludesk/markdown";
import { DOCUMENTOS_LEGALES, EMPRESA, type DocumentoLegal } from "@/lib/peludesk/legal";
import { JsonLd, SITIO, migas } from "@/lib/peludesk/seo";

/** El texto de un documento legal (content/legal/<archivo>.md). */
export function textoLegal(archivo: string): string {
  return fs.readFileSync(path.join(process.cwd(), "content", "legal", `${archivo}.md`), "utf8");
}

/**
 * Marco de una página legal de peludesk.mx: título, versión y fecha,
 * índice y el documento. `antes` y `despues` son para lo que no es Markdown
 * (el aviso simplificado, la tabla de cookies).
 */
export function PaginaLegal({
  doc,
  archivo,
  antes,
  despues,
  intro,
}: {
  doc: DocumentoLegal;
  archivo?: string;
  antes?: ReactNode;
  despues?: ReactNode;
  intro?: string;
}) {
  const meta = DOCUMENTOS_LEGALES[doc];
  const bloques = archivo ? parsearMarkdown(textoLegal(archivo)) : [];
  const indice = encabezados(bloques);
  return (
    <MarcoSitio>
      <JsonLd datos={migas([{ nombre: "Inicio", ruta: "/" }, { nombre: meta.titulo, ruta: meta.ruta }])} />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
        <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: meta.titulo }]} />
        <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-4xl">{meta.titulo}</h1>
        <p className="mt-2 text-sm text-n-600">
          {EMPRESA.razonSocial} · PeluDesk · Versión {meta.version} · Última actualización: {meta.fecha}
        </p>
        {intro && <p className="mt-4 max-w-[68ch] text-lg text-n-700">{intro}</p>}
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0">
            {antes}
            {bloques.length > 0 && <Markdown bloques={bloques} />}
            {despues}
          </div>
          {indice.length > 3 && (
            <aside className="hidden lg:block">
              <nav aria-label="Contenido" className="sticky top-24 rounded-2xl border border-n-200 bg-white p-5">
                <p className="text-sm font-bold uppercase tracking-[0.1em] text-n-600">Contenido</p>
                <ol className="mt-3 flex flex-col gap-2 text-sm">
                  {indice.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} className="text-n-800 hover:text-morado hover:underline">{h.texto}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>
          )}
        </div>
        <p className="mt-12 text-sm text-n-600">
          Esta página es la versión vigente: <a href={`${SITIO}${meta.ruta}`} className="underline">{SITIO}{meta.ruta}</a>
        </p>
      </div>
    </MarcoSitio>
  );
}
