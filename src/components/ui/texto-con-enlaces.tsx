import Link from "next/link";
import type { ReactNode } from "react";

// Los mensajes de la base que dicen QUÉ falta terminan con la ruta de la
// pantalla donde se resuelve (describir_precio_faltante: "Captúralo en
// /servicios/<id>/tarifas", "Captúrala en /perros/<id>"). Aquí la ruta se
// cambia por un enlace que se lee dentro de la frase; si un mensaje llega a
// mostrarse sin pasar por aquí, la ruta sigue entendiéndose.
const RUTAS = [
  { patron: /\/servicios\/[0-9a-f-]{36}\/tarifas/, etiqueta: "la pantalla de tarifas" },
  { patron: /\/perros\/[0-9a-f-]{36}/, etiqueta: "su expediente" },
  { patron: /\/servicios(?![\w/-])/, etiqueta: "Servicios" },
];

export function TextoConEnlaces({ texto }: { texto: string }) {
  for (const { patron, etiqueta } of RUTAS) {
    const m = texto.match(patron);
    if (!m || m.index === undefined) continue;
    return (
      <>
        {texto.slice(0, m.index)}
        <Link href={m[0]} className="font-semibold underline">
          {etiqueta}
        </Link>
        {texto.slice(m.index + m[0].length)}
      </>
    );
  }
  return <>{texto}</>;
}

export function conEnlaces(contenido: ReactNode): ReactNode {
  return typeof contenido === "string" ? <TextoConEnlaces texto={contenido} /> : contenido;
}
