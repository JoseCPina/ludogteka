import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Field } from "@/components/ui/field";
import { BotonAccion, Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { crearCategoria, editarCategoria, quitarCategoria } from "../gastos-actions";

// Categorías de gasto: solo admin (la base también lo aplica). Quitar una
// no toca los gastos que ya la usan.
export default async function CategoriasGastoPage() {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") redirect("/gastos");
  const supabase = await createSupabaseServerClient();
  const { data: categorias } = await supabase.from("categorias_gasto").select("id, clave, nombre, descripcion").is("deleted_at", null).order("orden");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/gastos" className="text-sm font-semibold text-azul hover:underline">
          ← Gastos
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Categorías de gasto</h1>
      </div>
      <ul className="divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
        {(categorias ?? []).map((c) => (
          <li key={c.id} className="flex flex-col gap-2 px-4 py-3">
            <div>
              <p className="font-semibold text-n-900">{c.nombre}</p>
              {c.descripcion && <p className="text-sm text-n-600">{c.descripcion}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Desplegable texto="Editar">
                <FormularioAccion accion={editarCategoria.bind(null, c.id)} textoBoton="Guardar">
                  <Field label="Nombre" name="nombre" defaultValue={c.nombre} required />
                  <Field label="Descripción (opcional)" name="descripcion" defaultValue={c.descripcion ?? ""} />
                </FormularioAccion>
              </Desplegable>
              {c.clave !== "comisiones" && <BotonAccion accion={quitarCategoria.bind(null, c.id)} texto="Quitar" variante="secundario" textoExito="Quitada" />}
            </div>
          </li>
        ))}
      </ul>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Nueva categoría</h2>
        <FormularioAccion accion={crearCategoria} textoBoton="Agregar" reiniciar>
          <Field label="Nombre" name="nombre" required />
          <Field label="Descripción (opcional)" name="descripcion" />
        </FormularioAccion>
      </section>
    </div>
  );
}
