"use server";

import { analizar, ubicar, type Analisis } from "@/lib/mapa/competencia";
import { esGiroMercado } from "@/lib/mercado/catalogo";

/** El análisis del mapa de competencia para un texto (dirección o colonia), una ciudad y un giro. */
export async function analizarCompetencia(e: { texto: string; ciudad: string | null; giro: string }): Promise<{ error: string | null; analisis?: Analisis }> {
  const texto = String(e.texto ?? "").trim().slice(0, 160);
  if (texto.length < 3) return { error: "Escribe una dirección o una colonia." };
  if (!esGiroMercado(e.giro)) return { error: "Escoge un giro." };
  const punto = await ubicar(texto, typeof e.ciudad === "string" ? e.ciudad.slice(0, 80) : null);
  if (!punto) return { error: "No ubicamos esa dirección. Prueba con la colonia y la ciudad." };
  return { error: null, analisis: await analizar(punto, e.giro) };
}
