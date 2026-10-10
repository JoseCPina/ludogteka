import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { cargarMedicos, miMedico } from "@/lib/veterinaria/lotes";
import { buscarMascotas, etiquetaEspecie } from "@/lib/veterinaria/buscar";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { FormularioIngreso } from "./ingreso";

type Fila = {
  id: string; mascota: string; especie: string | null; dueno: string; motivo: string; ubicacion: string | null; medico: string; ingreso_at: string; dias: number;
  dosis_atrasadas: number; dosis_pendientes: number; proxima_dosis: string | null; ultimo_monitoreo: { registrado_at: string; temperatura_c: number | null } | null; consentimiento: string | null;
};

export default async function CensoHospitalizacion({ searchParams }: { searchParams: Promise<{ perro?: string; q?: string }> }) {
  const { perro: perroId, q } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const [puede, { data: crudo, error }, { data: ajustes }] = await Promise.all([
    vetPuede(supabase, "hospitalizar"),
    supabase.rpc("hospitalizacion_censo"),
    supabase.rpc("veterinaria_ajustes_actuales"),
  ]);
  const censo = (crudo ?? []) as Fila[];

  let formulario: React.ReactNode = null;
  if (puede && perroId) {
    const [{ data: perro }, medicos, propio] = await Promise.all([
      supabase.from("perros").select("id, nombre, clientes(nombre)").eq("id", perroId).is("deleted_at", null).maybeSingle(),
      cargarMedicos(supabase),
      miMedico(supabase),
    ]);
    if (perro) {
      const dueno = (Array.isArray(perro.clientes) ? perro.clientes[0] : perro.clientes) as { nombre: string } | null;
      formulario = (
        <section className="flex max-w-2xl flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">Ingresar a {perro.nombre as string} <span className="font-normal text-n-600">· {dueno?.nombre}</span></h2>
          {medicos.length === 0 ? (
            <Alert variante="advertencia" titulo="Falta un médico veterinario">Un admin designa a los médicos en Veterinaria → Médicos.</Alert>
          ) : (
            <FormularioIngreso perroId={perro.id as string} medicos={medicos} medicoPropio={propio} precioDia={(ajustes as { hospitalizacion_precio_dia?: number | null } | null)?.hospitalizacion_precio_dia ?? null} />
          )}
        </section>
      );
    }
  }
  const candidatas = puede && !perroId ? await buscarMascotas(supabase, q ?? "") : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Hospitalización</h1>
        <p className="mt-1 max-w-3xl text-n-600">Quiénes están internados ahora, con sus dosis pendientes y su último monitoreo.</p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar el censo">{error.message}</Alert>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Internados ({censo.length})</h2>
        {censo.length === 0 ? (
          <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">No hay nadie hospitalizado ahora.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {censo.map((f) => (
              <li key={f.id}>
                <Link href={`/veterinaria/hospitalizacion/${f.id}`} className={`flex flex-col gap-1.5 rounded-lg border bg-white p-4 hover:bg-n-50 ${f.dosis_atrasadas > 0 ? "border-ambar" : "border-n-200"}`}>
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-lg font-bold text-n-900">{f.mascota} <span className="text-sm font-normal text-n-500">· {etiquetaEspecie(f.especie)} · día {f.dias}</span></span>
                    <span className="text-sm text-n-600">{f.ubicacion ?? "Sin ubicación"}</span>
                  </span>
                  <span className="text-sm text-n-700">{f.motivo} · {f.dueno} · Responsable: {f.medico}</span>
                  <span className="flex flex-wrap gap-2 text-xs font-semibold">
                    {f.dosis_atrasadas > 0 && <span className="rounded-full bg-ambar-suave px-2 py-0.5 text-ambar-oscuro">{f.dosis_atrasadas} dosis atrasada(s)</span>}
                    <span className="rounded-full bg-n-100 px-2 py-0.5 text-n-700">{f.dosis_pendientes} dosis pendiente(s){f.proxima_dosis ? ` · próxima ${horaLocalDeInstante(f.proxima_dosis, zona)}` : ""}</span>
                    {f.ultimo_monitoreo && <span className="rounded-full bg-n-100 px-2 py-0.5 text-n-700">Último monitoreo {formatearFecha(f.ultimo_monitoreo.registrado_at, zona)} {horaLocalDeInstante(f.ultimo_monitoreo.registrado_at, zona)}{f.ultimo_monitoreo.temperatura_c !== null ? ` · ${f.ultimo_monitoreo.temperatura_c} °C` : ""}</span>}
                    <span className={`rounded-full px-2 py-0.5 ${f.consentimiento === "firmado" ? "bg-menta-suave text-menta-oscuro" : "bg-ambar-suave text-ambar-oscuro"}`}>
                      {f.consentimiento === "firmado" ? "Consentimiento firmado" : f.consentimiento ? "Consentimiento sin firmar" : "Sin consentimiento"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {formulario}

      {puede && !perroId && (
        <section className="flex max-w-2xl flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">Ingresar una mascota</h2>
          <form className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="Buscar mascota o dueño" name="q" defaultValue={q ?? ""} />
            </div>
            <Button type="submit" variante="secundario">Buscar</Button>
          </form>
          <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
            {candidatas.slice(0, 15).map((c) => (
              <li key={c.id}>
                <Link href={`/veterinaria/hospitalizacion?perro=${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-n-50">
                  <span className="font-semibold text-n-900">{c.nombre} <span className="font-normal text-n-500">· {etiquetaEspecie(c.especie)}</span></span>
                  <span className="text-sm text-n-600">{c.dueno}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
