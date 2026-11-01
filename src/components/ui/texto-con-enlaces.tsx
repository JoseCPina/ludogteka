import type { ReactNode } from "react";
import { Enlace } from "@/components/ui/enlace";

// Los mensajes de la base que dicen QUÉ falta terminan con la ruta de la
// pantalla donde se resuelve (describir_precio_faltante: "Captúralo en
// /servicios/<id>/tarifas", "Captúrala en /perros/<id>"). Aquí la ruta se
// cambia por un enlace que se lee dentro de la frase; si un mensaje llega a
// mostrarse sin pasar por aquí, la ruta sigue entendiéndose.
const RUTAS = [
  { patron: /\/reservas\/calendario(\?dia=\d{4}-\d{2}-\d{2})?/, etiqueta: "el calendario" },
  { patron: /\/reservas\/[0-9a-f-]{36}/, etiqueta: "esa reserva" },
  { patron: /\/servicios\/[0-9a-f-]{36}\/tarifas/, etiqueta: "la pantalla de tarifas" },
  { patron: /\/perros\/[0-9a-f-]{36}/, etiqueta: "su expediente" },
  { patron: /\/servicios(?![\w/-])/, etiqueta: "Servicios" },
];

export function TextoConEnlaces({ texto }: { texto: string }) {
  // Todas las rutas que haya, de izquierda a derecha (un mensaje puede traer dos: la reserva y el calendario).
  const partes: ReactNode[] = [];
  let resto = texto;
  for (let vueltas = 0; vueltas < 6; vueltas++) {
    let mejor: { m: RegExpMatchArray; etiqueta: string } | null = null;
    for (const { patron, etiqueta } of RUTAS) {
      const m = resto.match(patron);
      if (m && m.index !== undefined && (!mejor || m.index < (mejor.m.index ?? 0))) mejor = { m, etiqueta };
    }
    if (!mejor || mejor.m.index === undefined) break;
    partes.push(resto.slice(0, mejor.m.index));
    partes.push(
      <Enlace key={partes.length} href={mejor.m[0]} enTexto>
        {mejor.etiqueta}
      </Enlace>
    );
    resto = resto.slice(mejor.m.index + mejor.m[0].length);
  }
  partes.push(resto);
  return <>{partes}</>;
}

export function conEnlaces(contenido: ReactNode): ReactNode {
  return typeof contenido === "string" ? <TextoConEnlaces texto={contenido} /> : contenido;
}
