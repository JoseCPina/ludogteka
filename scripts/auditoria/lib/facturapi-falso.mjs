// Un Facturapi de mentiras para las auditorías de facturación (SOLO DESARROLLO).
// Habla la parte de la API v2 que usa src/lib/cfdi/facturapi.ts: crear factura
// (con external_id), buscarla por external_id, cancelarla (motivos 01 a 04, con
// «pendiente de aceptación» opcional), PDF, XML, correo y catálogos. El servidor
// de la app lo usa con FACTURAPI_API_URL (se ignora en producción).
//
// Control (para forzar casos): POST /__control con JSON
//   { cancelacion: "aceptada" | "pendiente", fallarTimbrado: n, cortarTrasCrear: n }
//   · fallarTimbrado n  → los próximos n POST /invoices dan 400 (rechazo del SAT)
//   · cortarTrasCrear n → los próximos n POST /invoices CREAN la factura y cortan la
//     conexión (el caso «quizá sí salió»)
// GET /__estado devuelve las facturas y las peticiones recibidas.
import http from "node:http";
import { randomUUID } from "node:crypto";

export function levantarFacturapiFalso(puerto = 4459) {
  const facturas = new Map();
  const peticiones = [];
  let folio = 100;
  const ctl = { cancelacion: "aceptada", fallarTimbrado: 0, cortarTrasCrear: 0 };

  const json = (res, estado, cuerpo) => {
    res.writeHead(estado, { "Content-Type": "application/json" });
    res.end(JSON.stringify(cuerpo));
  };
  const leer = (req) => new Promise((ok) => {
    let t = "";
    req.on("data", (c) => (t += c));
    req.on("end", () => { try { ok(t ? JSON.parse(t) : {}); } catch { ok({}); } });
  });

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const ruta = url.pathname.replace(/^\/v2/, "");
    if (ruta === "/__estado") return json(res, 200, { facturas: [...facturas.values()], peticiones });
    if (ruta === "/__control") { Object.assign(ctl, await leer(req)); return json(res, 200, ctl); }
    const auth = req.headers.authorization ?? "";
    peticiones.push({ metodo: req.method, ruta: ruta + url.search, auth: auth.slice(0, 14) });
    if (!/^Bearer sk_test_\w+/.test(auth)) return json(res, 401, { message: "Invalid API key" });

    if (req.method === "POST" && ruta === "/invoices") {
      const b = await leer(req);
      if (ctl.fallarTimbrado > 0) { ctl.fallarTimbrado--; return json(res, 400, { message: "El RFC del receptor no está en la lista de contribuyentes del SAT" }); }
      if (!b.customer?.tax_id || !Array.isArray(b.items) || !b.items.length) return json(res, 400, { message: "Faltan datos del cliente o conceptos" });
      if (b.customer.tax_id === "XAXX010101000" && !b.global) return json(res, 400, { message: "El RFC genérico requiere información global" });
      let total = 0;
      let subtotal = 0;
      for (const it of b.items) {
        const bruto = it.quantity * it.product.price;
        const t = it.product.taxes?.[0];
        const tasa = t?.factor === "Exento" ? 0 : (t?.rate ?? 0.16);
        const base = it.product.tax_included ? bruto / (1 + tasa) : bruto;
        subtotal += Math.round(base * 100) / 100;
        total += Math.round(base * 100) / 100 + Math.round(base * tasa * 100) / 100;
      }
      const f = {
        id: randomUUID().replace(/-/g, "").slice(0, 24),
        uuid: randomUUID().toUpperCase(),
        folio_number: ++folio,
        series: b.series ?? "",
        date: new Date().toISOString(),
        total: Math.round(total * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        status: "valid",
        cancellation_status: "none",
        external_id: b.external_id,
        customer: b.customer,
        use: b.use,
        payment_form: b.payment_form,
        global: b.global ?? null,
        related_documents: b.related_documents ?? null,
        items: b.items,
      };
      facturas.set(f.id, f);
      if (ctl.cortarTrasCrear > 0) { ctl.cortarTrasCrear--; req.socket.destroy(); return; }
      return json(res, 200, f);
    }
    if (req.method === "GET" && ruta === "/invoices") {
      const ext = url.searchParams.get("external_id");
      return json(res, 200, { data: [...facturas.values()].filter((f) => !ext || f.external_id === ext) });
    }
    const m = /^\/invoices\/(\w+)(?:\/(pdf|xml|email))?$/.exec(ruta);
    if (m) {
      const f = facturas.get(m[1]);
      if (!f) return json(res, 404, { message: "La factura no existe" });
      if (req.method === "GET" && !m[2]) return json(res, 200, f);
      if (req.method === "GET" && m[2] === "pdf") { res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(Buffer.from("%PDF-1.4 falso " + f.uuid)); }
      if (req.method === "GET" && m[2] === "xml") { res.writeHead(200, { "Content-Type": "application/xml" }); return res.end(`<cfdi:Comprobante UUID="${f.uuid}"/>`); }
      if (req.method === "POST" && m[2] === "email") { const b = await leer(req); f.correos = [...(f.correos ?? []), b.email]; return json(res, 200, { ok: true }); }
      if (req.method === "DELETE") {
        const motivo = url.searchParams.get("motive");
        if (!["01", "02", "03", "04"].includes(motivo)) return json(res, 400, { message: "Motivo de cancelación inválido" });
        if (motivo === "01" && !url.searchParams.get("substitution")) return json(res, 400, { message: "El motivo 01 requiere el UUID de sustitución" });
        f.motivo = motivo;
        f.sustitucion = url.searchParams.get("substitution");
        if (ctl.cancelacion === "pendiente") f.cancellation_status = "pending";
        else { f.status = "canceled"; f.cancellation_status = "accepted"; }
        return json(res, 200, f);
      }
    }
    if (req.method === "GET" && /^\/catalogs\/(products|units)$/.test(ruta)) {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const base = ruta.endsWith("products")
        ? [{ key: "01010101", description: "No existe en el catálogo" }, { key: "85121800", description: "Servicios veterinarios" }]
        : [{ key: "E48", description: "Unidad de servicio" }, { key: "H87", description: "Pieza" }];
      return json(res, 200, { data: base.filter((x) => x.description.toLowerCase().includes(q) || x.key.toLowerCase().includes(q) || q.length > 0 && base.length === 0) });
    }
    return json(res, 404, { message: `Ruta desconocida ${req.method} ${ruta}` });
  });
  return new Promise((ok) => servidor.listen(puerto, "127.0.0.1", () => ok({
    puerto,
    url: `http://127.0.0.1:${puerto}/v2`,
    facturas,
    peticiones,
    control: (c) => Object.assign(ctl, c),
    cerrar: () => new Promise((r) => servidor.close(() => r())),
  })));
}
