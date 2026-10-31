"use client";

import type { EstiloLista, RenglonLista } from "./plantillas-servicios";
import { precioEnTexto } from "./plantillas-servicios";

/**
 * Dibuja la lista de precios en un <canvas> del navegador (imagen 1080×1350 o la hoja del PDF) con uno de los tres
 * estilos. Todo pasa en el navegador: el logo nunca sale de la computadora de la persona. Las fuentes son las de la
 * página (Outfit) ya cargadas.
 */
export type DatosLista = { negocio: string; whatsapp: string | null; ciudad: string | null; giroTexto: string; renglones: RenglonLista[]; estilo: EstiloLista; logo: HTMLImageElement | null; pie?: string };

const PALETA: Record<EstiloLista, { fondo: string; tinta: string; suave: string; acento: string; precio: string; banda: string; linea: string }> = {
  clara: { fondo: "#fff8ee", tinta: "#2b2a33", suave: "#5e5968", acento: "#4b3f72", precio: "#2b2a33", banda: "#fff8ee", linea: "#ebe3d8" },
  calida: { fondo: "#ffffff", tinta: "#2b2a33", suave: "#46424f", acento: "#4b3f72", precio: "#1f6b57", banda: "#e3f3ed", linea: "#ffffff" },
  oscura: { fondo: "#1d1830", tinta: "#ffffff", suave: "rgba(255,255,255,.7)", acento: "#a7d8c8", precio: "#a7d8c8", banda: "rgba(255,255,255,.06)", linea: "rgba(255,255,255,.12)" },
};

function fuente(peso: number, tam: number) {
  const familia = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily || "sans-serif" : "sans-serif";
  return `${peso} ${tam}px ${familia}`;
}

function cortar(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string {
  if (ctx.measureText(texto).width <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > ancho) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function dibujarLista(canvas: HTMLCanvasElement, d: DatosLista, W = 1080, H = 1350) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const p = PALETA[d.estilo];
  const m = 72;
  ctx.fillStyle = p.fondo;
  ctx.fillRect(0, 0, W, H);

  // Encabezado.
  let y = m;
  if (d.estilo === "calida") {
    ctx.fillStyle = p.acento;
    ctx.beginPath();
    ctx.roundRect(m, m, W - 2 * m, 200, 28);
    ctx.fill();
  }
  const enc = d.estilo === "calida" ? "#ffffff" : p.tinta;
  const xTexto = d.logo ? m + 150 : m + (d.estilo === "calida" ? 40 : 0);
  if (d.logo) {
    const t = 110;
    const x0 = m + (d.estilo === "calida" ? 36 : 0);
    const y0 = m + (d.estilo === "calida" ? 45 : 0);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, t, t, 22);
    ctx.clip();
    ctx.fillStyle = "#fff";
    ctx.fillRect(x0, y0, t, t);
    const r = Math.min(t / d.logo.width, t / d.logo.height);
    ctx.drawImage(d.logo, x0 + (t - d.logo.width * r) / 2, y0 + (t - d.logo.height * r) / 2, d.logo.width * r, d.logo.height * r);
    ctx.restore();
  }
  ctx.fillStyle = d.estilo === "calida" ? "rgba(255,255,255,.8)" : p.acento;
  ctx.font = fuente(700, 22);
  ctx.fillText(`LISTA DE PRECIOS · ${d.giroTexto.toUpperCase()}`, xTexto, y + (d.estilo === "calida" ? 78 : 28));
  ctx.fillStyle = enc;
  ctx.font = fuente(800, 56);
  ctx.fillText(cortar(ctx, d.negocio || "Tu negocio", W - xTexto - m - (d.estilo === "calida" ? 40 : 0)), xTexto, y + (d.estilo === "calida" ? 142 : 92));
  if (d.ciudad) {
    ctx.fillStyle = d.estilo === "calida" ? "rgba(255,255,255,.85)" : p.suave;
    ctx.font = fuente(500, 26);
    ctx.fillText(d.ciudad, xTexto, y + (d.estilo === "calida" ? 182 : 132));
  }
  y = m + (d.estilo === "calida" ? 260 : 190);

  // Renglones.
  const visibles = d.renglones.filter((r) => r.nombre.trim()).slice(0, 16);
  const alto = Math.min(66, Math.floor((H - y - 170) / Math.max(visibles.length, 1)));
  visibles.forEach((r, i) => {
    const precio = precioEnTexto(r);
    if (d.estilo === "calida" && i % 2 === 0) {
      ctx.fillStyle = p.banda;
      ctx.beginPath();
      ctx.roundRect(m, y - alto * 0.62, W - 2 * m, alto, 14);
      ctx.fill();
    }
    ctx.fillStyle = p.tinta;
    ctx.font = fuente(600, 30);
    const anchoPrecio = precio ? ctx.measureText(precio).width + 40 : 0;
    ctx.fillText(cortar(ctx, r.nombre, W - 2 * m - anchoPrecio - 24 - (d.estilo === "calida" ? 48 : 0)), m + (d.estilo === "calida" ? 24 : 0), y);
    if (r.nota) {
      ctx.fillStyle = p.suave;
      ctx.font = fuente(400, 20);
      ctx.fillText(cortar(ctx, r.nota, W - 2 * m - anchoPrecio - 60), m + (d.estilo === "calida" ? 24 : 0), y + 26);
    }
    ctx.fillStyle = p.precio;
    ctx.font = fuente(800, 32);
    ctx.textAlign = "right";
    ctx.fillText(precio || "—", W - m - (d.estilo === "calida" ? 24 : 0), y);
    ctx.textAlign = "left";
    if (d.estilo !== "calida") {
      ctx.strokeStyle = p.linea;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(m, y + alto * 0.36);
      ctx.lineTo(W - m, y + alto * 0.36);
      ctx.stroke();
    }
    y += alto;
  });

  // Pie.
  ctx.fillStyle = p.suave;
  ctx.font = fuente(500, 22);
  const pie = d.pie ?? "Precios en pesos mexicanos. Pueden cambiar según el estado del pelo y el tamaño.";
  ctx.fillText(cortar(ctx, pie, W - 2 * m), m, H - m - 44);
  if (d.whatsapp) {
    ctx.fillStyle = p.acento;
    ctx.font = fuente(700, 28);
    ctx.fillText(`WhatsApp ${d.whatsapp.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3")}`, m, H - m);
  }
  ctx.fillStyle = p.suave;
  ctx.font = fuente(500, 18);
  ctx.textAlign = "right";
  ctx.fillText("Hecha con peludesk.mx", W - m, H - m);
  ctx.textAlign = "left";
}

/** La imagen como PNG (Blob). */
export function canvasAPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo crear la imagen."))), "image/png"));
}

/** Un PDF tamaño carta con la lista dibujada (pdf-lib en el navegador: nada sale de la computadora). */
export async function listaAPdf(d: DatosLista): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const canvas = document.createElement("canvas");
  dibujarLista(canvas, d, 1275, 1650); // carta a 150 ppp
  const png = await canvasAPng(canvas);
  const doc = await PDFDocument.create();
  doc.setTitle(`Lista de precios · ${d.negocio}`);
  doc.setProducer("peludesk.mx");
  const img = await doc.embedPng(await png.arrayBuffer());
  const pagina = doc.addPage([612, 792]);
  pagina.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
