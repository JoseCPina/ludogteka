import Link from "next/link";
import { SignIn } from "@phosphor-icons/react/dist/ssr";
import { Marca } from "./comunes";

const SECCIONES = [
  { href: "#guarderia", texto: "Guardería" },
  { href: "#hotel", texto: "Hotel" },
  { href: "#estetica", texto: "Estética" },
  { href: "#ubicacion", texto: "Ubicación" },
  { href: "#requisitos", texto: "Requisitos" },
];

export function Encabezado() {
  return (
    <header className="sticky top-0 z-30 border-b border-n-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href="#inicio" aria-label="Ludogteka, ir al inicio" className="rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul">
          <Marca />
        </a>
        <nav aria-label="Secciones" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {SECCIONES.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  className="rounded-full px-3.5 py-2 text-[0.9375rem] font-semibold text-n-700 transition-colors hover:bg-n-100 hover:text-n-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul"
                >
                  {s.texto}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* Acceso al sistema: discreto a propósito. La página es para el
            dueño que todavía no es cliente; staff y clientes ya saben
            dónde entrar. */}
        <Link
          href="/login"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[0.9375rem] font-semibold text-n-600 transition-colors hover:bg-n-100 hover:text-n-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul"
        >
          <SignIn size={18} weight="bold" aria-hidden />
          Entrar
        </Link>
      </div>
      <div className="lp-cinta h-[3px]" aria-hidden />
    </header>
  );
}
