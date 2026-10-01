import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { PerroAdentro, type PerroAdentroDato } from "./perro-adentro";

// «Adentro ahora»: los perros que están en el negocio ahora mismo (estancia
// en curso de guardería u hotel), con lo que se hace al momento: tomar o
// subir fotos y videos para mandárselos al dueño, y abrir el reporte del día.
// Un perro con estancia de hotel Y de guardería sale una sola vez.
export default async function AdentroPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const modulos = sesion?.modulos ?? [];
  const conGuarderia = modulos.includes("guarderia");
  const conHotel = modulos.includes("hotel");
  const permiso = tienePermiso(sesion, "reportes_guarderia");

  const { data: filas, error } = await supabase
    .from("quienes_estan_adentro")
    .select("perro_id, perro_nombre, categoria")
    .order("perro_nombre");
  if (error) {
    return (
      <Alert variante="error" titulo="No pudimos cargar a los perros que están adentro">
        Recarga la página. Si el problema sigue, avísale al equipo técnico.
      </Alert>
    );
  }

  const porPerro = new Map<string, { nombre: string; categorias: Set<string> }>();
  for (const f of filas ?? []) {
    const cat = f.categoria as string;
    if ((cat === "guarderia" && !conGuarderia) || (cat === "hotel" && !conHotel) || (cat !== "guarderia" && cat !== "hotel")) continue;
    const e = porPerro.get(f.perro_id as string) ?? { nombre: f.perro_nombre as string, categorias: new Set<string>() };
    e.categorias.add(cat);
    porPerro.set(f.perro_id as string, e);
  }
  const ids = Array.from(porPerro.keys());

  const [{ data: retData }, { data: hoyData }, { data: telefonos }] = await Promise.all([
    supabase.rpc("reporte_retencion_dias"),
    supabase.rpc("fecha_negocio"),
    ids.length ? supabase.from("perros").select("id, clientes(telefono)").in("id", ids) : Promise.resolve({ data: [] }),
  ]);
  const retencion = Number(retData ?? 7);
  const sinTelefono = new Set<string>();
  for (const p of telefonos ?? []) {
    const c = (Array.isArray(p.clientes) ? p.clientes[0] : p.clientes) as { telefono: string | null } | null;
    if (((c?.telefono ?? "").replace(/\D/g, "")).length !== 10) sinTelefono.add(p.id as string);
  }

  const estadoReporte = new Map<string, string>();
  if (permiso && conGuarderia && ids.length) {
    const { data: reportes } = await supabase
      .from("reportes_guarderia")
      .select("perro_id, estado")
      .eq("fecha", hoyData as string)
      .in("perro_id", ids)
      .is("deleted_at", null);
    for (const r of reportes ?? []) estadoReporte.set(r.perro_id as string, r.estado as string);
  }

  const dato = (id: string, e: { nombre: string; categorias: Set<string> }): PerroAdentroDato => {
    const tieneGuarderia = e.categorias.has("guarderia");
    return {
      perroId: id,
      nombre: e.nombre,
      etiquetas: [e.categorias.has("hotel") ? "Hotel" : null, tieneGuarderia ? "Guardería" : null].filter((x): x is string => !!x),
      tieneGuarderia,
      sinTelefono: sinTelefono.has(id),
      reporte: tieneGuarderia ? (estadoReporte.get(id) ?? "sin_reporte") : null,
    };
  };
  const todos = Array.from(porPerro.entries()).map(([id, e]) => ({ e, d: dato(id, e) }));
  const grupos = [
    { clave: "hotel", titulo: "Hotel", lista: todos.filter((x) => x.e.categorias.has("hotel") && !x.e.categorias.has("guarderia")) },
    { clave: "guarderia", titulo: "Guardería", lista: todos.filter((x) => x.e.categorias.has("guarderia") && !x.e.categorias.has("hotel")) },
    { clave: "ambos", titulo: "Hotel y guardería", lista: todos.filter((x) => x.e.categorias.has("guarderia") && x.e.categorias.has("hotel")) },
  ].filter((g) => g.lista.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-n-900">Adentro ahora</h1>
          <p className="mt-1 text-n-600">
            {ids.length === 0 ? "No hay nadie adentro." : `${ids.length} ${ids.length === 1 ? "perro" : "perros"} adentro.`} Toma o sube fotos y videos y mándaselos al dueño por WhatsApp.
          </p>
        </div>
        {conGuarderia && permiso && (
          <Link href="/guarderia/reportes" className="inline-flex min-h-12 items-center rounded-md border-[1.5px] border-morado px-4 font-semibold text-morado hover:bg-morado-suave">
            Reportes del día
          </Link>
        )}
      </header>

      {!permiso && (
        <Alert variante="info" titulo="Te falta el permiso «Reportes de guardería»">
          Puedes ver quién está adentro, pero para subir fotos y videos o llenar el reporte necesitas que un administrador te lo dé en Permisos.
        </Alert>
      )}

      {grupos.map((g) => (
        <section key={g.clave} aria-labelledby={`grupo-${g.clave}`} className="flex flex-col gap-3">
          <h2 id={`grupo-${g.clave}`} className="text-sm font-bold uppercase tracking-wide text-n-600">
            {g.titulo} <span className="font-semibold text-n-500">({g.lista.length})</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {g.lista.map(({ d }) => (
              <PerroAdentro key={d.perroId} dato={d} permiso={permiso} retencion={retencion} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
