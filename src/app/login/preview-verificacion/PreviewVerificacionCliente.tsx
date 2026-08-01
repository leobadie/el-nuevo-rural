"use client";

import { useState } from "react";
import VerificacionTab from "@/app/cheques/tabs/VerificacionTab";
import BloqueQuienEs from "@/app/cheques/tabs/BloqueQuienEs";
import type { ResultadoRegistro } from "@/lib/registros/consulta";

/*
 * Banco de pruebas de la pestaña Verificación. A diferencia del calendario, acá no hay datos
 * ficticios: las consultas van contra la API real del BCRA. El botón de abajo simula lo que
 * hace "Verificar" desde Cheques de Terceros (montar la pestaña con un CUIT ya cargado).
 * El CUIT usado es el de YPF, que es información pública.
 */
const CUIT_DE_PRUEBA = "30546689979";

/*
 * El bloque "quién está detrás" sale de tablas propias que se cargan con
 * scripts/importar-registros.mjs y que RLS solo le muestra a un usuario activo. Esta página es
 * pública y no tiene sesión, así que arriba el bloque no se muestra: con la lista vacía que
 * devuelve RLS no se puede distinguir un CUIT ausente de uno que no se puede ver. Por eso acá
 * abajo se rinde con datos de muestra, para poder verificar los cuatro casos, sobre todo los
 * tres en los que NO hay personas: son los que tienen que explicar por qué faltan en vez de
 * dar a entender que la sociedad no tiene socios.
 *
 * Los datos son de estructura real (una S.A. porteña con su directorio); los documentos están
 * cambiados porque acá no hace falta que sean de nadie.
 */
const CASOS: Array<{ titulo: string; cuit: string; registro: ResultadoRegistro }> = [
  {
    titulo: "Sociedad de CABA con personas registradas",
    cuit: "30707512292",
    registro: {
      estado: "ok",
      sociedad: {
        cuit: "30707512292",
        razon_social: "ACQUAGAS S.A.",
        tipo_societario: "SOCIEDAD ANONIMA",
        fecha_contrato: "2005-03-01",
        provincia: "CIUDAD AUTONOMA BUENOS AIRES",
        localidad: "CAPITAL FEDERAL",
        actividad: "VENTA AL POR MAYOR DE COMBUSTIBLES",
        periodo_fuente: "202604",
      },
      personas: [
        { nombre: "PONTORIERO, MARIA", rol: "S", tipo_documento: "DNI", numero_documento: "20000001" },
        { nombre: "FEROLETO, TOMAS", rol: "S", tipo_documento: "DNI", numero_documento: "20000002" },
        { nombre: "ALVAREZ, HORACIO RAUL", rol: "A", tipo_documento: "DNI", numero_documento: "20000003" },
        { nombre: "GARCIA, LUCIA", rol: "R", tipo_documento: "DNI", numero_documento: "20000004" },
      ],
    },
  },
  {
    titulo: "Sociedad del interior: hay datos de empresa, no de personas",
    cuit: "30712345670",
    registro: {
      estado: "ok",
      sociedad: {
        cuit: "30712345670",
        razon_social: "CEREALERA DEL CENTRO S.R.L.",
        tipo_societario: "SOCIEDAD DE RESPONSABILIDAD LIMITADA",
        fecha_contrato: "2013-09-20",
        provincia: "CORDOBA",
        localidad: "RIO CUARTO",
        actividad: "VENTA AL POR MAYOR DE CEREALES",
        periodo_fuente: "202604",
      },
      personas: [],
    },
  },
  {
    titulo: "CUIT que no figura en el registro de sociedades",
    cuit: "30999999994",
    registro: { estado: "ok", sociedad: null, personas: [] },
  },
  {
    titulo: "CUIL de persona física",
    cuit: "20123456783",
    registro: { estado: "ok", sociedad: null, personas: [] },
  },
];

export default function PreviewVerificacionCliente() {
  const [cuitInicial, setCuitInicial] = useState("");

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, margin: "0 auto", padding: 20, background: "white", color: "#1A1A2E" }}>
      <button
        data-testid="btn-simular-verificar-librador"
        onClick={() => setCuitInicial(CUIT_DE_PRUEBA)}
        style={{ marginBottom: 16, border: "1px solid #1F3864", background: "white", color: "#1F3864", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
      >
        Simular &quot;Verificar librador&quot; con un CUIT precargado
      </button>
      <VerificacionTab key={cuitInicial} cuitInicial={cuitInicial} />

      <div data-testid="casos-quien-es" style={{ marginTop: 32, borderTop: "2px dashed #ccc", paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1F3864", marginBottom: 4 }}>
          Bloque &quot;quién está detrás&quot; con datos de muestra
        </div>
        <div style={{ fontSize: 11, color: "#777", marginBottom: 16 }}>
          Se rinde acá aparte porque esta página no tiene sesión: los datos están cargados en la
          base, pero RLS solo se los muestra a un usuario activo, así que arriba el bloque se
          calla en vez de afirmar que el CUIT no figura. Son los cuatro casos que tiene que
          resolver.
        </div>
        {CASOS.map((c) => (
          <div key={c.cuit} data-testid={`caso-${c.cuit}`} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 4 }}>{c.titulo}</div>
            <BloqueQuienEs cuit={c.cuit} registro={c.registro} />
          </div>
        ))}
      </div>
    </div>
  );
}
