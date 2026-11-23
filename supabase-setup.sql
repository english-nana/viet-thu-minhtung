-- ============================================================================
-- VSTEP WRITING (TASK 01 & 02) — SUPABASE DATABASE SETUP
-- ============================================================================
-- An toàn khi chạy trên cùng dự án Supabase với Speaking Part 1:
-- - Giữ nguyên toàn bộ bảng teachers, profiles, speaking_attempts hiện có
-- - Bổ sung bảng public.writing_submissions cho bài viết Task 01 & Task 02
-- - Bảo vệ bằng Row Level Security (RLS) & trigger chống học viên tự sửa điểm
--
-- Cách chạy:
-- 1. Mở Supabase Dashboard -> SQL Editor -> New query
-- 2. Dán toàn bộ file này và bấm nút RUN (Ctrl/Cmd + Enter)
-- 3. Vào Authentication -> URL Configuration -> Redirect URLs và thêm:
--    https://english-nana.github.io/viet-thu-minhtung/**
-- ============================================================================

-- 1. ĐẢM BẢO BẢNG GIÁO VIÊN & HÀM is_teacher() TỒN TẠI
create table if not exists public.teachers (
  email text primary key,
  full_name text default '',
  created_at timestamptz not null default now()
);

alter table public.teachers enable row level security;

insert into public.teachers (email, full_name)
values ('mtung0208@gmail.com', 'Giáo viên')
on conflict (email) do nothing;

create or replace function public.is_teacher()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "Teachers can read own record" on public.teachers;
create policy "Teachers can read own record"
  on public.teachers for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- 2. ĐẢM BẢO BẢNG HỒ SƠ HỌC VIÊN (PROFILES) TỒN TẠI
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_url text not null default '',
  auth_provider text not null default 'email',
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles: student read own or teacher read all" on public.profiles;
create policy "Profiles: student read own or teacher read all"
  on public.profiles for select
  using (auth.uid() = id or public.is_teacher());

drop policy if exists "Profiles: student insert own" on public.profiles;
create policy "Profiles: student insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Profiles: student update own or teacher update" on public.profiles;
create policy "Profiles: student update own or teacher update"
  on public.profiles for update
  using (auth.uid() = id or public.is_teacher())
  with check (auth.uid() = id or public.is_teacher());

drop policy if exists "Profiles: teacher delete any" on public.profiles;
create policy "Profiles: teacher delete any"
  on public.profiles for delete
  using (public.is_teacher());

create or replace function public.teacher_delete_student(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_teacher() then
    raise exception 'Permission denied: only teachers can delete accounts';
  end if;
  if target_user_id is null then
    raise exception 'Missing target_user_id';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'Cannot delete your own active teacher account';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

-- 3. BẢNG BÀI VIẾT CỦA HỌC VIÊN (TASK 01 VIẾT THƯ & TASK 02 VIẾT LUẬN)
create table if not exists public.writing_submissions (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_type text not null default 'task2',
  lesson_id text not null,
  lesson_title text not null default '',
  prompt_text text not null default '',
  content text not null default '',
  word_count int not null default 0,
  target_level text not null default 'B1',
  is_submitted boolean not null default true,
  submitted_at timestamptz not null default now(),
  teacher_feedback text not null default '',
  teacher_score text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index if not exists idx_writing_submissions_user on public.writing_submissions (user_id, lesson_id);
create index if not exists idx_writing_submissions_submitted on public.writing_submissions (is_submitted, submitted_at desc);

alter table public.writing_submissions enable row level security;

drop policy if exists "Writing: student read own or teacher read all" on public.writing_submissions;
create policy "Writing: student read own or teacher read all"
  on public.writing_submissions for select
  using (auth.uid() = user_id or public.is_teacher());

drop policy if exists "Writing: student insert own" on public.writing_submissions;
create policy "Writing: student insert own"
  on public.writing_submissions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Writing: student update own or teacher grade" on public.writing_submissions;
create policy "Writing: student update own or teacher grade"
  on public.writing_submissions for update
  using (auth.uid() = user_id or public.is_teacher())
  with check (auth.uid() = user_id or public.is_teacher());

drop policy if exists "Writing: student delete own or teacher delete" on public.writing_submissions;
create policy "Writing: student delete own or teacher delete"
  on public.writing_submissions for delete
  using (auth.uid() = user_id or public.is_teacher());

-- Bảo vệ cột điểm & nhận xét giáo viên: học viên không thể tự sửa điểm/nhận xét
create or replace function public.protect_writing_teacher_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_teacher() then
    new.teacher_feedback := old.teacher_feedback;
    new.teacher_score := old.teacher_score;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_writing_teacher_fields on public.writing_submissions;
create trigger trg_protect_writing_teacher_fields
  before update on public.writing_submissions
  for each row execute procedure public.protect_writing_teacher_fields();

-- 4. CẤP QUYỀN TRUY CẬP SCHEMA & BẢNG CHO TÀI KHOẢN ĐÃ ĐĂNG NHẬP
grant usage on schema public to anon, authenticated;
grant select on table public.teachers to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.writing_submissions to authenticated;
grant execute on function public.is_teacher() to anon, authenticated;
grant execute on function public.teacher_delete_student(uuid) to authenticated;
