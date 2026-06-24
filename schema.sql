-- ============================================================
-- Quilt Auction App — Supabase Schema
-- Run this in the Supabase SQL editor to set up the database.
-- ============================================================

-- ── Profiles (extends auth.users) ────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  full_name   text not null,
  is_admin    boolean not null default false,
  is_approved boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Pending account requests (before admin approval creates a real user)
create table public.account_requests (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  username    text not null,
  password    text not null,   -- stored temporarily, cleared after approval
  created_at  timestamptz not null default now()
);

-- ── Quilts ───────────────────────────────────────────────────
create table public.quilts (
  id           uuid primary key default gen_random_uuid(),
  quilt_number integer unique not null,
  name         text not null,
  width_in     numeric not null,
  height_in    numeric not null,
  piecer_name  text not null,
  quilter_name text not null,
  sales_pitch  text,
  photo_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create sequence public.quilt_number_seq start 1;

-- ── Bidders ──────────────────────────────────────────────────
create table public.bidders (
  id             uuid primary key default gen_random_uuid(),
  bidder_number  integer unique not null,
  name           text not null,
  address        text,
  phone          text,
  email          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create sequence public.bidder_number_seq start 1;

-- ── Bid Records ───────────────────────────────────────────────
create table public.bid_records (
  id                    uuid primary key default gen_random_uuid(),
  quilt_id              uuid not null references public.quilts(id) on delete cascade,

  user_a_id             uuid references public.profiles(id),
  user_a_bid            numeric,
  user_a_bidder_number  integer,
  user_a_submitted_at   timestamptz,

  user_b_id             uuid references public.profiles(id),
  user_b_bid            numeric,
  user_b_bidder_number  integer,
  user_b_submitted_at   timestamptz,

  mismatch              boolean not null default false,

  resolved_bid          numeric,
  resolved_bidder_number integer,
  resolved_bidder_id    uuid references public.bidders(id),
  is_finalized          boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique(quilt_id)
);

-- ── Checkout Records ──────────────────────────────────────────
create table public.checkout_records (
  id                uuid primary key default gen_random_uuid(),
  bidder_id         uuid not null references public.bidders(id) on delete cascade,
  total_due         numeric not null default 0,
  amount_remitted   numeric not null default 0,
  payment_mismatch  boolean not null default false,
  checkout_confirmed boolean not null default false,
  confirmed_by      uuid references public.profiles(id),
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique(bidder_id)
);

-- Payment lines (one or more per checkout)
create table public.payment_lines (
  id                 uuid primary key default gen_random_uuid(),
  checkout_record_id uuid not null references public.checkout_records(id) on delete cascade,
  amount             numeric not null,
  method             text not null check (method in ('cash','check','credit card')),
  created_at         timestamptz not null default now()
);

-- Per-quilt delivery tracking inside a checkout
create table public.quilt_deliveries (
  id                 uuid primary key default gen_random_uuid(),
  checkout_record_id uuid not null references public.checkout_records(id) on delete cascade,
  quilt_id           uuid not null references public.quilts(id),
  delivered          boolean not null default false,
  delivered_at       timestamptz,
  unique(checkout_record_id, quilt_id)
);

-- ── Helper functions ──────────────────────────────────────────

-- Auto-assign quilt number
create or replace function public.assign_quilt_number()
returns trigger language plpgsql as $$
begin
  new.quilt_number := nextval('public.quilt_number_seq');
  return new;
end;
$$;

create trigger trg_assign_quilt_number
before insert on public.quilts
for each row when (new.quilt_number is null)
execute function public.assign_quilt_number();

-- Auto-assign bidder number
create or replace function public.assign_bidder_number()
returns trigger language plpgsql as $$
begin
  new.bidder_number := nextval('public.bidder_number_seq');
  return new;
end;
$$;

create trigger trg_assign_bidder_number
before insert on public.bidders
for each row when (new.bidder_number is null)
execute function public.assign_bidder_number();

-- Update updated_at timestamps
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_quilts_updated_at before update on public.quilts
  for each row execute function public.touch_updated_at();
create trigger trg_bidders_updated_at before update on public.bidders
  for each row execute function public.touch_updated_at();
create trigger trg_bid_records_updated_at before update on public.bid_records
  for each row execute function public.touch_updated_at();
create trigger trg_checkout_records_updated_at before update on public.checkout_records
  for each row execute function public.touch_updated_at();

-- Create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, full_name, is_admin, is_approved)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false),
    coalesce((new.raw_user_meta_data->>'is_approved')::boolean, false)
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ── Row-level security ────────────────────────────────────────

alter table public.profiles          enable row level security;
alter table public.account_requests  enable row level security;
alter table public.quilts            enable row level security;
alter table public.bidders           enable row level security;
alter table public.bid_records       enable row level security;
alter table public.checkout_records  enable row level security;
alter table public.payment_lines     enable row level security;
alter table public.quilt_deliveries  enable row level security;

-- Helper: is the current user an approved admin?
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true and is_approved = true
  );
$$;

-- Helper: is the current user approved?
create or replace function public.is_approved()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_approved = true
  );
$$;

-- profiles: users see their own row; admins see all
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "profiles_update_admin" on public.profiles for update
  using (public.is_admin());

-- account_requests: anyone can insert; only admins can read/delete
create policy "account_requests_insert" on public.account_requests for insert
  with check (true);
create policy "account_requests_admin_select" on public.account_requests for select
  using (public.is_admin());
create policy "account_requests_admin_delete" on public.account_requests for delete
  using (public.is_admin());

-- quilts: approved users full CRUD
create policy "quilts_all" on public.quilts for all
  using (public.is_approved()) with check (public.is_approved());

-- bidders: approved users full CRUD
create policy "bidders_all" on public.bidders for all
  using (public.is_approved()) with check (public.is_approved());

-- bid_records: approved users full CRUD
create policy "bid_records_all" on public.bid_records for all
  using (public.is_approved()) with check (public.is_approved());

-- checkout_records: approved users full CRUD
create policy "checkout_all" on public.checkout_records for all
  using (public.is_approved()) with check (public.is_approved());

-- payment_lines: approved users full CRUD
create policy "payment_lines_all" on public.payment_lines for all
  using (public.is_approved()) with check (public.is_approved());

-- quilt_deliveries: approved users full CRUD
create policy "quilt_deliveries_all" on public.quilt_deliveries for all
  using (public.is_approved()) with check (public.is_approved());

-- ── Storage bucket for quilt photos ──────────────────────────
-- Run in Supabase dashboard: Storage → New bucket → "quilt-photos", public = true
-- Or via SQL:
-- insert into storage.buckets (id, name, public) values ('quilt-photos', 'quilt-photos', true);

-- ── Seed first admin account ──────────────────────────────────
-- After running this schema, create the first admin via Supabase Auth dashboard:
--   Authentication → Users → Invite user (set email + password)
-- Then run:
--   update public.profiles set is_admin = true, is_approved = true where username = 'your_username';
