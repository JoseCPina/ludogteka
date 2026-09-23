import { Info, PawPrint, Scissors } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp, Cinta, TarjetaPerro } from "./comunes";
import { PERROS } from "./perros";
import {
  ESTETICA_EXPRES_INCLUYE,
  ESTETICA_GRUPOS,
  ESTETICA_INCLUYE,
  ESTETICA_PELO_MALTRATADO,
  ESTETICA_POR_TALLA,
  ESTETICA_RAPADO_DIFERENCIA,
  MENSAJES,
  pesos,
} from "@/lib/landing/negocio";

function Fila({ servicio, monto }: { servicio: string; monto?: number }) {
  if (monto == null) return null;
  return (
    <div className="flex items-baseline gap-2 py-1.5">
      <dt className="text-base font-semibold text-[var(--lp-tinta)]/75">{servicio}</dt>
      <span className="flex-1 border-b-2 border-dotted border-[var(--lp-tinta)]/20" aria-hidden />
      <dd className="lp-display text-2xl font-bold tabular-nums text-[var(--lp-tinta)]">{pesos(monto)}</dd>
    </div>
  );
}

// Estética como la pizarra de precios de una estética de barrio: cada
// grupo de raza con su cinta índigo y sus precios con puntitos.
export function Estetica() {
  return (
    <section id="estetica" className="relative bg-[var(--lp-crema)] py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Cinta className="lp-revela gap-2 text-2xl">
              <Scissors size={24} weight="bold" aria-hidden />
              Estética
            </Cinta>
            <h2 className="lp-revela lp-display mt-5 text-balance text-4xl font-bold leading-[1.05] text-[var(--lp-indigo)] sm:text-5xl">
              Sale limpio, peinado y feliz.
            </h2>
            <TarjetaPerro
              foto={PERROS.miel.foto}
              alt={PERROS.miel.alt}
              alto="h-56"
              altoPerro={PERROS.miel.altoEnTarjeta}
              sizes="(min-width: 1024px) 320px, 70vw"
              className="lp-revela-giro mt-20 w-[78%] max-w-sm rotate-[-2deg] sm:w-[55%] lg:w-[62%]"
            />
          </div>
          <div className="lp-revela rounded-[1.75rem] border-[3px] border-dashed border-[var(--lp-turquesa)] bg-white p-6 lg:col-span-6">
            <p className="lp-display text-xl font-bold text-[var(--lp-indigo)]">El baño estético incluye</p>
            <ul className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2">
              {ESTETICA_INCLUYE.map((item) => (
                <li key={item} className="flex items-start gap-2 text-base font-semibold">
                  <PawPrint size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--lp-turquesa-hondo)]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid gap-2 border-t-2 border-[var(--lp-menta)] pt-4 text-base sm:grid-cols-2">
              <div>
                <dt className="lp-display font-bold text-[var(--lp-indigo)]">Rapado</dt>
                <dd className="text-[var(--lp-tinta)]/80">{ESTETICA_RAPADO_DIFERENCIA}</dd>
              </div>
              <div>
                <dt className="lp-display font-bold text-[var(--lp-indigo)]">Exprés</dt>
                <dd className="text-[var(--lp-tinta)]/80">{ESTETICA_EXPRES_INCLUYE}</dd>
              </div>
            </dl>
          </div>
        </div>

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ESTETICA_GRUPOS.map((g, i) => (
            <li
              key={g.nombre}
              className="lp-revela flex flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-[0_6px_0_rgb(27_33_64/0.12)]"
              style={{ "--i": i % 3 } as React.CSSProperties}
            >
              <p className="lp-display bg-[var(--lp-indigo)] px-5 py-3 text-lg font-bold leading-snug text-white">{g.nombre}</p>
              <dl className="flex flex-1 flex-col justify-end px-5 py-4">
                <Fila servicio="Baño estético" monto={g.bano} />
                <Fila servicio="Rapado" monto={g.rapado} />
                <Fila servicio="Exprés" monto={g.expres} />
              </dl>
            </li>
          ))}
          <li className="lp-revela overflow-hidden rounded-[1.5rem] bg-white shadow-[0_6px_0_rgb(27_33_64/0.12)] sm:col-span-2 lg:col-span-3">
            <p className="lp-display bg-[var(--lp-turquesa-hondo)] px-5 py-3 text-lg font-bold text-white">
              Por talla, solo para perros de pelo corto sin grupo de raza
            </p>
            <dl className="grid gap-x-8 px-5 py-4 sm:grid-cols-3">
              {ESTETICA_POR_TALLA.map((t) => (
                <div key={t.talla}>
                  <dt className="lp-display text-lg font-bold text-[var(--lp-indigo)]">{t.talla}</dt>
                  <dd>
                    <dl>
                      <Fila servicio="Baño estético" monto={t.bano} />
                      <Fila servicio="Exprés" monto={t.expres} />
                    </dl>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        </ul>

        <div className="lp-revela mt-6 flex items-start gap-3 rounded-[1.25rem] bg-[var(--lp-amarillo)] p-5 text-lg">
          <Info size={26} weight="bold" className="mt-0.5 shrink-0 text-[var(--lp-indigo)]" aria-hidden />
          <p>
            <strong>El precio puede aumentar según el tipo de pelo y el cuidado previo.</strong> En razas
            chicas con pelo maltratado, el baño estético es de{" "}
            <strong className="tabular-nums">{pesos(ESTETICA_PELO_MALTRATADO)}</strong>.
          </p>
        </div>

        <div className="lp-revela mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <BotonWhatsApp mensaje={MENSAJES.estetica}>Agendar estética</BotonWhatsApp>
          <p className="text-lg font-semibold text-[var(--lp-tinta)]/75">Estética no pide los requisitos de guardería.</p>
        </div>
      </div>
    </section>
  );
}
