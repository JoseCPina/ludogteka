import { Platform } from "react-native";
import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

type Nativo = {
  saludarWhatsApp(): boolean;
  esperarSms(): boolean;
  dejarDeEsperar(): void;
  addListener(evento: "onCodigo", fn: (e: { codigo: string; origen: "whatsapp" | "sms" }) => void): EventSubscription;
};

// En iOS y en web no existe: ahí el teclado sugiere el código o se pega con un toque.
const nativo = Platform.OS === "android" ? requireOptionalNativeModule<Nativo>("CodigoAutomatico") : null;

/** Empieza a escuchar el código (WhatsApp y SMS). Nunca truena: si algo falta, la persona lo escribe a mano. */
export function escucharCodigo(alLlegar: (codigo: string) => void): () => void {
  if (!nativo) return () => {};
  const sub = nativo.addListener("onCodigo", (e) => alLlegar(e.codigo));
  try {
    nativo.saludarWhatsApp();
    nativo.esperarSms();
  } catch {
    // Sin servicios de Google: se escribe a mano.
  }
  return () => {
    sub.remove();
    try {
      nativo.dejarDeEsperar();
    } catch {
      // nada que soltar
    }
  };
}

/** Justo antes de pedir otro código: WhatsApp necesita un saludo nuevo por cada plantilla. */
export function saludarOtraVez() {
  try {
    nativo?.saludarWhatsApp();
    nativo?.esperarSms();
  } catch {
    // se escribe a mano
  }
}
