#!/usr/bin/env node
// El WhatsApp Flow «PeluDesk · Prueba gratis» en Meta, por la API de Flows (Graph API, token del usuario de sistema).
//
//   node scripts/whatsapp/flow.mjs <paso> [argumento]
//
//   estado          los Flows de la WABA de PeluDesk, su estado y la llave pública registrada en el número
//   crear           crea el Flow (borrador) con el Flow JSON de src/lib/whatsapp/flow/definicion.ts y el endpoint
//                   https://peludesk.mx/api/whatsapp/flow; si ya existe, no crea otro: dice su id
//   actualizar      vuelve a subir el Flow JSON y el endpoint (solo a un Flow en borrador)
//   llave           genera un par RSA 2048, registra la PÚBLICA en el número y guarda la PRIVADA en Vercel
//                   (Production, sensitive) como WHATSAPP_FLOW_PRIVATE_KEY. La privada nunca se imprime ni toca disco.
//   publicar        publica el Flow (Meta revisa antes el endpoint: tiene que estar desplegado y con la llave)
//   id-en-vercel    guarda el id del Flow en Vercel (Production) como WHATSAPP_FLOW_ID y en .env.local
//   plantilla-ventas [enviar]
//                   la plantilla MARKETING de los seguimientos del guion de ventas fuera de la ventana de 24 h
//                   (textos de src/lib/whatsapp/ventas/guion.ts): sin «enviar» dice su estado; con «enviar» la manda
//                   a revisión si Meta no la tiene. El bot no la usa hasta que esté APPROVED.
//
// Variables (nunca se imprimen): WHATSAPP_TOKEN (o un archivo KEY=VALOR fuera del repo en WHATSAPP_TOKEN_ARCHIVO, con
// WHATSAPP_TOKEN o WA_TOKEN), PELUDESK_WABA_ID y WHATSAPP_PHONE_NUMBER_ID (por omisión, los de PeluDesk).
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { flowJson, NOMBRE_FLOW } from "../../src/lib/whatsapp/flow/definicion.ts";
import { PLANTILLA_VENTAS, PLANTILLA_VENTAS_BOTON, PLANTILLA_VENTAS_CUERPO, PLANTILLA_VENTAS_PIE } from "../../src/lib/whatsapp/ventas/guion.ts";

const GRAPH = "https://graph.facebook.com/v23.0";
const WABA = process.env.PELUDESK_WABA_ID?.trim() || "1445370394155532";
const NUMERO = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "1387083197814029";
const ENDPOINT = "https://peludesk.mx/api/whatsapp/flow";
const TERMINOS = "https://peludesk.mx/terminos";
const AVISO = "https://peludesk.mx/aviso-de-privacidad";

