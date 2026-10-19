import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BuscadorClientes } from "@/components/buscador-clientes";
import { cargarClientesBuscables } from "@/lib/clientes/buscables";
import { formatearTelefono } from "@/lib/telefono";
import { CargoSueltoForm, type CargoCatalogo, type ConceptoVet, type ProductoCargo } from "./cargo-suelto-form";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { leerTodo } from "@/lib/supabase/paginar";

// QA S16 (N66): los conceptos del catálogo de Veterinaria que se cobran sueltos.
const CONCEPTOS_VET = [
  { clave: "vet_consulta_general", nombre: "Consulta general" },
  { clave: "vet_consulta_urgencia", nombre: "Consulta de urgencia" },
  { clave: "vet_revision_seguimiento", nombre: "Revisión de seguimiento" },
  { clave: "vet_aplicacion_vacuna", nombre: "Aplicación de vacuna" },
];

// Un cargo sin reserva de por medio: se elige al cliente, el cargo, y la
// app crea la cuenta y manda directo a cobrarla.
export default async function CargoSueltoPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente: clienteId } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ clientes }, { data: cotizables }, { data: serviciosCargo }] = await Promise.all([
    cargarClientesBuscables(supabase),
    supabase.from("servicios_cotizables").select("id").eq("categoria", "cargo"),
    supabase
      .from("servicios")
      .select("id, nombre, monto_libre, depende_tamano, orden")
      .eq("categoria", "cargo")
      .not("clave", "like", "extra_%")
      // Los cargos internos de Veterinaria (hospitalización, estimados…) no se aplican a mano aquí.
      .not("clave", "like", "vet\\_%")
      .is("deleted_at", null)
      .order("orden"),
  ]);
  const idsCotizables = new Set((cotizables ?? []).map((c) => c.id as string));
  // Sueltos solo los que no dependen del tamaño (no hay perro con talla
  // que consultar) o los de monto libre.
  const cargos: CargoCatalogo[] = (serviciosCargo ?? [])
    .filter((s) => idsCotizables.has(s.id as string) && (Boolean(s.monto_libre) || !s.depende_tamano))
    .map((s) => ({ id: s.id as string, nombre: s.nombre as string, montoLibre: Boolean(s.monto_libre), dependeTamano: Boolean(s.depende_tamano) }));

  const clienteElegido = clienteId ? clientes.find((c) => c.id === clienteId) ?? null : null;

  // Con Veterinaria: sus conceptos con el precio de catálogo, y los productos que se venden (descuentan inventario).
  const sesion = await obtenerSesionConRol();
  const conVet = Boolean(sesion?.modulos.includes("veterinaria"));
  let conceptosVet: ConceptoVet[] = [];
  let productos: ProductoCargo[] = [];
  if (conVet && clienteElegido) {
    await supabase.rpc("vet_asegurar_servicios");
    const [precios, { data: prods }] = await Promise.all([
      Promise.all(CONCEPTOS_VET.map((c) => supabase.rpc("_vet_precio_servicio", { p_clave: c.clave }))),
      leerTodo<{ id: string; nombre: string; precio_venta: number | null }>(() =>
        supabase.from("insumos").select("id, nombre, precio_venta").eq("se_vende", true).is("deleted_at", null).order("nombre").order("id")
      ),
    ]);
    conceptosVet = CONCEPTOS_VET.map((c, i) => ({ ...c, precio: precios[i].data == null ? null : Number(precios[i].data) }));
    productos = (prods ?? []).filter((p) => p.precio_venta != null).map((p) => ({ id: p.id, nombre: p.nombre, precio: Number(p.precio_venta) }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/caja" className="text-sm font-semibold text-morado hover:underline">
          ← Caja
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Cargo suelto</h1>
        <p className="mt-1 text-n-600">Algo que se cobra sin reserva de por medio. Se crea la cuenta y pasas directo a cobrarla.</p>
      </div>

      {!clienteElegido ? (
        <BuscadorClientes clientes={clientes} rutaAlElegir="/caja/cargo" nuevoCliente="cualquiera" autoFocus />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
            <div>
              <p className="text-sm text-n-600">Cliente</p>
              <p className="font-bold text-n-900">{clienteElegido.nombre}</p>
              <p className="text-sm text-n-600">{formatearTelefono(clienteElegido.telefono)}</p>
            </div>
            <Link href="/caja/cargo" className="text-sm font-semibold text-morado hover:underline">
              Cambiar cliente
            </Link>
          </div>
          <CargoSueltoForm clienteId={clienteElegido.id} cargos={cargos} perros={clienteElegido.perros} conceptosVet={conceptosVet} productos={productos} />
        </div>
      )}
    </div>
  );
}
