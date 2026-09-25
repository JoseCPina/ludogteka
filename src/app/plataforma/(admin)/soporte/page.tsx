import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { restablecerPasswordPersona } from "../../acciones";

type Persona = {
  persona_id: string; email: string; nombre: string | null; telefonos: string[] | null;
  negocios: { negocio: string; slug: string; rol: string }[]; ultimo_acceso: string | null;
};

const ROL: Record<string, string> = { admin: "admin", recepcion: "recepción", estetica: "estética", cliente: "cliente" };

// Soporte de PeluDesk: una persona es UNA cuenta en todos sus negocios.
// Aquí se busca en toda la plataforma y se le restablece la contraseña —
// lo que ningún negocio puede hacer cuando la persona está en varios.
export default async function Soporte({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await exigirPlataforma();
  const { q = "" } = await searchParams;
  const { data, error } = q.trim() ? await supabase.rpc("plataforma_buscar_personas", { p_busqueda: q }) : { data: [], error: null };
  const personas = (data ?? []) as Persona[];
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Soporte</h1>
        <p className="mt-1 text-n-600">Busca a una persona por su teléfono (a diez dígitos) o su correo exacto.</p>
      </div>
      <form className="flex flex-wrap items-end gap-3" action="/plataforma/soporte">
        <div className="min-w-64 flex-1">
          <Field label="Teléfono o correo" name="q" defaultValue={q} />
        </div>
        <button type="submit" className="min-h-12 rounded-md bg-azul px-5 font-semibold text-white hover:opacity-90">Buscar</button>
      </form>
      {error && <Alert variante="error" titulo="No se pudo buscar">{error.message}</Alert>}
      {q.trim() && !error && personas.length === 0 && <p className="text-n-600">Nadie con ese teléfono o correo.</p>}
      <ul className="flex flex-col gap-4">
        {personas.map((p) => (
          <li key={p.persona_id} className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
            <div>
              <p className="font-bold text-n-900">{p.nombre ?? p.email}</p>
              <p className="text-sm text-n-600">
                {p.email}
                {(p.telefonos ?? []).length ? ` · tel. ${(p.telefonos ?? []).join(", ")}` : ""}
              </p>
              <p className="mt-1 text-sm text-n-600">
                {p.negocios.length
                  ? p.negocios.map((n) => `${n.negocio} (${ROL[n.rol] ?? n.rol})`).join(" · ")
                  : "Sin negocio"}
              </p>
            </div>
            <FormularioPlataforma accion={async (fd) => {
              "use server";
              return restablecerPasswordPersona(p.persona_id, String(fd.get("motivo") ?? ""));
            }} textoBoton="Restablecer contraseña" variante="secundario">
              <Field label="Motivo" name="motivo" required ayuda="Quién lo pidió y cómo comprobaste que era la persona. Queda en la bitácora." />
            </FormularioPlataforma>
          </li>
        ))}
      </ul>
    </div>
  );
}
