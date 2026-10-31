import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { horaLocalParaInput } from "@/lib/formato";
import { SESIONES } from "@/lib/escuela/sesiones";
import { guardarSesion } from "./acciones";

const ZONA = "America/Mexico_City";
type Fila = { clave: string; fecha_at: string | null; duracion_min: number; url_en_vivo: string | null; youtube_id: string | null; inscritos: number };

// La Escuela PeluDesk: fecha, liga en vivo y grabación de cada sesión (el texto de las guías vive en el código).
export default async function EscuelaPlataforma() {
  const { supabase } = await exigirPlataforma();
  const { data, error } = await supabase.rpc("escuela_sesiones_publicas");
  const filas = ((data ?? []) as Fila[]).map((f) => ({ ...f, inscritos: Number(f.inscritos) }));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Escuela PeluDesk</h1>
        <p className="mt-1 text-n-600">Las seis sesiones de peludesk.mx/escuela: fecha y hora (centro de México), la liga de la sesión en vivo y el id del video de YouTube cuando exista la grabación. La inscripción llega por el bot y el recordatorio sale una hora antes (tarea cada 15 minutos).</p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos leer las sesiones">{error.message}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {SESIONES.map((s) => {
          const f = filas.find((x) => x.clave === s.clave);
          return (
            <section key={s.clave} className="rounded-lg border border-n-200 bg-white p-5">
              <h2 className="text-lg font-bold text-n-900">{s.titulo}</h2>
              <p className="mt-1 text-sm text-n-600">{f?.inscritos ?? 0} inscritos · herramienta: {s.herramienta.nombre}</p>
              <FormularioPlataforma accion={guardarSesion.bind(null, s.clave)} textoBoton="Guardar" variante="secundario" className="mt-3">
                <Field label="Fecha y hora (centro de México)" name="fecha" type="datetime-local" defaultValue={f?.fecha_at ? horaLocalParaInput(f.fecha_at, ZONA) : ""} />
                <Field label="Duración (minutos)" name="duracion" type="number" min={15} max={240} defaultValue={f?.duracion_min ?? 60} />
                <Field label="Liga de la sesión en vivo (Meet, Zoom, YouTube en vivo)" name="url_en_vivo" type="url" defaultValue={f?.url_en_vivo ?? ""} />
                <Field label="Id del video de YouTube (grabación)" name="youtube_id" defaultValue={f?.youtube_id ?? ""} ayuda="Lo que va después de v= en la dirección del video." />
              </FormularioPlataforma>
            </section>
          );
        })}
      </div>
    </div>
  );
}
