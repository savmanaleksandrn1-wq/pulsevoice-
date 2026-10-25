-- PulseVoice Supabase setup
-- Safe to run in a fresh Supabase project. All application tables use RLS.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Member' check (char_length(display_name) between 1 and 40),
  handle text not null unique check (handle ~ '^[a-zA-Z0-9_]{3,24}$'),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct','group')),
  title text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self check (sender_id <> receiver_id)
);
create unique index if not exists friend_requests_one_pending_direction
  on public.friend_requests(sender_id, receiver_id) where status = 'pending';

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
drop trigger if exists friend_requests_touch_updated_at on public.friend_requests;
create trigger friend_requests_touch_updated_at before update on public.friend_requests
for each row execute function public.touch_updated_at();

-- Create a safe public profile automatically when Auth creates a user.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  candidate text;
begin
  candidate := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'handle', ''), '[^a-zA-Z0-9_]', '', 'g'));
  candidate := substring(candidate from 1 for 24);
  if char_length(candidate) < 3 then
    candidate := 'user_' || substring(replace(new.id::text, '-', '') from 1 for 12);
  end if;
  if exists (select 1 from public.profiles p where p.handle = candidate and p.id <> new.id) then
    candidate := substring(candidate from 1 for 17) || '_' || substring(replace(new.id::text, '-', '') from 1 for 6);
  end if;
  insert into public.profiles(id, display_name, handle)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'Member'), 40),
    candidate
  )
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Used by RLS policies; SECURITY DEFINER avoids recursive member-table policies.
create or replace function public.is_conversation_member(target_conversation uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = target_conversation and m.user_id = auth.uid()
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Atomically create or reuse a direct conversation and add both members.
create or replace function public.create_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing_id uuid;
  new_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if target_user_id is null or target_user_id = me then raise exception 'Choose another user'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id) then raise exception 'User not found'; end if;
  select c.id into existing_id
  from public.conversations c
  where c.kind = 'direct'
    and exists (select 1 from public.conversation_members a where a.conversation_id = c.id and a.user_id = me)
    and exists (select 1 from public.conversation_members b where b.conversation_id = c.id and b.user_id = target_user_id)
    and (select count(*) from public.conversation_members n where n.conversation_id = c.id) = 2
  order by c.created_at desc limit 1;
  if existing_id is not null then return existing_id; end if;
  insert into public.conversations(kind, created_by) values ('direct', me) returning id into new_id;
  insert into public.conversation_members(conversation_id, user_id, role)
  values (new_id, me, 'owner'), (new_id, target_user_id, 'member');
  return new_id;
end;
$$;
revoke all on function public.create_direct_conversation(uuid) from public;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.friend_requests enable row level security;

-- Explicit grants used with the RLS policies below. Keep the browser key public,
-- but never grant it access to a service-role secret.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update(display_name, avatar_url) on public.profiles to authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant update(content) on public.messages to authenticated;
grant select, insert, delete on public.friend_requests to authenticated;
grant update(status) on public.friend_requests to authenticated;

-- Profiles expose only non-sensitive public fields; do NOT store emails here.
drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Conversations are only visible to their members. Creation happens via RPC above.
drop policy if exists "Members can read conversations" on public.conversations;
create policy "Members can read conversations" on public.conversations for select to authenticated using (public.is_conversation_member(id));

-- A user can see members only for conversations they belong to.
drop policy if exists "Members can view room membership" on public.conversation_members;
create policy "Members can view room membership" on public.conversation_members for select to authenticated using (public.is_conversation_member(conversation_id));

-- Message history and inserts are restricted to conversation members.
drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves" on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));
drop policy if exists "Sender can edit own messages" on public.messages;
create policy "Sender can edit own messages" on public.messages for update to authenticated using (sender_id = auth.uid() and public.is_conversation_member(conversation_id)) with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));
drop policy if exists "Sender can delete own messages" on public.messages;
create policy "Sender can delete own messages" on public.messages for delete to authenticated using (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- Friend requests: only sender creates; participants read; receiver decides.
drop policy if exists "Participants can read friend requests" on public.friend_requests;
create policy "Participants can read friend requests" on public.friend_requests for select to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());
drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests" on public.friend_requests for insert to authenticated with check (sender_id = auth.uid() and receiver_id <> auth.uid() and status = 'pending');
drop policy if exists "Receivers can respond to friend requests" on public.friend_requests;
create policy "Receivers can respond to friend requests" on public.friend_requests for update to authenticated using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());
drop policy if exists "Senders can cancel friend requests" on public.friend_requests;
create policy "Senders can cancel friend requests" on public.friend_requests for delete to authenticated using (sender_id = auth.uid() and status = 'pending');

-- Turn on realtime delivery for messages, without failing if already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
exception when undefined_object then
  raise notice 'Realtime publication not present; enable Realtime for public.messages in the Supabase dashboard.';
end $$;
