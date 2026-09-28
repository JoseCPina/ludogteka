import type { NextRequest } from "next/server";
import { leerEstado, oauthSimulado } from "@/lib/mercadopago/oauth";
import { paginaSimple } from "@/lib/http/pagina-simple";

// La autorización SIMULADA de Mercado Pago: fuera de producción y sin la
// aplicación de PeluDesk dada de alta, "Conectar Mercado Pago" llega aquí
// en vez de a Mercado Pago. Autorizar regresa con un código simulado; la
// conexión queda marcada como simulada y nada de lo que cobre mueve dinero.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!oauthSimulado()) return paginaSimple({ titulo: "No disponible", parrafos: ["Esta página solo existe en simulación."], status: 404 });
  const state = new URL(request.url).searchParams.get("state");
  if (!leerEstado(state)) return paginaSimple({ titulo: "Enlace vencido", parrafos: ["Vuelve a apretar «Conectar Mercado Pago»."], status: 400 });
  const regreso = (extra: string) => `/api/mercadopago/oauth?state=${encodeURIComponent(state!)}&${extra}`;
  return paginaSimple({
    titulo: "Mercado Pago (simulación)",
    parrafos: [
      "Simulación: no mueve dinero. Aquí es donde el dueño entraría a su cuenta de Mercado Pago y autorizaría a PeluDesk.",
      "La conexión simulada sirve para probar la terminal, los links y el webhook sin una cuenta real.",
    ],
    acciones: [
      { texto: "Autorizar (simulación)", href: regreso(`code=SIM-${Date.now().toString(36)}`), primaria: true },
      { texto: "No autorizar", href: regreso("error=access_denied") },
    ],
  });
}
