import type { DatosWeb } from "@/components/web-negocio/pagina-web";
import type { LugarParaPagina } from "@/lib/prospectos/places";
import type { ProspectoPagina } from "@/lib/prospectos/pagina";
import { serviciosDe } from "@/lib/prospectos/pagina";
import { catalogoDe } from "./catalogo";
import { creditoFoto, hoyEn, resenasDestacadas } from "./google";
import { horarioDeGoogle } from "./horario";
import { giroPrincipal, type GiroWeb } from "./tema";

const ZONA = "America/Mexico_City";

const NOMBRE: Record<GiroWeb, string> = { veterinaria: "veterinaria", estetica: "estética", guarderia: "guardería", hotel: "hotel" };

/** Una línea que dice qué hace, sin inventar: su giro y su ciudad. */
export function descripcionDe(principal: GiroWeb, servicios: GiroWeb[], ciudad: string | null): string {
  const en = ciudad ? ` en ${ciudad}` : "";
  const base: Record<GiroWeb, string> = {
    veterinaria: `Atención veterinaria para tu mascota${en}.`,
    estetica: `Baño, corte y cuidado para tu perro${en}.`,
    guarderia: `Un lugar para que tu perro juegue y conviva mientras tú trabajas${en}.`,
    hotel: `Hospedaje para tu perro${en} mientras estás de viaje.`,
  };
  const otros = servicios.filter((s) => s !== principal).map((s) => NOMBRE[s]);
  const lista = otros.length > 1 ? `${otros.slice(0, -1).join(", ")} y ${otros[otros.length - 1]}` : otros[0];
  return lista ? `${base[principal]} También ${lista}.` : base[principal];
}

/** Lo que necesita la página web de un prospecto: lo nuestro del CRM y lo de Google pedido al mostrarla. */
export function datosDeProspecto(p: ProspectoPagina, g: LugarParaPagina | null, color: string | null): DatosWeb {
  const servicios = serviciosDe(p).filter((s): s is GiroWeb => ["veterinaria", "estetica", "guarderia", "hotel"].includes(s));
  const principal = giroPrincipal(servicios, p.giro);
  const lista = servicios.length ? servicios : [principal];
  return {
    nombre: p.nombre,
    ciudad: p.ciudad,
    direccion: g?.direccion ?? p.direccion,
    telefono: p.telefono_norm,
    descripcion: g?.resumen ?? descripcionDe(principal, lista, p.ciudad),
    giro: principal,
    servicios: lista,
    catalogo: catalogoDe(lista, principal),
    preciosDeEjemplo: true,
    horario: horarioDeGoogle(g?.periodos),
    calificacion: g?.calificacion ?? null,
    totalResenas: g?.resenas ?? null,
    resenas: resenasDestacadas(g),
    fotos: (g?.fotos ?? []).map((f) => ({ url: f.uri, credito: creditoFoto(f) })),
    logoUrl: null,
    color,
    mapsUri: g?.mapsUri ?? null,
    zona: ZONA,
    deGoogle: Boolean(g),
    hoy: hoyEn(ZONA),
  };
}
