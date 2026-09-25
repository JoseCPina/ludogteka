import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { ZONAS_MEXICO } from "@/lib/plataforma/tipos";
import { DOMINIO_PLATAFORMA } from "@/lib/negocio/host";
import { crearNegocio } from "../../../acciones";

// Alta de un negocio: nace con su configuración inicial copiada del modelo
// (grupos de raza y su asignación, requisitos sanitarios, alertas, motivos
// de descuento, áreas de inventario, categorías de gasto, tipos de
// contrato sin plantilla, servicios sin precio, cupo y horario) y con su
// primer admin. Precios, contratos y datos del local los captura el propio
// negocio desde su app.
export default async function NuevoNegocio() {
  await exigirPlataforma();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Dar de alta un negocio</h1>
        <p className="mt-1 text-n-600">
          Nace con la configuración básica de Ludogteka como punto de partida (catálogos, servicios sin precio, horario y
          cupo); sus precios, contratos y datos del local los captura el negocio en su app.
        </p>
      </div>
      <FormularioPlataforma accion={crearNegocio} textoBoton="Dar de alta">
        <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="font-bold text-n-900">El negocio</h2>
          <Field label="Nombre" name="nombre" required />
          <Field
            label="Dirección corta"
            name="slug"
            required
            pattern="[a-z0-9]([a-z0-9\-]{0,40}[a-z0-9])?"
            ayuda={`Minúsculas, números y guiones. Su dirección será <corta>.${DOMINIO_PLATAFORMA} hasta que tenga dominio propio.`}
          />
          <Select label="Zona horaria" name="zona" defaultValue="America/Mexico_City">
            {ZONAS_MEXICO.map((z) => (
              <option key={z.zona} value={z.zona}>{z.etiqueta}</option>
            ))}
          </Select>
          <Field label="Ciudad" name="ciudad" />
          <Field label="Dominio propio (opcional)" name="dominio" placeholder="ejemplo.mx" ayuda="Sin www. Hay que apuntar su DNS a Vercel antes de que funcione." />
          <Field label="Color de la marca (opcional)" name="color" placeholder="#3148dd" ayuda="Con él se arma su ícono de pestaña mientras no suba uno propio." />
        </section>
        <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="font-bold text-n-900">Su primer admin</h2>
          <Field label="Correo" name="admin_email" type="email" required ayuda="Si ya tiene cuenta en PeluDesk, entra con su misma contraseña; si no, te damos un link para que la escoja." />
          <Field label="Nombre" name="admin_nombre" />
        </section>
      </FormularioPlataforma>
    </div>
  );
}
