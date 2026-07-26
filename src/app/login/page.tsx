import Image from "next/image";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-red-800 via-red-700 to-amber-600 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-4 flex justify-center">
          <Image
            src="/logo.jpg"
            alt="El Nuevo Rural"
            width={120}
            height={120}
            className="drop-shadow-md"
            priority
          />
        </div>
        <h1 className="mb-1 text-center text-xl font-semibold text-gray-900">
          El Nuevo Rural
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Ingresá con tu email y contraseña.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
