// Los precios de PeluDesk nunca van escritos a mano: el plan (mensual, con IVA y anual), la sucursal adicional y los
// recordatorios gratis salen de la base (`planes`, `wa_precios`), igual en la landing, /precios, el bot y la ayuda
// (26 de octubre de 2026: el artículo «Módulos y plan» decía «$649», «$6,490» y «$325» a mano, y el bot «$6,490»).
// Lee desarrollo (solo lectura) y revisa:
//
//   node scripts/auditoria/precios-escritos.mjs
//
// 1. Ninguna cifra de la base escrita en src/, content/ ni en los guiones de los videos (scripts/tutoriales/videos).
// 2. Los artículos de ayuda llevan marcas ({{plan}}, {{plan_anual}}, {{sucursal}}, {{recordatorios_gratis}}) que se
//    llenan con la base; sin precios, una frase sin cifra; nunca la marca cruda.
// 3. El centro de ayuda, el asistente y el bot de WhatsApp enseñan el precio de la base.
// 4. Si hay `next start` en el 3001: la página pública /ayuda/modulos-y-plan enseña el precio de la base.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const SRC = path.join(RAIZ, "src") + path.sep;
registerHooks({
  resolve(especificador, contexto, siguiente) {
    let e = especificador.startsWith("@/") ? pathToFileURL(SRC + especificador.slice(2)).href : especificador;
    if ((e.startsWith("file:") || e.startsWith(".")) && !/\.\w+$/.test(e)) {
      const ruta = fileURLToPath(new URL(e, e.startsWith("file:") ? undefined : contexto.parentURL));
      if (fs.existsSync(`${ruta}.ts`)) e = pathToFileURL(`${ruta}.ts`).href;
      else if (fs.existsSync(`${ruta}.tsx`)) e = pathToFileURL(`${ruta}.tsx`).href;
    }
    return siguiente(e, contexto);
  },
});

const { A } = await import("./sesiones-dev.mjs");
let fallas = 0;
const ok = (c, m) => {
  console.log(`  ${c ? "✔" : "✘"} ${m}`);
  if (!c) fallas++;
};
const seccion = (t) => console.log(`\n── ${t}`);

// ── Lo que dice la base
const { data: planes } = await A.from("planes").select("tipo, precio_mensual, precio_anual").eq("activo", true).is("deleted_at", null).gt("precio_mensual", 0).order("precio_mensual");
const plan = planes?.find((p) => p.tipo === "plan");
const sucursal = planes?.find((p) => p.tipo === "sucursal");
const { data: wa } = await A.from("wa_precios").select("gratis_mes").is("deleted_at", null).order("vigente_desde", { ascending: false }).limit(1).maybeSingle();
if (!plan) throw new Error("Desarrollo no tiene un plan activo en `planes`.");
const precios = { mensual: Number(plan.precio_mensual), anual: Number(plan.precio_anual), sucursal: sucursal ? Number(sucursal.precio_mensual) : null, recordatoriosGratis: wa ? Number(wa.gratis_mes) : null };
const conIva = (n) => Math.round(n * 116) / 100;
const pesos = (n) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
console.log(`Base: plan ${pesos(precios.mensual)} (+IVA ${pesos(conIva(precios.mensual))}), anual ${pesos(precios.anual)}, sucursal ${precios.sucursal ? pesos(precios.sucursal) : "—"}, recordatorios gratis ${precios.recordatoriosGratis ?? "—"}`);

// ── 1. Cifras escritas a mano
seccion("1. Ninguna cifra del plan escrita en el código, el contenido ni los guiones");
const cifras = [precios.mensual, conIva(precios.mensual), precios.anual, conIva(precios.anual), precios.sucursal, precios.sucursal && conIva(precios.sucursal)].filter(Boolean);
const variantes = new Set(cifras.flatMap((n) => [pesos(n), `$${n}`, `$${n.toFixed(2)}`, `$ ${n}`]));
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATRON = new RegExp(`(${[...variantes].map(escapar).join("|")})(?![\\d.,]*\\d)`);
const GRATIS = precios.recordatoriosGratis != null ? new RegExp(`\\b${precios.recordatoriosGratis} (recordatorios|entregados|gratis)`) : null;
const archivos = [];
const recorrer = (dir, ext) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, ext);
    else if (ext.test(e.name)) archivos.push(p);
  }
};
recorrer(path.join(RAIZ, "src"), /\.(ts|tsx)$/);
recorrer(path.join(RAIZ, "content"), /\.(json|md|mdx)$/);
recorrer(path.join(RAIZ, "scripts/tutoriales/videos"), /\.mjs$/);
const hallados = [];
for (const f of archivos) {
  const lineas = fs.readFileSync(f, "utf8").split(/\r?\n/);
  lineas.forEach((l, i) => {
    const m = l.match(PATRON) ?? (GRATIS && /src[\\/]lib[\\/](ayuda|whatsapp|peludesk)/.test(f) ? l.match(GRATIS) : null);
    if (m) hallados.push(`${path.relative(RAIZ, f)}:${i + 1} «${m[0]}»`);
  });
}
for (const h of hallados) console.log(`    ${h}`);
ok(hallados.length === 0, `${archivos.length} archivos sin ${[...variantes].join(", ")}${GRATIS ? ` ni «${precios.recordatoriosGratis} gratis»` : ""} escritos a mano`);

