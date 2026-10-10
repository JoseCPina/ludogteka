import { descargarFactura } from "@/components/cfdi/descarga";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; formato: string }> }) {
  const { id, formato } = await params;
  return descargarFactura(id, formato);
}
