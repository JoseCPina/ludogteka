import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { AlertaCriticaBanner } from "@/app/(staff)/perros/alerta-critica-banner";
import { ResumenSanitario, type EstadoRequisitoItem } from "@/app/(staff)/perros/resumen-sanitario";
import { NotaSoloEstetica } from "@/app/(staff)/perros/nota-solo-estetica";
import { formatearFecha, formatearFechaCalendario, horaLocalDeInstante } from "@/lib/formato";
import { CitaDetalle, type RecetaItem } from "./cita-detalle";
import { CorregirServicio } from "./corregir-servicio";
import type { Estilista } from "../selector-estilista";
import { zonaActual } from "@/lib/negocio/actual";

const ESTADO_HISTORIAL: Record<string, string> = {
  reservada: "antes de empezar",
  confirmada: "antes de empezar",
  en_curso: "con el servicio en curso",
  finalizada: "corrección de un servicio terminado",
};

const ETIQUETA_CAMBIO: Record<string, string> = {
  reprogramacion: "Reprogramada",
  cancelacion: "Cancelada",
  no_llego: "No se presentó",
  eliminacion: "Eliminada",
  tarifa_guarderia: "Tarifa de guardería",
};

export default async function CitaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ citaId: string }>;
  searchParams: Promise<{ reprogramar?: string }>;
}) {
  const zona = await zonaActual();
  const { citaId } = await params;
  const abrirReprogramar = (await searchParams).reprogramar === "1";
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: cita, error } = await supabase
    .from("citas_estetica")
    .select(
      "id, perro_id, servicio_id, tamano_id, empleado_id, estancia_id, inicio, fin, estado, precio, recargo, recargo_motivo, fuera_de_horario, entregado_por_nombre, recogido_por_nombre, recogido_por_es_dueno, tarifa_guarderia, tarifa_guarderia_modo, tarifa_guarderia_servicio_id, perros(nombre), servicio_nombre, servicios!citas_estetica_servicio_id_fkey(nombre)"
    )
    .eq("id", citaId)
    .is("deleted_at", null)
    .single();

  if (error || !cita) notFound();

  const perro = Array.isArray(cita.perros) ? cita.perros[0] : cita.perros;
  const servicio = Array.isArray(cita.servicios) ? cita.servicios[0] : cita.servicios;

  if (!perro) notFound();

  const puedeCorregirServicio =
    (sesion?.rol === "admin" || sesion?.rol === "recepcion") &&
    tienePermiso(sesion, "corregir_servicio") &&
    !["cancelada", "no_llego"].includes(cita.estado);

  const [{ data: estadoSanitario }, { data: alertasCrudo }, { data: alergias }, { data: empleado }, { data: usaGh }, { data: asignables }, { data: historialCrudo }, { data: correccionesCrudo }, { data: serviciosCorregibles }, { data: gruposPrecio }, { data: cambiosCrudo }, { data: configTarifa }] =
    await Promise.all([
      supabase
        .from("perro_requisitos_sanitarios_estado")
        .select("tipo_requisito_id, clave, etiqueta, es_critica, ultima_fecha_aplicacion, fecha_vencimiento, estado")
        .eq("perro_id", cita.perro_id),
      supabase
        .from("perro_alertas")
        .select("id, alerta_id, notas, catalogo_alertas(etiqueta)")
        .eq("perro_id", cita.perro_id)
        .eq("activa", true),
      supabase.from("perro_alergias").select("id, alergeno, gravedad").eq("perro_id", cita.perro_id).is("deleted_at", null),
      supabase.rpc("listar_personal_estetica").then((r) => ({
        data: ((r.data ?? []) as { id: string; nombre: string }[])
          .filter((e) => e.id === cita.empleado_id)
          .map((e) => ({ nombre_completo: e.nombre }))[0] ?? null,
      })),
      supabase.from("perros_con_guarderia_hotel").select("perro_id").eq("perro_id", cita.perro_id).maybeSingle(),
      supabase.rpc("estilistas_asignables"),
      supabase.rpc("historial_asignaciones_cita", { p_cita_id: citaId }),
      supabase.rpc("historial_correcciones_servicio_cita", { p_cita_id: citaId }),
      // De servicios_cotizables: solo lo que se puede cobrar de verdad.
      puedeCorregirServicio
        ? supabase.from("servicios_cotizables").select("id, nombre").eq("categoria", "estetica").order("orden")
        : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
      puedeCorregirServicio
        ? supabase.from("grupos_raza").select("id, nombre").is("deleted_at", null).order("orden")
        : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
      supabase.rpc("historial_cambios_cita", { p_cita_id: citaId }),
      supabase.from("tarifa_guarderia_config").select("activa, servicio_tarifa_id, servicios_incluidos").is("deleted_at", null).maybeSingle(),
    ]);
  const cambios = (cambiosCrudo ?? []) as {
    id: string;
    cuando: string;
    tipo: string;
    motivo: string | null;
    estado_antes: string;
    estado_despues: string;
    inicio_antes: string;
    inicio_despues: string;
    por_nombre: string;
    detalle: { precio_antes?: number; precio_despues?: number } | null;
  }[];
  const tarifaConfig = configTarifa as { activa: boolean; servicio_tarifa_id: string | null; servicios_incluidos: string[] } | null;
  const tarifaAplicable = Boolean(tarifaConfig?.activa && tarifaConfig.servicios_incluidos.includes(cita.servicio_id as string));
  const { data: servicioTarifa } = cita.tarifa_guarderia_servicio_id
    ? await supabase.from("servicios").select("nombre").eq("id", cita.tarifa_guarderia_servicio_id).maybeSingle()
    : { data: null };
  const correcciones = (correccionesCrudo ?? []) as {
    id: string;
    cuando: string;
    servicio_anterior: string;
    servicio_nuevo: string;
    precio_anterior: number;
    precio_nuevo: number;
    diferencia: number;
    estado_cita: string;
    motivo: string;
    por_nombre: string;
    tipo_ajuste: string;
    saldo_actual: number | null;
  }[];
  const estilistas: Estilista[] = ((asignables ?? []) as { id: string; nombre: string }[]).map((e) => ({ id: e.id, nombre: e.nombre }));
  const historial = (historialCrudo ?? []) as {
    id: string;
    cuando: string;
    de_nombre: string;
    a_nombre: string;
    estado_cita: string;
    motivo: string | null;
    por_nombre: string;
  }[];
  const aplicanRequisitos = Boolean(usaGh);
  const traePendientes = ((estadoSanitario ?? []) as EstadoRequisitoItem[]).some((i) =>
    ["vencida", "sin_registro"].includes(i.estado)
  );

  let recetaItems: RecetaItem[] = [];
  if (cita.tamano_id) {
    const { data: recetaCrudo } = await supabase
      .from("recetas_consumo")
      .select("insumo_id, cantidad_consumo, insumos(nombre, unidades_medida!unidad_consumo_id(etiqueta))")
      .eq("servicio_id", cita.servicio_id)
      .eq("tamano_id", cita.tamano_id)
      .is("deleted_at", null);

    recetaItems = (recetaCrudo ?? []).map((r) => {
      const insumo = r.insumos as unknown as { nombre: string; unidades_medida: { etiqueta: string } | null } | null;
      return {
        insumo_id: r.insumo_id,
        insumo_nombre: insumo?.nombre ?? "—",
        unidad_etiqueta: insumo?.unidades_medida?.etiqueta ?? "",
        cantidad_sugerida: Number(r.cantidad_consumo),
      };
    });
  }

  const alertasActivas = (alertasCrudo ?? []).map((a) => {
    const catalogo = a.catalogo_alertas as unknown as { etiqueta: string } | null;
    return { id: a.id as string, etiqueta: catalogo?.etiqueta ?? "—" };
  });
  const alergiasGraves = (alergias ?? [])
    .filter((a) => a.gravedad === "grave")
    .map((a) => ({ id: a.id as string, alergeno: a.alergeno as string }));

  const puedeEditar =
    sesion?.rol === "admin" || sesion?.rol === "recepcion" || sesion?.user.id === cita.empleado_id;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/estetica" className="text-sm font-semibold text-morado hover:underline">
        ← Estética
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-n-900">
          {servicio?.nombre ?? (cita.servicio_nombre as string | null) ?? "Servicio"} — {perro.nombre}
        </h1>
        <p className="mt-1 text-n-600">
          {formatearFechaCalendario(cita.inicio)} · {horaLocalDeInstante(cita.inicio, zona)}
          {cita.fin ? ` – ${horaLocalDeInstante(cita.fin, zona)}` : ""} · {cita.empleado_id ? (empleado?.nombre_completo ?? "—") : "Sin asignar"}
        </p>
        {cita.fuera_de_horario && (
          <p className="mt-1 inline-block rounded-full bg-ambar-suave px-2.5 py-1 text-xs font-bold text-ambar-oscuro">
            Fuera de horario
          </p>
        )}
      </div>

      <AlertaCriticaBanner alertas={alertasActivas} alergiasGraves={alergiasGraves} tamano="grande" />
      {aplicanRequisitos ? (
        <>
          <ResumenSanitario items={(estadoSanitario as EstadoRequisitoItem[]) ?? []} tamano="grande" />
          {traePendientes && (
            <p className="rounded-md border-[1.5px] border-ambar bg-ambar-suave px-3 py-2 text-sm text-ambar-oscuro">
              Trae requisitos vencidos o sin registro. No detienen esta cita (las vacunas se exigen en guardería y
              hotel), pero sí sus estancias: conviene ponerlo al día.
            </p>
          )}
        </>
      ) : (
        <NotaSoloEstetica />
      )}

      {cita.estancia_id && (
        <p className="rounded-md border border-n-200 bg-n-50 px-3 py-2 text-sm text-n-700">
          Ligada a una estancia en curso — el perro ya está adentro, esta cita no genera entrada ni
          salida propia.
        </p>
      )}

      {!puedeEditar ? (
        <p className="text-sm text-n-500">Esta cita es de otro empleado — solo se puede consultar.</p>
      ) : (
        <CitaDetalle
          citaId={cita.id}
          perroNombre={perro.nombre}
          estado={cita.estado}
          inicio={cita.inicio}
          precio={cita.precio}
          recargo={Number(cita.recargo ?? 0)}
          recargoMotivo={(cita.recargo_motivo as string | null) ?? null}
          puedeRecargo={tienePermiso(sesion, "excepciones_reserva")}
          puedeEliminar={tienePermiso(sesion, "eliminar_citas")}
          abrirReprogramar={abrirReprogramar}
          tarifa={{
            aplicada: Boolean(cita.tarifa_guarderia),
            origen: cita.tarifa_guarderia ? (cita.tarifa_guarderia_modo === "si" ? "manual" : "auto") : null,
            servicioNombre: (servicioTarifa?.nombre as string | null) ?? null,
            aplicable: tarifaAplicable,
            puedeCambiar: tienePermiso(sesion, "excepciones_reserva"),
          }}
          esStandalone={!cita.estancia_id}
          entregadoPorNombre={cita.entregado_por_nombre}
          recogidoPorNombre={cita.recogido_por_nombre}
          recogidoPorEsDueno={cita.recogido_por_es_dueno}
          recetaItems={recetaItems}
          estilista={
            sesion?.rol === "admin" || sesion?.rol === "recepcion"
              ? {
                  empleadoId: (cita.empleado_id as string | null) ?? null,
                  nombreActual: empleado?.nombre_completo ?? null,
                  estilistas,
                  puedeCorregir: tienePermiso(sesion, "corregir_estilista"),
                }
              : null
          }
        />
      )}

      {puedeCorregirServicio && (
        <section data-corregir-servicio-seccion className="flex flex-col gap-2 border-t border-n-200 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Servicio de la cita</h2>
          <CorregirServicio
            citaId={cita.id}
            estado={cita.estado}
            servicioActual={servicio?.nombre ?? (cita.servicio_nombre as string | null) ?? "Servicio"}
            servicios={((serviciosCorregibles ?? []) as { id: string; nombre: string }[]).filter((x) => x.id !== cita.servicio_id)}
            gruposPrecio={(gruposPrecio ?? []) as { id: string; nombre: string }[]}
            puedeExcepcion={tienePermiso(sesion, "excepciones_reserva")}
          />
        </section>
      )}

      {correcciones.length > 0 && (
        <section data-historial-servicio className="flex flex-col gap-2 border-t border-n-200 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Historial de servicio</h2>
          <ul className="flex flex-col gap-2">
            {correcciones.map((k) => (
              <li key={k.id} className="rounded-md border border-n-200 bg-white px-3 py-2 text-sm text-n-700">
                <span className="font-semibold text-n-900">
                  {k.servicio_anterior} → {k.servicio_nuevo}
                </span>
                <span className="block text-n-700">
                  ${Number(k.precio_anterior).toFixed(2)} → ${Number(k.precio_nuevo).toFixed(2)}
                  {Number(k.diferencia) !== 0 && ` (${Number(k.diferencia) > 0 ? "+" : "−"}$${Math.abs(Number(k.diferencia)).toFixed(2)})`}
                  {k.tipo_ajuste === "cobro_adicional" && (Number(k.saldo_actual) > 0 ? " · cobro adicional por cobrar" : " · cobro adicional ya cobrado")}
                  {k.tipo_ajuste === "saldo_a_favor" && (Number(k.saldo_actual) < 0 ? " · saldo a favor por devolver" : " · saldo a favor ya devuelto")}
                </span>
                <span className="block text-xs text-n-500">
                  {formatearFecha(k.cuando, zona)} {horaLocalDeInstante(k.cuando, zona)} · por {k.por_nombre} · {ESTADO_HISTORIAL[k.estado_cita] ?? k.estado_cita}
                </span>
                <span className="block text-n-700">Motivo: {k.motivo}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cambios.length > 0 && (
        <section data-historial-agenda className="flex flex-col gap-2 border-t border-n-200 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Historial de cambios</h2>
          <ul className="flex flex-col gap-2">
            {cambios.map((k) => (
              <li key={k.id} className="rounded-md border border-n-200 bg-white px-3 py-2 text-sm text-n-700">
                <span className="font-semibold text-n-900">{ETIQUETA_CAMBIO[k.tipo] ?? k.tipo}</span>
                {k.tipo === "reprogramacion" && (
                  <span className="block">
                    {formatearFechaCalendario(k.inicio_antes)} {horaLocalDeInstante(k.inicio_antes, zona)} → {formatearFechaCalendario(k.inicio_despues)} {horaLocalDeInstante(k.inicio_despues, zona)}
                  </span>
                )}
                {k.tipo === "tarifa_guarderia" && k.detalle && (
                  <span className="block">
                    ${Number(k.detalle.precio_antes ?? 0).toFixed(2)} → ${Number(k.detalle.precio_despues ?? 0).toFixed(2)}
                  </span>
                )}
                <span className="block text-xs text-n-500">
                  {formatearFecha(k.cuando, zona)} {horaLocalDeInstante(k.cuando, zona)} · por {k.por_nombre} · {ESTADO_HISTORIAL[k.estado_antes] ?? k.estado_antes}
                </span>
                {k.motivo && <span className="block text-n-700">Motivo: {k.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {historial.length > 0 && (
        <section data-historial-estilista className="flex flex-col gap-2 border-t border-n-200 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Historial de estilista</h2>
          <ul className="flex flex-col gap-2">
            {historial.map((h) => (
              <li key={h.id} className="rounded-md border border-n-200 bg-white px-3 py-2 text-sm text-n-700">
                <span className="font-semibold text-n-900">
                  {h.de_nombre} → {h.a_nombre}
                </span>
                <span className="block text-xs text-n-500">
                  {formatearFecha(h.cuando, zona)} {horaLocalDeInstante(h.cuando, zona)} · por {h.por_nombre} · {ESTADO_HISTORIAL[h.estado_cita] ?? h.estado_cita}
                </span>
                {h.motivo && <span className="block text-n-700">Motivo: {h.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
