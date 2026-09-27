-- Carnicería: las 16 calculadoras de la planilla de desposte y escandallo, con los números
-- propios guardados, y el historial de cada media res que entra. Ver SPEC-carniceria.md.
--
-- Todo es solo para admin (muestra costos y márgenes), igual que Rentabilidad.
-- Reutiliza is_admin() creada en 002_cheques.sql.


-- ============================================================================
-- Parámetros: lo que el usuario carga en cada calculadora, por clave
-- ("m1.hueso", "gen.dias_mes"...). Una clave sin fila usa el valor automático o el del
-- ejemplo de la planilla: "volver a automático" es borrar la fila.
-- ============================================================================

create table if not exists public.carniceria_parametros (
  clave text primary key,
  valor numeric not null,
  actualizado_el timestamptz not null default now()
);

alter table public.carniceria_parametros enable row level security;

drop policy if exists "carniceria_parametros: solo admin" on public.carniceria_parametros;
create policy "carniceria_parametros: solo admin"
  on public.carniceria_parametros for all
  using (public.is_admin())
  with check (public.is_admin());


-- ============================================================================
-- Cortes de la pizarra: los comparten el escandallo (módulo 3) y el prorrateo (módulo 4).
-- ============================================================================

create table if not exists public.carniceria_cortes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  precio_pizarra numeric(14, 2) not null default 0 check (precio_pizarra >= 0),
  -- Kilos que salen de una media res en un desposte de referencia.
  kilos_desposte numeric(10, 3) not null default 0 check (kilos_desposte >= 0),
  -- Su precio no se toca al prorratear (asado y picada en la planilla).
  fijo boolean not null default false,
  orden integer not null default 0,
  -- Desactivar en vez de borrar: un corte que se deja de vender puede volver.
  activo boolean not null default true
);

alter table public.carniceria_cortes enable row level security;

drop policy if exists "carniceria_cortes: solo admin" on public.carniceria_cortes;
create policy "carniceria_cortes: solo admin"
  on public.carniceria_cortes for all
  using (public.is_admin())
  with check (public.is_admin());

-- Los 19 cortes vendibles de la planilla, con los kilos y precios del ejemplo (agosto 2026).
-- Solo si la tabla está vacía: correr el script de nuevo no duplica ni pisa precios.
insert into public.carniceria_cortes (nombre, kilos_desposte, precio_pizarra, fijo, orden)
select v.nombre, v.kilos, v.precio, v.fijo, v.orden
from (values
  ('Asado (con hueso)', 11.2, 17700, true, 1),
  ('Vacío', 3.6, 21200, false, 2),
  ('Matambre', 1.9, 18200, false, 3),
  ('Falda', 5, 11600, false, 4),
  ('Nalga', 6.4, 21900, false, 5),
  ('Tapa de nalga', 2.2, 18200, false, 6),
  ('Cuadrada', 3.9, 19600, false, 7),
  ('Peceto', 2.1, 23200, false, 8),
  ('Bola de lomo', 4, 19200, false, 9),
  ('Cuadril', 3.4, 21000, false, 10),
  ('Colita de cuadril', 1.1, 23900, false, 11),
  ('Lomo', 2.1, 28700, false, 12),
  ('Bife angosto', 4.6, 18600, false, 13),
  ('Bife ancho', 3.6, 17800, false, 14),
  ('Paleta', 5, 17400, false, 15),
  ('Roast beef y aguja', 7.4, 16500, false, 16),
  ('Tapa de asado', 1.6, 17200, false, 17),
  ('Osobuco', 4.2, 11600, false, 18),
  ('Picada común (recorte)', 9.1, 10800, true, 19)
) as v (nombre, kilos, precio, fijo, orden)
where not exists (select 1 from public.carniceria_cortes);


-- ============================================================================
-- Historial: cada media res que entra. El desposte (hueso, grasa, merma) es opcional:
-- se carga cuando se pesa, no todas las veces.
-- ============================================================================

create table if not exists public.carniceria_medias_reses (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  abastecedor text,
  especie text not null default 'vaca' check (especie in ('vaca', 'cerdo')),
  kg_factura numeric(10, 3) not null check (kg_factura > 0),
  precio_kg numeric(14, 2) not null check (precio_kg >= 0),
  kg_balanza numeric(10, 3) check (kg_balanza > 0),
  dias_camara numeric(5, 1) check (dias_camara >= 0),
  hueso_kg numeric(10, 3) check (hueso_kg >= 0),
  grasa_kg numeric(10, 3) check (grasa_kg >= 0),
  merma_kg numeric(10, 3) check (merma_kg >= 0),
  precio_grasero numeric(14, 2) check (precio_grasero >= 0),
  notas text,
  creado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id),
  -- Lo que sale del desposte no puede pesar más que la media res.
  check (coalesce(hueso_kg, 0) + coalesce(grasa_kg, 0) + coalesce(merma_kg, 0) < kg_factura)
);

create index if not exists carniceria_medias_reses_fecha_idx
  on public.carniceria_medias_reses (fecha);

alter table public.carniceria_medias_reses enable row level security;

drop policy if exists "carniceria_medias_reses: solo admin" on public.carniceria_medias_reses;
create policy "carniceria_medias_reses: solo admin"
  on public.carniceria_medias_reses for all
  using (public.is_admin())
  with check (public.is_admin());


-- ============================================================================
-- Qué gastos fijos de Ingresos y Egresos cuentan para la carnicería (módulo 10).
-- Un gasto sin fila cuenta: por defecto se incluyen todos y se aplica el % de la carnicería.
-- Si se borra el gasto fijo, se va su fila.
-- ============================================================================

create table if not exists public.carniceria_gastos_fijos (
  gasto_fijo_id uuid primary key references public.gastos_fijos (id) on delete cascade,
  incluido boolean not null
);

alter table public.carniceria_gastos_fijos enable row level security;

drop policy if exists "carniceria_gastos_fijos: solo admin" on public.carniceria_gastos_fijos;
create policy "carniceria_gastos_fijos: solo admin"
  on public.carniceria_gastos_fijos for all
  using (public.is_admin())
  with check (public.is_admin());
