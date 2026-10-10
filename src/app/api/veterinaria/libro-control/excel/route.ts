import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { paginaDeError } from "@/lib/http/pagina-de-error";
import { NOMBRE_TIPO_MOVIMIENTO, type Libro } from "@/lib/veterinaria/recetas";

// El libro de control en Excel. La función de la base comprueba el permiso «Ver libro de control» y
// anota la lectura; aquí solo se arma el archivo.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  const insumo = url.searchParams.get("insumo");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || (insumo && !/^[0-9a-f-]{36}$/.test(insumo))) {
    return paginaDeError({ titulo: "Rango no válido", que: "Faltan las fechas del libro o no están completas.", queHacer: ["Vuelve al libro de control y elige el rango otra vez."], status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_libro_control", { p_desde: desde, p_hasta: hasta, p_insumo: insumo || null });
  if (error || !data) {
    if (error) console.error("[veterinaria] libro de control:", error.message);
    return paginaDeError({
      titulo: "No puedes abrir el libro de control",
      que: "No tienes permiso para verlo o el módulo Veterinaria está apagado.",
      queHacer: ["Entra con tu cuenta y vuelve a intentarlo.", "Pide a un admin el permiso «Ver libro de control» si te corresponde."],
      status: 403,
    });
  }
  const libro = data as Libro;
  const negocio = await negocioActual();
  const libroXls = new ExcelJS.Workbook();
  libroXls.creator = negocio.nombre;
  const hoja = libroXls.addWorksheet("Libro de control");
  hoja.addRow([`Libro de control · ${negocio.nombre}`]).font = { bold: true, size: 14 };
  hoja.addRow([`Del ${libro.desde} al ${libro.hasta}`]);
  hoja.addRow([]);
  const cabecera = hoja.addRow(["Fecha", "Hora", "Producto", "Laboratorio", "Lote", "Caducidad", "Movimiento", "Folio de receta", "Entrada", "Salida", "Saldo", "Unidad", "Paciente", "Médico", "Nota"]);
  cabecera.font = { bold: true };
  for (const m of libro.movimientos) {
    hoja.addRow([m.fecha, m.hora, m.producto, m.laboratorio ?? "", m.lote, m.caducidad ?? "", NOMBRE_TIPO_MOVIMIENTO[m.tipo] ?? m.tipo, m.folio ?? "", m.entrada ?? "", m.salida ?? "", m.saldo, m.unidad ?? "", m.paciente ?? "", m.medico ?? "", m.motivo ?? ""]);
  }
  hoja.columns.forEach((c, i) => { c.width = [11, 7, 28, 18, 16, 12, 16, 16, 10, 10, 10, 10, 22, 22, 28][i] ?? 14; });
  hoja.views = [{ state: "frozen", ySplit: 4 }];
  const resumen = libroXls.addWorksheet("Saldo inicial");
  resumen.addRow(["Producto", "Unidad", `Saldo al ${libro.desde}`]).font = { bold: true };
  for (const s of libro.saldos_iniciales) resumen.addRow([s.producto, s.unidad ?? "", s.saldo_inicial]);
  resumen.columns = [{ width: 34 }, { width: 12 }, { width: 18 }];
  const buffer = await libroXls.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="libro-de-control-${desde}-${hasta}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
