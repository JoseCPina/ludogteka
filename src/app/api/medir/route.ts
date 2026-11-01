import { consultasDe, medirActivo } from "@/lib/medicion/consultas";

// Lo que anotó el contador de consultas de una petición (solo con PELUDESK_MEDIR=1; ver src/lib/medicion/consultas.ts).
// La lee scripts/auditoria/tiempo-panel-dev.mjs con el id que mandó en `x-peludesk-medir`. Sin medición, texto y 404
// (una ruta /api que se abre en el navegador nunca responde JSON para fallar).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!medirActivo()) return new Response("La medición de consultas está apagada (se prende con PELUDESK_MEDIR=1 al arrancar la app en desarrollo).", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return new Response("Falta el id de la petición medida.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  const r = consultasDe(id);
  if (!r) return new Response("No hay nada anotado con ese id (la petición no llevó el encabezado o ya pasaron más de 10 minutos).", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return Response.json(r, { headers: { "cache-control": "no-store" } });
}
