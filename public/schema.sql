-- TradeTracker Database Schema
-- Run this in your Supabase SQL Editor to initialize the project.

-- 1. PROFILES
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  app_title text default 'TradeTracker',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Function to handle new user signup automatically
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. STRATEGIES
create table public.strategies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  description text,
  capital_allocation numeric default 0,
  status text default 'active', -- 'active' or 'closed'
  benchmark_ticker text default 'SPY',
  is_hidden boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.strategies enable row level security;

create policy "Users can crud own strategies" on public.strategies
  for all using (auth.uid() = user_id);

-- 3. TAGS
create table public.tags (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  strategy_id uuid references public.strategies(id) on delete cascade,
  name text not null,
  show_on_dashboard boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.tags enable row level security;

create policy "Users can crud own tags" on public.tags
  for all using (auth.uid() = user_id);

-- 4. TRADES
create table public.trades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  strategy_id uuid references public.strategies(id),
  pair_id text, -- Used for grouping multiple legs (random uuid string usually)
  tag_id uuid references public.tags(id),
  symbol text not null,
  date timestamp with time zone not null,
  action text not null, -- BUY_TO_OPEN, SELL_TO_OPEN, etc.
  quantity numeric not null,
  price numeric not null, -- Unit price
  fees numeric default 0,
  amount numeric not null, -- Net cash flow
  multiplier numeric default 100, -- 100 for options, 1 for stock, 50 for /ES
  asset_type text default 'OPTION', -- OPTION, STOCK, FUTURES
  mark_price numeric, -- Current market price (if open)
  notes text,
  hidden boolean default false,
  import_hash text, -- For preventing duplicates during CSV import
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.trades enable row level security;

create policy "Users can crud own trades" on public.trades
  for all using (auth.uid() = user_id);

-- 5. NET LIQUIDITY LOGS (For Dashboard Chart)
create table public.net_liquidity_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  date date not null,
  amount numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, date)
);

alter table public.net_liquidity_logs enable row level security;

create policy "Users can crud own net liq logs" on public.net_liquidity_logs
  for all using (auth.uid() = user_id);

-- 6. CAPITAL FLOWS (Deposits/Withdrawals)
create table public.capital_flows (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  date date not null,
  amount numeric not null, -- Positive for deposit, Negative for withdrawal
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.capital_flows enable row level security;

create policy "Users can crud own capital flows" on public.capital_flows
  for all using (auth.uid() = user_id);

-- 7. BENCHMARK PRICES (Shared data, but keyed by user for caching simplicity per deployment)
-- Note: In a real SaaS, this might be a shared public table, but for personal deployments, 
-- each user fetches their own benchmark data.
create table public.benchmark_prices (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users, -- Optional if we want to share, but let's keep it private for now
  ticker text not null,
  date date not null,
  price numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, ticker, date)
);

alter table public.benchmark_prices enable row level security;

create policy "Users can crud own benchmark prices" on public.benchmark_prices
  for all using (auth.uid() = user_id);

-- 8. INDEXES (Performance)
create index idx_trades_user_date on public.trades(user_id, date);
create index idx_trades_strategy on public.trades(strategy_id);
create index idx_net_liq_user_date on public.net_liquidity_logs(user_id, date); 
