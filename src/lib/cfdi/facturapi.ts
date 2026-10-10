import type { AdaptadorPac, ConexionPac, ElementoCatalogo, EstadoCancelacion, ResultadoTimbrado, SolicitudTimbrado } from "./tipos";
import { ErrorPac, mensajeDeErrorPac } from "./errores";

/**
 * Facturapi (API v2). Una llave por organización: cada negocio tiene la suya
 * (sk_test_… en pruebas, sk_live_… en producción) en Vault.
 *
 * ESTADO DE ESTA INTEGRACIÓN: escrita contra la documentación de Facturapi y
 * probada contra el doble de scripts/auditoria/lib/facturapi-falso.mjs. Todavía
 * NO se ha corrido contra el sandbox real (falta la llave de prueba): los campos
 * marcados «por confirmar» son los primeros que hay que mirar si el sandbox
 * responde distinto.
 */
const TOPE_MS = 25_000;
// Fuera de producción, FACTURAPI_API_URL apunta al doble de las auditorías.
const URL_BASE = (process.env.VERCEL_ENV !== "production" ? process.env.FACTURAPI_API_URL?.trim() : "") || "https://www.facturapi.io/v2";

type Json = Record<string, unknown>;

const PERIODICIDAD: Record<string, string> = { dia: "day", semana: "week", mes: "month" };

export class Facturapi implements AdaptadorPac {
  readonly nombre = "facturapi";
  constructor(private readonly llave: string) {}

  private async pedir(ruta: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    let r: Response;
    try {
      r = await fetch(`${URL_BASE}${ruta}`, {
        method: init.method ?? "GET",
        headers: { Authorization: `Bearer ${this.llave}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TOPE_MS),
        cache: "no-store",
      });
    } catch (e) {
      const tope = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new ErrorPac(
        tope ? "El PAC no respondió a tiempo." : "No se pudo conectar con el PAC.",
        0,
        true,
        e instanceof Error ? e.message : String(e)
      );
    }
    if (!r.ok) {
      const texto = await r.text();
      let cuerpo: unknown = texto;
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        /* queda el texto */
      }
      throw new ErrorPac(mensajeDeErrorPac(r.status, cuerpo), r.status, r.status >= 500, texto.slice(0, 500));
    }
    return r;
  }

  private async json<T = Json>(ruta: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const r = await this.pedir(ruta, init);
    return (await r.json()) as T;
  }

  private aResultado(f: Json): ResultadoTimbrado {
    return {
      uuid: String(f.uuid ?? ""),
      pac_factura_id: String(f.id ?? ""),
      folio: f.folio_number != null ? String(f.folio_number) : null,
      serie: f.series != null && f.series !== "" ? String(f.series) : null,
      fecha: String(f.date ?? new Date().toISOString()),
      total: Number(f.total ?? 0),
      subtotal: f.subtotal != null ? Number(f.subtotal) : null,
    };
  }

  async timbrar(s: SolicitudTimbrado): Promise<ResultadoTimbrado> {
    const items = s.conceptos.map((c) => {
      const taxes = c.exento ? [{ type: "IVA", factor: "Exento" }] : [{ type: "IVA", rate: c.tasa }];
      return {
        quantity: c.cantidad,
        product: {
          description: c.descripcion,
          product_key: c.clave_prod_serv,
          unit_key: c.clave_unidad,
          unit_name: c.unidad,
          price: Number((c.importe_con_iva / c.cantidad).toFixed(6)),
          tax_included: true,
          taxability: "02",
          taxes,
        },
      };
    });
    const cuerpo: Json = {
      type: "I",
      customer: {
        legal_name: s.receptor.nombre,
        tax_id: s.receptor.rfc,
        tax_system: s.receptor.regimen,
        ...(s.receptor.email ? { email: s.receptor.email } : {}),
        address: { zip: s.receptor.cp },
      },
      items,
      payment_form: s.forma_pago,
      payment_method: s.metodo_pago,
      use: s.receptor.uso,
      currency: "MXN",
      ...(s.serie ? { series: s.serie } : {}),
      // por confirmar: external_id en la factura (sirve para recuperar un timbrado cortado).
      external_id: s.referencia,
    };
    if (s.tipo === "global" && s.periodo_desde && s.periodicidad) {
      const d = new Date(`${s.periodo_desde}T12:00:00Z`);
      cuerpo.global = {
        periodicity: PERIODICIDAD[s.periodicidad],
        months: String(d.getUTCMonth() + 1).padStart(2, "0"),
        year: d.getUTCFullYear(),
      };
    }
    if (s.relacion_tipo && s.relacionada_uuid) {
      cuerpo.related_documents = [{ relationship: s.relacion_tipo, documents: [s.relacionada_uuid] }];
    }
    const f = await this.json("/invoices", { method: "POST", body: cuerpo });
    const r = this.aResultado(f);
    if (!r.uuid) throw new ErrorPac("El PAC contestó sin UUID.", 200, true, JSON.stringify(f).slice(0, 300));
    return r;
  }

  async buscarPorReferencia(referencia: string): Promise<ResultadoTimbrado | null> {
    // por confirmar: filtro external_id del listado de facturas.
    const lista = await this.json<{ data?: Json[] }>(`/invoices?external_id=${encodeURIComponent(referencia)}&limit=5`);
    const f = (lista.data ?? []).find((x) => x.external_id === referencia && x.uuid);
    return f ? this.aResultado(f) : null;
  }

  private aEstado(f: Json): EstadoCancelacion {
    if (f.status === "canceled") return "cancelada";
    const c = String(f.cancellation_status ?? "none");
    if (c === "pending") return "pendiente";
    if (c === "rejected") return "rechazada";
    if (c === "accepted" || c === "expired") return "cancelada";
    return "vigente";
  }

  async cancelar(id: string, motivo: string, sustitutaUuid: string | null): Promise<EstadoCancelacion> {
    const q = new URLSearchParams({ motive: motivo });
    if (motivo === "01" && sustitutaUuid) q.set("substitution", sustitutaUuid);
    const f = await this.json(`/invoices/${encodeURIComponent(id)}?${q}`, { method: "DELETE" });
    const e = this.aEstado(f);
    // Un DELETE aceptado que no cancela todavía es una solicitud en proceso.
    return e === "vigente" ? "pendiente" : e;
  }

  async estadoCancelacion(id: string): Promise<EstadoCancelacion> {
    return this.aEstado(await this.json(`/invoices/${encodeURIComponent(id)}`));
  }

  async descargar(id: string, formato: "pdf" | "xml") {
    const r = await this.pedir(`/invoices/${encodeURIComponent(id)}/${formato}`);
    return { contenido: await r.arrayBuffer(), tipo: formato === "pdf" ? "application/pdf" : "application/xml" };
  }

  async enviarPorCorreo(id: string, correo: string) {
    await this.json(`/invoices/${encodeURIComponent(id)}/email`, { method: "POST", body: { email: correo } });
  }

  private async catalogo(ruta: string, q: string): Promise<ElementoCatalogo[]> {
    const l = await this.json<{ data?: { key?: string; description?: string }[] }>(`${ruta}?q=${encodeURIComponent(q)}&limit=15`);
    return (l.data ?? []).filter((x) => x.key).map((x) => ({ clave: String(x.key), descripcion: String(x.description ?? "") }));
  }
  buscarProductos(q: string) {
    return this.catalogo("/catalogs/products", q);
  }
  buscarUnidades(q: string) {
    return this.catalogo("/catalogs/units", q);
  }
}

export function adaptadorFacturapi(c: ConexionPac): AdaptadorPac {
  return new Facturapi(c.llave);
}
