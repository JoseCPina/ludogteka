import Link from "next/link";
import type { ReactNode } from "react";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { Migas } from "@/components/peludesk/blog";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { HERRAMIENTAS, herramientaPorClave, herramientasPublicadas } from "@/lib/herramientas/lista";
import { tituloDeRuta } from "@/lib/peludesk/paginas";
import { EventoHerramienta } from "./evento";
import "./herramientas.css";

/**
 * El marco de toda herramienta pública: encabezado del sitio, la ficha de arriba (número, nombre, qué hace y de dónde
 * salen sus datos, en una línea cada uno), el cuerpo, los enlaces cruzados (otras herramientas, guías y páginas por
 * giro) y el cierre con la prueba gratis. La identidad: hoja de trabajo, texto a la izquierda, cifras grandes en
 * tabular, reglas finas en vez de tarjetas; Outfit, morado y menta (src/components/herramientas/herramientas.css).
 */
export function MarcoHerramienta({
  clave,
  children,
  titulo,
  intro,
  relacionadas = [],
  cierre,
  migas,
}: {
  clave: string;
  children: ReactNode;
  /** Un h1 distinto al nombre de la herramienta (las páginas por ciudad). */
  titulo?: string;
  intro?: ReactNode;
  relacionadas?: string[];
  cierre?: { titulo: string; texto: string; boton?: string; href?: string };
  migas?: { nombre: string; ruta?: string }[];
}) {
  const h = herramientaPorClave(clave);
  if (!h) return null;
  const numero = String(HERRAMIENTAS.findIndex((x) => x.clave === clave) + 1).padStart(2, "0");
  const otras = herramientasPublicadas().filter((x) => x.clave !== clave);
  const enlaces = [...relacionadas, ...otras.map((x) => x.ruta)].map((ruta) => ({ ruta, titulo: tituloDeRuta(ruta) })).filter((x): x is { ruta: string; titulo: string } => !!x.titulo);
  return (
    <MarcoSitio>
      <EventoHerramienta clave={clave} />
      <div className="hta">
        <header className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6 md:pt-12">
          <Migas items={migas ?? [{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: h.nombre }]} />
          <p className="hta-ceja mt-8">
            <span>Herramienta {numero}</span>
            <span aria-hidden>·</span>
            <span>Gratis, sin cuenta</span>
          </p>
          <h1 className="hta-titulo mt-3">{titulo ?? h.nombre}</h1>
          <div className="mt-6 grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <p className="hta-linea"><span className="hta-etiqueta">Qué hace</span>{intro ?? h.que}</p>
            <p className="hta-linea"><span className="hta-etiqueta">De dónde salen los datos</span>{h.datos}</p>
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
          {enlaces.length > 0 && (
            <nav aria-label="Te puede servir" className="hta-regla pt-8">
              <p className="hta-etiqueta">Te puede servir</p>
              <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {enlaces.map((x) => (
                  <li key={x.ruta}>
                    <Link href={x.ruta} className="hta-enlace">{x.titulo}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <aside aria-label="Prueba PeluDesk" className="hta-regla mt-10 grid gap-6 pt-8 md:grid-cols-[minmax(0,1.4fr)_auto] md:items-end">
            <div>
              <p className="hta-etiqueta">{cierre ? "Siguiente paso" : "Con PeluDesk"}</p>
              <p className="mt-2 max-w-[26ch] text-2xl font-bold leading-tight tracking-tight text-n-900">{cierre?.titulo ?? "Esto, y la agenda, la caja y los recordatorios, en un solo lugar."}</p>
              <p className="mt-2 max-w-[56ch] text-n-700">{cierre?.texto ?? "15 días con todo abierto, sin tarjeta. Lo que capturaste aquí se carga en tu cuenta."}</p>
            </div>
            {cierre?.href ? (
              <Link href={cierre.href} className="hta-boton">{cierre.boton ?? "Seguir"}</Link>
            ) : (
              <EnlaceRegistro className="hta-boton">{cierre?.boton ?? "Pruébalo gratis"}</EnlaceRegistro>
            )}
          </aside>
        </footer>
      </div>
    </MarcoSitio>
  );
}
