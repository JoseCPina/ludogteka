import { formatearFecha } from "@/lib/formato";

export type PersonaStaff = {
  id: string;
  nombre_completo: string | null;
  rol: string;
  email: string;
  creado_at: string;
  ultimo_acceso: string | null;
};

// La lista del personal para quien tiene el permiso de personal (sale de
// listar_personal: solo recepción y estética). Solo lectura: cambiar roles
// y dar permisos es de admin y está en la lista de cuentas.
export function ListaPersonal({ personas, zona }: { personas: PersonaStaff[]; zona: string }) {
  if (personas.length === 0) return <p className="text-sm text-n-600">Todavía no hay personal de recepción ni de estética.</p>;
  return (
    <ul className="divide-y divide-n-200 rounded-md border border-n-200">
      {personas.map((p) => (
        <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <span className="flex flex-col">
            <span className="font-semibold text-n-900">{p.nombre_completo || p.email}</span>
            <span className="text-sm text-n-600">{p.email}</span>
          </span>
          <span className="text-sm text-n-600">
            {p.rol === "recepcion" ? "Recepción" : "Estética"} ·{" "}
            {p.ultimo_acceso ? `entró el ${formatearFecha(p.ultimo_acceso, zona)}` : "todavía no entra"}
          </span>
        </li>
      ))}
    </ul>
  );
}
