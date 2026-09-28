import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { NEGOCIO_DE_LAS_LLAVES } from "@/lib/negocio/integraciones";
import { accessTokenLegado, terminalLegado, TERMINAL_ESPERA_SEGUNDOS } from "@/lib/mercadopago/config";
import { renovarSiHaceFalta } from "@/lib/mercadopago/oauth";
import { TERMINAL_SIMULADA } from "@/lib/mercadopago/point";
import {
  NOMBRE_PROVEEDOR,
  type ConexionCobro,
  type CredencialesClip,
  type CredencialesMp,
  type ProveedorElegible,
  type ProveedorIntegrado,
  type ResumenCobro,
} from "./tipos";

/**
 * Con qué cobra un negocio, y la conexión para hacerlo. SOLO SERVIDOR: la
 * conexión trae las credenciales descifradas (de Vault, por
 * integracion_leer_secreto, que solo entrega las del negocio del
 * encabezado). Al navegador va ResumenCobro.
 *
 * Reglas:
 *   - el demo cobra en simulación (y cobrar lo rechaza su solo lectura);
 *   - un negocio en prueba sin cuenta conectada cobra en simulación;
 *   - una cuenta conectada cobra de verdad (OAuth de Mercado Pago o
 *     credenciales de Clip);
 *   - Ludogteka, mientras no se reconecte por OAuth, cobra con la llave del
 *     entorno (la de antes de PeluDesk), como la conexión de ESE negocio;
 *   - cualquier otro caso: sin cobro integrado (el manual existe siempre).
 * La simulación nunca da por pagado un cobro de un negocio real: la base lo
 * rechaza (registrar_pago_mercadopago, negocio_puede_simular).
 */
export type NegocioParaCobro = { id: string; nombre: string; slug: string; dominio: string | null; url_publica?: string | null };

type FilaIntegracion = {
  proveedor: ProveedorElegible;
  elegida: boolean;
  estado: "conectada" | "desconectada" | "error";
  modo: "oauth" | "credenciales" | null;
  cuenta_id: string | null;
  terminal_id: string | null;
  terminal_compatible: boolean | null;
  ultimo_error: string | null;
};

type Estado = {
  plan: string | null;
  filas: FilaIntegracion[];
  elegido: ProveedorElegible;
  legado: boolean;
  puedeSimular: boolean;
};

async function leerEstado(admin: SupabaseClient, negocio: NegocioParaCobro): Promise<Estado> {
  const [{ data: filas }, { data: neg }] = await Promise.all([
    admin
      .from("integraciones_cobro")
      .select("proveedor, elegida, estado, modo, cuenta_id, terminal_id, terminal_compatible, ultimo_error")
      .eq("negocio_id", negocio.id)
      .is("deleted_at", null),
    admin.from("negocios").select("plan").eq("id", negocio.id).maybeSingle(),
  ]);
  const plan = (neg?.plan as string | null) ?? null;
  const lista = (filas ?? []) as FilaIntegracion[];
  const legado = negocio.id === NEGOCIO_DE_LAS_LLAVES && accessTokenLegado() !== null;
  const puedeSimular = plan === "demo" || plan === "prueba";
  const elegida = lista.find((f) => f.elegida)?.proveedor;
  // Sin elección todavía: Ludogteka sigue con su Mercado Pago; un negocio
  // en prueba ve Mercado Pago en simulación; los demás, manual.
  const elegido: ProveedorElegible = elegida ?? (legado || puedeSimular ? "mercadopago" : "manual");
  return { plan, filas: lista, elegido, legado, puedeSimular };
}

function base(negocio: NegocioParaCobro, proveedor: ProveedorIntegrado) {
  return { proveedor, negocio: { id: negocio.id, nombre: negocio.nombre, url: urlDelNegocio(negocio) } };
}

function simulada(negocio: NegocioParaCobro, proveedor: ProveedorIntegrado, terminalId: string | null = null): ConexionCobro {
  return {
    ...base(negocio, proveedor),
    simulado: true,
    origen: "simulacion",
    cuentaId: null,
    terminalId: terminalId ?? (proveedor === "mercadopago" ? TERMINAL_SIMULADA : "SIMULADA-CLIP-01"),
    mp: null,
    clip: null,
  };
}

