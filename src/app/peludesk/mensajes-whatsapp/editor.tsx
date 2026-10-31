"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Selector } from "@/components/herramientas/selector";
import { registrarEventoCliente } from "@/lib/herramientas/cliente";
import { GIROS_MENSAJES, llenar, plantillasDe, type PlantillaMensaje, type ValoresMensaje } from "@/lib/herramientas/mensajes-whatsapp";
import { GIROS_MERCADO, type GiroMercado } from "@/lib/mercado/catalogo";

/**
 * El editor de mensajes: giro → nombre del negocio, cliente y mascota → cada plantilla con «Copiar» y «Probar en mi
 * WhatsApp» (wa.me/?text=… abre WhatsApp con el mensaje para mandárselo a uno mismo). Nada se guarda. `solo` muestra
 * una sola plantilla (las páginas /mensajes-whatsapp/<slug>).
 */
export function EditorMensajes({ giroInicial, solo }: { giroInicial: GiroMercado; solo?: string }) {
  const [giro, setGiro] = useState<GiroMercado>(giroInicial);
  const [v, setV] = useState<Partial<ValoresMensaje>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  const lista = plantillasDe(giro).filter((p) => !solo || p.slug === solo);
  const campo = (k: keyof ValoresMensaje, etiqueta: string, placeholder: string) => (
    <div key={k}>
      <label htmlFor={`m-${k}`} className="hta-etiqueta">{etiqueta}</label>
      <input id={`m-${k}`} className="hta-campo min-h-11" placeholder={placeholder} value={v[k] ?? ""} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value.slice(0, 60) }))} />
    </div>
  );
  useEffect(() => {
    if ((v.negocio ?? "").trim().length >= 3) registrarEventoCliente("mensajes-whatsapp", "uso", { giro });
  }, [v.negocio, giro]);
  const copiar = async (p: PlantillaMensaje) => {
    const texto = llenar(p.texto, v);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(p.slug);
      setTimeout(() => setCopiado(null), 1600);
    } catch {
      prompt("Copia el mensaje:", texto);
    }
  };
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="hta-regla grid gap-6 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-x-12">
        <div className="flex flex-col gap-5">
          <Selector etiqueta="Tipo de negocio" opciones={GIROS_MENSAJES.map((g) => ({ clave: g, nombre: GIROS_MERCADO.find((x) => x.clave === g)!.nombre }))} valor={giro} onChange={setGiro} nombre="giro" />
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("negocio", "Tu negocio", "Estética Patitas")}
            {campo("cliente", "Cliente", "Ana")}
            {campo("mascota", "Mascota", "Rocky")}
            {campo("servicio", "Servicio", "baño completo")}
            {campo("dia", "Día", "jueves 5 de noviembre")}
            {campo("hora", "Hora", "11:00")}
            {campo("monto", "Monto", "$350")}
          </div>
          <p className="text-sm text-n-600">Lo que dejes vacío sale con un ejemplo. Nada se guarda: los mensajes se arman en tu navegador.</p>
        </div>
        <ol className="flex flex-col divide-y divide-n-200" data-mensajes>
          {lista.map((p) => {
            const texto = llenar(p.texto, v);
            return (
              <li key={p.slug} className="grid gap-3 py-5 md:grid-cols-[minmax(0,1fr)_auto]" data-mensaje={p.slug}>
                <div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/mensajes-whatsapp/${p.slug}?giro=${giro}`} className="font-bold text-n-900 hover:underline">{p.nombre}</Link>
                    <span className="text-sm text-n-600">· {p.cuando}</span>
                    {p.automatico && <span className="rounded-full bg-menta-suave px-2 py-0.5 text-xs font-bold text-menta-oscuro">PeluDesk lo manda solo</span>}
                  </p>
                  <p className="mt-2 max-w-[62ch] whitespace-pre-wrap rounded-xl bg-white px-4 py-3 text-n-800 ring-1 ring-n-200">{texto}</p>
                </div>
                <div className="flex flex-row gap-2 md:flex-col">
                  <button type="button" className="hta-opcion" onClick={() => copiar(p)} data-sin-bloqueo data-copiar>{copiado === p.slug ? "Copiado" : "Copiar"}</button>
                  <a className="hta-opcion" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">Probar en mi WhatsApp</a>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
