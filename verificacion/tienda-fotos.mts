// Pruebas de src/lib/tienda/fotosOff.ts (sin red). Correr: npm run verificar:tienda-fotos
import assert from "node:assert/strict";
import {
  codigoConsultable,
  urlConsulta,
  interpretar,
  tipoDeImagen,
  validarImagen,
  rutaEnStorage,
  esperaReintento,
  MAX_BYTES_FOTO,
} from "../src/lib/tienda/fotosOff.ts";

let n = 0;
function caso(nombre: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok  ${nombre}`);
}

const FRENTE = "https://images.openfoodfacts.org/images/products/779/027/200/1029/front_es.3.400.jpg";
const PRINCIPAL = "https://images.openfoodfacts.org/images/products/779/027/200/1029/1.400.jpg";

caso("códigos consultables: 8 a 14 dígitos", () => {
  assert.equal(codigoConsultable("7790272001029"), true);
  assert.equal(codigoConsultable("12345678"), true);
  assert.equal(codigoConsultable("7100"), false, "PLU de balanza");
  assert.equal(codigoConsultable("779027200102A"), false);
  assert.equal(codigoConsultable(""), false);
  assert.equal(codigoConsultable(null), false);
});

caso("la consulta pide sólo los campos necesarios", () => {
  const u = new URL(urlConsulta("7790272001029"));
  assert.equal(u.hostname, "world.openfoodfacts.org");
  assert.equal(u.pathname, "/api/v2/product/7790272001029.json");
  assert.ok(u.searchParams.get("fields")!.includes("image_front_url"));
});

caso("con foto de frente: la elige, con nombre y marca", () => {
  const r = interpretar(200, { status: 1, product: { product_name: "Aceite de girasol", brands: "Natura, Aceitera General Deheza", image_front_url: FRENTE, image_url: PRINCIPAL } });
  assert.deepEqual(r, { resultado: "con_foto", url: FRENTE, nombre: "Aceite de girasol · Natura" });
});
caso("prefiere el nombre en español", () => {
  const r = interpretar(200, { status: 1, product: { product_name: "Sunflower oil", product_name_es: "Aceite de girasol", image_front_url: FRENTE } });
  assert.equal(r.resultado === "con_foto" && r.nombre, "Aceite de girasol");
});
caso("sin foto de frente usa la principal", () => {
  const r = interpretar(200, { status: 1, product: { product_name: "X", image_url: PRINCIPAL } });
  assert.equal(r.resultado === "con_foto" && r.url, PRINCIPAL);
});
caso("existe pero sin foto", () => {
  assert.deepEqual(interpretar(200, { status: 1, product: { product_name: "X" } }), { resultado: "sin_foto", nombre: "X" });
});
caso("no existe (status 0 o 404)", () => {
  assert.equal(interpretar(200, { status: 0, status_verbose: "product not found" }).resultado, "no_esta");
  assert.equal(interpretar(404, null).resultado, "no_esta");
});
caso("errores del servidor o respuestas raras", () => {
  assert.deepEqual(interpretar(429, null), { resultado: "error", detalle: "HTTP 429" });
  assert.equal(interpretar(500, {}).resultado, "error");
  assert.equal(interpretar(200, "texto").resultado, "error");
});
caso("no acepta fotos de otros sitios, por http ni que no sean imagen", () => {
  for (const u of ["https://evil.example.com/a.jpg", "http://images.openfoodfacts.org/a.jpg", "https://images.openfoodfacts.org/a.html", "javascript:alert(1)", "https://openfoodfacts.org.evil.com/a.jpg"]) {
    assert.equal(interpretar(200, { status: 1, product: { image_front_url: u } }).resultado, "sin_foto", u);
  }
  assert.equal(interpretar(200, { status: 1, product: { image_front_url: "https://static.openfoodfacts.net/x/1.400.jpg" } }).resultado, "con_foto");
});

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
caso("reconoce imágenes por los bytes", () => {
  assert.equal(tipoDeImagen(JPG), "image/jpeg");
  assert.equal(tipoDeImagen(PNG), "image/png");
  assert.equal(tipoDeImagen(WEBP), "image/webp");
  assert.equal(tipoDeImagen(new TextEncoder().encode("<html>")), null);
});
caso("valida tamaño y tipo", () => {
  assert.deepEqual(validarImagen(JPG), { ok: true, tipo: "image/jpeg", extension: "jpg" });
  assert.equal(validarImagen(new Uint8Array(0)).ok, false);
  assert.equal(validarImagen(new TextEncoder().encode("<html>no</html>")).ok, false);
  const grande = new Uint8Array(MAX_BYTES_FOTO + 1);
  grande.set(JPG);
  const v = validarImagen(grande);
  assert.ok(!v.ok && v.motivo.includes("1 MB"));
});
caso("ruta en el almacenamiento, con el código limpio", () => {
  assert.equal(rutaEnStorage("283", "jpg"), "off/283.jpg");
  assert.equal(rutaEnStorage("../x y", "png"), "off/___x_y.png");
});
caso("reintentos: 429 espera larga y creciente; 4xx no; límite de 4", () => {
  assert.equal(esperaReintento(1, 429), 60_000);
  assert.equal(esperaReintento(2, 429), 120_000);
  assert.equal(esperaReintento(1, null), 5_000);
  assert.equal(esperaReintento(2, 503), 10_000);
  assert.equal(esperaReintento(1, 400), null);
  assert.equal(esperaReintento(4, 429), null);
});

console.log(`\n${n} casos, todos bien`);
