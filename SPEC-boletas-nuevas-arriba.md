# Boletas: las más nuevas arriba

Pedido del usuario (27/11/2026): "en proveedores y en todos lados acomodá las boletas más nuevas
arriba y las más viejas abajo".

## Requisitos

1. En la ficha del proveedor (Ingresos y Egresos → Proveedores), la tabla **Entregas** muestra la
   boleta de fecha más nueva en la primera fila y la más vieja en la última.
2. Con la misma fecha, arriba va la que se cargó última.
3. Las tablas **Pagos** y **Notas de crédito** de la misma ficha siguen el mismo orden (más nuevo
   arriba), para que la ficha sea pareja.
4. Toda lista de boletas para elegir sigue el mismo orden:
   - el desplegable de boleta al cargar una nota de crédito;
   - las casillas de "Pagar con transferencia";
   - el desplegable de "Aplicar pago";
   - el desplegable de pagos disponibles en "Pagar".
5. **No cambia cómo se reparte la plata:** pagos, cheques, transferencias y notas siguen
   cubriendo primero la boleta más vieja (FIFO), y el desplegable de "Aplicar pago" sigue
   arrancando en la boleta más vieja. Sólo cambia el orden en que se muestran.
6. No hay errores en la consola y no aparece scroll horizontal nuevo, ni en móvil ni en desktop.

## Supuestos

- "Todos lados" = toda pantalla que lista boletas. Las boletas sólo aparecen en la cuenta corriente
  de proveedores y en sus ventanas (Pagar, transferencia, nota, cheque ya cargado).
- El detalle "aplicado a" de cada pago/nota (quién cubre qué) queda en el orden en que se cargó.
- Las vistas previas de reparto ("$X → boleta …" en transferencia y cheque ya cargado) quedan en
  el orden en que se aplica la plata: primero la boleta elegida y después de la más vieja a la más
  nueva. Dadas vuelta confundían (se probó el 27/11/2026).

## Fuera de alcance

- El orden de Movimientos, Cheques y el resumen de proveedores (no son boletas).
- Cambiar el reparto FIFO.
