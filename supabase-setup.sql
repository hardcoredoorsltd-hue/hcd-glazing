-- Run this in Supabase → SQL Editor → New query

-- 1. Create the table
create table if not exists glazing_store (
  id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- 2. Insert the initial empty row
insert into glazing_store (id, data)
values ('main', '{}')
on conflict (id) do nothing;

-- 3. Enable Row Level Security (keeps your data private)
alter table glazing_store enable row level security;

-- 4. Allow full access (app uses private URL, no login needed)
create policy "Allow all access" on glazing_store
  for all using (true) with check (true);

-- 5. Enable real-time sync
alter publication supabase_realtime add table glazing_store;
