-- Corrige permisos de 031_cartel_dispositivos.sql.
--
-- Supabase le da EXECUTE a `anon` sobre toda función nueva del esquema public
-- (privilegios por defecto), así que el `revoke ... from public` de la 031 no
-- alcanzaba: una tele sin sesión podía llamar a estas dos funciones. No lograba
-- cambiar nada (las políticas de las tablas la frenaban y la llamada terminaba
-- sin tocar filas), pero no tiene por qué poder llamarlas.

revoke execute on function public.cartel_identificar(text) from anon;
revoke execute on function public.cartel_vincular(text, text) from anon;
