import Link from "next/link";
import { contratosPorFirmarApp } from "@/lib/app/negocios";
import { IconoFlecha } from "@/components/app/iconos";
import { nombreDeContrato } from "@/lib/app/contratos-texto";

/**
 * Contratos por firmar (App para dueños · Fase 3, pantalla 3): los que algún negocio le dejó pendientes, de cualquiera
 * de sus mascotas. Cada uno se lee y se firma con el dedo en su pantalla. Referencia: bloque file-upload/form-layout de
 * shadcn/studio y Mobbin app-registro-vet-qr («Acción requerida»).
 */
export default async function ContratosPage() {
  const contratos = await contratosPorFirmarApp();
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Contratos</span>
        <h1 className="apd-titulo">Por firmar</h1>
        <p className="apd-linea">{contratos.length ? "Léelos y fírmalos con el dedo; el negocio los recibe al momento." : "No tienes contratos pendientes."}</p>
      </div>
      {contratos.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
          <ul className="apd-lista" data-contratos-por-firmar>
            {contratos.map((c) => (
              <li key={c.id}>
                <Link href={`/contratos/${c.negocioId}/${c.id}`} className="apd-tarjeta apd-fila" data-contrato={c.id}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="apd-ceja">{c.negocioNombre}</span>
                    <span style={{ display: "block", fontWeight: 800 }}>{nombreDeContrato(c.tipoNombre)}</span>
                    <span className="apd-chip apd-chip-ambar" style={{ marginTop: "0.4rem" }}>Pendiente de firma</span>
                  </span>
                  <IconoFlecha style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
