-- Local seed aligned with USD catalog (does not overwrite Live lemon_variant_id once set).
-- Prefer applying migrations; this seed mirrors 0002 catalog values for fresh local DBs.

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
  ('free', 'Free', null, 'free', 10, 'free', '$0', 0, 'USD', true),
  ('creator_monthly', 'Creator', 'REPLACE_CREATOR_VARIANT', 'subscription', 100, 'creator', '$19/month', 1900, 'USD', true),
  ('pro_monthly', 'Pro', 'REPLACE_PRO_VARIANT', 'subscription', 300, 'pro', '$49/month', 4900, 'USD', true),
  ('credit_pack', 'Credit Pack 50', 'REPLACE_PACK_VARIANT', 'credit_pack', 50, null, '$9.99', 999, 'USD', true)
on conflict (code) do update set
  name = excluded.name,
  billing_type = excluded.billing_type,
  credits = excluded.credits,
  plan_code = excluded.plan_code,
  display_price = excluded.display_price,
  price_amount_cents = excluded.price_amount_cents,
  currency = excluded.currency,
  active = excluded.active,
  lemon_variant_id = case
    when bv.lemon_variant_id is null then excluded.lemon_variant_id
    when bv.lemon_variant_id like 'REPLACE_%' then excluded.lemon_variant_id
    else bv.lemon_variant_id
  end,
  updated_at = now();
