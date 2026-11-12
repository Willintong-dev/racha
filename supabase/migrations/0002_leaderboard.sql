-- =============================================================================
-- Racha · Fase 4: Ranking de salud financiera (opcional)
-- -----------------------------------------------------------------------------
-- Una fila por usuario que decidió participar. Solo guarda datos "de juego":
-- alias, avatar, ropa del avatar, puntaje (0–100), nivel y semana ISO.
-- NUNCA se guardan montos, saldos, ingresos ni nada de dinero.
-- Los alias y puntajes son públicos para cualquier usuario con sesión (por diseño).
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =============================================================================

create table if not exists public.leaderboard (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  alias      text        not null check (char_length(alias) between 2 and 20),
  avatar     int         not null default 0,
  wardrobe   jsonb       not null default '{}'::jsonb,
  score      int         not null check (score between 0 and 100),
  level      int         not null default 1,
  -- Semana ISO, p. ej. '2026-W46'
  week       text        not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  updated_at timestamptz not null default now()
);

comment on table public.leaderboard is 'Ranking semanal opcional: alias + avatar + puntaje de salud financiera. Sin montos.';

-- Consulta típica: filas de la semana ordenadas por puntaje y nivel
create index if not exists leaderboard_week_score_idx
  on public.leaderboard (week, score desc, level desc);

-- updated_at lo pone el servidor (el cliente no puede falsearlo)
create or replace function public.leaderboard_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leaderboard_touch on public.leaderboard;
create trigger leaderboard_touch
  before insert or update on public.leaderboard
  for each row execute function public.leaderboard_touch();

-- -----------------------------------------------------------------------------
-- Seguridad a nivel de fila (RLS)
-- -----------------------------------------------------------------------------
alter table public.leaderboard enable row level security;

-- Solo usuarios con sesión; los anónimos no ven nada
revoke all on public.leaderboard from anon;
grant select, insert, update, delete on public.leaderboard to authenticated;

-- Leer: cualquier usuario con sesión ve todas las filas (alias y puntajes son públicos)
drop policy if exists "leaderboard: leer todos" on public.leaderboard;
create policy "leaderboard: leer todos"
  on public.leaderboard for select
  to authenticated
  using (true);

-- Crear: solo tu propia fila
drop policy if exists "leaderboard: crear la mía" on public.leaderboard;
create policy "leaderboard: crear la mía"
  on public.leaderboard for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Actualizar: solo tu propia fila (y no puedes pasarla a otro usuario)
drop policy if exists "leaderboard: actualizar la mía" on public.leaderboard;
create policy "leaderboard: actualizar la mía"
  on public.leaderboard for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Borrar ("Salir del ranking"): solo tu propia fila
drop policy if exists "leaderboard: borrar la mía" on public.leaderboard;
create policy "leaderboard: borrar la mía"
  on public.leaderboard for delete
  to authenticated
  using (user_id = (select auth.uid()));
