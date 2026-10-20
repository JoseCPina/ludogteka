import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Paso = { clave: string; titulo: string; listo: boolean; href: string };
export type AvanceWebDatos = {
  pasos: Paso[];
  completo: boolean;
  ganada: boolean;
  fecha_limite: string;
  dias_restantes: number;
  elegible: boolean;
};

/**
 * La página web viene incluida en el plan único: aquí se ve qué le falta al
 * perfil para que la página se vea completa. Lo calcula la base
 * (evaluar_web_gratis() sigue dando los pasos; ya no hay fecha límite ni premio).
 */
export async function AvanceWeb({ compacto = false }: { compacto?: boolean }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("evaluar_web_gratis");
  if (error || !data) return null;
  const a = data as AvanceWebDatos;

  const faltan = a.pasos.filter((p) => !p.listo);
  if (faltan.length === 0) {
    if (compacto) return null;
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-menta bg-menta-suave p-5">
        <div>
          <h2 className="font-bold text-n-900">Tu página web está lista</h2>
          <p className="text-sm text-n-700">Viene incluida en tu plan y se arma sola con tu perfil, tus servicios y tus precios.</p>
        </div>
        <Link href="/" target="_blank" className="font-semibold text-morado hover:underline">
          Ver tu página →
        </Link>
      </section>
    );
  }

  const hechos = a.pasos.length - faltan.length;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-morado-suave bg-white p-5">
      <div>
        <h2 className="font-bold text-n-900">Completa tu perfil y tu página web queda lista</h2>
        <p className="text-sm text-n-700">
          Tu página web viene incluida en tu plan, sin costo aparte. Llevas {hechos} de {a.pasos.length} pasos.
        </p>
      </div>
      <ul className={compacto ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
        {(compacto ? faltan : a.pasos).map((p) => (
          <li key={p.clave} data-paso-web={p.clave} data-listo={p.listo ? "si" : "no"}>
            <Link
              href={p.href}
              className={`inline-flex items-center gap-2 text-sm ${p.listo ? "text-n-600" : "font-semibold text-morado hover:underline"}`}
            >
              <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full text-xs ${p.listo ? "bg-menta text-morado" : "border-[1.5px] border-borde"}`}>
                {p.listo ? "✓" : ""}
              </span>
              {p.titulo}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