// ── 2. Las marcas de los artículos
seccion("2. Los artículos de ayuda llenan sus precios con la base");
const preciosMod = await import("../../src/lib/ayuda/precios.ts").catch(() => null);
if (!preciosMod?.conPrecios) {
  ok(false, "existe src/lib/ayuda/precios.ts (conPrecios)");
} else {
  const { conPrecios } = preciosMod;
  const { ARTICULOS, textoPlano } = await import("../../src/lib/ayuda/index.ts");
  const crudas = ARTICULOS.flatMap((a) => [...(conPrecios(a.cuerpo, precios).match(/\{\{[^}]*\}\}/g) ?? []), ...(conPrecios(a.cuerpo, null).match(/\{\{[^}]*\}\}/g) ?? [])].map((m) => `${a.slug} ${m}`));
  ok(crudas.length === 0, `ninguna marca desconocida ni cruda en ${ARTICULOS.length} artículos${crudas.length ? `: ${crudas.join(", ")}` : ""}`);
  ok(ARTICULOS.every((a) => !textoPlano(a).includes("{{")), "el texto plano (búsqueda, llms.txt) no enseña la marca");
  const mp = ARTICULOS.find((a) => a.slug === "modulos-y-plan");
  const lleno = conPrecios(mp.cuerpo, precios);
  ok(lleno.includes(`${pesos(precios.mensual)} al mes + IVA (${pesos(conIva(precios.mensual))} con IVA)`), `«Módulos y plan» dice ${pesos(precios.mensual)} al mes + IVA (${pesos(conIva(precios.mensual))} con IVA)`);
  ok(lleno.includes(`${pesos(precios.anual)} + IVA al año`), `«Módulos y plan» dice el anual: ${pesos(precios.anual)} + IVA al año`);
  if (precios.sucursal) ok(lleno.includes(`${pesos(precios.sucursal)} al mes + IVA`), `«Módulos y plan» dice la sucursal: ${pesos(precios.sucursal)} al mes + IVA`);
  if (precios.recordatoriosGratis != null) ok(lleno.includes(`${precios.recordatoriosGratis} recordatorios entregados gratis al mes`), `«Módulos y plan» dice ${precios.recordatoriosGratis} recordatorios gratis`);
  // Con otro precio en la base, el artículo cambia solo.
  const otro = conPrecios(mp.cuerpo, { ...precios, mensual: 1234, anual: 12340 });
  ok(otro.includes("$1,234 al mes + IVA") && otro.includes("$12,340 + IVA al año") && !otro.includes(pesos(precios.mensual) + " al mes"), "con otro precio en la base, el artículo dice el otro precio");
  const sin = conPrecios(mp.cuerpo, null);
  ok(sin.includes("el precio que ves en Módulos y plan") && !PATRON.test(sin), "sin precios de la base: una frase que manda a Módulos y plan, sin cifra");

  // ── 3. Quien lee los artículos
  seccion("3. El asistente y el bot de WhatsApp leen el precio de la base");
  const { promptFijo } = await import("../../src/lib/ayuda/asistente.ts");
  const prompt = promptFijo(ARTICULOS, precios);
  ok(prompt.includes(`${pesos(precios.anual)} + IVA al año`) && !prompt.includes("{{"), "el asistente de Ayuda recibe el artículo con el precio de la base");
  const { documentacionParaWhatsApp } = await import("../../src/lib/ayuda/whatsapp.ts");
  const doc = documentacionParaWhatsApp("https://peludesk.mx", [], precios);
  ok(doc.includes(`${pesos(precios.mensual)} al mes + IVA`) && !doc.includes("{{"), "el bot (admins y personal) recibe el artículo con el precio de la base");
  const infra = fs.readFileSync(path.join(SRC, "lib/whatsapp/infra.ts"), "utf8");
  ok(/documentacionParaWhatsApp\([\s\S]{0,120}preciosAyudaDelBot\(/.test(infra), "el bot llena la documentación con los planes y wa_precios que ya leyó");
  const acciones = fs.readFileSync(path.join(SRC, "app/(staff)/ayuda/acciones.ts"), "utf8");
  ok(/promptFijo\(articulos, precios\)/.test(acciones), "el asistente de Ayuda pasa los precios de la base");
}

// ── 4. En pantalla (si hay servidor)
seccion("4. La página pública del artículo");
// fetch no deja mandar otro `host`: el dominio de la plataforma va con http.request.
const r = await new Promise((listo) => {
  const pet = http.get({ host: "127.0.0.1", port: 3001, path: "/ayuda/modulos-y-plan", headers: { host: "plataforma.localhost:3001" }, timeout: 60000 }, (res) => {
    let cuerpo = "";
    res.setEncoding("utf8");
    res.on("data", (d) => (cuerpo += d));
    res.on("end", () => listo({ status: res.statusCode, cuerpo }));
  });
  pet.on("error", () => listo(null));
  pet.on("timeout", () => pet.destroy());
});
if (!r) console.log("  · sin `next start` en el 3001: se salta");
else {
  const html = r.cuerpo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  ok(r.status === 200, `/ayuda/modulos-y-plan responde ${r.status}`);
  ok(html.includes(`${pesos(precios.mensual)} al mes + IVA`) && html.includes(`${pesos(precios.anual)} + IVA al año`), `enseña ${pesos(precios.mensual)} al mes y ${pesos(precios.anual)} al año, de la base`);
  ok(!html.includes("{{"), "sin marcas crudas");
}

console.log(fallas ? `\n✘ ${fallas} falla(s)` : "\n✔ Precios de la base en todos lados");
process.exit(fallas ? 1 : 0);
