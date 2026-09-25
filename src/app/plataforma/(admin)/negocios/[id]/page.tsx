import { notFound } from "next/navigation";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { ZONAS_MEXICO } from "@/lib/plataforma/tipos";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { actualizarNegocio, agregarAdmin, cambiarPlan } from "../../../acciones";

type Fila = {
  id: string; slug: string; nombre: string; dominio: string | null; url_publica: string | null; zona_horaria: string;
  ciudad: string | null; activo: boolean; plan: "activo" | "prueba" | "demo"; prueba_termina_at: string | null; marca: { color?: string | null; favicon?: string | null; logo?: string | null } | null; admins: string[] | null;
};

export default async function NegocioPlataforma({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await exigirPlataforma();
  const { data } = await supabase.rpc("plataforma_negocios");
  const n = ((data ?? []) as Fila[]).find((x) => x.id === id);
  if (!n) notFound();
  const zonas = ZONAS_MEXICO.some((z) => z.zona === n.zona_horaria) ? ZONAS_MEXICO : [{ zona: n.zona_horaria, etiqueta: n.zona_horaria }, ...ZONAS_MEXICO];
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">{n.nombre}</h1>
        <p className="mt-1 text-n-600">
          <a href={urlDelNegocio(n)} className="text-morado hover:underline">{urlDelNegocio(n)}</a> · dirección corta «{n.slug}»
        </p>
      </div>

      <FormularioPlataforma accion={actualizarNegocio.bind(null, n.id)} textoBoton="Guardar">
        <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="font-bold text-n-900">Configuración</h2>
          <Field label="Nombre" name="nombre" defaultValue={n.nombre} required />
          <Select label="Zona horaria" name="zona" defaultValue={n.zona_horaria}>
            {zonas.map((z) => (
              <option key={z.zona} value={z.zona}>{z.etiqueta}</option>
            ))}
          </Select>
          <Field label="Ciudad" name="ciudad" defaultValue={n.ciudad ?? ""} />
          <Field label="Dominio propio" name="dominio" defaultValue={n.dominio ?? ""} placeholder="ejemplo.mx" />
          <Field label="Dirección pública (opcional)" name="url_publica" defaultValue={n.url_publica ?? ""} placeholder="https://www.ejemplo.mx" ayuda="Solo si los links deben salir con otra dirección que https://<dominio> (p. ej. con www)." />
          <Field label="Color de la marca" name="color" defaultValue={n.marca?.color ?? ""} placeholder="#4b3f72" />
          <Field label="Logo (imagen)" name="logo" defaultValue={n.marca?.logo ?? ""} placeholder="/marca/negocios/logo.png o https://…" ayuda="Va en el encabezado de su staff, su portal, su login y su alta por link. Vacío: su logotipo de palabras si tiene, o su inicial y su nombre." />
          <Field label="Ícono de la pestaña (favicon)" name="favicon" defaultValue={n.marca?.favicon ?? ""} placeholder="/iconos/negocio.png o https://…" ayuda="Vacío: su inicial sobre el color de la marca." />
          <label className="flex items-center gap-2 text-n-800">
            <input type="checkbox" name="activo" defaultChecked={n.activo} className="h-5 w-5" />
            Activo (sin esto, su dominio responde «este sitio no existe»)
          </label>
        </section>
      </FormularioPlataforma>

      <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="font-bold text-n-900">Plan</h2>
        <p className="-mt-2 text-sm text-n-600">
          Una prueba vencida queda en solo lectura. Al activarlo, el negocio vuelve a poder guardar. Queda en la bitácora con el motivo.
        </p>
        <FormularioPlataforma accion={cambiarPlan.bind(null, n.id)} textoBoton="Guardar plan" variante="secundario">
          <Select label="Plan" name="plan" defaultValue={n.plan}>
            <option value="activo">Activo (cliente que paga)</option>
            <option value="prueba">Prueba gratis</option>
            <option value="demo">Demo (negocio de muestra)</option>
          </Select>
          <Field label="Prueba hasta (solo si es prueba)" name="prueba_hasta" type="date" defaultValue={n.prueba_termina_at ? new Date(n.prueba_termina_at).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }) : ""} />
          <Field label="Motivo" name="motivo" required placeholder="Pagó octubre por transferencia" />
        </FormularioPlataforma>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="font-bold text-n-900">Admins</h2>
        <p className="text-sm text-n-600">{(n.admins ?? []).join(", ") || "Ninguno todavía."}</p>
        <FormularioPlataforma accion={agregarAdmin.bind(null, n.id)} textoBoton="Agregar admin" variante="secundario" reiniciar>
          <Field label="Correo" name="admin_email" type="email" required />
          <Field label="Nombre" name="admin_nombre" />
        </FormularioPlataforma>
      </section>
    </div>
  );
}
