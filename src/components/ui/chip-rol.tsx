const ESTILOS_ROL: Record<string, string> = {
  admin: "bg-azul-suave text-azul",
  recepcion: "bg-turquesa-suave text-turquesa-oscuro",
  estetica: "bg-verde-suave text-verde-oscuro",
  cliente: "bg-n-100 text-n-600",
};

const ETIQUETAS_ROL: Record<string, string> = {
  admin: "Admin",
  recepcion: "Recepción",
  estetica: "Estética",
  cliente: "Cliente",
};

export function ChipRol({ rol }: { rol: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
        ESTILOS_ROL[rol] ?? "bg-n-100 text-n-600"
      }`}
    >
      {ETIQUETAS_ROL[rol] ?? rol}
    </span>
  );
}
