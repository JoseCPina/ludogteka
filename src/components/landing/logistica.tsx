import Image from "next/image";
import {
  ArrowSquareOut,
  CalendarCheck,
  Car,
  ChatCircleText,
  Clock,
  HouseLine,
  MapPin,
  NavigationArrow,
  Path,
} from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp } from "./comunes";
import {
  COMO_LLEGAR_GOOGLE,
  COMO_LLEGAR_WAZE,
  DIRECCION,
  HORARIO,
  MAPA_EMBED,
  MENSAJES,
  PRECIO_KM_RECOLECCION,
  RECOLECCION_REGLAS,
  ZONAS_COBERTURA,
  pesos,
} from "@/lib/landing/negocio";
import fotoAuto from "./fotos/recoleccion.jpg";

const PASOS_RECOLECCION = [
  {
    icono: ChatCircleText,
    titulo: "Nos escribes",
    texto: "Mándanos por WhatsApp tu dirección y el día, con 24 horas de anticipación.",
  },
  {
    icono: Path,
    titulo: "Te cotizamos",
    texto: `Calculamos los kilómetros hasta tu casa, a ${pesos(PRECIO_KM_RECOLECCION)} por km.`,
  },
  {
    icono: HouseLine,
    titulo: "Vamos y volvemos",
    texto: "Pasamos por tu perro y te lo regresamos a casa.",
  },
];

const enlaceSecundario =
  "lp-boton inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-n-300 bg-white px-5 text-base font-bold text-n-900 hover:border-n-500 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul focus-visible:ring-offset-2";

