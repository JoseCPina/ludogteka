// Acepta cómo la gente lo escribe de verdad (espacios, guiones,
// paréntesis, con o sin +52) y lo reduce a 10 dígitos planos para
// guardar — ese es el formato que se busca y se compara en toda la app.
export function normalizarTelefono(valor: string): string | null {
  let digitos = valor.replace(/\D/g, "");
  if (digitos.length === 12 && digitos.startsWith("52")) digitos = digitos.slice(2);
  if (digitos.length === 13 && digitos.startsWith("521")) digitos = digitos.slice(3);
  return digitos.length === 10 ? digitos : null;
}

export function formatearTelefono(digitos: string): string {
  if (digitos.length !== 10) return digitos;
  return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`;
}
