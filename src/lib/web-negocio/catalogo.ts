// Lo que ofrece la página web de un negocio para pedir cita o reserva, y los mensajes de WhatsApp que se ven en
// la demostración. En la vista previa de un prospecto los servicios son los de su giro (los que confirmó la
// clasificación) con precios DE EJEMPLO y así se dice; en la página publicada son los suyos de PeluDesk.
import { mensajeRecordatorio } from "../veterinaria/carnet";
import type { GiroWeb } from "./tema";

/** cita = día y hora (estética, consulta); dia = un día (guardería); noches = llegada y salida (hotel). */
export type ModoReserva = "cita" | "dia" | "noches";

export type ServicioWeb = {
  clave: string;
  categoria: GiroWeb;
  nombre: string;
  descripcion: string | null;
  modo: ModoReserva;
  duracionMin: number;
  /** Precio que se muestra; en la vista previa, de ejemplo. */
  precio: number | null;
  /** «la noche», «el día», «desde»… */
  unidad: string | null;
};

const S = (clave: string, categoria: GiroWeb, nombre: string, descripcion: string, modo: ModoReserva, duracionMin: number, precio: number, unidad: string | null): ServicioWeb => ({
  clave, categoria, nombre, descripcion, modo, duracionMin, precio, unidad,
});

/**
 * Catálogo de ejemplo por giro: solo el servicio básico de cada giro, con descripciones genéricas (nada que el
 * negocio no haya dicho que hace) y precios de muestra; el negocio pone los suyos en PeluDesk.
 */
export const CATALOGO_EJEMPLO: Record<GiroWeb, ServicioWeb[]> = {
  veterinaria: [
    S("consulta", "veterinaria", "Consulta general", "Revisión completa, diagnóstico y plan de tratamiento.", "cita", 30, 450, null),
    S("vacuna", "veterinaria", "Vacunación", "Con su carnet y el aviso de cuándo le toca la siguiente.", "cita", 20, 380, "desde"),
    S("desparasitacion", "veterinaria", "Desparasitación", "Interna y externa, según su peso.", "cita", 20, 250, "desde"),
  ],
  estetica: [
    S("bano", "estetica", "Baño completo", "Baño, secado, corte de uñas y limpieza de oídos.", "cita", 90, 350, "desde"),
    S("corte", "estetica", "Corte de pelo", "Baño y corte según su raza o como lo pidas.", "cita", 120, 480, "desde"),
    S("unas", "estetica", "Corte de uñas", "Sin baño, en unos minutos.", "cita", 30, 120, null),
  ],
  guarderia: [
    S("dia", "guarderia", "Guardería por día", "Un día de juego, compañía y descanso mientras tú trabajas.", "dia", 0, 280, "el día"),
  ],
  hotel: [
    S("noche", "hotel", "Hospedaje por noche", "Se queda con nosotros mientras viajas: cuidado, juego y descanso.", "noches", 0, 380, "la noche"),
  ],
};

/** Los servicios de ejemplo de una lista de giros, el principal primero. */
export function catalogoDe(servicios: GiroWeb[], principal: GiroWeb): ServicioWeb[] {
  const orden = [principal, ...servicios.filter((s) => s !== principal)];
  return [...new Set(orden)].flatMap((g) => CATALOGO_EJEMPLO[g] ?? []);
}

export const pesosMx = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

// ── Mensajes ───────────────────────────────────────────────────────────────────────────────────────────────────

export type DatosPedido = {
  negocio: string;
  servicio: Pick<ServicioWeb, "nombre" | "categoria" | "modo">;
  mascota: string;
  cliente: string;
  /** «miércoles 22 de octubre». */
  dia: string;
  /** «11:00 a.m.» (solo cita). */
  hora?: string | null;
  /** Hotel: «viernes 24 de octubre» y número de noches. */
  salida?: string | null;
  noches?: number;
  /** Apertura y cierre de ese día («10:00 a.m.»), para el aviso de recoger. */
  abre?: string | null;
  cierra?: string | null;
};

const primerNombre = (s: string) => s.trim().split(/\s+/)[0] || "hola";

/** Lo que el cliente le manda al negocio desde su página (página publicada: abre WhatsApp con este texto). */
export function mensajeSolicitud(d: DatosPedido): string {
  const cuando =
    d.servicio.modo === "noches"
      ? `del ${d.dia} al ${d.salida} (${d.noches} ${d.noches === 1 ? "noche" : "noches"})`
      : d.servicio.modo === "cita" && d.hora
        ? `el ${d.dia} a las ${d.hora}`
        : `el ${d.dia}`;
  return `Hola, ${d.negocio}. Quiero ${d.servicio.modo === "cita" ? "agendar" : "reservar"} ${d.servicio.nombre.toLowerCase()} para ${d.mascota} ${cuando}. Soy ${d.cliente.trim()}.`.replace(/\.\./g, ".");
}

/**
 * Los avisos que le llegan al cliente. Son los MISMOS textos de los botones «Avisar por WhatsApp» de la cita de
 * estética y de la reserva (components/avisos-whatsapp.tsx): la demostración enseña lo que la app manda.
 */
