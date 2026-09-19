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
};

export default nextConfig;
