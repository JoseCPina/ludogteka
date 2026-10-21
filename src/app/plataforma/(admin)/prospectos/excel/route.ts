import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { consultaProspectos, leerFiltros, type Prospecto } from "@/lib/prospectos/consulta";
import { textoCanal, textoEtapa, textoGiro } from "@/lib/prospectos/textos";

// Los prospectos de /plataforma/prospectos en Excel, con los mismos filtros de la pantalla y TODAS las filas
// (de 1,000 en 1,000: la API corta ahí). Solo la administración de PeluDesk (la RLS lo vuelve a exigir).
// Sin paginaDeError: esa página es de un negocio y en el dominio de la plataforma no hay negocio.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await sesionPlataforma();
  if (!s) {
    return new NextResponse("Tu sesión de administración de PeluDesk terminó o no tienes acceso. Vuelve a entrar y descárgalo otra vez.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const f = leerFiltros(Object.fromEntries(new URL(req.url).searchParams));
  const filas: Prospecto[] = [];
  for (let desde = 0; desde < 100_000; desde += 1000) {
    const { data, error } = await consultaProspectos(s.supabase, f).range(desde, desde + 999);
    if (error) {
      console.error("[prospectos] excel:", error.message);
      return new NextResponse("No se pudo armar el Excel: la base no contestó. Intenta de nuevo en un minuto.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    filas.push(...((data ?? []) as unknown as Prospecto[]));
    if ((data ?? []).length < 1000) break;
  }
  const libro = new ExcelJS.Workbook();
  libro.creator = "PeluDesk";
  const hoja = libro.addWorksheet("Prospectos");
  const cab = hoja.addRow(["Nombre", "Giro", "Ciudad", "Dirección", "Teléfono", "WhatsApp", "Correo", "Instagram", "Facebook", "Web", "Calificación", "Reseñas", "Fuente", "Alta", "Etapa", "Último canal", "Último contacto", "Ya es de PeluDesk", "Notas"]);
  cab.font = { bold: true };
  for (const p of filas) {
    hoja.addRow([
      p.nombre, textoGiro(p.giro), p.ciudad, p.direccion ?? "", p.telefono ?? "", p.whatsapp ?? "", p.correo ?? "", p.instagram ?? "", p.facebook ?? "", p.web ?? "",
      p.calificacion ?? "", p.resenas ?? "", p.fuente === "google_places" ? "Google Maps" : p.fuente === "anuncio_meta" ? "Anuncio de Meta" : "A mano", p.created_at.slice(0, 10), textoEtapa(p.etapa),
      textoCanal(p.canal_ultimo_contacto), p.ultimo_contacto_at?.slice(0, 10) ?? "", p.negocio_cliente_id ? "Sí" : "No", p.notas ?? "",
    ]);
  }
  hoja.columns.forEach((c, i) => { c.width = [34, 12, 18, 40, 16, 14, 28, 32, 32, 32, 12, 10, 12, 12, 12, 12, 14, 10, 40][i] ?? 14; });
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await libro.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="prospectos-peludesk.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
