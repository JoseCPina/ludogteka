/**
 * La invitación a la app nativa de PeluDesk (apps/duenos-movil) en la versión web: sale solo cuando la app ya está en
 * la tienda (PELUDESK_APP_ANDROID_URL y PELUDESK_APP_IOS_URL, en Vercel). Mientras no haya liga, no se promete nada.
 */
export function ligasDeLaApp(): { android: string | null; ios: string | null } {
  const limpia = (v: string | undefined) => (v && /^https:\/\//.test(v.trim()) ? v.trim() : null);
  return { android: limpia(process.env.PELUDESK_APP_ANDROID_URL), ios: limpia(process.env.PELUDESK_APP_IOS_URL) };
}

export function AppNativaInvitacion({ motivo }: { motivo?: string }) {
  const { android, ios } = ligasDeLaApp();
  if (!android && !ios) return null;
  return (
    <section className="apd-seccion apd-aparece" data-app-nativa>
      <div className="apd-tarjeta" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <p style={{ fontWeight: 700 }}>Descarga la app PeluDesk</p>
        <p className="apd-nota">{motivo ?? "Con la app te llegan los avisos al momento, tomas la foto de la cartilla con la cámara y ves el mapa de lo que hay cerca."}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {android ? <a className="apd-boton" href={android} target="_blank" rel="noopener noreferrer">Para Android</a> : null}
          {ios ? <a className="apd-boton" href={ios} target="_blank" rel="noopener noreferrer">Para iPhone</a> : null}
        </div>
      </div>
    </section>
  );
}
