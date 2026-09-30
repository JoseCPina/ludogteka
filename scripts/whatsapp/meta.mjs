#!/usr/bin/env node
// El número de WhatsApp de PeluDesk en la Cloud API de Meta, por la Graph API.
//
//   node scripts/whatsapp/meta.mjs <paso> [argumento]
//
// Pasos, en orden (cada uno es idempotente o dice qué ya estaba):
//   estado               qué hay: la WABA de PeluDesk, sus números, apps suscritas y plantillas
//   crear-waba           crea la WABA «PeluDesk» en el portafolio (si Meta lo permite por API)
//   alta-numero          da de alta +52 56 4916 0742 con el nombre visible «PeluDesk»
//   pedir-codigo         Meta manda el código por SMS al número
//   verificar <código>   verifica el código
//   registrar            lo registra en la Cloud API (con el PIN de dos pasos de WHATSAPP_PIN)
//   suscribir            suscribe la app a la WABA con el webhook de PeluDesk (override)
//   perfil               descripción, sitio, categoría y foto del perfil de WhatsApp
//                        (public/marca/peludesk/perfil-640.jpg: el isotipo a cuadro completo)
//   plantillas           crea la plantilla de seguimiento (reabre la ventana de 24 h)
//
// Variables del entorno (nunca se imprimen):
//   WHATSAPP_TOKEN        token del usuario de sistema del portafolio de Checaíto
//                         (permisos whatsapp_business_management, whatsapp_business_messaging
//                         y business_management)
//   WHATSAPP_APP_SECRET   secreto de la app de Meta (deriva el verify_token, igual que el servidor)
//   META_BUSINESS_ID      id del portafolio (Menteo, S.A.S.)
//   PELUDESK_WABA_ID      la WABA de PeluDesk (después de crear-waba, o si se creó en pantalla)
//   WHATSAPP_PHONE_NUMBER_ID  el número (después de alta-numero)
//   WHATSAPP_PIN          PIN de verificación en dos pasos (6 dígitos) para registrar
//
// En la nube: NODE_USE_ENV_PROXY=1 y graph.facebook.com en los dominios permitidos.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const GRAPH = "https://graph.facebook.com/v23.0";
const NUMERO = { cc: "52", phone_number: "5649160742" };
const NOMBRE_VISIBLE = "PeluDesk";
const WEBHOOK = "https://peludesk.mx/api/whatsapp/webhook";
const PLANTILLA = "peludesk_seguimiento_v1";
const FOTO_PERFIL = new URL("../../public/marca/peludesk/perfil-640.jpg", import.meta.url);

const env = (n) => (process.env[n] ?? "").trim();
const token = env("WHATSAPP_TOKEN");
if (!token) {
  console.error("✘ Falta WHATSAPP_TOKEN en el entorno.");
  process.exit(1);
}

