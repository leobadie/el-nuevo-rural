/*
 * Verificación del parseo de los registros de sociedades y del armado del bloque.
 * Uso: npm run verificar:registros  (no necesita la app corriendo ni la base cargada)
 *
 * Las filas de ejemplo son textuales de los CSV oficiales de 202606, incluidos sus defectos:
 * comas dentro de campos sin comillas, comillas sueltas, BOM y personas repetidas.
 */
import {
  quitarBom,
  partirCsv,
  comillasAbiertas,
  filasDeCsv,
  fechaDeRegistro,
  sociedadDesdeFila,
  entidadIgjDesdeFila,
  personaIgjDesdeFila,
  limpiarNombre,
  clavePersona,
} from "../src/lib/registros/parseo.ts";
import { esTablaInexistente } from "../src/lib/registros/errores.ts";
import {
  antiguedadEnAnios,
  armarBloqueSociedad,
  ordenarPersonas,
  periodoLegible,
  domicilioLegible,
} from "../src/lib/registros/sociedad.ts";

let fallos = 0;
function ok(cond: boolean, desc: string, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

console.log("=== R5.2 — Defectos reales de los archivos ===");
{
  ok(quitarBom("﻿numero_correlativo,tipo") === "numero_correlativo,tipo",
    "Saca el BOM del inicio");
  ok(quitarBom("sin bom") === "sin bom", "Sin BOM no toca nada");

  // Fila textual del registro nacional: la calle lleva coma y va entrecomillada.
  const linea = '30500000127,SEGUROS GALICIA S. A.,1912-04-30-00:00,SOCIEDAD ANONIMA,2026-03-25-15:12,,CIUDAD AUTONOMA BUENOS AIRES,CAPITAL FEDERAL,"PERON, JUAN TTE.GRAL.",430,6,, 1038,DECLARADO POR INTERNET,CIUDAD AUTONOMA BUENOS AIRES,CAPITAL FEDERAL,"GRIERSON,CECILIA BOULEVARD",255,1,, 1107,DECLARADO,,,,,';
  const campos = partirCsv(linea);
  ok(campos[8] === "PERON, JUAN TTE.GRAL.", "La coma dentro de comillas no parte el campo",
    campos[8]);
  ok(campos[1] === "SEGUROS GALICIA S. A.", "Los campos siguientes no se corren", campos[1]);

  // Fila textual de igj-entidades-202606.csv: la razón social tiene DOS comas.
  const e = entidadIgjDesdeFila(
    '67218,40,SOCIEDAD DE RESPONSABILIDAD LIMITADA,"GARCIA,NIMO,COBAS Y CIA.",,,,33501164149',
  );
  ok(e?.razonSocial === "GARCIA,NIMO,COBAS Y CIA.",
    "Razón social con comas queda entera", e?.razonSocial);
  ok(e?.cuit === "33501164149",
    "Y el CUIT no se corre: partir por comas daría un campo vacío acá", e?.cuit);

  // Fila textual de igj-autoridades-202606.csv.
  const p = personaIgjDesdeFila(
    '60,"ALVAREZ, HORACIO RAUL",S,SOCIO,1,DOCUMENTO NACIONAL DE IDENTIDAD,10260149,',
  );
  ok(p?.nombre === "ALVAREZ, HORACIO RAUL", "Nombre con coma queda entero", p?.nombre);
  ok(p?.numeroDocumento === "10260149", "El documento no se corre", p?.numeroDocumento);
  ok(p?.rol === "S", "El rol se lee bien", p?.rol);
  ok(personaIgjDesdeFila("44,SIN ROL VALIDO,X,COSA,1,DNI,123,") === null,
    "Una fila con un rol desconocido se descarta");

  ok(limpiarNombre('"ALVAREZ  HORACIO   RAUL') === "ALVAREZ HORACIO RAUL",
    "Limpia comillas sueltas y espacios de más", limpiarNombre('"ALVAREZ  HORACIO   RAUL'));
}

console.log("\n=== R5.2 — Razón social partida en dos líneas ===");
{
  /* Caso real de igj-entidades-202606.csv: el único defecto que queda en 1.070.756 filas es
     un salto de línea adentro del campo entrecomillado, que parte el registro en dos. */
  const partida = [
    "2013461,52,SOCIEDAD POR ACCIONES SIMPLIFICADA,\"SIC-SERVICIOS INTEGRALES DE CONSTRUCCION Y ",
    'DISEÑO",,,,30716099999',
    "10,10,SOCIEDAD COLECTIVA,NORMAL,,,,30500000127",
  ];
  ok(comillasAbiertas(partida[0]), "Detecta la comilla sin cerrar");
  ok(!comillasAbiertas(partida[2]), "Una línea completa no queda pendiente");
  ok(!comillasAbiertas('dice ""algo"" entre comillas dobles'),
    "Las comillas escapadas no cuentan como abiertas");

  const filas: string[] = [];
  for await (const f of filasDeCsv(partida)) filas.push(f);
  ok(filas.length === 2, "Las dos líneas rotas se juntan en una fila", `${filas.length} filas`);
  const e = entidadIgjDesdeFila(filas[0]);
  ok(e?.cuit === "30716099999", "El registro partido se recupera entero", e?.cuit);
  ok((e?.razonSocial ?? "").includes("DISEÑO"),
    "Con el nombre completo de las dos líneas", e?.razonSocial);
}

console.log("\n=== Fechas del registro (vienen con la hora pegada) ===");
{
  ok(fechaDeRegistro("1912-04-30-10:43") === "1912-04-30", "Toma solo la fecha",
    String(fechaDeRegistro("1912-04-30-10:43")));
  ok(fechaDeRegistro("") === null, "Vacío da null");
  ok(fechaDeRegistro("no es fecha") === null, "Basura da null");
  ok(fechaDeRegistro("2026-13-45-00:00") === null, "Mes o día imposible da null");
}

console.log("\n=== Sociedad desde una fila real ===");
{
  const linea = '30500000127,SEGUROS GALICIA S. A.,1912-04-30-00:00,SOCIEDAD ANONIMA,2026-03-25-15:12,,CIUDAD AUTONOMA BUENOS AIRES,CAPITAL FEDERAL,"PERON, JUAN TTE.GRAL.",430,6,, 1038,DECLARADO POR INTERNET,CIUDAD AUTONOMA BUENOS AIRES,CAPITAL FEDERAL,"GRIERSON,CECILIA BOULEVARD",255,1,, 1107,DECLARADO,,,,,';
  const s = sociedadDesdeFila(linea);
  ok(s?.cuit === "30500000127", "CUIT", s?.cuit);
  ok(s?.razonSocial === "SEGUROS GALICIA S. A.", "Razón social", s?.razonSocial);
  ok(s?.tipoSocietario === "SOCIEDAD ANONIMA", "Tipo societario", s?.tipoSocietario);
  ok(s?.fechaContrato === "1912-04-30", "Fecha del contrato social", String(s?.fechaContrato));
  ok(s?.provincia === "CIUDAD AUTONOMA BUENOS AIRES", "Provincia del domicilio legal", s?.provincia);
  ok(sociedadDesdeFila("basura,sin,cuit") === null, "Una fila sin CUIT válido se descarta");
}

console.log("\n=== DR3 — Deduplicación de personas ===");
{
  // Caso real: la misma persona con el nombre escrito de dos formas.
  const a = clavePersona("30707512292", "A", "18089629");
  const b = clavePersona("30707512292", "A", "18089629");
  ok(a === b, "El documento identifica a la persona, no el nombre");
  ok(clavePersona("30707512292", "S", "18089629") !== a,
    "La misma persona con otro rol se cuenta aparte");
}

console.log("\n=== R1.2 — Antigüedad ===");
{
  const hoy = new Date("2026-07-30T12:00:00");
  ok(antiguedadEnAnios("2000-01-15", hoy) === 26, "Cumplió años este año",
    String(antiguedadEnAnios("2000-01-15", hoy)));
  ok(antiguedadEnAnios("2000-12-15", hoy) === 25, "Todavía no los cumplió",
    String(antiguedadEnAnios("2000-12-15", hoy)));
  ok(antiguedadEnAnios("2026-07-30", hoy) === 0, "Constituida hoy: 0 años",
    String(antiguedadEnAnios("2026-07-30", hoy)));
  ok(antiguedadEnAnios(null, hoy) === null, "Sin fecha, sin antigüedad");
}

console.log("\n=== R2.2 — Orden de las personas ===");
{
  const orden = ordenarPersonas([
    { nombre: "ZAPATA REP", rol: "R", tipo_documento: null, numero_documento: null },
    { nombre: "PEREZ AUT", rol: "A", tipo_documento: null, numero_documento: null },
    { nombre: "BENITEZ SOCIO", rol: "S", tipo_documento: null, numero_documento: null },
    { nombre: "ALVAREZ AUT", rol: "A", tipo_documento: null, numero_documento: null },
  ]);
  ok(orden.map((p) => p.rol).join("") === "SAAR", "Socios, después autoridades, después representantes",
    orden.map((p) => p.rol).join(""));
  ok(orden[1].nombre === "ALVAREZ AUT", "Dentro del mismo rol, por nombre", orden[1].nombre);
}

const SOC_CABA = {
  cuit: "30707512292", razon_social: "ACQUAGAS", tipo_societario: "SOC. ANONIMA",
  fecha_contrato: "2005-03-01", provincia: "CIUDAD AUTONOMA BUENOS AIRES",
  localidad: "CAPITAL FEDERAL", actividad: "GAS", periodo_fuente: "202606",
};
const SOC_CORDOBA = { ...SOC_CABA, cuit: "30712345678", provincia: "CORDOBA", localidad: "RIO CUARTO" };

console.log("\n=== R3 — Lo que se dice cuando NO hay personas ===");
{
  const cordoba = armarBloqueSociedad("30712345678", SOC_CORDOBA, []);
  ok(cordoba.motivoSinPersonas === "sociedadDeOtraProvincia",
    "Sociedad de otra provincia se identifica como tal", String(cordoba.motivoSinPersonas));
  ok(/CORDOBA/.test(cordoba.explicacion), "Nombra la provincia", cordoba.explicacion.slice(0, 60));
  ok(/no significa que la sociedad no tenga socios/i.test(cordoba.explicacion),
    "R3.1: dice explícitamente que no significa que no tenga socios");
  ok(/Ciudad de Buenos Aires/i.test(cordoba.explicacion),
    "Explica que el registro con datos abiertos es el de CABA");

  const sinSociedad = armarBloqueSociedad("30712345678", null, []);
  ok(sinSociedad.motivoSinPersonas === "noEstaLaSociedad", "CUIT que no figura en el registro",
    String(sinSociedad.motivoSinPersonas));
  ok(/no quiere decir que la empresa no exista/i.test(sinSociedad.explicacion),
    "R3.3: no presenta la ausencia como un resultado");

  const caba = armarBloqueSociedad("30707512292", SOC_CABA, []);
  ok(caba.motivoSinPersonas === "sinRegistro",
    "Sociedad de CABA sin personas publicadas", String(caba.motivoSinPersonas));
  ok(/accionistas/i.test(caba.explicacion), "R3.2: aclara lo de los accionistas");

  const persona = armarBloqueSociedad("20123456783", null, []);
  ok(persona.motivoSinPersonas === "esPersonaFisica", "R4.1: CUIL de persona física",
    String(persona.motivoSinPersonas));
  ok(/no hay padrón público de personas físicas/i.test(persona.explicacion),
    "R4.1: dice que no hay padrón público de personas");
}

console.log("\n=== Con personas, no se inventa ninguna advertencia ===");
{
  const con = armarBloqueSociedad("30707512292", SOC_CABA, [
    { nombre: "FEROLETO MARIO FRANCISCO", rol: "A", tipo_documento: "DNI", numero_documento: "18089629" },
    { nombre: "PONTORIERO MARIA", rol: "S", tipo_documento: "DNI", numero_documento: "93472207" },
  ]);
  ok(con.motivoSinPersonas === null, "No hay motivo de ausencia", String(con.motivoSinPersonas));
  ok(con.personas[0].rol === "S", "El socio va primero", con.personas[0].nombre);
  ok(/accionistas/i.test(con.explicacion),
    "Igual aclara qué son estas personas y qué no es público");
}

console.log("\n=== Presentación ===");
{
  ok(periodoLegible("202606") === "junio de 2026", "Período legible", periodoLegible("202606"));
  ok(periodoLegible(null) === "", "Sin período, vacío");
  ok(periodoLegible("abc") === "", "Período inválido, vacío");
  ok(domicilioLegible(SOC_CORDOBA) === "RIO CUARTO, CORDOBA", "Domicilio legible",
    domicilioLegible(SOC_CORDOBA));
  ok(domicilioLegible({ ...SOC_CABA, provincia: null, localidad: null }) === "",
    "Sin domicilio, vacío");
}

console.log("\n=== R3.5 — Dónde sí se pueden consultar las personas ===");
{
  const cordoba = armarBloqueSociedad("30712345670", SOC_CORDOBA, []);
  ok(cordoba.consultaProvincial?.provincia === "CORDOBA",
    "Una sociedad de Córdoba ofrece la consulta de la IPJ",
    cordoba.consultaProvincial?.organismo ?? "ninguna");
  ok(/tramitesipj\.cba\.gov\.ar/.test(cordoba.consultaProvincial?.url ?? ""),
    "Con la dirección del portal de trámites", cordoba.consultaProvincial?.url ?? "");
  ok(/CiDi/i.test(cordoba.consultaProvincial?.detalle ?? ""),
    "Y avisa que hace falta CiDi, para no mandar a nadie a una puerta cerrada");
  ok(/gratuita|sin costo/i.test(cordoba.consultaProvincial?.detalle ?? ""),
    "Aclara que no cuesta nada");

  // Provincias sin servicio conocido: no se inventa un enlace.
  const otra = armarBloqueSociedad("30712345670", { ...SOC_CORDOBA, provincia: "LA PAMPA" }, []);
  ok(otra.consultaProvincial === null, "Una provincia sin consulta conocida no ofrece ninguna",
    String(otra.consultaProvincial));
  ok(otra.motivoSinPersonas === "sociedadDeOtraProvincia",
    "Pero igual explica por qué faltan las personas");

  // Con personas no hay nada que ir a buscar afuera.
  const conPersonas = armarBloqueSociedad("30707512292", SOC_CABA, [
    { nombre: "PEREZ, JUAN", rol: "S", tipo_documento: "DNI", numero_documento: "20000001" },
  ]);
  ok(conPersonas.consultaProvincial === null,
    "Con las personas a la vista no manda a consultar a ningún lado");
}

console.log("\n=== Tablas todavía no cargadas ===");
{
  /*
   * Medido contra la base real antes de correr la migración 009: PostgREST contesta 404 con
   * PGRST205, no con el 42P01 de Postgres. Reconocer solo el de Postgres hacía que la pantalla
   * mostrara en rojo "No se pudo consultar el registro de sociedades", que se lee como una
   * falla cuando lo único que pasa es que el dato todavía no se cargó.
   */
  ok(esTablaInexistente("PGRST205"), "El 404 de PostgREST es 'todavía no está cargado'");
  ok(esTablaInexistente("42P01"), "El código de Postgres también");
  ok(!esTablaInexistente("PGRST301"), "Un error de permisos NO se disfraza de tabla ausente");
  ok(!esTablaInexistente(undefined), "Un error sin código tampoco");
}

console.log("\n=== Filas normales, que son la enorme mayoría ===");
{
  const normal = partirCsv("10,10,SOCIEDAD COLECTIVA,A A VALLE Y COMPANIA,,,,30500000127");
  ok(normal.length === 8, "Quedan los 8 campos", String(normal.length));
  ok(normal[3] === "A A VALLE Y COMPANIA", "Razón social intacta", normal[3]);
  ok(entidadIgjDesdeFila("10,10,SOCIEDAD COLECTIVA,SIN CUIT,,,,")  === null,
    "Una entidad sin CUIT se descarta: no hay forma de llegar a ella desde un cheque");
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLOS`}`);
process.exit(fallos === 0 ? 0 : 1);
