// QA S53 en PRODUCCIÓN, solo lectura, en los negocios PRUEBA de QA y en las pantallas exactas donde QA vio N155, N156
// y N157 otra vez. Se corre ANTES de desplegar (debe fallar: reproduce lo que vio QA) y DESPUÉS (debe pasar). Ningún
// POST, PATCH ni DELETE sale del navegador. Sale con 1 si algo sigue mal.
//
//   node scripts/auditoria/qa-s53-prod.mjs [--solo n155|n156|n157] [--cita <id>] [--consulta <id>] [--fotos] [--ver]
//
//   N155 · prueba-est-tica (prueba vencida), estilista, la cita con ?reprogramar=1: todo el formulario de reprogramar
//          («Nueva fecha y hora», «Motivo», «Guardar la nueva hora» y «Dejarla como estaba») deshabilitado; ningún
//          control de escritura activo en la pantalla (definición propia: lib/escritura-pantalla.mjs).
//   N156 · prueba-qa-onboarding-vet-s16, el médico invitado con el rol de estética: bajo su nombre dice «Médico
//          veterinario», sin el aviso «El módulo de Estética está apagado…» y sin enlaces a Estética en el menú, en la
//          agenda clínica, el expediente y las recetas.
//   N157 · la misma clínica, la consulta firmada 3ad8de17 (receta N.º 24 emitida desde ella): la consulta enseña «Ver
//          receta N.º 24» (no solo «Emitir receta») y la lista de sus recetas.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import os from "node:os";
import path from "node:path";
import { negocioPrueba, sesionDe } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { controlesDeEscritura } from "./lib/escritura-pantalla.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const SOLO = arg("--solo", null);
const VER = process.argv.includes("--ver");
const FOTOS = process.argv.includes("--fotos");
const CITA = arg("--cita", null);
const CONSULTA = arg("--consulta", "3ad8de17-79f1-4dc3-8af9-9de6e23ff6fb");

const hallazgos = [];
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const corre = (clave) => !SOLO || SOLO === clave;

const nav = await abrirNavegador();
async function contextoDe(cookies) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(cookies);
  await ctx.route("**/*", (r) => {
    const m = r.request().method();
    const h = r.request().headers();
    if (h["next-router-prefetch"] || h["purpose"] === "prefetch") return r.abort();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS" || /\/auth\/v1\/token/.test(r.request().url())) return r.continue();
    if (h["next-action"] && (r.request().postData()?.length ?? 0) < 5) return r.continue();
    return r.abort();
  });
  return ctx;
}
async function abrir(ctx, url) {
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.dismiss().catch(() => {}));
  await p.goto(url, { waitUntil: "load" });
  await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(500);
  return p;
}
const foto = (p, nombre) => (FOTOS ? p.screenshot({ path: path.join(os.tmpdir(), `qa-s53-${nombre}.png`), fullPage: true }).catch(() => {}) : Promise.resolve());

