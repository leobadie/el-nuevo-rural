// Pruebas de src/lib/tienda/formato.ts. Correr: npm run verificar:tienda-formato
import assert from "node:assert/strict";
import {
  formatoPrecio,
  sufijoPrecio,
  porcentajeDescuento,
  nombreLindo,
  normalizar,
  pasoGramos,
  formatoPeso,
  subtotalCentavos,
  leerPresentacion,
  precioPorMedida,
} from "../src/lib/tienda/formato.ts";

let n = 0;
function caso(nombre: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok  ${nombre}`);
}

// Intl en es-AR usa espacio fino / punto según la versión: comparamos sin espacios raros.
const plano = (s: string) => s.replace(/ | /g, " ");

caso("precio entero con separador de miles", () => assert.equal(plano(formatoPrecio(222500)), "$ 2.225"));
caso("precio con centavos (Amargo a 159,9)", () => assert.equal(plano(formatoPrecio(15990)), "$ 159,90"));
caso("precio grande", () => assert.equal(plano(formatoPrecio(5299000)), "$ 52.990"));
caso("sufijo /kg sólo para kg", () => {
  assert.equal(sufijoPrecio("kg"), "/kg");
  assert.equal(sufijoPrecio("unidad"), "");
});

caso("descuento redondea hacia abajo", () => assert.equal(porcentajeDescuento(280000, 379000), 26));
caso("sin precio anterior no hay descuento", () => assert.equal(porcentajeDescuento(1000, null), null));
caso("anterior menor o igual no es descuento", () => assert.equal(porcentajeDescuento(1000, 1000), null));

caso("MAYÚSCULAS pasan a tipo oración", () => assert.equal(nombreLindo("ACEITE DE GIRASOL"), "Aceite de girasol"));
caso("con acentos y Ñ", () => assert.equal(nombreLindo("JAMÓN CRUDO LA PEQUEÑA"), "Jamón crudo la pequeña"));
caso("nombre ya prolijo no se toca", () => assert.equal(nombreLindo("Aceite de girasol"), "Aceite de girasol"));
caso("mezcla con minúsculas no se toca", () => assert.equal(nombreLindo("Leche UHT entera"), "Leche UHT entera"));
caso("espacios de más", () => assert.equal(nombreLindo("  ARROZ   NO SE PASA "), "Arroz no se pasa"));
caso("siglas quedan en mayúscula", () => assert.equal(nombreLindo("LECHE UHT"), "Leche UHT"));
caso("sólo números no cambia", () => assert.equal(nombreLindo("7790"), "7790"));

caso("normalizar saca acentos", () => assert.equal(normalizar("Azúcar Común"), "azucar comun"));
caso("normalizar conserva ñ? (NFD la separa: queda n)", () => assert.equal(normalizar("Cañuelas"), "canuelas"));

caso("paso fino en fiambres", () => assert.equal(pasoGramos("Fiambres y quesos"), 100));
caso("paso de 250 en carnicería", () => assert.equal(pasoGramos("Carnicería"), 250));
caso("paso de 250 sin categoría", () => assert.equal(pasoGramos(null), 250));

caso("peso en gramos", () => assert.equal(formatoPeso(0.5), "500 g"));
caso("peso en kilos con coma", () => assert.equal(formatoPeso(1.25), "1,25 kg"));
caso("un kilo", () => assert.equal(formatoPeso(1), "1 kg"));
caso("cuarto kilo sin decimales flotantes", () => assert.equal(formatoPeso(0.1 + 0.15), "250 g"));

caso("subtotal por unidad", () => assert.equal(subtotalCentavos(222500, 2, false), 445000));
caso("subtotal pesable 500 g a $14.990/kg", () => assert.equal(subtotalCentavos(1499000, 0.5, true), 749500));
caso("subtotal pesable redondea al peso", () => assert.equal(subtotalCentavos(1499000, 0.333, true), 499200));

caso("presentación en cc", () => assert.deepEqual(leerPresentacion("1x1500 cc"), { cantidad: 1500, unidad: "ml" }));
caso("presentación en litros con punto", () => assert.deepEqual(leerPresentacion("1x1.5 Lts"), { cantidad: 1500, unidad: "ml" }));
caso("presentación en gramos", () => assert.deepEqual(leerPresentacion("1x120 grs"), { cantidad: 120, unidad: "g" }));
caso("presentación en Kgr", () => assert.deepEqual(leerPresentacion("1x1 Kgr"), { cantidad: 1000, unidad: "g" }));
caso("presentación en unidades", () => assert.deepEqual(leerPresentacion("1x4 Un"), { cantidad: 4, unidad: "un" }));
caso("presentación ilegible", () => assert.equal(leerPresentacion("1xunid Un"), null));
caso("presentación vacía", () => assert.equal(leerPresentacion(""), null));

caso("$/kg directo para lo que va por kg", () =>
  assert.deepEqual(precioPorMedida(1499000, "kg", "1x1 Kgr"), { centavos: 1499000, medida: "kg" }));
// El precio por medida es de referencia y va redondeado al peso entero.
caso("$/litro de aceite 1,5 L a $7.600 → $ 5.067", () =>
  assert.deepEqual(precioPorMedida(760000, "unidad", "1x1500 cc"), { centavos: 506700, medida: "litro" }));
caso("$/kg de aerosol 120 g a $4.450 → $ 37.083", () =>
  assert.deepEqual(precioPorMedida(445000, "unidad", "1x120 grs"), { centavos: 3708300, medida: "kg" }));
caso("precio por medida sin centavos sueltos", () =>
  assert.equal(precioPorMedida(15990, "unidad", "1x1.35 Lts")!.centavos % 100, 0));
caso("unidades sueltas no llevan precio por medida", () => assert.equal(precioPorMedida(30000, "unidad", "1x1 Un"), null));

console.log(`\n${n} casos, todos bien`);
