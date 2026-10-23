// N116: la fecha que proponen «Agendar cita» (Estética) y la agenda clínica (Vet) es HOY en la zona del negocio,
// con el reloj simulado a las 21:30 de la Ciudad de México (03:30 UTC del día siguiente: en UTC ya es mañana).
// Corre la cadena real (proponerHora → proximaHoraDisponible → hoyNegocio) con una base de mentiras que contesta
// el horario de resolver_cupo_configuracion. Sin servidor ni base:
//   node --experimental-strip-types scripts/auditoria/fecha-cita-hoy.mjs
import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// `@/…` → src/… y los imports sin extensión → .ts (como los resuelve Next).
const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
registerHooks({
  resolve(especificador, contexto, siguiente) {
    let e = especificador.startsWith("@/") ? pathToFileURL(SRC + especificador.slice(2)).href : especificador;
    if ((e.startsWith("file:") || e.startsWith(".")) && !/\.\w+$/.test(e)) {
      const ruta = fileURLToPath(new URL(e, e.startsWith("file:") ? undefined : contexto.parentURL));
      if (existsSync(`${ruta}.ts`)) e = pathToFileURL(`${ruta}.ts`).href;
    }
    return siguiente(e, contexto);
  },
});

// Reloj simulado: `new Date()` y `Date.now()` devuelven el instante fijado.
const DateReal = Date;
let ahoraMs = 0;
globalThis.Date = class extends DateReal {
  constructor(...a) { super(...(a.length ? a : [ahoraMs])); }
  static now() { return ahoraMs; }
};
const fijarReloj = (iso) => { ahoraMs = DateReal.parse(iso); };

const { proponerHora, proponerFechaHora } = await import("../../src/lib/estetica/proponer-hora.ts");
const { hoyNegocio } = await import("../../src/lib/formato.ts");

const baseCon = (apertura, cierre) => ({ rpc: async () => ({ data: [{ estado: "configurado", hora_apertura: apertura, hora_cierre: cierre }], error: null }) });

let fallos = 0;
const ok = (c, t, extra = "") => { console.log(`  ${c ? "✔" : "✘"} ${t}${c ? "" : ` → ${extra}`}`); if (!c) fallos++; };
const CDMX = "America/Mexico_City";

console.log("── 21:30 CDMX del miércoles 14 de octubre de 2026 (= 2026-10-15T03:30Z)");
fijarReloj("2026-10-15T03:30:00Z");
ok(new Date().toISOString().slice(0, 10) === "2026-10-15", "el reloj simulado ya es «mañana» en UTC"); // utc-ok: comprueba la trampa
ok(hoyNegocio(CDMX) === "2026-10-14", "hoyNegocio dice el 14 (hoy en el negocio)", hoyNegocio(CDMX));
let p = await proponerHora(baseCon("09:00:00", "23:00:00"), CDMX);
ok(p === "2026-10-14T22:00", "Estética, abierto hasta las 23:00: propone HOY a las 22:00", p);
let v = await proponerFechaHora(baseCon("09:00:00", "23:00:00"), CDMX);
ok(v.fecha === "2026-10-14" && v.hora === "22:00", "Vet, abierto hasta las 23:00: fecha de hoy, 22:00", JSON.stringify(v));
p = await proponerHora(baseCon("09:00:00", "19:00:00"), CDMX);
ok(p === "2026-10-15T09:00", "ya pasó el cierre (19:00): mañana a la apertura", p);
v = await proponerFechaHora(baseCon("09:00:00", "19:00:00"), CDMX, "2026-10-14");
ok(v.fecha === "2026-10-14", "Vet con ?fecha= de hoy: la fecha pedida manda aunque ya cerró", JSON.stringify(v));
v = await proponerFechaHora(baseCon("09:00:00", "19:00:00"), CDMX, "2026-10-20");
ok(v.fecha === "2026-10-20" && v.hora === "09:00", "Vet con ?fecha= futura: ese día a la apertura", JSON.stringify(v));
v = await proponerFechaHora(baseCon("09:00:00", "23:00:00"), CDMX, "2026-10-01");
ok(v.fecha === "2026-10-14", "Vet con ?fecha= pasada: se ignora (hoy)", JSON.stringify(v));
v = await proponerFechaHora(baseCon("09:00:00", "23:00:00"), CDMX, "mañana");
ok(v.fecha === "2026-10-14", "Vet con ?fecha= mal escrita: se ignora", JSON.stringify(v));

console.log("── 18:00 y 18:10 CDMX (00:00 y 00:10 UTC del día siguiente), cierre a las 19:00");
fijarReloj("2026-10-15T00:00:00Z");
p = await proponerHora(baseCon("09:00:00", "19:00:00"), CDMX);
ok(p === "2026-10-14T18:30", "a las 18:00 propone hoy a las 18:30 (no mañana 09:00)", p);
fijarReloj("2026-10-15T00:10:00Z");
p = await proponerHora(baseCon("09:00:00", "19:00:00"), CDMX);
ok(p === "2026-10-14T18:30", "a las 18:10 propone hoy a las 18:30", p);

console.log("── Tijuana (UTC-7): 21:30 locales del 14 = 04:30Z del 15");
fijarReloj("2026-10-15T04:30:00Z");
p = await proponerHora(baseCon("09:00:00", "23:00:00"), "America/Tijuana");
ok(p === "2026-10-14T22:00", "propone hoy a las 22:00 en la zona del negocio", p);

globalThis.Date = DateReal;
console.log(fallos ? `\nHALLAZGOS: ${fallos}` : "\n✔ Sin hallazgos.");
process.exit(fallos ? 1 : 0);
