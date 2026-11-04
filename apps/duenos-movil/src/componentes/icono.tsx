import { SymbolView } from "expo-symbols";
import type { ColorValue } from "react-native";
import type { SymbolViewProps } from "expo-symbols";

type ParDeSimbolos = Exclude<SymbolViewProps["name"], string>;
type SFSymbol = NonNullable<ParDeSimbolos["ios"]>;
type AndroidSymbol = NonNullable<ParDeSimbolos["android"]>;

/**
 * Iconos nativos de cada plataforma: SF Symbols en iOS y Material Symbols en Android (expo-symbols). Cada nombre de la
 * app tiene su par; así un ícono se ve como los del sistema en cada celular.
 */
export const ICONOS = {
  mascota: { ios: "pawprint.fill", android: "pets" },
  vacuna: { ios: "syringe.fill", android: "vaccines" },
  mapa: { ios: "map.fill", android: "map" },
  alerta: { ios: "exclamationmark.bubble.fill", android: "campaign" },
  aviso: { ios: "bell.fill", android: "notifications" },
  persona: { ios: "person.crop.circle.fill", android: "account_circle" },
  medicina: { ios: "pills.fill", android: "medication" },
  peso: { ios: "scalemass.fill", android: "monitor_weight" },
  qr: { ios: "qrcode", android: "qr_code_2" },
  pago: { ios: "creditcard.fill", android: "payments" },
  calendario: { ios: "calendar", android: "calendar_month" },
  hotel: { ios: "bed.double.fill", android: "bed" },
  estetica: { ios: "scissors", android: "content_cut" },
  veterinaria: { ios: "cross.case.fill", android: "local_hospital" },
  urgencias: { ios: "staroflife.fill", android: "emergency" },
  guarderia: { ios: "house.fill", android: "home" },
  tienda: { ios: "bag.fill", android: "shopping_bag" },
  parque: { ios: "tree.fill", android: "park" },
  cafe: { ios: "cup.and.saucer.fill", android: "local_cafe" },
  restaurante: { ios: "fork.knife", android: "restaurant" },
  paseo: { ios: "figure.walk", android: "directions_walk" },
  ubicacion: { ios: "location.fill", android: "my_location" },
  pin: { ios: "mappin.and.ellipse", android: "location_on" },
  camara: { ios: "camera.fill", android: "photo_camera" },
  galeria: { ios: "photo.on.rectangle", android: "image" },
  llamar: { ios: "phone.fill", android: "call" },
  llegar: { ios: "arrow.triangle.turn.up.right.diamond.fill", android: "directions" },
  estrella: { ios: "star.fill", android: "star" },
  siguiente: { ios: "chevron.right", android: "chevron_right" },
  agregar: { ios: "plus", android: "add" },
  cerrar: { ios: "xmark", android: "close" },
  listo: { ios: "checkmark.circle.fill", android: "check_circle" },
  cuidado: { ios: "exclamationmark.triangle.fill", android: "warning" },
  buscar: { ios: "magnifyingglass", android: "search" },
  reloj: { ios: "clock.fill", android: "schedule" },
  corazon: { ios: "heart.fill", android: "favorite" },
  compartir: { ios: "square.and.arrow.up", android: "share" },
  chat: { ios: "bubble.left.and.bubble.right.fill", android: "chat" },
  editar: { ios: "pencil", android: "edit" },
  borrar: { ios: "trash", android: "delete" },
  salir: { ios: "rectangle.portrait.and.arrow.right", android: "logout" },
  recibo: { ios: "doc.text.fill", android: "receipt_long" },
  pase: { ios: "ticket.fill", android: "confirmation_number" },
  firma: { ios: "signature", android: "draw" },
  bandera: { ios: "flag.fill", android: "flag" },
  reportar: { ios: "exclamationmark.shield.fill", android: "report" },
  curita: { ios: "bandage.fill", android: "healing" },
  info: { ios: "info.circle.fill", android: "info" },
  copiar: { ios: "doc.on.doc", android: "content_copy" },
  abrir: { ios: "arrow.up.right.square", android: "open_in_new" },
  lista: { ios: "list.bullet", android: "view_list" },
  explorar: { ios: "safari.fill", android: "travel_explore" },
  refrescar: { ios: "arrow.clockwise", android: "refresh" },
  tienda2: { ios: "storefront.fill", android: "storefront" },
} satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type NombreIcono = keyof typeof ICONOS;

export function Icono({ nombre, tamano = 22, color }: { nombre: NombreIcono; tamano?: number; color: ColorValue }) {
  return <SymbolView name={ICONOS[nombre]} size={tamano} tintColor={color} />;
}
