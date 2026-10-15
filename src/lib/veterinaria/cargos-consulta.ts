// Los cargos de una consulta veterinaria (migración 20261027000000): lo que sale de
// `vet_consulta_cargos(consulta)`.
export type LineaCargo = {
  id: string;
  tipo: "consulta" | "vacuna" | "medicamento" | "procedimiento";
  origen: "catalogo" | "carnet" | "inventario" | "manual";
  concepto: string;
  cantidad: number;
  precio_unitario: number | null;
  precio_original: number | null;
  importe: number | null;
  estado: "propuesto" | "quitado" | "cubierto" | "cobrado";
  cubierto_por: "estimado" | "teleconsulta" | null;
  motivo_quitado: string | null;
  ajustado: boolean;
  ajuste_motivo: string | null;
  cargo_id: string | null;
};

export type CargosConsulta = {
  estado_consulta: "borrador" | "firmada" | "anulada";
  lineas: LineaCargo[];
  total: number;
  sin_precio: number;
  reserva_id: string | null;
  cuenta_con_cobros: boolean;
  puede_ajustar: boolean;
  catalogo: { id: string; nombre: string; precio: number | null }[];
  productos: { id: string; nombre: string; precio: number | null; unidad: string; controlado: boolean }[];
};

export const ETIQUETA_TIPO_CARGO: Record<LineaCargo["tipo"], string> = {
  consulta: "Consulta",
  vacuna: "Vacuna",
  medicamento: "Medicamento",
  procedimiento: "Procedimiento",
};
