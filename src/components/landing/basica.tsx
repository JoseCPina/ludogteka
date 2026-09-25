import Link from "next/link";
import { WhatsappLogo, MapPin, Clock, SignIn } from "@phosphor-icons/react/dist/ssr";
import { cargarNegocioLanding, linkWhatsAppDe, pesos } from "@/lib/landing/negocio";

// La landing de un negocio de PeluDesk que no tiene tema propio: nombre,
// lo que ofrece, cómo contactarlo y dónde está — todo de `negocios.landing`,
// y lo que no esté capturado simplemente no sale. Sin fotos: las de la
// landing de Ludogteka son de sus clientes, no de nadie más.
export async function LandingBasica() {
  const negocio = await cargarNegocioLanding();
  const d = negocio.landing;
  const whatsapp = d?.telefono_wa ? linkWhatsAppDe(d.telefono_wa, d.mensajes?.general ?? `Hola, ${negocio.nombre}. Quiero información.`) : null;
  const direccion = d?.direccion
    ? `${d.direccion.calle}, ${d.direccion.colonia}, ${d.direccion.cp} ${d.direccion.ciudad}, ${d.direccion.estado}`
    : null;

  const servicios = [
    d?.guarderia && { nombre: "Guardería", precio: `Desde ${pesos(d.guarderia.ocasionalHora)} la hora` },
    d?.hotel && d.hotel.length > 0 && { nombre: "Hotel", precio: `Desde ${pesos(Math.min(...d.hotel.map((h) => h.precio)))} la noche` },
    d?.estetica && d.estetica.grupos.length > 0 && { nombre: "Estética", precio: `Desde ${pesos(Math.min(...d.estetica.grupos.map((g) => g.expres)))}` },
  ].filter(Boolean) as { nombre: string; precio: string }[];

  return (
    <div className="flex min-h-full flex-col bg-n-50">
      <header className="border-b border-n-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="text-xl font-extrabold text-n-900">{negocio.nombre}</span>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[0.9375rem] font-semibold text-n-700 hover:bg-n-100"
          >
            <SignIn size={18} weight="bold" aria-hidden />
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-14 sm:px-6">
        <section className="max-w-2xl">
          <h1 className="text-4xl font-extrabold leading-tight text-n-900 sm:text-5xl">{negocio.nombre}</h1>
          <p className="mt-4 text-lg text-n-600">
            {d?.textos?.lema ?? `Guardería, hotel y estética canina${negocio.ciudad ? ` en ${negocio.ciudad}` : ""}.`}
          </p>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex min-h-12 items-center gap-2.5 rounded-full bg-azul px-6 font-bold text-white hover:opacity-90"
            >
              <WhatsappLogo size={22} weight="fill" aria-hidden />
              Escríbenos por WhatsApp
            </a>
          )}
        </section>

        {servicios.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-n-900">Servicios</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-3">
              {servicios.map((s) => (
                <li key={s.nombre} className="rounded-lg border border-n-200 bg-white p-5">
                  <p className="text-lg font-bold text-n-900">{s.nombre}</p>
                  <p className="mt-1 text-n-600">{s.precio}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(direccion || (d?.horario && d.horario.length > 0)) && (
          <section className="grid gap-4 sm:grid-cols-2">
            {direccion && (
              <div className="flex items-start gap-3 rounded-lg border border-n-200 bg-white p-5">
                <MapPin size={24} weight="fill" className="shrink-0 text-azul" aria-hidden />
                <address className="not-italic text-n-700">{direccion}</address>
              </div>
            )}
            {d?.horario && d.horario.length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-n-200 bg-white p-5">
                <Clock size={24} weight="bold" className="shrink-0 text-azul" aria-hidden />
                <dl className="text-n-700">
                  {d.horario.map((h) => (
                    <div key={h.dias}>
                      <dt className="inline font-semibold">{h.dias}: </dt>
                      <dd className="inline">{h.horas}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-n-200 bg-white py-6 text-center text-sm text-n-500">
        © {new Date().getFullYear()} {negocio.nombre}
      </footer>
    </div>
  );
}
