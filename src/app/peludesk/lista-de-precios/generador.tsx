"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BuscadorCiudad } from "@/components/herramientas/buscador-ciudad";
import { ReciboPorWhatsApp } from "@/components/herramientas/recibelo-por-whatsapp";
import { Selector } from "@/components/herramientas/selector";
import { Button } from "@/components/ui/button";
import { useEspera } from "@/hooks/use-espera";
import { esperarConTope } from "@/lib/ui/espera";
import { registrarEventoCliente } from "@/lib/herramientas/cliente";
import { canvasAPng, descargar, dibujarLista, listaAPdf } from "@/lib/herramientas/dibujar-lista";
import { ESTILOS_LISTA, PLANTILLA_SERVICIOS, type EstiloLista, type RenglonLista } from "@/lib/herramientas/plantillas-servicios";
import { GIROS_MERCADO, pesosMercado, type GiroMercado, type Rango } from "@/lib/mercado/catalogo";
import type { CiudadMercado } from "@/lib/mercado/ciudades";
import { consultarRango, recibirPorWhatsApp } from "../herramientas/acciones";

/**
 * /lista-de-precios: giro → la plantilla de servicios con precio (y, si hay datos, el rango de la ciudad al lado) →
 * nombre, logo opcional (nunca sale del navegador) y WhatsApp → vista previa en uno de tres estilos → bajar PNG
 * 1080×1350 o PDF carta. Todo se dibuja en el navegador. Al dejar el WhatsApp, los servicios y precios quedan para
 * precargarse como tarifas al abrir la prueba.
 */
