-- 037: un pago (movimiento) puede quedar vinculado al cheque con el que se pagó
-- (SPEC-cheque-a-proveedor.md, punto 1).
--
-- Antes, pagar con cheque creaba siempre un cheque nuevo en Control de Cheques, aunque ya
-- estuviera cargado a mano, y había que borrar el repetido. Con el vínculo se puede elegir un
-- cheque ya cargado y la app sabe cuáles están usados.
--
-- Un cheque va con un solo movimiento (índice único). Si se borra el cheque, el movimiento queda
-- y sólo pierde el vínculo.
--
-- Pegar entero en el editor SQL de Supabase. Se puede correr más de una vez.

alter table public.movimientos
  add column if not exists cheque_id uuid references public.cheques(id) on delete set null;

create unique index if not exists movimientos_cheque_id_unico
  on public.movimientos (cheque_id)
  where cheque_id is not null;

-- Que PostgREST vea la columna nueva sin esperar.
notify pgrst, 'reload schema';
