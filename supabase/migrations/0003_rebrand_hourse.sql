-- Rebrand billing variant display names from CanvasAI → Hourse.
-- Do NOT re-run 0001 or 0002. Apply this file only.
-- Idempotent. Does not touch credits, payments, subscriptions, projects, auth, or RLS.

update public.billing_variants
set
  name = 'Free',
  updated_at = now()
where code = 'free'
  and name is distinct from 'Free';

update public.billing_variants
set
  name = 'Creator',
  updated_at = now()
where code = 'creator_monthly'
  and name is distinct from 'Creator';

update public.billing_variants
set
  name = 'Pro',
  updated_at = now()
where code = 'pro_monthly'
  and name is distinct from 'Pro';

update public.billing_variants
set
  name = 'Credit Pack 50',
  updated_at = now()
where code = 'credit_pack'
  and name is distinct from 'Credit Pack 50';

-- Optional comment: productName lives in app config (Hourse Creator / Pro / Credit Pack).
-- display_price already USD from 0002; leave amounts untouched.

-- Align DB default project name with English product copy (app already sends Untitled project).
alter table public.projects
  alter column name set default 'Untitled project';
