# SPEC — Tienda online: costo de envío, mínimo y horarios

Etapa 2 de la tienda (`SPEC-tienda.md`). Pedido del usuario el 21/11/2026: "Zonas y horarios".

## Lo que decidió el usuario

- **Envío:** un costo fijo para todo el pueblo, **gratis desde un monto**. No hay zonas ni barrios.
- **Mínimo de compra:** solo para **envío**. Retirar en el local no tiene mínimo.
- **Fuera de horario:** el pedido **se acepta** y se le avisa al cliente cuándo se prepara ("cuando abramos: mañana 8:00").
- **Envíos:** en el mismo horario de atención del local; no hay franjas propias.

## Requisitos

### Configuración (`/catalogo`, solo usuarios del sistema)

1. En "La tienda" se cargan tres montos en pesos: **costo del envío**, **envío gratis desde** y **compra mínima para envío**. Si un monto está vacío o en 0, no se aplica: sin costo cargado, el envío es "a confirmar", como hoy.
2. Se carga el **horario de atención** por día de la semana, con hasta dos franjas por día (ej. 8:00–13:00 y 17:00–21:00). Un día sin franjas cuenta como cerrado. Si no se carga ningún horario, la tienda no muestra avisos de horario.
3. El horario se valida al guardar: formato HH:MM y la hora de cierre después de la de apertura. Si algo está mal, se dice qué y no se guarda nada.
4. Guardar refresca la tienda en el momento (`updateTag`), igual que hoy.

### Tienda (`/tienda`, pública)

5. **Fuera de horario**, con la tienda abierta, aparece un aviso arriba: "Ahora estamos cerrados. Podés hacer tu pedido igual: lo preparamos cuando abramos (mañana a las 8:00)". La próxima apertura se dice como "hoy a las 17:00", "mañana a las 8:00" o "el lunes a las 8:00".
6. El pie muestra el horario de la semana en forma corta. Los días con el mismo horario se agrupan: "Lun a Sáb 8:00–13:00 y 17:00–21:00 · Dom cerrado".
7. La hora se calcula **en hora de Argentina** (UTC−3), no en la del navegador ni en UTC.

### Carrito

8. Con **envío** elegido, el resumen muestra la línea "Envío" con el costo, o "Gratis" si el subtotal llega al monto de envío gratis.
9. Si falta poco para el envío gratis, se avisa: "Te faltan $ X para el envío gratis". Solo se muestra con envío elegido y si el envío gratis está configurado.
10. Si el subtotal no llega al **mínimo para envío**, se avisa "La compra mínima para envío es $ X (te faltan $ Y)" y el botón de enviar queda deshabilitado con envío elegido. Retiro sigue habilitado.
11. El total pasa a ser subtotal + envío. Con productos que se pesan sigue diciendo "aproximado".
12. Fuera de horario, el carrito repite el aviso del punto 5 antes del botón de enviar.

### Base de datos (`tienda_crear_pedido`)

13. La base **recalcula** el costo de envío y el mínimo con su propia configuración. Nunca confía en lo que mande el navegador.
14. Un pedido con envío bajo el mínimo se rechaza con `tienda: minimo` y la app explica el motivo con el monto.
15. El pedido guarda `costo_envio_centavos`. `total_centavos` es subtotal + envío. Si no hay costo cargado, el envío queda "a confirmar", el costo en 0 y una marca `envio_a_confirmar`.

### Mensaje de WhatsApp y pantalla del pedido

16. El mensaje lleva la línea "Envío: $ X", "Envío: gratis" o "Envío: a confirmar", y el total incluye el envío.
17. Si el pedido se hizo fuera de horario, el mensaje lo dice: "(Pedido hecho fuera de horario: se prepara cuando abran)". La pantalla del pedido avisa lo mismo con la próxima apertura.

### Calidad

18. Pruebas unitarias del horario: abierto/cerrado, la franja que cruza el mediodía, la próxima apertura hoy/mañana/en días, sin horario, día sin franjas y hora argentina vs UTC. También del costo de envío y del mínimo.
19. Prueba de base: el mínimo se rechaza, el envío gratis queda en 0, el costo se suma al total y un costo mandado desde afuera se ignora.
20. Prueba punta a punta (`verificar:tienda`) actualizada con envío, costo y total. Captura en celular y en escritorio.

## Asumido por mí

- Un solo costo de envío. La tabla `tienda_zonas_envio` (033) queda sin usar para cuando hagan falta zonas.
- El mínimo y el envío gratis se comparan contra el **subtotal aproximado**, el de los pesables según los gramos pedidos.
- Fuera de horario es solo un aviso. El tilde "Tienda abierta" sigue siendo el que corta los pedidos de verdad.
- Los feriados no se contemplan. Para un feriado se cierra la tienda con el tilde o se carga un aviso.

## Fuera de alcance

- Zonas o barrios con costos distintos, y calcular la distancia.
- Franjas de entrega y elegir la hora de entrega.
- Feriados automáticos.
