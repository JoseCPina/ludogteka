// Tipos de lo que devuelven las funciones de la base de Empleados.

export type ResultadoAccion = { error: string | null; ir?: string; exito?: string };

export type DiaAsistencia = {
  empleado_id: string;
  empleado_nombre: string;
  tiene_cuenta: boolean;
  fecha: string;
  hora_entrada_prog: string | null;
  hora_salida_prog: string | null;
  asistencia_id: string | null;
  entrada_at: string | null;
  salida_at: string | null;
  entrada_origen: string | null;
  salida_origen: string | null;
  corregida: boolean;
  minutos_retardo: number | null;
  estado: string;
  ausencia_tipo: string | null;
};

export type Desglose = {
  empleado_id: string;
  empleado_nombre: string;
  periodo_desde: string;
  periodo_hasta: string;
  esquema: {
    vigente_desde: string;
    sueldo_monto: number | null;
    sueldo_periodicidad: string | null;
    pago_por_dia: number | null;
    con_comision: boolean;
    recibe_propinas: boolean;
  } | null;
  dias: {
    periodo: number;
    programados: number;
    trabajados: number;
    faltas: number;
    retardos: number;
    vacaciones: number;
    otras_ausencias: number;
  };
  tarifa_dia_sueldo: number;
  sueldo: number;
  descuento_faltas: number;
  pago_dias: number;
  comisiones: number;
  comisiones_detalle: { cita_id: string; fecha: string; servicio: string; perro: string; precio: number; comision: number }[];
  propinas: number;
  propinas_detalle: { cobro_id: string; fecha: string; propina_total: number; propina: number }[];
  adelantos: number;
  adelantos_detalle: { adelanto_id: string; fecha: string; monto: number; motivo: string | null }[];
  total: number;
  costo: number;
  avisos: string[];
};

export type PagoNomina = {
  id: string;
  empleado_id: string;
  tipo: "pago" | "reverso";
  reverso_de: string | null;
  periodo_desde: string;
  periodo_hasta: string;
  sueldo: number;
  descuento_faltas: number;
  pago_dias: number;
  comisiones: number;
  propinas: number;
  adelantos: number;
  total: number;
  costo: number;
  desglose: Desglose | { reverso_de: string };
  metodo: string | null;
  fecha_pago: string;
  notas: string | null;
  motivo: string | null;
  created_at: string;
};
