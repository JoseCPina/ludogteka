import type { Fuente } from "@/lib/peludesk/guias";

/** «Fuente: …» debajo de un dato de una comparativa, con enlace al sitio oficial. */
export function Fuentes({ fuentes }: { fuentes: Fuente[] }) {
  if (!fuentes.length) return null;
  return (
    <span className="mt-1.5 block text-xs text-n-600">
      Fuente:{" "}
      {fuentes.map((f, i) => (
        <span key={f.url}>
          {i > 0 && " · "}
          <a href={f.url} target="_blank" rel="noopener nofollow" className="underline underline-offset-2 hover:text-morado">{f.nombre}</a>
        </span>
      ))}
    </span>
  );
}
