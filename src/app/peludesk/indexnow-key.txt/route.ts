import { INDEXNOW_LLAVE } from "@/lib/peludesk/indexnow";

export function GET() {
  return new Response(INDEXNOW_LLAVE, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
