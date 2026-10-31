"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { guardarNombre } from "./acciones";
import { salir } from "../../entrar/acciones";

export function NombreForm({ nombre }: { nombre: string | null }) {
  const router = useRouter();
  const envio = useEspera();
  const campo = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  return (
    <form
      className="apd-tarjeta"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setOk(null);
        const r = await envio.ejecutar(() => guardarNombre(campo.current?.value ?? ""));
        if (r.error) return setError(r.error);
        setOk("Guardado.");
        router.refresh();
      }}
    >
      <label htmlFor="yo-nombre" className="apd-etiqueta">Cómo te llamas</label>
      <input id="yo-nombre" ref={campo} className="apd-campo" defaultValue={nombre ?? ""} placeholder="Tu nombre" autoComplete="name" maxLength={80} />
      {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</p>}
      {ok && <p className="apd-aviso apd-aviso-ok" role="status" style={{ marginTop: "0.75rem" }}>{ok}</p>}
      <button type="submit" className="apd-boton-sec" style={{ marginTop: "0.9rem" }} aria-busy={envio.cargando} disabled={envio.cargando}>Guardar</button>
    </form>
  );
}

export function BotonSalir() {
  const envio = useEspera();
  return (
    <button type="button" className="apd-boton-suave" aria-busy={envio.cargando} disabled={envio.cargando} onClick={() => envio.correr(() => salir())} data-salir>
      Cerrar sesión
    </button>
  );
}
