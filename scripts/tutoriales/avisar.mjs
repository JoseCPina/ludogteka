// Encola un aviso para la bandeja de Telegram de PeluDesk (producción).
//   node scripts/tutoriales/avisar.mjs "texto del aviso"
// Telegram no se alcanza desde las sesiones de la nube: el aviso queda en
// `avisos_operador` y la tarea /api/cron/avisos (cada 5 minutos) lo manda.
import { conectar, rpc } from "./lib/db.mjs";

export async function avisar(texto, { prod = true } = {}) {
  const c = conectar(prod);
  return rpc(c, "plataforma_aviso_encolar", { p_texto: texto });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const texto = process.argv.slice(2).join(" ").trim();
  if (!texto) throw new Error("Uso: node scripts/tutoriales/avisar.mjs \"texto\"");
  console.log("Aviso encolado:", await avisar(texto));
}
