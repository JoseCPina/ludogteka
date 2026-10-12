// Videollamada de la teleconsulta: el proveedor va detrás de esta interfaz, nada más habla con él.
//
// Proveedor elegido: Daily (daily.co). Por qué:
//  · El cliente entra desde el NAVEGADOR del celular (Safari y Chrome), sin instalar nada: su
//    interfaz «prebuilt» ya trae video, audio, silenciar, cambiar de cámara y chat.
//  · Salas PRIVADAS: solo entra quien trae un token que firmamos nosotros, con vencimiento
//    (`exp`/`nbf`) y expulsión al vencer: la ventana de la cita se hace cumplir en el proveedor,
//    no solo en nuestra pantalla. Un token distinto para el médico (moderador) y para el dueño.
//  · Sin grabación: ni la sala ni los tokens la habilitan.
//  · Cobra por minuto de participante con 10,000 minutos gratis al mes (con una consulta de
//    30 minutos entre dos personas son 60 minutos: unas 160 consultas gratis al mes); después
//    del orden de 0.004 USD por minuto de participante. Red global con servidores en América
//    (buena calidad desde México), API REST sencilla y sin servidores propios que mantener.
//  Alternativas: Whereby (parecido, planes por sala; menos control de la ventana por token),
//  LiveKit (más barato y flexible, pero habría que construir y mantener la interfaz de video) y
//  Jitsi (gratis, pero en el celular obliga a instalar su app y no permite ventana por token).
// Si cambia el proveedor, solo cambia este archivo y el registro (`proveedor` de vet_telemedicina).
//
// La llave (DAILY_API_KEY) vive en las variables de entorno de Vercel: nunca en el repo.
// Fuera de producción, DAILY_API_URL apunta a un doble de pruebas; en producción se ignora.
// Sin llave: fuera de producción y en el demo la sala es SIMULADA; en producción no se crean salas.
import { randomBytes } from "node:crypto";

export type ProveedorId = "daily" | "simulado";

export type SalaVideo = { proveedor: ProveedorId; nombre: string; url: string };

export class ErrorVideo extends Error {
  constructor(mensaje: string, readonly transitorio = false) {
    super(mensaje);
  }
}

export interface ProveedorVideo {
  readonly id: ProveedorId;
  crearSala(opciones: { vencimiento: Date }): Promise<SalaVideo>;
  /** La URL a la que entra una persona (con su token). El token vence cuando termina la ventana. */
  urlDeEntrada(opciones: { sala: SalaVideo; nombre: string; esMedico: boolean; desde: Date; hasta: Date }): Promise<string>;
  borrarSala(nombre: string): Promise<void>;
}

const TIMEOUT_MS = 15_000;
const epoch = (d: Date) => Math.floor(d.getTime() / 1000);

function baseDaily(): string {
  const sustituto = process.env.VERCEL_ENV !== "production" ? process.env.DAILY_API_URL?.trim().replace(/\/$/, "") : "";
  return sustituto || "https://api.daily.co/v1";
}

export function videoConfigurado(): boolean {
  return Boolean(process.env.DAILY_API_KEY?.trim());
}

class Daily implements ProveedorVideo {
  readonly id = "daily" as const;
  constructor(private llave: string) {}

