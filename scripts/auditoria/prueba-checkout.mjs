// Pura (sin base, sin Stripe, sin cobros): los días de la prueba y el texto del Checkout dicen lo mismo.
//   node --experimental-strip-types scripts/auditoria/prueba-checkout.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// prueba.ts importa "@/lib/formato" (alias de Next): para Node se apunta al archivo real.
const formato = new URL("../../src/lib/formato.ts", import.meta.url).href;
const dir = mkdtempSync(join(tmpdir(), "prueba-"));
const archivo = join(dir, "prueba.ts");
writeFileSync(archivo, readFileSync(new URL("../../src/lib/cobro/prueba.ts", import.meta.url), "utf8").replace("@/lib/formato", formato));
const { finDePrueba, diasDePrueba, textoCheckout, AVISO_COBRO_MENTEO, CHECKOUT_FIJO, primerCobro, trialEndAlContratar } = await import(pathToFileURL(archivo).href);

let mal = 0;
const igual = (a, b, t) => { if (JSON.stringify(a) === JSON.stringify(b)) console.log(`  ✔ ${t}`); else { mal++; console.log(`  ✘ ${t}: salió ${JSON.stringify(a)} y debía ${JSON.stringify(b)}`); } };
const ok = (c, t) => igual(Boolean(c), true, t);

const TIJUANA = "America/Tijuana"; // UTC-7 en octubre de 2026 (Huellitas)
const MEXICO = "America/Mexico_City"; // UTC-6

// La prueba termina el 29 de octubre a las 10:30 hora de México (16:30 UTC).
const fin = "2026-10-29T16:30:00Z";
const f = finDePrueba(fin, MEXICO);
igual(f.toISOString(), "2026-10-30T05:59:59.000Z", "termina a las 23:59:59 del 29 de octubre en México (05:59:59 UTC del 30)");
igual(finDePrueba(fin, TIJUANA).toISOString(), "2026-10-30T06:59:59.000Z", "y a las 23:59:59 del 29 en Tijuana");

// Un instante cerca de la medianoche UTC no cambia el día del negocio.
igual(finDePrueba("2026-10-30T03:00:00Z", MEXICO).toISOString(), "2026-10-30T05:59:59.000Z", "las 21:00 del 29 en México siguen siendo el 29");

// Días de calendario: 16 → 29 de octubre = 13, a cualquier hora del día.
igual(diasDePrueba(fin, MEXICO, "2026-10-16"), 13, "13 días del 16 al 29 de octubre");
igual(diasDePrueba(fin, MEXICO, "2026-10-29"), 0, "el 29 termina hoy");
igual(diasDePrueba(fin, MEXICO, "2026-10-30"), 0, "después no es negativo");
igual(diasDePrueba(fin, MEXICO, "2026-10-28"), 1, "el 28 queda 1 día");

// Lo que Stripe cuenta (días completos desde ahora hasta trial_end) = lo que dice el banner, a toda hora del día 16.
for (const [hora, zona, ahoraIso] of [["00:05", MEXICO, "2026-10-16T06:05:00Z"], ["13:00", MEXICO, "2026-10-16T19:00:00Z"], ["23:58", MEXICO, "2026-10-17T05:58:00Z"], ["18:00", TIJUANA, "2026-10-17T01:00:00Z"]]) {
  const stripeDias = Math.floor((finDePrueba(fin, zona).getTime() - new Date(ahoraIso).getTime()) / 86_400_000);
  igual(stripeDias, diasDePrueba(fin, zona, "2026-10-16"), `a las ${hora} (${zona}) Stripe y el banner dicen ${stripeDias} días`);
}

// N123: la prueba termina al final del 29 (23:59:59 en la zona del negocio): Stripe cobra en ese instante, que ya es
// el 30 («a partir del 30 de octubre»). La app dice el 30 en el Checkout, el banner y «Módulos y plan».
const { formatearFecha } = await import(formato);
igual(formatearFecha(primerCobro(f), MEXICO), formatearFecha("2026-10-30T18:00:00Z", MEXICO), "prueba hasta el 29 → primer cobro el 30 (México)");
igual(formatearFecha(primerCobro(finDePrueba(fin, TIJUANA)), TIJUANA), formatearFecha("2026-10-30T20:00:00Z", TIJUANA), "y el 30 también en Tijuana");
igual(formatearFecha(primerCobro("2026-11-04T05:59:59Z"), MEXICO), formatearFecha("2026-11-04T18:00:00Z", MEXICO), "el caso de la QA: trial_end 3 nov 23:59:59 → primer cobro el 4 nov");
// El trial_end que se manda al contratar: el final del último día, o 49 h desde ahora si queda menos.
igual(trialEndAlContratar(fin, MEXICO, Date.parse("2026-10-16T18:00:00Z"))?.toISOString(), f.toISOString(), "con días de sobra, trial_end = final del último día");
igual(trialEndAlContratar(fin, MEXICO, Date.parse("2026-10-29T18:00:00Z"))?.toISOString(), "2026-10-31T19:00:00.000Z", "con menos de 49 h, ahora + 49 h");
igual(trialEndAlContratar(fin, MEXICO, Date.parse("2026-10-31T00:00:00Z")), null, "prueba ya terminada: sin trial_end");

// El texto del Checkout lleva la fecha real y a nombre de quién sale el cobro.
const t = textoCheckout(f, MEXICO);
ok(/Contratas PeluDesk\. No se te cobra hoy; el primer cobro es el 30 oct/i.test(t), `texto con la fecha del cobro: «${t}»`);
ok(t.includes("MENTEO, la empresa que opera PeluDesk"), "y dice que el cobro aparece como MENTEO");
ok(AVISO_COBRO_MENTEO === "El cobro aparece como MENTEO, la empresa que opera PeluDesk.", "el aviso es el acordado");
ok(!/No se te cobra hoy/.test(textoCheckout(null, MEXICO)) && /Se cobra hoy/.test(textoCheckout(null, MEXICO)), "sin prueba dice que se cobra hoy");
ok(t.length < 1200, "cabe en los 1,200 caracteres de Stripe");

// QA S27: el Checkout sale en español de Latinoamérica, solo con tarjeta y sin ofrecer Link.
igual(CHECKOUT_FIJO.locale, "es-419", "Checkout en es-419");
igual(CHECKOUT_FIJO.payment_method_types, ["card"], "solo tarjeta");
igual(CHECKOUT_FIJO.wallet_options, { link: { display: "never" } }, "Link apagado en la sesión");
console.log(mal ? `\n${mal} HALLAZGO(S)` : "\nSin hallazgos.");
process.exit(mal ? 1 : 0);
