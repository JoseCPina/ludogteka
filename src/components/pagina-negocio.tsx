import Link from "next/link";
import { WhatsappLogo, MapPin, Clock, SignIn } from "@phosphor-icons/react/dist/ssr";
import { cargarNegocioLanding, linkWhatsAppDe, pesos } from "@/lib/landing/negocio";
import { urlPublicaArchivo } from "@/lib/negocio/publico";
import { MarcaDelNegocio } from "@/components/marca/marca-negocio";
import { HechoConPeluDesk } from "@/components/marca/peludesk";

export type DatosPagina = {
  nombre: string;
  ciudad: string | null;
  descripcion: string | null;
  direccion: string | null;
  logo_path: string | null;
  fotos: string[];
  whatsapp: string | null;
  horario: string | null;
  servicios: {
    categoria: string;
    nombre: string;
    unidad: string;
    incluye: string[] | null;
    no_incluye: string | null;
    precios: { etiqueta: string | null; precio: number }[] | null;
  }[];
};

const GRUPOS: { categoria: string; titulo: string }[] = [
  { categoria: "guarderia", titulo: "Guardería" },
  { categoria: "hotel", titulo: "Hotel" },
  { categoria: "estetica", titulo: "Estética" },
  { categoria: "bono", titulo: "Paquetes de guardería" },
  { categoria: "cargo", titulo: "Recolección a domicilio" },
];

const POR_UNIDAD: Record<string, string> = { hora: "la hora", noche: "la noche", dia: "el día", km: "por km" };

/**
 * La página web de un negocio de PeluDesk (módulo «Página web»): se arma
 * sola con su perfil (logo, fotos, descripción, dirección), el WhatsApp de
 * recepción, su horario y los servicios de sus módulos activos con sus
 * precios vigentes (pagina_publica()). Solo sale lo que el negocio ofrece.
 */
export async function PaginaNegocio({ datos }: { datos: DatosPagina }) {
  const negocio = await cargarNegocioLanding();
  const fotos = datos.fotos.map((p) => urlPublicaArchivo(p)!).filter(Boolean);
  const [principal, ...galeria] = fotos;
  const whatsapp = datos.whatsapp ? linkWhatsAppDe(`52${datos.whatsapp}`, `Hola, ${datos.nombre}. Quiero información.`) : null;
  const mapa = datos.direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${datos.direccion}${datos.ciudad ? `, ${datos.ciudad}` : ""}`)}`
    : null;
  const grupos = GRUPOS.map((g) => ({ ...g, servicios: datos.servicios.filter((s) => s.categoria === g.categoria) })).filter((g) => g.servicios.length > 0);
  const color = negocio.marca?.color && /^#[0-9a-fA-F]{6}$/.test(negocio.marca.color) ? negocio.marca.color : "#4b3f72";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-crema text-n-900">
      <header className="border-b border-n-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5">
            <MarcaDelNegocio nombre={datos.nombre} marca={negocio.marca} />
            {/* Con logo de imagen, el nombre va junto (sin logo, MarcaDelNegocio ya lo pone). */}
            {negocio.marca?.logo && <span className="truncate text-lg font-bold tracking-tight">{datos.nombre}</span>}
          </span>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-n-700 hover:bg-n-100">
              <SignIn size={18} weight="bold" aria-hidden />
              Entrar
            </Link>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden min-h-10 items-center gap-1.5 rounded-md px-4 text-sm font-semibold text-white sm:inline-flex"
                style={{ background: "#117a43" }}
              >
                <WhatsappLogo size={18} weight="fill" aria-hidden />
                WhatsApp
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 md:items-center md:py-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color }}>
              {grupos.map((g) => g.titulo).slice(0, 3).join(" · ")}
              {datos.ciudad ? ` en ${datos.ciudad}` : ""}
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl">{datos.nombre}</h1>
            {datos.descripcion && <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-n-700">{datos.descripcion}</p>}
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-md px-6 text-base font-semibold text-white"
                style={{ background: "#117a43" }}
              >
                <WhatsappLogo size={22} weight="fill" aria-hidden />
                Escríbenos por WhatsApp
              </a>
            )}
          </div>
          {principal && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={principal} alt={`${datos.nombre}`} className="aspect-[4/3] w-full rounded-[18px] border border-n-200 object-cover" />
          )}
        </section>

        {grupos.length > 0 && (
          <section aria-labelledby="t-servicios" className="border-y border-n-200 bg-white">
            <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
              <h2 id="t-servicios" className="text-2xl font-bold tracking-tight">
                Servicios y precios
              </h2>
              <div className="mt-6 flex flex-col gap-10">
                {grupos.map((g) => (
                  <div key={g.categoria}>
                    <h3 className="text-sm font-bold uppercase tracking-[0.08em]" style={{ color }}>
                      {g.titulo}
                    </h3>
                    <ul className="mt-3 grid gap-4 md:grid-cols-2">
                      {g.servicios.map((s) => {
                        const precios = s.precios ?? [];
                        const unico = precios.length === 1;
                        return (
                          <li key={s.nombre} className="rounded-[14px] border border-n-200 bg-crema/60 p-4">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="font-semibold">{s.nombre}</p>
                              {unico && (
                                <p className="shrink-0 font-bold tabular-nums">
                                  {pesos(precios[0].precio)}
                                  {s.categoria !== "bono" && POR_UNIDAD[s.unidad] && <span className="text-sm font-medium text-n-600"> {POR_UNIDAD[s.unidad]}</span>}
                                </p>
                              )}
                            </div>
                            {s.incluye && s.incluye.length > 0 && <p className="mt-1 text-sm text-n-600">Incluye: {s.incluye.join(", ")}.</p>}
                            {s.no_incluye && <p className="mt-0.5 text-sm text-n-600">No incluye: {s.no_incluye}</p>}
                            {!unico && precios.length > 0 && (
                              <ul className="mt-3 flex flex-col divide-y divide-n-200 text-sm">
                                {precios.map((p, i) => (
                                  <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                                    <span className="text-n-700">{p.etiqueta ?? "Precio"}</span>
                                    <span className="font-semibold tabular-nums">{pesos(p.precio)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {galeria.length > 0 && (
          <section aria-label="Fotos" className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {galeria.map((url) => (
                <li key={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" loading="lazy" className="aspect-square w-full rounded-[14px] border border-n-200 object-cover" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {(datos.horario || datos.direccion) && (
          <section aria-label="Horario y ubicación" className="mx-auto grid max-w-5xl gap-6 px-4 pb-14 sm:px-6 md:grid-cols-2">
            {datos.horario && (
              <div className="flex gap-3 rounded-[14px] border border-n-200 bg-white p-5">
                <Clock size={24} className="shrink-0" style={{ color }} aria-hidden />
                <div>
                  <h2 className="font-semibold">Horario</h2>
                  <p className="mt-1 text-n-700 first-letter:uppercase">{datos.horario}</p>
                </div>
              </div>
            )}
            {datos.direccion && (
              <div className="flex gap-3 rounded-[14px] border border-n-200 bg-white p-5">
                <MapPin size={24} className="shrink-0" style={{ color }} aria-hidden />
                <div>
                  <h2 className="font-semibold">Dónde estamos</h2>
                  <p className="mt-1 text-n-700">
                    {datos.direccion}
                    {datos.ciudad ? `, ${datos.ciudad}` : ""}
                  </p>
                  {mapa && (
                    <a href={mapa} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-morado hover:underline">
                      Ver en el mapa →
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-n-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-n-600 sm:px-6">
          <span>{datos.nombre}</span>
          <HechoConPeluDesk />
        </div>
      </footer>
    </div>
  );
}
