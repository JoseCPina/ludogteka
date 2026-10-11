import Link from "next/link";

const PESTANAS = [
  { href: "/veterinaria/recetas", clave: "recetas", texto: "Recetas" },
  { href: "/veterinaria/recetas/sitpv", clave: "sitpv", texto: "Registro SITPV (Grupo I)" },
  { href: "/veterinaria/recetas/especial", clave: "especial", texto: "Recetario especial" },
  { href: "/veterinaria/libro-control", clave: "libro", texto: "Libro de control" },
] as const;

/** Las cuatro vistas de Recetas y controlados. */
export function NavRecetas({ activa }: { activa: (typeof PESTANAS)[number]["clave"] }) {
  return (
    <nav aria-label="Recetas y controlados" className="flex flex-wrap gap-2 print:hidden">
      {PESTANAS.map((p) => (
        <Link
          key={p.clave}
          href={p.href}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${p.clave === activa ? "border-morado bg-morado-suave text-morado" : "border-n-200 bg-white text-n-700 hover:bg-n-50"}`}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
