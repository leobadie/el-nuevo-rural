# SPEC — Calculadora de precios

Pedido del usuario (27/09/2026): una calculadora para poner precios con el margen que quiere
(por ejemplo 40%). Es Responsable Inscripto: los márgenes se sacan **sin IVA**. Las carnes y despojos
(de bovinos, ovinos, porcinos, aves, etc.) llevan **10,5%** de IVA y el resto **21%**.

Decisiones del usuario:
- **Calcular, sin guardar** productos.
- **Redondeo** del precio de góndola a elección, siempre hacia arriba.
- **Módulo propio** con tarjeta en el inicio.

## Requisitos

1. Pantalla **`/precios`** ("Calculadora de precios"), con tarjeta en el inicio. Pide sesión.
2. **De costo a precio.** Se cargan:
   - el **costo** del producto, neto (factura A);
   - la casilla **«El costo incluye IVA»**, para cuando sólo se tiene el total: se le saca el
     IVA de la misma alícuota;
   - el **IVA**: 21% (general) o 10,5% (carnes y despojos de bovinos, ovinos, porcinos, aves…);
   - el **margen** que se quiere ganar sobre la venta (40% de entrada, con atajos 25/30/35/40/50);
   - **otros costos que no se recuperan** (percepción de IIBB que no se computa, flete), opcional,
     en pesos por unidad;
   - el **redondeo**: sin redondeo, a $10, a $50 o a $100.
3. Resultado: **precio de góndola** (con IVA) grande; debajo, el precio exacto antes de redondear,
   el precio neto, el IVA, la **ganancia neta** en pesos, el **margen real** (el que queda después
   de redondear) y el **recargo** sobre el costo. Se recalcula al escribir.
4. Las cuentas: costo neto = costo (o costo ÷ (1 + IVA) si lo incluye) + otros costos;
   precio neto = costo neto ÷ (1 − margen); góndola = precio neto × (1 + IVA); el redondeo
   es hacia arriba al múltiplo elegido. Con $ 1.000 neto al 21% y 40%: $ 2.016,67, redondeado
   a $10 da $ 2.020.
5. **De precio a margen** (la cuenta al revés): con el costo, el IVA y un precio de góndola, dice
   qué margen y qué ganancia deja. Si el precio no cubre el costo, lo dice.
6. Margen entre 0% y menos de 100%. Sin costo, o con datos inválidos, no muestra números sino
   qué falta.
7. Funciona en el celular (teclado numérico, sin desbordar).

## Fuera de alcance

- Guardar productos o listas de precios.
- La comisión de tarjeta o QR (está en Carnicería, módulo 14).
- Decidir la alícuota de cada producto: la elige el usuario.

## Verificación

8. Test de cálculos con los ejemplos de arriba y bordes.
9. Navegador (banco de pruebas): las dos cuentas, el redondeo y los avisos. Capturas en
   escritorio y celular.
10. `npm run build` sin errores.
