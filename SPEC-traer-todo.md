# Traer todas las filas, no sólo las primeras 1000

## El problema (22/11/2026)

Supabase devuelve como máximo 1000 filas por consulta. `movimientos` llegó a 1095 el 15/11/2026
y desde ahí Ingresos y Egresos mostraba sólo "201 movimientos cargados" (1000 − 799 guardados
por el corte): los 95 más nuevos —del 16 al 21/11— no aparecían, aunque estaban en la base. El
inicio y Rentabilidad pedían los movimientos sin orden, así que les faltaban 95 cualesquiera.
No se perdió ningún dato.

## Requisitos

1. Hay un helper `traerTodo` que pide una tabla por tramos y devuelve todas las filas, sin
   importar cuántas sean ni qué tope tenga el servidor (1000 u otro).
2. Si cualquier tramo falla, devuelve el error y no una lista a medias.
3. El orden de los tramos es estable (orden por una columna única al final), así no se
   repiten ni se saltean filas entre tramos.
4. Ingresos y Egresos, el inicio y Rentabilidad cargan **todos** los movimientos con él.
5. Cheques (459 hoy, crece ~60 por mes) también: en la página de Cheques y en el inicio.
6. Con los datos reales, Ingresos y Egresos muestra 296 movimientos cargados (1095 − 799) y
   aparecen los del 16 al 21/11.
7. Se verifica en navegador real, en desktop y móvil.

## Supuestos

- El resto de las tablas está lejos de 1000 filas (la más grande, entregas_proveedor, tiene
  134); no se tocan ahora.

## Fuera de alcance

- "Restaurar backup" sigue reemplazando todo; no se cambia su comportamiento.
