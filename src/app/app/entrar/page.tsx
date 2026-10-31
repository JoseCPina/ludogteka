import Image from "next/image";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { sesionApp } from "@/lib/app/sesion";
import { Entrar } from "./entrar";

export const metadata: Metadata = { title: "Entrar · PeluDesk", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// /entrar en app.peludesk.mx. Con sesión ya abierta manda adentro.
export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ ir?: string }> }) {
  const { ir } = await searchParams;
  if (await sesionApp()) redirect(ir && ir.startsWith("/") && !ir.startsWith("//") ? ir : "/");
  return (
    <main className="apd-cuerpo" style={{ paddingTop: "calc(2.5rem + env(safe-area-inset-top))", paddingBottom: "3rem" }}>
      <div className="apd-aparece">
        <span className="apd-marca" style={{ fontSize: "1.25rem" }}>
          <Image src="/marca/peludesk/isotipo.svg" alt="" width={28} height={28} unoptimized /> PeluDesk
        </span>
        <h1 className="apd-titulo" style={{ marginTop: "1.5rem" }}>La cartilla de tu perro o tu gato, siempre contigo</h1>
        <p className="apd-linea">Entra con tu número de WhatsApp. Si tu veterinaria, estética o guardería usa PeluDesk, tus mascotas ya están aquí.</p>
      </div>
      <div style={{ marginTop: "1.75rem" }}>
        <Entrar ir={ir ?? null} />
      </div>
    </main>
  );
}
