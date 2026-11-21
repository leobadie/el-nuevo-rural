// Pruebas de src/lib/tienda/pedido.ts: búsqueda, carrito y mensaje de WhatsApp.
// Correr: npm run verificar:tienda-pedido
import assert from "node:assert/strict";
import {
  buscar,
  reconciliar,
  leerCarrito,
  ponerCantidad,
  cantidadEn,
  mensajeWhatsapp,
  enlaceWhatsapp,
  explicarError,
  type ProductoPublico,
} from "../src/lib/tienda/pedido.ts";
import { normalizar } from "../src/lib/tienda/formato.ts";

let n = 0;
function caso(nombre: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok  ${nombre}`);
}

const prod = (c: string, n: string, extra: Partial<ProductoPublico> = {}): ProductoPublico => ({
  c, n, m: null, pr: null, k: null, kn: null, p: 100000, a: null, kg: false, f: false, ft: null,
  b: normalizar([n, extra.m, extra.pr].filter(Boolean).join(" ")), ...extra,
});

const CAT = [
  prod("1", "Leche entera", { m: "La Serenísima", pr: "1x1 Lts" }),
  prod("2", "Dulce de leche", { m: "Ilolay" }),
  prod("3", "Azúcar común", { m: "Ledesma", pr: "1x1 Kgr" }),
  prod("4", "Leche descremada", { m: "Sancor" }),
  prod("5", "Molleja", { kg: true, f: true, p: 3500000 }),
  prod("6", "Café molido", { m: "La Virginia" }),
];
const mapa = new Map(CAT.map((p) => [p.c, p]));

caso("buscar sin texto devuelve todo", () => assert.equal(buscar(CAT, "  ").length, CAT.length));
caso("sin acentos encuentra con acentos", () => assert.deepEqual(buscar(CAT, "azucar").map((p) => p.c), ["3"]));
caso("con acentos encuentra sin acentos", () => assert.deepEqual(buscar(CAT, "CAFÉ").map((p) => p.c), ["6"]));
caso("todas las palabras, en cualquier orden", () => assert.deepEqual(buscar(CAT, "ent leche").map((p) => p.c), ["1"]));
caso("busca también por marca", () => assert.deepEqual(buscar(CAT, "serenisima").map((p) => p.c), ["1"]));
caso("los que empiezan con la palabra van primero", () =>
  assert.deepEqual(buscar(CAT, "leche").map((p) => p.c), ["4", "1", "2"]));
caso("sin resultados", () => assert.equal(buscar(CAT, "zzz").length, 0));

caso("reconciliar: suma, saca lo que no está y marca aproximado", () => {
  const r = reconciliar([["1", 2], ["5", 0.5], ["99", 1]], mapa);
  assert.deepEqual(r.lineas.map((l) => [l.producto.c, l.cantidad, l.subtotal]), [["1", 2, 200000], ["5", 0.5, 1750000]]);
  assert.deepEqual(r.quitados, ["99"]);
  assert.equal(r.total, 1950000);
  assert.equal(r.aproximado, true);
});
caso("reconciliar corrige cantidades imposibles y respeta el orden de agregado", () => {
  const r = reconciliar([["1", 2.6], ["5", 40], ["4", 500]], mapa);
  assert.deepEqual(r.lineas.map((l) => [l.producto.c, l.cantidad]), [["1", 3], ["5", 10], ["4", 99]]);
});
caso("reconciliar ignora cantidades en cero", () => assert.equal(reconciliar([["1", 0]], mapa).lineas.length, 0));
caso("sólo por unidad no es aproximado", () => assert.equal(reconciliar([["1", 1]], mapa).aproximado, false));

caso("ponerCantidad: agrega al final, cambia en su lugar, 0 saca", () => {
  let c = ponerCantidad([], "5", 0.5);
  c = ponerCantidad(c, "1", 1);
  c = ponerCantidad(c, "5", 0.75);
  assert.deepEqual(c, [["5", 0.75], ["1", 1]]);
  assert.equal(cantidadEn(c, "5"), 0.75);
  assert.equal(cantidadEn(c, "9"), 0);
  assert.deepEqual(ponerCantidad(c, "5", 0), [["1", 1]]);
});

caso("leerCarrito tolera basura", () => {
  assert.deepEqual(leerCarrito(null), []);
  assert.deepEqual(leerCarrito("no es json"), []);
  assert.deepEqual(leerCarrito('{"1":2}'), []);
  assert.deepEqual(
    leerCarrito('[["1",2],["2","x"],["3",-1],[4,1],["5",0.5],["1",9],"basura"]'),
    [["1", 2], ["5", 0.5]],
  );
});

const PEDIDO = {
  numero: 123,
  nombre: "Ana",
  telefono: "3549123456",
  entrega: "envio" as const,
  direccion: "San Martín 450",
  forma_pago: "transferencia" as const,
  nota: "Tocar timbre",
  total_centavos: 2645000,
  total_aproximado: true,
  lineas: [
    { nombre: "ACEITE DE GIRASOL", marca: "Natura", presentacion: "1x1500 cc", fraccionable: false, cantidad: 2, subtotal_centavos: 1520000 },
    { nombre: "Molleja", marca: null, presentacion: "1x1 Kgr", fraccionable: true, cantidad: 0.5, subtotal_centavos: 1750000 },
  ],
};

caso("mensaje: número, líneas, total aproximado, entrega y datos", () => {
  const m = mensajeWhatsapp(PEDIDO);
  assert.equal(
    m,
    [
      "¡Hola! Quiero hacer este pedido (#123):",
      "",
      "• 2 × Aceite de girasol Natura 1x1500 cc — $ 15.200",
      "• 500 g Molleja — aprox. $ 17.500",
      "",
      "Envío: a confirmar",
      "*Total aproximado: $ 26.450*",
      "(los productos que se pesan se cobran según la balanza)",
      "",
      "Entrega: Envío a domicilio: San Martín 450",
      "Pago: Transferencia",
      "Nombre: Ana",
      "Teléfono: 3549123456",
      "Nota: Tocar timbre",
    ].join("\n"),
  );
});
caso("mensaje: retiro, sin nota y sin pesables", () => {
  const m = mensajeWhatsapp({ ...PEDIDO, entrega: "retiro", direccion: null, nota: null, total_aproximado: false, lineas: [PEDIDO.lineas[0]], total_centavos: 1520000 });
  assert.ok(m.includes("Entrega: Retiro en el local"));
  assert.ok(m.includes("*Total: $ 15.200*"));
  assert.ok(!m.includes("Nota:") && !m.includes("balanza"));
});
caso("mensaje (036): subtotal, costo de envío y total con envío", () => {
  const m = mensajeWhatsapp({ ...PEDIDO, subtotal_centavos: 3270000, costo_envio_centavos: 150000, envio_a_confirmar: false, total_centavos: 3420000 });
  assert.ok(m.includes("Subtotal: $ 32.700\nEnvío: $ 1.500\n*Total aproximado: $ 34.200*"), m);
});
caso("mensaje (036): envío gratis y a confirmar", () => {
  const gratis = mensajeWhatsapp({ ...PEDIDO, subtotal_centavos: 3270000, costo_envio_centavos: 0, envio_a_confirmar: false });
  assert.ok(gratis.includes("Envío: gratis"));
  const aConf = mensajeWhatsapp({ ...PEDIDO, subtotal_centavos: 3270000, costo_envio_centavos: 0, envio_a_confirmar: true });
  assert.ok(aConf.includes("Envío: a confirmar"));
});
caso("mensaje (036): retiro no menciona el envío", () => {
  const m = mensajeWhatsapp({ ...PEDIDO, entrega: "retiro", subtotal_centavos: 3270000, costo_envio_centavos: 0, envio_a_confirmar: false });
  assert.ok(!m.includes("Envío:") && !m.includes("Subtotal:"));
});
caso("mensaje (036): fuera de horario lo avisa al final", () => {
  assert.ok(mensajeWhatsapp({ ...PEDIDO, fuera_de_horario: true }).endsWith("(Pedido hecho fuera de horario: se prepara cuando abran)"));
  assert.ok(!mensajeWhatsapp(PEDIDO).includes("fuera de horario"));
});
caso("enlace de WhatsApp: sólo dígitos y texto codificado", () => {
  const e = enlaceWhatsapp("+54 9 3549 12-3456", "Hola & chau\n#1");
  assert.equal(e, "https://wa.me/5493549123456?text=Hola%20%26%20chau%0A%231");
});
caso("errores de la base traducidos", () => {
  assert.equal(explicarError("tienda: telefono").campo, "telefono");
  assert.match(explicarError("tienda: cerrada").texto, /cerrada/);
  assert.match(explicarError('Error: tienda: no disponible 283').texto, /ya no está/);
  assert.match(explicarError("cualquier otra cosa").texto, /No pudimos/);
  const min = explicarError("ERROR: tienda: minimo 1000000");
  assert.equal(min.campo, "entrega");
  assert.match(min.texto.replace(/ /g, " "), /mínima para envío es \$ 10\.000/);
});

console.log(`\n${n} casos, todos bien`);
