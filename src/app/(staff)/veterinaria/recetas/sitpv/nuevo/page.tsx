import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { ProductoYLoteEspejo } from "./producto-lote";
import { cargarProductosConLotes, miMedico } from "@/lib/veterinaria/lotes";
import { buscarMascotas, etiquetaEspecie } from "@/lib/veterinaria/buscar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormularioAccion } from "@/components/formulario-accion";
import { hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import type { ProductoReceta } from "../../nueva/editor-receta";
import { registrarEspejo } from "../../actions";
import { Enlace } from "@/components/ui/enlace";

export default async function NuevoEspejo({ searchParams }: { searchParams: Promise<{ q?: string; perro?: string; uso?: string }> }) {
  const { q, perro, uso } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const puede = (await vetPuede(supabase, "registrar_recetas_sitpv")) && Boolean(await miMedico(supabase));
  const cabecera = (
    <div>
      <Enlace href="/veterinaria/recetas/sitpv" className="text-sm">← Registro SITPV</Enlace>
      <h1 className="mt-1 text-2xl font-bold text-n-900">Registrar una receta del SITPV</h1>
    </div>
  );
  if (!puede) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        {cabecera}
        <Alert variante="advertencia" titulo="Esto es de un médico veterinario con CPA">Pídele a un admin que te designe médico en Veterinaria → Médicos, con tu CPA del SITPV.</Alert>
      </div>
    );
  }

  const hospitalario = uso === "hospitalario";
  if (!perro && !hospitalario) {
    const filas = await buscarMascotas(supabase, q ?? "");
    return (
      <div className="flex flex-col gap-5">
        {cabecera}
        <p className="max-w-3xl text-n-600">Primero emite la receta cuantificada en el SITPV. Después regístrala aquí: elige a la mascota, o usa «Uso hospitalario» si el producto se va a ocupar en la clínica en varias aplicaciones.</p>
        <Enlace href="/veterinaria/recetas/sitpv/nuevo?uso=hospitalario">Es de uso hospitalario (sin paciente)</Enlace>
        <form method="get" className="flex max-w-xl items-end gap-3">
          <div className="flex-1"><Field label="Buscar mascota o dueño" name="q" defaultValue={q ?? ""} placeholder="Motita, Ana, 444…" /></div>
          <Button type="submit">Buscar</Button>
        </form>
        <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
          {filas.map((f) => (
            <li key={f.id}>
              <Enlace href={`/veterinaria/recetas/sitpv/nuevo?perro=${f.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50" forma="bloque">
                <span className="font-semibold text-n-900">{f.nombre} <span className="font-normal text-n-500">· {etiquetaEspecie(f.especie)}</span></span>
                <span className="text-sm text-n-600">{f.dueno}{f.telefono ? ` · ${f.telefono}` : ""}</span>
              </Enlace>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const zona = await zonaActual();
  const [{ data: productosCrudo }, conLotes, mascota] = await Promise.all([
    supabase.rpc("vet_productos_receta"),
    cargarProductosConLotes(supabase),
    perro ? supabase.from("perros").select("id, nombre, clientes(nombre)").eq("id", perro).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const productos = ((productosCrudo ?? []) as (ProductoReceta & { registro_senasica: string | null })[]).filter((p) => p.documento === "espejo_sitpv");
  const dueno = mascota.data ? ((Array.isArray(mascota.data.clientes) ? mascota.data.clientes[0] : mascota.data.clientes) as { nombre: string } | null) : null;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {cabecera}
      <p className="text-n-700">{hospitalario ? "Uso hospitalario: el producto se ocupa en la clínica, en parcialidades." : `${mascota.data?.nombre ?? "Mascota"} · de ${dueno?.nombre ?? "—"}`}</p>
      {productos.length === 0 ? (
        <Alert variante="advertencia" titulo="No hay productos de Grupo I en el inventario clínico">Da de alta el producto en Veterinaria → Inventario clínico con su clasificación de SENASICA (Grupo I). Si es un antimicrobiano, activa el espejo cuantificado en Ajustes.</Alert>
      ) : (
        <FormularioAccion accion={registrarEspejo} textoBoton="Registrar" className="rounded-lg border border-n-200 bg-white p-5">
          <input type="hidden" name="uso" value={hospitalario ? "hospitalario" : "paciente"} />
          <input type="hidden" name="perro_id" value={perro ?? ""} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ProductoYLoteEspejo productos={productos} conLotes={conLotes} />
            <Field label="Fecha de la receta" name="fecha" type="date" max={hoyNegocio(zona)} defaultValue={hoyNegocio(zona)} />
            <Field label="Presentación (opcional)" name="presentacion" />
            <Field label="Cantidad total que ampara" name="cantidad_total" inputMode="decimal" required ayuda="En la unidad de consumo del producto (ml, tabletas…)." />
            <Field label="Dosis" name="dosis" placeholder="0.5 ml/kg" />
            <Field label="Intervalo" name="intervalo" placeholder="Cada 8 horas" />
            <Field label="Duración" name="duracion" placeholder="3 días" />
            <Select label="¿Se ocupará en parcialidades?" name="parcialidades" defaultValue={hospitalario ? "si" : "no"}>
              <option value="no">No, se surte de una vez</option>
              <option value="si">Sí, en varias aplicaciones</option>
            </Select>
          </div>
          <Field label="Comprobante de compra (factura o remisión)" name="comprobante_compra" />
          <Textarea label="Observaciones (opcional)" name="observaciones" rows={2} ayuda={hospitalario ? "Se agregan solas «USO HOSPITALARIO» con el nombre de la clínica y «se ocupará en parcialidades»." : undefined} />
          <p className="text-sm text-n-600">El folio sale de tu bloque (el siguiente que te toca) y queda registrado a tu nombre y con tu CPA.</p>
        </FormularioAccion>
      )}
    </div>
  );
}