  private async llamar<T>(ruta: string, opciones: { method?: string; cuerpo?: unknown } = {}): Promise<T> {
    let r: Response;
    try {
      r = await fetch(`${baseDaily()}${ruta}`, {
        method: opciones.method ?? "GET",
        headers: { Authorization: `Bearer ${this.llave}`, "content-type": "application/json" },
        body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ErrorVideo("No se pudo comunicar con el servicio de videollamada. Intenta de nuevo.", true);
    }
    const cuerpo = (await r.json().catch(() => ({}))) as T & { error?: string; info?: string };
    if (!r.ok) {
      console.error("[telemedicina] Daily rechazó la petición", r.status, ruta, String(cuerpo.info ?? cuerpo.error ?? "").slice(0, 200));
      if (r.status === 401 || r.status === 403) throw new ErrorVideo("El servicio de videollamada rechazó la llave de PeluDesk. Avísale a PeluDesk.");
      throw new ErrorVideo("El servicio de videollamada no pudo crear la sala. Intenta de nuevo.", r.status === 429 || r.status >= 500);
    }
    return cuerpo;
  }

  async crearSala({ vencimiento }: { vencimiento: Date }): Promise<SalaVideo> {
    const nombre = `pd-${randomBytes(9).toString("hex")}`;
    const sala = await this.llamar<{ name: string; url: string }>("/rooms", {
      method: "POST",
      cuerpo: {
        name: nombre,
        privacy: "private", // solo entra quien trae token
        properties: {
          exp: epoch(vencimiento),
          eject_at_room_exp: true,
          max_participants: 4,
          enable_chat: true,
          enable_screenshare: false,
          enable_knocking: false,
          lang: "es",
          // Sin grabación: ni se habilita en la sala ni en los tokens.
        },
      },
    });
    return { proveedor: "daily", nombre: sala.name, url: sala.url };
  }

  async urlDeEntrada({ sala, nombre, esMedico, desde, hasta }: { sala: SalaVideo; nombre: string; esMedico: boolean; desde: Date; hasta: Date }): Promise<string> {
    const token = await this.llamar<{ token: string }>("/meeting-tokens", {
      method: "POST",
      cuerpo: {
        properties: {
          room_name: sala.nombre,
          user_name: nombre.slice(0, 60),
          is_owner: esMedico, // el médico modera la sala
          nbf: epoch(desde),
          exp: epoch(hasta),
          eject_at_token_exp: true,
          enable_screenshare: esMedico,
          start_video_off: false,
          start_audio_off: false,
        },
      },
    });
    return `${sala.url}?t=${token.token}`;
  }

  async borrarSala(nombre: string): Promise<void> {
    await this.llamar(`/rooms/${encodeURIComponent(nombre)}`, { method: "DELETE" }).catch(() => undefined);
  }
}

/** La «sala» del demo y de las pruebas: no sale a ninguna red. */
class Simulado implements ProveedorVideo {
  readonly id = "simulado" as const;
  async crearSala(): Promise<SalaVideo> {
    const nombre = `sim-${randomBytes(6).toString("hex")}`;
    return { proveedor: "simulado", nombre, url: `simulada://${nombre}` };
  }
  async urlDeEntrada({ sala, esMedico }: { sala: SalaVideo; esMedico: boolean }): Promise<string> {
    return `${sala.url}?rol=${esMedico ? "medico" : "dueno"}`;
  }
  async borrarSala(): Promise<void> {}
}

/**
 * El proveedor para un negocio. El demo siempre simula, salvo para las cuentas del corredor de videos tutoriales
 * (`corredor`, ver corredor.ts), que sí crean salas reales si hay llave; sin llave, fuera de producción también simula;
 * en producción sin llave no se crea ninguna sala (se dice claro qué falta).
 */
export function proveedorDeVideo(opciones: { demo?: boolean; corredor?: boolean } = {}): ProveedorVideo {
  const llave = process.env.DAILY_API_KEY?.trim();
  if (opciones.demo && !(opciones.corredor && llave)) return new Simulado();
  if (llave) return new Daily(llave);
  if (process.env.VERCEL_ENV !== "production") return new Simulado();
  throw new ErrorVideo("La videollamada todavía no está configurada en PeluDesk (falta la llave del proveedor de video). Avísale a PeluDesk.");
}

/** Para entrar a una sala ya creada: el proveedor es el que la creó. */
export function proveedorDeSala(id: string, opciones: { demo?: boolean } = {}): ProveedorVideo {
  return id === "simulado" ? new Simulado() : proveedorDeVideo({ demo: false, ...opciones });
}
