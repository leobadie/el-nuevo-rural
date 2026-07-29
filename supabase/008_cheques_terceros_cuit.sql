-- CUIT del librador en los cheques de terceros, para poder verificarlo en el BCRA
-- con un click desde la pestaña Verificación.
--
-- Es opcional: los cheques ya cargados quedan con cuit_librador en null y siguen
-- funcionando igual. Se guarda como 11 dígitos sin guiones; la validación del dígito
-- verificador se hace en la app (src/lib/bcra/cuit.ts) y acá solo se controla el formato.

alter table public.cheques_terceros
  add column if not exists cuit_librador text;

alter table public.cheques_terceros
  drop constraint if exists cheques_terceros_cuit_librador_formato;

alter table public.cheques_terceros
  add constraint cheques_terceros_cuit_librador_formato
  check (cuit_librador is null or cuit_librador ~ '^[0-9]{11}$');

comment on column public.cheques_terceros.cuit_librador is
  'CUIT/CUIL del librador, 11 dígitos sin guiones. Opcional. Se usa para consultar la Central de Deudores del BCRA.';

-- Buscar los cheques de un mismo librador por CUIT.
create index if not exists cheques_terceros_cuit_librador_idx
  on public.cheques_terceros (cuit_librador)
  where cuit_librador is not null;
