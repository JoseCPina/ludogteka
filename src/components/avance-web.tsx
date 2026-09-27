import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatearFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";

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
 * La página web como incentivo: si el negocio completa su perfil en los
 * primeros 7 días de la prueba, le queda gratis de por vida. Aquí se ve qué
 * falta y cuántos días quedan. Lo decide la base (evaluar_web_gratis(),
 * que además la otorga en el momento en que el perfil queda completo).
 */
export async function AvanceWeb({ compacto = false }: { compacto?: boolean }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("evaluar_web_gratis");
  if (error || !data) return null;
  const a = data as AvanceWebDatos;
  const zona = await zonaActual();

  if (a.ganada) {
    if (compacto) return null;
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-menta bg-menta-suave p-5">
        <div>
          <h2 className="font-bold text-n-900">Tu página web está incluida</h2>
          <p className="text-sm text-n-700">Se arma sola con tu perfil, tus servicios y tus precios.</p>
        </div>
        <Link href="/" target="_blank" className="font-semibold text-morado hover:underline">
          Ver tu página →
        </Link>
      </section>
    );
  }
  if (!a.elegible) {
    if (compacto) return null;
    const { data: web } = await supabase.from("planes").select("precio_mensual").eq("clave", "pagina_web").maybeSingle();
    return (
      <section className="rounded-xl border border-n-200 bg-white p-5">
        <h2 className="font-bold text-n-900">Página web</h2>
        <p className="text-sm text-n-700">
          Tu página pública con tus servicios, precios, fotos, horario y WhatsApp es un complemento
          {web ? ` de $${Number(web.precio_mensual).toLocaleString("es-MX")} al mes más IVA` : ""}.
        </p>
      </section>
    );
  }

  const faltan = a.pasos.filter((p) => !p.listo);
  const hechos = a.pasos.length - faltan.length;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-morado-suave bg-white p-5">
      <div>
        <h2 className="font-bold text-n-900">Gana tu página web gratis de por vida</h2>
        <p className="text-sm text-n-700">
          Completa tu perfil antes del {formatearFecha(a.fecha_limite, zona)}:{" "}
          <strong>
            {a.dias_restantes === 0 ? "hoy es el último día" : `te ${a.dias_restantes === 1 ? "queda 1 día" : `quedan ${a.dias_restantes} días`}`}
          </strong>
          . Llevas {hechos} de {a.pasos.length}.
        </p>
      </div>
      <ul className={compacto ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
        {(compacto ? faltan : a.pasos).map((p) => (
          <li key={p.clave}>
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
