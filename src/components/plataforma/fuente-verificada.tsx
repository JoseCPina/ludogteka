/** La fuente de un valor regulatorio: texto, enlaces y la fecha en que se verificó contra el original. */
export function FuenteVerificada({ fuente, urls, verificado }: { fuente: string | null; urls: string | null; verificado: string | null }) {
  const enlaces = (urls ?? "").split(/\s+/).filter((u) => /^https:\/\//.test(u));
  return (
    <div className="text-xs text-n-500">
      {fuente && <p>Fuente: {fuente}</p>}
      {enlaces.length > 0 && (
        <p className="flex flex-wrap gap-x-3">
          {enlaces.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="break-all font-semibold text-morado hover:underline">{u.replace(/^https:\/\//, "").slice(0, 60)}</a>
          ))}
        </p>
      )}
      <p className={verificado ? "text-menta-oscuro" : "font-semibold text-ambar-oscuro"}>{verificado ? `Verificado contra el original el ${verificado}` : "Sin verificar contra el texto original"}</p>
    </div>
  );
}
