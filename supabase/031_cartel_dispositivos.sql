-- Vincular cada televisor a su pantalla con un código (SPEC-cartel-vincular.md).
--
-- Todas las teles abren la misma dirección (/tv). Una tele nueva genera una
-- clave al azar, la guarda en su navegador y se presenta con cartel_tv_hola(),
-- que le da un código de 4 cifras para mostrar en pantalla. Desde el admin se
-- elige a qué pantalla corresponde ese código (cartel_vincular) y la tele pasa
-- sola a /cartel/tv/<slug>. Después consulta cartel_tv_estado() cada 15 s: así
-- se entera si la movieron de pantalla, si la desvincularon o si piden
-- "Identificar" (mostrar su nombre en grande).
--
-- La tele no inicia sesión (rol `anon`): no tiene permisos sobre la tabla y
-- solo pasa por las dos funciones de abajo, que tocan únicamente la fila de su
-- propia clave. La clave nunca sale de la tele ni se le muestra a nadie.
--
-- Reutiliza is_usuario_activo() creada en 002_cheques.sql.


create table if not exists public.cartel_dispositivos (
  -- Generada por la tele y guardada en su localStorage. Es lo que la identifica.
  clave uuid primary key,

  -- Lo que muestra la tele mientras espera. Sin 6 ni 9: en una tele montada
  -- parada el código se lee de costado y se confunden.
  codigo text not null unique check (codigo ~ '^[01234578]{4}$'),

  -- null = esperando que la vinculen. Si se borra la pantalla, la tele vuelve
  -- a mostrar un código.
  pantalla_slug text
    references public.cartel_pantallas (slug) on update cascade on delete set null,

  creado_el timestamptz not null default now(),
  vinculado_el timestamptz,
  visto_el timestamptz not null default now(),

  navegador text,
  ancho int,
  alto int
);

create index if not exists cartel_dispositivos_pantalla_idx
  on public.cartel_dispositivos (pantalla_slug);

alter table public.cartel_dispositivos enable row level security;

drop policy if exists "cartel_dispositivos: ver (usuarios)" on public.cartel_dispositivos;
create policy "cartel_dispositivos: ver (usuarios)"
  on public.cartel_dispositivos for select
  to authenticated
  using (public.is_usuario_activo());

drop policy if exists "cartel_dispositivos: editar (usuarios)" on public.cartel_dispositivos;
create policy "cartel_dispositivos: editar (usuarios)"
  on public.cartel_dispositivos for update
  to authenticated
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

-- Desvincular = borrar la fila: la tele no se reconoce y pide un código nuevo.
drop policy if exists "cartel_dispositivos: borrar (usuarios)" on public.cartel_dispositivos;
create policy "cartel_dispositivos: borrar (usuarios)"
  on public.cartel_dispositivos for delete
  to authenticated
  using (public.is_usuario_activo());

-- Sin política de insert: las filas las crea solo cartel_tv_hola().


-- Hasta cuándo las teles de esta pantalla muestran su nombre en grande.
alter table public.cartel_pantallas
  add column if not exists identificar_hasta timestamptz;


