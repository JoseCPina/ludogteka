import Link from "next/link";
import { CheckCircle, Prohibit, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp, Marca } from "./comunes";
import {
  DIRECCION_UNA_LINEA,
  MENSAJES,
  REQUISITOS,
  TELEFONO_VISIBLE,
  linkWhatsApp,
} from "@/lib/landing/negocio";

export function Requisitos() {
  const si = REQUISITOS.filter((r) => r.tipo === "si");
  const no = REQUISITOS.filter((r) => r.tipo === "no");
  return (
    <section id="requisitos" className="bg-n-50 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <h2 className="lp-revela text-balance text-center text-4xl font-extrabold leading-[1.1] tracking-[-0.025em] text-n-900 sm:text-5xl">
          Requisitos para guardería y hotel
        </h2>
        <p className="lp-revela mx-auto mt-5 max-w-[50ch] text-center text-lg leading-relaxed text-n-700">
          Cuidan a tu perro y a todos los demás. Estética no los pide.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-5">
          <ul className="lp-revela space-y-4 rounded-3xl bg-white p-7 md:col-span-3">
            {si.map((r) => (
              <li key={r.texto} className="flex items-center gap-4 text-lg font-semibold text-n-900">
                <CheckCircle size={32} weight="fill" className="shrink-0 text-verde-oscuro" aria-hidden />
                {r.texto}
              </li>
            ))}
          </ul>
          <ul
            className="lp-revela space-y-4 rounded-3xl bg-naranja-suave p-7 md:col-span-2"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            {no.map((r) => (
              <li key={r.texto} className="flex items-center gap-4 text-lg font-semibold text-n-900">
                <Prohibit size={32} weight="bold" className="shrink-0 text-naranja-oscuro" aria-hidden />
                {r.texto}
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-revela mt-10 flex justify-center">
          <BotonWhatsApp mensaje={MENSAJES.requisitos}>Agendar evaluación</BotonWhatsApp>
        </div>
      </div>
    </section>
  );
}

export function LlamadoFinal() {
  return (
    <section className="relative overflow-hidden bg-azul py-20 text-white lg:py-24">
      <div className="lp-flota absolute -left-16 -top-16 size-56 rounded-full bg-turquesa/35" aria-hidden />
      <div className="lp-flota-2 absolute -bottom-24 right-[8%] size-48 rounded-full bg-amarillo" aria-hidden />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6">
        <h2 className="lp-revela text-balance text-4xl font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-5xl">
          Ven a conocernos con tu perro.
        </h2>
        <p className="lp-revela mt-5 max-w-[44ch] text-lg leading-relaxed text-white/85">
          Resolvemos tus dudas y agendamos su primera visita por WhatsApp.
        </p>
        <div className="lp-revela mt-9">
        <a
          href={linkWhatsApp(MENSAJES.general)}
          target="_blank"
          rel="noopener noreferrer"
          className="lp-boton inline-flex min-h-14 items-center gap-3 rounded-full bg-white px-8 text-lg font-bold text-verde-oscuro shadow-[0_18px_40px_-18px_rgb(20_22_31/0.6)] hover:bg-verde-suave focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-azul"
        >
          <WhatsappLogo size={28} weight="fill" aria-hidden />
          <span className="tabular-nums">{TELEFONO_VISIBLE}</span>
        </a>
        </div>
      </div>
    </section>
  );
}

export function Pie() {
  return (
    <footer className="bg-white pb-28 pt-12 lg:pb-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
        <div>
          <Marca />
          <p className="mt-3 max-w-[36ch] text-base leading-relaxed text-n-600">
            Guardería, hotel y estética canina en San Luis Potosí.
          </p>
        </div>
        <address className="text-base not-italic leading-relaxed text-n-700">
          {DIRECCION_UNA_LINEA}
          <br />
          WhatsApp{" "}
          <a
            href={linkWhatsApp(MENSAJES.general)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-azul underline decoration-2 underline-offset-4 hover:text-azul-oscuro tabular-nums"
          >
            {TELEFONO_VISIBLE}
          </a>
        </address>
      </div>
      <div className="mx-auto mt-10 flex max-w-7xl items-center justify-between gap-4 border-t border-n-200 px-4 pt-6 text-[0.9375rem] text-n-600 sm:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} Ludogteka</p>
        <Link href="/login" className="font-semibold hover:text-n-900 hover:underline">
          Entrar al sistema
        </Link>
      </div>
    </footer>
  );
}

// Siempre visible, abajo a la derecha. En escritorio enseña el texto; en
// celular es solo el círculo para no tapar contenido.
export function WhatsAppFlotante() {
  return (
    <a
      href={linkWhatsApp(MENSAJES.general)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="lp-flotante lp-boton fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 inline-flex size-16 items-center justify-center gap-2 rounded-full bg-verde-oscuro text-white shadow-[0_14px_34px_-10px_rgb(27_122_66/0.75)] hover:bg-[#155c33] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul focus-visible:ring-offset-2 lg:bottom-6 lg:right-6 lg:size-auto lg:min-h-14 lg:px-6"
    >
      <WhatsappLogo size={32} weight="fill" aria-hidden />
      <span className="hidden text-base font-bold lg:inline">¿Dudas? Escríbenos</span>
    </a>
  );
}
