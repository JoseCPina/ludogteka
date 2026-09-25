import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { salirPlataforma } from "../acciones";

const SECCIONES = [
  { href: "/plataforma", texto: "Negocios" },
  { href: "/plataforma/soporte", texto: "Soporte" },
  { href: "/plataforma/catalogos", texto: "Catálogos compartidos" },
];

export default async function AdminPlataformaLayout({ children }: { children: React.ReactNode }) {
  const { user } = await exigirPlataforma();
  return (
    <>
      <header className="border-b border-n-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-azul">PeluDesk</span>
            <span className="text-sm text-n-500">Administración de la plataforma</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-n-600">{user.email}</span>
            <form action={salirPlataforma}>
              <button type="submit" className="font-semibold text-n-600 hover:underline">Salir</button>
            </form>
          </div>
        </div>
        <nav aria-label="Secciones" className="mx-auto max-w-5xl px-4 sm:px-6">
          <ul className="flex gap-1 overflow-x-auto">
            {SECCIONES.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="inline-block rounded-t-md px-3 py-2 text-sm font-semibold text-n-700 hover:bg-n-100">
                  {s.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