export function mensajesAlCliente(d: DatosPedido): { titulo: string; cuando: string; texto: string }[] {
  const n = primerNombre(d.cliente);
  const m = d.mascota;
  const confirmacion =
    d.servicio.modo === "noches"
      ? `Hola ${n}, de ${d.negocio}: quedó la reserva de hotel de ${m}. Llega el ${d.dia} y sale el ${d.salida} (${d.noches} ${d.noches === 1 ? "noche" : "noches"}). Te mandamos fotos durante su estancia 🐾`
      : d.servicio.modo === "cita"
        ? `Hola ${n}, de ${d.negocio}: quedó la cita de ${m} para ${d.servicio.nombre.toLowerCase()} el ${d.dia} a las ${d.hora}. Te esperamos 🐾`
        : `Hola ${n}, de ${d.negocio}: quedó el día de guardería de ${m} para el ${d.dia}. ¡Te esperamos con todo y sus ganas de jugar! 🐾`;
  const recordatorio =
    d.servicio.categoria === "veterinaria"
      ? mensajeRecordatorio({ dueno: n, mascota: m, negocio: d.negocio, detalle: "Séxtuple", cuando: "en 7 días", tipo: "vacuna" })
      : d.servicio.modo === "cita"
        ? `Hola ${n}, te recordamos la cita de ${m} mañana a las ${d.hora} en ${d.negocio}. Si necesitas cambiarla, responde a este mensaje.`
        : `Hola ${n}, te recordamos que mañana esperamos a ${m} en ${d.negocio}. Trae su comida y su carnet de vacunas.`;
  const recoger =
    d.servicio.categoria === "veterinaria"
      ? `Hola ${n}, ${m} ya puede irse a casa. Te mandamos sus indicaciones y su receta por aquí.`
      : d.servicio.categoria === "estetica"
        ? `Hola ${n}, ¡${m} ya terminó su estética! ✨ Puedes pasar cuando quieras a ${d.negocio}.`
        : d.servicio.modo === "noches"
          ? `Hola ${n}, hoy ${m} regresa a casa. Puedes pasar${d.abre ? ` desde las ${d.abre}` : ""}; te contamos cómo le fue.`
          : `Hola ${n}, ${m} tuvo un gran día 🐾 Ya puedes pasar${d.cierra ? `; cerramos a las ${d.cierra}` : ""}.`;
  // «… a las 9:00 a.m.. Te esperamos»: el punto de «a.m.» ya cierra la frase.
  const limpio = (t: string) => t.replace(/\.\./g, ".");
  return [
    { titulo: "Confirmación", cuando: "Al confirmar", texto: limpio(confirmacion) },
    { titulo: d.servicio.categoria === "veterinaria" ? "Recordatorio de vacuna" : "Recordatorio", cuando: d.servicio.categoria === "veterinaria" ? "Automático" : "Un día antes", texto: limpio(recordatorio) },
    { titulo: "Listo para recoger", cuando: "Al terminar", texto: limpio(recoger) },
  ];
}

// ── Portal de ejemplo ──────────────────────────────────────────────────────────────────────────────────────────

export type PortalEjemplo = {
  dueno: string;
  mascotas: { nombre: string; especie: string; raza: string; edad: string }[];
  vacunas: { mascota: string; nombre: string; aplicada: string; proxima: string; vigente: boolean }[];
  visitas: { mascota: string; servicio: string; cuando: string; estado: "Confirmada" | "Agendada" | "Terminó" | "Está con nosotros" }[];
  expediente?: { fecha: string; motivo: string; indicaciones: string }[];
};

export function portalEjemplo(principal: GiroWeb): PortalEjemplo {
  const vet = principal === "veterinaria";
  return {
    dueno: "Ana López",
    mascotas: vet
      ? [{ nombre: "Luna", especie: "Perro", raza: "Beagle", edad: "3 años" }, { nombre: "Michi", especie: "Gato", raza: "Doméstico", edad: "5 años" }]
      : [{ nombre: "Luna", especie: "Perro", raza: "Beagle", edad: "3 años" }, { nombre: "Toby", especie: "Perro", raza: "Schnauzer", edad: "6 años" }],
    vacunas: [
      { mascota: "Luna", nombre: "Rabia", aplicada: "12 mar 2026", proxima: "12 mar 2027", vigente: true },
      { mascota: "Luna", nombre: "Séxtuple", aplicada: "20 oct 2025", proxima: "20 oct 2026", vigente: false },
      { mascota: vet ? "Michi" : "Toby", nombre: vet ? "Triple felina" : "Bordetella", aplicada: "5 jun 2026", proxima: "5 dic 2026", vigente: true },
    ],
    visitas:
      principal === "hotel"
        ? [{ mascota: "Luna", servicio: "Hotel · 3 noches", cuando: "Vie 24 al lun 27 oct", estado: "Confirmada" }, { mascota: "Toby", servicio: "Hotel · 2 noches", cuando: "1 al 3 sep", estado: "Terminó" }]
        : principal === "guarderia"
          ? [{ mascota: "Luna", servicio: "Guardería por día", cuando: "Hoy", estado: "Está con nosotros" }, { mascota: "Luna", servicio: "Guardería por día", cuando: "Jue 23 oct", estado: "Agendada" }, { mascota: "Toby", servicio: "Guardería por día", cuando: "Lun 13 oct", estado: "Terminó" }]
          : principal === "estetica"
            ? [{ mascota: "Toby", servicio: "Corte de pelo", cuando: "Sáb 25 oct · 11:00 a.m.", estado: "Confirmada" }, { mascota: "Luna", servicio: "Baño completo", cuando: "28 sep", estado: "Terminó" }]
            : [{ mascota: "Luna", servicio: "Vacunación", cuando: "Lun 27 oct · 10:30 a.m.", estado: "Confirmada" }, { mascota: "Michi", servicio: "Consulta general", cuando: "2 oct", estado: "Terminó" }],
    expediente: vet ? [{ fecha: "2 oct 2026", motivo: "Michi: no quería comer", indicaciones: "Dieta blanda 3 días y revisión si no mejora." }] : undefined,
  };
}
