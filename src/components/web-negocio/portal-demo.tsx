"use client";

import { useState } from "react";
import { Dog, Cat, Syringe, CalendarBlank, Stethoscope } from "@phosphor-icons/react/dist/ssr";
import { Chip, type TonoChip } from "@/components/ui/chip";
import type { PortalEjemplo } from "@/lib/web-negocio/catalogo";

const TONO_ESTADO: Record<string, TonoChip> = { Confirmada: "exito", Agendada: "info", "Está con nosotros": "proceso", Terminó: "neutro" };

/**
 * Lo que ve el dueño de una mascota en su portal (sus mascotas, sus vacunas y sus citas y reservas), con datos de
 * ejemplo. Como el portal de verdad: sin precios ni pagos (el cliente nunca ve información financiera) y de solo
 * lectura.
 */
export function PortalDemo({ negocio, datos }: { negocio: string; datos: PortalEjemplo }) {
  const pestanas = [
    { clave: "mascotas", texto: "Mascotas" },
    { clave: "vacunas", texto: "Vacunas" },
    { clave: "visitas", texto: "Citas y reservas" },
    ...(datos.expediente ? [{ clave: "consultas", texto: "Consultas" }] : []),
  ];
  const [activa, setActiva] = useState("mascotas");
  return (
    <div data-portal-demo className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[28px] border-[6px] border-[#1d1d22] bg-crema text-n-900 shadow-[0_24px_60px_-30px_rgba(0,0,0,.5)]">
      <div className="bg-white px-4 pb-3 pt-4">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-n-600">{negocio}</p>
        <p className="mt-0.5 text-lg font-bold">Hola, {datos.dueno.split(" ")[0]}</p>
        <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Portal del cliente">
          {pestanas.map((p) => (
            <button
              key={p.clave}
              type="button"
              role="tab"
              aria-selected={activa === p.clave}
              data-pestana-portal={p.clave}
              onClick={() => setActiva(p.clave)}
              className={`min-h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold ${activa === p.clave ? "bg-morado text-white" : "bg-n-100 text-n-700"}`}
            >
              {p.texto}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-[300px] flex-col gap-2.5 p-3" role="tabpanel">
        {activa === "mascotas" &&
          datos.mascotas.map((m) => (
            <div key={m.nombre} className="flex items-center gap-3 rounded-[14px] bg-white p-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-morado-suave text-morado" aria-hidden>
                {m.especie === "Gato" ? <Cat size={26} weight="duotone" /> : <Dog size={26} weight="duotone" />}
              </span>
              <span>
                <span className="block font-bold">{m.nombre}</span>
                <span className="block text-sm text-n-600">
                  {m.raza} · {m.edad}
                </span>
              </span>
            </div>
          ))}
        {activa === "vacunas" &&
          datos.vacunas.map((v) => (
            <div key={`${v.mascota}-${v.nombre}`} className="flex items-start gap-3 rounded-[14px] bg-white p-3">
              <Syringe size={22} className="mt-0.5 shrink-0 text-morado" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold">{v.nombre}</span>
                  <Chip tono={v.vigente ? "exito" : "pendiente"}>{v.vigente ? "Vigente" : "Toca renovar"}</Chip>
                </span>
                <span className="block text-sm text-n-600">
                  {v.mascota} · aplicada el {v.aplicada} · próxima {v.proxima}
                </span>
              </span>
            </div>
          ))}
        {activa === "visitas" &&
          datos.visitas.map((v, i) => (
            <div key={i} className="flex items-start gap-3 rounded-[14px] bg-white p-3">
              <CalendarBlank size={22} className="mt-0.5 shrink-0 text-morado" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold">{v.servicio}</span>
                  <Chip tono={TONO_ESTADO[v.estado]}>{v.estado}</Chip>
                </span>
                <span className="block text-sm text-n-600">
                  {v.mascota} · {v.cuando}
                </span>
              </span>
            </div>
          ))}
        {activa === "consultas" &&
          datos.expediente?.map((c) => (
            <div key={c.fecha} className="flex items-start gap-3 rounded-[14px] bg-white p-3">
              <Stethoscope size={22} className="mt-0.5 shrink-0 text-morado" aria-hidden />
              <span>
                <span className="block font-bold">{c.motivo}</span>
                <span className="block text-sm text-n-600">{c.fecha}</span>
                <span className="mt-1 block text-sm">Indicaciones: {c.indicaciones}</span>
              </span>
            </div>
          ))}
        <p className="mt-auto px-1 pt-2 text-center text-[11px] text-n-500">Datos de ejemplo · Modo demostración</p>
      </div>
    </div>
  );
}
