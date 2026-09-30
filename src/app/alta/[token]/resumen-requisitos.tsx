import { Alert } from "@/components/ui/alert";

/**
 * Lo que queda pendiente de vacunas y desparasitación después del alta,
 * por perro: lo que se mandó y espera revisión, y lo que sigue sin
 * registro. Se pinta en cada pantalla final del alta y del complemento
 * para que nunca se lea «ya no falta nada» con un requisito sin cubrir:
 * la base no le va a dejar reservar guardería ni hotel a ese perro.
 */
export type ResumenPerro = {
  perro_nombre: string;
  en_revision: string[];
  sin_registro: string[];
};

export function hayFaltantes(resumen: ResumenPerro[]): boolean {
  return resumen.some((p) => p.sin_registro.length > 0);
}

export function ResumenRequisitos({ resumen, dondeSubir }: { resumen: ResumenPerro[]; dondeSubir: string }) {
  const conFaltantes = resumen.filter((p) => p.sin_registro.length > 0);
  const conRevision = resumen.filter((p) => p.en_revision.length > 0);
  if (!conFaltantes.length && !conRevision.length) return null;
  return (
    <div
      className="flex flex-col gap-3"
      data-resumen-requisitos
      data-sin-registro={conFaltantes.map((p) => `${p.perro_nombre}: ${p.sin_registro.join(", ")}`).join(" · ")}
      data-en-revision={conRevision.map((p) => `${p.perro_nombre}: ${p.en_revision.join(", ")}`).join(" · ")}
    >
      {conFaltantes.length > 0 && (
        <Alert variante="advertencia" titulo="Todavía nos faltan vacunas o desparasitación">
          {conFaltantes.map((p) => `${p.perro_nombre}: ${p.sin_registro.join(", ")} (sin registro)`).join(". ")}. Hasta que
          las tengamos no podemos recibirlo en guardería ni hotel. {dondeSubir}
        </Alert>
      )}
      {conRevision.length > 0 && (
        <Alert variante="exito" titulo="Comprobantes que ya nos mandaste">
          {conRevision.map((p) => `${p.perro_nombre}: ${p.en_revision.join(", ")}`).join(". ")}. Recepción los revisa
          contra el carnet y, si todo cuadra, quedan registrados.
        </Alert>
      )}
    </div>
  );
}
