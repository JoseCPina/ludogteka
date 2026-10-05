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
import type { Estilista } from "../selector-estilista";
import { zonaActual } from "@/lib/negocio/actual";

const ESTADO_HISTORIAL: Record<string, string> = {
  reservada: "antes de empezar",
  confirmada: "antes de empezar",
  en_curso: "con el servicio en curso",
  finalizada: "corrección de un servicio terminado",
};

export default async function CitaDetallePage({
  params,
}: {
  params: Promise<{ citaId: string }>;
}) {
  const zona = await zonaActual();
  const { citaId } = await params;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: cita, error } = await supabase
    .from("citas_estetica")
    .select(
      "id, perro_id, servicio_id, tamano_id, empleado_id, estancia_id, inicio, fin, estado, precio, recargo, recargo_motivo, fuera_de_horario, entregado_por_nombre, recogido_por_nombre, recogido_por_es_dueno, perros(nombre), servicios(nombre)"
    )
    .eq("id", citaId)
    .single();

  if (error || !cita) notFound();

  const perro = Array.isArray(cita.perros) ? cita.perros[0] : cita.perros;
  const servicio = Array.isArray(cita.servicios) ? cita.servicios[0] : cita.servicios;

  if (!perro) notFound();

  const [{ data: estadoSanitario }, { data: alertasCrudo }, { data: alergias }, { data: empleado }, { data: usaGh }, { data: asignables }, { data: historialCrudo }] =
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
    ]);
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
          {servicio?.nombre} — {perro.nombre}
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
