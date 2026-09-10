import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { cargarRazas, sugerirRaza } from "@/lib/razas";
import { cargarCotizacionEstetica } from "@/lib/estetica/cotizacion";
import { NormalizarRazas, type PerroSinRaza } from "./normalizar-razas";

/**
 * Normalización en bloque de las razas escritas a mano.
 *
 * Los perros capturados antes del catálogo tienen la raza como texto
 * libre y `raza_id` vacío. Mientras siga así, `perro_grupo_raza` los
 * manda al grupo predeterminado —pelo corto, el más barato— y su baño se
 * cotiza mal en cada cita. Esta pantalla es para cerrar ese hueco de una
 * sentada en vez de esperar a que cada dueño pase por el mostrador.
 */
export default async function NormalizarRazasPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  // Solo admin y recepcion pueden escribir en `perros` (RLS de Fase 2).
  // Estetica puede mirar la lista —le sirve para saber por que un precio
  // sale bajo— pero no se le pintan controles que no van a guardar.
  const soloLectura = !['admin', 'recepcion'].includes(sesion?.rol ?? '');

  const [razas, cotizacion, { data: perrosCrudo }, { data: tamanos }] = await Promise.all([
    cargarRazas(supabase, { conGrupo: true }),
    cargarCotizacionEstetica(supabase),
    supabase
      .from("perros")
      .select("id, nombre, raza, tamano_id, cliente_id, clientes(nombre)")
      .is("raza_id", null)
      .is("deleted_at", null)
      .eq("fallecido", false)
      .order("nombre"),
    supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
  ]);

  const perros: PerroSinRaza[] = ((perrosCrudo ?? []) as unknown as {
    id: string;
    nombre: string;
    raza: string | null;
    tamano_id: string | null;
    cliente_id: string;
    clientes: { nombre: string } | null;
  }[]).map((p) => {
    const escrita = (p.raza ?? "").trim();
    // La sugerencia solo sale con coincidencia EXACTA contra el nombre o
    // un alias. Un parecido convertiría "pastor" en "pastor alemán" a
    // ciegas y cambiaría el precio de ese perro sin que nadie lo decida.
    const sugerida = sugerirRaza(razas, escrita);
    return {
      id: p.id,
      nombre: p.nombre,
      cliente_id: p.cliente_id,
      cliente_nombre: p.clientes?.nombre ?? "—",
      raza_escrita: escrita,
      tamano_id: p.tamano_id,
      sugerencia_id: sugerida?.id ?? null,
    };
  });

  const conSugerencia = perros.filter((p) => p.sugerencia_id).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/estetica" className="text-sm font-semibold text-azul hover:underline">
          ← Estética
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Razas sin catalogar</h1>
        <p className="mt-1 text-n-600">
          Estos perros tienen la raza escrita a mano, de antes de que existiera el catálogo.
          Mientras no se les asigne una raza de la lista, su baño se cotiza con el grupo más barato.
        </p>
      </div>

      {perros.length === 0 ? (
        <Alert variante="exito" titulo="No queda ninguno">
          Todos los perros vivos tienen su raza del catálogo. Sus baños se cotizan con el grupo que
          les toca.
        </Alert>
      ) : (
        <>
          <Alert
            variante="advertencia"
            titulo={
              perros.length === 1
                ? "1 perro cotiza con el grupo por defecto"
                : `${perros.length} perros cotizan con el grupo por defecto`
            }
          >
            El grupo por defecto es el de <strong>pelo corto</strong>, el más barato. Un shih tzu ahí
            se cotiza como si fuera un chihuahua: recepción lo corrige en el mostrador, si se da
            cuenta.
            {conSugerencia > 0 && (
              <>
                {" "}
                De estos, <strong>{conSugerencia}</strong> traen escrita una raza que sí está en el
                catálogo — esos se resuelven con un botón.
              </>
            )}
          </Alert>

          {soloLectura && (
            <Alert variante="advertencia" titulo="Solo lectura">
              Asignar razas es de admin o recepción. Aquí puedes ver cuáles están pendientes y por
              qué su baño sale más barato de lo que debería.
            </Alert>
          )}

          <NormalizarRazas
            soloLectura={soloLectura}
            perros={perros}
            razas={razas}
            tamanos={(tamanos as { id: string; etiqueta: string }[]) ?? []}
            cotizacion={cotizacion}
          />
        </>
      )}
    </div>
  );
}
