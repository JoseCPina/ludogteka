import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";

type Fila = {
  id: string; slug: string; nombre: string; dominio: string | null; url_publica: string | null;
  zona_horaria: string; ciudad: string | null; activo: boolean; admins: string[] | null; clientes: number;
};

export default async function NegociosPlataforma() {
  const { supabase } = await exigirPlataforma();
  const { data, error } = await supabase.rpc("plataforma_negocios");
  const negocios = (data ?? []) as Fila[];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Negocios</h1>
          <p className="mt-1 text-n-600">Cada negocio vive en su dominio, con sus datos aparte de los demás.</p>
        </div>
        <Link href="/plataforma/negocios/nuevo" className="inline-flex min-h-12 items-center rounded-md bg-azul px-5 font-semibold text-white hover:opacity-90">
          Dar de alta un negocio
        </Link>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar los negocios">{error.message}</Alert>}
      <ul className="flex flex-col gap-3">
        {negocios.map((n) => (
          <li key={n.id} className="rounded-lg border border-n-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/plataforma/negocios/${n.id}`} className="text-lg font-bold text-n-900 hover:underline">{n.nombre}</Link>
              <span className={`text-sm font-semibold ${n.activo ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>{n.activo ? "Activo" : "Suspendido"}</span>
            </div>
            <p className="mt-1 text-sm text-n-600">
              {urlDelNegocio(n)} · {n.zona_horaria}{n.ciudad ? ` · ${n.ciudad}` : ""} · {n.clientes} clientes
            </p>
            <p className="mt-1 text-sm text-n-500">Admin: {(n.admins ?? []).join(", ") || "ninguno todavía"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
