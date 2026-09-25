import { ArrowSquareOut, Clock, MapPin, NavigationArrow } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp, Cinta } from "./comunes";
import { datosLanding } from "@/lib/landing/negocio";

const botonSecundario =
  "lp-boton lp-boton-blanco lp-display inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-[var(--lp-indigo)] px-5 text-base font-bold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--lp-indigo)] focus-visible:ring-offset-2";

export async function Ubicacion() {
  const {
    COMO_LLEGAR_GOOGLE,
    COMO_LLEGAR_WAZE,
    DIRECCION,
    DIRECCION_REFERENCIA,
    HORARIO,
    HORARIO_CERRADO,
    HORARIO_NOTA,
    MAPA_EMBED,
    MENSAJES,
    NOMBRE,
  } = await datosLanding();
  return (
    <section id="ubicacion" className="bg-[var(--lp-crema)] pb-20 lg:pb-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Cinta className="lp-revela text-2xl">Dónde estamos</Cinta>
        <div className="mt-8 grid gap-5 lg:grid-cols-12">
          <div className="lp-revela overflow-hidden rounded-[1.75rem] border-[6px] border-white bg-white shadow-[0_8px_0_rgb(27_33_64/0.12)] lg:col-span-8">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.2rem] bg-[var(--lp-menta)] sm:aspect-[16/9]">
              <iframe
                src={MAPA_EMBED}
                title={`Mapa: ${NOMBRE} en ${DIRECCION.calle}, ${DIRECCION.colonia}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 size-full border-0"
              />
            </div>
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <address className="flex items-start gap-3 not-italic">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--lp-naranja)] text-white">
                  <MapPin size={26} weight="fill" aria-hidden />
                </span>
                <span className="text-base leading-snug">
                  <span className="lp-display block text-xl font-bold text-[var(--lp-indigo)]">{DIRECCION.calle}</span>
                  <span className="text-[var(--lp-tinta)]/80">
                    Col. {DIRECCION.colonia}, {DIRECCION.cp}, {DIRECCION.ciudad}, {DIRECCION.estado}
                  </span>
                  {DIRECCION_REFERENCIA && <span className="mt-1 block font-bold">{DIRECCION_REFERENCIA}</span>}
                </span>
              </address>
              <div className="flex flex-wrap gap-2">
                <a href={COMO_LLEGAR_GOOGLE} target="_blank" rel="noopener noreferrer" className={botonSecundario}>
                  <NavigationArrow size={20} weight="fill" aria-hidden />
                  Cómo llegar
                </a>
                <a href={COMO_LLEGAR_WAZE} target="_blank" rel="noopener noreferrer" className={botonSecundario}>
                  Waze
                  <ArrowSquareOut size={18} aria-hidden />
                </a>
              </div>
            </div>
          </div>

          <div
            className="lp-revela flex flex-col rounded-[1.75rem] bg-[var(--lp-indigo)] p-7 text-white shadow-[0_8px_0_var(--lp-indigo-hondo)] lg:col-span-4"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <p className="lp-display inline-flex items-center gap-2 text-2xl font-bold">
              <Clock size={28} weight="bold" aria-hidden />
              Horarios
            </p>
            <dl className="mt-5 space-y-4">
              {HORARIO.map((h) => (
                <div key={h.dias}>
                  <dt className="font-bold text-white/85">{h.dias}</dt>
                  <dd className="lp-display text-3xl font-bold tabular-nums text-[var(--lp-amarillo)]">{h.horas}</dd>
                </div>
              ))}
              {HORARIO_CERRADO && (
                <div>
                  <dt className="font-bold text-white/85">{HORARIO_CERRADO}</dt>
                  <dd className="lp-display text-2xl font-bold">Cerrado</dd>
                </div>
              )}
              {HORARIO_NOTA && (
                <div>
                  <dt className="font-bold text-white/85">Hotel y estética</dt>
                  <dd className="text-white/90">{HORARIO_NOTA}</dd>
                </div>
              )}
            </dl>
            <BotonWhatsApp mensaje={MENSAJES.general} variante="blanco" className="mt-7 self-start lg:mt-auto">
              Preguntar horario
            </BotonWhatsApp>
          </div>
        </div>
      </div>
    </section>
  );
}
