import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { moneda, quincenaDe } from "@/lib/empleados/textos";
import type { Desglose } from "@/lib/empleados/tipos";
import { SubnavEmpleados } from "../subnav";

// La nómina del periodo: cuánto le toca a cada quien y si ya se le pagó.
// El detalle y el "marcar pagado" están en la página de cada empleado.
export default async function NominaPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "nomina")) redirect("/empleados");
  const supabase = await createSupabaseServerClient();
  const sp = await searchParams;
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();
  const q = quincenaDe(hoy);
  const desde = sp.desde || q.desde;
  const hasta = sp.hasta || q.hasta;

  const [{ data: empleados }, { data: pagos }, { count: porAprobar }] = await Promise.all([
    supabase.from("empleados").select("id, nombre, puesto, fecha_ingreso, fecha_baja").is("deleted_at", null).order("nombre"),
    supabase.from("nomina_pagos").select("id, empleado_id, tipo, reverso_de, periodo_desde, periodo_hasta, total").is("deleted_at", null),
    supabase.from("ausencias").select("id", { count: "exact", head: true }).eq("estado", "solicitada").is("deleted_at", null),
  ]);
  // Quien trabajó en algún día del periodo.
  const enPeriodo = (empleados ?? []).filter((e) => e.fecha_ingreso <= hasta && (!e.fecha_baja || e.fecha_baja >= desde));
  const calculos = await Promise.all(
    enPeriodo.map((e) => supabase.rpc("calcular_nomina", { p_empleado_id: e.id, p_desde: desde, p_hasta: hasta }))
  );
  const revertidos = new Set((pagos ?? []).filter((p) => p.reverso_de).map((p) => p.reverso_de));
  const pagoVigente = (empleadoId: string) =>
    (pagos ?? []).find(
      (p) => p.empleado_id === empleadoId && p.tipo === "pago" && !revertidos.has(p.id) && p.periodo_desde <= hasta && p.periodo_hasta >= desde
    );
  const total = calculos.reduce((s, c) => s + Number((c.data as Desglose | null)?.total ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Empleados</h1>
        <p className="mt-1 text-n-600">
          Nómina del periodo: sueldo, días trabajados, faltas, comisiones, propinas y adelantos. Nada se paga solo: se revisa y se
          marca pagado en cada empleado.
        </p>
      </div>
      <SubnavEmpleados activa="nomina" puedeNomina ausenciasPorAprobar={porAprobar ?? 0} />

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-n-200 bg-white p-4">
        <Field label="Desde" name="desde" type="date" defaultValue={desde} />
        <Field label="Hasta" name="hasta" type="date" defaultValue={hasta} />
        <Button type="submit" variante="secundario">Calcular</Button>
      </form>

      {(porAprobar ?? 0) > 0 && (
        <p className="rounded-md border border-amarillo bg-amarillo-suave px-4 py-2 text-sm text-amarillo-oscuro">
          Hay {porAprobar} {porAprobar === 1 ? "ausencia" : "ausencias"} por aprobar: mientras no se aprueben, esos días cuentan como falta.{" "}
          <Link href="/empleados/ausencias" className="font-semibold underline">
            Revisarlas
          </Link>
        </p>
      )}

      {enPeriodo.length === 0 ? (
        <p className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-8 text-center text-n-600">Nadie trabajó en este periodo.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-n-100 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                <th className="px-3 py-2">Empleado</th>
                <th className="px-3 py-2 text-right">Días / faltas</th>
                <th className="px-3 py-2 text-right">Comisiones</th>
                <th className="px-3 py-2 text-right">Propinas</th>
                <th className="px-3 py-2 text-right">Adelantos</th>
                <th className="px-3 py-2 text-right">A pagar</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {enPeriodo.map((e, i) => {
                const d = calculos[i].data as Desglose | null;
                const pagado = pagoVigente(e.id);
                return (
                  <tr key={e.id} className="border-t border-n-200">
                    <td className="px-3 py-2">
                      <Link href={`/empleados/nomina/${e.id}?desde=${desde}&hasta=${hasta}`} className="font-semibold text-azul hover:underline">
                        {e.nombre}
                      </Link>
                      <span className="block text-xs text-n-500">{e.puesto}</span>
                    </td>
                    {d ? (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {d.dias.trabajados} / {d.dias.faltas}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{moneda(d.comisiones)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{moneda(d.propinas)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{d.adelantos ? `−${moneda(d.adelantos)}` : "—"}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">{moneda(d.total)}</td>
                      </>
                    ) : (
                      <td colSpan={5} className="px-3 py-2 text-naranja-oscuro">
                        {calculos[i].error?.message ?? "No se pudo calcular"}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {pagado ? (
                        <span className="rounded-full bg-verde-suave px-2.5 py-1 text-xs font-semibold text-verde-oscuro">
                          Pagado ({formatearFechaCalendario(pagado.periodo_desde)}–{formatearFechaCalendario(pagado.periodo_hasta)})
                        </span>
                      ) : !d?.esquema ? (
                        <span className="rounded-full bg-amarillo-suave px-2.5 py-1 text-xs font-semibold text-amarillo-oscuro">Sin esquema de pago</span>
                      ) : (
                        <span className="rounded-full bg-n-100 px-2.5 py-1 text-xs font-semibold text-n-700">Por pagar</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-n-300">
                <td colSpan={5} className="px-3 py-2 text-right font-bold text-n-900">
                  Total del periodo
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-n-900">{moneda(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
