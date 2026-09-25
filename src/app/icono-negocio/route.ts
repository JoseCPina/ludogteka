import { NextResponse } from "next/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { esPlataforma } from "@/lib/negocio/actual";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// El ícono de la pestaña de un negocio que no tiene uno propio en su
// configuración (negocios.marca.favicon): su inicial sobre su color
// (marca.color). En el dominio de la plataforma, la "P" de PeluDesk.
export const dynamic = "force-dynamic";

function escapar(t: string) {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export async function GET() {
  let inicial = "P";
  let color = "#4b3f72";
  if (!(await esPlataforma())) {
    const negocio = await cargarNegocioLanding();
    inicial = (negocio.nombre.trim()[0] ?? "P").toUpperCase();
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("negocio_publico");
    const marca = ((Array.isArray(data) ? data[0] : data) as { marca?: { color?: string } } | null)?.marca;
    if (marca?.color && /^#[0-9a-fA-F]{6}$/.test(marca.color)) color = marca.color;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#fff">${escapar(inicial)}</text></svg>`;
  return new NextResponse(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
  });
}
