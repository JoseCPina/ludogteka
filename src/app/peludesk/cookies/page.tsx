import type { Metadata } from "next";
import Link from "next/link";
import { BotonPreferenciasCookies } from "@/components/peludesk/consentimiento/preferencias-cookies";
import { PaginaLegal } from "@/components/peludesk/pagina-legal";
import { COOKIES_DECLARADAS, COOKIE_CONSENTIMIENTO, MESES_VIGENCIA } from "@/lib/peludesk/cookies";
import { metaPagina } from "@/lib/peludesk/seo";

export const metadata: Metadata = metaPagina({
  titulo: "Política de cookies | PeluDesk",
  descripcion: "Qué cookies y tecnologías usa peludesk.mx, para qué sirve cada una, cuánto dura y cómo aceptarlas, rechazarlas o revocarlas.",
  ruta: "/cookies",
});

const PESO: Record<string, string> = { Necesaria: "bg-n-100 text-n-800", Analítica: "bg-menta-suave text-menta-oscuro", Marketing: "bg-morado-suave text-morado" };

export default function Cookies() {
  return (
    <PaginaLegal
      doc="cookies"
      intro="Esto es todo lo que peludesk.mx puede guardar en tu navegador. Las necesarias siempre están activas; la analítica y el marketing solo funcionan si las aceptas."
      despues={
        <div className="pd-prosa">
          <h2 id="que-son">Qué es una cookie</h2>
          <p>
            Una cookie es un archivo pequeño que un sitio guarda en tu navegador. Las usamos para recordar una elección, mantener
            una sesión o, si lo permites, medir visitas y anuncios. Otras tecnologías similares (como un script de medición) se
            tratan igual que una cookie en esta política.
          </p>

          <h2 id="tabla">Lo que usa peludesk.mx</h2>
          <div className="pd-tabla" tabIndex={0} role="region" aria-label="Tabla de cookies de peludesk.mx">
            <table style={{ minWidth: "52rem" }}>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">De quién</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Duración</th>
                  <th scope="col">Para qué</th>
                  <th scope="col">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {COOKIES_DECLARADAS.map((c) => (
                  <tr key={c.nombre}>
                    <td><code className="rounded bg-n-100 px-1 py-0.5 text-[0.9em]">{c.nombre}</code></td>
                    <td>{c.quien}</td>
                    <td><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${PESO[c.categoria]}`}>{c.categoria}</span></td>
                    <td>{c.duracion}</td>
                    <td>{c.finalidad}</td>
                    <td>{c.cuando}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Nada de analítica ni de marketing se carga antes de que aceptes: sin tu permiso ni siquiera se pide el script de
            Meta. Las aplicaciones de los negocios (<code>negocio.peludesk.mx</code> o su propio dominio) no llevan esta analítica ni
            el píxel.
          </p>

          <h2 id="tu-eleccion">Tu elección</h2>
          <p>
            Cuando entras por primera vez te preguntamos con dos botones iguales, <strong>Aceptar</strong> y <strong>Rechazar</strong>,
            y una opción <strong>Configurar</strong> para escoger por categoría. Guardamos tu elección {MESES_VIGENCIA} meses en la
            cookie <code>{COOKIE_CONSENTIMIENTO}</code>; pasado ese tiempo, volvemos a preguntarte.
          </p>
          <p>Puedes cambiarla o revocarla cuando quieras:</p>
          <p>
            <BotonPreferenciasCookies className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-morado bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave" />
          </p>
          <p>
            Al revocar «Marketing» borramos las cookies <code>_fbp</code> y <code>_fbc</code> de peludesk.mx y dejamos de enviar
            eventos a Meta. Las cookies que Meta guarda en su propio dominio se controlan desde tu cuenta de Facebook o
            Instagram (Configuración › Preferencias de anuncios) o desde los ajustes de tu navegador.
          </p>

          <h2 id="navegador">Desde tu navegador</h2>
          <p>
            También puedes bloquear o borrar cookies en la configuración de tu navegador. Si bloqueas las necesarias, el aviso
            volverá a aparecer en cada visita y la sesión de la administración de la plataforma no podrá mantenerse.
          </p>

          <h2 id="mas">Más información</h2>
          <p>
            Cómo tratamos los datos que obtienen la analítica y el píxel está en el{" "}
            <Link href="/aviso-de-privacidad">aviso de privacidad</Link>. Si tienes dudas, escribe a{" "}
            <a href="mailto:contacto@menteo.com.mx">contacto@menteo.com.mx</a>.
          </p>
        </div>
      }
    />
  );
}