const slugDeNombre = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function GeneradorLista({ giroInicial }: { giroInicial: GiroMercado }) {
  const [giro, setGiro] = useState<GiroMercado>(giroInicial);
  const [renglones, setRenglones] = useState<RenglonLista[]>(() => PLANTILLA_SERVICIOS[giroInicial].map((r) => ({ ...r, precio: null })));
  const [negocio, setNegocio] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [ciudad, setCiudad] = useState<CiudadMercado | null>(null);
  const [estilo, setEstilo] = useState<EstiloLista>("clara");
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [rangos, setRangos] = useState<Record<string, Rango>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const bajando = useEspera();
  const giroTexto = GIROS_MERCADO.find((g) => g.clave === giro)!.nombre;

  const cambiarGiro = (g: GiroMercado) => {
    setGiro(g);
    setRenglones(PLANTILLA_SERVICIOS[g].map((r) => ({ ...r, precio: null })));
    setRangos({});
  };

  // Los rangos de la ciudad para los renglones con servicio del catálogo (una consulta por servicio y talla), con
  // tope: si el servidor no contesta, se dice y se ofrece reintentar; la lista se sigue pudiendo armar sin rangos.
  const [errorRangos, setErrorRangos] = useState<string | null>(null);
  const [intentoRangos, setIntentoRangos] = useState(0);
  useEffect(() => {
    let vivo = true;
    const claves = ciudad ? [...new Set(renglones.filter((r) => r.canonico).map((r) => `${r.canonico}|${r.talla ?? ""}`))] : [];
    Promise.all(
      claves.map(async (k) => {
        const [servicio, talla] = k.split("|");
        const r = await esperarConTope(() => consultarRango({ giro, servicio, ciudad: ciudad!.slug, talla: talla || null }));
        return [k, r] as const;
      })
    ).then((pares) => {
      if (!vivo) return;
      const nuevo: Record<string, Rango> = {};
      let fallo: string | null = null;
      for (const [k, r] of pares) {
        if (r.error) fallo = r.error;
        else if (r.rango && r.rango.nivel !== "sin_datos") nuevo[k] = r.rango;
      }
      setRangos(nuevo);
      setErrorRangos(fallo);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ciudad, giro, intentoRangos]);

  const datos = useMemo(() => ({ negocio, whatsapp: whatsapp.replace(/\D/g, "").slice(-10) || null, ciudad: ciudad?.nombre ?? null, giroTexto, renglones, estilo, logo }), [negocio, whatsapp, ciudad, giroTexto, renglones, estilo, logo]);
  const conPrecio = renglones.filter((r) => r.nombre.trim() && r.precio && r.precio > 0);

  useEffect(() => {
    if (!canvas.current) return;
    let cancelado = false;
    document.fonts?.ready.then(() => {
      if (!cancelado && canvas.current) dibujarLista(canvas.current, datos);
    });
    return () => {
      cancelado = true;
    };
  }, [datos]);

  useEffect(() => {
    if (conPrecio.length >= 3) registrarEventoCliente("lista-de-precios", "uso", { giro, ciudad: ciudad?.nombre ?? null });
  }, [conPrecio.length, giro, ciudad]);

  const editar = (i: number, cambios: Partial<RenglonLista>) => setRenglones((lista) => lista.map((r, k) => (k === i ? { ...r, ...cambios } : r)));
  const archivo = `lista-de-precios-${slugDeNombre(negocio) || "mi-negocio"}`;
  const resumen = `Tu lista de precios de ${giroTexto.toLowerCase()}${negocio ? ` (${negocio})` : ""} con ${conPrecio.length} servicios: ${conPrecio.slice(0, 4).map((r) => `${r.nombre} ${pesosMercado(r.precio!)}`).join(", ")}${conPrecio.length > 4 ? "…" : ""}.`;
  const ruta = `/lista-de-precios?giro=${giro}`;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="hta-regla grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12">
        <div className="flex flex-col gap-6">
          <Selector etiqueta="Tipo de negocio" opciones={GIROS_MERCADO.map((g) => ({ clave: g.clave, nombre: g.nombre }))} valor={giro} onChange={cambiarGiro} nombre="giro" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="lp-negocio" className="hta-etiqueta">Nombre del negocio</label>
              <input id="lp-negocio" className="hta-campo" value={negocio} onChange={(e) => setNegocio(e.target.value.slice(0, 60))} placeholder="Como quieres que salga" />
            </div>
            <div>
              <label htmlFor="lp-wa" className="hta-etiqueta">WhatsApp del negocio</label>
              <input id="lp-wa" type="tel" inputMode="numeric" className="hta-campo" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.slice(0, 16))} placeholder="10 dígitos, sale al pie" />
            </div>
            <BuscadorCiudad valor={ciudad} onChange={setCiudad} etiqueta="Tu ciudad (para ver el rango al lado)" />
            {errorRangos && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-coral-suave px-4 py-3 text-sm text-n-900" role="alert" data-error-rangos>
                <span>No pudimos traer los rangos de {ciudad?.nombre ?? "tu ciudad"}. {errorRangos} Tu lista se puede armar igual.</span>
                <Button type="button" variante="secundario" sinBloqueo onClick={() => { setErrorRangos(null); setIntentoRangos((n) => n + 1); }}>Reintentar</Button>
              </div>
            )}
            <div>
              <label htmlFor="lp-logo" className="hta-etiqueta">Logo (opcional)</label>
              <input
                id="lp-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="block w-full text-sm text-n-700 file:mr-3 file:min-h-11 file:rounded-full file:border file:border-n-300 file:bg-white file:px-4 file:font-semibold file:text-n-900"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return setLogo(null);
                  const img = new Image();
                  img.onload = () => setLogo(img);
                  img.src = URL.createObjectURL(f);
                }}
              />
              <p className="mt-1 text-xs text-n-600">No se sube a ningún lado: se dibuja en tu navegador.</p>
            </div>
          </div>
          <div>
            <p className="hta-etiqueta">Servicios y precios</p>
            <ul className="flex flex-col gap-2" data-renglones>
              {renglones.map((r, i) => {
                const rango = r.canonico ? rangos[`${r.canonico}|${r.talla ?? ""}`] : undefined;
                return (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_2.5rem] items-center gap-2">
                    <div>
                      <input aria-label={`Servicio ${i + 1}`} className="hta-campo min-h-11 text-base" value={r.nombre} onChange={(e) => editar(i, { nombre: e.target.value.slice(0, 60) })} />
                      {rango && rango.p25 != null && rango.p75 != null && (
                        <p className="mt-0.5 text-xs text-n-600">En {rango.lugar}: la mitad cobra {pesosMercado(rango.p25)} a {pesosMercado(rango.p75)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-n-600">$</span>
                      <input aria-label={`Precio de ${r.nombre || `servicio ${i + 1}`}`} inputMode="numeric" className="hta-campo min-h-11 text-base" value={r.precio ?? ""} onChange={(e) => editar(i, { precio: Number(e.target.value.replace(/[^\d]/g, "")) || null })} />
                    </div>
                    <button type="button" aria-label={`Quitar ${r.nombre || "renglón"}`} className="grid h-11 w-10 place-items-center rounded-md text-n-600 hover:bg-n-100" onClick={() => setRenglones((l) => l.filter((_, k) => k !== i))} data-sin-bloqueo>×</button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="hta-opcion mt-3" onClick={() => setRenglones((l) => [...l, { nombre: "", precio: null }])} data-sin-bloqueo>+ Agregar servicio</button>
          </div>
          <Selector etiqueta="Estilo" opciones={ESTILOS_LISTA.map((e) => ({ clave: e.clave, nombre: e.nombre, detalle: e.detalle }))} valor={estilo} onChange={setEstilo} nombre="estilo" />
        </div>

        <div className="flex flex-col gap-4 md:sticky md:top-20 md:self-start">
          <p className="hta-etiqueta">Vista previa</p>
          <canvas ref={canvas} className="w-full rounded-xl border border-n-200" style={{ aspectRatio: "1080 / 1350" }} aria-label="Vista previa de tu lista de precios" data-vista-previa />
          <div className="flex flex-wrap gap-2">
            <Button type="button" sinBloqueo cargando={bajando.cargando} disabled={conPrecio.length === 0} onClick={() => bajando.correr(async () => { if (canvas.current) descargar(await canvasAPng(canvas.current), `${archivo}.png`); })}>Bajar imagen</Button>
            <Button type="button" variante="secundario" sinBloqueo cargando={bajando.cargando} disabled={conPrecio.length === 0} onClick={() => bajando.correr(async () => descargar(await listaAPdf(datos), `${archivo}.pdf`))}>Bajar PDF</Button>
          </div>
          <p className="text-sm text-n-600">La imagen es de 1080×1350 (para WhatsApp e Instagram); el PDF, tamaño carta para imprimir. {conPrecio.length === 0 ? "Escribe al menos un precio." : ""}</p>
        </div>
      </section>

      <section className="hta-regla grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12">
        <ReciboPorWhatsApp
          herramienta="lista-de-precios"
          accion={recibirPorWhatsApp}
          resumen={resumen}
          ruta={ruta}
          giro={giro}
          ciudad={ciudad}
          datos={{ giro, negocio, whatsapp_negocio: whatsapp.replace(/\D/g, "").slice(-10) || null, estilo, servicios: conPrecio.map((r) => ({ nombre: r.nombre, precio: r.precio, canonico: r.canonico ?? null, talla: r.talla ?? null, unidad: r.unidad ?? null })) }}
          titulo="Guarda tus precios por WhatsApp"
          texto="Te mandamos el resumen de tu lista y, si abres tu prueba de PeluDesk con este número, tus servicios y precios ya están capturados como tarifas."
        />
        <div className="text-sm leading-relaxed text-n-600">
          <p className="hta-etiqueta">Cómo funciona</p>
          <p>Capturas tus servicios y precios; si pones tu ciudad, junto a cada servicio del catálogo ves dónde cobra la mitad de los negocios según el Índice PeluDesk de precios. La imagen y el PDF se dibujan en tu navegador: tu logo y tus precios no se suben a ningún lado hasta que tú decides mandarte el resumen por WhatsApp.</p>
        </div>
      </section>
    </div>
  );
}
