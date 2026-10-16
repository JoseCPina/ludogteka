import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { paginaDeError } from "@/lib/http/pagina-de-error";
import { fechaLocalDeInstante, horaLocalDeInstante } from "@/lib/formato";
import { etiquetaMetodos, tarjetaValida, type Desglose } from "@/lib/reportes/desglose";

// El desglose de una cifra de Reportes en Excel: TODAS las filas de la tarjeta (con la búsqueda, si la hay), sin el tope
// de 1,000 filas de la API. La función de la base comprueba el permiso «Reportes financieros».
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tarjeta = url.searchParams.get("t") ?? "";
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  const q = url.searchParams.get("q") ?? "";
  const orden = url.searchParams.get("orden") ?? "fecha";
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  if (!tarjetaValida(tarjeta) || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return paginaDeError({ titulo: "Desglose no válido", que: "Faltan la tarjeta o las fechas del desglose.", queHacer: ["Vuelve a Reportes y toca la cifra otra vez."], status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reporte_desglose", {
    p_tarjeta: tarjeta, p_desde: desde, p_hasta: hasta, p_buscar: q || null, p_orden: orden, p_dir: dir, p_limite: null, p_desplazamiento: 0,
  });
  if (error || !data) {
    if (error) console.error("[reportes] desglose a Excel:", error.message);
    return paginaDeError({
      titulo: "No puedes abrir este desglose",
      que: "No tienes permiso para ver los reportes o la cifra no existe.",
      queHacer: ["Entra con tu cuenta y vuelve a intentarlo.", "Pide a un admin el permiso «Reportes financieros» si te corresponde."],
      status: 403,
    });
  }
  const d = data as Desglose;
  const negocio = await negocioActual();
  const zona = await zonaActual();
  const libro = new ExcelJS.Workbook();
  libro.creator = negocio.nombre;
  const hoja = libro.addWorksheet("Desglose");
  hoja.addRow([`${d.titulo} · ${negocio.nombre}`]).font = { bold: true, size: 14 };
  hoja.addRow([`Del ${desde} al ${hasta}${q ? ` · búsqueda: «${q}»` : ""}`]);
  hoja.addRow([]);
  const esDinero = d.tipo_total === "dinero";
  hoja.addRow(["Fecha", "Hora", "Cliente", "Mascota", "Concepto", "Registró", "Método", esDinero ? "Monto" : "Cantidad", "Descuento de la cuenta", "Detalle"]).font = { bold: true };
  for (const f of d.filas) {
    hoja.addRow([
      fechaLocalDeInstante(f.fecha, zona), horaLocalDeInstante(f.fecha, zona), f.cliente, f.mascota, f.concepto, f.usuario,
      etiquetaMetodos(f.metodo), Number(f.monto), Number(f.descuento), f.detalle,
    ]);
  }
  const pie = hoja.addRow(["", "", "", "", "", "", q ? "Total (filtrado)" : "Total", Number(q ? d.total_filtrado : d.total), "", ""]);
  pie.font = { bold: true };
  if (q) hoja.addRow(["", "", "", "", "", "", "Total de la tarjeta", Number(d.total)]).font = { bold: true };
  hoja.columns.forEach((c, i) => { c.width = [12, 8, 26, 20, 38, 22, 18, 14, 16, 34][i] ?? 14; });
  if (esDinero) hoja.getColumn(8).numFmt = "#,##0.00";
  hoja.getColumn(9).numFmt = "#,##0.00";
  hoja.views = [{ state: "frozen", ySplit: 4 }];
  const buffer = await libro.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="desglose-${tarjeta.replace(/[^a-z0-9_-]/gi, "-")}-${desde}-${hasta}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
