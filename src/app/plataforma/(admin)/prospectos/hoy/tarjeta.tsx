"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { marcarContacto } from "../acciones";

export type DatosTarjeta = {
  id: string;
  canal: "whatsapp" | "instagram";
  tipo: string;
  mensaje: string;
  estado: string;
  enviadoHora: string | null;
  prospectoId: string;
  nombre: string;
  detalle: string;
  telefono: string | null;
  instagram: string | null;
  link: string;
};

const TIPO: Record<string, string> = { primero: "Primer mensaje", seguimiento_1: "Seguimiento 1", seguimiento_2: "Seguimiento 2 (último)" };

// Copiar al portapapeles en el mismo toque y ANTES de abrir Instagram (al cambiar de app el portapapeles asíncrono
// falla). Respaldo síncrono con un textarea; si no, el asíncrono.
function copiar(texto: string): boolean {
  const t = document.createElement("textarea");
  t.value = texto;
  t.setAttribute("readonly", "");
  t.style.position = "fixed";
  t.style.opacity = "0";
  document.body.appendChild(t);
  t.select();
  t.setSelectionRange(0, texto.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  t.remove();
  if (!ok) navigator.clipboard?.writeText(texto).then(() => undefined, () => undefined);
  return ok;
}

export function TarjetaContacto({ d }: { d: DatosTarjeta }) {
  const router = useRouter();
  const envio = useEspera();
  const [texto, setTexto] = useState(d.mensaje);
  const [res, setRes] = useState<{ error: string | null; exito?: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const hecho = d.estado !== "pendiente";

  const marcar = async (accion: "enviado" | "respondio" | "no_interesa") => {
    setRes(null);
    const r = await envio.ejecutar(() => marcarContacto(d.id, accion));
    setRes(r);
    if (!r.error) router.refresh();
  };

  return (
    <li data-contacto={d.id} data-canal={d.canal} data-estado={d.estado} className={`rounded-[14px] border bg-white p-4 ${hecho ? "border-n-200 opacity-80" : "border-n-300"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a href={`/plataforma/prospectos/${d.prospectoId}`} className="text-lg font-bold text-n-900 hover:underline">{d.nombre}</a>
        <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-700">{TIPO[d.tipo] ?? d.tipo}</span>
      </div>
      <p className="text-sm text-n-600">{d.detalle}</p>
      <label className="mt-3 block text-sm font-medium text-n-800" htmlFor={`m-${d.id}`}>Mensaje</label>
      <textarea id={`m-${d.id}`} data-mensaje value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} className="mt-1 w-full rounded-md border border-n-300 p-3 text-base leading-snug" />
      <div className="mt-2"><CampoCopiable valor={d.link} etiqueta="Su página" /></div>
      {d.estado === "enviado" && <p className="mt-2 text-sm font-semibold text-menta-oscuro">Contactado{d.enviadoHora ? ` a las ${d.enviadoHora}` : ""}.</p>}
      {d.estado === "respondio" && <p className="mt-2 text-sm font-semibold text-menta-oscuro">Respondió.</p>}
      {d.estado === "no_interesa" && <p className="mt-2 text-sm font-semibold text-coral-oscuro">No le interesa.</p>}
      <AccionesFormulario error={res?.error} exito={res && !res.error ? res.exito ?? true : null}>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
          {d.canal === "whatsapp" && d.telefono && (
            <Button
              type="button"
              data-abrir-whatsapp
              cargando={envio.cargando}
              onClick={() => {
                // Se abre primero (el celular solo deja abrir otra app en el mismo toque) y luego se marca.
                window.open(`https://wa.me/52${d.telefono}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
                void marcar("enviado");
              }}
              className="!bg-[#117a43] text-white"
            >
              Abrir WhatsApp
            </Button>
          )}
          {d.canal === "instagram" && d.instagram && (
            <Button
              type="button"
              data-abrir-instagram
              cargando={envio.cargando}
              onClick={() => {
                setCopiado(copiar(texto));
                window.open(d.instagram!, "_blank", "noopener");
                void marcar("enviado");
              }}
            >
              {copiado ? "Copiado · abrir Instagram" : "Copiar y abrir Instagram"}
            </Button>
          )}
          <Button type="button" variante="secundario" data-respondio cargando={envio.cargando} onClick={() => void marcar("respondio")}>Respondió</Button>
          <Button type="button" variante="secundario" data-no-interesa cargando={envio.cargando} onClick={() => void marcar("no_interesa")}>No le interesa</Button>
        </div>
      </AccionesFormulario>
    </li>
  );
}
