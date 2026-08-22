-- =========================================================
-- MOTHERBOARD PRODUCTION & YIELD REPORTING SYSTEM
-- Supabase schema
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- LINES ----------
create table if not exists public.lines (
  id uuid primary key default gen_random_uuid(),
  line_number text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- MODELS ----------
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  fg_code text not null unique,
  model_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- SHIFTS ----------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  shift_code text not null unique,       -- A, B, C
  shift_name text not null,              -- A Shift
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- USERS (simple app-level accounts, not Supabase Auth) ----------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  pin text not null,
  full_name text not null,
  role text not null check (role in ('admin','operator')) default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- TARGETS (per line + model hourly target) ----------
create table if not exists public.targets (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.lines(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete cascade,
  target_per_hour numeric not null default 0 check (target_per_hour >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(line_id, model_id)
);

-- ---------- PRODUCTION REPORTS (one per date+shift+line+model) ----------
create table if not exists public.production_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  shift_id uuid not null references public.shifts(id),
  line_id uuid not null references public.lines(id),
  model_id uuid not null references public.models(id),
  shift_incharge text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(report_date, shift_id, line_id, model_id)
);

-- ---------- HOURLY PRODUCTION ----------
create table if not exists public.hourly_production (
  id uuid primary key default gen_random_uuid(),
  production_report_id uuid not null references public.production_reports(id) on delete cascade,
  time_slot text not null,          -- '06:00 - 07:00'
  slot_order smallint not null default 0,
  target_production numeric not null default 0 check (target_production >= 0),
  overall_production numeric not null default 0 check (overall_production >= 0),
  top_production numeric not null default 0 check (top_production >= 0),
  bottom_production numeric not null default 0 check (bottom_production >= 0),
  overall_yield numeric not null default 0 check (overall_yield >= 0),
  top_yield numeric not null default 0 check (top_yield >= 0),
  bottom_yield numeric not null default 0 check (bottom_yield >= 0),
  issues text default '',
  status text not null default 'pending' check (status in ('pending','saved','completed')),
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(production_report_id, time_slot)
);

create index if not exists idx_hourly_report on public.hourly_production(production_report_id);
create index if not exists idx_reports_date on public.production_reports(report_date);
create index if not exists idx_reports_line on public.production_reports(line_id);
create index if not exists idx_reports_model on public.production_reports(model_id);
create index if not exists idx_reports_shift on public.production_reports(shift_id);

-- ---------- RLS (internal factory tool - anon key used from trusted LAN, open policies) ----------
alter table public.lines enable row level security;
alter table public.models enable row level security;
alter table public.shifts enable row level security;
alter table public.users enable row level security;
alter table public.targets enable row level security;
alter table public.production_reports enable row level security;
alter table public.hourly_production enable row level security;

create policy "allow all - lines" on public.lines for all using (true) with check (true);
create policy "allow all - models" on public.models for all using (true) with check (true);
create policy "allow all - shifts" on public.shifts for all using (true) with check (true);
create policy "allow all - users" on public.users for all using (true) with check (true);
create policy "allow all - targets" on public.targets for all using (true) with check (true);
create policy "allow all - production_reports" on public.production_reports for all using (true) with check (true);
create policy "allow all - hourly_production" on public.hourly_production for all using (true) with check (true);

-- ---------- REALTIME ----------
alter publication supabase_realtime add table public.production_reports;
alter publication supabase_realtime add table public.hourly_production;
