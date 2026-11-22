# Asignar un cheque ya cargado al pago de un proveedor

## El problema (22/11/2026)

Al cargar un pago con cheque —desde Movimientos o con el botón **Pagar** de la cuenta corriente—
la app crea siempre un cheque nuevo en Control de Cheques. Muchas veces el cheque ya estaba
cargado a mano, así que queda repetido y hay que borrarlo. No hay forma de decir "este pago es
el cheque N° X que ya cargué".

Lo que se vio en la base:
- Un cheque suele pagar varias facturas: el N° 726 de REGGIO CHICO ($893.000) es la suma de 6
  pagos del 15/11.
- Los nombres no coinciden entre Cheques y Proveedores ("santa rita santander" en Cheques,
  "SANTA RITA SOTO (MAYORISTA)" en Proveedores). No se puede filtrar por nombre exacto.
- Hoy no hay cheques repetidos: los que generaron esos 9 pagos ya se borraron a mano.

## Requisitos

1. Cada movimiento puede quedar vinculado a un cheque (`movimientos.cheque_id`, migración 037).
   Un cheque se vincula a un solo movimiento. Si se borra el cheque, el movimiento queda, sin
   vínculo.
2. **Cheques sin usar** = no rechazados, sin movimiento vinculado y cargados desde el corte de
   registros (27/09/2026). Son los únicos que se ofrecen para asignar, en los tres lugares. Los
   anteriores se usaron antes de que existiera la cuenta corriente.
3. Al elegir un cheque se ve N°, proveedor como está en Cheques, importe y fecha de cobro. Hay
   un buscador (N°, proveedor o importe) y van primero los cheques cuyo proveedor se parece al
   del pago.
4. **Desde Pagar (cuenta corriente)**: el modal tiene la opción "Cheque ya cargado". Al
   confirmar:
   - se crea **un** egreso en Movimientos por el importe del cheque, medio Cheque, vinculado al
     cheque, **sin crear otro cheque**;
   - se aplica primero a la entrega donde se tocó Pagar y lo que sobre a las demás pendientes,
     de la más vieja a la más nueva;
   - si sobra después de cubrir todo, queda "a cuenta" del proveedor, como cualquier pago.
   - Antes de confirmar se muestra cómo se va a repartir.
5. **Desde Control de Cheques**: los cheques sin usar tienen "Aplicar a deuda". Lleva a la
   cuenta corriente con un modal para elegir el proveedor (primero los parecidos y los que tienen
   deuda), muestra el reparto y hace lo mismo que el punto 4.
6. Los cheques ya usados muestran en Control de Cheques a qué pago corresponden.
7. **Desde Movimientos**: con medio Cheque, se puede elegir "Cheque nuevo" (como hasta ahora) o
   uno ya cargado. Con uno ya cargado se completan importe, N° y fecha de cobro con los del
   cheque y no se crea otro.
8. Los cheques que se crean solos desde un pago quedan vinculados a ese pago (así no se ofrecen
   de nuevo).
9. **Posibles repetidos**: en Control de Cheques, si hay pares de cheques con el mismo importe,
   proveedor parecido y emisión a 15 días o menos, donde uno se generó desde un pago, se muestra
   un aviso con la lista para revisar. No se borra nada solo: cada cheque tiene su botón de
   eliminar, con la confirmación de siempre.
10. Si la migración 037 todavía no se aplicó, los pagos comunes siguen funcionando igual que
    antes; sólo la asignación de cheques muestra un error claro.
11. Se verifica con tests de las cuentas y en navegador real, en desktop y móvil.

## Supuestos

- La fecha del egreso es la fecha de emisión del cheque (si no tiene, hoy).
- El vínculo no cambia el nombre del proveedor que figura en Cheques.
- Lo puede usar cualquier usuario activo que pueda cargar pagos con cheque (la tabla cheques ya
  se puede leer con cualquier usuario activo).

## Fuera de alcance

- Vincular a cheques los 9 pagos viejos que se cargaron "con cheque" (sus cheques generados ya se
  borraron).
- Unificar los nombres de proveedores entre Cheques y Proveedores.
