/* Service worker de la app para dueños (app.peludesk.mx). docs/app-duenos/PLAN.md, Fase 0.
 *
 *  · Instalable y útil con mala señal: guarda copia de las pantallas que ya se abrieron (las de la app, GET) y la
 *    pantalla «sin conexión»; una navegación va primero a la red (con tope) y, si no hay, a la copia.
 *  · Nunca guarda ni responde un POST (las acciones), ni /api, ni /auth ni la base. Sin conexión no se escribe nada.
 *  · La copia es de UNA persona: si cambia la sesión, se borra.
 *  · Notificaciones push: las muestra (título, cuerpo, ícono) y al tocarlas abre la pantalla que traen.
 */
const VERSION = "v2";
const PAGINAS = `peludesk-app-paginas-${VERSION}`;
const ESTATICOS = `peludesk-app-estaticos-${VERSION}`;
const META = `peludesk-app-meta-${VERSION}`;
const OFFLINE = "/sin-conexion";
const TOPE_RED_MS = 4000;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(ESTATICOS)
      .then((c) => c.addAll([new Request(OFFLINE, { cache: "reload" })]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith("peludesk-app-") && !n.endsWith(`-${VERSION}`)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

let generacion = 0;
async function borrarCopias() {
  generacion++;
  await caches.delete(PAGINAS);
  await caches.delete(META);
}
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
  }
});

function esPaginaDeLaApp(url) {
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname === "/entrar") return false;
  return true;
}

function comoCopia(copia) {
  const h = new Headers(copia.headers);
  h.set("Server-Timing", "desde-copia");
  return new Response(copia.body, { status: copia.status, statusText: copia.statusText, headers: h });
}

self.addEventListener("fetch", (evento) => {
  const solicitud = evento.request;
  if (solicitud.method !== "GET") return;
  const url = new URL(solicitud.url);
  if (url.origin !== self.location.origin) return;

  // Lo estático de Next (con hash en el nombre): primero la copia.
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(
      caches.open(ESTATICOS).then(async (cache) => {
        const copia = await cache.match(solicitud);
        if (copia) return copia;
        const r = await fetch(solicitud);
        if (r.ok) cache.put(solicitud, r.clone());
        return r;
      })
    );
    return;
  }

  // Una pantalla: red primero (con tope), luego la copia, luego «sin conexión».
  if (solicitud.mode === "navigate" && esPaginaDeLaApp(url)) {
    evento.respondWith(
      (async () => {
        const g = generacion;
        const clave = url.pathname + url.search;
        try {
          const r = await Promise.race([fetch(solicitud), new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("tope")), TOPE_RED_MS))]);
          if (r && r.ok && r.status === 200 && g === generacion) {
            const cache = await caches.open(PAGINAS);
            cache.put(clave, r.clone());
          }
          return r;
        } catch {
          const cache = await caches.open(PAGINAS);
          const copia = await cache.match(clave);
          if (copia) return comoCopia(copia);
          const offline = await caches.match(OFFLINE);
          return offline || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })()
    );
  }
});

// Notificaciones push: { titulo, cuerpo, url, etiqueta, acciones?: [{ action, title, url }] }.
self.addEventListener("push", (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { titulo: "PeluDesk", cuerpo: evento.data ? evento.data.text() : "" };
  }
  const titulo = datos.titulo || "PeluDesk";
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.cuerpo || "",
      icon: "/marca/peludesk/favicon-180.png",
      badge: "/marca/peludesk/favicon-48.png",
      tag: datos.etiqueta || undefined,
      data: { url: datos.url || "/avisos", acciones: Array.isArray(datos.acciones) ? datos.acciones : [] },
      actions: Array.isArray(datos.acciones) ? datos.acciones.slice(0, 2).map((a) => ({ action: a.action, title: a.title })) : [],
      lang: "es-MX",
    })
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const d = evento.notification.data || {};
  const accion = (d.acciones || []).find((a) => a.action === evento.action);
  const destino = new URL((accion && accion.url) || d.url || "/avisos", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.location.origin));
      if (abierta) return abierta.focus().then((v) => (v && "navigate" in v ? v.navigate(destino) : undefined));
      return self.clients.openWindow(destino);
    })
  );
});
