import { EnlacePestana } from "@/components/ui/enlace-pestana";

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
        <EnlacePestana key={p.clave} href={p.href} activo={p.clave === activa}>
          {p.texto}
        </EnlacePestana>
      ))}
    </nav>
  );
}
