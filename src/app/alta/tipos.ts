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
  telefono: string;
  direccion: string;
  email: string;
  password: string;
  perros: PerroAlta[];
};

export type PerroCreado = { id: string; nombre: string };

export type ResultadoAlta = {
  error: string | null;
  clienteId?: string;
  perros?: PerroCreado[];
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
