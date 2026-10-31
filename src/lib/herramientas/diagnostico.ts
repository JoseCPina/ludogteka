// El diagnóstico de rentabilidad (/diagnostico): 10 preguntas por giro, un puntaje de 0 a 100, tres recomendaciones y
// el dinero que se va al mes calculado con los números de la persona. Las fórmulas están a la vista (cada línea dice
// cómo se calculó). Puro: lo usan la pantalla, la captura (resumen para el bot) y las pruebas.
import type { GiroMercado } from "@/lib/mercado/catalogo";

export type Pregunta = { clave: string; texto: string; tipo: "numero" | "opcion"; unidad?: string; opciones?: { clave: string; nombre: string; puntos: number }[]; ayuda?: string };

const voc = (g: GiroMercado) => ({ citas: g === "hotel" ? "reservaciones" : g === "guarderia" ? "días de guardería" : g === "veterinaria" ? "consultas" : "citas", cita: g === "hotel" ? "reservación" : g === "guarderia" ? "día" : g === "veterinaria" ? "consulta" : "cita" });

export function preguntasDe(g: GiroMercado): Pregunta[] {
  const v = voc(g);
  return [
    { clave: "citas", texto: `¿Cuántas ${v.citas} atiendes a la semana?`, tipo: "numero", unidad: "a la semana" },
    { clave: "plantones", texto: `¿Cuántas ${v.citas} se te caen a la semana (no llegan o cancelan el mismo día)?`, tipo: "numero", unidad: "a la semana" },
    { clave: "precio", texto: `¿Cuál es tu precio promedio por ${v.cita}?`, tipo: "numero", unidad: "pesos" },
    { clave: "caja", texto: "¿Cómo llevas la caja?", tipo: "opcion", opciones: [{ clave: "cabeza", nombre: "De cabeza", puntos: 0 }, { clave: "libreta", nombre: "Libreta", puntos: 3 }, { clave: "excel", nombre: "Excel u hoja de cálculo", puntos: 6 }, { clave: "sistema", nombre: "Un sistema con corte de turno", puntos: 10 }] },
    { clave: "cobro", texto: "¿Cómo cobras?", tipo: "opcion", opciones: [{ clave: "efectivo", nombre: "Solo efectivo", puntos: 2 }, { clave: "transferencia", nombre: "Efectivo y transferencia", puntos: 6 }, { clave: "terminal", nombre: "Efectivo, transferencia y terminal", puntos: 10 }] },
    { clave: "recordatorios", texto: `¿Cómo recuerdas las ${v.citas}?`, tipo: "opcion", opciones: [{ clave: "no", nombre: "No las recuerdo", puntos: 0 }, { clave: "manual", nombre: "A mano por WhatsApp cuando me acuerdo", puntos: 5 }, { clave: "siempre", nombre: "Siempre, a mano", puntos: 8 }, { clave: "automatico", nombre: "Salen solos", puntos: 10 }] },
    { clave: "regresan", texto: "De cada 10 clientes nuevos, ¿cuántos regresan?", tipo: "numero", unidad: "de 10" },
    { clave: "expediente", texto: `¿Dónde están los datos de cada ${g === "veterinaria" ? "paciente" : "perro"} (vacunas, alergias, dueño)?`, tipo: "opcion", opciones: [{ clave: "memoria", nombre: "En la memoria", puntos: 0 }, { clave: "papel", nombre: "En papel", puntos: 3 }, { clave: "whatsapp", nombre: "En el WhatsApp", puntos: 4 }, { clave: "sistema", nombre: "En un sistema", puntos: 10 }] },
    { clave: "contrato", texto: g === "veterinaria" ? "¿Tienes consentimiento firmado para procedimientos?" : "¿Tienes contrato o responsiva firmada por el cliente?", tipo: "opcion", opciones: [{ clave: "no", nombre: "No", puntos: 0 }, { clave: "aveces", nombre: "A veces, en papel", puntos: 5 }, { clave: "siempre", nombre: "Siempre", puntos: 10 }] },
    { clave: "tiempo_caja", texto: "¿Cuánto tardas en cerrar la caja al final del día?", tipo: "opcion", opciones: [{ clave: "no_cierro", nombre: "No cierro caja", puntos: 0 }, { clave: "mas30", nombre: "Más de 30 minutos", puntos: 4 }, { clave: "menos30", nombre: "Menos de 30 minutos", puntos: 7 }, { clave: "minutos", nombre: "Unos minutos, cuadra sola", puntos: 10 }] },
  ];
}

