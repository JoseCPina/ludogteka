import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { cargarProductosConLotes } from "@/lib/veterinaria/lotes";
import { buscarMascotas, etiquetaEspecie } from "@/lib/veterinaria/buscar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormularioAccion, Desplegable, BotonAccion } from "@/components/formulario-accion";
import { formatearFechaCalendario, hoyNegocio, unidadSegunCantidad } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import type { RecetarioFila } from "@/lib/veterinaria/recetas";
import type { ProductoReceta } from "../nueva/editor-receta";
import { NavRecetas } from "../nav";
import { archivarRecetario, cancelarRecetario, registrarRecetario } from "../actions";
import { SurtirDocumento } from "../surtir";

// Estupefacientes (art. 234) y psicotrópicos de la fracción II (art. 245): se recetan en el recetario
// especial con código de barras, tratamientos de hasta 30 días (regla editable por la plataforma).
export default async function RecetarioEspecial({ searchParams }: { searchParams: Promise<{ q?: string; perro?: string; nuevo?: string; archivados?: string }> }) {
  const { q, perro, nuevo, archivados } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const [puede, { data, error }, { data: productosCrudo }, productosLotes, { data: reglaDias }] = await Promise.all([
    vetPuede(supabase, "registrar_recetas_sitpv"),
    supabase.rpc("vet_recetario_lista", { p_archivadas: archivados === "1", p_limite: 300 }),
    supabase.rpc("vet_productos_receta"),
    cargarProductosConLotes(supabase),
    supabase.from("vet_reglas").select("valor").eq("clave", "lgs_tratamiento_max_dias").maybeSingle(),
  ]);
  const filas = (data ?? []) as RecetarioFila[];
  const productos = ((productosCrudo ?? []) as ProductoReceta[]).filter((p) => p.documento === "receta_especial");
  const tope = Number(reglaDias?.valor ?? 30);

  let formulario: React.ReactNode = null;
  if (puede && nuevo === "1") {
    if (!perro) {
      const candidatas = await buscarMascotas(supabase, q ?? "");
      formulario = (
        <section className="flex max-w-3xl flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">Registrar un folio del recetario: elige a la mascota</h2>
          <form className="flex items-end gap-3">
            <input type="hidden" name="nuevo" value="1" />
            <div className="flex-1"><Field label="Buscar mascota o dueño" name="q" defaultValue={q ?? ""} /></div>
            <Button type="submit">Buscar</Button>
          </form>
          <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
            {candidatas.map((f) => (
              <li key={f.id}>
                <Link href={`/veterinaria/recetas/especial?nuevo=1&perro=${f.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50">
                  <span className="font-semibold text-n-900">{f.nombre} <span className="font-normal text-n-500">· {etiquetaEspecie(f.especie)}</span></span>
                  <span className="text-sm text-n-600">{f.dueno}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    } else if (productos.length === 0) {
      formulario = <Alert variante="advertencia" titulo="No hay productos que pidan recetario especial">Da de alta el producto en Inventario clínico con su clasificación de la Ley General de Salud (estupefaciente o psicotrópico fracción II).</Alert>;
    } else {
      formulario = (
        <section className="flex max-w-3xl flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">Registrar un folio del recetario especial</h2>
          <FormularioAccion accion={registrarRecetario} textoBoton="Registrar" className="rounded-lg border border-n-200 bg-white p-5">
            <input type="hidden" name="perro_id" value={perro} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Producto" name="insumo_id" required>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} · {p.clasificacion}</option>
                ))}
              </Select>
              <Field label="Fecha de la receta" name="fecha" type="date" max={hoyNegocio(zona)} defaultValue={hoyNegocio(zona)} />
              <Field label="Folio del recetario" name="folio" required />
              <Field label="Código de barras" name="codigo_barras" required />
              <Field label={`Días de tratamiento (máximo ${tope})`} name="dias" type="number" min={1} max={tope} required />
              <Field label="Cantidad diaria" name="cantidad_diaria" inputMode="decimal" required ayuda="En la unidad de consumo del producto." />
            </div>
            <Textarea label="Indicaciones (opcional)" name="indicaciones" rows={2} />
          </FormularioAccion>
        </section>
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Recetario especial</h1>
          <p className="mt-1 max-w-3xl text-n-600">Estupefacientes y psicotrópicos de la fracción II: se recetan en el recetario especial con código de barras, con tratamientos de hasta {tope} días. Aquí registras el folio y surtes contra él; el establecimiento que surte lleva su propio libro.</p>
        </div>
        {puede && !nuevo && <Link href="/veterinaria/recetas/especial?nuevo=1"><Button type="button">Registrar un folio</Button></Link>}
      </div>
      <NavRecetas activa="especial" />
      {formulario}
      {error ? (
        <Alert variante="error" titulo="No pudimos cargar los folios">Recarga la página. Si sigue, avísale al equipo técnico.</Alert>
      ) : filas.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-5 text-n-700">Todavía no hay folios del recetario especial.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((r) => {
            const lotes = productosLotes.find((p) => p.id === r.insumo_id)?.lotes ?? [];
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-n-900">Folio {r.folio} · {r.producto}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.estado === "cancelada" ? "bg-coral-suave text-coral-oscuro" : "bg-menta-suave text-menta-oscuro"}`}>{r.estado === "cancelada" ? "Cancelado" : "Vigente"}</span>
                  {r.archivada_at && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Archivado</span>}
                </div>
                <p className="text-sm text-n-700">{r.mascota} · {formatearFechaCalendario(r.fecha)} · {r.dias} días × {r.cantidad_diaria}{r.unidad ? ` ${unidadSegunCantidad(r.cantidad_diaria, r.unidad)}` : ""} = {r.cantidad_total} · código {r.codigo_barras} · {r.medico ?? "—"}</p>
                <p className="text-sm text-n-600">Surtido {r.surtido} de {r.cantidad_total}{r.unidad ? ` ${unidadSegunCantidad(r.cantidad_total, r.unidad)}` : ""}.{r.cancelada_motivo ? ` Cancelado: ${r.cancelada_motivo}.` : ""}</p>
                {puede && r.estado === "vigente" && (
                  <div className="flex flex-col gap-2">
                    {r.surtido < r.cantidad_total && (
                      <Desplegable texto="Surtir contra este folio" variante="secundario">
                        <SurtirDocumento tipo="recetario" docId={r.id} lotes={lotes} unidad={r.unidad} pacientes={[{ perro_id: r.perro_id, nombre: r.mascota ?? "Paciente" }]} />
                      </Desplegable>
                    )}
                    <Desplegable texto="Cancelar este folio" variante="secundario">
                      <FormularioAccion accion={cancelarRecetario.bind(null, r.id)} textoBoton="Cancelar folio" variante="peligro">
                        <Textarea label="Motivo" name="motivo" rows={2} required ayuda="Un folio ya surtido no se puede cancelar." />
                      </FormularioAccion>
                    </Desplegable>
                  </div>
                )}
                {puede && !r.archivada_at && (
                  <div className="flex flex-col gap-1">
                    <BotonAccion accion={archivarRecetario.bind(null, r.id)} texto="Archivar" variante="secundario" textoExito="Archivado" />
                    <p className="text-xs text-n-500">Se conserva hasta el {formatearFechaCalendario(r.conservar_hasta)}; antes de esa fecha no se puede archivar.</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link href={archivados === "1" ? "/veterinaria/recetas/especial" : "/veterinaria/recetas/especial?archivados=1"} className="w-fit text-sm font-semibold text-morado hover:underline">
        {archivados === "1" ? "Ocultar archivados" : "Ver también archivados"}
      </Link>
    </div>
  );
}
