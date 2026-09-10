// Tipos compartidos entre el formulario y las server actions. Van en su
// propio archivo porque uno con "use server" solo puede exportar funciones
// async (misma razón por la que traducir-error.ts vive aparte).

export type PerroAlta = {
  nombre: string;
  // Las dos, no una: `raza` es lo que el dueño ve escrito, `raza_id` es
  // lo que decide el precio de estética. Cuando escoge del catálogo van
  // las dos; cuando escribe una raza que no está, solo el texto.
  raza: string;
  raza_id: string | null;
  sexo: string;
  fecha_nacimiento: string;
  tamano_id: string;
  pelaje_id: string;
  alimentacion_notas: string;
  contacto_emergencia_nombre: string;
  contacto_emergencia_telefono: string;
  veterinario_nombre: string;
  veterinario_telefono: string;
  veterinario_clinica: string;
};

export type DatosAlta = {
  nombre: string;
  // La identidad del cliente. Con esto entra al portal, y con esto se
  // decide si ya existe un expediente suyo.
  telefono: string;
  direccion: string;
  // Opcional: un dato de contacto mas, no con lo que entra. La mayoria de
  // los clientes de este negocio no lo tiene ni lo quiere teclear.
  email: string;
  // La cuenta es opcional en el flujo de estetica: quien viene dos horas a
  // banar a su perro no necesariamente quiere un portal. Sin cuenta el
  // expediente queda igual de completo.
  crearCuenta: boolean;
  password: string;
  perros: PerroAlta[];
};

export type PerroCreado = { id: string; nombre: string };

// El contrato del flujo por el que entro el cliente, generado por la misma
// transaccion que crea el expediente y devuelto para que la ultima
// pantalla del alta se lo ponga enfrente. Si se generara despues, o si la
// pantalla tuviera que salir a buscarlo, habria una ventana en la que el
// dueno ya se fue y el contrato quedo sin firmar.
export type ContratoPendiente = {
  id: string;
  perro_id: string;
  perro_nombre: string;
  tipo_nombre: string;
};

export type ResultadoAlta = {
  error: string | null;
  clienteId?: string;
  perros?: PerroCreado[];
  contratos?: ContratoPendiente[];
};

// Lo que manda el formulario de complemento: un cliente que ya existe y
// entra por el otro flujo. Los campos de los perros van parciales a
// proposito — solo viaja lo que la pantalla le pidio, que es solo lo que
// le faltaba.
export type PerroComplemento = Partial<PerroAlta> & { id: string };

export type DatosComplemento = {
  direccion: string;
  // Solo cuando el expediente todavia no tiene cuenta (lo capturo
  // recepcion a mano y la persona nunca se registro). El correo no se
  // pide: la cuenta se arma con el telefono que ya trae el expediente.
  password: string;
  perros: PerroComplemento[];
  perrosNuevos: PerroAlta[];
};

export type ResultadoComplemento = {
  error: string | null;
  clienteId?: string;
  perros?: PerroCreado[];
  contratos?: ContratoPendiente[];
};

export function perroVacio(): PerroAlta {
  return {
    nombre: "",
    raza: "",
    raza_id: null,
    sexo: "",
    fecha_nacimiento: "",
    tamano_id: "",
    pelaje_id: "",
    alimentacion_notas: "",
    contacto_emergencia_nombre: "",
    contacto_emergencia_telefono: "",
    veterinario_nombre: "",
    veterinario_telefono: "",
    veterinario_clinica: "",
  };
}
