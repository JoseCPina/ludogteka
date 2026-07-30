import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { TurnoAbierto, type Retiro } from "./turno-abierto";
import { AbrirTurnoForm } from "./abrir-turno-form";
import { HistorialTurnos, type TurnoCerrado } from "./historial-turnos";

export default async function CajaPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: turnoAbierto, error: errorTurno } = await supabase
    .from("turnos_caja")
    .select("id, fondo_inicial, abierto_at, abierto_por, notas_apertura")
    .eq("estado", "abierto")
    .maybeSingle();

  const { data: retirosCrudo } = turnoAbierto
    ? await supabase
        .from("movimientos_caja")
        .select("id, monto, motivo, created_at, created_by")
        .eq("turno_id", turnoAbierto.id)
        .order("created_at")
    : { data: [] as never[] };

  const { data: turnosCerradosCrudo, error: errorHistorial } = await supabase
    .from("turnos_caja")
    .select(
      "id, fondo_inicial, abierto_at, cerrado_at, abierto_por, cerrado_por, cortes_caja(id, explicacion_diferencias, corte_metodos(metodo, conteo, esperado, diferencia))"
    )
    .eq("estado", "cerrado")
    .order("cerrado_at", { ascending: false })
    .limit(20);

  const error = errorTurno ?? errorHistorial;

  const idsNombres = Array.from(
    new Set([
      turnoAbierto?.abierto_por,
      ...(retirosCrudo ?? []).map((r) => r.created_by),
      ...(turnosCerradosCrudo ?? []).flatMap((t) => [t.abierto_por, t.cerrado_por]),
    ])
  ).filter((x): x is string => Boolean(x));

  const { data: perfiles } = idsNombres.length
    ? await supabase.from("profiles").select("id, nombre_completo").in("id", idsNombres)
    : { data: [] as { id: string; nombre_completo: string | null }[] };
  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo ?? "—"]));

  const retiros: Retiro[] = (retirosCrudo ?? []).map((r) => ({
    id: r.id as string,
    monto: Number(r.monto),
    motivo: r.motivo as string,
    creadoEn: r.created_at as string,
    creadoPorNombre: nombrePorId.get(r.created_by as string) ?? "—",
  }));

  const turnosCerrados: TurnoCerrado[] = (turnosCerradosCrudo ?? []).map((t) => {
    const corte = Array.isArray(t.cortes_caja) ? t.cortes_caja[0] : t.cortes_caja;
    const metodos = (corte?.corte_metodos as { metodo: string; conteo: number; esperado: number; diferencia: number }[]) ?? [];
    return {
      id: t.id as string,
      fondoInicial: Number(t.fondo_inicial),
      abiertoEn: t.abierto_at as string,
      cerradoEn: t.cerrado_at as string,
      abiertoPorNombre: nombrePorId.get(t.abierto_por as string) ?? "—",
      cerradoPorNombre: nombrePorId.get(t.cerrado_por as string) ?? "—",
      explicacionDiferencias: (corte?.explicacion_diferencias as string | null) ?? null,
      metodos: metodos.map((m) => ({
        metodo: m.metodo,
        conteo: Number(m.conteo),
        esperado: Number(m.esperado),
        diferencia: Number(m.diferencia),
      })),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Caja</h1>
        <p className="mt-1 text-n-600">Turno de caja, retiros y arqueo de cierre.</p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la caja">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !turnoAbierto ? (
        <AbrirTurnoForm />
      ) : (
        <TurnoAbierto
          turnoId={turnoAbierto.id}
          fondoInicial={Number(turnoAbierto.fondo_inicial)}
          abiertoEn={turnoAbierto.abierto_at}
          abiertoPorNombre={nombrePorId.get(turnoAbierto.abierto_por) ?? "—"}
          notasApertura={turnoAbierto.notas_apertura}
          retiros={retiros}
        />
      )}

      <div className="border-t border-n-200 pt-6">
        <h2 className="mb-3 text-lg font-bold text-n-900">
          {sesion?.rol === "admin" ? "Turnos cerrados" : "Tus turnos cerrados"}
        </h2>
        <HistorialTurnos turnos={turnosCerrados} />
      </div>
    </div>
  );
}
