/*
 * Validación de CUIT / CUIL / CDI.
 *
 * Son 11 dígitos: 2 de tipo, 8 de número y 1 verificador. El verificador sale de una suma
 * ponderada de los primeros 10 dígitos con los multiplicadores 5,4,3,2,7,6,5,4,3,2.
 */

const MULTIPLICADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Deja solo los dígitos: acepta "30-54668997-9", "30 54668997 9" o "30546689979". */
export function normalizarCuit(valor: string): string {
  return (valor || "").replace(/\D/g, "");
}

export type ResultadoCuit =
  | { valido: true; cuit: string }
  | { valido: false; motivo: string };

export function validarCuit(valor: string): ResultadoCuit {
  const digitos = normalizarCuit(valor);
  if (digitos.length === 0) return { valido: false, motivo: "Escribí un CUIT o CUIL." };
  if (digitos.length !== 11) {
    return {
      valido: false,
      motivo: `Un CUIT tiene 11 dígitos y escribiste ${digitos.length}.`,
    };
  }
  const esperado = digitoVerificador(digitos);
  if (esperado === null) {
    return { valido: false, motivo: "Ese número no corresponde a un CUIT válido." };
  }
  if (esperado !== Number(digitos[10])) {
    return {
      valido: false,
      motivo: "El último dígito no coincide: revisá si hay algún número mal tipeado.",
    };
  }
  return { valido: true, cuit: digitos };
}

/** Dígito verificador de los primeros 10 dígitos. null si el CUIT no puede existir. */
export function digitoVerificador(digitos: string): number | null {
  if (digitos.length < 10) return null;
  const suma = MULTIPLICADORES.reduce(
    (acc, mult, i) => acc + mult * Number(digitos[i]),
    0,
  );
  const resto = suma % 11;
  if (resto === 0) return 0;
  if (resto === 1) return null; // requeriría verificador 10: esos CUIT no se asignan
  return 11 - resto;
}

/** 30546689979 → 30-54668997-9 */
export function formatearCuit(valor: string): string {
  const d = normalizarCuit(valor);
  if (d.length !== 11) return valor;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** Los CUIT de persona física arrancan con 20, 23, 24 o 27; los de empresa con 30-34. */
export function tipoDeCuit(valor: string): "persona" | "empresa" | "otro" {
  const d = normalizarCuit(valor);
  const prefijo = d.slice(0, 2);
  if (["20", "23", "24", "27"].includes(prefijo)) return "persona";
  if (["30", "33", "34"].includes(prefijo)) return "empresa";
  return "otro";
}