async function graph(ruta, { method = "GET", body } = {}) {
  const r = await fetch(`${GRAPH}${ruta}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error ?? {};
    throw new Error(`${method} ${ruta.split("?")[0]} → ${r.status} ${e.code ?? ""}/${e.error_subcode ?? ""}: ${e.error_user_msg ?? e.message ?? "sin detalle"}`);
  }
  return j;
}

const requerir = (n) => {
  const v = env(n);
  if (!v) {
    console.error(`✘ Falta ${n} en el entorno.`);
    process.exit(1);
  }
  return v;
};

const pasos = {
  async estado() {
    const yo = await graph("/me?fields=id,name");
    console.log(`Token de: ${yo.name} (${yo.id})`);
    const biz = env("META_BUSINESS_ID");
    if (biz) {
      const w = await graph(`/${biz}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id,account_review_status&limit=50`);
      console.log(`\nWABA del portafolio ${biz}:`);
      for (const x of w.data ?? []) console.log(`  · ${x.name} — ${x.id} (${x.account_review_status ?? "?"})`);
    }
    const waba = env("PELUDESK_WABA_ID");
    if (!waba) return console.log("\n(PELUDESK_WABA_ID sin poner: no reviso números ni plantillas)");
    const nums = await graph(`/${waba}/phone_numbers?fields=id,display_phone_number,verified_name,name_status,code_verification_status,status,platform_type,quality_rating`);
    console.log(`\nNúmeros de la WABA ${waba}:`);
    for (const n of nums.data ?? []) {
      console.log(`  · ${n.display_phone_number} «${n.verified_name}» id ${n.id} · nombre: ${n.name_status} · código: ${n.code_verification_status} · estado: ${n.status} · plataforma: ${n.platform_type}`);
    }
    const apps = await graph(`/${waba}/subscribed_apps`);
    console.log(`\nApps suscritas: ${(apps.data ?? []).map((a) => `${a.whatsapp_business_api_data?.name ?? "?"} (${a.whatsapp_business_api_data?.id ?? "?"})${a.override_callback_uri ? ` → ${a.override_callback_uri}` : ""}`).join(", ") || "ninguna"}`);
    const pl = await graph(`/${waba}/message_templates?fields=name,status,category,language&limit=50`);
    console.log(`\nPlantillas: ${(pl.data ?? []).map((p) => `${p.name} [${p.language}] ${p.category} ${p.status}`).join("; ") || "ninguna"}`);
  },

  async "crear-waba"() {
    const biz = requerir("META_BUSINESS_ID");
    const ya = await graph(`/${biz}/owned_whatsapp_business_accounts?fields=id,name&limit=50`);
    const existe = (ya.data ?? []).find((w) => w.name === NOMBRE_VISIBLE);
    if (existe) return console.log(`Ya existe la WABA «${NOMBRE_VISIBLE}»: ${existe.id}. Ponla como PELUDESK_WABA_ID.`);
    try {
      const r = await graph(`/${biz}/whatsapp_business_accounts`, {
        method: "POST",
        body: { name: NOMBRE_VISIBLE, currency: "MXN", timezone_id: "72" },
      });
      console.log(`✔ WABA creada: ${r.id}. Ponla como PELUDESK_WABA_ID.`);
    } catch (e) {
      console.log(`✘ Meta no dejó crearla por API (${e.message}).`);
      console.log("  Hazlo en pantalla: business.facebook.com → portafolio de Checaíto → Configuración del negocio →");
      console.log("  Cuentas → Cuentas de WhatsApp → Agregar → Crear una cuenta de WhatsApp Business → nombre «PeluDesk», zona México, moneda MXN.");
      console.log("  Luego, en esa cuenta → Personas/Asignar activos: agrega al usuario de sistema con control total.");
    }
  },

  async "alta-numero"() {
    const waba = requerir("PELUDESK_WABA_ID");
    const nums = await graph(`/${waba}/phone_numbers?fields=id,display_phone_number`);
    const ya = (nums.data ?? []).find((n) => n.display_phone_number.replace(/\D/g, "").endsWith(NUMERO.phone_number));
    if (ya) return console.log(`Ya está dado de alta: id ${ya.id}. Ponlo como WHATSAPP_PHONE_NUMBER_ID.`);
    const r = await graph(`/${waba}/phone_numbers`, { method: "POST", body: { ...NUMERO, verified_name: NOMBRE_VISIBLE } });
    console.log(`✔ Número dado de alta: id ${r.id}. Ponlo como WHATSAPP_PHONE_NUMBER_ID.`);
  },

  async "pedir-codigo"() {
    const id = requerir("WHATSAPP_PHONE_NUMBER_ID");
    await graph(`/${id}/request_code`, { method: "POST", body: { code_method: "SMS", language: "es" } });
    console.log("✔ Meta mandó el código por SMS al +52 56 4916 0742.");
  },

  async verificar(codigo) {
    const id = requerir("WHATSAPP_PHONE_NUMBER_ID");
    if (!/^\d{6}$/.test(codigo ?? "")) {
      console.error("✘ Uso: verificar <código de 6 dígitos>");
      process.exit(1);
    }
    await graph(`/${id}/verify_code`, { method: "POST", body: { code: codigo } });
    console.log("✔ Código verificado.");
  },

  async registrar() {
    const id = requerir("WHATSAPP_PHONE_NUMBER_ID");
    const pin = requerir("WHATSAPP_PIN");
    if (!/^\d{6}$/.test(pin)) {
      console.error("✘ WHATSAPP_PIN tiene que ser de 6 dígitos.");
      process.exit(1);
    }
    await graph(`/${id}/register`, { method: "POST", body: { messaging_product: "whatsapp", pin } });
    console.log("✔ Registrado en la Cloud API.");
  },

  async suscribir() {
    const waba = requerir("PELUDESK_WABA_ID");
    const secreto = requerir("WHATSAPP_APP_SECRET");
    // El mismo que calcula el servidor (src/lib/whatsapp/infra.ts, derivado()).
    const verify = env("WHATSAPP_VERIFY_TOKEN") || createHmac("sha256", secreto).update("peludesk:whatsapp-verify").digest("hex").slice(0, 48);
    // override_callback_uri: los eventos de ESTA WABA van a peludesk.mx y no
    // al webhook de la app (que es el de Checaíto). Meta verifica la URL con
    // un GET en ese momento: el despliegue ya tiene que tener las variables.
    await graph(`/${waba}/subscribed_apps`, { method: "POST", body: { override_callback_uri: WEBHOOK, verify_token: verify } });
    const apps = await graph(`/${waba}/subscribed_apps`);
    console.log(`✔ Suscrita. Apps: ${(apps.data ?? []).map((a) => `${a.whatsapp_business_api_data?.name ?? "?"} → ${a.override_callback_uri ?? "(webhook de la app)"}`).join(", ")}`);
  },

  async perfil() {
    const id = requerir("WHATSAPP_PHONE_NUMBER_ID");
    // La foto va por la API de subida reanudable de la app: da un handle que
    // el perfil acepta en profile_picture_handle.
    const foto = readFileSync(FOTO_PERFIL);
    const app = await graph("/app?fields=id");
    const sesion = await graph(`/${app.id}/uploads?file_name=perfil-640.jpg&file_length=${foto.length}&file_type=image/jpeg`, { method: "POST" });
    const r = await fetch(`${GRAPH}/${sesion.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, file_offset: "0", "Content-Type": "application/octet-stream" },
      body: foto,
      signal: AbortSignal.timeout(30000),
    });
    const subida = await r.json().catch(() => ({}));
    if (!r.ok || !subida.h) throw new Error(`Subida de la foto → ${r.status}: ${subida.error?.message ?? "sin handle"}`);
    await graph(`/${id}/whatsapp_business_profile`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        profile_picture_handle: subida.h,
        about: "Software para guarderías, hoteles y estéticas caninas.",
        description: "PeluDesk: reservas, citas de estética, cobros, contratos y vacunas al día. Pruébalo 15 días gratis en peludesk.mx. PeluDesk es una marca de Menteo, S.A.S.",
        websites: ["https://peludesk.mx", "https://peludesk.mx/aviso-de-privacidad"],
        vertical: "PROF_SERVICES",
      },
    });
    console.log("✔ Perfil actualizado.");
  },

  async plantillas() {
    const waba = requerir("PELUDESK_WABA_ID");
    const ya = await graph(`/${waba}/message_templates?name=${PLANTILLA}&fields=name,status`);
    if ((ya.data ?? []).length) return console.log(`Ya existe ${PLANTILLA}: ${ya.data.map((p) => p.status).join(", ")}`);
    const r = await graph(`/${waba}/message_templates`, {
      method: "POST",
      body: {
        name: PLANTILLA,
        language: "es_MX",
        category: "UTILITY",
        components: [
          { type: "BODY", text: "Hola, te escribimos de PeluDesk por la pregunta que nos dejaste por aquí. Ya tenemos tu respuesta; contéstanos este mensaje y te la mandamos." },
        ],
      },
    });
    console.log(`✔ Plantilla ${PLANTILLA} enviada a revisión: ${r.status ?? "?"} (${r.category ?? "?"}).`);
  },
};

const [paso, arg] = process.argv.slice(2);
if (!pasos[paso]) {
  console.log(`Pasos: ${Object.keys(pasos).join(", ")}`);
  process.exit(paso ? 1 : 0);
}
try {
  await pasos[paso](arg);
} catch (e) {
  console.error(`✘ ${e.message}`);
  process.exit(1);
}
