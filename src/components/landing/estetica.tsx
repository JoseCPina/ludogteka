import Image from "next/image";
import { Check, Info, Scissors } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp } from "./comunes";
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
import fotoEstetica from "./fotos/estetica.jpg";
import fotoBano from "./fotos/estetica-bano.jpg";

function FilaPrecio({ servicio, monto }: { servicio: string; monto?: number }) {
  if (monto == null) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-base text-n-600">{servicio}</dt>
      <dd className="text-xl font-extrabold tabular-nums text-n-900">{pesos(monto)}</dd>
    </div>
  );
}

export function Estetica() {
  return (
    <section id="estetica" className="relative overflow-hidden bg-amarillo-suave py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <h2 className="lp-revela text-balance text-4xl font-extrabold leading-[1.1] tracking-[-0.025em] text-n-900 sm:text-5xl">
              Estética: sale limpio, peinado y feliz.
            </h2>
            <p className="lp-revela mt-5 max-w-[48ch] text-lg leading-relaxed text-n-700">
              El baño estético completo incluye todo esto:
            </p>
            <ul className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {ESTETICA_INCLUYE.map((item, i) => (
                <li
                  key={item}
                  className="lp-revela flex items-start gap-3 text-base font-semibold text-n-800"
                  style={{ "--i": i % 2 } as React.CSSProperties}
                >
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-verde text-n-900">
                    <Check size={14} weight="bold" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <dl className="lp-revela mt-8 grid gap-3 text-base sm:grid-cols-2">
              <div className="rounded-2xl bg-white/70 p-4">
                <dt className="font-bold text-n-900">Rapado</dt>
                <dd className="mt-1 text-n-600">{ESTETICA_RAPADO_DIFERENCIA}</dd>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <dt className="font-bold text-n-900">Exprés</dt>
                <dd className="mt-1 text-n-600">{ESTETICA_EXPRES_INCLUYE}</dd>
              </div>
            </dl>
          </div>

          {/* Dos fotos encimadas, un poco giradas: se lee como álbum, no
              como catálogo. */}
          <div className="relative mx-auto w-full max-w-md lg:col-span-6 lg:max-w-none">
            <div className="lp-revela relative ml-auto w-[78%] rotate-2 overflow-hidden rounded-[2rem] border-[6px] border-white shadow-[0_30px_60px_-30px_rgb(138_99_0/0.55)]">
              <Image
                src={fotoEstetica}
                alt="Pomerania con una toalla en la cabeza mientras le cepillan el pelo"
                placeholder="blur"
                sizes="(min-width: 1024px) 460px, 78vw"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div
              className="lp-revela relative -mt-24 w-[48%] -rotate-3 overflow-hidden rounded-[2rem] border-[6px] border-white shadow-[0_30px_60px_-30px_rgb(138_99_0/0.55)] sm:-mt-32"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              <Image
                src={fotoBano}
                alt="Perro mojado recién bañado, secándose con un guante de toalla"
                placeholder="blur"
                sizes="(min-width: 1024px) 290px, 48vw"
                className="aspect-[4/5] w-full object-cover"
              />
            </div>
            <div
              className="lp-flota absolute -right-4 bottom-8 grid size-20 place-items-center rounded-full bg-naranja text-white sm:size-24"
              aria-hidden
            >
              <Scissors size={36} weight="bold" />
            </div>
          </div>
        </div>

        <h3 className="lp-revela mt-20 text-3xl font-extrabold tracking-[-0.02em] text-n-900 sm:text-4xl">
          Precios por raza
        </h3>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ESTETICA_GRUPOS.map((g, i) => (
            <li
              key={g.nombre}
              className="lp-revela flex flex-col rounded-3xl bg-white p-6 shadow-[0_1px_0_rgb(138_99_0/0.08)]"
              style={{ "--i": i % 3 } as React.CSSProperties}
            >
              <p className="text-lg font-bold leading-snug text-n-900">{g.nombre}</p>
              <dl className="mt-auto divide-y divide-n-100 pt-4">
                <FilaPrecio servicio="Baño estético" monto={g.bano} />
                <FilaPrecio servicio="Rapado" monto={g.rapado} />
                <FilaPrecio servicio="Exprés" monto={g.expres} />
              </dl>
            </li>
          ))}
          <li className="lp-revela rounded-3xl bg-white p-6 sm:col-span-2 lg:col-span-3">
            <p className="text-lg font-bold text-n-900">
              Por talla, solo para perros de{" "}
              <span className="underline decoration-amarillo decoration-4 underline-offset-4">pelo corto</span> sin
              grupo de raza
            </p>
            <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-3">
              {ESTETICA_POR_TALLA.map((t) => (
                <div key={t.talla} className="rounded-2xl bg-n-50 p-4">
                  <dt className="text-base font-bold text-n-800">{t.talla}</dt>
                  <dd className="mt-2">
                    <dl className="divide-y divide-n-200">
                      <FilaPrecio servicio="Baño estético" monto={t.bano} />
                      <FilaPrecio servicio="Exprés" monto={t.expres} />
                    </dl>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        </ul>

        <div className="lp-revela mt-6 flex items-start gap-3 rounded-2xl border-l-4 border-amarillo bg-white p-5 text-base leading-relaxed text-n-700">
          <Info size={24} weight="duotone" className="mt-0.5 shrink-0 text-amarillo-oscuro" aria-hidden />
          <p>
            <strong className="text-n-900">El precio puede aumentar según el tipo de pelo y el cuidado previo.</strong>{" "}
            En razas chicas con pelo maltratado, el baño estético es de{" "}
            <strong className="tabular-nums text-n-900">{pesos(ESTETICA_PELO_MALTRATADO)}</strong>.
          </p>
        </div>

        <div className="lp-revela mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <BotonWhatsApp mensaje={MENSAJES.estetica}>Agendar estética</BotonWhatsApp>
          <p className="text-base text-n-700">Estética no pide los requisitos de guardería.</p>
        </div>
      </div>
    </section>
  );
}
