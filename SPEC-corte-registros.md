# SPEC — Ingresos y Egresos desde cero (corte de registros)

Pedido del usuario (27/09/2026): "empezar a llevar los registros desde 0" en Ingresos y Egresos,
"borrar todo junto y empezar a cargar todo desde hoy".

Decisiones del usuario:
- **Corte desde hoy, no borrado.** Lo anterior queda guardado y se puede volver a ver.
- Arrancan de cero: **movimientos de caja, ventas XRP, pedidos y la cuenta corriente de
  proveedores** (entregas y pagos aplicados).

## Qué NO se toca

1. No se borra ninguna fila. Categorías, proveedores y gastos fijos siguen iguales. Cheques,
   empleados, carnicería, ofertas y Municipalidad no cambian.

## Requisitos

2. Una **fecha de corte** única para Ingresos y Egresos, guardada en la base
   (`config_ingresos_egresos`, migración `024_corte_ingresos_egresos.sql`). Arranca el
   **27/09/2026 a las 00:00** (hora de Argentina): lo cargado hoy antes de aplicar la migración
   también cuenta.
3. Se compara contra **cuándo se cargó** cada registro (`creado_el`; en pedidos, `enviado_el`),
   no contra la fecha a la que corresponde: así, algo de un día anterior que se carga tarde
   entra igual. Es el mismo criterio del corte de la cuenta corriente (migración 013).
4. Lo anterior al corte no se cuenta en ningún lado que lea estos datos: **Ingresos y Egresos**
   (todas sus pestañas), el **inicio** y **Rentabilidad**. Así los números de las tres pantallas
   coinciden.
5. Cuenta corriente de proveedores: quedan afuera las entregas y los pagos anteriores al corte,
   y los pagos aplicados que involucren a alguno de ellos. Todos los proveedores arrancan en 0.
   Si el corte propio de la cuenta corriente (013) es posterior, manda ese.
6. **Un aviso arriba de Ingresos y Egresos** dice desde cuándo arrancan los registros y cuánto
   quedó guardado antes ("799 movimientos, 18 ventas XRP…"). El corte es invisible por definición:
   si no se dice, más adelante alguien ve un saldo que no le cierra.
7. Un admin puede **cambiar la fecha o quitar el corte** desde ese aviso. Moverla para atrás hace
   reaparecer lo anterior: así se comprueba que no se perdió nada.
8. Sin la migración 024 aplicada, todo se ve como hasta ahora (sin corte).

## Verificación

9. Test de cálculos: qué queda adentro y afuera del corte (bordes, sin corte, imputaciones).
10. Navegador (banco de pruebas): el aviso con los números, cambiar la fecha y quitar el corte.
    Capturas en escritorio y celular.
11. Base: la migración, el corte del 27/09, y que sin sesión no se lee ni se cambia.
12. `npm run build` sin errores.

## Fuera de alcance

- Borrar los datos viejos. Si más adelante se quiere, se hace aparte, con una copia en Excel antes.
- Corregir el movimiento con fecha 26/08/0206 (año mal tipeado): queda antes del corte.
