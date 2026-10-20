import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { cargarCatalogoExtras, cargarExtras } from "@/lib/extras/servidor";
import { dinero } from "@/lib/dinero";
import { ListaExtras } from "@/components/extras/lista-extras";

// Los servicios extra del día: las tareas (paseo, baño de salida, medicamento…) y la
// hoja de traslados (dirección, hora y estado). Se puede ver otro día con ?fecha=.
export default async function ExtrasPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: fechaParam } = await searchParams;
  const zona = await zonaActual();
  const hoy = hoyNegocio(zona);
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoy;
  const supabase = await createSupabaseServerClient();
  const [sesion, negocio, filas, catalogo, { data: cargos }] = await Promise.all([
    obtenerSesionConRol(),
    negocioActual(),
    // Solo el día de hoy arrastra lo pendiente de días anteriores.
    cargarExtras(supabase, { fecha }),
    cargarCatalogoExtras(supabase, true),
    // QA S18 (N70): los cargos adicionales del negocio (comida especial, recolección por km…), que también se cobran aparte.
    supabase
      .from("servicios")
      .select("id, nombre, unidad, monto_libre, depende_cantidad")
      .eq("categoria", "cargo")
      .not("clave", "like", "extra_%")
      .is("deleted_at", null)
      .order("orden")
      .limit(100),
  ]);
  const puedeAgregar = tienePermiso(sesion, "agregar_servicios_extra");
  const puedeCatalogo = tienePermiso(sesion, "editar_catalogo_extras");
  const traslados = filas.filter((f) => f.tipo === "traslado");
  const tareas = filas.filter((f) => f.tipo !== "traslado");
  const pendientes = filas.filter((f) => f.estado === "pendiente" || f.estado === "en_camino").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Servicios extra</h1>
          <p className="mt-1 text-n-600">
            {formatearFechaCalendario(fecha)} · {pendientes === 0 ? "nada pendiente" : `${pendientes} por hacer`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <Link href={`/extras?fecha=${shiftDia(fecha, -1)}`} className="text-morado hover:underline">
            ← Día anterior
          </Link>
          {fecha !== hoy && (
            <Link href="/extras" className="text-morado hover:underline">
              Hoy
            </Link>
          )}
          <Link href={`/extras?fecha=${shiftDia(fecha, 1)}`} className="text-morado hover:underline">
            Día siguiente →
          </Link>
          {puedeCatalogo && (
            <Link href="/extras/catalogo" className="rounded-md border-[1.5px] border-borde bg-white px-3 py-2 text-n-900 hover:bg-n-100">
              Catálogo de servicios extra
            </Link>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Tareas del día</h2>
        <ListaExtras filas={tareas} negocio={negocio.nombre} puedeAgregar={puedeAgregar} vacio="No hay tareas de servicios extra para este día." />
      </section>

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Traslados</h2>
        <p className="text-sm text-n-600">
          Hoja del día: dirección, horario y estado. Cuando sale el traslado se le avisa al dueño por WhatsApp.
        </p>
        <ListaExtras filas={traslados} negocio={negocio.nombre} puedeAgregar={puedeAgregar} vacio="No hay traslados para este día." />
      </section>

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6" data-cobrables>
        <h2 className="text-lg font-bold text-n-900">Lo que se cobra aparte</h2>
        <p className="text-sm text-n-600">
          Para agregar uno a una estancia, abre su check-in o su check-out. Los servicios extra se marcan hechos aquí; los
          cargos adicionales se agregan en «Cargos» de la estancia.
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {catalogo.map((e) => (
            <li key={e.id} className="rounded-md border border-n-200 bg-white px-3 py-2" data-cobrable="extra">
              <strong className="text-n-900">{e.nombre}</strong>{" "}
              {e.tipo === "traslado" ? (
                <span className="text-n-700">
                  · traslado por zona:{" "}
                  {e.zonas.filter((z) => z.activo).length === 0
                    ? "todavía sin zonas"
                    : e.zonas.filter((z) => z.activo).map((z) => `${z.nombre}${z.km_hasta != null ? ` (hasta ${z.km_hasta} km)` : ""} ${dinero(z.precio)}`).join(" · ")}
                </span>
              ) : (
                <span className="text-n-700">· {dinero(e.precio)} {e.unidad === "dia" ? "por día" : e.unidad === "sesion" ? "por sesión" : e.unidad === "viaje" ? "por viaje" : "por vez"}</span>
              )}
            </li>
          ))}
          {(cargos ?? []).map((c) => (
            <li key={c.id} className="rounded-md border border-n-200 bg-white px-3 py-2" data-cobrable="cargo">
              <strong className="text-n-900">{c.nombre}</strong>{" "}
              <span className="text-n-700">
                ·{" "}
                {c.monto_libre
                  ? "cargo adicional de monto libre: el importe se escribe al aplicarlo"
                  : c.unidad === "km"
                    ? "cargo adicional por kilómetro, con precio por tramo de distancia"
                    : `cargo adicional ${c.unidad === "dia" ? "por día" : c.unidad === "noche" ? "por noche" : c.unidad === "hora" ? "por hora" : "por vez"}`}
              </span>{" "}
              {!c.monto_libre && (
                <Link href={`/servicios/${c.id}/tarifas`} className="font-semibold text-morado hover:underline">
                  Ver cómo se cobra
                </Link>
              )}
            </li>
          ))}
          {!catalogo.some((e) => e.tipo === "traslado") && (
            <li className="rounded-md border border-dashed border-n-300 px-3 py-2 text-n-600" data-cobrable="sin-traslado">
              <strong className="text-n-800">Traslado a domicilio</strong> · todavía no lo tienes.{" "}
              {puedeCatalogo ? (
                <Link href="/extras/catalogo" className="font-semibold text-morado hover:underline">
                  Créalo en el catálogo con sus zonas y precios
                </Link>
              ) : (
                "Pídele a un admin que lo cree en el catálogo con sus zonas y precios."
              )}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function shiftDia(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  // utc-ok: aritmética de calendario sobre una fecha AAAA-MM-DD, sin instante
  return d.toISOString().slice(0, 10);
}
