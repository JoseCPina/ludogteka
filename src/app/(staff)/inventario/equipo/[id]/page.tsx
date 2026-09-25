import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { formatearFecha, formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { BajaServicioBoton } from "../../../servicios/baja-servicio-boton";
import { AVISOS_EQUIPO, ESTADOS_EQUIPO, cargarAreas, puedeDarDeAlta } from "../../comun";
import { EquipoForm } from "../equipo-form";
import { EventosEquipo } from "../eventos-equipo";
import { actualizarEquipo, darDeBajaEquipo } from "../equipo-actions";
import { zonaActual } from "@/lib/negocio/actual";

export default async function EquipoPage({ params }: { params: Promise<{ id: string }> }) {
  const zona = await zonaActual();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const puedeEditar = puedeDarDeAlta(sesion?.rol);

  const [{ data: equipo }, areas, { data: eventos }, { data: hoyData }] = await Promise.all([
    supabase.from("equipos_estado").select("*").eq("equipo_id", id).maybeSingle(),
    cargarAreas(supabase),
    supabase
      .from("equipo_eventos")
      .select("id, tipo, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, fecha, nota, created_at, created_by")
      .eq("equipo_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("fecha_negocio"),
  ]);
  if (!equipo) notFound();
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);

  const estado = ESTADOS_EQUIPO[equipo.estado as string];
  const aviso = equipo.aviso ? AVISOS_EQUIPO[equipo.aviso as string] : null;
  const actualizarConId = actualizarEquipo.bind(null, id);
  const bajaConId = darDeBajaEquipo.bind(null, id);

  const describir = (e: NonNullable<typeof eventos>[number]) => {
    if (e.tipo === "mantenimiento") return "Mantenimiento";
    if (e.tipo === "estado") {
      return `Estado: ${ESTADOS_EQUIPO[e.estado_anterior as string]?.etiqueta ?? e.estado_anterior} → ${ESTADOS_EQUIPO[e.estado_nuevo as string]?.etiqueta ?? e.estado_nuevo}`;
    }
    return `Cantidad: ${e.cantidad_anterior} → ${e.cantidad_nueva}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/inventario?ver=equipo" className="text-sm font-semibold text-morado hover:underline">
          ← Equipo
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">{equipo.nombre as string}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-n-900">
            {(equipo.cantidad as number) > 0 ? `${equipo.cantidad} en total` : "Sin contar"}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estado?.estilo ?? ""}`}>{estado?.etiqueta}</span>
          {aviso && equipo.aviso !== "sin_registro" && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${aviso.estilo}`}>{aviso.etiqueta}</span>}
        </div>
        <p className="mt-2 text-sm text-n-600">
          {equipo.ultimo_mantenimiento
            ? `Último mantenimiento: ${formatearFechaCalendario(equipo.ultimo_mantenimiento as string)}`
            : "Sin mantenimiento registrado"}
          {equipo.proximo_mantenimiento ? ` · Siguiente: ${formatearFechaCalendario(equipo.proximo_mantenimiento as string)}` : ""}
        </p>
      </div>

      <EventosEquipo
        equipoId={id}
        estadoActual={equipo.estado as string}
        cantidadActual={equipo.cantidad as number}
        queMantenimiento={(equipo.que_mantenimiento as string | null) ?? null}
        hoy={hoy}
      />

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Datos del equipo</h2>
        {/* La llave vuelve a montar el formulario cuando un mantenimiento
            registrado arriba cambia la fecha: si no, se quedaría con la
            vieja y al guardar la pisaría. */}
        <EquipoForm
          key={(equipo.ultimo_mantenimiento as string | null) ?? "sin-mantenimiento"}
          action={actualizarConId}
          areas={areas}
          esAlta={false}
          soloLectura={!puedeEditar}
          textoBoton="Guardar cambios"
          valoresIniciales={{
            nombre: equipo.nombre as string,
            area_id: equipo.area_id as string,
            frecuencia_mantenimiento_dias: (equipo.frecuencia_mantenimiento_dias as number | null) ?? null,
            que_mantenimiento: (equipo.que_mantenimiento as string | null) ?? null,
            ultimo_mantenimiento: (equipo.ultimo_mantenimiento as string | null) ?? null,
            notas: (equipo.notas as string | null) ?? null,
          }}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Bitácora</h2>
        {!eventos || eventos.length === 0 ? (
          <p className="text-sm text-n-600">Todavía no hay cambios registrados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {eventos.map((e) => (
              <li key={e.id} className="rounded-md border border-n-200 bg-white px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-n-900">{describir(e)}</span>
                  <span className="text-n-500">
                    {formatearFechaCalendario(e.fecha as string)} · registrado {formatearFecha(e.created_at as string, zona)}
                  </span>
                </div>
                {e.nota && <p className="mt-1 text-n-600">{e.nota}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {puedeEditar && (
        <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
          <h2 className="text-lg font-bold text-n-900">Quitar del inventario</h2>
          <p className="text-n-600">
            Para lo que se capturó por error. Si el equipo se descompuso o ya no sirve, mejor cambia su estado
            a «Dado de baja»: así queda en la bitácora.
          </p>
          <BajaServicioBoton accion={bajaConId} nombre={equipo.nombre as string} />
        </div>
      )}
    </div>
  );
}
