import { etiquetaDeCuenta } from "@/lib/auth/identidad";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { etiquetaDePermiso, PERMISOS } from "@/lib/auth/permisos";
import { NUNCA_SE_DELEGA } from "@/lib/auth/permisos-grupos";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { GruposPermisos } from "./grupos-permisos";
import { zonaActual } from "@/lib/negocio/actual";
import { leerTodo } from "@/lib/supabase/paginar";
import { Enlace } from "@/components/ui/enlace";
import { Tarjeta, TarjetaEncabezado } from "@/components/ui/tarjeta";

// Permisos extra por persona de recepción (solo admin: el middleware no deja entrar a nadie más y la base rechaza
// otorgar/revocar a quien no es admin). Una tarjeta por persona con sus permisos en grupos plegables (buscador y
// «activar todo el grupo»); abajo, lo que nunca se delega y la bitácora completa de quién dio o quitó qué y cuándo.
export default async function PermisosPage() {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const [{ data: recepcion, error }, { data: filas }, { data: nombres }] = await Promise.all([
    // Recepción de ESTE negocio (el rol vive en la membresía).
    supabase.from("membresias").select("id:profile_id, profiles(nombre_completo)").eq("rol", "recepcion").is("deleted_at", null),
    supabase
      .from("permisos_staff")
      .select("id, profile_id, permiso, created_at, created_by, revocado_at, revocado_por")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("membresias").select("id:profile_id, profiles(nombre_completo)").in("rol", ["admin", "recepcion"]),
  ]);
  const { data: cuentas } = await leerTodo<Record<string, unknown>>(() => supabase.rpc("listar_cuentas").order("id"));
  const correo = new Map(((cuentas as { id: string; email: string }[] | null) ?? []).map((c) => [c.id, etiquetaDeCuenta(c.email)]));
  // El nombre en ESTE negocio (ficha de empleado, luego la cuenta: nombre_de_persona); sin nombre, el correo va
  // marcado como correo, nunca como si fuera el nombre (QA N24).
  const ids = [...new Set((nombres ?? []).map((n) => n.id as string))];
  const nombresBase = await Promise.all(ids.map(async (id) => [id, ((await supabase.rpc("nombre_de_persona", { p_profile: id, p_vacio: null })).data as string | null) ?? null] as const));
  const nombre = new Map(nombresBase.map(([id, n]) => [id, n?.trim() || (correo.get(id) ? `Sin nombre (${correo.get(id)})` : "—")]));
  const quienEs = (id: string) => nombre.get(id) ?? (correo.get(id) ? `Sin nombre (${correo.get(id)})` : "—");

  const activosDe = (id: string) =>
    (filas ?? []).filter((f) => f.profile_id === id && !f.revocado_at).map((f) => f.permiso as string);

  // Bitácora: cada fila es un "dio" y, si se quitó, un "quitó". Un permiso que la base prendió sola (por omisión)
  // no tiene quién: se dice así.
  const eventos = (filas ?? [])
    .flatMap((f) => [
      { cuando: f.created_at as string, accion: "dio" as const, quien: f.created_by as string | null, a: f.profile_id as string, permiso: f.permiso as string },
      ...(f.revocado_at
        ? [{ cuando: f.revocado_at as string, accion: "quitó" as const, quien: f.revocado_por as string | null, a: f.profile_id as string, permiso: f.permiso as string }]
        : []),
    ])
    .sort((x, y) => y.cuando.localeCompare(x.cuando));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Enlace href="/admin" className="text-sm">
          ← Panel de admin
        </Enlace>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Permisos de recepción</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Permisos extra por persona, para que alguien de recepción te ayude a administrar. Se aplican en la base: sin el permiso, no puede aunque lo
          intente por fuera de la app. Están agrupados por área; abre un grupo, busca un permiso o activa el grupo completo. Un admin tiene todos.
        </p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar al personal">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (recepcion ?? []).length === 0 ? (
        <Alert variante="advertencia" titulo="No hay nadie de recepción">
          Invita a alguien de recepción desde el panel de admin y luego vuelve aquí.
        </Alert>
      ) : (
        (recepcion ?? []).map((p) => (
          <Tarjeta key={p.id as string} data-persona-permisos={p.id as string}>
            <TarjetaEncabezado
              titulo={nombre.get(p.id as string) ?? "—"}
              descripcion={correo.get(p.id as string) ?? undefined}
              conteo={`${activosDe(p.id as string).filter((c) => PERMISOS.some((x) => x.clave === c)).length} de ${PERMISOS.length}`}
            />
            <GruposPermisos profileId={p.id as string} activos={activosDe(p.id as string)} />
          </Tarjeta>
        ))
      )}

      <Tarjeta>
        <TarjetaEncabezado titulo="Lo que nunca se delega" descripcion="Sigue siendo solo de admin, sin casilla:" />
        <ul className="list-disc space-y-1 pl-5 text-sm text-n-700">
          {NUNCA_SE_DELEGA.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta>
        <TarjetaEncabezado titulo="Bitácora" conteo={eventos.length} />
        {eventos.length === 0 ? (
          <p className="text-sm text-n-600">Todavía no se ha dado ningún permiso.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {eventos.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-n-900">
                  <strong>{e.quien ? quienEs(e.quien) : e.accion === "dio" ? "PeluDesk (viene prendido)" : "—"}</strong> {e.accion} «{etiquetaDePermiso(e.permiso)}» a{" "}
                  <strong>{quienEs(e.a)}</strong>
                </span>
                <span className="tabular-nums text-n-600">
                  {formatearFecha(e.cuando, zona)} · {horaLocalDeInstante(e.cuando, zona)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
