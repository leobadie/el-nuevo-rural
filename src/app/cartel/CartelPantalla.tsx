"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PlacaVista from "./PlacaVista";
import {
  LATIDO_MS,
  NAVY,
  SALIDA_MS,
  colorDePlaca,
  duracionMs,
  hoyISO,
  placasDePantalla,
  placasParaMostrar,
  rotacionDe,
} from "@/lib/cartel/placas";

import { MIRAR_VINCULO_MS, claveDeLaTele, decidirVinculo, guardarPantalla } from "@/lib/cartel/tele";
import type { Rotacion } from "@/lib/cartel/placas";
import type { EstadoTele } from "@/lib/cartel/tele";
import type { Asignacion, Pantalla, Placa } from "@/lib/cartel/types";

/** Azul de fondo cuando el color fuerte lo lleva la franja de sección. */
const FONDO_BASE = "#12203c";

/** Cada cuánto el televisor vuelve a preguntar por las ofertas. */
const REFRESCO_MS = 5 * 60 * 1000;

/** Cada cuánto el televisor se fija si se publicó una versión nueva de la app. */
const MIRAR_VERSION_MS = 10 * 60 * 1000;

/** Con más de esto abierta, la página se recarga en la madrugada. */
const RECARGA_DIARIA_MS = 20 * 60 * 60 * 1000;

