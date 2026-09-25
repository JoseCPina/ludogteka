import Image, { type StaticImageData } from "next/image";
import { PawPrint, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { datosLanding } from "@/lib/landing/negocio";

// Piezas del lenguaje de la camioneta. Todo es Server Component: la
// landing no manda JavaScript propio al navegador.

// El nombre como en la barda del patio y la lona: "lu" y "teka" en
// índigo, "dog" en naranja, redondo y en minúsculas.
export function Marca({ className = "", grande = false }: { className?: string; grande?: boolean }) {
  return (
    <span
      className={`lp-display inline-flex items-baseline font-bold leading-none tracking-[-0.02em] ${
        grande ? "text-5xl" : "text-[1.7rem]"
      } ${className}`}
    >
      <span style={{ color: "var(--lp-indigo)" }}>lu</span>
      <span style={{ color: "var(--lp-naranja)" }}>dog</span>
      <span style={{ color: "var(--lp-indigo)" }}>teka</span>
    </span>
  );
}

// El único botón de contacto de la página: siempre WhatsApp, siempre con
// el mensaje de la sección ya escrito.
export async function BotonWhatsApp({
  mensaje,
  children,
  className = "",
  tamano = "normal",
  variante = "indigo",
}: {
  mensaje: string;
  children: React.ReactNode;
  className?: string;
  tamano?: "normal" | "grande";
  variante?: "indigo" | "blanco";
}) {
  const { linkWhatsApp } = await datosLanding();
  const alto = tamano === "grande" ? "min-h-14 px-7 text-lg" : "min-h-12 px-6 text-base";
  return (
    <a
      href={linkWhatsApp(mensaje)}
      target="_blank"
      rel="noopener noreferrer"
      className={`lp-boton lp-boton-${variante} lp-display inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full font-bold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-indigo)] ${alto} ${className}`}
    >
      <WhatsappLogo size={tamano === "grande" ? 26 : 22} weight="fill" aria-hidden />
      {children}
    </a>
  );
}

// Título "de lona": blanco con contorno índigo.
export function Rotulo({
  como: Etiqueta = "h2",
  children,
  className = "",
}: {
  como?: "h1" | "h2" | "h3" | "p";
  children: React.ReactNode;
  className?: string;
}) {
  return <Etiqueta className={`lp-rotulo text-balance ${className}`}>{children}</Etiqueta>;
}

export function Cinta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`lp-cinta inline-flex items-center justify-center rounded-xl px-5 py-2 text-xl ${className}`}>
      {children}
    </span>
  );
}

export function Hueso({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`lp-hueso text-sm ${className}`}>{children}</span>;
}

// Tarjeta de la lona: marco blanco, fondo menta, el perro recortado que
// rebasa el marco por arriba, su nombre en un hueso y el servicio en una
// cinta índigo.
export function TarjetaPerro({
  foto,
  nombre,
  alt,
  cinta,
  alto = "h-64",
  altoPerro = "h-[118%]",
  sizes,
  className = "",
  estilo,
}: {
  foto: StaticImageData;
  nombre?: string;
  alt: string;
  cinta?: React.ReactNode;
  alto?: string;
  altoPerro?: string;
  sizes: string;
  className?: string;
  estilo?: React.CSSProperties;
}) {
  return (
    <figure className={`lp-tarjeta ${className}`} style={estilo}>
      <div className={`lp-tarjeta-fondo ${alto}`}>
        <Image src={foto} alt={alt} sizes={sizes} className={`lp-tarjeta-perro w-auto ${altoPerro} object-contain object-bottom`} />
        {nombre && (
          <figcaption className="absolute bottom-3 right-5">
            <Hueso>{nombre}</Hueso>
          </figcaption>
        )}
      </div>
      {cinta && <div className="-mb-6 mt-3 flex justify-center">{cinta}</div>}
    </figure>
  );
}

// La ola entre franjas, como la curva turquesa/amarillo de la lona.
export function Ola({ color, className = "", invertida = false }: { color: string; className?: string; invertida?: boolean }) {
  return (
    <svg
      viewBox="0 0 1440 90"
      preserveAspectRatio="none"
      aria-hidden
      className={`block h-10 w-full sm:h-16 ${invertida ? "rotate-180" : ""} ${className}`}
    >
      <path d="M0,58 C240,6 520,6 760,42 C1000,78 1240,78 1440,30 L1440,90 L0,90 Z" fill={color} />
    </svg>
  );
}

// La banda índigo de "Precaución, perritos a bordo". Corre despacio; el
// contenido va duplicado para que el ciclo no tenga salto.
export function BandaPerritos({ frases }: { frases: string[] }) {
  const tramo = (oculto: boolean) => (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={oculto || undefined}>
      {frases.map((f, i) => (
        <li key={`${f}-${i}`} className="flex items-center gap-8 whitespace-nowrap">
          <span>{f}</span>
          <PawPrint size={22} weight="fill" className="text-[var(--lp-amarillo)]" aria-hidden />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="lp-banda overflow-hidden bg-[var(--lp-indigo)] py-3 text-white" aria-label={frases.join(". ")}>
      <div className="lp-banda-pista lp-display flex w-max text-lg font-bold uppercase tracking-wide sm:text-xl">
        {tramo(false)}
        {tramo(true)}
      </div>
    </div>
  );
}
