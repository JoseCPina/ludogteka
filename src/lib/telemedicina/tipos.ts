// Tipos de la teleconsulta (sin "use server": los comparten pantallas y acciones).

export type VentanaTeleconsulta = "antes" | "abierta" | "cerrada" | "cancelada";

/** Lo que ve el personal (agenda y pantalla de la teleconsulta). */
export type DetalleTeleconsulta = {
  id: string;
  proveedor: "daily" | "simulado";
  estado: "programada" | "finalizada" | "cancelada";
  ventana: VentanaTeleconsulta;
  desde: string;
  hasta: string;
  consentimiento_id: string;
  consentimiento_estado: string;
  consentimiento_firmado: boolean;
  consentimiento_firmado_at: string | null;
  consentimiento_firmante: string | null;
  pago_requerido: boolean;
  pagado: boolean;
  saldo: number;
  monto: number | null;
  reserva_id: string | null;
  url_pago: string | null;
  puede_entrar: boolean;
  entro_dueno_at: string | null;
  entro_medico_at: string | null;
  liga_generada_at: string | null;
};

/** Lo que ve el dueño en la liga pública (sin nada clínico del expediente). */
export type TeleconsultaPublica = {
  ventana: VentanaTeleconsulta;
  desde: string;
  hasta: string;
  negocio: string;
  telefono_negocio: string | null;
  mascota: string;
  dueno: string;
  medico: string;
  inicia_at: string;
  termina_at: string;
  motivo: string | null;
  consentimiento_firmado: boolean;
  consentimiento_firmado_at: string | null;
  consentimiento_firmante: string | null;
  pago_requerido: boolean;
  pagado: boolean;
  monto: number | null;
  url_pago: string | null;
  puede_entrar: boolean;
  consentimiento: { id: string; titulo: string; cuerpo: string; estado: string; firmado_at: string | null; campos: Record<string, string> };
};

export const ETIQUETA_VENTANA: Record<VentanaTeleconsulta, string> = {
  antes: "Todavía no abre",
  abierta: "Sala abierta",
  cerrada: "Terminó",
  cancelada: "Cancelada",
};
