import Link from "next/link";
import { SignIn } from "@phosphor-icons/react/dist/ssr";
import { Marca } from "./comunes";
import { cargarNegocioLanding } from "@/lib/landing/negocio";

const SECCIONES = [
  { href: "#guarderia", texto: "Guardería" },
  { href: "#hotel", texto: "Hotel" },
  { href: "#estetica", texto: "Estética" },
  { href: "#recoleccion", texto: "Recolección" },
  { href: "#ubicacion", texto: "Ubicación" },
];

export async function Encabezado() {
  const { nombre } = await cargarNegocioLanding();
  return (
    <header className="sticky top-0 z-30 border-b-4 border-[var(--lp-amarillo)] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href="#inicio" aria-label={`${nombre}, ir al inicio`} className="rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--lp-indigo)]">
          <Marca />
        </a>
        <nav aria-label="Secciones" className="hidden lg:block">
          <ul className="lp-display flex items-center gap-1">
            {SECCIONES.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  className="rounded-full px-3.5 py-2 text-[1.05rem] font-semibold text-[var(--lp-indigo)] transition-colors hover:bg-[var(--lp-menta)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--lp-indigo)]"
                >
                  {s.texto}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* Acceso al sistema: discreto a propósito. */}
        <Link
          href="/login"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[0.9375rem] font-semibold text-[var(--lp-tinta)]/70 transition-colors hover:bg-[var(--lp-menta)] hover:text-[var(--lp-tinta)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--lp-indigo)]"
        >
          <SignIn size={18} weight="bold" aria-hidden />
          Entrar
        </Link>
      </div>
    </header>
  );
}
