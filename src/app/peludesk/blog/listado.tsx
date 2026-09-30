import Link from "next/link";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { Migas, RejillaArticulos, LlamadaSobria } from "@/components/peludesk/blog";
import { CATEGORIAS, POR_PAGINA, todosLosArticulos, type CategoriaBlog } from "@/lib/peludesk/blog";
import { JsonLd, migas, ORGANIZACION, SITIO } from "@/lib/peludesk/seo";

/** El índice del blog: todas las entradas paginadas, o las de una categoría. */
export function ListadoBlog({ pagina = 1, categoria }: { pagina?: number; categoria?: CategoriaBlog }) {
  const todos = todosLosArticulos();
  const filtrados = categoria ? todos.filter((a) => a.categoria === categoria) : todos;
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visibles = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const base = categoria ? `/blog/categoria/${categoria}` : "/blog";
  const rutaDe = (n: number) => (categoria ? base : n === 1 ? "/blog" : `/blog/pagina/${n}`);
  const titulo = categoria ? CATEGORIAS[categoria].nombre : "Blog de PeluDesk";
  return (
    <MarcoSitio>
      <JsonLd
        datos={[
          migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Blog", ruta: "/blog" }, ...(categoria ? [{ nombre: titulo, ruta: base }] : [])]),
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Blog de PeluDesk",
            url: `${SITIO}/blog`,
            inLanguage: "es-MX",
            publisher: ORGANIZACION,
          },
        ]}
      />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
        <Migas items={[{ nombre: "Inicio", ruta: "/" }, categoria ? { nombre: "Blog", ruta: "/blog" } : { nombre: "Blog" }, ...(categoria ? [{ nombre: titulo }] : [])]} />
        <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-4xl">{titulo}</h1>
        <p className="mt-3 max-w-[60ch] text-lg text-n-700">
          {categoria
            ? CATEGORIAS[categoria].descripcion
            : "Guías para abrir, cobrar y cuidar una guardería, un hotel o una estética canina. Útiles aunque nunca uses PeluDesk."}
        </p>
        <nav aria-label="Categorías del blog" className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/blog"
            aria-current={!categoria ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold ${!categoria ? "border-morado bg-morado text-white" : "border-n-300 bg-white text-n-800 hover:border-morado"}`}
          >
            Todo
          </Link>
          {(Object.keys(CATEGORIAS) as CategoriaBlog[])
            .filter((c) => todos.some((a) => a.categoria === c))
            .map((c) => (
              <Link
                key={c}
                href={`/blog/categoria/${c}`}
                aria-current={categoria === c ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold ${categoria === c ? "border-morado bg-morado text-white" : "border-n-300 bg-white text-n-800 hover:border-morado"}`}
              >
                {CATEGORIAS[c].nombre}
              </Link>
            ))}
        </nav>
        <div className="mt-8">
          {visibles.length ? <RejillaArticulos articulos={visibles} /> : <p className="rounded-lg border border-dashed border-n-300 p-6 text-n-700">Todavía no hay artículos aquí.</p>}
        </div>
        {!categoria && paginas > 1 && (
          <nav aria-label="Páginas del blog" className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {pagina > 1 && (
              <Link href={rutaDe(pagina - 1)} rel="prev" className="inline-flex min-h-11 items-center rounded-full border border-n-300 bg-white px-5 text-sm font-semibold text-n-800 hover:border-morado">
                ← Anterior
              </Link>
            )}
            {Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={rutaDe(n)}
                aria-current={n === pagina ? "page" : undefined}
                aria-label={`Página ${n}`}
                className={`inline-flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-semibold ${n === pagina ? "border-morado bg-morado text-white" : "border-n-300 bg-white text-n-800 hover:border-morado"}`}
              >
                {n}
              </Link>
            ))}
            {pagina < paginas && (
              <Link href={rutaDe(pagina + 1)} rel="next" className="inline-flex min-h-11 items-center rounded-full border border-n-300 bg-white px-5 text-sm font-semibold text-n-800 hover:border-morado">
                Siguiente →
              </Link>
            )}
          </nav>
        )}
        <div className="mt-14">
          <LlamadaSobria />
        </div>
        <p className="mt-6 text-sm text-n-600">
          <a href="/blog/rss.xml" className="font-semibold text-morado underline underline-offset-2">Suscríbete por RSS</a>
        </p>
      </div>
    </MarcoSitio>
  );
}
