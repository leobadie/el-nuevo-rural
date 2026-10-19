"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ESPERA_VINCULO_MS,
  claveDeLaTeleOCrear,
  guardarPantalla,
  pantallaGuardada,
  type Hola,
} from "@/lib/cartel/tele";

/** Con una pantalla guardada, cuánto se espera a la red antes de ir a ella igual. */
const ESPERA_ARRANQUE_MS = 3000;

function conEspera<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((ok, mal) => {
    const id = setTimeout(() => mal(new Error("sin respuesta")), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(id);
        ok(v);
      },
      (e) => {
        clearTimeout(id);
        mal(e);
      },
    );
  });
}

export default function VincularTele() {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [sinRed, setSinRed] = useState(false);
  const [tamano, setTamano] = useState("");

  useEffect(() => {
    // /tv también tiene que abrir sin internet: el mismo service worker de la
    // pantalla la guarda (public/cartel-sw.js).
    // En la primera visita la página y su código se bajaron antes de que el
    // guardado existiera: se los pasa para que los guarde también.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/cartel-sw.js", { scope: "/tv", updateViaCache: "none" })
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          const urls = [window.location.href, ...performance.getEntriesByType("resource").map((e) => e.name)];
          reg.active?.postMessage({ tipo: "precargar", urls });
        })
        .catch((e) => console.error("tv: no se pudo registrar el guardado:", e));
    }

    const clave = claveDeLaTeleOCrear();
    const guardada = pantallaGuardada();
    let vivo = true;
    let timer: number | undefined;

    const ir = (slug: string) => {
      guardarPantalla(slug);
      window.location.replace(`/cartel/tv/${slug}`);
    };

    const preguntar = async (primera: boolean) => {
      // Con cada consulta: si la tele gira o cambia de resolución, se ve.
      setTamano(`${window.innerWidth}×${window.innerHeight}`);
      try {
        const { data, error } = await conEspera(
          createClient().rpc("cartel_tv_hola", {
            p_clave: clave,
            p_navegador: navigator.userAgent,
            p_ancho: window.innerWidth,
            p_alto: window.innerHeight,
          }),
          primera && guardada ? ESPERA_ARRANQUE_MS : 15_000,
        );
        if (error) throw new Error(error.message);
        const hola = data as Hola;
        if (hola.pantalla) {
          ir(hola.pantalla);
          return;
        }
        // La desvincularon mientras estaba apagada.
        guardarPantalla(null);
        if (!vivo) return;
        setCodigo(hola.codigo);
        setSinRed(false);
      } catch (e) {
        // Se prendió sin internet (o el servidor no contesta) y ya sabe quién
        // es: a su pantalla, que arranca con lo guardado.
        if (primera && guardada) {
          ir(guardada);
          return;
        }
        console.error("tv: no se pudo consultar el código:", e);
        if (vivo) setSinRed(true);
      }
      if (vivo) timer = window.setTimeout(() => preguntar(false), ESPERA_VINCULO_MS);
    };

    preguntar(true);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="tv-vincular" data-codigo={codigo ?? ""}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="tv-vincular-logo" src="/logo.jpg" alt="" />
      <p className="tv-vincular-titulo">Televisor sin asignar</p>
      <p className="tv-vincular-codigo" data-test="codigo-tele">
        {codigo ?? "····"}
      </p>
      <p className="tv-vincular-pasos">
        En el celular: <strong>/cartel/admin</strong> → Televisores → <strong>Vincular</strong>
        <br />y escribí este código.
      </p>
      <p className="tv-vincular-pie">
        {sinRed ? "Sin conexión. Reintentando…" : codigo ? "Esperando que la vinculen…" : "Conectando…"}
        {tamano && ` · Pantalla ${tamano}`}
      </p>
    </div>
  );
}
