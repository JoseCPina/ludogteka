"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TIPOS_LINK_ALTA, TIPOS_LINK_ALTA_LISTA, type TipoLinkAlta } from "@/lib/alta/tipos-link";

/**
 * Dar de alta a alguien desde el módulo en el que está parada recepción.
 *
 * Antes había que salirse a Clientes, y desde ahí escoger a mano el tipo
 * de link. Puesto en Guardería, Hotel y Estética, el tipo ya viene
 * decidido por dónde se está trabajando: quien está en la agenda de
 * estética manda el link de estética sin pensarlo, que es cuando menos se
 * equivoca uno.
 *
 * Las dos salidas siguen abiertas a propósito. El link es lo normal —el
 * dueño captura mejor los datos de su perro que quien los oye por
 * teléfono—, pero la persona que ya está parada en el mostrador con el
 * perro en brazos no va a sacar el celular a llenar un formulario.
 */
/**
 * Sin `tipo` (Caja: el cliente nuevo puede venir a cualquier cosa) se
 * ofrecen los dos links y recepción escoge. Con `volver`, "Capturarlo yo"
 * regresa a esa pantalla con el cliente ya elegido (ver
 * src/lib/clientes/volver.ts).
 */
export function BotonNuevoCliente({
  tipo,
  volver,
  className = "",
}: {
  tipo?: TipoLinkAlta;
  volver?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const definicion = tipo ? TIPOS_LINK_ALTA[tipo] : null;
  const hrefCaptura = volver ? `/clientes/nuevo?volver=${encodeURIComponent(volver)}` : "/clientes/nuevo";

  if (!abierto) {
    return (
      <Button type="button" variante="secundario" onClick={() => setAbierto(true)}>
        Nuevo cliente
      </Button>
    );
  }

  return (
    <div className={`flex flex-col gap-3 rounded-lg border-[1.5px] border-azul bg-azul-suave p-4 ${className}`}>
      <div>
        <p className="font-bold text-azul">
          {definicion ? `Nuevo cliente de ${definicion.etiqueta.toLowerCase()}` : "Nuevo cliente"}
        </p>
        <p className="mt-0.5 text-sm text-n-700">
          {definicion ? definicion.descripcion : "Escoge el link según a qué viene: cada uno pide sus datos y su contrato."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {definicion ? (
          <Link href={`/clientes/invitaciones?tipo=${tipo}`}>
            <Button type="button">Mandarle un link</Button>
          </Link>
        ) : (
          TIPOS_LINK_ALTA_LISTA.map((t) => (
            <Link key={t.clave} href={`/clientes/invitaciones?tipo=${t.clave}`}>
              <Button type="button">Link de {t.etiqueta.toLowerCase()}</Button>
            </Link>
          ))
        )}
        <Link href={hrefCaptura}>
          <Button type="button" variante="secundario">
            Capturarlo yo
          </Button>
        </Link>
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cerrar
        </Button>
      </div>
      <p className="text-sm text-n-700">
        Con el link, el dueño captura sus datos desde su celular
        {definicion?.llevaContrato ? ` y firma el contrato de ${definicion.etiqueta.toLowerCase()} él mismo` : ""}.
        Capturarlo aquí sirve cuando ya está enfrente
        {definicion && !definicion.llevaContrato ? "." : ": el contrato queda pendiente y se firma después."}
        {volver ? " Al terminar regresas aquí con el cliente ya elegido." : ""}
      </p>
    </div>
  );
}
