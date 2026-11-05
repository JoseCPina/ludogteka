import { ActionSheetIOS, Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { reportarError } from "./errores";

/**
 * Fotos con la cámara o la galería del sistema. Se reducen a 1600 px y JPEG antes de subir (rápido con mala señal) y,
 * al volver a codificar, se van los metadatos del archivo (ubicación incluida). El servidor los quita otra vez.
 */
export type FotoLista = { uri: string; nombre: string; tipo: "image/jpeg" };

async function permiso(origen: "camara" | "galeria"): Promise<boolean> {
  const r = origen === "camara" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (r.granted) return true;
  Alert.alert(
    origen === "camara" ? "Sin permiso para la cámara" : "Sin permiso para tus fotos",
    "Puedes darlo en los ajustes del celular.",
    [{ text: "Ahora no", style: "cancel" }, { text: "Abrir ajustes", onPress: () => Linking.openSettings() }]
  );
  return false;
}

export async function tomarFoto(origen: "camara" | "galeria", o: { recortar?: boolean } = {}): Promise<FotoLista | null> {
  try {
    if (!(await permiso(origen))) return null;
    const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.9, allowsEditing: Boolean(o.recortar), aspect: o.recortar ? [1, 1] : undefined, exif: false };
    const r = origen === "camara" ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
    if (r.canceled || !r.assets?.[0]) return null;
    const a = r.assets[0];
    const lado = Math.max(a.width ?? 0, a.height ?? 0);
    const contexto = ImageManipulator.manipulate(a.uri);
    if (lado > 1600) contexto.resize(a.width >= a.height ? { width: 1600 } : { height: 1600 });
    const img = await contexto.renderAsync();
    const final = await img.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    return { uri: final.uri, nombre: `foto-${Date.now()}.jpg`, tipo: "image/jpeg" };
  } catch (e) {
    // Sin cámara, sin memoria o una foto que no se puede leer: se dice y la pantalla sigue.
    reportarError(e, { origen: "foto" });
    Alert.alert("No pudimos usar esa foto", origen === "camara" ? "Intenta otra vez o escoge una de tus fotos." : "Intenta con otra foto.");
    return null;
  }
}

/** «Tomar foto» o «Escoger de tus fotos»: hoja de acciones del sistema en iOS y diálogo en Android. */
export function preguntarOrigen(titulo: string): Promise<"camara" | "galeria" | null> {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ title: titulo, options: ["Tomar foto", "Escoger de tus fotos", "Cancelar"], cancelButtonIndex: 2 }, (i) => resolve(i === 0 ? "camara" : i === 1 ? "galeria" : null));
    } else {
      Alert.alert(titulo, undefined, [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(null) },
        { text: "Escoger de tus fotos", onPress: () => resolve("galeria") },
        { text: "Tomar foto", onPress: () => resolve("camara") },
      ], { cancelable: true, onDismiss: () => resolve(null) });
    }
  });
}
