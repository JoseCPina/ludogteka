import type { Periodicidad } from "./iva";

/** Lo que devuelve mi_cobro() (la suscripción del negocio vista por su admin). */
export type MiCobro = {
  estado: "exento" | "prueba" | "prueba_vencida" | "al_corriente" | "gracia" | "solo_lectura" | "cancelado" | "sin_cobro";
  plan: string;
  prueba_termina_at: string | null;
  plan_id: string | null;
  complementos: string[];
  web_gratis: boolean;
  exento: boolean;
  tiene_suscripcion: boolean;
  tiene_cliente: boolean;
  estado_stripe: string | null;
  plan_contratado: string | null;
  periodicidad: Periodicidad | null;
  complementos_contratados: string[];
  monto_centavos: number | null;
  periodo_fin: string | null;
  prueba_hasta: string | null;
  cancela_al_terminar: boolean;
  primer_fallo_at: string | null;
  solo_lectura_desde: string | null;
  factura_pendiente_url: string | null;
  cambio_programado: { plan: string | null; periodicidad: Periodicidad | null; complementos: string[]; desde: string | null } | null;
  toca_recordatorio: boolean;
};

export type PlanOferta = {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  tipo: "plan" | "complemento";
  precio_mensual: number;
  modulos: string[];
};

/** Lo que el admin escoge en «Módulos y plan». */
export type Seleccion = { plan: string; periodicidad: Periodicidad; web: boolean };

export type ModuloQueSeApaga = { clave: string; nombre: string; pendientes: number; que: string | null };

export type ResultadoCobro = { error: string | null; url?: string; exito?: string };
