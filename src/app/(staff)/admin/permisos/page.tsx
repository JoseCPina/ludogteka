import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { etiquetaDePermiso } from "@/lib/auth/permisos";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { CasillasPermisos } from "./casillas-permisos";
import { zonaActual } from "@/lib/negocio/actual";

// Permisos extra por persona de recepción (solo admin: el middleware no
// deja entrar a nadie más y la base rechaza otorgar/revocar a quien no es
// admin). Arriba, una tarjeta por persona con sus casillas; abajo, la
// bitácora completa de quién dio o quitó qué y cuándo.
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
  const { data: cuentas } = await supabase.rpc("listar_cuentas");
  const correo = new Map(((cuentas as { id: string; email: string }[] | null) ?? []).map((c) => [c.id, c.email]));
  const nombreDe = (n: { profiles: unknown }) => ((n.profiles as { nombre_completo: string | null } | null)?.nombre_completo ?? null);
  const nombre = new Map((nombres ?? []).map((n) => [n.id as string, nombreDe(n) ?? correo.get(n.id as string) ?? "—"]));

  const activosDe = (id: string) =>
    (filas ?? []).filter((f) => f.profile_id === id && !f.revocado_at).map((f) => f.permiso as string);

  // Bitácora: cada fila es un "dio" y, si se quitó, un "quitó".
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
        <Link href="/admin" className="text-sm font-semibold text-morado hover:underline">
          ← Panel de admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Permisos de recepción</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Permisos extra por persona, para que alguien de recepción te ayude a administrar. Se aplican
          en la base: sin el permiso, no puede aunque lo intente por fuera de la app. Dar permisos,
          crear admins y cambiar el rol de alguien sigue siendo solo tuyo.
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
          <section key={p.id as string} className="rounded-lg border border-n-200 bg-white p-5">
            <h2 className="text-lg font-bold text-n-900">{nombre.get(p.id as string)}</h2>
            <p className="mb-3 text-sm text-n-600">{correo.get(p.id as string) ?? ""}</p>
            <CasillasPermisos profileId={p.id as string} activos={activosDe(p.id as string)} />
          </section>
        ))
      )}

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-bold text-n-900">Bitácora</h2>
        {eventos.length === 0 ? (
          <p className="text-sm text-n-600">Todavía no se ha dado ningún permiso.</p>
        ) : (
          <ul className="divide-y divide-n-200 text-sm">
            {eventos.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-n-900">
                  <strong>{e.quien ? nombre.get(e.quien) ?? "—" : "—"}</strong> {e.accion} «{etiquetaDePermiso(e.permiso)}»{" "}
                  {e.accion === "dio" ? "a" : "a"} <strong>{nombre.get(e.a) ?? "—"}</strong>
                </span>
                <span className="tabular-nums text-n-600">
                  {formatearFecha(e.cuando, zona)} · {horaLocalDeInstante(e.cuando, zona)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
