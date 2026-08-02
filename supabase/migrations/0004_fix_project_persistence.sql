-- Fix project persistence: simplify UPDATE RLS with_check and ensure storage buckets.
-- Do NOT re-run 0001–0003. Apply this file only on already-migrated databases.
-- Idempotent. Preserves users, projects, credits, payments, auth, and RLS intent.

-- ---------------------------------------------------------------------------
-- projects UPDATE policy: previous with_check subquery could reject valid updates
-- ---------------------------------------------------------------------------
drop policy if exists "projects_update_own" on public.projects;

create policy "projects_update_own"
  on public.projects
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Owner reassignment remains blocked by projects_prevent_owner_change trigger.

-- ---------------------------------------------------------------------------
-- Ensure private storage buckets exist (safe if already created by 0001)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('user-assets', 'user-assets', false, 20971520, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('generated-assets', 'generated-assets', false, 20971520, array['image/png','image/jpeg','image/webp']),
  ('project-thumbnails', 'project-thumbnails', false, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on column public.projects.canvas_json is
  'Fabric.js canvas JSON (JSONB). Must be plain JSON without Fabric runtime instances.';

comment on column public.projects.updated_at is
  'Optimistic concurrency token for autosave. Clients send expectedUpdatedAt.';
