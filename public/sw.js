/* Service worker de la app instalable (PWA). Solo LECTURA sin conexión:
 *
 *  · Guarda copia de las pantallas de consulta que ya se abrieron (el tablero del día,
 *    la agenda de estética, la ficha de un cliente y la de una mascota) y las muestra
 *    si no hay conexión, con el aviso «sin conexión» que pone la propia app.
 *  · NUNCA guarda ni responde nada que no sea un GET de esas pantallas: ningún POST (las
 *    acciones de la app), ninguna llamada a /api ni a /auth, ni la base de datos. Sin
 *    conexión, escribir falla; no se encola nada para después.
 *  · La copia es de UNA persona: si cambia la sesión (otra cuenta en el mismo equipo),
 *    o al cerrar sesión, se borra todo.
 */
const VERSION = "v1";
const ESTATICOS = `peludesk-estaticos-${VERSION}`;
const PAGINAS = `peludesk-paginas-${VERSION}`;
const META = `peludesk-meta-${VERSION}`;
const OFFLINE = "/sin-conexion";
const ESPERA_RED_MS = 6000;

// Lo único que se guarda para verlo sin conexión (ruta exacta o con un id).
const GUARDABLES = [
  /^\/recepcion\/?$/,
  /^\/estetica\/?$/,
  /^\/clientes\/[0-9a-f-]{36}\/?$/,
  /^\/perros\/[0-9a-f-]{36}\/?$/,
];
const esGuardable = (ruta) => GUARDABLES.some((r) => r.test(ruta));

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(ESTATICOS)
      .then((c) => c.add(new Request(OFFLINE, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith("peludesk-") && !n.endsWith(`-${VERSION}`)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

async function borrarCopias() {
  await caches.delete(PAGINAS);
  await caches.delete(META);
}

// Cada copia lleva a quién pertenece: otra persona en el mismo equipo no ve la de la anterior.
async function usuarioGuardado() {
  const meta = await caches.open(META);
  const r = await meta.match("/__usuario");
  return r ? r.text() : null;
}

self.addEventListener("message", (evento) => {
  const d = evento.data || {};
  if (d.tipo === "limpiar") {
    evento.waitUntil(borrarCopias());
  } else if (d.tipo === "sesion" && typeof d.usuario === "string") {
    evento.waitUntil(
      (async () => {
        const actual = await usuarioGuardado();
        if (actual !== d.usuario) {
          await borrarCopias();
          const meta = await caches.open(META);
          await meta.put("/__usuario", new Response(d.usuario));
        }
      })()
    );
  } else if (d.tipo === "precargar" && Array.isArray(d.urls)) {
    evento.waitUntil(
      Promise.all(
        d.urls
          .filter((u) => typeof u === "string" && u.startsWith("/") && esGuardable(u.split("?")[0]))
          .map(async (u) => {
            try {
              const r = await fetch(u, { credentials: "same-origin", redirect: "manual" });
              if (r.ok && r.status === 200) await guardarPagina(new Request(u), r);
            } catch {
              /* sin red: se queda lo que había */
            }
          })
      )
    );
  }
});

// La clave de una pantalla: su ruta y sus parámetros.
function claveDe(solicitud) {
  const url = new URL(solicitud.url);
  return url.pathname + url.search;
}

// OJO: `respuesta` ya viene clonada por quien llama, SÍNCRONAMENTE. Clonar aquí, después de un
// await, falla («body already used») cuando el navegador ya empezó a leer la original.
async function guardarPagina(solicitud, respuesta) {
  const cache = await caches.open(PAGINAS);
  await cache.put(claveDe(solicitud), respuesta);
}

function conTope(promesa, ms) {
  return new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error("tiempo")), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolver(v);
      },
      (e) => {
        clearTimeout(t);
        rechazar(e);
      }
    );
  });
}

self.addEventListener("fetch", (evento) => {
  const solicitud = evento.request;
  if (solicitud.method !== "GET") return; // las acciones de la app nunca pasan por aquí
  const url = new URL(solicitud.url);
  if (url.origin !== self.location.origin) return;
  const ruta = url.pathname;

  // Los archivos de la app (con hash en el nombre, no cambian): primero la copia.
  if (ruta.startsWith("/_next/static/")) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(ESTATICOS);
        const guardada = await cache.match(solicitud);
        if (guardada) return guardada;
        const r = await fetch(solicitud);
        if (r.ok) cache.put(solicitud, r.clone());
        return r;
      })()
    );
    return;
  }

  // Pantallas de consulta: la red primero (siempre lo más nuevo); sin red, la última copia.
  // Solo la página completa: las navegaciones internas de Next (RSC) no se tocan; si fallan
  // sin conexión, Next abre la página completa y esa sí sale de la copia.
  if (solicitud.mode !== "navigate") return;
  if (!esGuardable(ruta)) {
    // Cualquier otra pantalla sin conexión: el aviso con a dónde sí se puede entrar.
    evento.respondWith(
      fetch(solicitud).catch(async () => (await (await caches.open(ESTATICOS)).match(OFFLINE)) || Response.error())
    );
    return;
  }
  evento.respondWith(
    (async () => {
      const cache = await caches.open(PAGINAS);
      const copia = await cache.match(claveDe(solicitud));
      try {
        // Con copia guardada, si el servidor tarda de más se enseña la copia; SIN copia se
        // espera al servidor lo que haga falta (una pantalla lenta no es una pantalla sin conexión).
        const r = copia ? await conTope(fetch(solicitud), ESPERA_RED_MS) : await fetch(solicitud);
        // Solo una respuesta de verdad de la pantalla (no un redirect al login ni un error).
        if (r.ok && r.status === 200 && !r.redirected) evento.waitUntil(guardarPagina(solicitud, r.clone()));
        return r;
      } catch {
        if (copia) return copia;
        const aviso = await (await caches.open(ESTATICOS)).match(OFFLINE);
        return aviso || Response.error();
      }
    })()
  );
});
