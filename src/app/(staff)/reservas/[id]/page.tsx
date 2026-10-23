import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearTelefono } from "@/lib/telefono";
import { moduloDeCategoria } from "@/lib/modulos";
import { EstanciaFila } from "./estancia-fila";
import { CancelarReservaBoton } from "./cancelar-reserva-boton";
import type { Cargo, ServicioCargo } from "../cargos-seccion";
import { AvisosWhatsApp } from "@/components/avisos-whatsapp";
import { RefrescoCuenta } from "@/components/cuentas/refresco-cuenta";
import { negocioActual, negocioIdActual, zonaActual } from "@/lib/negocio/actual";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { nombresDePersonal } from "@/lib/personal/nombres";
import { describirEstancia, formatearFecha, formatearHoraNegocio } from "@/lib/formato";
import { unirNombres } from "@/lib/texto/frases";
import { diasEntre, hora12 } from "@/lib/web-negocio/horario";

const fechaLarga = (iso: string) => new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export default async function DetalleReservaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: reserva, error: errorReserva } = await supabase
    .from("reservas")
    .select("id, notas, created_at, cliente_id, clientes(nombre, telefono, distancia_base_km)")
    .eq("id", id)
    .single();

  if (errorReserva || !reserva) {
    // QA S27: un enlace con el id de una ESTANCIA (no de la reserva) lleva a su reserva en vez de dar 404.
    const { data: estancia } = await supabase.from("estancias").select("reserva_id").eq("id", id).maybeSingle();
    if (estancia?.reserva_id) redirect(`/reservas/${estancia.reserva_id}`);
    notFound();
  }

  const cliente = Array.isArray(reserva.clientes) ? reserva.clientes[0] : reserva.clientes;

  const { data: estancias, error: errorEstancias } = await supabase
    .from("estancias")
    .select(
      "id, perro_id, servicio_id, fecha_entrada, fecha_salida, estado, precio_unitario, horas, updated_at, motivo_cancelacion, cancelada_por, cancelada_at, perros(nombre), servicios(nombre, categoria, unidad)"
    )
    .eq("reserva_id", id)
    .is("deleted_at", null)
    .order("fecha_entrada");

  // QA S15: quién canceló cada estancia (con el nombre del personal, nunca el correo) y por qué.
  const canceladores = [...new Set((estancias ?? []).map((e) => e.cancelada_por as string | null).filter((x): x is string => Boolean(x)))];
  const sesionReserva = canceladores.length ? await obtenerSesionConRol() : null;
  const nombresCancel = canceladores.length
    ? await nombresDePersonal(supabase, canceladores, { esAdmin: sesionReserva?.rol === "admin", negocioId: await negocioIdActual() })
    : new Map<string, string>();
  const zonaReserva = await zonaActual();
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
      unidad: (servicio?.unidad as string) ?? "dia",
      horas: (e.horas as number | null) ?? null,
      version: (e.updated_at as string | null) ?? null,
      cancelacion: e.estado === "cancelada" && e.cancelada_at
        ? {
            quien: (e.cancelada_por ? nombresCancel.get(e.cancelada_por as string) : null) ?? "alguien del equipo",
            cuando: `${formatearFecha(e.cancelada_at as string, zonaReserva)} a las ${formatearHoraNegocio(e.cancelada_at as string, zonaReserva)}`,
            motivo: (e.motivo_cancelacion as string | null) ?? null,
          }
        : null,
    };
  });

  const cancelables = filas.filter((f) => f.estado === "reservada" || f.estado === "confirmada").length;

  // Una reserva puede mezclar categorías (una familia que deja un perro
  // en guardería y otro en hotel el mismo día): ahí ningún módulo es el
  // dueño y el "volver" va a la pantalla que ofrece los dos.
  const categorias = [...new Set(filas.map((f) => f.categoria).filter(Boolean))];
  const moduloUnico = categorias.length === 1 ? moduloDeCategoria(categorias[0]) : null;

  const estanciaIds = filas.map((f) => f.id);
  const [{ data: serviciosCargo }, { data: cargosCrudo }] = await Promise.all([
    // Solo los cargos que se pueden cobrar (con tarifa o de monto libre):
    // uno sin tarifa truena al aplicarse.
    supabase
      .from("servicios_cotizables")
      .select("id, nombre, clave, monto_libre")
      .eq("categoria", "cargo")
      .not("clave", "like", "extra_%")
      // Los cargos internos de Veterinaria (hospitalización, estimados…) no se aplican a mano aquí.
      .not("clave", "like", "vet\\_%")
      .order("orden"),
    estanciaIds.length > 0
      ? supabase
          .from("cargos_aplicados")
          .select("id, estancia_id, cantidad, precio, cancelado, motivo_cancelacion, descripcion, updated_at, servicios(nombre)")
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
      descripcion: (c.descripcion as string | null) ?? null,
      version: (c.updated_at as string | null) ?? null,
    });
    cargosPorEstancia.set(c.estancia_id as string, lista);
  }

  const serviciosCargoLista: ServicioCargo[] = (serviciosCargo ?? []).map((s) => ({
    id: s.id as string,
    nombre: s.nombre as string,
    clave: s.clave as string,
    montoLibre: Boolean(s.monto_libre),
  }));

  // «Avisar por WhatsApp» de la estancia de guardería u hotel que sigue viva (la primera).
  const viva = filas.find((f) => (f.categoria === "guarderia" || f.categoria === "hotel") && !["cancelada", "no_llego"].includes(f.estado));
  const enHotel = viva?.categoria === "hotel";
  const [negocio, { data: cupoCrudo }] = viva
    ? await Promise.all([negocioActual(), supabase.rpc("resolver_cupo_configuracion", { p_fecha: enHotel ? viva.fechaSalida : viva.fechaEntrada })])
    : [null, { data: null }];
  const cupoDia = (Array.isArray(cupoCrudo) ? cupoCrudo[0] : cupoCrudo) as { hora_apertura?: string | null; hora_cierre?: string | null } | null;
  const mascotasVivas = [...new Set(filas.filter((f) => viva && f.categoria === viva.categoria && !["cancelada", "no_llego"].includes(f.estado)).map((f) => f.perroNombre))];

  const { data: totalesCrudo } = await supabase.rpc("cuenta_totales_reserva", { p_reserva_id: id });
  const totalesFila = Array.isArray(totalesCrudo) ? totalesCrudo[0] : totalesCrudo;
  const saldo = Number(totalesFila?.saldo ?? 0);
  const totalCuenta = Number(totalesFila?.total_cuenta ?? 0);
  // QA S14: una reserva cancelada (o en la que nadie llegó) sin saldo no tiene nada que cobrar; con saldo, se dice qué
  // se debe (un cargo que sí se hizo) y con saldo a favor, que se devuelve.
  const todaCancelada = filas.length > 0 && filas.every((f) => ["cancelada", "no_llego"].includes(f.estado));
  const hayQueCobrar = saldo > 0.005;
  // R35: con todo cancelado el total de la cuenta es $0 (las líneas canceladas no suman); si se cobró algo, se ve
  // cuánto se cobró y cuánto se devolvió, para que el saldo a favor (o el cero) se entienda.
  const totalCobrado = Number(totalesFila?.total_cobrado ?? 0);
  const totalDevuelto = Number(totalesFila?.total_devuelto ?? 0);
  const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={moduloUnico ? moduloUnico.base : "/reservas"}
          className="text-sm font-semibold text-morado hover:underline"
        >
          ← {moduloUnico ? moduloUnico.etiqueta : "Reservas"}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-n-900">{cliente?.nombre ?? "Cliente"}</h1>
            <p className="text-n-600">
              {cliente?.telefono ? formatearTelefono(cliente.telefono) : ""}
            </p>
            {reserva.notas && <p className="mt-2 text-n-700">{reserva.notas}</p>}
            {viva && negocio && (
              <div className="mt-3">
                <AvisosWhatsApp
                  telefono={cliente?.telefono}
                  datos={{
                    negocio: negocio.nombre,
                    servicio: { nombre: viva.servicioNombre, categoria: enHotel ? "hotel" : "guarderia", modo: enHotel ? "noches" : "dia" },
                    mascota: mascotasVivas.length > 1 ? `${mascotasVivas.slice(0, -1).join(", ")} y ${mascotasVivas[mascotasVivas.length - 1]}` : viva.perroNombre,
                    cliente: cliente?.nombre ?? "",
                    dia: fechaLarga(viva.fechaEntrada),
                    salida: enHotel ? fechaLarga(viva.fechaSalida) : null,
                    noches: enHotel ? diasEntre(viva.fechaEntrada, viva.fechaSalida) : undefined,
                    abre: cupoDia?.hora_apertura ? hora12(cupoDia.hora_apertura) : null,
                    cierra: cupoDia?.hora_cierre ? hora12(cupoDia.hora_cierre) : null,
                  }}
                />
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <RefrescoCuenta reservaId={id} saldo={saldo} total={totalCuenta} />
            <dl className="flex flex-col items-end text-sm text-n-700" data-totales-reserva>
              <div className="flex gap-1">
                <dt>Total{todaCancelada ? " (cancelada)" : ""}:</dt>
                <dd className="font-semibold text-n-900" data-total-cuenta>{dinero(totalCuenta)}</dd>
              </div>
              {totalCobrado > 0 && (
                <div className="flex gap-1">
                  <dt>Cobrado:</dt>
                  <dd className="font-semibold text-n-900" data-total-cobrado>{dinero(totalCobrado)}</dd>
                </div>
              )}
              {totalDevuelto > 0 && (
                <div className="flex gap-1">
                  <dt>Devuelto:</dt>
                  <dd className="font-semibold text-n-900" data-total-devuelto>{dinero(totalDevuelto)}</dd>
                </div>
              )}
            </dl>
            <p className={`text-sm font-bold ${saldo > 0 ? "text-coral-oscuro" : "text-menta-oscuro"}`} data-saldo-reserva={saldo.toFixed(2)}>
              Saldo: ${Math.abs(saldo).toFixed(2)}
              {saldo < 0 ? " (a favor)" : ""}
            </p>
            {todaCancelada && (
              <p className="max-w-xs text-right text-sm text-n-700" data-reserva-cancelada-cuenta>
                {hayQueCobrar
                  ? `Reserva cancelada, pero la cuenta todavía debe $${saldo.toFixed(2)} (de un total de $${totalCuenta.toFixed(2)}): es lo que sí se cobra.`
                  : saldo < -0.005
                    ? `Reserva cancelada: hay $${(-saldo).toFixed(2)} a favor del cliente que se devuelve desde la cuenta.`
                    : "Reserva cancelada: no hay nada por cobrar."}
              </p>
            )}
            <div className="flex gap-2">
              {(!todaCancelada || hayQueCobrar || saldo < -0.005) && (
                <Link href={`/reservas/${id}/cobrar`}>
                  <Button type="button" data-cobrar-reserva>
                    {todaCancelada ? (hayQueCobrar ? `Cobrar $${saldo.toFixed(2)}` : "Ver la cuenta") : "Cobrar"}
                  </Button>
                </Link>
              )}
              {cancelables > 0 && (
                <CancelarReservaBoton reservaId={reserva.id} cancelables={cancelables} detalle={(() => { const v = filas.filter((f) => f.estado === "reservada" || f.estado === "confirmada"); return v.length === 0 ? null : v.length === 1 ? describirEstancia(v[0].servicioNombre, v[0].perroNombre, v[0].fechaEntrada, v[0].fechaSalida, v[0].categoria) : describirEstancia(unirNombres([...new Set(v.map((f) => f.servicioNombre))]), unirNombres(v.map((f) => f.perroNombre)), v[0].fechaEntrada, v[0].fechaSalida, v[0].categoria); })()} nombres={filas.filter((f) => f.estado === "reservada" || f.estado === "confirmada").map((f) => f.perroNombre)} versiones={filas.map((f) => ({ t: "estancias", i: f.id, v: f.version }))} />
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
              distanciaClienteKm={cliente?.distancia_base_km ?? null}
              cuentaCobrado={totalCobrado}
              cuentaDevuelto={totalDevuelto}
            />
          ))}
        </div>
      )}
    </div>
  );
}
