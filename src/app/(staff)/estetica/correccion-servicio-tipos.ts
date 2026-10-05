// Lo que devuelven cotizar_correccion_servicio y corregir_servicio_cita.
// Va en su propio archivo: un archivo "use server" solo exporta funciones async.

export type TipoAjuste = "ninguno" | "cobro_adicional" | "saldo_a_favor";

export type OrdenAbierta = { id: string; tipo: string; estado: string; monto: number; proveedor: string };

export type CotizacionCorreccion = {
  ok: boolean;
  error: string | null;
  bloqueos: string[];
  pide_excepcion: boolean;
  servicio_actual: string;
  servicio_nuevo: string | null;
  precio_actual: number;
  precio_nuevo: number | null;
  diferencia: number | null;
  estado_cita: string;
  pagado: number;
  saldo_actual: number;
  saldo_despues: number | null;
  tipo_ajuste: TipoAjuste;
  descuento_cuenta: number;
  ordenes_abiertas: OrdenAbierta[];
};

export type ResultadoCorreccion = {
  correccion_id: string;
  servicio_anterior: string;
  servicio_nuevo: string;
  precio_anterior: number;
  precio_nuevo: number;
  diferencia: number;
  estado_cita: string;
  tipo_ajuste: TipoAjuste;
  saldo_despues: number;
  reserva_id: string | null;
  inventario: { regresados?: number; consumidos?: number };
  ajuste_nomina: boolean;
  ordenes_canceladas?: number;
};