try {
  // ── N155 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  if (corre("n155")) {
    console.log("\n══ N155 · prueba-est-tica · estilista · la cita con ?reprogramar=1 ══");
    const { negocio, base, N, sesion } = await negocioPrueba("prueba-est-tica");
    const { data: estado } = await N.rpc("estado_cobro_en", { p_negocio_id: negocio.id });
    if (estado !== "prueba_vencida") mal(`prueba-est-tica no está en prueba vencida (${estado}); N155 necesita ese estado`);
    else {
      let citaId = CITA;
      if (!citaId) {
        const { data: citas } = await N.from("citas_estetica").select("id, inicio").eq("negocio_id", negocio.id).in("estado", ["reservada", "confirmada"]).is("deleted_at", null).order("inicio", { ascending: false }).limit(1);
        citaId = citas?.[0]?.id ?? null;
      }
      if (!citaId) mal("prueba-est-tica no tiene una cita viva para abrir con ?reprogramar=1");
      else {
        const s = await sesion("estetica");
        const ctx = await contextoDe(s.cookies);
        const ruta = `/estetica/${citaId}?reprogramar=1`;
        const p = await abrir(ctx, base + ruta);
        await foto(p, "n155");
        const donde = new URL(p.url()).pathname;
        if (donde !== `/estetica/${citaId}`) mal(`la cita no abrió (${donde})`);
        const form = await p.evaluate(() => {
          const caja = document.querySelector("[data-reprogramar]");
          if (!caja) return null;
          const activo = (el) => !el.disabled && el.getAttribute("aria-disabled") !== "true" && !(el.readOnly && /^(INPUT|TEXTAREA)$/.test(el.tagName));
          const texto = (el) => (el.innerText || el.value || el.getAttribute("aria-label") || el.closest("label")?.innerText || el.name || el.type || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
          return [...caja.querySelectorAll("input, textarea, select, button")].map((el) => ({ texto: texto(el), activo: activo(el) }));
        });
        if (!form) mal(`${ruta}: no se abrió el formulario de reprogramar (sin [data-reprogramar])`);
        else {
          const activos = form.filter((c) => c.activo);
          if (activos.length) mal(`${ruta}: con la prueba vencida siguen habilitados en «Reprogramar»: ${activos.map((c) => `«${c.texto}»`).join(", ")}`);
          else bien(`${ruta}: los ${form.length} controles de «Reprogramar» están deshabilitados`);
        }
        const { activos } = await p.evaluate(controlesDeEscritura).catch(() => ({ activos: [] }));
        if (activos.length) mal(`${ruta}: ${activos.length} control(es) de escritura activo(s) en la pantalla — ${[...new Set(activos.map((a) => `${a.tipo}: «${a.texto}»`))].slice(0, 8).join(" · ")}`);
        else bien(`${ruta}: ningún control de escritura activo (definición de la auditoría)`);
        await ctx.close();
      }
    }
  }

  // ── N156 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  let vet = null;
  if (corre("n156") || corre("n157")) vet = await negocioPrueba("prueba-qa-onboarding-vet-s16");
  if (corre("n156")) {
    console.log("\n══ N156 · prueba-qa-onboarding-vet-s16 · el médico con rol de estética ══");
    const { negocio, base, N } = vet;
    const { data: medicos } = await N.from("medicos_veterinarios").select("profile_id").eq("negocio_id", negocio.id).is("deleted_at", null);
    const { data: miembros } = await N.from("membresias").select("profile_id, rol").eq("negocio_id", negocio.id).eq("rol", "estetica").is("deleted_at", null);
    const medico = (miembros ?? []).find((m) => (medicos ?? []).some((x) => x.profile_id === m.profile_id));
    if (!medico) mal("la clínica no tiene un médico designado con el rol de estética (el caso de QA S16)");
    else {
      const s = await sesionDe(medico.profile_id, `${negocio.slug}.peludesk.mx`);
      const ctx = await contextoDe(s.cookies);
      for (const ruta of ["/veterinaria/agenda", "/veterinaria/expediente", "/veterinaria/recetas", "/estetica"]) {
        const p = await abrir(ctx, base + ruta);
        const donde = new URL(p.url()).pathname;
        const v = await p.evaluate(() => ({
          etiqueta: (document.querySelector("[data-etiqueta-rol]")?.textContent ?? "").trim(),
          aviso: (document.querySelector("[data-modulo-apagado-aviso]")?.textContent ?? "").trim(),
          nav: [...document.querySelectorAll("[data-nav-staff] a[href], nav a[href]")].map((a) => a.getAttribute("href") ?? "").filter((h) => /^\/estetica(\/|$|\?)/.test(h)),
        }));
        if (VER) console.log(`  · ${ruta} → ${donde} · etiqueta «${v.etiqueta}»`);
        if (ruta === "/estetica" && !donde.startsWith("/veterinaria")) mal(`/estetica lo mandó a ${donde} (le toca la agenda clínica)`);
        if (v.aviso) mal(`${donde}: el médico ve «${v.aviso.slice(0, 70)}…»`);
        if (!/^m[eé]dico veterinari[oa]$/i.test(v.etiqueta)) mal(`${donde}: bajo su nombre dice «${v.etiqueta || "(nada)"}» en vez de «Médico veterinario»`);
        if (v.nav.length) mal(`${donde}: el menú enlaza a Estética (apagada): ${v.nav.join(", ")}`);
        if (!v.aviso && /^m[eé]dico veterinari[oa]$/i.test(v.etiqueta) && !v.nav.length) bien(`${donde}: «${v.etiqueta}», sin aviso ni enlaces de Estética`);
        await foto(p, `n156-${ruta.replace(/\W+/g, "-")}`);
        await p.close();
      }
      await ctx.close();
    }
  }

  // ── N157 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  if (corre("n157")) {
    console.log(`\n══ N157 · prueba-qa-onboarding-vet-s16 · la consulta ${CONSULTA.slice(0, 8)} ══`);
    const { negocio, base, N } = vet;
    const { data: c } = await N.from("vet_consultas").select("id, estado, medico_id, perro_id").eq("negocio_id", negocio.id).eq("id", CONSULTA).maybeSingle();
    if (!c) mal(`la consulta ${CONSULTA} no existe en esa clínica`);
    else {
      const { data: recetas } = await N.from("vet_recetas").select("id, numero, estado").eq("negocio_id", negocio.id).eq("consulta_id", c.id).is("deleted_at", null).order("numero");
      const vivas = (recetas ?? []).filter((r) => r.estado !== "anulada");
      console.log(`  · consulta ${c.estado}; recetas ligadas en la base: ${(recetas ?? []).map((r) => `N.º ${r.numero} (${r.estado})`).join(", ") || "ninguna"}`);
      const { data: med } = await N.from("medicos_veterinarios").select("profile_id").eq("id", c.medico_id).maybeSingle();
      const quien = med?.profile_id ?? (await N.from("membresias").select("profile_id").eq("negocio_id", negocio.id).eq("rol", "admin").is("deleted_at", null).limit(1)).data?.[0]?.profile_id;
      const s = await sesionDe(quien, `${negocio.slug}.peludesk.mx`);
      const ctx = await contextoDe(s.cookies);
      const p = await abrir(ctx, `${base}/veterinaria/consulta/${c.id}`);
      await foto(p, "n157");
      const v = await p.evaluate(() => ({
        ver: [...document.querySelectorAll("[data-ver-receta]")].map((a) => ({ texto: a.textContent.trim(), href: a.getAttribute("href") })),
        emitir: [...document.querySelectorAll("[data-emitir-receta]")].map((a) => a.textContent.trim()),
        lista: [...document.querySelectorAll("[data-lista-recetas-consulta] li")].map((li) => li.textContent.trim().slice(0, 60)),
      }));
      if (vivas.length === 0) mal("esa consulta no tiene receta emitida ligada: no sirve para N157 (pásame otra con --consulta)");
      else {
        for (const r of vivas) {
          const enlace = v.ver.find((x) => x.href === `/veterinaria/recetas/${r.id}`);
          if (!enlace) mal(`la consulta no enseña «Ver receta N.º ${r.numero}» (solo: ${[...v.ver.map((x) => x.texto), ...v.emitir].join(", ") || "nada"})`);
          else bien(`«${enlace.texto}» → ${enlace.href}`);
        }
        if (v.emitir.some((t) => /^Emitir receta$/.test(t))) mal("sigue el botón «Emitir receta» a secas aunque ya hay receta (le toca «Ver receta» y «Emitir otra receta»)");
        if (!v.lista.length) mal("no sale la lista de recetas de la consulta");
        else bien(`lista de recetas de la consulta: ${v.lista.join(" | ")}`);
      }
      await ctx.close();
    }
  }
} finally {
  await nav.close().catch(() => {});
}

console.log(hallazgos.length ? `\n✘ QA S53: ${hallazgos.length} hallazgo(s).` : "\n✔ QA S53: N155, N156 y N157 se ven corregidos en producción.");
process.exit(hallazgos.length ? 1 : 0);
