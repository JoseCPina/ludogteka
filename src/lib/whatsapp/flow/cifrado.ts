// Cifrado del endpoint de WhatsApp Flows (data exchange). Meta manda cada petición cifrada con una llave AES-128 al
// azar (AES-GCM, la etiqueta de 16 bytes al final), y esa llave cifrada con NUESTRA llave pública RSA (OAEP con
// SHA-256). La respuesta va cifrada con la misma llave AES y el vector inicial con cada bit invertido, en base64 y
// como texto plano. Sin imports de valores fuera de node:crypto: lo usan la ruta, la auditoría y el script de Meta
// (`node` quita los tipos solo).
import { constants, createCipheriv, createDecipheriv, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";

export type PeticionCifrada = { encrypted_flow_data: string; encrypted_aes_key: string; initial_vector: string };

export function esPeticionCifrada(x: unknown): x is PeticionCifrada {
  const p = x as Partial<PeticionCifrada> | null;
  return Boolean(p && typeof p.encrypted_flow_data === "string" && typeof p.encrypted_aes_key === "string" && typeof p.initial_vector === "string");
}

const ETIQUETA = 16;

/** Lanza si la llave privada no es la que corresponde o el contenido no cuadra (la ruta contesta 421). */
export function descifrarPeticion(p: PeticionCifrada, llavePrivadaPem: string, frase?: string): { datos: Record<string, unknown>; aes: Buffer; iv: Buffer } {
  const aes = privateDecrypt(
    { key: llavePrivadaPem, passphrase: frase || undefined, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(p.encrypted_aes_key, "base64"),
  );
  const iv = Buffer.from(p.initial_vector, "base64");
  const todo = Buffer.from(p.encrypted_flow_data, "base64");
  const d = createDecipheriv(algoritmo(aes), aes, iv);
  d.setAuthTag(todo.subarray(todo.length - ETIQUETA));
  const claro = Buffer.concat([d.update(todo.subarray(0, todo.length - ETIQUETA)), d.final()]).toString("utf8");
  const datos = JSON.parse(claro) as Record<string, unknown>;
  return { datos, aes, iv };
}

export function cifrarRespuesta(respuesta: unknown, aes: Buffer, iv: Buffer): string {
  const invertido = Buffer.from(iv.map((b) => ~b & 0xff));
  const c = createCipheriv(algoritmo(aes), aes, invertido);
  return Buffer.concat([c.update(JSON.stringify(respuesta), "utf8"), c.final(), c.getAuthTag()]).toString("base64");
}

// Lo que hace Meta del otro lado: lo usan la auditoría y la prueba en producción.
export function cifrarPeticion(datos: unknown, llavePublicaPem: string): { peticion: PeticionCifrada; aes: Buffer; iv: Buffer } {
  const aes = randomBytes(16);
  const iv = randomBytes(16);
  const c = createCipheriv("aes-128-gcm", aes, iv);
  const cuerpo = Buffer.concat([c.update(JSON.stringify(datos), "utf8"), c.final(), c.getAuthTag()]);
  const llave = publicEncrypt({ key: llavePublicaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, aes);
  return { peticion: { encrypted_flow_data: cuerpo.toString("base64"), encrypted_aes_key: llave.toString("base64"), initial_vector: iv.toString("base64") }, aes, iv };
}

export function descifrarRespuesta(b64: string, aes: Buffer, iv: Buffer): unknown {
  const invertido = Buffer.from(iv.map((b) => ~b & 0xff));
  const todo = Buffer.from(b64, "base64");
  const d = createDecipheriv(algoritmo(aes), aes, invertido);
  d.setAuthTag(todo.subarray(todo.length - ETIQUETA));
  return JSON.parse(Buffer.concat([d.update(todo.subarray(0, todo.length - ETIQUETA)), d.final()]).toString("utf8"));
}

function algoritmo(aes: Buffer): "aes-128-gcm" | "aes-256-gcm" {
  return aes.length === 32 ? "aes-256-gcm" : "aes-128-gcm";
}
