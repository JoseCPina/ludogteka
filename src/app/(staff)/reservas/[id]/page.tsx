import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearTelefono } from "@/lib/telefono";
import { EstanciaFila } from "./estancia-fila";
import { CancelarReservaBoton } from "./cancelar-reserva-boton";
import type { Cargo, ServicioCargo } from "../cargos-seccion";

export default async function DetalleReservaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: reserva, error: errorReserva } = await supabase
    .from("reservas")
    .select("id, notas, created_at, cliente_id, clientes(nombre, telefono)")
    .eq("id", id)
    .single();

  if (errorReserva || !reserva) notFound();

  const cliente = Array.isArray(reserva.clientes) ? reserva.clientes[0] : reserva.clientes;

  const { data: estancias, error: errorEstancias } = await supabase
    .from("estancias")
    .select(
      "id, perro_id, servicio_id, fecha_entrada, fecha_salida, estado, precio_unitario, perros(nombre), servicios(nombre, categoria)"
    )
    .eq("reserva_id", id)
    .is("deleted_at", null)
    .order("fecha_entrada");

  const filas = (estancias ?? []).map((e) => {
    const perro = Array.isArray(e.perros) ? e.perros[0] : e.perros;
    const servicio = Array.isArray(e.servicios) ? e.servicios[0] : e.servicios;
    return {
      id: e.id as string,
      perroNombre: perro?.nombre ?? "—",
      servicioNombre: servicio?.nombre ?? "—",
      categoria: (servicio?.categoria as string) ?? "",
      fechaEntrada: e.fecha_entrada as string,
      fechaSalida: e.fecha_salida as string,
      estado: e.estado as string,
      precioUnitario: e.precio_unitario as number,
    };
  });

  const cancelables = filas.filter((f) => f.estado === "reservada" || f.estado === "confirmada").length;

  const estanciaIds = filas.map((f) => f.id);
  const [{ data: serviciosCargo }, { data: cargosCrudo }] = await Promise.all([
    supabase
      .from("servicios")
      .select("id, nombre")
      .eq("categoria", "cargo")
      .is("deleted_at", null)
      .order("orden"),
    estanciaIds.length > 0
      ? supabase
          .from("cargos_aplicados")
          .select("id, estancia_id, cantidad, precio, cancelado, motivo_cancelacion, servicios(nombre)")
          .in("estancia_id", estanciaIds)
          .order("created_at")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const cargosPorEstancia = new Map<string, Cargo[]>();
  for (const c of cargosCrudo ?? []) {
    const servicio = Array.isArray(c.servicios) ? c.servicios[0] : c.servicios;
    const lista = cargosPorEstancia.get(c.estancia_id as string) ?? [];
    lista.push({
      id: c.id as string,
      servicioNombre: servicio?.nombre ?? "—",
      cantidad: c.cantidad as number,
      precio: c.precio as number,
      cancelado: c.cancelado as boolean,
      motivoCancelacion: c.motivo_cancelacion as string | null,
    });
    cargosPorEstancia.set(c.estancia_id as string, lista);
  }

  const serviciosCargoLista: ServicioCargo[] = (serviciosCargo ?? []).map((s) => ({
    id: s.id as string,
    nombre: s.nombre as string,
  }));

  const { data: totalesCrudo } = await supabase.rpc("cuenta_totales_reserva", { p_reserva_id: id });
  const totalesFila = Array.isArray(totalesCrudo) ? totalesCrudo[0] : totalesCrudo;
  const saldo = Number(totalesFila?.saldo ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/reservas" className="text-sm font-semibold text-azul hover:underline">
          ← Reservas
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-n-900">{cliente?.nombre ?? "Cliente"}</h1>
            <p className="text-n-600">
              {cliente?.telefono ? formatearTelefono(cliente.telefono) : ""}
            </p>
            {reserva.notas && <p className="mt-2 text-n-700">{reserva.notas}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className={`text-sm font-bold ${saldo > 0 ? "text-naranja-oscuro" : "text-verde-oscuro"}`}>
              Saldo: ${saldo.toFixed(2)}
              {saldo < 0 ? " (a favor)" : ""}
            </p>
            <div className="flex gap-2">
              <Link href={`/reservas/${id}/cobrar`}>
                <Button type="button">Cobrar</Button>
              </Link>
              {cancelables > 0 && (
                <CancelarReservaBoton reservaId={reserva.id} cancelables={cancelables} />
              )}
            </div>
          </div>
        </div>
      </div>

      {errorEstancias ? (
        <Alert variante="error" titulo="No pudimos cargar las estancias">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : filas.length === 0 ? (
        <p className="text-n-600">Esta reserva no tiene perros.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filas.map((f) => (
            <EstanciaFila
              key={f.id}
              fila={f}
              cargosIniciales={cargosPorEstancia.get(f.id) ?? []}
              serviciosCargo={serviciosCargoLista}
            />
          ))}
        </div>
      )}
    </div>
  );
}
