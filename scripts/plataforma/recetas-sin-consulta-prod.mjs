// QA S53 (N157): recetas emitidas que quedaron SIN consulta (vet_recetas.consulta_id null) y que con certeza salieron de
// una consulta: misma mascota, mismo médico, la consulta se creó ANTES de la receta y la receta se emitió dentro de los
// 15 minutos siguientes a crearla o a firmarla, y no hay otra consulta de esa mascota en ese tramo. Una receta «desde
// la ficha» (sin consulta a propósito) no cumple eso y se deja como está.
//
//   node scripts/plataforma/recetas-sin-consulta-prod.mjs            (solo lista)
//   node scripts/plataforma/recetas-sin-consulta-prod.mjs --aplicar  (liga las que cumplen; nunca toca Ludogteka)
//
// Es la SQL operativa tolerada en producción (un administrador de la app resolviendo un caso puntual, sin cambio de
// esquema): queda documentada en docs/OPERACIONES-PRODUCCION.md. Las llaves se leen al vuelo y nunca se imprimen.
import { servicioSinNegocio, servicioEn, LUDOGTEKA_ID } from "../lib/prod.mjs";

const APLICAR = process.argv.includes("--aplicar");
const VENTANA_MIN = 15;
const S = servicioSinNegocio();
const { data: negocios } = await S.from("negocios").select("id, slug");
const slugDe = Object.fromEntries((negocios ?? []).map((n) => [n.id, n.slug]));
const { data: sin, error } = await S.from("vet_recetas").select("id, numero, negocio_id, perro_id, medico_id, created_at").is("consulta_id", null).is("deleted_at", null).order("created_at");
if (error) throw error;
console.log(`Recetas sin consulta en producción: ${sin.length}`);

const minutos = (a, b) => (new Date(a) - new Date(b)) / 60000;
let ligadas = 0;
for (const r of sin) {
  if (r.negocio_id === LUDOGTEKA_ID) { console.log(`  · ${slugDe[r.negocio_id]} N.º ${r.numero}: Ludogteka, no se toca`); continue; }
  const N = servicioEn(r.negocio_id);
  const { data: consultas } = await N.from("vet_consultas").select("id, estado, medico_id, created_at, firmada_at").eq("negocio_id", r.negocio_id).eq("perro_id", r.perro_id).is("deleted_at", null).order("created_at");
  const candidatas = (consultas ?? []).filter((c) => {
    if (c.medico_id !== r.medico_id || c.estado === "anulada") return false;
    const desdeCreada = minutos(r.created_at, c.created_at);
    const desdeFirma = c.firmada_at ? minutos(r.created_at, c.firmada_at) : null;
    return desdeCreada >= 0 && (desdeCreada <= VENTANA_MIN || (desdeFirma !== null && Math.abs(desdeFirma) <= VENTANA_MIN));
  });
  const etiqueta = `${slugDe[r.negocio_id]} · receta N.º ${r.numero} (${r.id.slice(0, 8)}, ${r.created_at})`;
  if (candidatas.length !== 1) {
    console.log(`  · ${etiqueta}: ${candidatas.length === 0 ? "sin consulta que cuadre (se queda como «desde la ficha»)" : `${candidatas.length} consultas cuadran: no se decide sola`}`);
    continue;
  }
  const c = candidatas[0];
  console.log(`  ✔ ${etiqueta} → consulta ${c.id.slice(0, 8)} (${c.estado}, creada ${c.created_at}, firmada ${c.firmada_at ?? "—"})${APLICAR ? "" : " [se ligaría con --aplicar]"}`);
  if (APLICAR) {
    const { error: e } = await N.from("vet_recetas").update({ consulta_id: c.id }).eq("id", r.id).eq("negocio_id", r.negocio_id).is("consulta_id", null);
    if (e) console.log(`    ✘ no se pudo: ${e.message}`);
    else ligadas++;
  }
}
console.log(APLICAR ? `\nLigadas: ${ligadas}.` : "\nNada se escribió (sin --aplicar).");
