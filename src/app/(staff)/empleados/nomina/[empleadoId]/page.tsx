import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { METODOS_PAGO, moneda, quincenaDe } from "@/lib/empleados/textos";
import type { Desglose, PagoNomina } from "@/lib/empleados/tipos";
import { FormularioAccion } from "@/components/formulario-accion";
import { ListaPagos, VistaDesglose } from "../../nomina-vistas";
import { registrarPago } from "../../nomina-actions";
import { zonaActual } from "@/lib/negocio/actual";

// El periodo de un empleado: desglose visible, y admin (o quien tenga
// «Nómina») lo marca pagado con método y fecha. Lo que se guarda es el
// cálculo que la base vuelve a hacer al registrar.
export default async function NominaEmpleadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ empleadoId: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const zona = await zonaActual();
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "nomina")) redirect("/empleados");
  const { empleadoId } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);
  const q = quincenaDe(hoy);
  const desde = sp.desde || q.desde;
  const hasta = sp.hasta || q.hasta;

  const { data: empleado } = await supabase.from("empleados").select("id, nombre, puesto").eq("id", empleadoId).is("deleted_at", null).maybeSingle();
  if (!empleado) notFound();
  const [{ data: calculo, error }, { data: pagos }] = await Promise.all([
    supabase.rpc("calcular_nomina", { p_empleado_id: empleadoId, p_desde: desde, p_hasta: hasta }),
    supabase.from("nomina_pagos").select("*").eq("empleado_id", empleadoId).is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  const d = calculo as Desglose | null;
  const yaPagado = (d?.avisos ?? []).some((a) => a.startsWith("Ya hay un pago"));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/empleados/nomina?desde=${desde}&hasta=${hasta}`} className="text-sm font-semibold text-morado hover:underline">
          ← Nómina
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">{empleado.nombre}</h1>
        <p className="mt-1 text-n-600">
          {empleado.puesto} ·{" "}
          <Link href={`/empleados/${empleadoId}`} className="font-semibold text-morado hover:underline">
            Ver ficha
          </Link>
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-n-200 bg-white p-4">
        <Field label="Desde" name="desde" type="date" defaultValue={desde} />
        <Field label="Hasta" name="hasta" type="date" defaultValue={hasta} />
        <Button type="submit" variante="secundario">Calcular</Button>
      </form>

      {error || !d ? (
        <Alert variante="error" titulo="No se pudo calcular">{error?.message}</Alert>
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-n-900">
            {formatearFechaCalendario(desde)} al {formatearFechaCalendario(hasta)}
          </h2>
          <VistaDesglose d={d} />
          {hasta > hoy ? (
            <Alert variante="advertencia" titulo="Este periodo todavía no termina">
              Es una proyección: los días que faltan todavía no tienen asistencia. Se paga cuando termine, o{" "}
              <Link href={`/empleados/nomina/${empleadoId}?desde=${desde}&hasta=${hoy}`} className="font-semibold underline">
                calcula hasta hoy
              </Link>
              .
            </Alert>
          ) : yaPagado ? (
            <p className="text-sm text-n-600">Este periodo ya tiene un pago. Si está mal, reviértelo abajo y vuelve a pagarlo.</p>
          ) : d.total < 0 ? (
            <Alert variante="advertencia" titulo="Los adelantos son más que lo que se le debe">
              Paga un periodo más largo o cancela un adelanto desde su ficha.
            </Alert>
          ) : (
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <h3 className="mb-3 font-bold text-n-900">Marcar pagado: {moneda(d.total)}</h3>
              <FormularioAccion accion={registrarPago.bind(null, empleadoId, desde, hasta)} textoBoton="Marcar pagado" variante="exito" textoExito="Pago registrado">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label="Método" name="metodo" defaultValue="efectivo">
                    {Object.entries(METODOS_PAGO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <Field label="Fecha de pago" name="fecha_pago" type="date" defaultValue={hoy} required />
                </div>
                <Field label="Notas (opcional)" name="notas" />
                <p className="text-xs text-n-500">
                  Un pago no se borra ni se edita: si sale mal, se revierte con un movimiento inverso y se vuelve a pagar.
                </p>
              </FormularioAccion>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Pagos registrados</h2>
        <ListaPagos zona={zona} pagos={(pagos ?? []) as PagoNomina[]} puedeRevertir />
      </section>
    </div>
  );
}
