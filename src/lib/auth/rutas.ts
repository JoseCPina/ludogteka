export function rutaPorRol(rol: string | null | undefined): string {
  switch (rol) {
    case "admin":
      return "/admin";
    case "recepcion":
      return "/recepcion";
    case "estetica":
      return "/estetica";
    default:
      return "/portal";
  }
}
