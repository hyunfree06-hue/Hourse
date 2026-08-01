-- CanvasAI initial schema
-- Profiles, projects, assets, AI generations, credits, billing, webhooks, storage RLS

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('signup_free_credits', '10'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  credit_balance integer not null default 0 check (credit_balance >= 0),
  plan_code text not null default 'free',
  free_credits_granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and credit_balance = (select p.credit_balance from public.profiles p where p.id = auth.uid())
    and free_credits_granted = (select p.free_credits_granted from public.profiles p where p.id = auth.uid())
    and plan_code = (select p.plan_code from public.profiles p where p.id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default '제목 없는 디자인',
  canvas_json jsonb,
  canvas_width integer not null default 1920,
  canvas_height integer not null default 1080,
  background_color text not null default '#ffffff',
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz
);

create index projects_user_id_updated_at_idx
  on public.projects (user_id, updated_at desc);

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "projects_select_own"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "projects_insert_own"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "projects_update_own"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and user_id = (select p.user_id from public.projects p where p.id = projects.id));

create policy "projects_delete_own"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Prevent user_id reassignment via trigger
create or replace function public.prevent_project_owner_change()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'project owner cannot be changed';
  end if;
  return new;
end;
$$;

create trigger projects_prevent_owner_change
before update on public.projects
for each row execute function public.prevent_project_owner_change();

-- ---------------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  asset_type text not null check (asset_type in ('upload', 'generated', 'thumbnail', 'reference')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  file_size integer,
  width integer,
  height integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index assets_user_project_idx on public.assets (user_id, project_id);

alter table public.assets enable row level security;

create policy "assets_select_own"
  on public.assets for select using (auth.uid() = user_id);
create policy "assets_insert_own"
  on public.assets for insert with check (auth.uid() = user_id);
create policy "assets_update_own"
  on public.assets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assets_delete_own"
  on public.assets for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ai_generations
-- ---------------------------------------------------------------------------
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null,
  model text not null,
  mode text not null check (mode in ('generate', 'edit', 'replace')),
  prompt text not null,
  negative_prompt text,
  quality text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  source_asset_id uuid references public.assets(id) on delete set null,
  output_asset_id uuid references public.assets(id) on delete set null,
  provider_request_id text,
  selection_data jsonb,
  credits_charged integer not null default 0,
  idempotency_key text not null unique,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ai_generations_user_created_idx
  on public.ai_generations (user_id, created_at desc);
create index ai_generations_status_idx
  on public.ai_generations (status) where status in ('queued', 'processing');

alter table public.ai_generations enable row level security;

create policy "ai_generations_select_own"
  on public.ai_generations for select using (auth.uid() = user_id);
create policy "ai_generations_insert_own"
  on public.ai_generations for insert with check (auth.uid() = user_id);
create policy "ai_generations_update_own"
  on public.ai_generations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- credit_ledger
-- ---------------------------------------------------------------------------
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (reason in (
    'signup_bonus',
    'generation',
    'generation_refund',
    'subscription_initial',
    'subscription_renewal',
    'credit_pack',
    'payment_refund',
    'admin_adjustment'
  )),
  generation_id uuid references public.ai_generations(id) on delete set null,
  payment_id uuid,
  idempotency_key text not null unique,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

create policy "credit_ledger_select_own"
  on public.credit_ledger for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- billing_variants
-- ---------------------------------------------------------------------------
create table public.billing_variants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  lemon_variant_id text not null unique,
  billing_type text not null check (billing_type in ('subscription', 'credit_pack')),
  credits integer not null check (credits >= 0),
  plan_code text,
  display_price text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger billing_variants_set_updated_at
before update on public.billing_variants
for each row execute function public.set_updated_at();

alter table public.billing_variants enable row level security;

create policy "billing_variants_public_read_active"
  on public.billing_variants for select
  using (active = true);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lemon_subscription_id text not null unique,
  lemon_customer_id text,
  lemon_order_id text,
  lemon_variant_id text,
  status text not null,
  renews_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz,
  customer_portal_url text,
  update_payment_method_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own"
  on public.subscriptions for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lemon_order_id text not null unique,
  lemon_invoice_id text,
  lemon_variant_id text,
  payment_type text not null,
  status text not null,
  amount integer not null default 0,
  currency text not null default 'USD',
  credits_granted integer not null default 0,
  test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_user_id_idx on public.payments (user_id);

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

create policy "payments_select_own"
  on public.payments for select using (auth.uid() = user_id);

alter table public.credit_ledger
  add constraint credit_ledger_payment_id_fkey
  foreign key (payment_id) references public.payments(id) on delete set null;

-- ---------------------------------------------------------------------------
-- webhook_events
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_name text not null,
  external_id text not null,
  payload jsonb not null,
  processed boolean not null default false,
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_name, external_id)
);

alter table public.webhook_events enable row level security;
-- no client policies

