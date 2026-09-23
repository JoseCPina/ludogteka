import { mpFetch } from "./api";
import { accessToken, modoSimulacion, terminalIdConfigurada, urlWebhook, webhookSecret } from "./config";
import { ErrorMercadoPago } from "./errores";
import { listarTerminales } from "./point";

export type PruebaMp = {
  nombre: string;
  ok: boolean;
  simulado: boolean;
  ms: number;
  detalle: string;
  sugerencia: string | null;
};

function fallo(nombre: string, ms: number, e: unknown): PruebaMp {
  if (e instanceof ErrorMercadoPago) {
    return { nombre, ok: false, simulado: false, ms, detalle: e.message + (e.detalle ? ` — ${e.detalle.slice(0, 160)}` : ""), sugerencia: e.sugerencia };
  }
  return { nombre, ok: false, simulado: false, ms, detalle: e instanceof Error ? e.message : String(e), sugerencia: null };
}

// Cuatro pruebas: credencial, terminal, webhook y URL pública. Ninguna
// cobra nada: son lecturas.
export async function probarMercadoPago(): Promise<{ pruebas: PruebaMp[]; terminales: { id: string; operating_mode?: string }[] }> {
  const pruebas: PruebaMp[] = [];
  let terminales: { id: string; operating_mode?: string }[] = [];

  if (modoSimulacion()) {
    pruebas.push({
      nombre: "Credencial (MERCADOPAGO_ACCESS_TOKEN)",
      ok: true,
      simulado: true,
      ms: 0,
      detalle: "Sin access token configurado: la app corre en simulación. Las órdenes a la terminal y los links de pago se \"pagan\" solos y no mueven dinero.",
      sugerencia: "Es lo esperado en desarrollo. En producción, si sale esto, falta MERCADOPAGO_ACCESS_TOKEN en Vercel.",
    });
  } else {
    const t0 = Date.now();
    try {
      const yo = await mpFetch<{ id?: number; nickname?: string; site_id?: string; email?: string }>("/users/me");
      const token = accessToken() ?? "";
      const esProd = token.startsWith("APP_USR-");
      pruebas.push({
        nombre: "Credencial (MERCADOPAGO_ACCESS_TOKEN)",
        ok: true,
        simulado: false,
        ms: Date.now() - t0,
        detalle: `Cuenta ${yo.nickname ?? yo.id ?? "?"} (${yo.site_id ?? "sitio ?"}). ${esProd ? "Token con formato de producción." : "OJO: el token no empieza con APP_USR-; puede ser de prueba."}`,
        sugerencia: yo.site_id && yo.site_id !== "MLM" ? "La cuenta no es de México (MLM): los links saldrían en otra moneda." : null,
      });
    } catch (e) {
      pruebas.push(fallo("Credencial (MERCADOPAGO_ACCESS_TOKEN)", Date.now() - t0, e));
    }
  }

  const t1 = Date.now();
  try {
    terminales = await listarTerminales();
    const configurada = terminalIdConfigurada();
    const mia = configurada ? terminales.find((t) => t.id === configurada) : null;
    if (modoSimulacion()) {
      pruebas.push({ nombre: "Terminal Point", ok: true, simulado: true, ms: Date.now() - t1, detalle: "Terminal simulada. Cualquier cobro con terminal se aprueba solo a los 8 segundos (centavos .13 = cancelado, .77 = no contesta).", sugerencia: null });
    } else if (terminales.length === 0) {
      pruebas.push({ nombre: "Terminal Point", ok: false, simulado: false, ms: Date.now() - t1, detalle: "La cuenta no tiene ninguna terminal vinculada.", sugerencia: "Vincula la Point a esta cuenta de Mercado Pago desde la app de Mercado Pago (escanear el QR de la terminal) y crea sucursal y caja." });
    } else if (!configurada) {
      pruebas.push({ nombre: "Terminal Point", ok: false, simulado: false, ms: Date.now() - t1, detalle: `Hay ${terminales.length} terminal(es) pero MERCADOPAGO_TERMINAL_ID no está configurado: ${terminales.map((t) => `${t.id} (${t.operating_mode ?? "?"})`).join(", ")}.`, sugerencia: "Copia el id de la terminal a MERCADOPAGO_TERMINAL_ID en Vercel y vuelve a desplegar." });
    } else if (!mia) {
      pruebas.push({ nombre: "Terminal Point", ok: false, simulado: false, ms: Date.now() - t1, detalle: `MERCADOPAGO_TERMINAL_ID=${configurada} no está entre las terminales de la cuenta: ${terminales.map((t) => t.id).join(", ")}.`, sugerencia: "Corrige el id en Vercel (se copia tal cual, con el doble guion bajo)." });
    } else if (mia.operating_mode !== "PDV") {
      pruebas.push({ nombre: "Terminal Point", ok: false, simulado: false, ms: Date.now() - t1, detalle: `La terminal ${mia.id} está en modo ${mia.operating_mode ?? "desconocido"}, no en PDV.`, sugerencia: "Usa el botón \"Poner en modo PDV\" de abajo (o PATCH /terminals/v1/setup). En STANDALONE la terminal ignora las órdenes de la app." });
    } else {
      pruebas.push({ nombre: "Terminal Point", ok: true, simulado: false, ms: Date.now() - t1, detalle: `Terminal ${mia.id} vinculada y en modo PDV.`, sugerencia: null });
    }
  } catch (e) {
    pruebas.push(fallo("Terminal Point", Date.now() - t1, e));
  }

  const secreto = webhookSecret();
  pruebas.push({
    nombre: "Webhook (MERCADOPAGO_WEBHOOK_SECRET)",
    ok: Boolean(secreto) || modoSimulacion(),
    simulado: modoSimulacion(),
    ms: 0,
    detalle: secreto
      ? `Secreto configurado. La URL que debe estar en el panel de Mercado Pago es ${urlWebhook()} con los eventos Órdenes (Point) y Pagos.`
      : modoSimulacion()
        ? "En simulación no hay webhook: la pantalla y el link simulado registran el pago directo."
        : `Falta el secreto: sin él la app rechaza TODAS las notificaciones (nadie puede inventar un pago, pero tampoco se registra ninguno). URL a configurar: ${urlWebhook()}.`,
    sugerencia: secreto ? null : "En Mercado Pago: Tus integraciones → la aplicación → Webhooks → Configurar notificaciones → URL de producción → eventos Órdenes y Pagos → guardar → copiar la clave secreta a MERCADOPAGO_WEBHOOK_SECRET en Vercel.",
  });

  return { pruebas, terminales };
}
