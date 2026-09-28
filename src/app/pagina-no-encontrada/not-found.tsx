import Link from "next/link";

export default function PaginaNoExiste() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-bold text-n-900">Esta página no existe</h1>
      <p className="text-n-600">Revisa que la dirección esté bien escrita.</p>
      <Link href="/" className="mt-2 font-semibold text-morado underline underline-offset-4">
        Ir al inicio
      </Link>
    </main>
  );
}
