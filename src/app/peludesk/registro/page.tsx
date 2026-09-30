import type { Metadata } from "next";
import Link from "next/link";
import { LogoPeluDesk } from "@/components/marca/peludesk";
import { AvisoSimplificado } from "@/components/peludesk/aviso-simplificado";
import { PieSitio } from "@/components/peludesk/sitio";
import { PARAMETROS_ORIGEN, type ParametroOrigen } from "@/lib/peludesk/origen";
import { metaPagina } from "@/lib/peludesk/seo";
import { RegistroForm } from "./registro-form";

export const metadata: Metadata = metaPagina({
  titulo: "Prueba PeluDesk gratis 15 días",
  descripcion: "Abre tu guardería, hotel o estética canina en PeluDesk. 15 días gratis, sin tarjeta.",
  ruta: "/registro",
});

export default async function RegistroPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const origen: Partial<Record<ParametroOrigen, string>> = {};
  for (const k of PARAMETROS_ORIGEN) {
    const v = Array.isArray(q[k]) ? q[k][0] : q[k];
    if (v) origen[k] = v.slice(0, 300);
  }
  return (
    <div className="bg-crema">
    <main id="contenido" className="min-h-[100dvh]">
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-8 sm:px-6 md:grid-cols-[1fr_minmax(0,26rem)] md:gap-16 md:py-14">
        <div className="flex flex-col gap-6">
          <Link href="/" aria-label="PeluDesk, inicio" className="w-fit">
            <LogoPeluDesk tamano={34} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-4xl">Prueba PeluDesk 15 días, gratis</h1>
            <p className="mt-3 max-w-[48ch] text-n-700">
              Con tu nombre, el de tu negocio y tu teléfono abrimos tu cuenta en este momento. Entras directo a tu negocio
              vacío y te guiamos para dejarlo listo.
            </p>
          </div>
          <ol className="flex max-w-[48ch] flex-col gap-3 text-n-800">
            {[
              "Tu negocio queda en su propia dirección: tunegocio.peludesk.mx.",
              "Tú eres la administración: das de alta a tu equipo y a tus clientes.",
              "Completa tu perfil en los primeros 7 días y tu página web queda gratis de por vida.",
              "No pedimos tarjeta. Al terminar los 15 días tu información se queda y puedes seguir consultándola.",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-menta text-sm font-bold text-morado">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-n-600">
            ¿Quieres verlo antes?{" "}
            <Link href="/#demo" className="font-semibold text-morado hover:underline">
              Explora la demo
            </Link>
            .
          </p>
        </div>
        <section className="relative rounded-2xl border border-n-200 bg-white p-6 shadow-[0_1px_2px_rgb(75_63_114/0.06)] sm:p-8">
          <RegistroForm origen={origen} />
        </section>
      </div>
      <div className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6">
        <AvisoSimplificado compacto className="max-w-[60ch]" />
      </div>
    </main>
    <PieSitio />
    </div>
  );
}
