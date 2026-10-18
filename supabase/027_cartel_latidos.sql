-- Latidos del cartel: cada televisor avisa que está prendido.
--
-- Cuando los TVs muestran la app en vivo (SPEC-cartel-tv-en-vivo.md, puntos
-- 7-9), un televisor colgado o sin wifi no se nota desde la oficina. Cada
-- pantalla manda un "latido" cada 5 minutos y el admin muestra cuál está
-- conectado y cuál no. De paso guarda el navegador del TV, que es lo que dice
-- si la app corre bien ahí.
--
-- El televisor no inicia sesión (rol `anon`), así que no se le da permiso de
-- escritura sobre la tabla: escribe solo a través de cartel_latido(), que
-- únicamente toca la fila de una pantalla activa que exista. Un anónimo no
-- puede inventar pantallas ni borrar latidos.
--
-- Reutiliza is_usuario_activo() creada en 002_cheques.sql.


create table if not exists public.cartel_latidos (
  pantalla_slug text primary key
    references public.cartel_pantallas (slug) on update cascade on delete cascade,

  visto_el timestamptz not null default now(),

  -- User-Agent del navegador del televisor, recortado.
  navegador text,
  -- Versión de la app que tenía cargada (el commit del deploy).
  version text,
  -- Tamaño de la ventana: si da apaisado en un TV parado, falta ?rotar.
  ancho int,
  alto int
);

alter table public.cartel_latidos enable row level security;

-- Solo lectura para los usuarios del sistema. Sin políticas de escritura: la
-- única vía es la función de abajo.
drop policy if exists "cartel_latidos: ver (usuarios)" on public.cartel_latidos;
create policy "cartel_latidos: ver (usuarios)"
  on public.cartel_latidos for select
  to authenticated
  using (public.is_usuario_activo());


create or replace function public.cartel_latido(
  p_slug text,
  p_navegador text,
  p_version text,
  p_ancho int,
  p_alto int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Una pantalla dada de baja o inexistente no deja rastro: así nadie puede
  -- llenar la tabla con slugs inventados.
  if not exists (
    select 1 from public.cartel_pantallas where slug = p_slug and activa = true
  ) then
    return;
  end if;

  insert into public.cartel_latidos as l (pantalla_slug, visto_el, navegador, version, ancho, alto)
  values (
    p_slug,
    now(),
    left(p_navegador, 300),
    left(p_version, 40),
    -- Un tamaño absurdo no sirve para nada: se guarda vacío.
    case when p_ancho between 1 and 10000 then p_ancho end,
    case when p_alto between 1 and 10000 then p_alto end
  )
  on conflict (pantalla_slug) do update
    set visto_el = excluded.visto_el,
        navegador = excluded.navegador,
        version = excluded.version,
        ancho = excluded.ancho,
        alto = excluded.alto;
end;
$$;

revoke all on function public.cartel_latido(text, text, text, int, int) from public;
grant execute on function public.cartel_latido(text, text, text, int, int) to anon, authenticated;
