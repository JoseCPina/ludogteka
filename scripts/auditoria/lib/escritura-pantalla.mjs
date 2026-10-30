// QA N151: ¿qué botones, enlaces y campos de ESCRITURA siguen activos en la pantalla? Lo usan
// `permisos-pantalla-dev.mjs --perfil prueba-vencida` y `qa-n151-prod.mjs`. Es una definición PROPIA de la auditoría,
// escrita desde la regla («crear, agendar, cobrar, check-in, firmar, subir, editar…»), no la de la app
// (src/lib/cobro/bloqueo-escritura.ts): si la app se equivoca al decidir qué escribe, esto lo ve. Lo único que toma de
// la app es la excepción explícita `data-sin-bloqueo` (buscar, filtrar, exportar, contratar), y la cuenta aparte.
//
// Un control de escritura cuenta como ACTIVO si no está `disabled`, ni `aria-disabled="true"`, ni (un campo de texto)
// `readOnly`.

/** Se evalúa en el navegador: `await pagina.evaluate(controlesDeEscritura)`. */
export function controlesDeEscritura() {
  const CAPTURA = /\/(nuevo|nueva|checkin|checkout|walkin|cobrar|cobrar-junto|cargo|venta|ajustes-servicio)$|^\/caja\/pases$|^\/admin\/importar(\/|$)/;
  const VERBO = /^\s*\+?\s*(nuev[oa]s?|agregar|añadir|crear|registrar|agendar|reservar|cobrar|check-?\s?in|check-?\s?out|hacer check|firmar|subir|editar|guardar|capturar|vender|aplicar|confirmar|eliminar|borrar|anular|dar de (alta|baja)|abrir turno|cerrar turno|enviar|mandar|marcar|iniciar|finalizar|terminar|devolver|importar|invitar|asignar|corregir)\b/i;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const activo = (el) =>
    !el.disabled && el.getAttribute("aria-disabled") !== "true" && !(el.readOnly && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|file|button|submit)$/.test(el.type));
  const texto = (el) => (el.innerText || el.value || el.getAttribute("aria-label") || el.title || el.getAttribute("placeholder") || el.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const fuera = (el) => el.closest("[data-nav-staff], nav, header, [data-aviso-plan], [data-aviso-solo-lectura]");
  // La ayuda (artículos, asistente y tickets de soporte) se queda abierta a propósito: la base deja escribir un ticket
  // con el negocio en solo lectura y es por donde se pide ayuda justamente entonces.
  if (/^\/ayuda(\/|$)/.test(location.pathname)) return { activos: [], exentos: 0 };
  const main = document.querySelector("main") ?? document.body;
  const activos = [];
  let exentos = 0;
  const agregar = (el, tipo) => {
    if (!visible(el) || fuera(el)) return;
    if (el.closest("[data-sin-bloqueo]")) { exentos++; return; }
    if (activo(el)) activos.push({ tipo, texto: texto(el) || el.tagName.toLowerCase() });
  };
  const vistos = new Set();
  const uno = (el, tipo) => { if (!vistos.has(el)) { vistos.add(el); agregar(el, tipo); } };
  for (const a of main.querySelectorAll("a[href]")) {
    const ruta = (a.getAttribute("href") || "").split(/[?#]/)[0].replace(/\/+$/, "");
    if (ruta.startsWith("/") && !ruta.startsWith("/ayuda") && CAPTURA.test(ruta)) uno(a, "enlace a capturar");
  }
  for (const f of main.querySelectorAll('input[type="file"]')) {
    // Un input de archivo suele ir escondido detrás de su botón o etiqueta: cuenta lo que se ve.
    const cara = f.labels?.[0] ?? f.closest("label") ?? f;
    if (!vistos.has(f)) { vistos.add(f); if (!fuera(cara) && visible(cara) && !f.closest("[data-sin-bloqueo]") && activo(f)) activos.push({ tipo: "subir archivo", texto: texto(cara) || "archivo" }); }
  }
  for (const b of main.querySelectorAll("button, [role=button], input[type=submit], a[href]")) {
    if (b.tagName === "A" && (b.getAttribute("href") || "").startsWith("/ayuda")) continue;
    if (VERBO.test(texto(b))) uno(b, b.tagName === "A" ? "enlace" : "botón");
  }
  for (const form of main.querySelectorAll("form")) {
    if ((form.getAttribute("method") || "").toLowerCase() === "get" || form.matches("[role=search]")) continue;
    for (const c of form.querySelectorAll("button:not([type=button]), input[type=submit]")) uno(c, "enviar formulario");
    for (const c of form.querySelectorAll("input:not([type=hidden]):not([type=search]), select, textarea")) uno(c, "campo de formulario");
  }
  return { activos, exentos };
}

/** ¿El texto de la franja es el que le toca a ese rol? */
export function franjaEsperada(rol) {
  return rol === "admin"
    ? { texto: /Tu prueba terminó: tus datos están a salvo\. Contrata para seguir capturando/, boton: /^Contratar$/ }
    : { texto: /La prueba del negocio terminó\. Pídele al dueño que contrate para seguir capturando/, boton: null };
}
