import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Las tipografías del flyer se leen del disco con readFile en tiempo de ejecución, y el
   * rastreo de archivos de Next no las ve porque no hay un import que las mencione. Sin esto
   * andan en la máquina de desarrollo y fallan en producción, que es el peor orden posible.
   */
  outputFileTracingIncludes: {
    "/api/flyer": ["assets/fonts/*.ttf"],
  },

  /*
   * Cabeceras de seguridad en todas las respuestas (SPEC-cabeceras-seguridad.md). Solo las de
   * bajo riesgo: HSTS fuerza HTTPS, SAMEORIGIN evita clickjacking, nosniff evita que el navegador
   * adivine tipos, y Referrer-Policy no filtra la URL completa a terceros. La CSP queda aparte
   * porque, mal puesta, rompe la app.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