export type Respuestas = Record<string, string | number | undefined>;

export type Diagnostico = {
  puntaje: number;
  fugaMensual: number;
  lineas: { concepto: string; monto: number; como: string }[];
  recomendaciones: { titulo: string; texto: string }[];
  nivel: "verde" | "ambar" | "rojo";
};

const SEMANAS_MES = 4.33;

export function diagnosticar(g: GiroMercado, r: Respuestas): Diagnostico {
  const num = (k: string) => Math.max(0, Number(r[k]) || 0);
  const citas = num("citas");
  const plantones = Math.min(num("plantones"), citas);
  const precio = num("precio");
  const regresan = Math.min(10, num("regresan"));
  const preguntas = preguntasDe(g);
  const puntosOpcion = (k: string) => preguntas.find((p) => p.clave === k)?.opciones?.find((o) => o.clave === r[k])?.puntos ?? 0;

  // Puntaje: 6 preguntas de opción (hasta 10 cada una = 60) + plantones (hasta 20) + clientes que regresan (hasta 20).
  const tasaPlantones = citas > 0 ? plantones / citas : 0;
  const puntosPlantones = Math.round(Math.max(0, 1 - tasaPlantones / 0.25) * 20); // 0 % = 20, 25 % o más = 0
  const puntosRegresan = Math.round((regresan / 10) * 20);
  const puntosOpciones = ["caja", "cobro", "recordatorios", "expediente", "contrato", "tiempo_caja"].reduce((n, k) => n + puntosOpcion(k), 0);
  const puntaje = Math.max(0, Math.min(100, puntosOpciones + puntosPlantones + puntosRegresan));

  // Lo que se va al mes, con sus números.
  const lineas: Diagnostico["lineas"] = [];
  const recordatorios = String(r.recordatorios ?? "");
  // Plantones: un recordatorio con confirmación recupera cerca de la mitad (supuesto conservador, y así se dice).
  const recuperables = recordatorios === "automatico" ? 0 : recordatorios === "siempre" ? 0.25 : 0.5;
  const fugaPlantones = plantones * precio * SEMANAS_MES * recuperables;
  if (fugaPlantones > 0) lineas.push({ concepto: "Citas que se caen y se podrían recuperar", monto: fugaPlantones, como: `${plantones} a la semana × $${precio} × 4.33 semanas × ${Math.round(recuperables * 100)} % que recupera un recordatorio con confirmación` });
  // Clientes que no regresan: si de 10 regresan menos de 7, cada punto son citas que no vuelven.
  const faltan = Math.max(0, 7 - regresan);
  const nuevosMes = citas * SEMANAS_MES * 0.3; // supuesto: 3 de cada 10 citas son clientes nuevos
  const fugaRetencion = faltan > 0 ? nuevosMes * (faltan / 10) * precio : 0;
  if (fugaRetencion > 0) lineas.push({ concepto: "Clientes nuevos que no vuelven", monto: fugaRetencion, como: `${Math.round(nuevosMes)} clientes nuevos al mes (3 de cada 10 citas) × ${faltan} de 10 que no regresan × $${precio}` });
  // Caja sin corte: lo que no se registra o se pierde en cambios y cuentas sin cobrar (1 % a 3 % de la venta).
  const venta = citas * precio * SEMANAS_MES;
  const caja = String(r.caja ?? "");
  const merma = caja === "cabeza" ? 0.03 : caja === "libreta" ? 0.02 : caja === "excel" ? 0.01 : 0;
  if (venta * merma > 0) lineas.push({ concepto: "Caja sin corte: cobros que no se registran o cuentas que se quedan sin cobrar", monto: venta * merma, como: `${Math.round(merma * 100)} % de $${Math.round(venta).toLocaleString("es-MX")} de venta mensual (supuesto por cómo llevas la caja)` });
  // Solo efectivo: ventas que se pierden por no aceptar tarjeta (supuesto 5 %).
  if (r.cobro === "efectivo" && venta > 0) lineas.push({ concepto: "Clientes que no traen efectivo", monto: venta * 0.05, como: `5 % de $${Math.round(venta).toLocaleString("es-MX")} (supuesto)` });
  const fugaMensual = lineas.reduce((n, l) => n + l.monto, 0);

  const recomendaciones: Diagnostico["recomendaciones"] = [];
  if (recordatorios !== "automatico" && plantones > 0) recomendaciones.push({ titulo: "Recordatorio con confirmación un día antes", texto: `Con ${plantones} citas que se caen a la semana, un recordatorio automático que el cliente confirma con un botón es lo que más dinero regresa: cerca de $${Math.round(fugaPlantones).toLocaleString("es-MX")} al mes.` });
  if (caja !== "sistema") recomendaciones.push({ titulo: "Corte de caja todos los días", texto: "Un turno que abre con fondo y cierra con arqueo te dice cada noche si cuadra. Lo que no se registra el mismo día no se recupera." });
  if (r.cobro === "efectivo") recomendaciones.push({ titulo: "Acepta transferencia y tarjeta", texto: "Una terminal o un link de pago evita que el cliente «vuelva después» a pagar." });
  if (regresan < 7) recomendaciones.push({ titulo: "Que el cliente vuelva solo", texto: "El aviso de la próxima vacuna, un portal donde ve a su mascota y un recordatorio al mes de su última visita hacen que regrese sin que lo persigas." });
  if (String(r.expediente) !== "sistema") recomendaciones.push({ titulo: "Expediente de cada mascota en un solo lugar", texto: "Vacunas, alergias y dueño a la mano: evita errores y hace más rápido cada check-in." });
  if (String(r.contrato) !== "siempre" && g !== "veterinaria") recomendaciones.push({ titulo: "Contrato firmado siempre", texto: "Una responsiva firmada desde el celular evita discusiones en una urgencia o una recogida tardía." });
  const nivel: Diagnostico["nivel"] = puntaje >= 75 ? "verde" : puntaje >= 45 ? "ambar" : "rojo";
  return { puntaje, fugaMensual, lineas, recomendaciones: recomendaciones.slice(0, 3), nivel };
}

/** Lo que se guarda en el prospecto para que el bot venda con eso: una línea. */
export function resumenParaBot(g: GiroMercado, r: Respuestas, d: Diagnostico): string {
  const o = (k: string) => preguntasDe(g).find((p) => p.clave === k)?.opciones?.find((x) => x.clave === r[k])?.nombre ?? "—";
  // prospectos.calificacion_texto admite 300 caracteres.
  return `Diagnóstico ${d.puntaje}/100 (${g}): ${r.citas ?? 0} citas/sem, ${r.plantones ?? 0} se caen, $${r.precio ?? 0}; caja: ${o("caja")}; cobro: ${o("cobro")}; recordatorios: ${o("recordatorios")}; regresan ${r.regresan ?? 0}/10. Se le van ~$${Math.round(d.fugaMensual).toLocaleString("es-MX")}/mes. Recomendado: ${d.recomendaciones.map((x) => x.titulo).join("; ")}.`.slice(0, 300);
}
