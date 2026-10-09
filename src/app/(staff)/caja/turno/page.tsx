import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { TurnoAbierto, type Retiro, type EfectivoAgregado } from "./turno-abierto";
import { tienePermiso } from "@/lib/auth/permisos";
import { AbrirTurnoForm } from "./abrir-turno-form";
import { HistorialTurnos, type TurnoCerrado } from "./historial-turnos";
import { MovimientosTurno, type MovimientoTurno, type ResumenMetodo } from "./movimientos-turno";
import { zonaActual } from "@/lib/negocio/actual";

// El turno de caja: apertura, movimientos en curso con el acumulado por
// método (y por origen: por la app o a mano), retiros, arqueo ciego e
// historial. El cobro en sí vive en /caja (mostrador).
export default async function TurnoCajaPage() {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: turnoAbierto, error: errorTurno } = await supabase
    .from("turnos_caja")
    .select("id, fondo_inicial, abierto_at, abierto_por, notas_apertura")
    .eq("estado", "abierto")
    .maybeSingle();

  const [{ data: retirosCrudo }, { data: movimientosCrudo }, { data: resumenCrudo }] = turnoAbierto
    ? await Promise.all([
        supabase
          .from("movimientos_caja")
          // Los cancelados (gasto cancelado con el turno abierto, o retiro
          // cancelado con motivo) se enseñan tachados y no suman.
          .select("id, monto, motivo, created_at, created_by, deleted_at, motivo_cancelacion, cancelado_por, tipo, origen_ingreso, nota")
          .eq("turno_id", turnoAbierto.id)
          .order("created_at"),
        supabase.rpc("movimientos_turno", { p_turno_id: turnoAbierto.id }),
        supabase.rpc("resumen_turno", { p_turno_id: turnoAbierto.id }),
      ])
    : [{ data: [] as never[] }, { data: [] as never[] }, { data: [] as never[] }];

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
      ...(retirosCrudo ?? []).flatMap((r) => [r.created_by, r.cancelado_por]),
      ...((movimientosCrudo ?? []) as { hecho_por: string | null }[]).map((m) => m.hecho_por),
      ...(turnosCerradosCrudo ?? []).flatMap((t) => [t.abierto_por, t.cerrado_por]),
    ])
  ).filter((x): x is string => Boolean(x));

  const { data: perfiles } = idsNombres.length
    ? await supabase.from("profiles").select("id, nombre_completo").in("id", idsNombres)
    : { data: [] as { id: string; nombre_completo: string | null }[] };
  // Un perfil sin nombre no entra al mapa: quien lo use decide su respaldo.
  const nombrePorId = new Map((perfiles ?? []).filter((p) => p.nombre_completo).map((p) => [p.id, p.nombre_completo as string]));

  const retiros: Retiro[] = (retirosCrudo ?? []).filter((r) => r.tipo !== "ingreso").map((r) => ({
    id: r.id as string,
    monto: Number(r.monto),
    motivo: r.motivo as string,
    creadoEn: r.created_at as string,
    creadoPorNombre: nombrePorId.get(r.created_by as string) ?? "—",
    cancelado: Boolean(r.deleted_at),
    motivoCancelacion: (r.motivo_cancelacion as string | null) ?? null,
    canceladoPorNombre: r.cancelado_por ? (nombrePorId.get(r.cancelado_por as string) ?? "—") : null,
    // Recepción cancela solo los suyos; admin, cualquiera.
    puedeCancelar: !r.deleted_at && (sesion?.rol === "admin" || r.created_by === sesion?.user.id),
  }));

  // Efectivo agregado al turno (cambio, préstamo, aportación): no es venta.
  const ingresos: EfectivoAgregado[] = (retirosCrudo ?? [])
    .filter((r) => r.tipo === "ingreso")
    .map((r) => ({
      id: r.id as string,
      monto: Number(r.monto),
      origen: (r.origen_ingreso as string) ?? "otro",
      nota: (r.nota as string | null) ?? null,
      creadoEn: r.created_at as string,
      creadoPorNombre: nombrePorId.get(r.created_by as string) ?? "—",
      cancelado: Boolean(r.deleted_at),
      motivoCancelacion: (r.motivo_cancelacion as string | null) ?? null,
      canceladoPorNombre: r.cancelado_por ? (nombrePorId.get(r.cancelado_por as string) ?? "—") : null,
      puedeCancelar: !r.deleted_at && tienePermiso(sesion, "agregar_efectivo") && (sesion?.rol === "admin" || r.created_by === sesion?.user.id),
    }));

  const movimientos: MovimientoTurno[] = ((movimientosCrudo ?? []) as Record<string, unknown>[]).map((m) => ({
    id: m.id as string,
    tipo: m.tipo as string,
    fecha: m.fecha as string,
    reservaId: (m.reserva_id as string | null) ?? null,
    clienteNombre: (m.cliente_nombre as string | null) ?? null,
    descripcion: (m.descripcion as string) ?? "",
    metodo: m.metodo as string,
    monto: Number(m.monto),
    propina: Number(m.propina ?? 0),
    origen: (m.origen as string) ?? "manual",
    grupoId: (m.grupo_id as string | null) ?? null,
    hechoPorNombre: nombrePorId.get(m.hecho_por as string) ?? "—",
    ajusteTipo: (m.ajuste_tipo as string | null) ?? null,
  }));

  const resumen: ResumenMetodo[] = ((resumenCrudo ?? []) as Record<string, unknown>[]).map((r) => ({
    metodo: r.metodo as string,
    origen: r.origen as string,
    cobrado: Number(r.cobrado),
    propinas: Number(r.propinas),
    devuelto: Number(r.devuelto),
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
        <Link href="/caja" className="text-sm font-semibold text-morado hover:underline">
          ← Caja
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Turno de caja</h1>
        <p className="mt-1 text-n-600">Apertura, movimientos del turno, retiros y arqueo de cierre.</p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la caja">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !turnoAbierto ? (
        <AbrirTurnoForm />
      ) : (
        <>
          <TurnoAbierto
            turnoId={turnoAbierto.id}
            fondoInicial={Number(turnoAbierto.fondo_inicial)}
            abiertoEn={turnoAbierto.abierto_at}
            // Sin nombre en su perfil (pasa con la primera cuenta de admin de
            // un negocio), se dice «otra persona» y no una raya.
            abiertoPorNombre={nombrePorId.get(turnoAbierto.abierto_por) ?? "otra persona"}
            notasApertura={turnoAbierto.notas_apertura}
            retiros={retiros}
            ingresos={ingresos}
            puedeAgregarEfectivo={tienePermiso(sesion, "agregar_efectivo")}
            // Admin cierra cualquier turno de su negocio; recepción, solo el
            // que abrió ella (regla de cerrar_turno desde el 29 de julio).
            puedeCerrar={sesion?.rol === "admin" || turnoAbierto.abierto_por === sesion?.user.id}
            abiertoPorMi={turnoAbierto.abierto_por === sesion?.user.id}
            tarjetaManualSinVerificar={resumen
              .filter((r) => r.metodo === "tarjeta_manual")
              .reduce((s, r) => s + r.cobrado + r.propinas - r.devuelto, 0)}
          />
          <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
            <h2 className="text-lg font-bold text-n-900">Movimientos de este turno</h2>
            <MovimientosTurno zona={zona} movimientos={movimientos} resumen={resumen} />
          </div>
        </>
      )}

      <div className="border-t border-n-200 pt-6">
        <h2 className="mb-3 text-lg font-bold text-n-900">
          {sesion?.rol === "admin" ? "Turnos cerrados" : "Tus turnos cerrados"}
        </h2>
        <HistorialTurnos zona={zona} turnos={turnosCerrados} />
      </div>
    </div>
  );
}