/** La conexión con la que cobra el negocio ahora, o null si solo cobra a mano. */
export async function conexionDeCobro(negocio: NegocioParaCobro): Promise<ConexionCobro | null> {
  const admin = createSupabaseAdminClient(negocio.id);
  const e = await leerEstado(admin, negocio);
  if (e.elegido === "manual") return null;
  const proveedor = e.elegido;
  if (e.plan === "demo") return simulada(negocio, proveedor);

  const fila = e.filas.find((f) => f.proveedor === proveedor);
  if (fila?.estado === "conectada") {
    const { data: secreto, error } = await admin.rpc("integracion_leer_secreto", { p_proveedor: proveedor });
    if (!error && typeof secreto === "string" && secreto) {
      if (proveedor === "mercadopago") {
        let mp = JSON.parse(secreto) as CredencialesMp;
        mp = await renovarSiHaceFalta(admin, negocio.id, mp);
        return {
          ...base(negocio, proveedor),
          simulado: Boolean(mp.simulada),
          origen: mp.simulada ? "simulacion" : "oauth",
          cuentaId: mp.userId ?? fila.cuenta_id,
          terminalId: fila.terminal_id ?? (mp.simulada ? TERMINAL_SIMULADA : null),
          mp,
          clip: null,
        };
      }
      const clip = JSON.parse(secreto) as CredencialesClip;
      return {
        ...base(negocio, proveedor),
        simulado: Boolean(clip.simulada),
        origen: clip.simulada ? "simulacion" : "credenciales",
        cuentaId: fila.cuenta_id,
        terminalId: clip.serie,
        mp: null,
        clip,
      };
    }
  }

  if (proveedor === "mercadopago" && e.legado) {
    return {
      ...base(negocio, proveedor),
      simulado: false,
      origen: "llave_entorno",
      cuentaId: null,
      terminalId: terminalLegado(),
      mp: { accessToken: accessTokenLegado()! },
      clip: null,
    };
  }
  if (e.puedeSimular) return simulada(negocio, proveedor);
  return null;
}

/** Lo que la pantalla de cobro y la de administración ven, sin secretos. */
export async function resumenDeCobro(negocio: NegocioParaCobro): Promise<ResumenCobro> {
  const admin = createSupabaseAdminClient(negocio.id);
  const e = await leerEstado(admin, negocio);
  const nombre = NOMBRE_PROVEEDOR[e.elegido];
  const vacio: ResumenCobro = { proveedor: e.elegido, nombre, activo: false, simulado: false, terminal: false, link: false, motivo: null, esperaSegundos: TERMINAL_ESPERA_SEGUNDOS };
  if (e.elegido === "manual") return { ...vacio, motivo: "Este negocio cobra solo a mano." };
  const soportaLink = e.elegido === "mercadopago";
  if (e.plan === "demo") return { ...vacio, activo: true, simulado: true, terminal: true, link: soportaLink };

  const fila = e.filas.find((f) => f.proveedor === e.elegido);
  if (fila?.estado === "conectada") {
    const simuladaCuenta = await esConexionSimulada(admin, e.elegido);
    const terminal = e.elegido === "clip" ? true : Boolean(fila.terminal_id) && fila.terminal_compatible !== false;
    return {
      ...vacio,
      activo: true,
      simulado: simuladaCuenta,
      terminal: terminal || simuladaCuenta,
      link: soportaLink,
      motivo: terminal || simuladaCuenta ? null : "Falta escoger la terminal Point Smart en Administración → Cobro con terminal.",
    };
  }
  if (e.elegido === "mercadopago" && e.legado) {
    return { ...vacio, activo: true, terminal: Boolean(terminalLegado()), link: true, motivo: terminalLegado() ? null : "Sin terminal configurada." };
  }
  if (e.puedeSimular) return { ...vacio, activo: true, simulado: true, terminal: true, link: soportaLink };
  return {
    ...vacio,
    motivo:
      fila?.estado === "error"
        ? `La conexión con ${nombre} tiene un problema: ${fila.ultimo_error ?? "vuelve a conectarla"}.`
        : `${nombre} no está conectado. El admin lo conecta en Administración → Cobro con terminal.`,
  };
}

async function esConexionSimulada(admin: SupabaseClient, proveedor: ProveedorIntegrado): Promise<boolean> {
  const { data } = await admin.rpc("integracion_leer_secreto", { p_proveedor: proveedor });
  if (typeof data !== "string" || !data) return false;
  try {
    return Boolean((JSON.parse(data) as { simulada?: boolean }).simulada);
  } catch {
    return false;
  }
}

/** Los datos de un negocio para cobrar fuera de una petición suya (webhook, cron). */
export async function negocioParaCobro(negocioId: string): Promise<NegocioParaCobro | null> {
  const { data } = await createSupabaseAdminClient()
    .from("negocios")
    .select("id, nombre, slug, dominio, url_publica")
    .eq("id", negocioId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as NegocioParaCobro | null) ?? null;
}
