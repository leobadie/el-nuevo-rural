import { obtenerCatalogo } from "@/lib/tienda/servidor";
import { EstadoVacio } from "../_componentes/Varios";
import { Marco } from "../_componentes/Marco";
import { TiendaProvider } from "../_componentes/TiendaContexto";

/**
 * Páginas públicas de la tienda (/tienda, /tienda/carrito, /tienda/pedido/...).
 * El catálogo se lee una vez acá (cacheado) y lo comparten todas: navegar entre ellas
 * no lo vuelve a pedir.
 */
export default async function TiendaPublicaLayout({ children }: { children: React.ReactNode }) {
  const r = await obtenerCatalogo();
  if (!r.ok) {
    return (
      <main className="mx-auto w-full max-w-[600px] px-4 py-10 min-w-0">
        <EstadoVacio
          titulo="No pudimos cargar la tienda"
          texto="Puede ser un problema de conexión. Probá de nuevo en un rato."
        />
      </main>
    );
  }
  return (
    <TiendaProvider catalogo={r.catalogo}>
      <Marco>{children}</Marco>
    </TiendaProvider>
  );
}
