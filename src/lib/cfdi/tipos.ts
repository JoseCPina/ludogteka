/**
 * Facturación CFDI 4.0. El PAC (quien timbra) es intercambiable: las pantallas
 * y las acciones solo conocen `AdaptadorPac`; Facturapi es la primera
 * implementación (facturapi.ts) y Facturama sería otra en su propio archivo.
 * Nada de aquí sabe de importes: los conceptos los calcula la base
 * (cfdi_lineas_cobro) y llegan en `SolicitudTimbrado`.
 */

export type ConceptoSolicitud = {
  descripcion: string;
  clave_prod_serv: string;
  clave_unidad: string;
  unidad: string;
  cantidad: number;
  valor_unitario: number;
  importe: number;
  tasa: number;
  exento: boolean;
  importe_con_iva: number;
};

export type Receptor = { rfc: string; nombre: string; cp: string; regimen: string; uso: string; extranjero?: boolean; email?: string | null };

/** Lo que entrega cfdi_iniciar_timbrado(). */
export type SolicitudTimbrado = {
  id: string;
  tipo: "ingreso" | "global";
  referencia: string;
  serie: string | null;
  forma_pago: string;
  metodo_pago: string;
  uso_cfdi: string | null;
  emisor: { rfc: string; nombre: string };
  receptor: Receptor;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  periodicidad: "dia" | "semana" | "mes" | null;
  total_esperado: number;
  relacion_tipo: string | null;
  relacionada_uuid: string | null;
  pac: string;
  modo: "pruebas" | "produccion";
  conceptos: ConceptoSolicitud[];
};

export type ResultadoTimbrado = {
  uuid: string;
  pac_factura_id: string;
  folio: string | null;
  serie: string | null;
  fecha: string;
  total: number;
  subtotal: number | null;
};

export type EstadoCancelacion = "cancelada" | "pendiente" | "rechazada" | "vigente";

export type ElementoCatalogo = { clave: string; descripcion: string };

export interface AdaptadorPac {
  readonly nombre: string;
  timbrar(s: SolicitudTimbrado): Promise<ResultadoTimbrado>;
  /** ¿Ya existe en el PAC lo que se mandó con esta referencia? (timbrado cortado a la mitad) */
  buscarPorReferencia(referencia: string): Promise<ResultadoTimbrado | null>;
  cancelar(pacFacturaId: string, motivo: string, sustitutaUuid: string | null): Promise<EstadoCancelacion>;
  estadoCancelacion(pacFacturaId: string): Promise<EstadoCancelacion>;
  descargar(pacFacturaId: string, formato: "pdf" | "xml"): Promise<{ contenido: ArrayBuffer; tipo: string }>;
  enviarPorCorreo(pacFacturaId: string, correo: string): Promise<void>;
  buscarProductos(consulta: string): Promise<ElementoCatalogo[]>;
  buscarUnidades(consulta: string): Promise<ElementoCatalogo[]>;
}

export type ConexionPac = { pac: string; llave: string; modo: "pruebas" | "produccion"; origen: "negocio" | "entorno" };