/** Hora del local, sin depender de la zona horaria que tenga configurada el TV. */
function horaLocal(): number {
  return Number(
    new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
}

export default function CartelPantalla({
  placasIniciales,
  indiceFijo = null,
  seccion = null,
  pantalla = null,
  asignacionesIniciales = [],
  rotar = 0,
  version = null,
  vistaGeneral = false,
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
  /**
   * Grados para girar la placa dentro de una pantalla apaisada: el navegador
   * del TV manda la imagen acostada aunque el televisor esté montado parado.
   */
  rotar?: Rotacion | null;
  /** Commit del deploy, para que el admin sepa qué versión tiene cargada cada TV. */
  version?: string | null;
  /**
   * La página general /cartel: no sabe qué tele es, no gira y muestra todo. Una
   * tele del local la tuvo cargada creyendo que era su pantalla (19/10/2026),
   * así que lleva un aviso que manda a /tv.
   */
  vistaGeneral?: boolean;
}) {
  // La fila del televisor se relee en cada refresco: así un cambio de sector o
  // de giro hecho desde el admin le llega sin que nadie vaya hasta el local.
  const [pantallaViva, setPantallaViva] = useState<Pantalla | null>(pantalla);
  const [cargadaEl] = useState(() => Date.now());
  const [crudas, setCrudas] = useState<Placa[]>(placasIniciales);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>(asignacionesIniciales);
  const [hoy, setHoy] = useState(() => hoyISO());
  const [indice, setIndice] = useState(0);
  const [hora, setHora] = useState<string | null>(null);
  // Clave de la placa que está saliendo. Se compara contra la actual en vez de
  // guardar un booleano, así no hace falta "apagarlo" cuando entra la siguiente.
  const [saliendoDe, setSaliendoDe] = useState<string | null>(null);

  const modoCaptura = indiceFijo != null;
  const slugPantalla = pantalla?.slug ?? null;

  // Las dos funciones filtran por vigencia y, si no queda nada, devuelven las de
  // demostración: la lista nunca viene vacía, así que el TV nunca queda negro.
  const placas = useMemo(
    () =>
      pantallaViva
        ? placasDePantalla(crudas, asignaciones, pantallaViva, hoy)
        : placasParaMostrar(crudas, hoy, seccion),
    [crudas, asignaciones, pantallaViva, hoy, seccion],
  );

  // ?rotar= en la dirección manda; si no está, el giro elegido en el admin.
  const giro: Rotacion = rotar ?? rotacionDe(String(pantallaViva?.rotacion ?? 0));

  const posicion =
    placas.length > 0 ? ((modoCaptura ? indiceFijo! : indice) % placas.length + placas.length) % placas.length : 0;
  const placa = placas[posicion];
  const clave = placa ? `${placa.id}:${posicion}` : "";
  const saliendo = saliendoDe === clave;

  // ---- Rotación ----------------------------------------------------------
  // El timeout se rearma con la duración de la placa actual. Cuando la lista
  // cambia por un refresco, el índice se reinterpreta con módulo, así que no
  // hace falta resetearlo ni se corta la rotación.
  //
  // La placa sale un momento antes de que entre la siguiente: sin esa salida el
  // cambio se ve como un corte seco.
  // Con una sola placa no hay a dónde avanzar: si saliera, quedaría escondida.
  const unica = placas.length < 2;
  const esVideo = placa?.tipo === "video";
  useEffect(() => {
    if (!placa || modoCaptura || unica || esVideo) return;

    const total = duracionMs(placa);
    const salir = setTimeout(() => setSaliendoDe(clave), Math.max(total - SALIDA_MS, 0));
    const avanzar = setTimeout(() => setIndice((i) => i + 1), total);
    return () => {
      clearTimeout(salir);
      clearTimeout(avanzar);
    };
  }, [placa, clave, modoCaptura, unica, esVideo]);

  // ---- Placas de video -----------------------------------------------------
  // Avanzan cuando el video termina y no por reloj: si tarda en cargar, un
  // reloj le cortaría el final. Con una sola placa, el video vuelve a empezar.
  const [vuelta, setVuelta] = useState(0);
  const terminarVideo = useCallback(() => {
    if (unica) setVuelta((v) => v + 1);
    else setSaliendoDe(clave);
  }, [unica, clave]);

  useEffect(() => {
    if (!esVideo || !saliendo) return;
    const id = setTimeout(() => setIndice((i) => i + 1), SALIDA_MS);
    return () => clearTimeout(id);
  }, [esVideo, saliendo]);

  // Seguridad: un video trabado cargando no puede dejar el TV clavado en él.
  useEffect(() => {
    if (!placa || !esVideo || modoCaptura) return;
    const id = setTimeout(terminarVideo, duracionMs(placa) * 2 + 15_000);
    return () => clearTimeout(id);
  }, [placa, esVideo, modoCaptura, terminarVideo, vuelta]);

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
      if (slugPantalla) {
        const { data: asig, error: eAsig } = await supabase
          .from("cartel_placa_pantalla")
          .select("placa_id, pantalla_slug");

        if (eAsig) console.error("cartel: refresco de asignaciones fallido:", eAsig.message);
        else if (asig) setAsignaciones(asig as Asignacion[]);

        // "*" y no una lista de columnas: así anda igual antes y después de la
        // migración 028, que agrega el giro. Si la pantalla no aparece (la
        // apagaron) se sigue con la que había: mejor eso que dejar el TV negro.
        const { data: fila, error: eFila } = await supabase
          .from("cartel_pantallas")
          .select("*")
          .eq("slug", slugPantalla)
          .maybeSingle();
        if (eFila) console.error("cartel: refresco de la pantalla fallido:", eFila.message);
        else if (fila) setPantallaViva(fila as Pantalla);
      }
    } catch (e) {
      console.error("cartel: refresco fallido:", e);
    } finally {
      // Recalcular la fecha en cada vuelta hace que una oferta que vence a
      // medianoche desaparezca sola, con el televisor prendido.
      setHoy(hoyISO());
    }
  }, [slugPantalla]);

  useEffect(() => {
    // En modo captura la lista no se toca: si entrara un refresco a mitad de la
    // grabación, el video mezclaría placas viejas con nuevas.
    if (modoCaptura) return;

    const id = setInterval(refrescar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [refrescar, modoCaptura]);

  // ---- Actualización sola ------------------------------------------------
  // El código que corre en el TV es el que se cargó al abrir la página: sin
  // recargar, una versión nueva nunca le llega, y nadie va a ir a apretar F5.
  // Cada tanto se pide la propia página y, si el servidor ya tiene otra versión,
  // se recarga. Una vez por día, de madrugada, se recarga igual para no
  // acumular memoria en el navegador del TV.
  useEffect(() => {
    if (!slugPantalla || modoCaptura || !version || version === "local") return;

    const mirar = async () => {
      try {
        const resp = await fetch(window.location.href, { cache: "no-store" });
        // Sin internet o con el servidor caído no se recarga: se quedaría en una
        // página de error en vez de las ofertas.
        if (!resp.ok) return;
        const nueva = (await resp.text()).match(/data-version="([^"]+)"/)?.[1];
        if (nueva && nueva !== version) {
          window.location.reload();
          return;
        }
        if (Date.now() - cargadaEl > RECARGA_DIARIA_MS && horaLocal() === 4) window.location.reload();
      } catch {
        // Sin red: se sigue mostrando lo que hay.
      }
    };

    const id = setInterval(mirar, MIRAR_VERSION_MS);
    return () => clearInterval(id);
  }, [slugPantalla, modoCaptura, version, cargadaEl]);

  // ---- Que el TV no se duerma ----------------------------------------------
  // Con imágenes fijas el televisor pone el protector de pantalla a los pocos
  // minutos. Se le pide al navegador que mantenga la pantalla prendida; donde
  // eso no existe, el video mínimo en loop de abajo cumple la misma función,
  // que es lo que hacía el reproductor de cdenet sin proponérselo.
  useEffect(() => {
    if (modoCaptura) return;
    type Bloqueo = { release: () => Promise<void> };
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Bloqueo> } }).wakeLock;
    if (!wl) return;

    let bloqueo: Bloqueo | null = null;
    const pedir = () => {
      if (document.visibilityState !== "visible") return;
      wl.request("screen")
        .then((b) => (bloqueo = b))
        .catch(() => {});
    };
    pedir();
    // El navegador suelta el bloqueo cuando la página se oculta: al volver se pide de nuevo.
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("visibilitychange", pedir);
      bloqueo?.release().catch(() => {});
    };
  }, [modoCaptura]);

  // ---- Guardado en el TV ---------------------------------------------------
  // El service worker guarda la página, las ofertas y las fotos para que el TV
  // arranque aunque se prenda sin internet, y para que cada foto o video se
  // baje una sola vez (public/cartel-sw.js). Lo que la página ya cargó antes de
  // que existiera se le pasa para que lo guarde también.
  useEffect(() => {
    if (!slugPantalla || modoCaptura || !("serviceWorker" in navigator)) return;

    const sw = navigator.serviceWorker;
    // En la primera visita el aviso puede llegar mientras el service worker
    // todavía se está activando, y ahí se pierde. Se manda al estar listo, al
    // tomar el control y una vez más a los 10 s; guardar dos veces no cuesta nada.
    const precargar = () => {
      const destino = sw.controller;
      if (!destino) return;
      const urls = [window.location.href, ...performance.getEntriesByType("resource").map((e) => e.name)];
      // Una tele vinculada por código arranca por /tv: esa página también tiene
      // que estar guardada, y en su primera carga todavía no había guardado.
      if (claveDeLaTele()) urls.push(`${window.location.origin}/tv`);
      destino.postMessage({ tipo: "precargar", urls });
    };

    sw.addEventListener("controllerchange", precargar);
    const otraVez = window.setTimeout(precargar, 10_000);
    sw.register("/cartel-sw.js", { scope: "/cartel/tv/", updateViaCache: "none" })
      .then(() => sw.ready)
      .then(precargar)
      .catch((e) => console.error("cartel: no se pudo registrar el guardado:", e));

    return () => {
      sw.removeEventListener("controllerchange", precargar);
      window.clearTimeout(otraVez);
    };
  }, [slugPantalla, modoCaptura]);

  // ---- Pantalla completa -------------------------------------------------
  // La barra del navegador del TV tapa el borde de la placa (se comía la última
  // cifra del precio). El navegador solo deja pasar a pantalla completa después
  // de que alguien toca algo, así que basta con apretar OK en el control una vez.
  useEffect(() => {
    if (modoCaptura) return;
    const completa = () => {
      if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
      document.documentElement.requestFullscreen().catch(() => {});
    };
    window.addEventListener("keydown", completa);
    window.addEventListener("click", completa);
    return () => {
      window.removeEventListener("keydown", completa);
      window.removeEventListener("click", completa);
    };
  }, [modoCaptura]);

  // ---- Latido ------------------------------------------------------------
  // El televisor avisa que está prendido, para que el admin muestre cuál anda
  // y cuál no (migración 027). Si falla no pasa nada en pantalla: el aviso es
  // para la oficina, no para el cliente que mira el TV.
  useEffect(() => {
    if (!slugPantalla || modoCaptura) return;

    const latir = () => {
      createClient()
        .rpc("cartel_latido", {
          p_slug: slugPantalla,
          p_navegador: navigator.userAgent,
          p_version: version ?? "",
          p_ancho: window.innerWidth,
          p_alto: window.innerHeight,
        })
        .then(({ error }) => {
          if (error) console.error("cartel: latido fallido:", error.message);
        });
    };

    latir();
    const id = setInterval(latir, LATIDO_MS);
    return () => clearInterval(id);
  }, [slugPantalla, modoCaptura, version]);

  // ---- Vínculo e "Identificar" ------------------------------------------
  // Cada 15 s la tele pregunta si desde el admin la movieron de pantalla, la
  // desvincularon o pidieron que muestre su nombre (SPEC-cartel-vincular.md).
  // Sin internet o sin la migración 031 la consulta falla y no pasa nada.
  const [identificarHasta, setIdentificarHasta] = useState(0);
  useEffect(() => {
    if (!slugPantalla || modoCaptura) return;
    const clave = claveDeLaTele();

    const mirar = () => {
      createClient()
        .rpc("cartel_tv_estado", { p_slug: slugPantalla, p_clave: clave })
        .then(({ data, error }) => {
          if (error || !data) return;
          const estado = data as EstadoTele;
          const decision = decidirVinculo(slugPantalla, clave != null, estado);
          if (decision.tipo === "ir") {
            guardarPantalla(decision.slug);
            window.location.replace(`/cartel/tv/${decision.slug}`);
            return;
          }
          if (decision.tipo === "desvinculada") {
            guardarPantalla(null);
            window.location.replace("/tv");
            return;
          }
          if (clave) guardarPantalla(slugPantalla);
          // Con el reloj de la tele solo se mide cuánto falta, no la hora.
          if (estado.identificar_seg > 0) setIdentificarHasta(Date.now() + estado.identificar_seg * 1000);
        });
    };

    mirar();
    const id = setInterval(mirar, MIRAR_VINCULO_MS);
    return () => clearInterval(id);
  }, [slugPantalla, modoCaptura]);

  const identificando = identificarHasta > 0;
  useEffect(() => {
    if (!identificarHasta) return;
    const id = setTimeout(() => setIdentificarHasta(0), Math.max(identificarHasta - Date.now(), 0));
    return () => clearTimeout(id);
  }, [identificarHasta]);

  if (!placa) return null;

  return (
    <div className={giro ? `cartel-fondo cartel-rotado-${giro}` : "cartel-fondo"}>
      {/* Con sección, el color fuerte va en la franja de arriba y no en toda la
          placa: un fondo rojo a pantalla completa cansa la vista y le come
          protagonismo al precio. */}
      <div
        className={
          "cartel-marco" +
          // En modo captura no hay movimiento: el generador saca una foto fija,
          // y una animación a medias quedaría congelada en el PNG.
          (modoCaptura ? " cartel-captura" : "") +
          (saliendo ? " cartel-saliendo" : "")
        }
        style={{
          // El zoom de la foto dura lo mismo que la placa.
          ["--dur" as string]: `${duracionMs(placa)}ms`,
          background:
            // Negro detrás de un cartel ajeno: el azul de la marca chocaría con
            // el color que traiga la imagen.
            placa.tipo === "imagen" || placa.tipo === "video" ? "#000" : placa.seccion ? FONDO_BASE : placa.color || NAVY,
        }}
        data-placa={placa.id}
        data-total={placas.length}
        data-duracion={duracionMs(placa)}
        // El TV compara esto con lo que devuelve el servidor para saber si hay versión nueva.
        data-version={version ?? undefined}
      >
        {/* El encabezado hace de franja de sección: pintado con el color del
            sector, dice desde lejos si lo que se muestra es de carnicería o de
            verdulería. Sin sección se comporta como antes. */}
        {/* El video y el cartel ya diseñado van a pantalla completa, sin franja ni pie. */}
        {placa.tipo !== "imagen" && placa.tipo !== "video" && (
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
          <PlacaVista
            key={`${placa.id}:${posicion}:${vuelta}`}
            placa={placa}
            onFin={modoCaptura ? undefined : terminarVideo}
            quieto={modoCaptura}
          />
        </main>

        {/* El pie marca cuánto falta para la próxima placa. En el video el corte
            lo hace el propio video, así que una barra quieta solo confunde. */}
        {!modoCaptura && placa.tipo !== "imagen" && placa.tipo !== "video" && (
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

        {identificando && pantallaViva && (
          <div className="cartel-identificar" data-test="identificar">
            <span className="cartel-identificar-dato">Este televisor es</span>
            <span className="cartel-identificar-nombre">{pantallaViva.nombre}</span>
            <span className="cartel-identificar-dato">
              {pantallaViva.seccion ? `Muestra ${pantallaViva.seccion}` : "Muestra todas las secciones"}
            </span>
          </div>
        )}
      </div>

      {/* Fuera del marco a propósito: no gira, así que se lee aunque la tele
          esté parada y la placa salga de costado. */}
      {vistaGeneral && !modoCaptura && (
        <div className="cartel-aviso-general" data-test="aviso-vista-general">
          Vista general: no gira ni sabe qué tele es. Para un televisor del local abrí <strong>/tv</strong>
        </div>
      )}

      {/* Video mínimo en loop, casi invisible: un TV que reproduce video no pone
          el protector de pantalla. Respaldo del pedido de pantalla prendida. */}
      {!modoCaptura && (
        <video
          className="cartel-despierto"
          src="/cartel/despierto.webm"
          muted
          loop
          autoPlay
          playsInline
          aria-hidden="true"
        />
      )}
    </div>
  );
}
