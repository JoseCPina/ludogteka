// Lo que lleva una propuesta de raza desde un formulario. Vive aparte de las
// acciones porque un archivo "use server" solo puede exportar funciones.
export type DatosRazaPropuesta = {
  nombre: string;
  // Otros nombres con los que se le conoce, separados por comas.
  variantes: string;
  tamanoId: string;
  pelajeId: string;
  notas: string;
  // Solo lo llena quien tiene «Precios y tarifas» (la base lo vuelve a exigir).
  grupoId: string;
};

export function propuestaVacia(nombre = ""): DatosRazaPropuesta {
  return { nombre, variantes: "", tamanoId: "", pelajeId: "", notas: "", grupoId: "" };
}

/** Lo que el formulario muestra de una propuesta de raza ya hecha. */
export type PropuestaRazaVista = {
  nombre: string;
  grupoNombre: string | null;
  // true = ya está en la base y el perro ya está ligado; false = viaja con el formulario.
  enviada: boolean;
  datos: DatosRazaPropuesta | null;
};

export function leerPropuestaJson(texto: string): DatosRazaPropuesta | null {
  try {
    const j = JSON.parse(texto) as Partial<DatosRazaPropuesta>;
    if (!j || typeof j.nombre !== "string" || !j.nombre.trim()) return null;
    const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    return {
      nombre: s(j.nombre, 80).trim(),
      variantes: s(j.variantes, 300),
      tamanoId: s(j.tamanoId, 40),
      pelajeId: s(j.pelajeId, 40),
      notas: s(j.notas, 600),
      grupoId: s(j.grupoId, 40),
    };
  } catch {
    return null;
  }
}
