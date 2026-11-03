/** «Contrato de guardería», pero «Contrato general» tal cual: el tipo del negocio a veces ya empieza con «Contrato». */
export function nombreDeContrato(tipoNombre: string): string {
  const t = tipoNombre.trim();
  return /^contrato\b/i.test(t) ? t : `Contrato de ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
}
