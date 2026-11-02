// Quita @phosphor-icons/react: cada ícono pasa a su equivalente de lucide-react con alias (el JSX no cambia) y se borra
// el atributo `weight` (lucide no lo tiene). WhatsApp va al IconoWhatsApp propio (lucide no trae marcas).
// docs/diseno/DESIGN.md → «Iconos».   node scripts/diseno/phosphor-a-lucide.mjs [--ver]
import fs from "node:fs";
import path from "node:path";

const MAPA = {
  ArrowLeft: "ArrowLeftIcon", ArrowRight: "ArrowRightIcon", ArrowSquareOut: "ExternalLinkIcon", CalendarBlank: "CalendarIcon",
  CalendarCheck: "CalendarCheckIcon", CaretLeft: "ChevronLeftIcon", CaretRight: "ChevronRightIcon", CarProfile: "CarIcon",
  Cat: "CatIcon", Check: "CheckIcon", Checks: "CheckCheckIcon", Clock: "ClockIcon", Dog: "DogIcon", Eye: "EyeIcon",
  HouseLine: "HouseIcon", InfinityIcon: "InfinityIcon", Info: "InfoIcon", List: "MenuIcon", MapPin: "MapPinIcon",
  Moon: "MoonIcon", NavigationArrow: "NavigationIcon", PawPrint: "PawPrintIcon", Phone: "PhoneIcon",
  PlayCircle: "CirclePlayIcon", Prohibit: "BanIcon", Quotes: "QuoteIcon", Rocket: "RocketIcon", Scissors: "ScissorsIcon",
  SignIn: "LogInIcon", Sparkle: "SparklesIcon", Star: "StarIcon", Stethoscope: "StethoscopeIcon", Syringe: "SyringeIcon",
  UserCircle: "CircleUserIcon", X: "XIcon",
};
const soloVer = process.argv.includes("--ver");
let archivos = 0;
const recorrer = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (/\.tsx?$/.test(e.name)) {
      const antes = fs.readFileSync(p, "utf8");
      if (!antes.includes("@phosphor-icons/react")) continue;
      let c = antes.replace(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*"@phosphor-icons\/react[^"]*";?/g, (_m, _t, lista) => {
        const nombres = lista.split(",").map((s) => s.trim()).filter(Boolean);
        const lucide = [], propios = [];
        for (const n of nombres) {
          const [orig, alias] = n.split(/\s+as\s+/).map((s) => s.trim());
          const local = alias ?? orig;
          if (orig === "WhatsappLogo") propios.push(`IconoWhatsApp as ${local}`);
          else if (MAPA[orig]) lucide.push(`${MAPA[orig]} as ${local}`);
          else if (orig === "IconProps" || orig === "Icon") lucide.push(`type LucideProps as ${local}`);
          else throw new Error(`${p}: sin equivalente para ${orig}`);
        }
        return [lucide.length ? `import { ${lucide.join(", ")} } from "lucide-react";` : "", propios.length ? `import { ${propios.join(", ")} } from "@/components/iconos/whatsapp";` : ""].filter(Boolean).join("\n");
      });
      c = c.replace(/\s+weight=(\{[^}]*\}|"[^"]*")/g, "");
      if (c !== antes) {
        archivos++;
        if (!soloVer) fs.writeFileSync(p, c);
        console.log(`  ${p}`);
      }
    }
  }
};
recorrer("src");
console.log(`${soloVer ? "Cambiaría" : "Cambió"} ${archivos} archivos.`);
