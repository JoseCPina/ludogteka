"use client";
import { etiquetaDeCuenta } from "@/lib/auth/identidad";
import { TOPE_MS, mensajeDeFallo } from "@/lib/ui/espera";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { Alert } from "@/components/ui/alert";

type Resultado =
  | { estado: "formulario" }
  | { estado: "cargando" }
  | { estado: "exito"; email: string; rol: string; inviteLink: string | null; mensaje: string | null }
  | { estado: "error"; mensaje: string };

function mensajeError(status: number, cuerpo: { error?: string } | null): string {
  if (status === 409) {
    return cuerpo?.error ?? "Ya existe una cuenta con ese correo.";
  }
  if (status === 400) {
    return cuerpo?.error ?? "Revisa el correo y el rol: algo no es válido.";
  }
  if (status === 403) {
    return "No tienes permiso para invitar personal.";
  }
  if (status === 401) {
    return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo.";
  }
  return "No pudimos completar la invitación. Intenta de nuevo.";
}

export function InvitarStaff() {
  const router = useRouter();
  const [resultado, setResultado] = useState<Resultado>({ estado: "formulario" });

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const rol = String(formData.get("rol") ?? "");
    const nombre = String(formData.get("nombre_completo") ?? "").trim();

    setResultado({ estado: "cargando" });

    try {
      const respuesta = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, rol, nombre_completo: nombre }),
        // Sin esto, un servidor que no contesta deja el formulario en
        // "cargando" para siempre.
        signal: AbortSignal.timeout(TOPE_MS),
      });
      const cuerpo = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        setResultado({ estado: "error", mensaje: mensajeError(respuesta.status, cuerpo) });
        return;
      }

      setResultado({
        estado: "exito",
        email: cuerpo.email,
        rol: cuerpo.rol,
        inviteLink: cuerpo.invite_link ?? null,
        mensaje: cuerpo.mensaje ?? null,
      });
      router.refresh();
    } catch (e) {
      setResultado({ estado: "error", mensaje: mensajeDeFallo(e) });
    }
  }


  if (resultado.estado === "exito" && !resultado.inviteLink) {
    // Ya tenía cuenta (trabaja en otro negocio de PeluDesk): se le dio
    // acceso aquí; no hay link que copiar.
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="exito" titulo="Acceso dado">
          {resultado.mensaje}
        </Alert>
        <Button type="button" variante="secundario" className="self-start" onClick={() => setResultado({ estado: "formulario" })}>
          Invitar a alguien más
        </Button>
      </div>
    );
  }

  if (resultado.estado === "exito") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="exito" titulo="Cuenta creada">
          Se creó la cuenta de {etiquetaDeCuenta(resultado.email)} como{" "}
          {resultado.rol === "recepcion" ? "recepción" : "estética"}.
        </Alert>

        <div className="rounded-lg border-[1.5px] border-ambar bg-ambar-suave p-4">
          <p className="mb-2 font-bold text-ambar-oscuro">
            Cópialo ahora — este link no se vuelve a mostrar
          </p>
          <p className="mb-3 text-sm text-n-700">
            Pásaselo a {etiquetaDeCuenta(resultado.email)} para que entre y elija su contraseña. La app no manda
            correos: el link solo se ve aquí. Si se pierde, en Cuentas aprieta «Restablecer contraseña» de esa
            persona y te damos una contraseña temporal que ya sirve para entrar.
          </p>
          <CampoCopiable valor={resultado.inviteLink ?? ""} textoBoton="Copiar link" />
        </div>

        <Button
          type="button"
          variante="secundario"
          className="self-start"
          onClick={() => setResultado({ estado: "formulario" })}
        >
          Invitar a alguien más
        </Button>
      </div>
    );
  }

  const cargando = resultado.estado === "cargando";

  return (
    <form method="post" onSubmit={enviar} className="flex flex-col gap-4">
      {resultado.estado === "error" && (
        <Alert variante="error" titulo="No se pudo invitar">
          {resultado.mensaje}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Nombre completo" name="nombre_completo" required minLength={2} maxLength={120} disabled={cargando} ayuda="Así aparece en la agenda, en los selectores y en los historiales." autoComplete="off" />
        <Field label="Correo" name="email" type="email" required disabled={cargando} />
        <Select label="Rol" name="rol" required disabled={cargando} defaultValue="">
          <option value="" disabled>
            Elige un rol
          </option>
          <option value="recepcion">Recepción</option>
          <option value="estetica">Estética</option>
        </Select>
      </div>

      <AccionesFormulario error={resultado.estado === "error" && resultado.mensaje}>
        <Button type="submit" cargando={cargando}>
          {cargando ? "Invitando…" : "Invitar"}
        </Button>
      </AccionesFormulario>
    </form>
  );
}
