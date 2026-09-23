import { PawPrint, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { linkWhatsApp } from "@/lib/landing/negocio";

// Piezas compartidas de la landing. Todo aquí es Server Component: la
// landing no manda JavaScript propio al navegador.

export function Marca({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="grid size-9 place-items-center rounded-full bg-azul text-white">
        <PawPrint size={22} weight="fill" aria-hidden />
      </span>
      <span className="text-[1.375rem] font-extrabold tracking-[-0.02em] text-n-900">
        Ludogteka
      </span>
    </span>
  );
}

// El único botón de contacto de la página: siempre WhatsApp, siempre con
// el mensaje de la sección ya escrito.
export function BotonWhatsApp({
  mensaje,
  children,
  className = "",
  tamano = "normal",
}: {
  mensaje: string;
  children: React.ReactNode;
  className?: string;
  tamano?: "normal" | "grande";
}) {
  const alto = tamano === "grande" ? "min-h-14 px-7 text-lg" : "min-h-12 px-5 text-base";
  return (
    <a
      href={linkWhatsApp(mensaje)}
      target="_blank"
      rel="noopener noreferrer"
      className={`lp-boton inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-verde-oscuro font-bold text-white shadow-[0_8px_24px_-10px_rgb(27_122_66/0.7)] hover:bg-[#155c33] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul focus-visible:ring-offset-2 ${alto} ${className}`}
    >
      <WhatsappLogo size={tamano === "grande" ? 26 : 22} weight="fill" aria-hidden />
      {children}
    </a>
  );
}

export function Precio({
  monto,
  unidad,
  className = "",
}: {
  monto: string;
  unidad?: string;
  className?: string;
}) {
  return (
    <span className={`tabular-nums ${className}`}>
      <span className="font-extrabold tracking-[-0.02em] text-n-900">{monto}</span>
      {unidad && <span className="ml-1 text-base font-semibold text-n-600">{unidad}</span>}
    </span>
  );
}
