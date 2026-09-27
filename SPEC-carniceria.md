# SPEC — Carnicería (desposte, escandallo, precio y gastos)

Fuente: "Planilla de Desposte y Escandallo 2026" (Criterio Carnicero), 16 módulos, más su
instructivo en PDF. El objetivo es llevar el control de la carnicería del súper dentro de la
app: las 16 calculadoras con los números propios guardados, más un historial de cada media res
que entra.

Decisiones del usuario (26/09/2026):
- Calculadora **y** historial por media res.
- Los 16 módulos.
- Los gastos fijos se **traen de la app** (Ingresos y Egresos → Gastos fijos), no se cargan aparte.

## Pedido por el usuario

1. Nueva sección **Carnicería** en `/carniceria`, con acceso desde el home.
2. Están los 16 módulos de la planilla. Cada uno muestra lo que cargás, el resultado principal,
   los resultados secundarios y la frase explicativa, igual que en el Excel.
3. Las fórmulas son **exactamente** las del Excel. Con los datos de ejemplo de la planilla,
   cada módulo da el mismo número que el PDF:

   | Mód | Resultado                         | Esperado     |
   |-----|-----------------------------------|--------------|
   | 1   | Costo real del kilo que vendés    | 14.083 $/kg  |
   | 2   | Kilos que no llegan               | 2,09 kg      |
   | 3   | Lo que te deja la media res       | 280.120 $    |
   | 4   | Suba de los cortes que se mueven  | 9,3 %        |
   | 5   | Margen que realmente te queda     | 23,1 %       |
   | 6   | Costo real del kilo de cerdo      | 7.003 $/kg   |
   | 7   | Ganancia de más trozando          | 3.460 $      |
   | 8   | Ganancia de más por kilo en milanesa | 3.428 $/kg |
   | 9   | Luz en cada kilo                  | 290 $/kg     |
   | 10  | Gasto fijo por kilo               | 2.321 $/kg   |
   | 11  | Medias reses para empezar a ganar | 20,3         |
   | 12  | Tu hora vale                      | 4.910 $/h    |
   | 13  | Kilos para ganar lo mismo         | 131,2 kg/sem |
   | 14  | Lo que se queda el cobro          | 486.920 $    |
   | 15  | Plata que va a picada por mes     | 421.200 $    |
   | 16  | Lo que te queda por media res     | 53.870 $     |

4. Los valores que cargás se **guardan** en la base: al volver a entrar están tus números, no
   los del ejemplo. Los resultados se recalculan solos al cambiar cualquier dato.
5. **Historial de medias reses:** se carga cada media res que entra (fecha, abastecedor, vaca
   o cerdo, kg de factura, $/kg, kg de tu balanza, días en cámara y, si se desposta, hueso,
   grasa/cuero, merma y $/kg del grasero). Por cada una se ve el costo real del kilo, el
   rendimiento y los kilos y la plata que no llegan (módulos 1, 2 y 6).
6. El historial muestra la evolución por mes (rendimiento, costo real del kilo y diferencia
   de romana) y un resumen **por abastecedor**. Es el "juntá un mes de datos antes de hablar
   con el abastecedor" del módulo 2.
7. Los **gastos fijos** del módulo 10 salen de los gastos fijos activos de Ingresos y Egresos.
   Cada gasto se puede incluir o excluir y se aplica un **% que corresponde a la carnicería**,
   porque el súper tiene muchas secciones.

## Lo que asumo yo (corregible)

8. **Los módulos están encadenados.** Un dato que en el Excel dice "sale del módulo N" se
   completa solo con ese resultado, y se ve de dónde viene. Se puede **pisar a mano** y volver
   al valor automático.
9. Los módulos 1, 2 y 6 toman por defecto el **promedio de las medias reses del historial del
   último mes** (una para vaca y otra para cerdo). Si no hay historial, usan los valores
   cargados a mano.
10. **Cortes y precios de pizarra:** una sola lista de cortes (nombre, precio de pizarra, ¿queda
    fijo?), compartida por los módulos 3 y 4, con los 21 cortes del Excel precargados. Se
    pueden agregar, renombrar, reordenar y desactivar cortes. Los kilos del desposte de
    referencia (módulo 3) se guardan aparte de los precios.
11. **Luz, sin contarla dos veces:** el módulo 9 calcula la luz del frío. En el módulo 10, la
    luz entra por una de dos vías: la del módulo 9 o el gasto fijo de luz de la app (se excluye
    ese gasto). La pantalla avisa si quedaron las dos.
12. **Acceso: solo admin**, igual que Rentabilidad, porque muestra márgenes y costos.
13. Montos en pesos con separador de miles; kilos con 1 o 2 decimales, como en el Excel.
14. La fecha de "hoy" sale de `hoyISO()` (hora local), no de UTC.
15. Funciona en celular: los módulos se eligen con un menú numerado del 1 al 16 y los campos se
    cargan con el teclado numérico.

## Datos (migración nueva, `supabase/020_carniceria.sql`, la aplica el usuario a mano)

- `carniceria_parametros` (modulo int, clave text, valor numeric): los valores cargados de
  cada calculadora.
- `carniceria_cortes` (nombre, precio_pizarra, fijo, kilos_desposte, orden, activo).
- `carniceria_medias_reses` (fecha, abastecedor, especie vaca/cerdo, kg_factura, precio_kg,
  kg_balanza, dias_camara, hueso_kg, grasa_kg, merma_kg, precio_grasero, notas).
- `carniceria_gastos_fijos` (gasto_fijo_id, incluido) y el % de carnicería como parámetro.
- RLS: todo solo para admin (`is_admin()`).

## Verificación

16. `verificacion/carniceria-calculos.mts`: cada uno de los 16 módulos contra los números del
    Excel (tabla del punto 3), más la cadena entre módulos (por ejemplo, el 11 recibe 245.193 $
    por media res desde los módulos 3, 14 y 15).
17. `verificacion/carniceria.mjs`: en el navegador, carga una media res, cambia datos, comprueba
    que los resultados se recalculan y persisten al recargar, y saca capturas en celular y en
    escritorio.
18. `npm run build` sin errores.

## Ampliación: cajones de pollo (pedido del 26/09/2026)

Decisiones del usuario: se anotan los cajones que **entran**, y alimentan el módulo 7.

19. En la pestaña de medias reses, al lado de Vaca y Cerdo, hay **Pollo**. Cada ingreso guarda
    fecha, proveedor, cantidad de cajones, kilos totales de la factura, precio por kilo con IVA y
    notas. Migración nueva `supabase/021_carniceria_pollo.sql`, solo admin.
20. Por cada ingreso se ve: kilos por cajón, total pagado y precio por kilo.
21. Resumen de los últimos 30 días (cajones, kilos, kilos por cajón, precio promedio ponderado por
    kilos, total pagado), mes a mes y por proveedor.
22. El módulo 7 toma del historial de los últimos 30 días los **kilos por cajón** (kilos totales /
    cajones) y el **precio de compra** (ponderado por kilos), como vaca y cerdo en los módulos 1, 2
    y 6. Se pueden pisar a mano.
23. Validación: cajones entero mayor que 0, kilos mayor que 0, precio no negativo, fecha no futura.

## Fuera de alcance

- Conectar con la balanza o con el sistema de ventas para traer los kilos vendidos solos
  (se cargan a mano).
- Actualizar precios en el cartel o en el flyer desde el módulo 4.
- Exportar a Excel o PDF.
- Stock de la cámara y trazabilidad por lote.
