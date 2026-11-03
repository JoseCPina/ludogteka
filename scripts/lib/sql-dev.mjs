// SQL de LECTURA contra la base de DESARROLLO sin la API de gestión: por el CLI de Supabase (`supabase db query --linked`),
// que tiene su sesión en el Administrador de credenciales de Windows. Para las auditorías que necesitan leer el catálogo
// (pg_policies, information_schema…) en una máquina sin SUPABASE_ACCESS_TOKEN en el entorno (la PC, 1 de noviembre de 2026).
// Devuelve las filas como objetos, igual que `clienteApi(DEV).sql`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export async function sqlDesarrollo(consulta) {
  const archivo = path.join(os.tmpdir(), `peludesk-sql-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(archivo, consulta);
  try {
    const salida = execFileSync(process.execPath, [path.join("node_modules", "supabase", "dist", "supabase.js"), "db", "query", "--linked", "-f", archivo], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const i = salida.indexOf("{");
    if (i < 0) throw new Error(`sin respuesta JSON del CLI: ${salida.slice(0, 200)}`);
    const j = JSON.parse(salida.slice(i));
    if (j.error) throw new Error(typeof j.error === "string" ? j.error : JSON.stringify(j.error));
    return j.rows ?? [];
  } finally {
    fs.rmSync(archivo, { force: true });
  }
}

/** Un «cliente» con la misma forma que `clienteApi(DEV)` para lo que solo lee: `{ sql }`. */
export const apiLecturaDesarrollo = { sql: sqlDesarrollo };
