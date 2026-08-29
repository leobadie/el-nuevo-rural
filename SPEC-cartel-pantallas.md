# Pantallas del cartel — que cada televisor muestre lo suyo

Continuación de `SPEC-cartel.md`. Ahí quedó declarado fuera de alcance el "panel
por sucursal o por pantalla"; esto lo incorpora.

## 0. De dónde viene

Los 10 televisores del local se administran hoy desde un panel externo
(`badie.cdenet.com.ar`, Data Computación), al que hay que subirle archivos a mano
porque no acepta URLs. El pedido fue "copiar esa página y meterle nuestros
carteles".

No se copia. El sistema ya tiene un reproductor (`/cartel`) y un panel de carga
(`/cartel/admin`); lo único que le falta para reemplazar al externo es que cada
televisor pueda mostrar contenido distinto. Clonar la interfaz ajena no aportaría
nada: los televisores no la miran por su diseño, la miran por su dirección.

**Supuesto que hay que confirmar en el local:** que el navegador del televisor
pueda abrir una dirección nuestra. Si el TV solo corre la app del proveedor, todo
esto queda como preparación y se sigue exportando PNG a mano.

## 1. Lo que ya funciona y no se toca

1. `/cartel` sigue mostrando todas las placas vigentes, sin filtrar. Es lo que
   corre hoy en producción y no cambia de comportamiento.
2. `?seccion=carniceria` sigue filtrando por sector. Lo usa `cartel:video` para
   exportar un archivo por grupo de televisores.
3. El fallback a `PLACAS_DEMO` cuando no queda nada vigente se mantiene, también
   por pantalla: un televisor sin placas asignadas muestra las de demostración,
   nunca negro.

## 2. Alcance

4. Se agrega el concepto de **pantalla**: un televisor concreto del local, con un
   nombre ("Carnicería 1") y una dirección propia.
5. Cada pantalla tiene un **slug** en la URL: `/cartel/tv/carniceria-1`. Sin
   sesión, igual que `/cartel`.
6. Una pantalla puede tener una **sección por defecto**, que reusa el filtro que
   ya existe. Alcanza para el caso normal: los tres TVs de carnicería se dan de
   alta con sección "Carnicería" y listo.
7. Además se puede **asignar placas explícitamente** a una o más pantallas,
   cuando una oferta va solo a un televisor.
8. **Regla de contenido** de la pantalla `X` — una placa activa y vigente entra si:
   - está asignada explícitamente a `X`, **o**
   - no está asignada a ninguna pantalla y pasa el filtro de sección de `X`.

   El segundo caso es el que hace que todo lo cargado hasta hoy siga apareciendo
   sin tocar nada: ninguna placa existente tiene asignación.
9. En `/cartel/admin` se dan de alta, editan y desactivan las pantallas, y se ve
   la dirección de cada una para copiarla al televisor.
10. Al cargar o editar una placa se elige a qué pantallas va, con "todas" por
    defecto.

## 3. Seguridad

11. `/cartel/tv/<slug>` es público, como `/cartel`. **No se abre el prefijo
    `/cartel/`**: se agrega un patrón que exige la forma `/cartel/tv/<slug>` con
    slug de minúsculas, números y guiones. `/cartel/admin` tiene que seguir
    redirigiendo a `/login`, y eso se verifica contra producción, no de memoria.
12. La lectura anónima de `cartel_pantallas` se limita por RLS a las pantallas
    activas, y la de la tabla puente a las filas de esas pantallas. Escribir
    sigue requiriendo sesión.
13. Un slug inexistente devuelve 404, no la pantalla genérica: si alguien se
    equivoca al tipear la dirección en el televisor, tiene que notarlo.

## 4. Fuera de alcance

- Reemplazar el panel de Data Computación mientras los televisores sigan
  atados a él. Esto habilita la salida, no la ejecuta.
- Horarios por franja (ofertas distintas a la mañana y a la tarde).
- Saber si un televisor está prendido o si perdió conexión.
- Subir el contenido al panel externo: se sigue haciendo a mano con los PNG.

## 5. Verificación

Sin suite de tests en el proyecto, se verifica con navegador real sobre el dev
server y después contra producción:

- `/cartel/tv/<slug>` abre **sin sesión** y muestra solo lo de esa pantalla.
- Dos pantallas distintas muestran contenido distinto, comprobado leyendo el
  texto de las dos.
- `/cartel/admin` sigue redirigiendo a `/login` sin sesión.
- Un slug inventado devuelve 404.
- `/cartel` sin slug sigue mostrando todo, como hoy.
- La consola del navegador no tira errores.
- Screenshots de la pantalla vertical y del admin, en desktop y móvil.
- `npm run verificar:base-cartel` extendido a las tablas nuevas y sus políticas.
