"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PlacaVista from "./PlacaVista";
import {
  NAVY,
  colorDePlaca,
  duracionMs,
  hoyISO,
  placasDePantalla,
  placasParaMostrar,
} from "@/lib/cartel/placas";

import type { Asignacion, Pantalla, Placa } from "@/lib/cartel/types";

/** Azul de fondo cuando el color fuerte lo lleva la franja de sección. */
const FONDO_BASE = "#12203c";

/** Cada cuánto el televisor vuelve a preguntar por las ofertas. */
const REFRESCO_MS = 5 * 60 * 1000;

export default function CartelPantalla({
  placasIniciales,
  indiceFijo = null,
  seccion = null,
  pantalla = null,
  asignacionesIniciales = [],
}: {
  placasIniciales: Placa[];
  /** Con un índice, la pantalla se queda quieta en esa placa (modo captura). */
  indiceFijo?: number | null;
  /** Sector del local: solo se muestran sus placas y las que no tienen sección. */
  seccion?: string | null;
  /**
   * El televisor concreto que está mostrando esto. Con pantalla manda la regla
   * de asignaciones; sin ella se cae al filtro por sección de siempre, que es
   * lo que usan `/cartel` y el generador de video.
   */
  pantalla?: Pantalla | null;
  asignacionesIniciales?: Asignacion[];
}) {
  const [crudas, setCrudas] = useState<Placa[]>(placasIniciales);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>(asignacionesIniciales);
  const [hoy, setHoy] = useState(() => hoyISO());
  const [indice, setIndice] = useState(0);
  const [hora, setHora] = useState<string | null>(null);

  const modoCaptura = indiceFijo != null;

  // Las dos funciones filtran por vigencia y, si no queda nada, devuelven las de
  // demostración: la lista nunca viene vacía, así que el TV nunca queda negro.
  const placas = useMemo(
    () =>
      pantalla
        ? placasDePantalla(crudas, asignaciones, pantalla, hoy)
        : placasParaMostrar(crudas, hoy, seccion),
    [crudas, asignaciones, pantalla, hoy, seccion],
  );

  const posicion =
    placas.length > 0 ? ((modoCaptura ? indiceFijo! : indice) % placas.length + placas.length) % placas.length : 0;
  const placa = placas[posicion];

  // ---- Rotación ----------------------------------------------------------
  // El timeout se rearma con la duración de la placa actual. Cuando la lista
  // cambia por un refresco, el índice se reinterpreta con módulo, así que no
  // hace falta resetearlo ni se corta la rotación.
  useEffect(() => {
    if (!placa || modoCaptura) return;

    const id = setTimeout(() => setIndice((i) => i + 1), duracionMs(placa));
    return () => clearTimeout(id);
  }, [placa, posicion, modoCaptura]);

  // ---- Reloj -------------------------------------------------------------
  // Arranca en null y se completa al montar: si se renderizara en el servidor,
  // la hora de UTC no coincidiría con la del navegador y React marcaría un
  // error de hidratación.
  useEffect(() => {
    const pintar = () =>
      setHora(
        new Intl.DateTimeFormat("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
          hour: "2-digit",
          minute: "2-digit",
          // 24 horas: "18:12" se lee de un vistazo desde lejos, "06:12 p. m."
          // ocupa el doble y obliga a frenar a leerlo.
          hour12: false,
        }).format(new Date()),
      );

    pintar();
    const id = setInterval(pintar, 20_000);
    return () => clearInterval(id);
  }, []);

  // ---- Refresco de datos -------------------------------------------------
  const refrescar = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("cartel_placas")
        .select("*")
        .eq("activa", true)
        .order("orden", { ascending: true });

      // Ante un error de red nos quedamos con lo que ya teníamos en pantalla:
      // el local sigue viendo las ofertas aunque se caiga internet un rato.
      if (error) {
        console.error("cartel: refresco fallido:", error.message);
        return;
      }
      if (data) setCrudas(data as Placa[]);

      // Las asignaciones se releen en la misma vuelta: si no, mover una oferta
      // de un televisor a otro desde el admin no se vería hasta reiniciar el TV.
      // Solo hace falta cuando esta pantalla es un televisor concreto.
      if (pantalla) {
        const { data: asig, error: eAsig } = await supabase
          .from("cartel_placa_pantalla")
          .select("placa_id, pantalla_slug");

        if (eAsig) console.error("cartel: refresco de asignaciones fallido:", eAsig.message);
        else if (asig) setAsignaciones(asig as Asignacion[]);
      }
    } catch (e) {
      console.error("cartel: refresco fallido:", e);
    } finally {
      // Recalcular la fecha en cada vuelta hace que una oferta que vence a
      // medianoche desaparezca sola, con el televisor prendido.
      setHoy(hoyISO());
    }
  }, [pantalla]);

  useEffect(() => {
    // En modo captura la lista no se toca: si entrara un refresco a mitad de la
    // grabación, el video mezclaría placas viejas con nuevas.
    if (modoCaptura) return;

    const id = setInterval(refrescar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [refrescar, modoCaptura]);

  if (!placa) return null;

  return (
    <div className="cartel-fondo">
      {/* Con sección, el color fuerte va en la franja de arriba y no en toda la
          placa: un fondo rojo a pantalla completa cansa la vista y le come
          protagonismo al precio. */}
      <div
        className="cartel-marco"
        style={{
          background:
            // Negro detrás de un cartel ajeno: el azul de la marca chocaría con
            // el color que traiga la imagen.
            placa.tipo === "imagen" ? "#000" : placa.seccion ? FONDO_BASE : placa.color || NAVY,
        }}
        data-placa={placa.id}
        data-total={placas.length}
        data-duracion={duracionMs(placa)}
      >
        {/* El encabezado hace de franja de sección: pintado con el color del
            sector, dice desde lejos si lo que se muestra es de carnicería o de
            verdulería. Sin sección se comporta como antes. */}
        {placa.tipo !== "imagen" && (
        <header
          className="cartel-header"
          style={placa.seccion ? { background: colorDePlaca(placa) } : undefined}
        >
          {placa.seccion ? (
            <span className="cartel-seccion">{placa.seccion}</span>
          ) : (
            <div className="cartel-marca">
              {/* eslint-disable-next-line @next/next/no-img-element -- el TV pide
                  la imagen directo: una capa de optimización de por medio es un
                  punto más donde la pantalla se puede quedar sin logo. */}
              <img className="cartel-logo" src="/logo.jpg" alt="" />
              <span className="cartel-marca-texto">
                El Nuevo
                <br />
                Rural
              </span>
            </div>
          )}

          {placa.seccion && (
            <div className="cartel-marca cartel-marca-derecha">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="cartel-logo" src="/logo.jpg" alt="" />
              <span className="cartel-marca-texto">
                El Nuevo
                <br />
                Rural
              </span>
            </div>
          )}
          {/* En un video grabado el reloj queda congelado: mostraría una hora
              equivocada toda la tarde, así que en modo captura no va. Y con
              sección tampoco: la franja ya lleva el sector y la marca, y un
              tercer dato ahí adentro solo ensucia. */}
          {!modoCaptura && !placa.seccion && <span className="cartel-hora">{hora ?? ""}</span>}
        </header>
        )}

        <main className="cartel-cuerpo">
          {/* La key fuerza el remontaje en cada cambio: sin eso la animación de
              entrada solo se vería la primera vez. */}
          <PlacaVista key={`${placa.id}:${posicion}`} placa={placa} />
        </main>

        {/* El pie marca cuánto falta para la próxima placa. En el video el corte
            lo hace el propio video, así que una barra quieta solo confunde. */}
        {!modoCaptura && placa.tipo !== "imagen" && (
        <footer className="cartel-pie">
          <div className="cartel-progreso">
            <div
              key={`${placa.id}:${posicion}`}
              className="cartel-progreso-barra"
              style={{ animationDuration: `${duracionMs(placa)}ms` }}
            />
          </div>
          <div className="cartel-puntos">
            {placas.map((p, i) => (
              <span
                key={p.id}
                className={i === posicion ? "cartel-punto cartel-punto-activo" : "cartel-punto"}
              />
            ))}
          </div>
        </footer>
        )}
      </div>
    </div>
  );
}
