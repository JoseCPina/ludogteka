import Image from "next/image";
import Link from "next/link";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { Hueso, Marca, Rotulo } from "./comunes";
import { DIRECCION_UNA_LINEA, MENSAJES, TELEFONO_VISIBLE, linkWhatsApp } from "@/lib/landing/negocio";
import { PERROS } from "./perros";

// La banda completa, sentada en el borde del pie: los clientes de la lona.
const BANDA = [PERROS.dasha, PERROS.simon, PERROS.granDanes, PERROS.zuki, PERROS.galleta, PERROS.malinois];

export function LlamadoFinal() {
  return (
    <section className="lp-franja-amarilla relative overflow-hidden pt-20">
      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6">
        <Rotulo className="lp-revela text-5xl sm:text-6xl">Agenda por WhatsApp</Rotulo>
        <p className="lp-revela mt-5 max-w-[40ch] text-xl font-semibold text-[var(--lp-tinta)]">
          Resolvemos tus dudas y agendamos su primera visita.
        </p>
        <div className="lp-revela mt-9">
          <a
            href={linkWhatsApp(MENSAJES.general)}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-boton lp-boton-indigo lp-display inline-flex min-h-16 items-center gap-3 rounded-full px-9 text-2xl font-bold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-indigo)]"
          >
            <WhatsappLogo size={32} weight="fill" aria-hidden />
            <span className="tabular-nums">{TELEFONO_VISIBLE}</span>
          </a>
        </div>
      </div>

      {/* La banda sentada sobre el pie. */}
      <ul className="mx-auto mt-16 flex max-w-6xl items-end justify-center gap-1 px-2 sm:gap-4">
        {BANDA.map((p, i) => (
          <li key={p.alt} className="lp-revela relative w-[16%] max-w-40" style={{ "--i": i } as React.CSSProperties}>
            <Image src={p.foto} alt={p.alt} sizes="(min-width: 1024px) 160px, 16vw" className="h-auto w-full" />
            {p.nombre && (
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 sm:bottom-5">
                <Hueso className="text-[0.62rem] sm:text-sm">{p.nombre}</Hueso>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Pie() {
  return (
    <footer className="relative bg-[var(--lp-indigo)] pb-28 text-white lg:pb-12">
      <p className="lp-display bg-[var(--lp-indigo-hondo)] py-3 text-center text-lg font-bold uppercase tracking-wide sm:text-2xl">
        Precaución, perritos a bordo
      </p>
      <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
        <div>
          <span className="inline-block rounded-2xl bg-white px-4 py-2">
            <Marca />
          </span>
          <p className="mt-3 max-w-[36ch] text-base text-white/85">Guardería, hotel y estética canina en San Luis Potosí.</p>
        </div>
        <address className="text-base not-italic leading-relaxed text-white/90">
          {DIRECCION_UNA_LINEA}
          <br />
          WhatsApp{" "}
          <a
            href={linkWhatsApp(MENSAJES.general)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-white underline decoration-[var(--lp-amarillo)] decoration-2 underline-offset-4 tabular-nums"
          >
            {TELEFONO_VISIBLE}
          </a>
        </address>
      </div>
      <div className="mx-auto mt-10 flex max-w-7xl items-center justify-between gap-4 border-t border-white/20 px-4 pt-6 text-[0.9375rem] text-white sm:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} Ludogteka</p>
        <Link href="/login" className="font-semibold hover:text-white hover:underline">
          Entrar al sistema
        </Link>
      </div>
    </footer>
  );
}

// Siempre visible, abajo a la derecha: índigo con aro amarillo, como las
// cintas de la lona.
export function WhatsAppFlotante() {
  return (
    <a
      href={linkWhatsApp(MENSAJES.general)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="lp-flotante lp-boton lp-boton-indigo lp-display fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 inline-flex size-16 items-center justify-center gap-2 rounded-full ring-4 ring-[var(--lp-amarillo)] focus-visible:outline-none focus-visible:ring-white lg:bottom-6 lg:right-6 lg:size-auto lg:min-h-14 lg:px-6"
    >
      <WhatsappLogo size={32} weight="fill" aria-hidden />
      <span className="hidden text-lg font-bold lg:inline">¿Dudas? Escríbenos</span>
    </a>
  );
}

