import Link from "next/link";

export function VolverBienvenida() {
  return (
    <Link href="/bienvenida" className="text-sm font-semibold text-morado hover:underline">
      ← Bienvenida
    </Link>
  );
}
