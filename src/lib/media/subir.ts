/**
 * Código de NAVEGADOR. Subida directa a Storage con URL firmada, con
 * progreso (XMLHttpRequest: fetch no reporta lo que ya subió), reintentos
 * si se corta la conexión y cancelación.
 *
 * El formato es el de `uploadToSignedUrl` de @supabase/storage-js: PUT a la
 * URL firmada (el token va en la URL) con un FormData que lleva
 * `cacheControl` y el archivo en un campo de nombre vacío.
 */
export const INTENTOS_SUBIDA = 3;
const ESPERA_ENTRE_INTENTOS_MS = [1500, 4000];
const TOPE_SUBIDA_MS = 10 * 60_000;

export class SubidaCancelada extends Error {
  constructor() {
    super("Subida cancelada");
    this.name = "SubidaCancelada";
  }
}

/** Un error del servidor de Storage (no se reintenta: reintentar no lo arregla). */
class RechazoDeStorage extends Error {}

function unIntento(url: string, blob: Blob, onProgreso: (fraccion: number) => void, senal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cuerpo = new FormData();
    cuerpo.append("cacheControl", "3600");
    cuerpo.append("", blob);
    xhr.open("PUT", url);
    const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (llave) {
      xhr.setRequestHeader("apikey", llave);
      xhr.setRequestHeader("Authorization", `Bearer ${llave}`);
    }
    xhr.setRequestHeader("x-upsert", "false");
    xhr.timeout = TOPE_SUBIDA_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgreso(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgreso(1);
        resolve();
        return;
      }
      let mensaje = `Storage respondió ${xhr.status}`;
      try {
        const j = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        mensaje = j.message ?? j.error ?? mensaje;
      } catch {
        /* texto plano */
      }
      // 5xx se reintenta; 4xx (tamaño, tipo, URL vencida) no.
      if (xhr.status >= 500) reject(new Error(mensaje));
      else reject(new RechazoDeStorage(mensaje));
    };
    xhr.onerror = () => reject(new Error("Se cortó la conexión."));
    xhr.ontimeout = () => reject(new Error("La subida tardó demasiado."));
    xhr.onabort = () => reject(new SubidaCancelada());
    senal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(cuerpo);
  });
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sube `blob` a la URL firmada; reintenta si se corta. Lanza con un mensaje en español. */
export async function subirConProgreso(opciones: {
  url: string;
  blob: Blob;
  onProgreso?: (fraccion: number) => void;
  onReintento?: (intento: number) => void;
  senal?: AbortSignal;
}): Promise<void> {
  const { url, blob, onProgreso = () => {}, onReintento, senal } = opciones;
  let ultimo: unknown = null;
  for (let intento = 1; intento <= INTENTOS_SUBIDA; intento++) {
    if (senal?.aborted) throw new SubidaCancelada();
    try {
      onProgreso(0);
      await unIntento(url, blob, onProgreso, senal);
      return;
    } catch (e) {
      if (e instanceof SubidaCancelada) throw e;
      ultimo = e;
      if (e instanceof RechazoDeStorage) {
        throw new Error(traducirRechazo(e.message));
      }
      if (intento < INTENTOS_SUBIDA) {
        onReintento?.(intento + 1);
        await dormir(ESPERA_ENTRE_INTENTOS_MS[intento - 1] ?? 4000);
      }
    }
  }
  const detalle = ultimo instanceof Error ? ultimo.message : "";
  throw new Error(`No se pudo subir (${detalle || "sin conexión"}). Revisa tu conexión y vuelve a intentarlo.`);
}

function traducirRechazo(mensaje: string): string {
  if (/exceeded the maximum allowed size|too large|payload/i.test(mensaje)) {
    return "El archivo pesa más de lo que acepta el almacenamiento. Elige un video más corto o grábalo desde aquí.";
  }
  if (/mime|not supported/i.test(mensaje)) return "Ese tipo de archivo no se puede subir.";
  if (/expired|jwt|token/i.test(mensaje)) return "La subida caducó. Vuelve a intentarlo.";
  return `El almacenamiento rechazó el archivo (${mensaje}).`;
}
