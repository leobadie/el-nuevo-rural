-- Al borrar un gasto fijo, los movimientos que ya se generaron a partir de
-- él tienen que quedar intactos (solo pierden el vínculo de trazabilidad,
-- que es justamente cómo se comportaba el artifact original). Sin este
-- ajuste, Postgres bloquea el borrado por la referencia (foreign key).
alter table public.movimientos
  drop constraint if exists movimientos_gasto_fijo_id_fkey;

alter table public.movimientos
  add constraint movimientos_gasto_fijo_id_fkey
  foreign key (gasto_fijo_id) references public.gastos_fijos (id)
  on delete set null;