-- ---------------------------------------------------------------------------
-- Credit functions (SECURITY DEFINER, locked search_path)
-- ---------------------------------------------------------------------------
create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_generation_id uuid default null,
  p_payment_id uuid default null,
  p_metadata jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_existing integer;
begin
  if p_amount <= 0 then
    raise exception 'grant amount must be positive';
  end if;

  select balance_after into v_existing
  from public.credit_ledger
  where idempotency_key = p_idempotency_key;

  if found then
    return v_existing;
  end if;

  select credit_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  v_balance := v_balance + p_amount;

  update public.profiles
  set credit_balance = v_balance, updated_at = now()
  where id = p_user_id;

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, generation_id, payment_id, idempotency_key, metadata
  ) values (
    p_user_id, p_amount, v_balance, p_reason, p_generation_id, p_payment_id, p_idempotency_key, p_metadata
  );

  return v_balance;
end;
$$;

create or replace function public.consume_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_generation_id uuid default null,
  p_metadata jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_existing integer;
begin
  if p_amount <= 0 then
    raise exception 'consume amount must be positive';
  end if;

  select balance_after into v_existing
  from public.credit_ledger
  where idempotency_key = p_idempotency_key;

  if found then
    return v_existing;
  end if;

  select credit_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_balance < p_amount then
    raise exception 'insufficient_credits';
  end if;

  v_balance := v_balance - p_amount;

  update public.profiles
  set credit_balance = v_balance, updated_at = now()
  where id = p_user_id;

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, generation_id, idempotency_key, metadata
  ) values (
    p_user_id, -p_amount, v_balance, p_reason, p_generation_id, p_idempotency_key, p_metadata
  );

  return v_balance;
end;
$$;

create or replace function public.refund_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_generation_id uuid default null,
  p_payment_id uuid default null,
  p_metadata jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_existing integer;
begin
  if p_amount <= 0 then
    raise exception 'refund amount must be positive';
  end if;

  select balance_after into v_existing
  from public.credit_ledger
  where idempotency_key = p_idempotency_key;

  if found then
    return v_existing;
  end if;

  select credit_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  v_balance := v_balance + p_amount;

  update public.profiles
  set credit_balance = v_balance, updated_at = now()
  where id = p_user_id;

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, generation_id, payment_id, idempotency_key, metadata
  ) values (
    p_user_id, p_amount, v_balance, p_reason, p_generation_id, p_payment_id, p_idempotency_key, p_metadata
  );

  return v_balance;
end;
$$;

revoke all on function public.grant_credits(uuid, integer, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.consume_credits(uuid, integer, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.refund_credits(uuid, integer, text, text, uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.grant_credits(uuid, integer, text, text, uuid, uuid, jsonb) to service_role;
grant execute on function public.consume_credits(uuid, integer, text, text, uuid, jsonb) to service_role;
grant execute on function public.refund_credits(uuid, integer, text, text, uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Signup trigger: profile + free credits
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer := 10;
  v_name text;
  v_avatar text;
begin
  begin
    select (value #>> '{}')::integer into v_credits
    from public.app_settings
    where key = 'signup_free_credits';
  exception when others then
    v_credits := 10;
  end;

  if v_credits is null or v_credits < 0 then
    v_credits := 10;
  end if;

  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );
  v_avatar := coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  );

  insert into public.profiles (
    id, email, display_name, avatar_url, credit_balance, plan_code, free_credits_granted
  ) values (
    new.id, new.email, v_name, v_avatar, v_credits, 'free', true
  )
  on conflict (id) do nothing;

  if found or (select free_credits_granted from public.profiles where id = new.id) then
    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, idempotency_key, metadata
    ) values (
      new.id,
      v_credits,
      v_credits,
      'signup_bonus',
      'signup_bonus:' || new.id::text,
      jsonb_build_object('source', 'auth_trigger')
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage buckets (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('user-assets', 'user-assets', false, 10485760, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('generated-assets', 'generated-assets', false, 20971520, array['image/png','image/jpeg','image/webp']),
  ('project-thumbnails', 'project-thumbnails', false, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Storage path first segment must equal auth.uid()
create policy "storage_user_assets_select"
  on storage.objects for select
  using (
    bucket_id in ('user-assets', 'generated-assets', 'project-thumbnails')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "storage_user_assets_insert"
  on storage.objects for insert
  with check (
    bucket_id in ('user-assets', 'generated-assets', 'project-thumbnails')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "storage_user_assets_update"
  on storage.objects for update
  using (
    bucket_id in ('user-assets', 'generated-assets', 'project-thumbnails')
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id in ('user-assets', 'generated-assets', 'project-thumbnails')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "storage_user_assets_delete"
  on storage.objects for delete
  using (
    bucket_id in ('user-assets', 'generated-assets', 'project-thumbnails')
    and auth.uid()::text = (storage.foldername(name))[1]
  );
