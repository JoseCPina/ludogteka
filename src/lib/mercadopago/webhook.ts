import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validación de la firma de un webhook de Mercado Pago.
 *
 * Mercado Pago manda x-signature = "ts=<unix>,v1=<hmac>" y x-request-id.
 * El HMAC-SHA256 se calcula con la clave secreta del panel sobre el
 * manifiesto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" — con
 * data.id en minúsculas si es alfanumérico y omitiendo la parte que no
 * venga. Sin esto, cualquiera que sepa la URL podría mandar "pagado" y
 * la app registraría un cobro que nunca existió.
 */
export function validarFirmaWebhook(args: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secreto: string;
  toleranciaSegundos?: number;
}): { valida: boolean; motivo: string | null } {
  const { xSignature, xRequestId, dataId, secreto } = args;
  if (!xSignature) return { valida: false, motivo: "Sin encabezado x-signature." };

  const partes = Object.fromEntries(
    xSignature.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return { valida: false, motivo: "x-signature sin ts o v1." };

  // Un webhook viejo repetido no es peligroso (el registro es
  // idempotente), pero uno muy viejo con firma válida podría ser una
  // repetición maliciosa: se acepta una ventana amplia por si el reloj
  // del servidor va desfasado.
  const tolerancia = args.toleranciaSegundos ?? 60 * 60 * 6;
  const ahora = Math.floor(Date.now() / 1000);
  const tsNum = Number(ts.length > 10 ? Math.floor(Number(ts) / 1000) : ts);
  if (Number.isFinite(tsNum) && Math.abs(ahora - tsNum) > tolerancia) {
    return { valida: false, motivo: "La notificación es demasiado vieja." };
  }

  let manifiesto = "";
  if (dataId) {
    const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
    manifiesto += `id:${id};`;
  }
  if (xRequestId) manifiesto += `request-id:${xRequestId};`;
  manifiesto += `ts:${ts};`;

  const esperado = createHmac("sha256", secreto).update(manifiesto).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valida: false, motivo: "La firma no coincide." };
  }
  return { valida: true, motivo: null };
}
