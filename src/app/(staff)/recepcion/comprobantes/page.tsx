import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { formatearFecha, formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { diasDesde } from "@/lib/antiguedad";
import { BandejaComprobantes, type ComprobantePendiente } from "./bandeja-comprobantes";

const BUCKET = "perros-archivos";

// Bandeja de comprobantes sanitarios que los dueños mandaron desde el
// portal. Nada de lo que hay aquí cuenta todavía: recepción lo confirma
// contra el documento (y entonces se registra la aplicación real con la
// vigencia del catálogo) o lo rechaza con un motivo que el dueño lee.
export default async function ComprobantesPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: pendientesCrudo, error }, { data: revisadosCrudo }, { data: hoyData }] = await Promise.all([
    supabase
      .from("requisitos_sanitarios_propuestos")
      .select(
        "id, perro_id, fecha_aplicacion, detalle, comprobante_path, created_at, perros(nombre, cliente_id, clientes(nombre)), tipos_requisito_sanitario(id, etiqueta, vigencia_meses)"
      )
      .eq("estado", "pendiente")
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("requisitos_sanitarios_propuestos")
      .select("id, estado, fecha_aplicacion, motivo_rechazo, revisado_at, perros(nombre), tipos_requisito_sanitario(etiqueta)")
      .neq("estado", "pendiente")
      .is("deleted_at", null)
      .order("revisado_at", { ascending: false })
      .limit(20),
    supabase.rpc("fecha_negocio"),
  ]);
  const hoy = (hoyData as string | null) ?? hoyNegocio();

  const idsPerros = Array.from(new Set((pendientesCrudo ?? []).map((p) => p.perro_id as string)));
  const { data: estados } = idsPerros.length
    ? await supabase
        .from("perro_requisitos_sanitarios_estado")
        .select("perro_id, tipo_requisito_id, estado")
        .in("perro_id", idsPerros)
    : { data: [] as { perro_id: string; tipo_requisito_id: string; estado: string }[] };

  const pendientes: ComprobantePendiente[] = await Promise.all(
    (pendientesCrudo ?? []).map(async (p) => {
      const perro = (Array.isArray(p.perros) ? p.perros[0] : p.perros) as unknown as {
        nombre: string;
        cliente_id: string;
        clientes: { nombre: string } | { nombre: string }[] | null;
      } | null;
      const cliente = Array.isArray(perro?.clientes) ? perro?.clientes[0] : perro?.clientes;
      const tipo = (Array.isArray(p.tipos_requisito_sanitario)
        ? p.tipos_requisito_sanitario[0]
        : p.tipos_requisito_sanitario) as unknown as { id: string; etiqueta: string; vigencia_meses: number } | null;
      const { data: firmada } = await supabase.storage.from(BUCKET).createSignedUrl(p.comprobante_path as string, 60 * 60);
      const estadoActual = (estados ?? []).find(
        (e) => e.perro_id === p.perro_id && e.tipo_requisito_id === tipo?.id
      );
      return {
        id: p.id as string,
        perro_id: p.perro_id as string,
        perro_nombre: perro?.nombre ?? "—",
        cliente_id: perro?.cliente_id ?? "",
        cliente_nombre: cliente?.nombre ?? "—",
        tipo_etiqueta: tipo?.etiqueta ?? "—",
        vigencia_meses: tipo?.vigencia_meses ?? 0,
        fecha_aplicacion: p.fecha_aplicacion as string,
        detalle: (p.detalle as string | null) ?? null,
        created_at: p.created_at as string,
        dias_esperando: diasDesde(p.created_at as string, hoy),
        foto_url: firmada?.signedUrl ?? null,
        estado_actual: estadoActual?.estado ?? null,
      };
    })
  );

  const revisados = (revisadosCrudo ?? []).map((r) => {
    const perro = (Array.isArray(r.perros) ? r.perros[0] : r.perros) as unknown as { nombre: string } | null;
    const tipo = (Array.isArray(r.tipos_requisito_sanitario)
      ? r.tipos_requisito_sanitario[0]
      : r.tipos_requisito_sanitario) as unknown as { etiqueta: string } | null;
    return {
      id: r.id as string,
      estado: r.estado as string,
      fecha_aplicacion: r.fecha_aplicacion as string,
      motivo_rechazo: (r.motivo_rechazo as string | null) ?? null,
      revisado_at: r.revisado_at as string,
      perro_nombre: perro?.nombre ?? "—",
      tipo_etiqueta: tipo?.etiqueta ?? "—",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/recepcion" className="text-sm font-semibold text-azul hover:underline">
          ← Tablero del día
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Comprobantes por revisar</h1>
        <p className="mt-1 text-n-600">
          Fotos de carnet o comprobante que los dueños mandaron desde su portal. No cuentan hasta que
          las confirmes contra el documento; al confirmar, la aplicación se registra con la vigencia
          del catálogo. Si algo no cuadra, recházalo diciendo qué: el dueño lo lee y manda otro.
        </p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la bandeja">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <BandejaComprobantes pendientes={pendientes} />
      )}

      {revisados.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Últimos revisados</h2>
          <ul className="divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
            {revisados.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="text-n-900">
                  <strong>{r.tipo_etiqueta}</strong> · {r.perro_nombre} · aplicación del{" "}
                  {formatearFechaCalendario(r.fecha_aplicacion)}
                  {r.motivo_rechazo && <span className="block text-xs text-n-600">Motivo: {r.motivo_rechazo}</span>}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    r.estado === "confirmado" ? "bg-verde-suave text-verde-oscuro" : "bg-n-100 text-n-600"
                  }`}
                >
                  {r.estado === "confirmado" ? "Confirmado" : "Rechazado"} · {formatearFecha(r.revisado_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