function leerArchivo(ruta) {
  const kv = Object.fromEntries(
    fs.readFileSync(ruta, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
  );
  return kv;
}
function token() {
  if (process.env.WHATSAPP_TOKEN?.trim()) return process.env.WHATSAPP_TOKEN.trim();
  const ruta = process.env.WHATSAPP_TOKEN_ARCHIVO?.trim();
  if (ruta && fs.existsSync(ruta)) {
    const kv = leerArchivo(ruta);
    if (kv.WHATSAPP_TOKEN || kv.WA_TOKEN) return kv.WHATSAPP_TOKEN || kv.WA_TOKEN;
  }
  console.error("✘ Falta WHATSAPP_TOKEN (o WHATSAPP_TOKEN_ARCHIVO con WHATSAPP_TOKEN / WA_TOKEN).");
  process.exit(1);
}
const T = token();

async function graph(ruta, { method = "GET", body, form } = {}) {
  const r = await fetch(`${GRAPH}${ruta}`, {
    method,
    headers: { Authorization: `Bearer ${T}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error ?? {};
    throw new Error(`${method} ${ruta.split("?")[0]} → ${r.status} ${e.code ?? ""}/${e.error_subcode ?? ""}: ${e.error_user_msg ?? e.message ?? "sin detalle"}${e.error_data ? ` ${JSON.stringify(e.error_data)}` : ""}`);
  }
  return j;
}

async function flowExistente() {
  const { data } = await graph(`/${WABA}/flows?fields=id,name,status,validation_errors,endpoint_uri`);
  return (data ?? []).find((f) => f.name === NOMBRE_FLOW) ?? null;
}

const errores = (v) => (v?.length ? v.map((e) => `   · ${e.error}: ${e.message}${e.line_start ? ` (línea ${e.line_start})` : ""}`).join("\n") : "   ninguno");

function guardarEnVercel(nombre, valor, sensible) {
  // Se reemplaza si ya estaba. El valor entra por stdin: nunca en la línea de comandos ni en un archivo.
  spawnSync("npx", ["vercel", "env", "rm", nombre, "production", "--yes"], { stdio: "ignore", shell: true });
  const r = spawnSync("npx", ["vercel", "env", "add", nombre, "production", ...(sensible ? ["--sensitive"] : [])], { input: valor, stdio: ["pipe", "ignore", "pipe"], shell: true });
  if (r.status !== 0) throw new Error(`vercel env add ${nombre}: ${String(r.stderr).slice(0, 300)}`);
}

const pasos = {
  async estado() {
    const { data } = await graph(`/${WABA}/flows?fields=id,name,status,categories,validation_errors,endpoint_uri,health_status`);
    if (!data?.length) console.log("Sin Flows en la WABA.");
    for (const f of data ?? []) console.log(`• ${f.name} · ${f.id} · ${f.status} · endpoint ${f.endpoint_uri ?? "—"}\n  errores:\n${errores(f.validation_errors)}${f.health_status ? `\n  salud: ${JSON.stringify(f.health_status)}` : ""}`);
    const { data: llave } = await graph(`/${NUMERO}/whatsapp_business_encryption`);
    console.log(`Llave pública del número: ${llave?.[0]?.business_public_key_signature_status ?? "—"}`);
  },
  async crear() {
    const ya = await flowExistente();
    if (ya) return console.log(`Ya existe: ${ya.id} (${ya.status}).`);
    const r = await graph(`/${WABA}/flows`, { method: "POST", body: { name: NOMBRE_FLOW, categories: ["SIGN_UP"], flow_json: JSON.stringify(flowJson(TERMINOS, AVISO)), endpoint_uri: ENDPOINT } });
    console.log(`Flow creado: ${r.id}\n  errores de validación:\n${errores(r.validation_errors)}`);
  },
  async actualizar() {
    const f = await flowExistente();
    if (!f) throw new Error("No existe el Flow: corre «crear».");
    const form = new FormData();
    form.append("name", "flow.json");
    form.append("asset_type", "FLOW_JSON");
    form.append("file", new Blob([JSON.stringify(flowJson(TERMINOS, AVISO))], { type: "application/json" }), "flow.json");
    const r = await graph(`/${f.id}/assets`, { method: "POST", form });
    await graph(`/${f.id}`, { method: "POST", body: { endpoint_uri: ENDPOINT } });
    console.log(`Flow ${f.id} actualizado.\n  errores de validación:\n${errores(r.validation_errors)}`);
  },
  async llave() {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    // Primero la privada en Vercel: si eso falla, la pública vieja sigue registrada y nada se rompe.
    guardarEnVercel("WHATSAPP_FLOW_PRIVATE_KEY", privateKey, true);
    const form = new FormData();
    form.append("business_public_key", publicKey);
    await graph(`/${NUMERO}/whatsapp_business_encryption`, { method: "POST", form });
    const { data } = await graph(`/${NUMERO}/whatsapp_business_encryption`);
    console.log(`Llave privada en Vercel (Production, sensitive). Pública registrada en el número: ${data?.[0]?.business_public_key_signature_status}.`);
    console.log("Hace falta un despliegue nuevo para que el servidor lea la llave.");
  },
  async publicar() {
    const f = await flowExistente();
    if (!f) throw new Error("No existe el Flow: corre «crear».");
    if (f.status === "PUBLISHED") return console.log(`Ya está publicado: ${f.id}.`);
    await graph(`/${f.id}/publish`, { method: "POST" });
    const g = await graph(`/${f.id}?fields=id,status,validation_errors,health_status`);
    console.log(`Flow ${g.id}: ${g.status}${g.health_status ? `\n  salud: ${JSON.stringify(g.health_status)}` : ""}`);
  },
  async "plantilla-ventas"() {
    const { data } = await graph(`/${WABA}/message_templates?name=${PLANTILLA_VENTAS}&fields=name,status,category,rejected_reason`);
    const ya = (data ?? []).find((t) => t.name === PLANTILLA_VENTAS);
    if (ya) return console.log(`${PLANTILLA_VENTAS}: ${ya.status} (${ya.category})${ya.rejected_reason && ya.rejected_reason !== "NONE" ? ` · ${ya.rejected_reason}` : ""}`);
    if (process.argv[3] !== "enviar") return console.log(`${PLANTILLA_VENTAS}: no existe en Meta. Con «enviar» se manda a revisión.`);
    const r = await graph(`/${WABA}/message_templates`, {
      method: "POST",
      body: {
        name: PLANTILLA_VENTAS,
        language: "es_MX",
        category: "MARKETING",
        components: [
          { type: "BODY", text: PLANTILLA_VENTAS_CUERPO },
          { type: "FOOTER", text: PLANTILLA_VENTAS_PIE },
          { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: PLANTILLA_VENTAS_BOTON }] },
        ],
      },
    });
    console.log(`${PLANTILLA_VENTAS} enviada a revisión: ${r.id} · ${r.status}`);
  },
  async "id-en-vercel"() {
    const f = await flowExistente();
    if (!f) throw new Error("No existe el Flow: corre «crear».");
    guardarEnVercel("WHATSAPP_FLOW_ID", f.id, false);
    const ruta = ".env.local";
    const actual = fs.readFileSync(ruta, "utf8");
    const linea = `WHATSAPP_FLOW_ID=${f.id}`;
    fs.writeFileSync(ruta, /^WHATSAPP_FLOW_ID=.*$/m.test(actual) ? actual.replace(/^WHATSAPP_FLOW_ID=.*$/m, linea) : `${actual.replace(/\s*$/, "")}\n${linea}\n`);
    console.log(`WHATSAPP_FLOW_ID=${f.id} en Vercel (Production) y en .env.local.`);
  },
};

const [paso] = process.argv.slice(2);
if (!pasos[paso]) {
  console.error(`Pasos: ${Object.keys(pasos).join(", ")}`);
  process.exit(1);
}
pasos[paso]().catch((e) => {
  console.error(`✘ ${e.message}`);
  process.exit(1);
});
