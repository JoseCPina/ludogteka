import { normalizarTelefono } from "@/lib/telefono";

/**
 * Cómo se identifica una persona ante la app.
 *
 * El cliente entra con su TELÉFONO. Supabase Auth, por debajo, sigue
 * identificando por correo: habilitar teléfono de verdad exige contratar
 * un proveedor de SMS, y el negocio decidió expresamente no verificar
 * números. Así que el teléfono se traduce a un correo sintético.
 *
 * Ese correo no existe como buzón, nadie lo teclea y nadie lo recibe. Es
 * un identificador interno con forma de correo porque es la forma que
 * Auth entiende.
 *
 * Las cuentas creadas ANTES de este cambio tienen un correo de verdad y
 * siguen entrando con él: por eso el login resuelve el correo REGISTRADO
 * (email_de_login_por_telefono) en vez de calcularlo. Calcularlo dejaría
 * fuera a todo el que ya existía.
 */
const DOMINIO_SINTETICO = "telefono.ludogteka.mx";

export function correoSinteticoDeTelefono(telefono: string): string {
  const digitos = normalizarTelefono(telefono);
  if (!digitos) throw new Error("Teléfono inválido para derivar el correo interno.");
  return `t${digitos}@${DOMINIO_SINTETICO}`;
}

export function esCorreoSintetico(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${DOMINIO_SINTETICO}`));
}

/**
 * Qué escribió quien está intentando entrar.
 *
 * La pantalla tiene un solo campo a propósito: el cliente sabe su
 * teléfono, el staff sabe su correo, y ninguno de los dos debería tener
 * que averiguar cuál de dos pestañas le toca. Diez dígitos es un
 * teléfono; algo con arroba es un correo.
 */
export function clasificarIdentificador(
  valor: string
): { tipo: "telefono"; telefono: string } | { tipo: "email"; email: string } | { tipo: "invalido" } {
  const limpio = valor.trim();
  if (!limpio) return { tipo: "invalido" };

  const telefono = normalizarTelefono(limpio);
  if (telefono) return { tipo: "telefono", telefono };

  if (limpio.includes("@") && limpio.length > 3) {
    return { tipo: "email", email: limpio.toLowerCase() };
  }
  return { tipo: "invalido" };
}

/**
 * Contraseña temporal legible, para que recepción se la dicte o se la
 * mande por WhatsApp sin que la persona la teclee mal.
 *
 * Sin caracteres que se confunden al leerlos en voz alta o en la pantalla
 * de un celular (0/O, 1/l/I) y sin símbolos, que en un teclado móvil son
 * tres toques cada uno. La seguridad de esto no está en la entropía de la
 * cadena sino en que dura lo que tarda el dueño en entrar y cambiarla.
 */
const ALFABETO_CLARO = "abcdefghjkmnpqrstuvwxyz23456789";

export function generarPasswordTemporal(largo = 10): string {
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO_CLARO[b % ALFABETO_CLARO.length]).join("");
}
