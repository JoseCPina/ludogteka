/**
 * El mensaje del resumen diario: HTML de Telegram, corto, para leerse de un
 * vistazo en el celular. Lo que no se pudo leer sale como «No pude leer X:
 * motivo»; lo que no hay, no se rellena. Teléfonos solo con los últimos 4
 * dígitos; nunca se transcribe un mensaje de WhatsApp.
 */
import { escaparHtml } from "@/lib/whatsapp/agente";
import { TASA_IVA } from "@/lib/cobro/iva";
import { TITULOS } from "@/lib/redes/serie";
import type { Ajustes } from "./ajustes";
import { PRESUPUESTO_MES_PESOS, RITMO_DIARIO_PESOS, TOPE_MENSAJE, type Seccion } from "./config";
import type { Comentario, DatosCampana, DatosFb, DatosIg, DatosInternos, DatosTikTok, Fuente, M } from "./fuentes";

export type Foto = { fb: number | null; ig: number | null; tt: number | null; mrr_centavos: number | null; pruebas_activas: number | null; faltan: string[] };

export type Reunido = {
  dia: string;
  lunes: boolean;
  ajustes: Ajustes;
  db: Fuente<DatosInternos>;
  ig: Fuente<DatosIg>;
  fb: Fuente<DatosFb>;
  tt: Fuente<DatosTikTok>;
  camp: Fuente<DatosCampana>;
  token: Fuente<{ valido: boolean; caducaEnDias: number | null; accesoEnDias: number | null }>;
  previo: Foto | null;
};

const esc = escaparHtml;
const num = (n: number) => n.toLocaleString("es-MX");
const pesos = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const centavos = (c: number) => pesos(c / 100);
const titulo = (video: string) => TITULOS[video] ?? video;
const RED: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
const FORMATO: Record<string, string> = { reel: "reel", muro: "muro", borrador: "borrador" };
const recorta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const cambio = (a: number, b: number | null | undefined) => (b == null ? "" : ` (ayer ${num(b)})`);
const delta = (a: number | null, b: number | null | undefined) => (a == null || b == null ? "" : a - b === 0 ? " (igual)" : ` (${a - b > 0 ? "+" : "−"}${num(Math.abs(a - b))})`);
const noPude = (que: string, f: Fuente<unknown> & { ok: false }) => `No pude leer ${que}: ${esc(f.motivo)}`;
const pl = (n: number, uno: string, varios: string) => `${num(n)} ${n === 1 ? uno : varios}`;
const tiempo = (s: number) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

