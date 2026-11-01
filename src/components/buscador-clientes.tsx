"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePuedeAbrir } from "@/components/acceso-contexto";
import { usePathname, useRouter } from "next/navigation";
import { BotonNuevoCliente } from "@/components/boton-nuevo-cliente";
import type { TipoLinkAlta } from "@/lib/alta/tipos-link";
import { Field } from "@/components/ui/field";
import { formatearTelefono } from "@/lib/telefono";
import { vocabularioMascota } from "@/lib/perros/vocabulario";
import { useModulos } from "@/components/modulos-contexto";
import {
  filtrarClientesBuscables,
  type ClienteBuscable,
  type CoincidenciaCliente,
} from "@/lib/clientes/buscables";
import { Enlace } from "@/components/ui/enlace";
import { Alternar } from "@/components/ui/alternar";

export const ETIQUETA_BUSCAR_CLIENTES = "Buscar por perro, dueño o teléfono";
/** QA S39 (N137): con Veterinaria se busca por mascota (perros, gatos y otras especies). */
export function etiquetaBuscarClientes(conVet: boolean): string {
  return conVet ? "Buscar por mascota, dueño o teléfono" : ETIQUETA_BUSCAR_CLIENTES;
}

/**
 * El buscador de clientes de toda la app.
 *
 * Busca por nombre del perro, del dueño o por teléfono, y pinta cada
 * resultado con el perro y su dueño juntos: cuando dos perros se llaman
 * igual, el dueño y el teléfono son lo que los distingue. Lo que se elige
 * es el CLIENTE (de él cuelgan las reservas); el perro se escoge
 * después, en la pantalla que lo necesite.
 *
 * Tres formas de elegir: `onElegir` (el formulario sigue en la misma
 * pantalla), `hrefDe` (elegir es navegar, p. ej. a los pases de ese
 * cliente) o `rutaAlElegir`, lo mismo que `hrefDe` pero con la ruta como
 * texto: desde una página de servidor no se le puede pasar una función a
 * este componente (Caja lo hacía y la página tronaba con 500). Las filas vienen de src/lib/clientes/buscables.ts.
 *
 * `nuevoCliente` pone el botón "Nuevo cliente" junto al campo, en toda
 * pantalla donde se busca a alguien para agendarle, reservarle, cobrarle
 * o venderle algo: el que no aparece es justo el que hay que dar de alta.
 * El tipo es el del link que le toca (estética, guardería y hotel) o
 * "cualquiera" donde puede venir a lo que sea (Caja). Al capturarlo a
 * mano se regresa aquí con `?cliente=`, que con `onElegir` lo deja
 * elegido solo (con `hrefDe`, la página ya lee ese parámetro).
 */
