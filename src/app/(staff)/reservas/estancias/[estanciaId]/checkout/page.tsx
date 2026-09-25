import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AlertaCriticaBanner } from "@/app/(staff)/perros/alerta-critica-banner";
import { formatearFechaCalendario, formatearFecha, hoyNegocio } from "@/lib/formato";
import { moduloDeCategoria } from "@/lib/modulos";
import { CheckoutForm } from "./checkout-form";
import { ConvertirHotel, type SugerenciaHotel } from "./convertir-hotel";
import { CargosSeccion, type Cargo, type ServicioCargo } from "../../../cargos-seccion";
import { zonaActual } from "@/lib/negocio/actual";

export default async function CheckoutEstanciaPage({
  params,
}: {
  params: Promise<{ estanciaId: string }>;
}) {
  const zona = await zonaActual();
  const { estanciaId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: estancia, error } = await supabase
    .from("estancias")
    .select(
      "id, perro_id, fecha_entrada, fecha_salida, estado, precio_unitario, horas, hora_entrada_real, hora_salida_real, recogido_por_nombre, recogido_por_es_dueno, perros(nombre, clientes(distancia_base_km)), servicios(nombre, categoria, unidad)"
    )
    .eq("id", estanciaId)
    .single();

  if (error || !estancia) notFound();

  const perro = Array.isArray(estancia.perros) ? estancia.perros[0] : estancia.perros;
  const clienteDePerro = perro ? (Array.isArray(perro.clientes) ? perro.clientes[0] : perro.clientes) : null;
  const distanciaClienteKm = clienteDePerro?.distancia_base_km ?? null;
  const servicio = Array.isArray(estancia.servicios) ? estancia.servicios[0] : estancia.servicios;

  if (!perro) notFound();

  const [
    { data: alertasCrudo },
    { data: alergias },
    { data: pertenencias },
    { data: serviciosCargo },
    { data: cargosCrudo },
    { data: hoyData },
  ] = await Promise.all([
    supabase
      .from("perro_alertas")
      .select("id, alerta_id, notas, catalogo_alertas(etiqueta)")
      .eq("perro_id", estancia.perro_id)
      .eq("activa", true),
    supabase
      .from("perro_alergias")
      .select("id, alergeno, gravedad")
      .eq("perro_id", estancia.perro_id)
      .is("deleted_at", null),
    supabase
      .from("estancia_pertenencias")
      .select("id, descripcion, devuelto")
      .eq("estancia_id", estanciaId)
      .is("deleted_at", null)
      .order("created_at"),
    // Solo los cargos que se pueden cobrar: uno sin tarifa truena al
    // aplicarse, y en el mostrador no es momento de descubrirlo.
    supabase
      .from("servicios_cotizables")
      .select("id, nombre, clave, monto_libre")
      .eq("categoria", "cargo")
      .order("orden"),
    supabase
      .from("cargos_aplicados")
      .select("id, cantidad, precio, cancelado, motivo_cancelacion, descripcion, servicios(nombre)")
      .eq("estancia_id", estanciaId)
      .order("created_at"),
    supabase.rpc("fecha_negocio"),
  ]);

  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);

  const esHotel = servicio?.categoria === "hotel";
  const esGuarderia = servicio?.categoria === "guarderia";
  const porHora = servicio?.unidad === "hora";
  const modulo = moduloDeCategoria(servicio?.categoria);
  const puedeCheckout = estancia.estado === "en_curso";

  // No hay "recogida tardía": si el perro de guardería sigue aquí después
  // del cierre, se queda a dormir y se cobra como noche de hotel. Se
  // sugiere, nunca se aplica solo — y los minutos se calculan en la base
  // (minutos_retraso_cierre), no comparando horas a mano aquí, mismo
  // tipo de bug que ya mordió dos veces con la zona horaria.
  let sugerenciaHotel: SugerenciaHotel | null = null;
  if (esGuarderia && puedeCheckout) {
    const [{ data: minutosData }, { data: cupoData }, { data: hotelCotizable }] = await Promise.all([
      supabase.rpc("minutos_retraso_cierre", { p_fecha: hoy }),
      supabase.rpc("resolver_cupo_configuracion", { p_fecha: hoy }),
      supabase.from("servicios_cotizables").select("id, nombre").eq("categoria", "hotel").order("orden").limit(1),
    ]);
    const minutos = minutosData as number | null;
    const cupo = Array.isArray(cupoData) ? cupoData[0] : cupoData;
    const hotel = hotelCotizable?.[0];
    if (minutos !== null && minutos > 0 && cupo?.hora_cierre) {
      sugerenciaHotel = {
        minutos,
        horaCierre: String(cupo.hora_cierre).slice(0, 5),
        hotelNombre: hotel?.nombre ?? null,
      };
    }
  }

  const cargos: Cargo[] = (cargosCrudo ?? []).map((c) => {
    const servicioCargo = Array.isArray(c.servicios) ? c.servicios[0] : c.servicios;
    return {
      id: c.id as string,
      servicioNombre: servicioCargo?.nombre ?? "—",
      cantidad: c.cantidad as number,
      precio: c.precio as number,
      cancelado: c.cancelado as boolean,
      motivoCancelacion: c.motivo_cancelacion as string | null,
      descripcion: (c.descripcion as string | null) ?? null,
    };
  });

  const serviciosCargoLista: ServicioCargo[] = (serviciosCargo ?? []).map((s) => ({
    id: s.id as string,
    nombre: s.nombre as string,
    clave: s.clave as string,
    montoLibre: Boolean(s.monto_libre),
  }));

  const alertasActivas = (alertasCrudo ?? []).map((a) => {
    const catalogo = a.catalogo_alertas as unknown as { etiqueta: string } | null;
    return { id: a.id as string, etiqueta: catalogo?.etiqueta ?? "—" };
  });
  const alergiasGraves = (alergias ?? [])
    .filter((a) => a.gravedad === "grave")
    .map((a) => ({ id: a.id as string, alergeno: a.alergeno as string }));

  // precio_unitario es tarifa por noche/día/hora, no el total (ver
  // tarifas: "el total es N × precio del tramo") — hay que multiplicar
  // por noches, o por horas si el servicio es por hora.
  const noches = Math.round(
    (new Date(estancia.fecha_salida).getTime() - new Date(estancia.fecha_entrada).getTime()) / 86400000
  );
  const cantidad = porHora ? ((estancia.horas as number | null) ?? 1) : noches;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={modulo ? `${modulo.base}/checkout` : "/reservas"}
        className="text-sm font-semibold text-morado hover:underline"
      >
        ← Check-out{modulo ? ` de ${modulo.etiqueta.toLowerCase()}` : ""}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-n-900">Check-out — {perro.nombre}</h1>
        <p className="mt-1 text-n-600">
          {servicio?.nombre} · Salida programada: {formatearFechaCalendario(estancia.fecha_salida)}
          {porHora ? ` · ${cantidad} hora${cantidad === 1 ? "" : "s"} estimada${cantidad === 1 ? "" : "s"}` : ""}
        </p>
        {porHora && puedeCheckout && (
          <p className="mt-1 text-sm text-n-500">
            Al confirmar la salida se cobran las horas reales desde el check-in, si fueron más que las estimadas.
          </p>
        )}
      </div>

      <AlertaCriticaBanner alertas={alertasActivas} alergiasGraves={alergiasGraves} tamano="grande" />

      {sugerenciaHotel && <ConvertirHotel estanciaId={estanciaId} sugerencia={sugerenciaHotel} />}

      {!puedeCheckout ? (
        <div className="rounded-lg border border-n-200 bg-n-50 p-4">
          {estancia.estado === "finalizada" ? (
            <>
              <p className="font-semibold text-n-900">
                Este perro ya salió
                {estancia.hora_salida_real ? ` el ${formatearFecha(estancia.hora_salida_real, zona)}` : ""}.
              </p>
              <p className="mt-1 text-sm text-n-600">
                Recogió: {estancia.recogido_por_nombre ?? "—"}
                {estancia.recogido_por_es_dueno === false ? " (persona autorizada, no el dueño)" : ""}
              </p>
            </>
          ) : (
            <p className="font-semibold text-n-900">
              Este perro todavía no hace check-in — no se puede hacer check-out.
            </p>
          )}
        </div>
      ) : (
        <CheckoutForm
          estanciaId={estanciaId}
          esHotel={esHotel}
          fechaEntrada={estancia.fecha_entrada}
          fechaSalida={estancia.fecha_salida}
          pertenenciasIniciales={pertenencias ?? []}
        />
      )}

      <div className="border-t border-n-200 pt-4">
        <CargosSeccion
          estanciaId={estanciaId}
          cargosIniciales={cargos}
          serviciosCargo={puedeCheckout ? serviciosCargoLista : []}
          precioBase={estancia.precio_unitario * cantidad}
          distanciaClienteKm={distanciaClienteKm}
        />
      </div>
    </div>
  );
}
