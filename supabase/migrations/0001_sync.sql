-- =============================================================================
-- Racha · Sincronización en la nube (Fase 4)
--
-- Una sola tabla genérica guarda todos los documentos del usuario (perfil,
-- cuentas, movimientos y deudas) como JSON. La app es local-first: cada
-- dispositivo sube sus cambios y baja los de los demás usando `updated_at`.
--
-- Cómo aplicarla: pega este archivo completo en Supabase → SQL Editor → Run.
-- Se puede ejecutar varias veces sin romper nada.
-- =============================================================================

create table if not exists public.user_docs (
  -- Dueño del documento. Por defecto el usuario que hace la petición.
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  -- Tipo de documento (una "tabla" de la app)
  kind       text        not null check (kind in ('profile', 'account', 'transaction', 'debt')),
  -- Id del documento en la app (para el perfil es el mismo user_id)
  id         text        not null,
  -- El documento completo tal como lo guarda la app
  data       jsonb       not null,
  -- Lápida: true = el documento se borró (se conserva para que otros dispositivos lo borren)
  deleted    boolean     not null default false,
  -- Hora del servidor de la última escritura. La pone el trigger, nunca el cliente.
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

comment on table public.user_docs is 'Documentos de Racha sincronizados entre dispositivos (último en escribir gana).';

-- Para bajar "lo que cambió desde la última vez" rápido
create index if not exists user_docs_user_updated_idx on public.user_docs (user_id, updated_at);

-- -----------------------------------------------------------------------------
-- El reloj del servidor es la fuente de verdad: cada insert/update sella updated_at
-- -----------------------------------------------------------------------------
create or replace function public.user_docs_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_docs_touch on public.user_docs;
create trigger user_docs_touch
  before insert or update on public.user_docs
  for each row execute function public.user_docs_touch();

-- -----------------------------------------------------------------------------
-- Seguridad a nivel de fila: cada usuario solo ve y toca sus propios documentos
-- -----------------------------------------------------------------------------
alter table public.user_docs enable row level security;

drop policy if exists "user_docs: leer los propios" on public.user_docs;
create policy "user_docs: leer los propios" on public.user_docs
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_docs: crear los propios" on public.user_docs;
create policy "user_docs: crear los propios" on public.user_docs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_docs: editar los propios" on public.user_docs;
create policy "user_docs: editar los propios" on public.user_docs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "user_docs: borrar los propios" on public.user_docs;
create policy "user_docs: borrar los propios" on public.user_docs
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Permisos de tabla para la API (las políticas de arriba filtran las filas)
grant select, insert, update, delete on public.user_docs to authenticated;
