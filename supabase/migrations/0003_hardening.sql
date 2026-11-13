-- =============================================================================
-- Racha · Endurecimiento del servidor (sincronización + ranking)
--
-- Pone límites en el servidor para que un cliente modificado no pueda guardar
-- datos raros o gigantes, ni publicar en el ranking de otra semana o en ráfagas.
-- Las filas existentes que no cumplan las reglas se corrigen antes de activarlas.
--
-- Requiere haber aplicado antes 0001_sync.sql y 0002_leaderboard.sql.
-- Cómo aplicarla: pega este archivo completo en Supabase → SQL Editor → Run.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =============================================================================


-- =============================================================================
-- 1) user_docs (sincronización)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permisos: los anónimos no tocan la tabla; los usuarios con sesión solo pueden
-- leer/crear/editar/borrar filas (nada de TRUNCATE, REFERENCES ni TRIGGER).
-- Las políticas RLS de 0001 siguen filtrando qué filas ve cada uno.
-- -----------------------------------------------------------------------------
revoke all on public.user_docs from anon;
revoke all on public.user_docs from authenticated;
grant select, insert, update, delete on public.user_docs to authenticated;

-- -----------------------------------------------------------------------------
-- Límites de tamaño: id corto (los de la app miden ~16–36) y documento ≤ 64 KB.
-- Se crean NOT VALID (no revisan lo viejo al crearse, pero sí todo lo nuevo) y
-- luego se intenta validarlas; si alguna fila vieja no cumple, queda un aviso y
-- la migración sigue.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_docs_id_len' and conrelid = 'public.user_docs'::regclass
  ) then
    alter table public.user_docs
      add constraint user_docs_id_len check (char_length(id) <= 64) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_docs_data_size' and conrelid = 'public.user_docs'::regclass
  ) then
    alter table public.user_docs
      add constraint user_docs_data_size check (pg_column_size(data) <= 65536) not valid;
  end if;
end;
$$;

do $$
begin
  alter table public.user_docs validate constraint user_docs_id_len;
exception when check_violation then
  raise notice 'user_docs: hay ids viejos de más de 64 caracteres; la regla aplica solo a escrituras nuevas';
end;
$$;

do $$
begin
  alter table public.user_docs validate constraint user_docs_data_size;
exception when check_violation then
  raise notice 'user_docs: hay documentos viejos de más de 64 KB; la regla aplica solo a escrituras nuevas';
end;
$$;

-- -----------------------------------------------------------------------------
-- Tope de documentos por usuario (100.000): evita que alguien llene la base.
-- Se revisa una vez por sentencia (no por fila) y solo cuenta a los usuarios
-- que recibieron filas NUEVAS; un upsert que solo actualiza no cuenta.
-- El conteo usa el índice (user_id, updated_at) y se corta en 100.001.
-- -----------------------------------------------------------------------------
create or replace function public.user_docs_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lleno uuid;
begin
  select n.user_id into lleno
  from (select distinct user_id from nuevos) n
  where (
    select count(*) from (
      select 1 from public.user_docs d where d.user_id = n.user_id limit 100001
    ) c
  ) > 100000
  limit 1;

  if lleno is not null then
    raise exception 'user_docs_limit: máximo 100000 documentos por usuario'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists user_docs_cap on public.user_docs;
create trigger user_docs_cap
  after insert on public.user_docs
  referencing new table as nuevos
  for each statement execute function public.user_docs_cap();


-- =============================================================================
-- 2) leaderboard (ranking)
-- =============================================================================

-- Permisos: igual que arriba (sin TRUNCATE/REFERENCES/TRIGGER para nadie)
revoke all on public.leaderboard from anon;
revoke all on public.leaderboard from authenticated;
grant select, insert, update, delete on public.leaderboard to authenticated;

-- El guardián se quita mientras corregimos los datos viejos (si no, el límite de
-- 30 s podría frenar esta misma migración). Se vuelve a crear más abajo.
drop trigger if exists leaderboard_guard on public.leaderboard;

-- -----------------------------------------------------------------------------
-- Corregir filas existentes para que cumplan las reglas nuevas
-- -----------------------------------------------------------------------------

-- Alias: fuera caracteres de control e invisibles (ancho cero, cambios de dirección).
-- Si al limpiarlo queda demasiado corto, se usa un alias genérico.
update public.leaderboard l
set alias = case when char_length(c.limpio) >= 2 then c.limpio else 'Jugador' end
from (
  select user_id,
         btrim(regexp_replace(alias, '[[:cntrl:]\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]', '', 'g')) as limpio
  from public.leaderboard
  where alias ~ '[[:cntrl:]\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]'
) c
where l.user_id = c.user_id;

-- Nivel, avatar y ropa dentro de rango
update public.leaderboard
set level = least(greatest(level, 1), 999)
where level not between 1 and 999;

update public.leaderboard
set avatar = 0
where avatar not between 0 and 50;

update public.leaderboard
set wardrobe = '{}'::jsonb
where jsonb_typeof(wardrobe) <> 'object' or pg_column_size(wardrobe) > 512;

-- -----------------------------------------------------------------------------
-- Reglas (CHECK)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_level_range' and conrelid = 'public.leaderboard'::regclass
  ) then
    alter table public.leaderboard
      add constraint leaderboard_level_range check (level between 1 and 999) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_avatar_range' and conrelid = 'public.leaderboard'::regclass
  ) then
    alter table public.leaderboard
      add constraint leaderboard_avatar_range check (avatar between 0 and 50) not valid;
  end if;

  -- La ropa del avatar: un objeto JSON pequeño (unos pocos ids del catálogo)
  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_wardrobe_shape' and conrelid = 'public.leaderboard'::regclass
  ) then
    alter table public.leaderboard
      add constraint leaderboard_wardrobe_shape
      check (jsonb_typeof(wardrobe) = 'object' and pg_column_size(wardrobe) <= 512) not valid;
  end if;

  -- Alias visible: sin caracteres de control ni invisibles (ancho cero, cambios de dirección)
  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_alias_visible' and conrelid = 'public.leaderboard'::regclass
  ) then
    alter table public.leaderboard
      add constraint leaderboard_alias_visible
      check (alias !~ '[[:cntrl:]\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]') not valid;
  end if;
end;
$$;

-- Los datos viejos ya se corrigieron arriba: validar debería pasar siempre
alter table public.leaderboard validate constraint leaderboard_level_range;
alter table public.leaderboard validate constraint leaderboard_avatar_range;
alter table public.leaderboard validate constraint leaderboard_wardrobe_shape;
alter table public.leaderboard validate constraint leaderboard_alias_visible;

-- -----------------------------------------------------------------------------
-- Guardián del ranking (antes de cada insert/update):
--   · La semana la pone el servidor (UTC), así nadie publica en semanas pasadas
--     o futuras. Cerca de la medianoche del domingo puede diferir de la del
--     teléfono: manda la del servidor (la app ya lo tiene en cuenta).
--   · Máximo una publicación cada 30 s por usuario. La app trata este error
--     como "sin cambios" y conserva el puntaje anterior.
-- -----------------------------------------------------------------------------
create or replace function public.leaderboard_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.updated_at > now() - interval '30 seconds' then
    raise exception 'rate_limited: espera 30 segundos antes de volver a publicar en el ranking'
      using errcode = 'P0001', hint = 'leaderboard_rate_limited';
  end if;
  new.week := to_char(now() at time zone 'utc', 'IYYY-"W"IW');
  return new;
end;
$$;

create trigger leaderboard_guard
  before insert or update on public.leaderboard
  for each row execute function public.leaderboard_guard();