export function Logistica() {
  return (
    <section id="ubicacion" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="lp-revela text-balance text-4xl font-extrabold leading-[1.1] tracking-[-0.025em] text-n-900 sm:text-5xl">
          Dónde estamos y cómo llegar.
        </h2>

        <div className="mt-10 grid gap-4 lg:grid-cols-12">
          {/* Mapa + dirección */}
          <div className="lp-revela overflow-hidden rounded-3xl border border-n-200 bg-n-50 lg:col-span-8">
            <div className="relative aspect-[4/3] bg-n-100 sm:aspect-[16/9]">
              <iframe
                src={MAPA_EMBED}
                title={`Mapa: Ludogteka en ${DIRECCION.calle}, ${DIRECCION.colonia}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 size-full border-0"
              />
            </div>
            <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <address className="flex items-start gap-3 not-italic">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-naranja-suave text-naranja-oscuro">
                  <MapPin size={24} weight="fill" aria-hidden />
                </span>
                <span className="text-base leading-snug">
                  <span className="block text-lg font-bold text-n-900">{DIRECCION.calle}</span>
                  <span className="text-n-600">
                    Col. {DIRECCION.colonia}, {DIRECCION.cp}
                    <br />
                    {DIRECCION.ciudad}, {DIRECCION.estado}
                  </span>
                  <span className="mt-2 block font-semibold text-n-800">
                    Sobre Calzada de Guadalupe, cerca de la FENAPO.
                  </span>
                </span>
              </address>
              <div className="flex flex-wrap gap-2">
                <a href={COMO_LLEGAR_GOOGLE} target="_blank" rel="noopener noreferrer" className={enlaceSecundario}>
                  <NavigationArrow size={20} weight="fill" className="text-azul" aria-hidden />
                  Cómo llegar
                </a>
                <a href={COMO_LLEGAR_WAZE} target="_blank" rel="noopener noreferrer" className={enlaceSecundario}>
                  Waze
                  <ArrowSquareOut size={18} aria-hidden />
                </a>
              </div>
            </div>
          </div>

          {/* Horarios */}
          <div className="lp-revela flex flex-col rounded-3xl bg-turquesa-suave p-7 lg:col-span-4" style={{ "--i": 1 } as React.CSSProperties}>
            <span className="grid size-12 place-items-center rounded-2xl bg-white text-turquesa-oscuro">
              <Clock size={28} weight="duotone" aria-hidden />
            </span>
            <h3 className="mt-5 text-2xl font-bold text-n-900">Horarios</h3>
            <dl className="mt-5 space-y-5 text-base">
              {HORARIO.map((h) => (
                <div key={h.dias}>
                  <dt className="font-bold text-n-900">{h.dias}</dt>
                  <dd className="text-2xl font-extrabold tabular-nums text-n-900">{h.horas}</dd>
                </div>
              ))}
              <div>
                <dt className="font-bold text-n-900">Domingo</dt>
                <dd className="text-n-700">Cerrado</dd>
              </div>
              <div>
                <dt className="font-bold text-n-900">Hotel y estética</dt>
                <dd className="mt-0.5 text-n-700">
                  Con cita. Escríbenos y acordamos la hora de entrega y de recogida. El hotel no
                  entrega perros los domingos.
                </dd>
              </div>
            </dl>
            <BotonWhatsApp mensaje={MENSAJES.general} className="mt-7 self-start lg:mt-auto">
              Preguntar horario
            </BotonWhatsApp>
          </div>

          {/* Recolección a domicilio */}
          <div id="recoleccion" className="lp-revela overflow-hidden rounded-3xl bg-verde-suave lg:col-span-12">
            <div className="grid lg:grid-cols-12">
              <div className="relative min-h-56 lg:col-span-5 lg:min-h-full">
                <Image
                  src={fotoAuto}
                  alt="Perro viajando en el asiento de un coche, mirando por la ventana"
                  placeholder="blur"
                  sizes="(min-width: 1024px) 500px, 100vw"
                  className="absolute inset-0 size-full object-cover"
                />
              </div>
              <div className="p-7 sm:p-10 lg:col-span-7">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <h3 className="flex items-center gap-3 text-3xl font-extrabold tracking-[-0.02em] text-n-900">
                    <Car size={34} weight="duotone" className="text-verde-oscuro" aria-hidden />
                    Recolección a domicilio
                  </h3>
                  <p className="tabular-nums">
                    <span className="text-5xl font-extrabold tracking-[-0.03em] text-n-900">{pesos(PRECIO_KM_RECOLECCION)}</span>
                    <span className="ml-1 text-lg font-semibold text-n-700">por km</span>
                  </p>
                </div>

                <ol className="relative mt-9 grid gap-7 md:grid-cols-3 md:gap-5">
                  {/* La ruta se dibuja al llegar a la sección: de tu casa
                      a la nuestra y de regreso. */}
                  <span
                    className="lp-ruta absolute left-[1.375rem] top-2 bottom-2 w-1 rounded-full bg-verde md:left-6 md:top-[1.375rem] md:bottom-auto md:h-1 md:w-[calc(66.667%+0.833rem)]"
                    aria-hidden
                  />
                  {PASOS_RECOLECCION.map(({ icono: Icono, titulo, texto }) => (
                    <li key={titulo} className="relative flex gap-4 md:flex-col md:gap-3">
                      <span className="grid size-12 shrink-0 place-items-center rounded-full border-4 border-verde-suave bg-verde-oscuro text-white">
                        <Icono size={22} weight="bold" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-lg font-bold text-n-900">{titulo}</span>
                        <span className="mt-0.5 block text-base leading-snug text-n-700">{texto}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <ul className="mt-9 grid gap-2 sm:grid-cols-3">
                  {RECOLECCION_REGLAS.map((r) => (
                    <li key={r} className="flex items-start gap-2 rounded-2xl bg-white/70 p-3.5 text-base font-semibold leading-snug text-n-900">
                      <CalendarCheck size={22} weight="duotone" className="mt-px shrink-0 text-verde-oscuro" aria-hidden />
                      {r}
                    </li>
                  ))}
                </ul>

                <ZonasCobertura />

                <BotonWhatsApp mensaje={MENSAJES.recoleccion} className="mt-8">
                  Cotizar recolección
                </BotonWhatsApp>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Preparado para cuando el negocio defina sus zonas: con la lista vacía
// invita a preguntar; con zonas, las enseña.
function ZonasCobertura() {
  if (ZONAS_COBERTURA.length === 0) {
    return (
      <p className="mt-4 rounded-2xl bg-white/70 p-4 text-base leading-relaxed text-n-700">
        <strong className="text-n-900">¿Llegamos a tu colonia?</strong> Pregúntanos por WhatsApp
        y te decimos si te cubrimos y cuánto sale.
      </p>
    );
  }
  return (
    <div className="mt-9">
      <h4 className="text-lg font-bold text-n-900">Zonas de cobertura</h4>
      <ul className="mt-3 flex flex-wrap gap-2">
        {ZONAS_COBERTURA.map((z) => (
          <li key={z.nombre} className="rounded-full bg-white px-4 py-2 text-base font-semibold text-n-800">
            {z.nombre}
            {z.nota && <span className="ml-1 font-normal text-n-600">({z.nota})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
