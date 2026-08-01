-- CanvasAI: switch billing display and variant catalog to USD
-- Do NOT re-run 0001_initial.sql. Apply this file only (SQL Editor or CLI).
-- Idempotent where practical. Does not rewrite historical payment amounts.

-- ---------------------------------------------------------------------------
-- payments: document amount is integer cents; currency from webhook (USD live)
-- ---------------------------------------------------------------------------
comment on column public.payments.amount is
  'Charge amount in the smallest currency unit (cents for USD). Stored as integer.';
comment on column public.payments.currency is
  'ISO 4217 currency from Lemon Squeezy. Live catalog products are USD-only.';

-- ---------------------------------------------------------------------------
-- billing_variants: allow free type + nullable variant id + USD price columns
-- ---------------------------------------------------------------------------
alter table public.billing_variants
  drop constraint if exists billing_variants_billing_type_check;

alter table public.billing_variants
  add constraint billing_variants_billing_type_check
  check (billing_type in ('free', 'subscription', 'credit_pack'));

alter table public.billing_variants
  alter column lemon_variant_id drop not null;

-- Keep uniqueness for non-null lemon_variant_id values
alter table public.billing_variants
  drop constraint if exists billing_variants_lemon_variant_id_key;

create unique index if not exists billing_variants_lemon_variant_id_uidx
  on public.billing_variants (lemon_variant_id)
  where lemon_variant_id is not null;

alter table public.billing_variants
  add column if not exists price_amount_cents integer;

alter table public.billing_variants
  add column if not exists currency text;

update public.billing_variants
set
  price_amount_cents = coalesce(price_amount_cents, 0),
  currency = coalesce(nullif(currency, ''), 'USD')
where price_amount_cents is null or currency is null;

alter table public.billing_variants
  alter column price_amount_cents set default 0;

alter table public.billing_variants
  alter column currency set default 'USD';

alter table public.billing_variants
  alter column price_amount_cents set not null;

alter table public.billing_variants
  alter column currency set not null;

alter table public.billing_variants
  drop constraint if exists billing_variants_price_amount_cents_check;

alter table public.billing_variants
  add constraint billing_variants_price_amount_cents_check
  check (price_amount_cents >= 0);

alter table public.billing_variants
  drop constraint if exists billing_variants_currency_check;

alter table public.billing_variants
  add constraint billing_variants_currency_check
  check (currency = 'USD');

-- ---------------------------------------------------------------------------
-- Upsert catalog rows (codes match app: free / creator_monthly / pro_monthly / credit_pack)
-- Placeholder lemon_variant_id values remain until env-driven Live IDs are set in app.
-- ---------------------------------------------------------------------------
insert into public.billing_variants as bv (
  code,
  name,
  lemon_variant_id,
  billing_type,
  credits,
  plan_code,
  display_price,
  price_amount_cents,
  currency,
  active
) values
  (
    'free',
    'Free',
    null,
    'free',
    10,
    'free',
    '$0',
    0,
    'USD',
    true
  ),
  (
    'creator_monthly',
    'Creator',
    'REPLACE_CREATOR_VARIANT',
    'subscription',
    100,
    'creator',
    '$19/month',
    1900,
    'USD',
    true
  ),
  (
    'pro_monthly',
    'Pro',
    'REPLACE_PRO_VARIANT',
    'subscription',
    300,
    'pro',
    '$49/month',
    4900,
    'USD',
    true
  ),
  (
    'credit_pack',
    'Credit Pack 50',
    'REPLACE_PACK_VARIANT',
    'credit_pack',
    50,
    null,
    '$9.99',
    999,
    'USD',
    true
  )
on conflict (code) do update set
  name = excluded.name,
  billing_type = excluded.billing_type,
  credits = excluded.credits,
  plan_code = excluded.plan_code,
  display_price = excluded.display_price,
  price_amount_cents = excluded.price_amount_cents,
  currency = excluded.currency,
  active = excluded.active,
  -- Keep existing lemon_variant_id if already replaced with a real ID
  lemon_variant_id = case
    when bv.lemon_variant_id is null then excluded.lemon_variant_id
    when bv.lemon_variant_id like 'REPLACE_%' then excluded.lemon_variant_id
    else bv.lemon_variant_id
  end,
  updated_at = now();
