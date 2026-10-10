import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { cargarMedicos, miMedico } from "@/lib/veterinaria/lotes";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormularioAccion } from "@/components/formulario-accion";
import { MOTIVOS_CERTIFICADO } from "@/lib/veterinaria/carnet";
import { emitirCertificado } from "../../carnet/actions";

export default async function NuevoCertificado({ searchParams }: { searchParams: Promise<{ perro?: string }> }) {
  const { perro: perroId } = await searchParams;
  if (!perroId) redirect("/veterinaria/carnet");
  const supabase = await createSupabaseServerClient();
  const [puede, { data: perro }, medicos, propio, { data: ajustes }] = await Promise.all([
    vetPuede(supabase, "emitir_certificados"),
    supabase.from("perros").select("id, nombre, especie, clientes(nombre)").eq("id", perroId).is("deleted_at", null).maybeSingle(),
    cargarMedicos(supabase),
    miMedico(supabase),
    supabase.rpc("veterinaria_ajustes_actuales"),
  ]);
  if (!perro) notFound();
  const dueno = (Array.isArray(perro.clientes) ? perro.clientes[0] : perro.clientes) as { nombre: string } | null;
  const dias = Number((ajustes as { certificado_vigencia_dias?: number } | null)?.certificado_vigencia_dias ?? 30);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link href={`/veterinaria/carnet/${perroId}`} className="text-sm font-semibold text-morado hover:underline">← Carnet de {perro.nombre as string}</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Certificado de salud de {perro.nombre as string}</h1>
        <p className="mt-1 text-n-600">Propietario: {dueno?.nombre ?? "—"}. El certificado lleva las vacunas y desparasitaciones vigentes del carnet, tal como están hoy.</p>
      </div>
      {!puede ? (
        <Alert variante="advertencia" titulo="Sin permiso">Emitir certificados es de un médico veterinario o de quien tenga el permiso «Emitir certificados».</Alert>
      ) : medicos.length === 0 ? (
        <Alert variante="advertencia" titulo="Falta un médico veterinario">Un certificado va a nombre de un médico veterinario con cédula. Un admin lo designa en Veterinaria → Médicos.</Alert>
      ) : (
        <FormularioAccion accion={emitirCertificado.bind(null, perroId)} textoBoton="Emitir certificado" className="rounded-lg border border-n-200 bg-white p-5">
          <Select label="Médico veterinario que firma" name="medico_id" defaultValue={propio ?? ""} required>
            <option value="">— Elige —</option>
            {medicos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Para qué es" name="motivo" defaultValue="general">
              {MOTIVOS_CERTIFICADO.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
            </Select>
            <Field label="Destino (opcional)" name="destino" placeholder="Guadalajara, Jal." />
          </div>
          <Textarea label="Exploración física" name="exploracion" rows={4} required ayuda="Lo que encontraste: estado general, mucosas, hidratación, temperatura, signos de enfermedad…" />
          <Textarea label="Observaciones (opcional)" name="observaciones" rows={2} />
          <Field label="Vigencia en días" name="dias" type="number" min={1} max={365} defaultValue={dias} ayuda="Por omisión la del negocio (Veterinaria → Ajustes)." />
        </FormularioAccion>
      )}
    </div>
  );
}
