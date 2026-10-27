import { ARTICULOS, NOMBRE_GRUPO, agrupar, textoPlano } from "@/lib/ayuda";
import { articuloConPrecios } from "@/lib/ayuda/precios";
import { preciosAyuda } from "@/lib/ayuda/precios-servidor";
import { todosLosArticulos } from "@/lib/peludesk/blog";
import { todosLosAterrizajes } from "@/lib/peludesk/aterrizajes";
import { REVISADO_ALTERNATIVAS, todasLasAlternativas, todasLasGuias } from "@/lib/peludesk/guias";
import { LUDOGTEKA } from "@/lib/peludesk/ludogteka";
import { pesos, planUnico } from "@/lib/peludesk/plan";
import { SITIO } from "@/lib/peludesk/seo";
import { FUNCIONES_VET, MODULOS_TRES, PREGUNTAS_VET } from "@/lib/peludesk/veterinaria";
import { EMPRESA } from "@/lib/peludesk/legal";
import { FUNCION_RECORDATORIOS, QUE_MANDA_RECORDATORIOS, recordatoriosVigentes } from "@/lib/peludesk/recordatorios";

/**
 * llms.txt (índice para asistentes de IA) y llms-full.txt (el contenido
 * completo). Se arman con las MISMAS fuentes que las páginas: el plan sale de
 * la base y los textos de content/ y de la ayuda, así nunca se desactualizan.
 */
const url = (ruta: string) => `${SITIO}${ruta}`;

async function precio(): Promise<string> {
  const plan = await planUnico();
  if (!plan) return "Un solo plan con todos los módulos, sin costo inicial y con 15 días de prueba sin tarjeta. El monto vigente está en " + url("/precios") + ".";
  return `Un solo plan: ${pesos(plan.mensual)} + IVA al mes (${pesos(plan.total)} con IVA), sin costo inicial, con todos los módulos. Plan anual: ${pesos(plan.anual)} + IVA (diez mensualidades por doce meses). 15 días de prueba gratis, sin tarjeta. Moneda: pesos mexicanos (MXN).`;
}

const RESUMEN =
  "PeluDesk es un software en español, hecho en México, para clínicas veterinarias, guarderías, hoteles y estéticas caninas. Reúne en una sola aplicación web (se instala desde el navegador) la agenda y las reservas con cupo, el expediente clínico, la caja con corte de turno, los contratos firmados desde el celular, el portal para dueños de mascotas, los recordatorios automáticos por WhatsApp (el cliente confirma con un botón) y la facturación CFDI 4.0.";

/** La función estrella: qué manda y cuánto cuesta (los mensajes gratis y el precio salen de la base). */
async function recordatorios(): Promise<string[]> {
  const r = await recordatoriosVigentes();
  return [`## ${FUNCION_RECORDATORIOS}`, "", ...QUE_MANDA_RECORDATORIOS.map((x) => `- ${x}`), `- Precio: ${r.cobro}`, `- Cómo se ve: ${url("/#recordatorios")}`, ""];
}

async function cabecera(): Promise<string[]> {
  return [
    "# PeluDesk",
    "",
    `> ${RESUMEN}`,
    "",
    "## Qué es y para quién",
    "",
    "- Para: dueños y equipos de clínicas veterinarias, guarderías caninas, hoteles caninos y estéticas caninas en México.",
    "- Módulos (se prenden o apagan por negocio): " + MODULOS_TRES.map((m) => m.nombre).join(", ") + ". También caja, clientes, inventario, empleados y nómina, gastos, reportes, contratos y página web del negocio.",
    "- Idioma: español de México. Precios en pesos.",
    "- Empresa: " + EMPRESA.razonSocial + ", " + EMPRESA.domicilio + ". Contacto: " + EMPRESA.correo + ".",
    "",
    "## Precio",
    "",
    await precio(),
    "",
    ...(await recordatorios()),
  ];
}

