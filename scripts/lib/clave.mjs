// Contraseñas de cuentas de prueba y de siembra: SIEMPRE generadas al momento, nunca escritas en el código.
//
// Ningún script de este repo trae una contraseña literal (ni con prefijo, ni derivada de un sufijo que se vea en el
// código): una cuenta que solo se usa por enlace mágico (el corredor de tutoriales, «Ver demo») nace con una clave
// aleatoria que nadie guarda; una cuenta que una prueba abre por pantalla recibe la suya en memoria, la usa y la olvida.
// El escaneo de secretos (scripts/seguridad/escanear-secretos.mjs) rechaza una contraseña escrita como literal y parecidos.
import crypto from "node:crypto";

/** 24 bytes aleatorios en base64url (32 caracteres): para createUser/updateUserById de cuentas de prueba o de siembra. */
export function claveAleatoria() {
  return crypto.randomBytes(24).toString("base64url");
}
