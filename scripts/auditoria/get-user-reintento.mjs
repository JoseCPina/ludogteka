// getUserConReintento: un fallo pasajero de Auth/red se reintenta UNA vez; una
// sesión que de verdad no existe NO (va a /login de inmediato).
//   node --experimental-strip-types scripts/auditoria/get-user-reintento.mjs
import { AuthSessionMissingError, AuthRetryableFetchError, AuthApiError } from "@supabase/supabase-js";
import { getUserConReintento } from "../../src/lib/supabase/get-user.ts";

let fallos = 0;
const ok = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) fallos++; };
const cliente = (...respuestas) => {
  let llamadas = 0;
  return { llamadas: () => llamadas, auth: { getUser: async () => { const r = respuestas[Math.min(llamadas++, respuestas.length - 1)]; if (r instanceof Error) throw r; return r; } } };
};
const USER = { id: "u1" };
const bueno = { data: { user: USER }, error: null };

let c = cliente(bueno);
ok((await getUserConReintento(c)).data.user === USER && c.llamadas() === 1, "sesión buena: una sola llamada");
c = cliente({ data: { user: null }, error: new AuthSessionMissingError() });
ok((await getUserConReintento(c)).data.user === null && c.llamadas() === 1, "sin sesión: no reintenta (va a /login)");
c = cliente({ data: { user: null }, error: new AuthApiError("jwt expired", 401, "bad_jwt") });
ok((await getUserConReintento(c)).data.user === null && c.llamadas() === 1, "token inválido (401): no reintenta");
c = cliente({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) }, bueno);
ok((await getUserConReintento(c)).data.user === USER && c.llamadas() === 2, "corte de red: reintenta una vez y recupera la sesión");
c = cliente({ data: { user: null }, error: new AuthApiError("boom", 503, "unexpected_failure") }, bueno);
ok((await getUserConReintento(c)).data.user === USER && c.llamadas() === 2, "Auth 503: reintenta una vez y recupera la sesión");
c = cliente(new Error("socket hang up"), bueno);
ok((await getUserConReintento(c)).data.user === USER && c.llamadas() === 2, "excepción de red: reintenta una vez");
c = cliente({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
ok((await getUserConReintento(c)).data.user === null && c.llamadas() === 2, "si sigue fallando, solo UN reintento");
console.log(fallos ? `\n✘ ${fallos} fallo(s)` : "\n✔ Sin hallazgos");
process.exit(fallos ? 1 : 0);
