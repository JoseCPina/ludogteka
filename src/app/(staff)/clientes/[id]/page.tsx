import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearTelefono } from "@/lib/telefono";
import { ClienteForm } from "../cliente-form";
import { BajaClienteBoton } from "../baja-cliente-boton";
import { actualizarCliente, darDeBajaCliente } from "../actions";
import { PerroFoto } from "../../perros/perro-foto";
import { ResumenSanitario, type EstadoRequisitoItem } from "../../perros/resumen-sanitario";
import { AlertaCriticaBanner } from "../../perros/alerta-critica-banner";
import { ContratoEstadoBanner, type ContratoEstado } from "../../perros/contrato-estado-banner";
import { BonosCliente, type BonoCatalogo, type BonoFila } from "../bonos-cliente";
import { DistanciaSeccion } from "./distancia-seccion";

export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { id } = await params;
  const { creado } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select(
      "id, nombre, telefono, email, direccion, distancia_base_km, distancia_calculada_at, distancia_ajustada_manualmente"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!cliente) notFound();

  const { data: perros } = await supabase
    .from("perros")
    .select("id, nombre, fallecido, foto_path, tamanos_categoria(etiqueta)")
    .eq("cliente_id", id)
    .is("deleted_at", null)
    .order("nombre");

  const urlsFotos = new Map<string, string>();
  await Promise.all(
    (perros ?? [])
      .filter((p) => p.foto_path)
      .map(async (p) => {
        const { data } = await supabase.storage
          .from("perros-archivos")
          .createSignedUrl(p.foto_path as string, 60 * 60);
        if (data?.signedUrl) urlsFotos.set(p.id, data.signedUrl);
      })
  );

  const estadoSanitarioPorPerro = new Map<string, EstadoRequisitoItem[]>();
  if (perros && perros.length > 0) {
    const { data: estados } = await supabase
      .from("perro_requisitos_sanitarios_estado")
      .select(
        "perro_id, tipo_requisito_id, clave, etiqueta, es_critica, ultima_fecha_aplicacion, fecha_vencimiento, estado"
      )
      .in(
        "perro_id",
        perros.map((p) => p.id)
      );
    for (const fila of estados ?? []) {
      const lista = estadoSanitarioPorPerro.get(fila.perro_id) ?? [];
      lista.push(fila as EstadoRequisitoItem);
      estadoSanitarioPorPerro.set(fila.perro_id, lista);
    }
  }

  const alertasActivasPorPerro = new Map<string, { id: string; etiqueta: string }[]>();
  const alergiasGravesPorPerro = new Map<string, { id: string; alergeno: string }[]>();
  if (perros && perros.length > 0) {
    const idsPerros = perros.map((p) => p.id);
    const [{ data: alertas }, { data: alergias }] = await Promise.all([
      supabase
        .from("perro_alertas")
        .select("id, perro_id, catalogo_alertas(etiqueta)")
        .in("perro_id", idsPerros)
        .eq("activa", true),
      supabase
        .from("perro_alergias")
        .select("id, perro_id, alergeno")
        .in("perro_id", idsPerros)
        .eq("gravedad", "grave")
        .is("deleted_at", null),
    ]);
    for (const fila of alertas ?? []) {
      const catalogo = fila.catalogo_alertas as unknown as { etiqueta: string } | null;
      const lista = alertasActivasPorPerro.get(fila.perro_id) ?? [];
      lista.push({ id: fila.id, etiqueta: catalogo?.etiqueta ?? "—" });
      alertasActivasPorPerro.set(fila.perro_id, lista);
    }
    for (const fila of alergias ?? []) {
      const lista = alergiasGravesPorPerro.get(fila.perro_id) ?? [];
      lista.push({ id: fila.id, alergeno: fila.alergeno });
      alergiasGravesPorPerro.set(fila.perro_id, lista);
    }
  }

  const estadoContratoPorPerro = new Map<string, ContratoEstado>();
  if (perros && perros.length > 0) {
    const { data: contratoEstados } = await supabase
      .from("perros_contrato_estado")
      .select("perro_id, estado")
      .in(
        "perro_id",
        perros.map((p) => p.id)
      );
    for (const fila of contratoEstados ?? []) {
      estadoContratoPorPerro.set(fila.perro_id, fila.estado as ContratoEstado);
    }
  }

  const actualizarConId = actualizarCliente.bind(null, id);
  const bajaConId = darDeBajaCliente.bind(null, id);

  const [{ data: catalogoBonos }, { data: bonosCliente }] = await Promise.all([
    supabase
      .from("servicios")
      .select("id, nombre")
      .eq("categoria", "bono")
      .is("deleted_at", null)
      .order("orden"),
    supabase
      .from("bonos_clientes_estado")
      .select(
        "id, servicio_nombre, servicio_incluido_nombre, cantidad_total, cantidad_disponible, precio_pagado, fecha_compra, fecha_vencimiento, estado"
      )
      .eq("cliente_id", id)
      .order("fecha_compra", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">{cliente.nombre}</h1>
        <p className="mt-1 text-n-600">Editar datos del dueño.</p>
      </div>

      {creado === "1" && <Alert variante="exito" titulo="Cliente creado correctamente" />}

      <ClienteForm
        action={actualizarConId}
        valoresIniciales={{
          nombre: cliente.nombre,
          telefono: formatearTelefono(cliente.telefono),
          email: cliente.email,
        }}
        textoBoton="Guardar cambios"
      />

      <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-n-900">Perros</h2>
          <Link href={`/clientes/${id}/perros/nuevo`}>
            <Button type="button" variante="secundario">
              Agregar perro
            </Button>
          </Link>
        </div>

        {!perros || perros.length === 0 ? (
          <p className="text-n-600">Este dueño todavía no tiene perros registrados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {perros.map((perro) => {
              const tamano = perro.tamanos_categoria as unknown as { etiqueta: string } | null;
              return (
                <li key={perro.id}>
                  <Link
                    href={`/perros/${perro.id}`}
                    className="flex flex-col gap-2 rounded-md border-[1.5px] border-n-200 bg-white px-4 py-3 hover:border-azul"
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex items-center gap-3">
                        <PerroFoto
                          perroId={perro.id}
                          urlInicial={urlsFotos.get(perro.id) ?? null}
                          tieneFotoInicial={Boolean(perro.foto_path)}
                          soloLectura
                          tamano="miniatura"
                        />
                        <span className="font-semibold text-n-900">{perro.nombre}</span>
                      </span>
                      <span className="flex items-center gap-2 text-sm text-n-600">
                        {tamano?.etiqueta ?? "Sin tamaño"}
                        {perro.fallecido && (
                          <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                            Falleció
                          </span>
                        )}
                      </span>
                    </span>
                    <AlertaCriticaBanner
                      alertas={alertasActivasPorPerro.get(perro.id) ?? []}
                      alergiasGraves={alergiasGravesPorPerro.get(perro.id) ?? []}
                      tamano="compacto"
                    />
                    <ResumenSanitario
                      items={estadoSanitarioPorPerro.get(perro.id) ?? []}
                      tamano="compacto"
                    />
                    <ContratoEstadoBanner
                      estado={estadoContratoPorPerro.get(perro.id) ?? "sin_contrato"}
                      tamano="compacto"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DistanciaSeccion
        clienteId={id}
        direccionInicial={cliente.direccion}
        distanciaKmInicial={cliente.distancia_base_km}
        calculadaAtInicial={cliente.distancia_calculada_at}
        ajustadaManualmenteInicial={cliente.distancia_ajustada_manualmente}
      />

      <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Bonos prepagados</h2>
        <BonosCliente
          clienteId={id}
          catalogo={(catalogoBonos as BonoCatalogo[]) ?? []}
          bonos={(bonosCliente as BonoFila[]) ?? []}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Dar de baja</h2>
        <p className="text-n-600">
          El cliente deja de aparecer en el listado, pero su historial no se borra.
        </p>
        <BajaClienteBoton accion={bajaConId} nombre={cliente.nombre} />
      </div>
    </div>
  );
}
