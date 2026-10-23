// La regla de largo de toda contraseña que escoge una persona (activación, alta por link, cambio desde el portal,
// «olvidé mi contraseña»): una sola, para que el portal no pida 8 en un lugar y 6 en otro (QA S27, N118).
export const MIN_CONTRASENA = 8;
export const TEXTO_CONTRASENA_CORTA = `Usa al menos ${MIN_CONTRASENA} caracteres.`;
