import { createHash } from "node:crypto";

/**
 * IndexNow (Bing, Yandex, Seznam, Naver): avisa de las URL nuevas o cambiadas
 * sin pasar por una consola de webmasters. La llave es PÚBLICA por diseño (el
 * protocolo la publica en un archivo del sitio para comprobar que el sitio es
 * tuyo), así que se deriva de un texto fijo: no es un secreto.
 */
export const INDEXNOW_LLAVE = createHash("sha256").update("peludesk.mx/indexnow/v1").digest("hex").slice(0, 32);
export const INDEXNOW_ARCHIVO = "/indexnow-key.txt";
