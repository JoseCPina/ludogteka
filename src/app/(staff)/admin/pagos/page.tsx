import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { NEGOCIO_DE_LAS_LLAVES } from "@/lib/negocio/integraciones";
import { accessTokenLegado } from "@/lib/mercadopago/config";
import { oauthDisponible, oauthSimulado } from "@/lib/mercadopago/oauth";
import { resumenDeCobro } from "@/lib/pagos/conexion";
import { urlPlataforma } from "@/lib/pagos/urls";
import { Alert } from "@/components/ui/alert";
import { PanelPagos, type EstadoConexion } from "./panel-pagos";

// Con qué cobra el negocio en su terminal y por link: Mercado Pago (su
// cuenta, por OAuth), Clip (sus credenciales) o solo manual. Solo admin.
export default async function PagosPage({ searchParams }: { searchParams: Promise<{ mp?: string; mp_error?: string }> }) {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") redirect("/admin");
  const { mp, mp_error } = await searchParams;
  const negocio = await negocioActual();
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const [{ data: filas }, { data: neg }, resumen] = await Promise.all([
    supabase
      .from("integraciones_cobro")
      .select("proveedor, elegida, estado, modo, cuenta_nombre, live_mode, terminal_id, terminal_nombre, token_expira_at, conectada_at, ultimo_error")
      .is("deleted_at", null),
    supabase.from("negocios").select("plan").maybeSingle(),
    resumenDeCobro(negocio),
  ]);
  const fila = (p: string) => (filas ?? []).find((f) => f.proveedor === p);

  // La URL de notificaciones de Clip lleva el token de ESTE negocio, que
  // solo vive dentro de su secreto; se lee aquí, en el servidor, para el admin.
  let urlWebhookClip: string | null = null;
  let clipSimulado = false;
  if (fila("clip")?.estado === "conectada") {
    const { data } = await createSupabaseAdminClient(negocio.id).rpc("integracion_leer_secreto", { p_proveedor: "clip" });
    if (typeof data === "string") {
      const s = JSON.parse(data) as { webhookToken?: string; simulada?: boolean };
      if (s.webhookToken) urlWebhookClip = `${urlPlataforma()}/api/clip/webhook/${s.webhookToken}`;
      clipSimulado = Boolean(s.simulada);
    }
  }

  const f = fila("mercadopago");
  const estadoMp: EstadoConexion = {
    conectada: f?.estado === "conectada",
    error: f?.estado === "error" ? f.ultimo_error ?? "La conexión tiene un problema." : null,
    cuenta: (f?.cuenta_nombre as string | null) ?? null,
    simulada: resumen.proveedor === "mercadopago" && resumen.simulado,
    terminal: f?.terminal_id ? `${f.terminal_nombre ?? "Terminal"} · ${f.terminal_id}` : null,
    vence: f?.token_expira_at ? formatearFecha(f.token_expira_at as string, zona) : null,
    avisoRenovacion: (f?.ultimo_error as string | null) ?? null,
  };
  const c = fila("clip");
  const estadoClip: EstadoConexion = {
    conectada: c?.estado === "conectada",
    error: null,
    cuenta: (c?.cuenta_nombre as string | null) ?? null,
    simulada: clipSimulado,
    terminal: c?.terminal_id ? `Serie ${c.terminal_id}` : null,
    vence: null,
    avisoRenovacion: null,
  };
  const legado = negocio.id === NEGOCIO_DE_LAS_LLAVES && Boolean(accessTokenLegado()) && !estadoMp.conectada;
  const enPrueba = neg?.plan === "prueba";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Cobro con terminal</h1>
        <p className="mt-1 text-n-700">
          Con qué cobra {negocio.nombre} en su terminal y por link. El cobro a mano (efectivo, transferencia o tarjeta en
          otra terminal) funciona siempre.
        </p>
      </header>

      {mp === "conectado" && <Alert variante="exito" titulo="Mercado Pago quedó conectado">Ahora escoge tu terminal Point Smart abajo.</Alert>}
      {mp_error && <Alert variante="error" titulo="No se pudo conectar Mercado Pago">{mp_error}</Alert>}
      {enPrueba && (
        <Alert variante="info" titulo="Estás en tu prueba gratis">
          Mientras no conectes tu cuenta, la terminal y los links funcionan en simulación: no mueven dinero. Puedes conectar tu cuenta
          real cuando quieras.
        </Alert>
      )}
      {legado && (
        <Alert variante="advertencia" titulo="Estás cobrando con la conexión anterior">
          Tu Mercado Pago sigue funcionando como siempre. Para que la conexión quede a nombre de tu cuenta y la administres desde aquí,
          apriétale «Conectar Mercado Pago» con la misma cuenta: en cuanto termine, la terminal y los links pasan a la conexión nueva sin
          dejar de cobrar.
        </Alert>
      )}

      <PanelPagos
        elegido={resumen.proveedor}
        mp={estadoMp}
        clip={estadoClip}
        urlWebhookClip={urlWebhookClip}
        oauthDisponible={oauthDisponible()}
        oauthSimulado={oauthSimulado()}
        legado={legado}
      />
    </div>
  );
}
