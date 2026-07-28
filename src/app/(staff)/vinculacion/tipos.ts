export type CuentaPendiente = {
  id: string;
  email: string;
  creado_en: string;
};

export type CuentaVinculada = {
  profile_id: string;
  email: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  vinculado_en: string | null;
  vinculado_por: string | null;
  automatico: boolean | null;
};

export type ClienteBusqueda = {
  id: string;
  nombre: string;
  telefono: string;
};