-- ---------------------------------------------------------------------------
-- La tele se presenta: crea su fila si no existe y devuelve su código y, si ya
-- la vincularon a una pantalla activa, el slug.
-- ---------------------------------------------------------------------------
create or replace function public.cartel_tv_hola(
  p_clave uuid,
  p_navegador text,
  p_ancho int,
  p_alto int
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_slug text;
  v_intentos int := 0;
  v_digitos constant text := '01234578';
begin
  if p_clave is null then
    raise exception 'Falta la clave del televisor.';
  end if;

  -- Teles que nunca se vincularon y no se ven hace una semana: basura.
  delete from public.cartel_dispositivos
  where pantalla_slug is null and visto_el < now() - interval '7 days';

  update public.cartel_dispositivos
  set visto_el = now(),
      navegador = left(p_navegador, 300),
      ancho = case when p_ancho between 1 and 10000 then p_ancho end,
      alto = case when p_alto between 1 and 10000 then p_alto end
  where clave = p_clave;

  if not found then
    -- Freno para que nadie llene la tabla inventando claves.
    if (select count(*) from public.cartel_dispositivos where pantalla_slug is null) >= 100 then
      raise exception 'Hay demasiados televisores esperando vincularse.';
    end if;

    loop
      v_intentos := v_intentos + 1;
      v_codigo := '';
      for i in 1..4 loop
        v_codigo := v_codigo || substr(v_digitos, 1 + floor(random() * 8)::int, 1);
      end loop;

      begin
        -- on conflict por la clave: dos pedidos simultáneos de la misma tele no
        -- crean dos filas. Un código repetido sí da error, y se sortea otro.
        insert into public.cartel_dispositivos (clave, codigo, navegador, ancho, alto)
        values (
          p_clave,
          v_codigo,
          left(p_navegador, 300),
          case when p_ancho between 1 and 10000 then p_ancho end,
          case when p_alto between 1 and 10000 then p_alto end
        )
        on conflict (clave) do nothing;
        exit;
      exception when unique_violation then
        if v_intentos >= 50 then
          raise exception 'No se pudo generar un código libre.';
        end if;
      end;
    end loop;
  end if;

  -- Una pantalla apagada se trata como "sin vincular": su dirección da 404.
  select d.codigo, case when p.activa then d.pantalla_slug end
  into v_codigo, v_slug
  from public.cartel_dispositivos d
  left join public.cartel_pantallas p on p.slug = d.pantalla_slug
  where d.clave = p_clave;

  return json_build_object('codigo', v_codigo, 'pantalla', v_slug);
end;
$$;

revoke all on function public.cartel_tv_hola(uuid, text, int, int) from public;
grant execute on function public.cartel_tv_hola(uuid, text, int, int) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Lo que la tele pregunta cada 15 s mientras muestra una pantalla.
--   identificar_seg: segundos que le quedan al cartel con el nombre (los cuenta
--     el servidor: el reloj de las teles suele estar mal).
--   conocida / pantalla: solo si la tele mandó su clave. conocida = false
--     quiere decir que la desvincularon.
-- Las teles cargadas a mano con /cartel/tv/<slug> no tienen clave: solo
-- reciben identificar_seg.
-- ---------------------------------------------------------------------------
create or replace function public.cartel_tv_estado(p_slug text, p_clave uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seg int;
  v_slug text;
  v_conocida boolean;
begin
  select greatest(0, ceil(extract(epoch from identificar_hasta - now())))::int
  into v_seg
  from public.cartel_pantallas
  where slug = p_slug and activa = true;

  if p_clave is null then
    return json_build_object('identificar_seg', coalesce(v_seg, 0));
  end if;

  update public.cartel_dispositivos
  set visto_el = now()
  where clave = p_clave
  returning pantalla_slug into v_slug;
  v_conocida := found;

  return json_build_object(
    'identificar_seg', coalesce(v_seg, 0),
    'conocida', v_conocida,
    'pantalla', v_slug
  );
end;
$$;

revoke all on function public.cartel_tv_estado(text, uuid) from public;
grant execute on function public.cartel_tv_estado(text, uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Desde el admin. Corren con los permisos de quien llama (security invoker):
-- las políticas de arriba deciden quién puede.
-- ---------------------------------------------------------------------------

-- Que las teles de una pantalla muestren su nombre 30 segundos. Con la hora del
-- servidor, no la del celular de quien aprieta el botón.
create or replace function public.cartel_identificar(p_slug text)
returns void
language sql
set search_path = public
as $$
  update public.cartel_pantallas
  set identificar_hasta = now() + interval '30 seconds'
  where slug = p_slug;
$$;

revoke all on function public.cartel_identificar(text) from public;
grant execute on function public.cartel_identificar(text) to authenticated;


-- Vincula la tele que muestra p_codigo a la pantalla p_slug, y la identifica
-- para que se vea en el local que quedó bien.
create or replace function public.cartel_vincular(p_codigo text, p_slug text)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.cartel_pantallas where slug = p_slug and activa = true) then
    raise exception 'Esa pantalla no existe o está apagada.';
  end if;

  update public.cartel_dispositivos
  set pantalla_slug = p_slug, vinculado_el = now()
  where codigo = p_codigo and pantalla_slug is null;

  if not found then
    raise exception 'No hay ningún televisor esperando con el código %.', p_codigo;
  end if;

  perform public.cartel_identificar(p_slug);
end;
$$;

revoke all on function public.cartel_vincular(text, text) from public;
grant execute on function public.cartel_vincular(text, text) to authenticated;