export function BuscadorClientes({
  clientes,
  onElegir,
  hrefDe: hrefDeProp,
  rutaAlElegir,
  etiqueta: etiquetaPropia,
  placeholder = "ej. Motita, Ana o 444 123",
  autoFocus = false,
  // Sin texto: ¿se muestra la lista completa (reserva nueva, pases) o
  // nada hasta que escriban (vinculación, que vive dentro de una fila)?
  listarSinBusqueda = true,
  maximo = 30,
  vacio = "Ningún cliente coincide con la búsqueda.",
  pie,
  nuevoCliente,
}: {
  clientes: ClienteBuscable[];
  onElegir?: (cliente: ClienteBuscable) => void;
  hrefDe?: (cliente: ClienteBuscable) => string;
  rutaAlElegir?: string;
  etiqueta?: string;
  placeholder?: string;
  autoFocus?: boolean;
  listarSinBusqueda?: boolean;
  maximo?: number;
  vacio?: string;
  pie?: ReactNode;
  nuevoCliente?: TipoLinkAlta | "cualquiera";
}) {
  const conVetBuscador = useModulos().tiene("veterinaria");
  const etiqueta = etiquetaPropia ?? etiquetaBuscarClientes(conVetBuscador);
  const pathname = usePathname();
  const router = useRouter();
  const puede = usePuedeAbrir();
  const hrefDe = hrefDeProp ?? (rutaAlElegir ? (c: ClienteBuscable) => `${rutaAlElegir}?cliente=${c.id}` : undefined);
  const [busqueda, setBusqueda] = useState("");

  // De vuelta de "Capturarlo yo": el cliente recién creado llega en
  // `?cliente=` y se elige solo, una vez.
  const preelegido = useRef(false);
  useEffect(() => {
    if (preelegido.current || !onElegir) return;
    preelegido.current = true;
    const id = new URLSearchParams(window.location.search).get("cliente");
    const cliente = id ? clientes.find((c) => c.id === id) : undefined;
    if (cliente) onElegir(cliente);
  }, [clientes, onElegir]);

  const hayBusqueda = busqueda.trim().length > 0;
  const coincidencias = useMemo(() => filtrarClientesBuscables(clientes, busqueda), [clientes, busqueda]);
  const visibles = coincidencias.slice(0, maximo);

  // N33: al escribir, la lista se reordena. Si entre que se aprieta una fila y se suelta la lista cambia, el clic
  // puede caer en OTRA fila (o en el contenedor). Se queda con la fila que estaba bajo el dedo al APRETAR y esa es la
  // que se elige, aunque la lista se mueva; con teclado (Enter/Espacio) vale la fila enfocada.
  const presionado = useRef<string | null>(null);
  const idDeFila = (destino: EventTarget | null) => (destino as HTMLElement | null)?.closest?.("[data-cliente-id]")?.getAttribute("data-cliente-id") ?? null;
  function elegirPorId(id: string | null) {
    const cliente = id ? clientes.find((x) => x.id === id) : undefined;
    if (!cliente) return;
    if (onElegir) onElegir(cliente);
    else if (hrefDe) router.push(hrefDe(cliente));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Field
            label={etiqueta}
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
          />
        </div>
        {nuevoCliente && (
          <BotonNuevoCliente
            tipo={nuevoCliente === "cualquiera" ? undefined : nuevoCliente}
            volver={pathname}
            className="basis-full"
          />
        )}
      </div>

      {(hayBusqueda || listarSinBusqueda) && (
        <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
          {visibles.length === 0 ? (
            <p className="p-6 text-center text-n-600">
              {vacio}
              {nuevoCliente && hayBusqueda && puede("/clientes/nuevo") && " Si es nuevo, dalo de alta con «Nuevo cliente»."}
            </p>
          ) : (
            <ul
              className="divide-y divide-n-200"
              onPointerDownCapture={(e) => {
                presionado.current = idDeFila(e.target);
              }}
              onClickCapture={(e) => {
                // El clic que cayó en una fila distinta a la apretada, o en el contenedor, no elige la equivocada.
                const id = e.detail === 0 ? idDeFila(e.target) : presionado.current ?? idDeFila(e.target);
                presionado.current = null;
                if (!id) return;
                e.preventDefault();
                e.stopPropagation();
                elegirPorId(id);
              }}
            >
              {visibles.map((coincidencia) => {
                const c = coincidencia.cliente;
                const contenido = <FilaCliente coincidencia={coincidencia} />;
                const clases =
                  "flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave";
                return (
                  <li key={c.id} data-cliente-id={c.id}>
                    {hrefDe ? (
                      <Enlace href={hrefDe(c)} className={clases} forma="bloque">
                        {contenido}
                      </Enlace>
                    ) : (
                      <Alternar type="button" className={clases}>
                        {contenido}
                      </Alternar>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {coincidencias.length > maximo && (
            <p className="border-t border-n-200 px-4 py-2 text-xs text-n-500">
              Se muestran {maximo} de {coincidencias.length}. Escribe más para acotar.
            </p>
          )}
        </div>
      )}

      {pie}
    </div>
  );
}

// El dueño con sus perros: los que coincidieron con la búsqueda van
// primero y resaltados; los demás, en gris, para reconocer a la familia.
export function FilaCliente({ coincidencia }: { coincidencia: CoincidenciaCliente }) {
  const modulos = useModulos();
  const { cliente, perrosCoincidentes } = coincidencia;
  const idsCoinciden = new Set(perrosCoincidentes.map((p) => p.id));
  const ordenados = [...perrosCoincidentes, ...cliente.perros.filter((p) => !idsCoinciden.has(p.id))];

  return (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold text-n-900">{cliente.nombre}</span>
        <span className="text-sm text-n-600">
          {ordenados.length === 0
            ? `Sin ${vocabularioMascota({ conVet: modulos.tiene("veterinaria") }).plural} registrad${vocabularioMascota({ conVet: modulos.tiene("veterinaria") }).o}s`
            : ordenados.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  {idsCoinciden.has(p.id) ? (
                    <strong className="rounded bg-ambar-suave px-1 text-n-900">{p.nombre}</strong>
                  ) : (
                    p.nombre
                  )}
                </span>
              ))}
        </span>
      </span>
      <span className="flex-none tabular-nums text-n-600">{formatearTelefono(cliente.telefono)}</span>
    </>
  );
}
