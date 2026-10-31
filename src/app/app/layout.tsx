import type { Viewport } from "next";
import "./app-duenos.css";

// La app para dueños (docs/app-duenos/PLAN.md). Vive en app.peludesk.mx: el middleware reescribe «/» → «/app»,
// «/avisos» → «/app/avisos»… Este layout solo pone el lienzo; la sesión y las pestañas van en (sesion)/layout.tsx y
// /entrar queda afuera (no pide sesión).
export const viewport: Viewport = { themeColor: "#fff8ee", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function AppDuenosLayout({ children }: { children: React.ReactNode }) {
  return <div className="apd flex min-h-full flex-1 flex-col">{children}</div>;
}
