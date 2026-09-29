"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { agrupar, buscar, type Articulo } from "@/lib/ayuda";

/**
 * El índice del centro de ayuda con su buscador: agrupado por módulo y, al
 * escribir, los artículos que coinciden (título y sinónimos primero).
 */
export function IndiceAyuda({ articulos, base = "/ayuda" }: { articulos: Articulo[]; base?: string }) {
  const [q, setQ] = useState("");
  const resultados = useMemo(() => (q.trim().length > 2 ? buscar(q, articulos) : null), [q, articulos]);
  const Tarjeta = ({ a }: { a: Articulo }) => (
    <li>
      <Link href={`${base}/${a.slug}`} className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado">
        <span className="font-semibold text-n-900">{a.titulo}</span>
        <span className="mt-1 block text-sm text-n-600">{a.resumen}</span>
      </Link>
    </li>
  );
  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-n-800">Busca lo que quieres hacer</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ej. check-in, corte de caja, terminal"
          className="min-h-12 rounded-md border-[1.5px] border-n-300 bg-white px-3 text-n-900 focus-visible:border-morado focus-visible:outline-none"
          data-buscador-ayuda
        />
      </label>
      {resultados ? (
        resultados.length ? (
          <ul className="flex flex-col gap-2">
            {resultados.map((a) => (
              <Tarjeta key={a.slug} a={a} />
            ))}
          </ul>
        ) : (
          <p className="text-n-600">No encontramos un artículo con eso. Prueba con otras palabras.</p>
        )
      ) : (
        agrupar(articulos).map((g) => (
          <section key={g.grupo} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">{g.nombre}</h2>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {g.articulos.map((a) => (
                <Tarjeta key={a.slug} a={a} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
