// Hook SessionStart (.claude/settings.json). En la computadora del dueño no
// hace nada; en una sesión de la nube (CLAUDE_CODE_REMOTE=true) vuelve a
// correr el arranque, que es idempotente, por si el repo cambió de
// dependencias desde que se guardó la caché del entorno. La salida completa
// va a un archivo: lo que imprime un hook entra al contexto de la sesión.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CLAUDE_CODE_REMOTE === "true") {
  const bitacora = path.join(os.tmpdir(), "preparar-entorno.log");
  const salida = fs.openSync(bitacora, "w");
  const r = spawnSync("bash", [fileURLToPath(new URL("./preparar-entorno.sh", import.meta.url))], { stdio: ["ignore", salida, salida] });
  fs.closeSync(salida);
  const texto = fs.readFileSync(bitacora, "utf8");
  // Un arranque a medias no debe impedir que la sesión abra: se reporta y ya.
  const avisos = texto.split("\n").filter((l) => /AVISO|ERROR/.test(l));
  console.log(
    r.status === 0
      ? `Entorno de la nube listo (bitácora: ${bitacora}).${avisos.length ? "\n" + avisos.join("\n") : ""}`
      : `scripts/nube/preparar-entorno.sh falló (código ${r.status}). Últimas líneas de ${bitacora}:\n` +
          texto.trim().split("\n").slice(-15).join("\n")
  );
}
