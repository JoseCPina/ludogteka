import { createElement } from "react";
import {
  BadgeDollarSign,
  BedDouble,
  Boxes,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  Dog,
  FileSignature,
  FileText,
  House,
  Import,
  Link2,
  type LucideIcon,
  MessageCircle,
  PackagePlus,
  Palette,
  Receipt,
  Scissors,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Sun,
  TrendingUp,
  UserRoundCheck,
  Users,
  Wallet,
  CreditCard,
  Camera,
  Wrench,
} from "lucide-react";

/**
 * Íconos de las secciones del menú (lucide-react, docs/diseno/DESIGN.md → «Iconos»): trazo de 1.75 px, del color del
 * texto de la entrada (activo en morado). Decorativos: la etiqueta de la sección va siempre al lado. La ruta más
 * específica gana (`/admin/permisos` antes que `/admin`).
 */
const POR_RUTA: [string, LucideIcon][] = [
  ["/admin/permisos", ShieldCheck],
  ["/admin/configuracion", Settings],
  ["/admin/perfil", Palette],
  ["/admin/politicas", ClipboardList],
  ["/admin/recordatorios", MessageCircle],
  ["/admin/reporte-guarderia", Camera],
  ["/admin/hotel", BedDouble],
  ["/admin/tarifa-guarderia", BadgeDollarSign],
  ["/admin/modulos", SlidersHorizontal],
  ["/admin/pagos", CreditCard],
  ["/admin/facturacion", FileText],
  ["/admin/importar", Import],
  ["/admin", Wrench],
  ["/recepcion", House],
  ["/guarderia", Sun],
  ["/hotel", BedDouble],
  ["/reservas/calendario", CalendarDays],
  ["/adentro", Dog],
  ["/estetica", Scissors],
  ["/veterinaria", Stethoscope],
  ["/extras", PackagePlus],
  ["/servicios", Boxes],
  ["/clientes", Users],
  ["/recordatorios", MessageCircle],
  ["/vinculacion", Link2],
  ["/caja/facturas", Receipt],
  ["/caja", Wallet],
  ["/contratos", FileSignature],
  ["/inventario", Boxes],
  ["/reportes", TrendingUp],
  ["/empleados", Users],
  ["/gastos", Receipt],
  ["/mi-trabajo", UserRoundCheck],
  ["/ayuda", CircleHelp],
];

export function iconoDeRuta(href: string, inicio = false): LucideIcon {
  if (inicio) return House;
  return POR_RUTA.find(([r]) => href === r || href.startsWith(`${r}/`))?.[1] ?? House;
}

export function IconoSeccion({ href, inicio = false, className = "size-[18px]" }: { href: string; inicio?: boolean; className?: string }) {
  return createElement(iconoDeRuta(href, inicio), { "aria-hidden": true, strokeWidth: 1.75, className: `flex-none ${className}` });
}