export function etiquetaDia(dia: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${dia}T12:00:00Z`)).replace(/\./g, "");
}

export function fotoDe(r: Reunido): Foto {
  return {
    fb: r.fb.ok ? r.fb.datos.seguidores : null,
    ig: r.ig.ok ? r.ig.datos.seguidores : null,
    tt: r.tt.ok ? r.tt.datos.seguidores : null,
    mrr_centavos: r.db.ok ? r.db.datos.negocios.mrr_centavos : null,
    pruebas_activas: r.db.ok ? r.db.datos.negocios.pruebas_activas : null,
    faltan: [...(r.ig.ok ? r.ig.datos.faltan : []), ...(r.tt.ok ? r.tt.datos.faltan : [])],
  };
}

export function fuentesFallidas(r: Reunido): string[] {
  const x: [string, Fuente<unknown>][] = [["base de datos", r.db], ["Instagram", r.ig], ["Facebook", r.fb], ["TikTok", r.tt], ["campaña de Meta", r.camp], ["token de Meta", r.token]];
  return x.filter(([, f]) => !f.ok).map(([n]) => n);
}

// ── Atención ──
function atencion(r: Reunido): string[] {
  const a: string[] = [];
  const { ajustes } = r;
  if (r.camp.ok) {
    for (const x of r.camp.datos.anuncios) if (x.problema) a.push(`Anuncio «${esc(x.nombre)}»: ${esc(x.problema)}`);
    const regsReales = r.db.ok ? r.db.datos.registros.campana_dia : 0;
    if (r.camp.datos.dia.gasto >= ajustes.umbralGasto && r.camp.datos.dia.registros === 0 && regsReales === 0) a.push(`Ayer se gastaron ${pesos(r.camp.datos.dia.gasto)} en la campaña y no hubo ningún registro.`);
  }
  if (r.db.ok) {
    const n = r.db.datos.negocios;
    if (n.pagos_fallidos_dia > 0) a.push(`${num(n.pagos_fallidos_dia)} ${n.pagos_fallidos_dia === 1 ? "pago fallido" : "pagos fallidos"} ayer.`);
    if (n.en_gracia.length) a.push(`En gracia o solo lectura por pago (${num(n.en_gracia.length)}): ${n.en_gracia.slice(0, 5).map((x) => `${esc(x.nombre)} (${x.estado === "gracia" ? "gracia" : "solo lectura"})`).join(", ")}${n.en_gracia.length > 5 ? ` y ${num(n.en_gracia.length - 5)} más` : ""}.`);
    const c = r.db.datos.chats;
    if (c.sin_contestar.length) a.push(`${num(c.sin_contestar.length)} ${c.sin_contestar.length === 1 ? "hilo de WhatsApp escalado" : "hilos de WhatsApp escalados"} sin contestar hace más de ${ajustes.umbralHoras} h: ${c.sin_contestar.slice(0, 5).map((h) => `…${esc(h.tel4)} (${h.horas} h)`).join(", ")}.`);
    if (c.ia_ultimo === "error") a.push(`IA caída, contestar a mano (${num(c.ia_errores_24h)} ${c.ia_errores_24h === 1 ? "error" : "errores"} en 24 h).`);
    for (const p of r.db.datos.redes.con_problema) a.push(`Publicación «${esc(titulo(p.video))}» en ${RED[p.red] ?? p.red}: ${p.estado === "revisar" ? "quedó en Revisar" : "falló"}${p.error ? ` — ${esc(recorta(p.error, 100))}` : ""}.`);
  }
  if (r.token.ok) {
    const t = r.token.datos;
    if (!t.valido) a.push("El token de Meta ya no sirve (caducado o revocado): hay que generar otro.");
    else if (t.caducaEnDias !== null && t.caducaEnDias <= 7) a.push(`El token de Meta caduca en ${Math.max(0, t.caducaEnDias)} días.`);
    else if (t.accesoEnDias !== null && t.accesoEnDias <= 7) a.push(`El acceso a datos del token de Meta vence en ${Math.max(0, t.accesoEnDias)} días.`);
  }
  if (!r.tt.ok) a.push(`TikTok: ${esc(r.tt.motivo)}`);
  return a;
}

// ── Secciones ──
function publicaciones(r: Reunido): string[] {
  const l = ["<b>PUBLICACIONES</b>"];
  if (!r.db.ok) return [...l, noPude("las publicaciones", r.db)];
  const { redes } = r.db.datos;
  if (!redes.publicadas.length) l.push("Ayer no salió nada.");
  for (const p of redes.publicadas) {
    const num_: string[] = [];
    if (p.red === "instagram" && r.ig.ok) {
      const f = r.ig.datos.publicadas.find((x) => x.video === p.video);
      if (f) {
        if (f.alcance !== undefined) num_.push(`alcance ${num(f.alcance)}`);
        if (f.vistas !== undefined) num_.push(`reproducciones ${num(f.vistas)}`);
        if (f.likes !== null) num_.push(`${num(f.likes)} me gusta`);
        if (f.guardados !== undefined) num_.push(`${num(f.guardados)} guardados`);
        if (f.compartidos !== undefined) num_.push(`${num(f.compartidos)} compartidos`);
        if (f.comentarios !== null) num_.push(pl(f.comentarios, "comentario", "comentarios"));
      }
    }
    if (p.red === "facebook" && r.fb.ok) {
      const f = r.fb.datos.publicadas.find((x) => x.video === p.video);
      if (f?.likes !== null && f?.likes !== undefined) num_.push(`${num(f.likes)} me gusta`);
      if (f?.comentarios !== null && f?.comentarios !== undefined) num_.push(pl(f.comentarios, "comentario", "comentarios"));
    }
    l.push(`• ${esc(titulo(p.video))} · ${RED[p.red] ?? p.red} (${FORMATO[p.formato] ?? p.formato})${num_.length ? ` — ${num_.join(", ")}` : ""}${p.url ? `\n  ${esc(p.url)}` : ""}`);
  }
  if (redes.publicadas.some((p) => p.red === "instagram") && !r.ig.ok) l.push(noPude("las cifras de Instagram", r.ig));
  if (redes.publicadas.some((p) => p.red === "facebook") && !r.fb.ok) l.push(noPude("las cifras de Facebook", r.fb));
  l.push(redes.hoy.length ? `Hoy: ${redes.hoy.map((p) => `${esc(titulo(p.video))} · ${RED[p.red] ?? p.red} ${p.hora}`).join("; ")}.` : "Hoy: nada programado.");
  if (redes.borradores.length) l.push(`Borradores de TikTok por publicar a mano: ${redes.borradores.map((b) => `${esc(titulo(b.video))} (llegó ${b.fecha})`).join("; ")}.`);
  return l;
}

function comentarios(r: Reunido): string[] {
  const l = ["<b>COMENTARIOS</b>"];
  if (!r.ig.ok) return [...l, noPude("los comentarios de Instagram", r.ig)];
  const cs: Comentario[] = [...r.ig.datos.comentarios].sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando));
  const org = cs.filter((c) => c.origen === "orgánico").length;
  const anu = cs.length - org;
  const dudas = cs.filter((c) => c.pregunta);
  l.push(`Instagram: ${num(cs.length)} nuevos ayer (${num(org)} en publicaciones, ${num(anu)} en anuncios).`);
  for (const c of cs.slice(0, 5)) l.push(`• ${esc(c.autor)}: «${esc(recorta(c.texto.replace(/\s+/g, " "), 100))}»${c.pregunta ? " ← contestar" : ""}`);
  if (dudas.length && dudas.some((c) => !cs.slice(0, 5).includes(c))) l.push(`Otras dudas por contestar: ${dudas.filter((c) => !cs.slice(0, 5).includes(c)).slice(0, 6).map((c) => `${esc(c.autor)}: «${esc(recorta(c.texto, 60))}»`).join("; ")}`);
  return l;
}

function chats(r: Reunido): string[] {
  const l = ["<b>CHATS DE WHATSAPP</b>"];
  if (!r.db.ok) return [...l, noPude("los chats", r.db)];
  const c = r.db.datos.chats;
  const total = c.prospectos + c.clientes;
  l.push(`Nuevos: ${num(total)}${cambio(total, c.antes_prospectos + c.antes_clientes)} — prospectos ${num(c.prospectos)}, clientes ${num(c.clientes)}.`);
  l.push(`La IA contestó sola ${num(c.ia_sola)}; escalaron ${num(c.escaladas)} (${c.escaladas_abiertas === 1 ? "1 sigue abierta" : `${num(c.escaladas_abiertas)} siguen abiertas`}).`);
  l.push(c.primera_respuesta_seg !== null ? `Primera respuesta: ${tiempo(c.primera_respuesta_seg)} en promedio (${num(c.primera_respuesta_n)} chats).` : "Primera respuesta: sin chats nuevos que medir.");
  return l;
}

function negocios(r: Reunido): string[] {
  const l = ["<b>NEGOCIOS</b>"];
  if (!r.db.ok) return [...l, noPude("registros y cobro", r.db)];
  const { registros: g, negocios: n } = r.db.datos;
  l.push(`Registros de prueba: ${num(g.dia)}${cambio(g.dia, g.antes)} · mes ${num(g.mes)}.`);
  if (g.origen_dia.length) l.push(`Llegaron desde: ${g.origen_dia.slice(0, 4).map((o) => `${esc(o.origen)} ${num(o.n)}`).join(", ")}.`);
  const p0 = r.previo?.pruebas_activas;
  l.push(`Pruebas activas: ${num(n.pruebas_activas)}${p0 == null ? "" : ` (ayer ${num(p0)})`}.`);
  l.push(n.vencen.length ? `Vencen en 3 días: ${n.vencen.map((v) => `${esc(v.nombre)} (${v.dias} d)`).join(", ")}.` : "Ninguna prueba vence en los próximos 3 días.");
  l.push(`Convertidas a pago: ${num(n.convertidas_dia)} ayer · ${num(n.convertidas_mes)} en el mes. Cancelaciones: ${num(n.cancelaciones_dia)} · ${num(n.cancelaciones_mes)}. Pagos fallidos ayer: ${num(n.pagos_fallidos_dia)}.`);
  const mrr = Math.round(n.mrr_centavos / (1 + TASA_IVA));
  const m0 = r.previo?.mrr_centavos;
  l.push(`Ingreso mensual recurrente: ${centavos(mrr)} + IVA${m0 == null ? "" : ` (ayer ${centavos(Math.round(m0 / (1 + TASA_IVA)))})`}.`);
  const sg = r.db.datos.seguimiento;
  if (sg) {
    const salieron = sg.dia5 + sg.dia10 + sg.dia15;
    l.push(
      sg.pausa
        ? "Seguimiento de pruebas por WhatsApp: en pausa."
        : salieron === 0 && sg.fallidos === 0 && sg.respuestas === 0
          ? "Seguimiento de pruebas por WhatsApp: ayer no salió ningún mensaje."
          : `Seguimiento de pruebas por WhatsApp: ${num(salieron)} mensajes ayer (día 5: ${num(sg.dia5)}, día 10: ${num(sg.dia10)}, día 15: ${num(sg.dia15)}) · ${num(sg.respuestas)} respuestas · ${num(sg.bajas)} bajas · ${num(sg.fallidos)} con error.`,
    );
  }
  if (r.lunes) l.push(`Semana: ${num(g.semana)} registros contra ${num(g.semana_antes)} la semana anterior.`);
  return l;
}

function seguidores(r: Reunido): string[] {
  const l = ["<b>SEGUIDORES</b>"];
  const fila = (nombre: string, f: Fuente<{ seguidores: number | null }>, antes: number | null | undefined) =>
    !f.ok ? noPude(`seguidores de ${nombre}`, f) : f.datos.seguidores === null ? null : `${nombre}: ${num(f.datos.seguidores)}${delta(f.datos.seguidores, antes)}`;
  for (const x of [fila("Facebook", r.fb, r.previo?.fb), fila("Instagram", r.ig, r.previo?.ig), fila("TikTok", r.tt, r.previo?.tt)]) if (x) l.push(x);
  return l;
}

function campana(r: Reunido): string[] {
  const l = ["<b>CAMPAÑA DE PELUDESK</b>"];
  if (!r.camp.ok) return [...l, noPude("la campaña de Meta", r.camp)];
  const c = r.camp.datos;
  const reales = r.db.ok ? r.db.datos.registros : null;
  const cpr = (m: M) => (m.registros > 0 ? pesos(m.gasto / m.registros) : "—");
  l.push(`Ayer: ${pesos(c.dia.gasto)} (anteayer ${pesos(c.antes.gasto)}) · ${num(c.dia.impresiones)} impresiones (${num(c.antes.impresiones)}) · ${num(c.dia.clics)} clics (${num(c.antes.clics)}) · CTR ${c.dia.ctr.toFixed(2)}%.`);
  l.push(`Registros: ${num(c.dia.registros)} según Meta${reales ? ` · ${num(reales.campana_dia)} reales en PeluDesk` : ""}. Costo por registro: ${cpr(c.dia)}.`);
  l.push(`Mes: ${pesos(c.mes.gasto)} de ${pesos(PRESUPUESTO_MES_PESOS)} (${((c.mes.gasto / PRESUPUESTO_MES_PESOS) * 100).toFixed(1)}%) · ritmo ${pesos(RITMO_DIARIO_PESOS)} diarios (ayer ${((c.dia.gasto / RITMO_DIARIO_PESOS) * 100).toFixed(0)}% del ritmo) · ${num(c.mes.registros)} registros según Meta${reales ? `, ${num(reales.campana_mes)} reales` : ""}, costo ${cpr(c.mes)}.`);
  if (c.anuncios.length) {
    l.push("Por anuncio (ayer · mes):");
    for (const a of c.anuncios) {
      const real = a.utm && reales ? reales.anuncio_mes[a.utm] ?? 0 : null;
      l.push(`• ${esc(a.nombre)}: ${pesos(a.dia.gasto)} · ${pesos(a.mes.gasto)}, ${num(a.mes.clics)} clics, ${num(a.mes.registros)} registros Meta${real === null ? "" : `/${num(real)} reales`}, costo ${cpr(a.mes)}`);
    }
  }
  if (r.lunes && c.semana && c.semanaAntes) l.push(`Semana: ${pesos(c.semana.gasto)} y ${num(c.semana.registros)} registros contra ${pesos(c.semanaAntes.gasto)} y ${num(c.semanaAntes.registros)} la semana anterior.`);
  if (c.restoCuentaDia !== null) l.push(`Resto de la cuenta publicitaria (Checaíto), solo informativo: ${pesos(c.restoCuentaDia)} ayer.`);
  return l;
}

const SECCION: Record<Seccion, (r: Reunido) => string[]> = { publicaciones, comentarios, chats, negocios, seguidores, campana };
const ORDEN: Seccion[] = ["publicaciones", "comentarios", "chats", "negocios", "seguidores", "campana"];

/** Los bloques (cada sección es uno); el encabezado y ATENCIÓN van primero. */
export function bloques(r: Reunido): string[] {
  const out = [`<b>PeluDesk · resumen del ${esc(etiquetaDia(r.dia))}</b>`];
  const a = atencion(r);
  if (a.length) out.push(["<b>ATENCIÓN</b>", ...a.map((x) => `• ${x}`)].join("\n"));
  for (const s of ORDEN) if (r.ajustes.secciones.includes(s)) out.push(SECCION[s](r).join("\n"));
  return out;
}

/** Junta bloques hasta el tope de Telegram; un bloque más grande que el tope se parte por renglones. */
export function partir(bs: string[], tope = TOPE_MENSAJE): string[] {
  const trozos: string[] = [];
  for (const b of bs) {
    if (b.length <= tope) trozos.push(b);
    else {
      let actual = "";
      for (const linea of b.split("\n")) {
        const l = linea.length > tope ? linea.slice(0, tope - 1) + "…" : linea;
        if (actual && actual.length + 1 + l.length > tope) {
          trozos.push(actual);
          actual = l;
        } else actual = actual ? `${actual}\n${l}` : l;
      }
      if (actual) trozos.push(actual);
    }
  }
  const mensajes: string[] = [];
  let actual = "";
  for (const t of trozos) {
    if (actual && actual.length + 2 + t.length > tope) {
      mensajes.push(actual);
      actual = t;
    } else actual = actual ? `${actual}\n\n${t}` : t;
  }
  if (actual) mensajes.push(actual);
  return mensajes;
}