export async function llmsTxt(): Promise<string> {
  const l = await cabecera();
  const linea = (ruta: string, titulo: string, desc: string) => `- [${titulo}](${url(ruta)}): ${desc}`;
  l.push("## Páginas principales", "");
  l.push(linea("/", "Inicio", "Qué es PeluDesk, módulos y demo."));
  l.push(linea("/precios", "Precios", "El plan único, qué incluye y preguntas sobre el costo."));
  l.push(linea("/registro", "Prueba gratis", "Registro para probar 15 días sin tarjeta."));
  l.push(linea("/veterinaria", "Software para veterinarias", "Expediente, carnet con QR, recetas alineadas al SITPV, hospitalización e inventario con lotes."));
  for (const a of todosLosAterrizajes()) l.push(linea(`/${a.slug}`, a.titulo.replace(" | PeluDesk", ""), a.descripcion));
  l.push("", "## Guías por tema", "");
  for (const g of todasLasGuias()) l.push(linea(`/guias/${g.slug}`, g.h1, g.descripcion));
  l.push("", "## Comparativas con otras alternativas", "");
  l.push(linea("/alternativas", "Alternativas a PeluDesk", `Comparativa de software para negocios caninos (revisada el ${REVISADO_ALTERNATIVAS}).`));
  for (const a of todasLasAlternativas()) l.push(linea(`/alternativas/${a.slug}`, `PeluDesk frente a ${a.nombre}`, a.resumen));
  l.push("", "## Centro de ayuda", "");
  l.push(linea("/ayuda", "Centro de ayuda", `${ARTICULOS.length} artículos paso a paso, agrupados por módulo.`));
  for (const g of agrupar(ARTICULOS)) l.push(`- ${g.nombre}: ${g.articulos.length} artículos, por ejemplo [${g.articulos[0].titulo}](${url(`/ayuda/${g.articulos[0].slug}`)})`);
  l.push(linea("/ayuda/videos", "Videos tutoriales", "Cada tarea explicada en video."));
  l.push("", "## Blog", "");
  for (const a of todosLosArticulos()) l.push(linea(`/blog/${a.slug}`, a.titulo, a.descripcion));
  l.push("", "## Opcional", "");
  l.push(`- [llms-full.txt](${url("/llms-full.txt")}): todo el contenido anterior en un solo archivo.`);
  l.push(`- [Aviso de privacidad](${url("/aviso-de-privacidad")}) · [Términos](${url("/terminos")})`);
  l.push(`- [Caso Ludogteka](${LUDOGTEKA.url}): negocio canino de ${LUDOGTEKA.ciudad} que usa PeluDesk.`, "");
  return l.join("\n");
}

export async function llmsFull(): Promise<string> {
  const [l, precios] = await Promise.all([cabecera(), preciosAyuda()]);
  l.push("## Veterinaria", "");
  for (const f of FUNCIONES_VET) l.push(`- ${f.titulo}: ${f.texto}`);
  l.push("", "### Preguntas frecuentes de Veterinaria", "");
  for (const [q, r] of PREGUNTAS_VET) l.push(`**${q}** ${r}`, "");
  l.push("## Módulos", "");
  for (const m of MODULOS_TRES) l.push(`- ${m.nombre}: ${m.texto}`);
  l.push("", `## Caso: ${LUDOGTEKA.nombre}`, "", LUDOGTEKA.intro, "");
  for (const a of todosLosAterrizajes()) {
    l.push(`## ${a.h1}`, "", `URL: ${url(`/${a.slug}`)}`, "", a.gancho, "");
    for (const x of a.alivios) l.push(`- Antes: ${x.antes}. Ahora: ${x.ahora}`);
    l.push("");
    for (const f of a.funciones) l.push(`- ${f.titulo}: ${f.texto}`);
    l.push("");
    for (const [q, r] of a.preguntas) l.push(`**${q}** ${r}`, "");
  }
  for (const g of todasLasGuias()) {
    l.push(`## ${g.h1}`, "", `URL: ${url(`/guias/${g.slug}`)}`, "", g.gancho, "");
    for (const s of g.secciones) {
      l.push(`### ${s.h2}`, "");
      for (const p of s.parrafos ?? []) l.push(p, "");
      for (const x of s.lista ?? []) l.push(`- ${x}`);
      if (s.lista) l.push("");
    }
    for (const [q, r] of g.preguntas) l.push(`**${q}** ${r}`, "");
  }
  l.push(`## Alternativas (revisado el ${REVISADO_ALTERNATIVAS})`, "");
  for (const a of todasLasAlternativas()) {
    l.push(`### ${a.nombre}`, "", `URL: ${url(`/alternativas/${a.slug}`)} · Sitio: ${a.sitio}`, "", a.resumen, "", `- Giro: ${a.giro}`, `- Precio: ${a.precio}`, `- Recordatorios por WhatsApp: ${a.recordatorios === "—" ? "no verificado" : a.recordatorios}`, `- Idioma: ${a.idioma}`, `- CFDI: ${a.cfdi}`, `- Pagos: ${a.pagos}`, `- Qué trae: ${a.modulos}`, `- Mejor que PeluDesk en: ${a.mejorEn.join(" ")}`, `- Conviene si: ${a.conviene.join(" ")}`, `- Fuentes: ${[...new Set(Object.values(a.fuentes).flat().map((f) => f.url))].join(" · ")}`, "");
  }
  l.push("## Centro de ayuda (texto completo)", "");
  for (const a of ARTICULOS) {
    l.push(`### ${a.titulo}`, "", `URL: ${url(`/ayuda/${a.slug}`)} · Sección: ${NOMBRE_GRUPO[a.grupo]}`, "", a.resumen, "", textoPlano(articuloConPrecios(a, precios)), "");
  }
  return l.join("\n");
}
