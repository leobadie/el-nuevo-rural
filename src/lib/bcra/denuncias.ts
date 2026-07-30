/*
 * Interpretación de la consulta de cheques denunciados del BCRA.
 *
 * El endpoint /cheques/v1.0/denunciados/{entidad}/{nroCheque} NO responde "tu cheque está
 * denunciado". Busca ese número en todas las cuentas del banco y devuelve una denuncia por
 * cada cuenta que denunció el suyo. Medido contra la API real del Banco Nación: el cheque
 * número 1 devuelve 229 denuncias, de 229 chequeras distintas.
 *
 * Un cheque se identifica por banco + cuenta + número. Sin la cuenta, el resultado no puede
 * ser un veredicto: es una lista de candidatos. Este módulo hace esa distinción explícita.
 */

import type { ChequeDenunciado, DenunciaCheque } from "./api";

export type NivelDenuncia = "limpio" | "otrasCuentas" | "indeterminado" | "posible" | "denunciado";

export interface VeredictoDenuncia {
  nivel: NivelDenuncia;
  titulo: string;
  detalle: string;
  /** Cantidad de denuncias registradas para ese número en ese banco. */
  total: number;
  /**
   * Denuncias que coinciden con la cuenta consultada. Solo estas se muestran: las de otras
   * cuentas no son este cheque y, listadas, tapan el veredicto (son hasta 229).
   */
  coincidencias: DenunciaCheque[];
  /** Contexto al pie, en letra chica: qué hay registrado de ese número en otras cuentas. */
  nota: string;
}

/** Deja solo los dígitos: los números de cuenta se escriben con guiones, barras y espacios. */
export function normalizarCuenta(texto: string): string {
  return (texto ?? "").replace(/\D/g, "");
}

type Coincidencia = "exacta" | "parcial" | "no";

/**
 * La sucursal a veces va como prefijo de la cuenta (sucursal 89 → cuenta 890036218), así que
 * alguien puede tipear solo la parte final. Esa coincidencia por sufijo no alcanza para
 * afirmar que es el mismo cheque, pero tampoco para descartarlo: se informa como posible.
 * El mínimo de 6 dígitos evita que un "0016" haga match con media chequera del país.
 */
function comparar(cuentaTipeada: string, cuentaDenunciada: string): Coincidencia {
  if (!cuentaTipeada || !cuentaDenunciada) return "no";
  if (cuentaTipeada === cuentaDenunciada) return "exacta";
  const corta = cuentaTipeada.length < cuentaDenunciada.length ? cuentaTipeada : cuentaDenunciada;
  const larga = cuentaTipeada.length < cuentaDenunciada.length ? cuentaDenunciada : cuentaTipeada;
  if (corta.length >= 6 && larga.endsWith(corta)) return "parcial";
  return "no";
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function evaluarDenuncia(
  cheque: ChequeDenunciado,
  cuentaTexto: string,
): VeredictoDenuncia {
  const detalles = cheque.detalles ?? [];
  const total = detalles.length;
  const banco = cheque.denominacionEntidad;
  const cuenta = normalizarCuenta(cuentaTexto);

  /* Sin cuenta no se puede responder por un cheque en particular. La pantalla ya la exige,
     así que esto es una salvaguarda: que un llamado sin cuenta nunca pueda dar "limpio". */
  if (!cuenta) {
    return {
      nivel: "indeterminado",
      titulo: "Falta el número de cuenta",
      detalle:
        `El número de cheque se repite en cada chequera del banco, así que sin la cuenta no ` +
        `se puede saber si la denuncia es la de este cheque. Cargá el número de cuenta.`,
      total,
      coincidencias: [],
      nota: "",
    };
  }

  const exactas: number[] = [];
  const parciales: number[] = [];
  detalles.forEach((d, i) => {
    const c = comparar(cuenta, normalizarCuenta(String(d.numeroCuenta ?? "")));
    if (c === "exacta") exactas.push(i);
    else if (c === "parcial") parciales.push(i);
  });

  if (exactas.length > 0) {
    const primera = detalles[exactas[0]];
    const causal = typeof primera.causal === "string" ? primera.causal : "denunciado";
    return {
      nivel: "denunciado",
      titulo: "DENUNCIADO: no lo aceptes",
      detalle:
        `La cuenta ${primera.numeroCuenta ?? cuenta} de ${banco} denunció el cheque ` +
        `N° ${cheque.numeroCheque}. Causal: ${causal}.`,
      total,
      coincidencias: exactas.map((i) => detalles[i]),
      nota: "",
    };
  }

  if (parciales.length > 0) {
    return {
      nivel: "posible",
      titulo: "Revisá el número de cuenta",
      detalle:
        `Lo que cargaste coincide con el final de ${
          parciales.length === 1
            ? "una cuenta que denunció este número"
            : `${parciales.length} cuentas que denunciaron este número`
        }, pero no con la cuenta completa. Si el cheque es de esa cuenta, está denunciado: ` +
        `compará el número entero antes de aceptarlo.`,
      total,
      coincidencias: parciales.map((i) => detalles[i]),
      nota: "",
    };
  }

  // El cruce se hizo y no dio: para este cheque, el veredicto es limpio.
  const otras = total - exactas.length - parciales.length;
  return {
    nivel: total === 0 ? "limpio" : "otrasCuentas",
    titulo: "Cheque limpio",
    detalle:
      `La cuenta ${cuentaTexto.trim()} de ${banco} no denunció el cheque ` +
      `N° ${cheque.numeroCheque}.`,
    total,
    coincidencias: [],
    nota:
      otras > 0
        ? `Hay ${plural(otras, "denuncia", "denuncias")} de ese número en otras chequeras del ` +
          `banco. No son este cheque: el número se repite en cada chequera.`
        : "",
  };
}

/** Colores del recuadro según el nivel, en la misma paleta del módulo. */
export const COLORES_DENUNCIA: Record<NivelDenuncia, { fondo: string; texto: string }> = {
  limpio: { fondo: "#D5F5E3", texto: "#145A32" },
  otrasCuentas: { fondo: "#D5F5E3", texto: "#145A32" },
  indeterminado: { fondo: "#FCF3CF", texto: "#7D6608" },
  posible: { fondo: "#FDEBD0", texto: "#7E5109" },
  denunciado: { fondo: "#FADBD8", texto: "#922B21" },
};
