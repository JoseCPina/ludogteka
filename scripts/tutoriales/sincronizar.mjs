// Pasa el catálogo (catalogo.mjs) a la tabla `tutoriales` (sin tocar lo ya producido).
//   node scripts/tutoriales/sincronizar.mjs [--prod]
import { VIDEOS } from "./catalogo.mjs";
import { conectar, rpc } from "./lib/db.mjs";

export async function sincronizarCatalogo(c) {
  // Por número (no por texto: «100» iría antes que «11»); el 00 (avance) va al final, como en la cola.
  const num = (v) => (v.id === "00" ? 999 : Number(v.id));
  const ordenados = [...VIDEOS].sort((a, b) => num(a) - num(b));
  const filas = ordenados.map((v, i) => ({
    numero: v.id, slug: v.slug, area: v.area, orden: i, titulo: v.titulo, resumen: v.resumen, rol: v.rol,
    etiquetas: v.etiquetas, modulos: v.modulos, permisos: v.permisos, articulos: v.articulos, rutas: v.rutas,
    duracion_s: v.duracion, siguiente: ordenados[i + 1]?.slug ?? null,
    descripcion: v.resumen,
  }));
  return rpc(c, "plataforma_tutoriales_sincronizar", { p_filas: filas });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = conectar(process.argv.includes("--prod"));
  console.log(`${c.prod ? "PRODUCCIÓN" : "desarrollo"}: ${await sincronizarCatalogo(c)} videos sincronizados.`);
}
