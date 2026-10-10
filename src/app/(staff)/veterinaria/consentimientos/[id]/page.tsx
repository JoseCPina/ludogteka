import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { ETIQUETA_CONSENTIMIENTO, llenarConsentimiento } from "@/lib/veterinaria/carnet";
import { cancelarConsentimiento } from "../actions";
import { FirmaConsentimiento, VerFirmado } from "./firma";

export default async function Consentimiento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const [{ data: c }, puede] = await Promise.all([
    supabase.from("consentimientos").select("*, perros(nombre), clientes(nombre)").eq("id", id).is("deleted_at", null).maybeSingle(),
    vetPuede(supabase, "hospitalizar"),
  ]);
  if (!c) notFound();
  const { data: campos } = await supabase.rpc("consentimiento_campos", { p_id: id });
  const mapa = (campos ?? {}) as Record<string, string>;
  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const mascota = un(c.perros as { nombre: string } | { nombre: string }[] | null);
  const dueno = un(c.clientes as { nombre: string } | { nombre: string }[] | null);
  const pendiente = c.estado === "pendiente_firma";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link href={c.hospitalizacion_id ? `/veterinaria/hospitalizacion/${c.hospitalizacion_id}` : "/veterinaria/consentimientos"} className="text-sm font-semibold text-morado hover:underline">← Volver</Link>
      {c.estado === "firmado" && (
        <Alert variante="exito" titulo="Firmado">
          Lo firmó {c.firmante_nombre as string} el {formatearFecha(c.firmado_at as string, zona)} {horaLocalDeInstante(c.firmado_at as string, zona)}. El PDF quedó sellado con la hora, la IP y un hash.
        </Alert>
      )}
      {c.estado === "cancelado" && <Alert variante="error" titulo="Cancelado">{c.cancelado_motivo as string}</Alert>}
      <article className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-wide text-n-500">{ETIQUETA_CONSENTIMIENTO[c.tipo as string]} · {mascota?.nombre} · {dueno?.nombre}</p>
          <h1 className="mt-1 text-xl font-bold text-n-900">{llenarConsentimiento(c.titulo as string, mapa)}</h1>
        </header>
        <div className="whitespace-pre-line leading-relaxed text-n-800">{llenarConsentimiento(c.cuerpo as string, mapa)}</div>
      </article>
      {pendiente && puede && (
        <div className="flex flex-col gap-3">
          <FirmaConsentimiento id={id} firmanteInicial={dueno?.nombre ?? ""} />
          <Desplegable texto="Cancelar este consentimiento">
            <FormularioAccion accion={cancelarConsentimiento.bind(null, id)} textoBoton="Cancelar consentimiento" variante="peligro">
              <Textarea label="Motivo" name="motivo" rows={2} required />
            </FormularioAccion>
          </Desplegable>
        </div>
      )}
      {c.estado === "firmado" && c.storage_path && <VerFirmado ruta={c.storage_path as string} />}
    </div>
  );
}
