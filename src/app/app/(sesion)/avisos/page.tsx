import { misAvisos } from "@/lib/app/datos";
import { llavePublicaVapid } from "@/lib/app/push";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { ActivarAvisos } from "./activar-avisos";
import { ListaAvisos } from "./lista-avisos";

// Avisos: lo que la app te tiene que decir (vacunas, recordatorios, mascotas perdidas cerca, mensajes) y el control
// de los avisos en este celular. La zona horaria es la del celular del dueño (no hay negocio): se usa la del sistema.
export default async function AvisosPage() {
  const supabase = await createSupabaseServerClient("portal");
  const [avisos, { count }] = await Promise.all([misAvisos(), supabase.from("app_push_suscripciones").select("id", { count: "exact", head: true }).is("deleted_at", null)]);
  const zona = "America/Mexico_City";
  const filas = avisos.map((a) => ({ ...a, cuando: `${formatearFecha(a.createdAt, zona)} ${horaLocalDeInstante(a.createdAt, zona)}` }));
  return (
    <>
      <div className="apd-aparece">
        <span className="apd-ceja">Avisos</span>
        <h1 className="apd-titulo">Lo que tienes que saber</h1>
        <p className="apd-linea">Vacunas que tocan, recordatorios y cualquier cosa importante de tus mascotas. Aquí y, si quieres, en tu celular.</p>
      </div>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
        <ActivarAvisos llavePublica={llavePublicaVapid()} tieneSuscripciones={(count ?? 0) > 0} />
      </section>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }}>
        <ListaAvisos avisos={filas} />
      </section>
    </>
  );
}
